import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    HappyUpdateJournal,
    HAPPY_UPDATE_RETENTION_MS,
} from './happyUpdateJournal';
import {
    buildHappyNpmInstallCommand,
    downloadHappyUpdateAsset,
    hashFileSha256,
    sanitizeHappyUpdateError,
    validateHappyPackageManifest,
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
        expect(buildHappyNpmInstallCommand('/tmp/happy-1.2.5.tgz')).toEqual({
            command: 'npm',
            args: ['install', '--global', '/tmp/happy-1.2.5.tgz'],
        });
        expect(sanitizeHappyUpdateError(new Error('token=secret-value /tmp/private'))).toBe('token=[redacted] /tmp/private');
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
});
