import { beforeEach, describe, expect, it, vi } from 'vitest';

const { machineRPC } = vi.hoisted(() => ({ machineRPC: vi.fn() }));
vi.mock('./apiSocket', () => ({ apiSocket: { machineRPC } }));
vi.mock('./sync', () => ({ sync: {} }));
vi.mock('./storage', () => ({ storage: { getState: vi.fn() } }));

describe('Codex device operations', () => {
    beforeEach(() => machineRPC.mockReset());

    it('starts an idempotent device operation over machine RPC', async () => {
        machineRPC.mockResolvedValue({ operationId: 'op-1', kind: 'status', state: 'queued', updatedAt: 1 });
        const { machineCodexOperationStart } = await import('./ops');

        await expect(machineCodexOperationStart('machine-1', { operationId: 'op-1', kind: 'status' })).resolves.toMatchObject({
            operationId: 'op-1',
            state: 'queued',
        });
        expect(machineRPC).toHaveBeenCalledWith('machine-1', 'codex-operation-start', { operationId: 'op-1', kind: 'status' });
    });

    it('reads operation progress and returns transport failures', async () => {
        machineRPC.mockResolvedValueOnce({ operationId: 'op-1', state: 'completed', kind: 'status', updatedAt: 2 });
        const { machineCodexOperationStatus } = await import('./ops');
        await expect(machineCodexOperationStatus('machine-1', 'op-1')).resolves.toMatchObject({ state: 'completed' });

        machineRPC.mockRejectedValueOnce(new Error('machine offline'));
        await expect(machineCodexOperationStatus('machine-1', 'op-1')).rejects.toThrow('machine offline');
    });
});
