import { beforeEach, describe, expect, it, vi } from 'vitest';

const { machineRPC } = vi.hoisted(() => ({ machineRPC: vi.fn() }));
vi.mock('./apiSocket', () => ({ apiSocket: { machineRPC } }));
vi.mock('./sync', () => ({ sync: {} }));
vi.mock('./storage', () => ({ storage: { getState: vi.fn() } }));

const request = {
    operationId: 'update-1',
    targetVersion: '1.2.5',
    assetUrl: 'https://github.com/Gs-ygc/happy/releases/download/cli-1.2.5/happy-1.2.5.tgz',
    sha256: 'a'.repeat(64),
};

describe('Happy update machine operations', () => {
    beforeEach(() => machineRPC.mockReset());

    it('starts an exact update and reads restart-safe status', async () => {
        const snapshot = { operationId: 'update-1', targetVersion: '1.2.5', phase: 'queued', progress: 0, updatedAt: 1 };
        machineRPC.mockResolvedValue(snapshot);
        const { machineHappyUpdateStart, machineHappyUpdateStatus } = await import('./ops');

        await expect(machineHappyUpdateStart('machine-1', request)).resolves.toEqual(snapshot);
        expect(machineRPC).toHaveBeenNthCalledWith(1, 'machine-1', 'happy-update-start', request);
        await expect(machineHappyUpdateStatus('machine-1', 'update-1')).resolves.toEqual(snapshot);
        expect(machineRPC).toHaveBeenNthCalledWith(2, 'machine-1', 'happy-update-status', { operationId: 'update-1' });
    });
});
