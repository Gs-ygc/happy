import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    HappyUpdateJournal,
    HAPPY_UPDATE_RETENTION_MS,
} from './happyUpdateJournal';
import {
    buildHappyNpmInstallCommand,
    detectHappyNpmInstallation,
    downloadHappyUpdateAsset,
    decodeHappyUpdateWorkerPayload,
    hashFileSha256,
    sanitizeHappyUpdateError,
    validateHappyPackageManifest,
    runHappyUpdateWorker,
    spawnHappyUpdateWorker,
} from './happyUpdateUpdater';

const snapshots = [
    { operationId: 'op-1', targetVersion: '1.2.5', phase: 'queued' as const, progress: 0, updatedAt: 100 },
    { operationId: 'op-2', targetVersion: '1.2.5', phase: 'completed' as const, progress: 100, updatedAt: 200 },
];

const tempDirs: string[] = [];
afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('HappyUpdateJournal', () => {
    it('writes snapshots atomically and reloads them', async () => {
        const rootDir = await mkdtemp(join(tmpdir(), 'happy-update-journal-'));
        tempDirs.push(rootDir);
        const journal = new HappyUpdateJournal({ rootDir, now: () => 200 });

        await journal.write(snapshots[0]);

        expect(await journal.read('op-1')).toEqual(snapshots[0]);
        expect(await readFile(join(rootDir, 'op-1.json'), 'utf8')).toContain('"phase": "queued"');
    });

    it('rejects unsafe operation ids before resolving journal paths', async () => {
        const rootDir = await mkdtemp(join(tmpdir(), 'happy-update-journal-'));
        tempDirs.push(rootDir);
        const journal = new HappyUpdateJournal({ rootDir });

        await expect(journal.read('../escape')).rejects.toThrow(/operationId/);
        await expect(journal.readRequest('nested/update')).rejects.toThrow(/operationId/);
    });

    it('prunes entries older than seven days and keeps at most 100 recent entries', async () => {
        const now = 10 * HAPPY_UPDATE_RETENTION_MS;
        const rootDir = await mkdtemp(join(tmpdir(), 'happy-update-prune-'));
        tempDirs.push(rootDir);
        const journal = new HappyUpdateJournal({ rootDir, now: () => now });

        for (let i = 0; i < 101; i++) {
            await journal.write({
                operationId: `op-${i}`,
                targetVersion: '1.2.5',
                phase: 'completed',
                progress: 100,
                updatedAt: now - i,
            });
        }
        await journal.write({ ...snapshots[0], operationId: 'old', updatedAt: now - HAPPY_UPDATE_RETENTION_MS - 1 });
        await journal.prune();

        const recent = await journal.listRecent();
        expect(recent).toHaveLength(100);
        expect(recent.some((snapshot) => snapshot.operationId === 'old')).toBe(false);
    });

    it('allows only one active update lock', async () => {
        const rootDir = await mkdtemp(join(tmpdir(), 'happy-update-lock-'));
        tempDirs.push(rootDir);
        const journal = new HappyUpdateJournal({ rootDir });
        const release = await journal.acquireLock();

        await expect(journal.acquireLock()).rejects.toThrow(/already in progress/);
        await release();
        await expect(journal.acquireLock()).resolves.toBeTypeOf('function');
    });
});

describe('Happy update runtime validation', () => {
    it('validates the exact package manifest before install', () => {
        expect(() => validateHappyPackageManifest({ name: 'happy', version: '1.2.5' }, '1.2.5')).not.toThrow();
        expect(() => validateHappyPackageManifest({ name: 'other', version: '1.2.5' }, '1.2.5')).toThrow(/package name/);
        expect(() => validateHappyPackageManifest({ name: 'happy', version: '1.2.4' }, '1.2.5')).toThrow(/version/);
    });

    it('builds a fixed npm install command and sanitizes secrets from errors', () => {
        expect(buildHappyNpmInstallCommand('/opt/npm/bin/npm', '/tmp/happy-1.2.5.tgz')).toEqual({
            command: '/opt/npm/bin/npm',
            args: ['install', '--global', '/tmp/happy-1.2.5.tgz'],
        });
        expect(sanitizeHappyUpdateError(new Error('token=secret-value HOME=/home/alice https://private.test/x /tmp/private')))
            .toBe('token=[redacted] HOME=[redacted] [url] [path]');
    });

    it('accepts only the Happy package managed by the resolved global npm installation', async () => {
        const installation = await detectHappyNpmInstallation('/opt/npm/lib/node_modules/happy', {
            resolveNpmExecutable: async () => '/opt/npm/bin/npm',
            readGlobalRoot: async () => '/opt/npm/lib/node_modules',
            realpath: async (value) => value,
        });

        expect(installation).toEqual({
            npmExecutable: '/opt/npm/bin/npm',
            packageRoot: '/opt/npm/lib/node_modules/happy',
        });
        await expect(detectHappyNpmInstallation('/home/alice/happy', {
            resolveNpmExecutable: async () => '/opt/npm/bin/npm',
            readGlobalRoot: async () => '/opt/npm/lib/node_modules',
            realpath: async (value) => value,
        })).rejects.toThrow('not managed by the active npm installation');
    });

    it('strictly decodes the detached worker payload', () => {
        const encoded = Buffer.from(JSON.stringify({
            request: validWorkerRequest,
            daemonPid: 10,
            daemonPort: 20,
        })).toString('base64url');
        expect(decodeHappyUpdateWorkerPayload(encoded)).toMatchObject({ daemonPid: 10, daemonPort: 20 });
        expect(() => decodeHappyUpdateWorkerPayload(Buffer.from('{}').toString('base64url'))).toThrow();
    });

    it('rejects when the detached worker fails to spawn asynchronously', async () => {
        const child = new EventEmitter();
        Object.assign(child, { unref: vi.fn() });
        const spawnImpl = vi.fn(() => child as any);
        const spawned = spawnHappyUpdateWorker({ request: validWorkerRequest, daemonPid: 10, daemonPort: 20 }, '/tmp/happy.mjs', spawnImpl as any);

        child.emit('error', new Error('spawn denied'));

        await expect(spawned).rejects.toThrow('Happy update worker could not start');
    });

    it('downloads within the size limit and verifies the file digest', async () => {
        const rootDir = await mkdtemp(join(tmpdir(), 'happy-update-download-'));
        tempDirs.push(rootDir);
        const destination = join(rootDir, 'happy.tgz');
        const body = new TextEncoder().encode('happy-package');
        const response = new Response(body, { status: 200, headers: { 'content-length': String(body.byteLength) } });
        await downloadHappyUpdateAsset('https://github.com/Gs-ygc/happy/releases/download/cli-1.2.5/happy-1.2.5.tgz', destination, async () => response);

        expect(await hashFileSha256(destination)).toBe('b7f76c6b0c1d0213004e3cf5b2e25f8d2dbc70279d5a02776e6a146b23dfc8ab');
    });

    it('records a completed update only after the target daemon version is running', async () => {
        const rootDir = await mkdtemp(join(tmpdir(), 'happy-update-worker-success-'));
        tempDirs.push(rootDir);
        const journal = new HappyUpdateJournal({ rootDir, now: () => 500 });
        const installTarball = vi.fn().mockResolvedValue(undefined);
        const startDaemon = vi.fn().mockResolvedValue(undefined);

        await runHappyUpdateWorker({ request: { ...validWorkerRequest }, daemonPid: 10, daemonPort: 20 }, {
            journal,
            workDir: join(rootDir, 'work'),
            currentVersion: '1.2.4',
            download: vi.fn().mockResolvedValue(undefined),
            hash: vi.fn().mockResolvedValue(validWorkerRequest.sha256),
            readManifest: vi.fn().mockResolvedValue({ name: 'happy', version: '1.2.5' }),
            backupCurrent: vi.fn().mockResolvedValue('/tmp/happy-1.2.4.tgz'),
            installTarball,
            stopDaemon: vi.fn().mockResolvedValue(undefined),
            startDaemon,
            waitForDaemonVersion: vi.fn().mockResolvedValue('1.2.5'),
            now: () => 500,
        });

        expect(await journal.read(validWorkerRequest.operationId)).toMatchObject({
            phase: 'completed',
            progress: 100,
            installedVersion: '1.2.5',
        });
        expect(installTarball).toHaveBeenCalledWith(expect.stringContaining('happy-1.2.5.tgz'));
        expect(startDaemon).toHaveBeenCalledOnce();
    });

    it('restores the backup and records recovered when installation fails', async () => {
        const rootDir = await mkdtemp(join(tmpdir(), 'happy-update-worker-recover-'));
        tempDirs.push(rootDir);
        const journal = new HappyUpdateJournal({ rootDir, now: () => 600 });
        const installTarball = vi.fn()
            .mockRejectedValueOnce(new Error('install failed token=secret'))
            .mockResolvedValueOnce(undefined);

        await runHappyUpdateWorker({ request: { ...validWorkerRequest }, daemonPid: 10, daemonPort: 20 }, {
            journal,
            workDir: join(rootDir, 'work'),
            currentVersion: '1.2.4',
            download: vi.fn().mockResolvedValue(undefined),
            hash: vi.fn().mockResolvedValue(validWorkerRequest.sha256),
            readManifest: vi.fn().mockResolvedValue({ name: 'happy', version: '1.2.5' }),
            backupCurrent: vi.fn().mockResolvedValue('/tmp/happy-1.2.4.tgz'),
            installTarball,
            stopDaemon: vi.fn().mockResolvedValue(undefined),
            startDaemon: vi.fn().mockResolvedValue(undefined),
            waitForDaemonVersion: vi.fn().mockResolvedValue('1.2.4'),
            now: () => 600,
        });

        expect(installTarball).toHaveBeenNthCalledWith(2, '/tmp/happy-1.2.4.tgz');
        expect(await journal.read(validWorkerRequest.operationId)).toMatchObject({
            phase: 'recovered',
            installedVersion: '1.2.4',
        });
    });

    it('records a terminal failure when the update lock cannot be acquired', async () => {
        const journal = {
            acquireLock: vi.fn().mockRejectedValue(new Error('A Happy update is already in progress')),
            write: vi.fn().mockResolvedValue(undefined),
        } as any;

        await runHappyUpdateWorker({ request: { ...validWorkerRequest }, daemonPid: 10, daemonPort: 20 }, {
            journal,
            workDir: '/tmp/happy-update-lock-failure',
            currentVersion: '1.2.4',
            download: vi.fn(),
            hash: vi.fn(),
            readManifest: vi.fn(),
            backupCurrent: vi.fn(),
            installTarball: vi.fn(),
            stopDaemon: vi.fn(),
            startDaemon: vi.fn(),
            waitForDaemonVersion: vi.fn(),
            now: () => 700,
        });

        expect(journal.write).toHaveBeenCalledWith(expect.objectContaining({
            operationId: validWorkerRequest.operationId,
            phase: 'failed',
            error: expect.stringContaining('already in progress'),
        }));
    });
});

const validWorkerRequest = {
    operationId: 'worker-1',
    targetVersion: '1.2.5',
    assetUrl: 'https://github.com/Gs-ygc/happy/releases/download/cli-1.2.5/happy-1.2.5.tgz',
    sha256: 'a'.repeat(64),
};
