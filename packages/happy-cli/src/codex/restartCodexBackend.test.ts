import { describe, expect, it, vi } from 'vitest';

import { restartCodexBackend } from './restartCodexBackend';

const idleAbortResult = {
    hadActiveTurn: false,
    aborted: false,
    forcedRestart: false,
    resumedThread: false,
};

describe('restartCodexBackend', () => {
    it('requires an active thread', async () => {
        const client = {
            threadId: null,
            abortTurnWithFallback: vi.fn(),
            reconnectAndResumeThread: vi.fn(),
        };

        await expect(restartCodexBackend(client)).rejects.toThrow('No active Codex thread to restart');
        expect(client.abortTurnWithFallback).not.toHaveBeenCalled();
        expect(client.reconnectAndResumeThread).not.toHaveBeenCalled();
    });

    it('restarts the backend and resumes the current thread', async () => {
        const client = {
            threadId: 'thread-current',
            abortTurnWithFallback: vi.fn().mockResolvedValue(idleAbortResult),
            reconnectAndResumeThread: vi.fn().mockResolvedValue(true),
        };

        await expect(restartCodexBackend(client)).resolves.toEqual({
            success: true,
            threadId: 'thread-current',
        });
        expect(client.abortTurnWithFallback).toHaveBeenCalledWith({
            gracePeriodMs: 3000,
            forceRestartOnTimeout: true,
        });
        expect(client.reconnectAndResumeThread).toHaveBeenCalledTimes(1);
    });

    it('reuses the restart performed by the abort timeout fallback', async () => {
        const client = {
            threadId: 'thread-current',
            abortTurnWithFallback: vi.fn().mockResolvedValue({
                hadActiveTurn: true,
                aborted: true,
                forcedRestart: true,
                resumedThread: true,
            }),
            reconnectAndResumeThread: vi.fn(),
        };

        await expect(restartCodexBackend(client, { gracePeriodMs: 10 })).resolves.toEqual({
            success: true,
            threadId: 'thread-current',
        });
        expect(client.abortTurnWithFallback).toHaveBeenCalledWith({
            gracePeriodMs: 10,
            forceRestartOnTimeout: true,
        });
        expect(client.reconnectAndResumeThread).not.toHaveBeenCalled();
    });

    it('reports a failed thread resume with the original thread ID', async () => {
        const client = {
            threadId: 'thread-current',
            abortTurnWithFallback: vi.fn().mockResolvedValue(idleAbortResult),
            reconnectAndResumeThread: vi.fn().mockResolvedValue(false),
        };

        await expect(restartCodexBackend(client)).rejects.toThrow(
            'Failed to restart Codex thread thread-current: the backend restarted but the thread could not be resumed',
        );
    });
});
