import { describe, expect, it, vi } from 'vitest';

import {
    CodexSessionLifecycleCoordinator,
    markCodexRestartFailed,
    markCodexRestartSucceeded,
    restartCodexBackend,
} from './restartCodexBackend';

const idleAbortResult = {
    hadActiveTurn: false,
    aborted: false,
    forcedRestart: false,
    resumedThread: false,
};

describe('restartCodexBackend', () => {
    it('waits for an active abort before starting a restart', async () => {
        const coordinator = new CodexSessionLifecycleCoordinator();
        let finishAbort!: () => void;
        const abortGate = new Promise<void>((resolve) => {
            finishAbort = resolve;
        });
        const calls: string[] = [];

        const abort = coordinator.runAbort(async () => {
            calls.push('abort:start');
            await abortGate;
            calls.push('abort:end');
        });
        const restart = coordinator.runRestart(async () => {
            calls.push('restart');
            return { success: true as const, threadId: 'thread-resumed' };
        });

        await Promise.resolve();
        expect(calls).toEqual(['abort:start']);

        finishAbort();
        await expect(abort).resolves.toBeUndefined();
        await expect(restart).resolves.toEqual({ success: true, threadId: 'thread-resumed' });
        expect(calls).toEqual(['abort:start', 'abort:end', 'restart']);
    });

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
            reconnectAndResumeThread: vi.fn().mockResolvedValue('thread-resumed'),
        };

        await expect(restartCodexBackend(client)).resolves.toEqual({
            success: true,
            threadId: 'thread-resumed',
        });
        expect(client.abortTurnWithFallback).toHaveBeenCalledWith({
            gracePeriodMs: 3000,
            forceRestartOnTimeout: true,
        });
        expect(client.reconnectAndResumeThread).toHaveBeenCalledTimes(1);
    });

    it('reuses the restart performed by the abort timeout fallback', async () => {
        const client = {
            threadId: 'thread-resumed-by-abort',
            abortTurnWithFallback: vi.fn().mockResolvedValue({
                hadActiveTurn: true,
                aborted: true,
                forcedRestart: true,
                resumedThread: true,
                resumedThreadId: 'thread-resumed-by-abort',
            }),
            reconnectAndResumeThread: vi.fn(),
        };

        await expect(restartCodexBackend(client, { gracePeriodMs: 10 })).resolves.toEqual({
            success: true,
            threadId: 'thread-resumed-by-abort',
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
            reconnectAndResumeThread: vi.fn().mockResolvedValue(null),
        };

        await expect(restartCodexBackend(client)).rejects.toThrow(
            'Failed to restart Codex thread thread-current: the backend restarted but the thread could not be resumed',
        );
    });

    it('persists the returned resume identity and clears stale state on failure', () => {
        const metadata = {
            flavor: 'codex',
            codexThreadId: 'thread-stale',
            lifecycleState: 'running',
        };

        expect(markCodexRestartSucceeded(metadata, 'thread-resumed', 100)).toEqual({
            flavor: 'codex',
            codexThreadId: 'thread-resumed',
            lifecycleState: 'running',
            lifecycleStateSince: 100,
        });
        expect(markCodexRestartFailed(metadata, 200)).toEqual({
            flavor: 'codex',
            lifecycleState: 'error',
            lifecycleStateSince: 200,
        });
    });
});
