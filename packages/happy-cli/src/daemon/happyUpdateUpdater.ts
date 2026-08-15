import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { HappyUpdateRequestSchema, type HappyUpdateRequest } from '@slopus/happy-wire';

export const MAX_HAPPY_UPDATE_BYTES = 250 * 1024 * 1024;

export function validateHappyPackageManifest(manifest: unknown, targetVersion: string): void {
    const value = manifest as { name?: unknown; version?: unknown } | null;
    if (value?.name !== 'happy') throw new Error('Happy update package name is invalid');
    if (value.version !== targetVersion) throw new Error('Happy update package version does not match target');
}

export function buildHappyNpmInstallCommand(tarballPath: string): { command: string; args: string[] } {
    return { command: 'npm', args: ['install', '--global', tarballPath] };
}

export function sanitizeHappyUpdateError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw
        .replace(/((?:token|password|secret|api[_-]?key|authorization)\s*[=:]\s*)[^\s]+/gi, '$1[redacted]')
        .replace(/\r?\n/g, ' ')
        .slice(0, 500) || 'Happy update failed';
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
    const response = await fetchImpl(request.assetUrl, { redirect: 'manual' });
    if (!response.ok) throw new Error(`Happy update download failed with HTTP ${response.status}`);
    if (response.status >= 300 && response.status < 400) throw new Error('Happy update redirects are not allowed');
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_HAPPY_UPDATE_BYTES) throw new Error('Happy update package is too large');
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > MAX_HAPPY_UPDATE_BYTES) throw new Error('Happy update package is too large');
    await writeFile(destination, body, { mode: 0o600 });
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

export function spawnHappyUpdateWorker(
    payload: HappyUpdateWorkerPayload,
    entrypoint = process.argv[1],
    spawnImpl: typeof spawn = spawn,
): ChildProcess {
    if (!entrypoint) throw new Error('Happy update worker entrypoint is unavailable');
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const child = spawnImpl(process.execPath, [entrypoint, 'daemon', 'happy-update-worker', encodedPayload], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
    });
    child.unref();
    return child;
}
