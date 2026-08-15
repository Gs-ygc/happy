import { createHash } from 'node:crypto';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { extract } from 'tar';
import {
    HappyUpdateRequestSchema,
    type HappyUpdateOperationSnapshot,
    type HappyUpdatePhase,
    type HappyUpdateRequest,
} from '@slopus/happy-wire';
import type { HappyUpdateJournal } from './happyUpdateJournal';
import { HappyUpdateJournal as FileHappyUpdateJournal } from './happyUpdateJournal';
import { configuration } from '@/configuration';
import { projectPath } from '@/projectPath';
import { readDaemonState } from '@/persistence';

export const MAX_HAPPY_UPDATE_BYTES = 250 * 1024 * 1024;
const execFileAsync = promisify(execFile);
const MAX_REDIRECTS = 3;

export function validateHappyPackageManifest(manifest: unknown, targetVersion: string): void {
    const value = manifest as { name?: unknown; version?: unknown } | null;
    if (value?.name !== 'happy') throw new Error('Happy update package name is invalid');
    if (value.version !== targetVersion) throw new Error('Happy update package version does not match target');
}

export function buildHappyNpmInstallCommand(npmExecutable: string, tarballPath: string): { command: string; args: string[] } {
    return { command: npmExecutable, args: ['install', '--global', tarballPath] };
}

export function sanitizeHappyUpdateError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw
        .replace(/((?:token|password|secret|api[_-]?key|authorization)\s*[=:]\s*)[^\s]+/gi, '$1[redacted]')
        .replace(/\b[A-Z_][A-Z0-9_]*=[^\s]+/g, (value) => `${value.slice(0, value.indexOf('=') + 1)}[redacted]`)
        .replace(/https?:\/\/[^\s;]+/gi, '[url]')
        .replace(/(?:[A-Za-z]:\\|\/)[^\s;]+/g, '[path]')
        .replace(/\r?\n/g, ' ')
        .slice(0, 500) || 'Happy update failed';
}

export type HappyNpmInstallation = {
    npmExecutable: string;
    packageRoot: string;
};

export type HappyNpmDetectionDependencies = {
    resolveNpmExecutable: () => Promise<string>;
    readGlobalRoot: (npmExecutable: string) => Promise<string>;
    realpath: (path: string) => Promise<string>;
};

async function defaultResolveNpmExecutable(): Promise<string> {
    try {
        const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
        const result = await execFileAsync(lookup, ['npm'], { windowsHide: true, maxBuffer: 64 * 1024 });
        const executable = result.stdout.trim().split(/\r?\n/)[0];
        if (!executable || !isAbsolute(executable)) throw new Error('invalid npm executable');
        return executable;
    } catch {
        throw new Error('Happy CLI is not managed by a supported npm installation');
    }
}

async function defaultReadGlobalRoot(npmExecutable: string): Promise<string> {
    try {
        const result = await execFileAsync(npmExecutable, ['root', '--global'], {
            windowsHide: true,
            maxBuffer: 64 * 1024,
        });
        return result.stdout.trim();
    } catch {
        throw new Error('Happy CLI is not managed by a supported npm installation');
    }
}

export async function detectHappyNpmInstallation(
    packageRoot: string,
    dependencies: HappyNpmDetectionDependencies = {
        resolveNpmExecutable: defaultResolveNpmExecutable,
        readGlobalRoot: defaultReadGlobalRoot,
        realpath,
    },
): Promise<HappyNpmInstallation> {
    const npmExecutable = await dependencies.resolveNpmExecutable();
    const globalRoot = await dependencies.readGlobalRoot(npmExecutable);
    const [actualPackageRoot, expectedPackageRoot] = await Promise.all([
        dependencies.realpath(packageRoot),
        dependencies.realpath(join(globalRoot, 'happy')).catch(() => ''),
    ]);
    if (!expectedPackageRoot || actualPackageRoot !== expectedPackageRoot) {
        throw new Error('Happy CLI is not managed by the active npm installation');
    }
    return { npmExecutable, packageRoot: actualPackageRoot };
}

export async function downloadHappyUpdateAsset(
    assetUrl: string,
    destination: string,
    fetchImpl: typeof fetch = fetch,
): Promise<void> {
    const request = HappyUpdateRequestSchema.parse({
        operationId: 'download-validation',
        targetVersion: assetUrl.match(/cli-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)?.[1] ?? '',
        assetUrl,
        sha256: 'a'.repeat(64),
    });
    let currentUrl = request.assetUrl;
    let response: Response | null = null;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
        response = await fetchImpl(currentUrl, { redirect: 'manual' });
        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.get('location');
        if (!location || redirect === MAX_REDIRECTS) throw new Error('Happy update download exceeded redirect limit');
        const next = new URL(location, currentUrl);
        const allowedHost = next.hostname === 'release-assets.githubusercontent.com'
            || next.hostname.endsWith('.githubusercontent.com');
        if (next.protocol !== 'https:' || !allowedHost) throw new Error('Happy update redirect host is not allowed');
        currentUrl = next.toString();
    }
    if (!response?.ok) throw new Error(`Happy update download failed with HTTP ${response?.status ?? 'unknown'}`);
    if (!response.body) throw new Error('Happy update download returned an empty body');
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_HAPPY_UPDATE_BYTES) throw new Error('Happy update package is too large');
    let received = 0;
    const limiter = new Transform({
        transform(chunk, _encoding, callback) {
            received += chunk.length;
            callback(received > MAX_HAPPY_UPDATE_BYTES ? new Error('Happy update package is too large') : null, chunk);
        },
    });
    try {
        await pipeline(Readable.fromWeb(response.body as any), limiter, createWriteStream(destination, { mode: 0o600 }));
    } catch (error) {
        await rm(destination, { force: true }).catch(() => undefined);
        throw error;
    }
}

export async function hashFileSha256(path: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex');
}

export function validateHappyUpdateRequest(request: HappyUpdateRequest): HappyUpdateRequest {
    return HappyUpdateRequestSchema.parse(request);
}

export type HappyUpdateWorkerPayload = {
    request: HappyUpdateRequest;
    daemonPid: number;
    daemonPort: number;
};

export function decodeHappyUpdateWorkerPayload(encoded: string): HappyUpdateWorkerPayload {
    const raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
    const keys = Object.keys(raw).sort();
    if (keys.join(',') !== 'daemonPid,daemonPort,request') throw new Error('Invalid Happy update worker payload');
    if (!Number.isInteger(raw.daemonPid) || Number(raw.daemonPid) <= 0) throw new Error('Invalid daemon PID');
    if (!Number.isInteger(raw.daemonPort) || Number(raw.daemonPort) <= 0 || Number(raw.daemonPort) > 65535) throw new Error('Invalid daemon port');
    return {
        request: HappyUpdateRequestSchema.parse(raw.request),
        daemonPid: Number(raw.daemonPid),
        daemonPort: Number(raw.daemonPort),
    };
}

export type HappyUpdateWorkerDependencies = {
    journal: HappyUpdateJournal;
    workDir: string;
    currentVersion: string;
    download: (assetUrl: string, destination: string) => Promise<void>;
    hash: (path: string) => Promise<string>;
    readManifest: (tarballPath: string) => Promise<unknown>;
    backupCurrent: (workDir: string) => Promise<string>;
    installTarball: (tarballPath: string) => Promise<void>;
    stopDaemon: (payload: Pick<HappyUpdateWorkerPayload, 'daemonPid' | 'daemonPort'>) => Promise<void>;
    startDaemon: () => Promise<void>;
    waitForDaemonVersion: (version: string) => Promise<string>;
    now?: () => number;
};

const PHASE_PROGRESS: Record<HappyUpdatePhase, number> = {
    queued: 0,
    downloading: 15,
    verifying: 35,
    installing: 55,
    'stopping-daemon': 70,
    'starting-daemon': 85,
    completed: 100,
    failed: 100,
    recovered: 100,
};

export async function runHappyUpdateWorker(
    input: HappyUpdateWorkerPayload,
    dependencies: HappyUpdateWorkerDependencies,
): Promise<HappyUpdateOperationSnapshot> {
    const request = HappyUpdateRequestSchema.parse(input.request);
    const now = dependencies.now ?? Date.now;
    const tarballPath = join(dependencies.workDir, `happy-${request.targetVersion}.tgz`);
    let backupPath: string | null = null;
    let installAttempted = false;
    let releaseLock: (() => Promise<void>) | null = null;

    const record = async (
        phase: HappyUpdatePhase,
        patch: Partial<HappyUpdateOperationSnapshot> = {},
    ): Promise<HappyUpdateOperationSnapshot> => {
        const snapshot: HappyUpdateOperationSnapshot = {
            operationId: request.operationId,
            targetVersion: request.targetVersion,
            phase,
            progress: PHASE_PROGRESS[phase],
            updatedAt: now(),
            ...patch,
        };
        await dependencies.journal.write(snapshot);
        if (phase === 'completed' || phase === 'recovered') {
            await rm(dependencies.workDir, { recursive: true, force: true });
        }
        return snapshot;
    };

    try {
        releaseLock = await dependencies.journal.acquireLock();
        await mkdir(dependencies.workDir, { recursive: true });
        backupPath = await dependencies.backupCurrent(dependencies.workDir);
        await record('downloading', { message: 'Downloading Happy CLI' });
        await dependencies.download(request.assetUrl, tarballPath);

        await record('verifying', { message: 'Verifying Happy CLI package' });
        const digest = await dependencies.hash(tarballPath);
        if (digest !== request.sha256) throw new Error('Happy update SHA-256 verification failed');
        validateHappyPackageManifest(await dependencies.readManifest(tarballPath), request.targetVersion);

        await record('installing', { message: 'Installing Happy CLI' });
        installAttempted = true;
        await dependencies.installTarball(tarballPath);

        await record('stopping-daemon', { message: 'Stopping old Happy daemon' });
        await dependencies.stopDaemon(input);
        await record('starting-daemon', { message: 'Starting updated Happy daemon' });
        await dependencies.startDaemon();
        const installedVersion = await dependencies.waitForDaemonVersion(request.targetVersion);
        return await record('completed', {
            message: 'Happy CLI update completed',
            installedVersion,
        });
    } catch (error) {
        const sanitized = sanitizeHappyUpdateError(error);
        if (installAttempted && backupPath) {
            try {
                await dependencies.installTarball(backupPath);
                await dependencies.stopDaemon(input).catch(() => undefined);
                await dependencies.startDaemon();
                const installedVersion = await dependencies.waitForDaemonVersion(dependencies.currentVersion);
                return await record('recovered', {
                    message: 'Happy update failed; previous version restored',
                    error: sanitized,
                    installedVersion,
                });
            } catch (recoveryError) {
                return await record('failed', {
                    message: 'Happy update and recovery failed; manual repair required',
                    error: `${sanitized}; recovery: ${sanitizeHappyUpdateError(recoveryError)}`.slice(0, 500),
                });
            }
        }
        return await record('failed', { message: 'Happy update failed before installation', error: sanitized });
    } finally {
        await releaseLock?.();
    }
}

export async function spawnHappyUpdateWorker(
    payload: HappyUpdateWorkerPayload,
    entrypoint = process.argv[1],
    spawnImpl: typeof spawn = spawn,
): Promise<ChildProcess> {
    if (!entrypoint) throw new Error('Happy update worker entrypoint is unavailable');
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const child = spawnImpl(process.execPath, [entrypoint, 'daemon', 'happy-update-worker', encodedPayload], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
    });
    await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', () => reject(new Error('Happy update worker could not start')));
    });
    child.unref();
    return child;
}

async function readHappyPackageManifestFromTarball(tarballPath: string, workDir: string): Promise<unknown> {
    const manifestRoot = join(workDir, 'manifest');
    await rm(manifestRoot, { recursive: true, force: true });
    await mkdir(manifestRoot, { recursive: true });
    await extract({
        file: tarballPath,
        cwd: manifestRoot,
        strict: true,
        filter: (path) => path === 'package/package.json',
    });
    return JSON.parse(await readFile(join(manifestRoot, 'package', 'package.json'), 'utf8'));
}

async function runNpm(npmExecutable: string, args: string[], publicError: string, timeout = 15 * 60 * 1000): Promise<string> {
    try {
        const result = await execFileAsync(npmExecutable, args, {
            timeout,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
        });
        return result.stdout;
    } catch (error: any) {
        throw new Error(publicError);
    }
}

async function backupCurrentHappy(workDir: string, installation: HappyNpmInstallation): Promise<string> {
    const output = await runNpm(
        installation.npmExecutable,
        ['pack', installation.packageRoot, '--pack-destination', workDir, '--ignore-scripts', '--json'],
        'Could not back up the current Happy CLI installation',
    );
    const parsed = JSON.parse(output) as Array<{ filename?: string }>;
    const filename = parsed[0]?.filename;
    if (!filename) {
        const fallback = (await readdir(workDir)).find((name) => /^happy-.*\.tgz$/.test(name));
        if (!fallback) throw new Error('Could not create a backup of the current Happy CLI');
        return join(workDir, fallback);
    }
    return isAbsolute(filename) ? filename : join(workDir, filename);
}

async function stopRunningDaemon(payload: Pick<HappyUpdateWorkerPayload, 'daemonPid' | 'daemonPort'>): Promise<void> {
    await fetch(`http://127.0.0.1:${payload.daemonPort}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        try {
            process.kill(payload.daemonPid, 0);
        } catch {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Old Happy daemon did not stop');
}

async function startInstalledDaemon(entrypoint: string): Promise<void> {
    await execFileAsync(process.execPath, [entrypoint, 'daemon', 'start'], {
        timeout: 30_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
    });
}

async function waitForInstalledDaemonVersion(targetVersion: string): Promise<string> {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
        const state = await readDaemonState();
        if (state?.startedWithCliVersion === targetVersion) return targetVersion;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Happy daemon did not start with version ${targetVersion}`);
}

export async function runEncodedHappyUpdateWorker(encoded: string): Promise<HappyUpdateOperationSnapshot> {
    const payload = decodeHappyUpdateWorkerPayload(encoded);
    const journal = new FileHappyUpdateJournal({ rootDir: configuration.happyUpdatesDir });
    const workDir = join(configuration.happyUpdatesDir, `work-${payload.request.operationId}`);
    const entrypoint = process.argv[1];
    if (!entrypoint) throw new Error('Happy CLI entrypoint is unavailable');
    let installationPromise: Promise<HappyNpmInstallation> | null = null;
    const getInstallation = () => installationPromise ??= detectHappyNpmInstallation(projectPath());
    return runHappyUpdateWorker(payload, {
        journal,
        workDir,
        currentVersion: configuration.currentCliVersion,
        download: (assetUrl, destination) => downloadHappyUpdateAsset(assetUrl, destination),
        hash: hashFileSha256,
        readManifest: (tarballPath) => readHappyPackageManifestFromTarball(tarballPath, workDir),
        backupCurrent: async (targetWorkDir) => backupCurrentHappy(targetWorkDir, await getInstallation()),
        installTarball: async (tarballPath) => {
            const installation = await getInstallation();
            const command = buildHappyNpmInstallCommand(installation.npmExecutable, tarballPath);
            await runNpm(command.command, command.args, 'Happy CLI installation failed');
        },
        stopDaemon: stopRunningDaemon,
        startDaemon: () => startInstalledDaemon(entrypoint),
        waitForDaemonVersion: waitForInstalledDaemonVersion,
    });
}
