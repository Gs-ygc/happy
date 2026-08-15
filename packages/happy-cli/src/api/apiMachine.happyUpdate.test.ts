import { describe, expect, it, vi } from 'vitest';

function machineClient() {
    return {
        id: 'machine-update',
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy',
    } as any;
}

const request = {
    operationId: 'update-1',
    targetVersion: '1.2.5',
    assetUrl: 'https://github.com/Gs-ygc/happy/releases/download/cli-1.2.5/happy-1.2.5.tgz',
    sha256: 'a'.repeat(64),
};
const snapshot = { ...request, assetUrl: undefined, sha256: undefined, phase: 'queued', progress: 0, updatedAt: 123 };

describe('ApiMachineClient Happy update RPCs', () => {
    it('registers start and restart-safe status handlers', async () => {
        const { ApiMachineClient } = await import('./apiMachine');
        const client = new ApiMachineClient('token', machineClient());
        const start = vi.fn().mockResolvedValue(snapshot);
        const get = vi.fn().mockResolvedValue(snapshot);
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
            happyUpdates: { start, get },
        });

        const handlers = (client as any).rpcHandlerManager.handlers as Map<string, (params: any) => Promise<any>>;
        await expect(handlers.get('machine-update:happy-update-start')?.(request)).resolves.toEqual(snapshot);
        await expect(handlers.get('machine-update:happy-update-status')?.({ operationId: 'update-1' })).resolves.toEqual(snapshot);
        expect(start).toHaveBeenCalledWith(request);
        expect(get).toHaveBeenCalledWith('update-1');
    });
});
