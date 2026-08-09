import { describe, expect, it, vi } from 'vitest';
import type { CodexStatus } from '@slopus/happy-wire';
import { CodexDeviceOperationManager } from './codexDeviceOperations';

const status: CodexStatus = {
    installed: true,
    version: 'codex-cli 0.146.0',
    executablePath: '/usr/local/bin/codex',
    installKind: 'npm',
    updateSupported: true,
    checkedAt: 1,
};

async function waitForCompleted(manager: CodexDeviceOperationManager, operationId: string) {
    for (let i = 0; i < 20; i++) {
        const snapshot = manager.get(operationId);
        if (snapshot?.state === 'completed' || snapshot?.state === 'failed') return snapshot;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error('operation did not complete');
}

describe('CodexDeviceOperationManager', () => {
    it('runs an operation and exposes explicit progress/result state', async () => {
        const manager = new CodexDeviceOperationManager({
            readStatus: vi.fn().mockResolvedValue(status),
            restart: vi.fn().mockResolvedValue(status),
            update: vi.fn().mockResolvedValue(status),
        });

        const started = await manager.start({ operationId: 'op-status', kind: 'status' });
        expect(started).toMatchObject({ operationId: 'op-status', kind: 'status', state: 'queued' });

        const completed = await waitForCompleted(manager, 'op-status');
        expect(completed).toMatchObject({ state: 'completed', progress: 100, result: status });
    });

    it('is idempotent for a repeated operation ID', async () => {
        const readStatus = vi.fn().mockResolvedValue(status);
        const manager = new CodexDeviceOperationManager({ readStatus, restart: vi.fn(), update: vi.fn() });

        await manager.start({ operationId: 'op-repeat', kind: 'status' });
        await manager.start({ operationId: 'op-repeat', kind: 'status' });
        await waitForCompleted(manager, 'op-repeat');

        expect(readStatus).toHaveBeenCalledTimes(1);
    });

    it('retains a bounded error without exposing a command payload', async () => {
        const manager = new CodexDeviceOperationManager({
            readStatus: vi.fn().mockRejectedValue(new Error('token=secret-value Authorization: Bearer bearer-value https://user:url-secret@registry.example')),
            restart: vi.fn(),
            update: vi.fn(),
        });

        await manager.start({ operationId: 'op-error', kind: 'status' });
        const failed = await waitForCompleted(manager, 'op-error');
        expect(failed?.state).toBe('failed');
        expect(failed?.error).not.toContain('secret-value');
        expect(failed?.error).not.toContain('bearer-value');
        expect(failed?.error).not.toContain('url-secret');
    });

    it('prunes old completed operations while preserving recent idempotency', async () => {
        const readStatus = vi.fn().mockResolvedValue(status);
        const manager = new CodexDeviceOperationManager({ readStatus, restart: vi.fn(), update: vi.fn() });

        for (let index = 0; index < 105; index++) {
            const operationId = `op-${index}`;
            await manager.start({ operationId, kind: 'status' });
            await waitForCompleted(manager, operationId);
        }

        expect(manager.get('op-0')).toBeNull();
        expect(manager.get('op-104')).toMatchObject({ state: 'completed' });
    });

    it('serializes different device operations on one daemon', async () => {
        let finishFirst!: (value: CodexStatus) => void;
        const first = new Promise<CodexStatus>((resolve) => { finishFirst = resolve; });
        const update = vi.fn().mockImplementationOnce(() => first).mockResolvedValue(status);
        const manager = new CodexDeviceOperationManager({ readStatus: vi.fn(), restart: vi.fn(), update });

        await manager.start({ operationId: 'update-1', kind: 'update' });
        await manager.start({ operationId: 'update-2', kind: 'update' });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(manager.get('update-1')?.state).toBe('running');
        expect(manager.get('update-2')?.state).toBe('queued');
        expect(update).toHaveBeenCalledTimes(1);

        finishFirst(status);
        await waitForCompleted(manager, 'update-2');
        expect(update).toHaveBeenCalledTimes(2);
    });
});
