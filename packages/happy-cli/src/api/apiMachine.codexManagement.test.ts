import { describe, expect, it, vi } from 'vitest';
import type { CodexStatus } from '@slopus/happy-wire';

function machineClient() {
    return {
        id: 'machine-management',
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy',
    } as any;
}

const status: CodexStatus = {
    installed: true,
    version: 'codex-cli 0.146.0',
    executablePath: '/usr/local/bin/codex',
    installKind: 'npm',
    updateSupported: true,
    checkedAt: 1,
};

describe('ApiMachineClient Codex management RPCs', () => {
    it('registers idempotent operation start and status handlers', async () => {
        const { ApiMachineClient } = await import('./apiMachine');
        const client = new ApiMachineClient('token', machineClient());
        const readStatus = vi.fn().mockResolvedValue(status);
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
            codexOperations: {
                readStatus,
                restart: vi.fn().mockResolvedValue(status),
                update: vi.fn().mockResolvedValue(status),
            },
        });

        const handlers = (client as any).rpcHandlerManager.handlers as Map<string, (params: any) => Promise<any>>;
        const started = await handlers.get('machine-management:codex-operation-start')?.({
            operationId: 'op-status',
            kind: 'status',
        });
        expect(started).toMatchObject({ operationId: 'op-status', kind: 'status', state: 'queued' });

        await new Promise((resolve) => setTimeout(resolve, 0));
        const snapshot = await handlers.get('machine-management:codex-operation-status')?.({ operationId: 'op-status' });
        expect(snapshot).toMatchObject({ state: 'completed', result: status });
        expect(readStatus).toHaveBeenCalledOnce();
    });
});
