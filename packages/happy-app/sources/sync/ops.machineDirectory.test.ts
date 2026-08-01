import { beforeEach, describe, expect, it, vi } from 'vitest';

const { machineRPC } = vi.hoisted(() => ({
    machineRPC: vi.fn(),
}));

vi.mock('./apiSocket', () => ({ apiSocket: { machineRPC } }));
vi.mock('./sync', () => ({ sync: {} }));
vi.mock('./storage', () => ({ storage: { getState: vi.fn() } }));

describe('machine directory listing op', () => {
    beforeEach(() => {
        machineRPC.mockReset();
    });

    it('lists a directory through the machine-scoped RPC', async () => {
        const response = {
            success: true,
            entries: [
                { name: 'happy', type: 'directory' as const },
                { name: 'notes.txt', type: 'file' as const },
            ],
        };
        machineRPC.mockResolvedValue(response);
        const { machineListDirectory } = await import('./ops');

        await expect(machineListDirectory('machine-1', '/home/user')).resolves.toEqual(response);
        expect(machineRPC).toHaveBeenCalledWith(
            'machine-1',
            'listDirectory',
            { path: '/home/user' },
        );
    });

    it('returns a failed result when the machine does not support listing', async () => {
        machineRPC.mockRejectedValue(new Error('RPC method not found'));
        const { machineListDirectory } = await import('./ops');

        await expect(machineListDirectory('machine-1', '/home/user')).resolves.toEqual({
            success: false,
            error: 'RPC method not found',
        });
    });
});
