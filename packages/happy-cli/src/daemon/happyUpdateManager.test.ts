import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HappyUpdateJournal } from './happyUpdateJournal';
import { HappyUpdateManager } from './happyUpdateManager';

const request = {
    operationId: 'update-1',
    targetVersion: '1.2.5',
    assetUrl: 'https://github.com/Gs-ygc/happy/releases/download/cli-1.2.5/happy-1.2.5.tgz',
    sha256: 'a'.repeat(64),
};

const tempDirs: string[] = [];
afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('HappyUpdateManager', () => {
    it('persists a queued operation and launches the worker once for duplicate starts', async () => {
        const rootDir = await mkdtemp(join(tmpdir(), 'happy-update-manager-'));
        tempDirs.push(rootDir);
        const journal = new HappyUpdateJournal({ rootDir });
        const launchWorker = vi.fn();
        const manager = new HappyUpdateManager({ journal, launchWorker, now: () => 123 });

        const first = await manager.start(request);
        const duplicate = await manager.start(request);

        expect(first).toMatchObject({ operationId: 'update-1', phase: 'queued', progress: 0 });
        expect(duplicate).toEqual(first);
        expect(launchWorker).toHaveBeenCalledOnce();
        expect(await journal.read('update-1')).toEqual(first);
    });

    it('rejects conflicting reuse of an operation ID', async () => {
        const rootDir = await mkdtemp(join(tmpdir(), 'happy-update-conflict-'));
        tempDirs.push(rootDir);
        const manager = new HappyUpdateManager({
            journal: new HappyUpdateJournal({ rootDir }),
            launchWorker: vi.fn(),
        });
        await manager.start(request);

        await expect(manager.start({ ...request, sha256: 'b'.repeat(64) })).rejects.toThrow(/different request/);
    });

    it('loads operation status from the journal after daemon reconstruction', async () => {
        const rootDir = await mkdtemp(join(tmpdir(), 'happy-update-reload-'));
        tempDirs.push(rootDir);
        const journal = new HappyUpdateJournal({ rootDir });
        const firstManager = new HappyUpdateManager({ journal, launchWorker: vi.fn(), now: () => 321 });
        const started = await firstManager.start(request);
        const reconstructed = new HappyUpdateManager({ journal, launchWorker: vi.fn() });

        await expect(reconstructed.get(started.operationId)).resolves.toEqual(started);
    });
});
