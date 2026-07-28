import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionRPC, getState } = vi.hoisted(() => ({
    sessionRPC: vi.fn(),
    getState: vi.fn(),
}));

vi.mock('./apiSocket', () => ({ apiSocket: { sessionRPC } }));
vi.mock('./sync', () => ({ sync: {} }));
vi.mock('./storage', () => ({ storage: { getState } }));

describe('Codex session restart op', () => {
    beforeEach(() => {
        sessionRPC.mockReset();
        getState.mockReturnValue({
            sessions: {
                codex: {
                    metadata: {
                        flavor: 'codex',
                        codexThreadId: 'thread-current',
                    },
                },
            },
        });
    });

    it('requests an in-place backend restart for the current session', async () => {
        sessionRPC.mockResolvedValue({ success: true, threadId: 'thread-current' });
        const { sessionRestartCodex } = await import('./ops');

        await expect(sessionRestartCodex('codex')).resolves.toEqual({
            success: true,
            threadId: 'thread-current',
        });
        expect(sessionRPC).toHaveBeenCalledWith('codex', 'restartCodex', {});
    });

    it('rejects sessions that are not backed by Codex', async () => {
        getState.mockReturnValue({
            sessions: { claude: { metadata: { flavor: 'claude' } } },
        });
        const { sessionRestartCodex } = await import('./ops');

        await expect(sessionRestartCodex('claude')).resolves.toEqual({
            success: false,
            message: 'Restart is only available for Codex sessions',
        });
        expect(sessionRPC).not.toHaveBeenCalled();
    });

    it('requires a persisted Codex thread ID', async () => {
        getState.mockReturnValue({
            sessions: { codex: { metadata: { flavor: 'codex' } } },
        });
        const { sessionRestartCodex } = await import('./ops');

        await expect(sessionRestartCodex('codex')).resolves.toEqual({
            success: false,
            message: 'This Codex session does not have an active thread to restart',
        });
        expect(sessionRPC).not.toHaveBeenCalled();
    });

    it('returns RPC failures to the UI', async () => {
        sessionRPC.mockRejectedValue(new Error('thread/resume failed'));
        const { sessionRestartCodex } = await import('./ops');

        await expect(sessionRestartCodex('codex')).resolves.toEqual({
            success: false,
            message: 'thread/resume failed',
        });
    });
});
