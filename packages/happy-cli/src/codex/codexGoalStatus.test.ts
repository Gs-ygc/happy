import { describe, expect, it, vi } from 'vitest';
import {
    codexGoalActionCapabilities,
    consumeCodexGoalCommandText,
    createCodexGoalMutationQueue,
    formatCodexGoalProgressNotification,
    getCodexGoalProgressSnapshot,
    mapCodexGoalEventToAgentGoalStatus,
    mapCodexGoalEventToAgentGoalStatusV2,
    parseCodexGoalActionParams,
    parseCodexGoalCommand,
    reportCodexGoalCommandError,
    shouldNotifyCodexGoalProgress,
} from './codexGoalStatus';

describe('mapCodexGoalEventToAgentGoalStatus', () => {
    it('maps an active Codex goal update into agent goal status', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-17T10:00:00.000Z'));

        const status = mapCodexGoalEventToAgentGoalStatus({
            type: 'thread_goal_updated',
            threadId: 'thread-1',
            goal: {
                threadId: 'thread-1',
                objective: 'finish the release',
                status: 'active',
                tokenBudget: null,
                tokensUsed: 42,
                timeUsedSeconds: 7,
                createdAt: 1781680000,
                updatedAt: 1781680007,
            },
        }, 'thread-1');

        expect(status).toEqual({
            source: 'codex',
            observedAt: Date.now(),
            sourceSessionId: 'thread-1',
            sourceRevision: 1781680007,
            status: 'active',
            text: 'finish the release',
            progress: {
                state: 'active',
                tokensUsed: 42,
                timeUsedSeconds: 7,
            },
        });

        vi.useRealTimers();
    });

    it('formats goal progress for notifications', () => {
        const status = mapCodexGoalEventToAgentGoalStatus({
            type: 'thread_goal_updated',
            threadId: 'thread-1',
            goal: {
                threadId: 'thread-1',
                objective: 'finish the release',
                status: 'blocked',
                tokenBudget: 5000,
                tokensUsed: 1250,
                timeUsedSeconds: 125,
                createdAt: 1,
                updatedAt: 2,
            },
        }, 'thread-1');

        expect(status && formatCodexGoalProgressNotification(status)).toBe(
            'finish the release · blocked · 1.3k/5.0k tokens · 2m elapsed',
        );
    });

    it('throttles routine progress but immediately reports state changes', () => {
        const previous = {
            state: 'active',
            tokenBudget: 100_000,
            tokensUsed: 10_000,
            timeUsedSeconds: 600,
        };

        expect(shouldNotifyCodexGoalProgress(previous, {
            ...previous,
            tokensUsed: 19_999,
            timeUsedSeconds: 1_499,
        }, 20 * 60 * 1000)).toBe(false);
        expect(shouldNotifyCodexGoalProgress(previous, {
            ...previous,
            tokensUsed: 20_000,
        }, 9 * 60 * 1000)).toBe(false);
        expect(shouldNotifyCodexGoalProgress(previous, {
            ...previous,
            tokensUsed: 20_000,
        }, 10 * 60 * 1000)).toBe(true);
        expect(shouldNotifyCodexGoalProgress(previous, {
            ...previous,
            state: 'blocked',
        }, 1_000)).toBe(true);
    });

    it('preserves missing progress metrics instead of inventing zeros', () => {
        const status = mapCodexGoalEventToAgentGoalStatus({
            type: 'thread_goal_updated',
            threadId: 'thread-1',
            goal: {
                objective: 'finish the release',
                status: 'active',
                updatedAt: 2,
            },
        }, 'thread-1');

        expect(status && getCodexGoalProgressSnapshot(status)).toEqual({
            state: 'active',
            tokensUsed: undefined,
            tokenBudget: undefined,
            timeUsedSeconds: undefined,
        });
        expect(status && formatCodexGoalProgressNotification(status)).toBe('finish the release');
    });

    it('adds explicit capabilities only when the adapter reports support', () => {
        const status = mapCodexGoalEventToAgentGoalStatus({
            type: 'thread_goal_updated',
            threadId: 'thread-1',
            goal: {
                threadId: 'thread-1',
                objective: 'finish the release',
                status: 'active',
                tokenBudget: null,
                tokensUsed: 42,
                timeUsedSeconds: 7,
                createdAt: 1781680000,
                updatedAt: 1781680007,
            },
        }, 'thread-1', { capabilities: { clear: true } });

        expect(status).toMatchObject({
            status: 'active',
            capabilities: { clear: true },
        });
    });

    it('exposes lifecycle actions that match the provider goal state', () => {
        expect(codexGoalActionCapabilities(true, 'active')).toEqual({
            clear: true,
            edit: true,
            pause: true,
        });
        expect(codexGoalActionCapabilities(true, 'paused')).toEqual({
            clear: true,
            edit: true,
            resume: true,
        });
        expect(codexGoalActionCapabilities(true, 'blocked')).toEqual({
            clear: true,
            edit: true,
        });
        expect(codexGoalActionCapabilities(false)).toBeUndefined();
    });

    it('publishes provider lifecycle details separately from the legacy projection', () => {
        const event = {
            type: 'thread_goal_updated',
            threadId: 'thread-1',
            goal: {
                threadId: 'thread-1',
                objective: 'wait for quota',
                status: 'paused',
                tokenBudget: 100,
                tokensUsed: 50,
                timeUsedSeconds: 10,
                updatedAt: 2,
            },
        };

        expect(mapCodexGoalEventToAgentGoalStatus(event, 'thread-1', {
            capabilities: codexGoalActionCapabilities(true, 'paused'),
        })).toMatchObject({
            status: 'active',
            capabilities: { clear: true, edit: true },
        });
        expect(mapCodexGoalEventToAgentGoalStatusV2(event, 'thread-1', {
            capabilities: codexGoalActionCapabilities(true, 'paused'),
        })).toMatchObject({
            version: 2,
            status: 'active',
            providerStatus: 'paused',
            capabilities: { clear: true, edit: true, resume: true },
        });
    });

    it('keeps paused and limited Codex goal states visible as current goals', () => {
        for (const codexStatus of ['paused', 'blocked', 'usageLimited', 'budgetLimited']) {
            const status = mapCodexGoalEventToAgentGoalStatus({
                type: 'thread_goal_updated',
                threadId: 'thread-1',
                goal: {
                    threadId: 'thread-1',
                    objective: `goal ${codexStatus}`,
                    status: codexStatus,
                    tokenBudget: 100,
                    tokensUsed: 50,
                    timeUsedSeconds: 10,
                    createdAt: 1,
                    updatedAt: 2,
                },
            }, 'thread-1');

            expect(status).toMatchObject({
                source: 'codex',
                sourceSessionId: 'thread-1',
                status: 'active',
                text: `goal ${codexStatus}`,
            });
        }
    });

    it('maps complete and cleared goals to inactive states', () => {
        expect(mapCodexGoalEventToAgentGoalStatus({
            type: 'thread_goal_updated',
            threadId: 'thread-1',
            goal: {
                threadId: 'thread-1',
                objective: 'done',
                status: 'complete',
                tokenBudget: null,
                tokensUsed: 12,
                timeUsedSeconds: 3,
                createdAt: 1,
                updatedAt: 2,
            },
        }, 'thread-1')).toMatchObject({
            status: 'inactive',
            reason: 'completed',
            sourceSessionId: 'thread-1',
            sourceRevision: 2,
        });

        expect(mapCodexGoalEventToAgentGoalStatus({
            type: 'thread_goal_cleared',
            threadId: 'thread-1',
        }, 'thread-1')).toMatchObject({
            status: 'inactive',
            reason: 'cleared',
            sourceSessionId: 'thread-1',
        });
    });

    it('rejects malformed goal updates as unavailable', () => {
        expect(mapCodexGoalEventToAgentGoalStatus({
            type: 'thread_goal_updated',
            threadId: 'thread-1',
            goal: {
                threadId: 'thread-1',
                objective: '   ',
                status: 'active',
                tokenBudget: null,
                tokensUsed: 0,
                timeUsedSeconds: 0,
                createdAt: 1,
                updatedAt: 2,
            },
        }, 'thread-1')).toMatchObject({
            status: 'unavailable',
            reason: 'malformed',
            sourceSessionId: 'thread-1',
        });
    });

    it('ignores goal events for a different Codex thread', () => {
        expect(mapCodexGoalEventToAgentGoalStatus({
            type: 'thread_goal_updated',
            threadId: 'old-thread',
            goal: {
                threadId: 'old-thread',
                objective: 'old goal',
                status: 'active',
                tokenBudget: null,
                tokensUsed: 0,
                timeUsedSeconds: 0,
                createdAt: 1,
                updatedAt: 2,
            },
        }, 'current-thread')).toBeNull();
    });

    it('does not derive goal state from user /goal text', () => {
        expect(mapCodexGoalEventToAgentGoalStatus({
            type: 'user_message',
            message: '/goal finish the release',
            threadId: 'thread-1',
        }, 'thread-1')).toBeNull();
    });
});

describe('parseCodexGoalCommand', () => {
    it('parses explicit Codex goal commands', () => {
        expect(parseCodexGoalCommand('/goal finish the release')).toEqual({
            type: 'set',
            objective: 'finish the release',
        });
        expect(parseCodexGoalCommand('  /goal   clear  ')).toEqual({
            type: 'clear',
        });
        expect(parseCodexGoalCommand('/goal pause')).toEqual({
            type: 'set-status',
            status: 'paused',
        });
        expect(parseCodexGoalCommand('/goal resume')).toEqual({
            type: 'set-status',
            status: 'active',
        });
    });

    it('ignores empty goal commands and ordinary text', () => {
        expect(parseCodexGoalCommand('/goal')).toBeNull();
        expect(parseCodexGoalCommand('please /goal finish the release')).toBeNull();
    });
});

describe('consumeCodexGoalCommandText', () => {
    it('consumes a recognized command even when the provider action fails', async () => {
        const execute = vi.fn().mockRejectedValue(new Error('unsupported runtime'));
        const onError = vi.fn();

        await expect(consumeCodexGoalCommandText('/goal pause', execute, onError)).resolves.toBe(true);
        expect(execute).toHaveBeenCalledWith({ type: 'set-status', status: 'paused' });
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'unsupported runtime' }));
    });

    it('does not consume ordinary model input', async () => {
        const execute = vi.fn();
        expect(await consumeCodexGoalCommandText('explain /goal pause', execute)).toBe(false);
        expect(execute).not.toHaveBeenCalled();
    });
});

describe('reportCodexGoalCommandError', () => {
    it('reports a rejected remote command to both local and session UIs', () => {
        const reportLocal = vi.fn();
        const reportSession = vi.fn();

        reportCodexGoalCommandError(new Error('runtime unsupported'), reportLocal, reportSession);

        expect(reportLocal).toHaveBeenCalledWith('Goal action failed: runtime unsupported');
        expect(reportSession).toHaveBeenCalledWith('Goal action failed: runtime unsupported');
    });
});

describe('createCodexGoalMutationQueue', () => {
    it('serializes mutations from multiple clients', async () => {
        const order: string[] = [];
        let releaseFirst!: () => void;
        const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
        const enqueue = createCodexGoalMutationQueue();

        const first = enqueue(async () => {
            order.push('first-start');
            await firstGate;
            order.push('first-end');
            return 1;
        });
        const second = enqueue(async () => {
            order.push('second-start');
            return 2;
        });

        await vi.waitFor(() => expect(order).toEqual(['first-start']));
        releaseFirst();
        await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
        expect(order).toEqual(['first-start', 'first-end', 'second-start']);
    });
});

describe('parseCodexGoalActionParams', () => {
    it('parses lifecycle and edit RPC params into Codex goal commands', () => {
        expect(parseCodexGoalActionParams({ action: 'clear' })).toEqual({
            type: 'clear',
        });
        expect(parseCodexGoalActionParams({ action: 'edit', objective: '  revised goal  ' })).toEqual({
            type: 'set',
            objective: 'revised goal',
        });
        expect(parseCodexGoalActionParams({ action: 'pause' })).toEqual({
            type: 'set-status',
            status: 'paused',
        });
        expect(parseCodexGoalActionParams({ action: 'resume' })).toEqual({
            type: 'set-status',
            status: 'active',
        });
    });

    it('rejects unsupported or empty goal action params', () => {
        expect(parseCodexGoalActionParams({ action: 'stop' })).toBeNull();
        expect(parseCodexGoalActionParams({ action: 'edit', objective: '   ' })).toBeNull();
        expect(parseCodexGoalActionParams({ action: 'edit' })).toBeNull();
    });
});
