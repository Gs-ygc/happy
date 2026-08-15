import { describe, expect, it } from 'vitest';
import type { Machine, Session } from '@/sync/storageTypes';
import {
    OTHER_PROJECT_KEY,
    TASK_IDLE_TIMEOUT_MS,
    buildTaskCenterData,
    getTaskRunState,
    isTaskActivelyWorking,
    isTaskActive,
    isTaskOnline,
    isTaskRunning,
} from './taskCenterData';

function sessionWith(overrides: Partial<Session> = {}): Session {
    return {
        id: 'happy-session-1',
        seq: 1,
        createdAt: 1000,
        updatedAt: 2000,
        active: true,
        activeAt: 10_000,
        metadata: {
            path: '/tmp/project',
            host: 'local',
            claudeSessionId: 'claude-session-1',
            codexThreadId: 'codex-thread-1',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        ...overrides,
    };
}

function withPath(session: Session, path: string): Session {
    return { ...session, metadata: { ...session.metadata!, path } };
}

function machineWith(overrides: Partial<Machine> = {}): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 1000,
        updatedAt: 1000,
        active: true,
        activeAt: 1000,
        metadata: {
            host: 'local',
            platform: 'darwin',
            happyCliVersion: '1.0.0',
            happyHomeDir: '/tmp/.happy',
            homeDir: '/Users/x',
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 0,
        ...overrides,
    };
}

const noMachines: Record<string, Machine> = {};

describe('isTaskOnline', () => {
    it('is online when active and the daemon is online', () => {
        expect(isTaskOnline({ active: true, presence: 'online' })).toBe(true);
    });

    it('is not online when the daemon was last seen a while ago', () => {
        expect(isTaskOnline({ active: true, presence: 123_456 })).toBe(false);
    });

    it('is not online when inactive even if presence says online', () => {
        expect(isTaskOnline({ active: false, presence: 'online' })).toBe(false);
    });
});

describe('isTaskActivelyWorking', () => {
    const now = 10_000_000_000;

    it('returns true while the agent is thinking', () => {
        expect(isTaskActivelyWorking(sessionWith({ thinking: true }), now)).toBe(true);
    });

    it('returns true while the agent waits for a permission decision', () => {
        const session = sessionWith({
            agentState: { requests: { req1: { id: 'req1', tool: 'Bash' } } } as any,
        });
        expect(isTaskActivelyWorking(session, now)).toBe(true);
    });

    it('does not infer active work from a recent message timestamp', () => {
        expect(isTaskActivelyWorking(sessionWith({ createdAt: now - 120_000, updatedAt: now - 60_000 }), now)).toBe(false);
    });

    it('does not treat a newly created session with no messages as active work', () => {
        expect(isTaskActivelyWorking(sessionWith({ createdAt: now - 60_000, updatedAt: now - 60_000 }), now)).toBe(false);
    });

    it('returns false when the session has been idle past the timeout', () => {
        expect(isTaskActivelyWorking(
            sessionWith({ updatedAt: now - TASK_IDLE_TIMEOUT_MS - 1000 }),
            now,
        )).toBe(false);
    });

    it('does not treat paused or blocked goals as active work', () => {
        for (const providerStatus of ['paused', 'blocked'] as const) {
            expect(isTaskActivelyWorking(sessionWith({
                activityState: 'goal',
                metadata: {
                    path: '/tmp/project',
                    host: 'local',
                    codexThreadId: 'codex-thread-1',
                },
                agentState: {
                    agentGoalStatusV2: {
                        version: 2,
                        status: 'active',
                        source: 'codex',
                        text: 'long task',
                        observedAt: now,
                        sourceSessionId: 'codex-thread-1',
                        providerStatus,
                    },
                },
            }), now)).toBe(false);
        }
    });
});

describe('isTaskRunning', () => {
    const now = 10_000_000_000;

    it('is running when online and actively working', () => {
        expect(isTaskRunning(sessionWith({ updatedAt: now - 5000, activityState: 'thinking' }), now)).toBe(true);
    });

    it('is not running when online but idle for a long time', () => {
        expect(isTaskRunning(
            sessionWith({ updatedAt: now - TASK_IDLE_TIMEOUT_MS - 5000 }),
            now,
        )).toBe(false);
    });

    it('is not running when the daemon is offline', () => {
        expect(isTaskRunning(sessionWith({ presence: 123_456, updatedAt: now - 5000 }), now)).toBe(false);
    });
});

describe('isTaskActive', () => {
    const now = 10_000_000_000;

    it('counts unread agent output as active even when idle past the timeout', () => {
        const session = sessionWith({ updatedAt: now - TASK_IDLE_TIMEOUT_MS - 60_000 });
        expect(isTaskActive(session, new Set([session.id]), now)).toBe(true);
    });

    it('is not active when idle past the timeout and no unread', () => {
        const session = sessionWith({ updatedAt: now - TASK_IDLE_TIMEOUT_MS - 60_000 });
        expect(isTaskActive(session, new Set(), now)).toBe(false);
    });
});

describe('getTaskRunState', () => {
    it('returns permission_required when the agent is waiting for permission', () => {
        const session = sessionWith({
            agentState: { requests: { req1: { id: 'req1', tool: 'Bash' } } } as any,
        });
        expect(getTaskRunState(session)).toBe('permission_required');
    });

    it('returns thinking when the agent is thinking', () => {
        expect(getTaskRunState(sessionWith({ thinking: true }))).toBe('thinking');
    });

    it('returns idle when the agent is online without an activity state', () => {
        expect(getTaskRunState(sessionWith({ createdAt: 1_000, updatedAt: 1_000 }))).toBe('idle');
    });
});

describe('buildTaskCenterData', () => {
    it('partitions running sessions into the running section and the rest into projects', () => {
        const running = sessionWith({ id: 'run-1', updatedAt: Date.now() - 1000, activityState: 'streaming' });
        const inactive = sessionWith({ id: 'rest-1', active: false, presence: 99, updatedAt: 4000 });
        const data = buildTaskCenterData([inactive, running], noMachines, []);

        expect(data.runningCount).toBe(1);
        expect(data.totalCount).toBe(2);
        expect(data.running.map((item) => item.sessionId)).toEqual(['run-1']);
        expect(data.projects.flatMap((group) => group.items.map((item) => item.sessionId))).toEqual(['rest-1']);
    });

    it('sorts the running section by most recent activity first', () => {
        const older = sessionWith({ id: 'old', updatedAt: Date.now() - 200_000, activityState: 'streaming' });
        const newer = sessionWith({ id: 'new', updatedAt: Date.now() - 1000, activityState: 'streaming' });
        const data = buildTaskCenterData([older, newer], noMachines, []);
        expect(data.running.map((item) => item.sessionId)).toEqual(['new', 'old']);
    });

    it('keeps thinking and permission sessions ahead of a newer running session', () => {
        const running = sessionWith({ id: 'run-new', updatedAt: Date.now(), activityState: 'streaming' });
        const thinking = sessionWith({ id: 'think-old', updatedAt: Date.now() - 5000, thinking: true });
        const permission = sessionWith({
            id: 'perm-old',
            updatedAt: Date.now() - 6000,
            agentState: { requests: { req1: { id: 'req1', tool: 'Bash' } } } as any,
        });
        const data = buildTaskCenterData([running, thinking, permission], noMachines, []);

        expect(data.running.map((item) => item.sessionId)).toEqual(['think-old', 'perm-old', 'run-new']);
    });

    it('prioritizes an active goal over ordinary thinking work', () => {
        const thinking = sessionWith({ id: 'think-old', updatedAt: Date.now() - 5000, thinking: true });
        const goal = sessionWith({
            id: 'goal-new',
            updatedAt: Date.now(),
            agentState: {
                agentGoalStatus: {
                    status: 'active',
                    source: 'claude',
                    text: 'finish the feature',
                    observedAt: Date.now(),
                    sourceSessionId: 'claude-session-1',
                },
            } as any,
        });
        const data = buildTaskCenterData([goal, thinking], noMachines, []);

        expect(data.running.map((item) => item.sessionId)).toEqual(['goal-new', 'think-old']);
    });

    it('keeps online-but-idle sessions out of running and marks them online', () => {
        const idle = sessionWith({
            id: 'idle-1',
            updatedAt: Date.now() - TASK_IDLE_TIMEOUT_MS - 60_000,
        });
        const data = buildTaskCenterData([idle], noMachines, []);

        expect(data.runningCount).toBe(0);
        const item = data.projects[0].items[0];
        expect(item.sessionId).toBe('idle-1');
        expect(item.isOnline).toBe(true);
        expect(item.isRunning).toBe(false);
    });

    it('pins sessions with unsubmitted input at the bottom pending section', () => {
        const drafted = sessionWith({
            id: 'draft-1',
            draft: '  hello, agent!  ',
            updatedAt: Date.now() - 1000,
        });
        const running = sessionWith({ id: 'run-1', updatedAt: Date.now() - 2000, activityState: 'streaming' });
        const data = buildTaskCenterData([running, drafted], noMachines, []);

        expect(data.runningCount).toBe(1);
        expect(data.pendingCount).toBe(1);
        expect(data.pending[0].sessionId).toBe('draft-1');
        expect(data.pending[0].draft).toBe('  hello, agent!  ');
        expect(data.pending[0].hasPendingInput).toBe(true);
    });

    it('sorts sessions with an in-progress goal to the top of running', () => {
        const goal = sessionWith({
            id: 'goal-1',
            updatedAt: Date.now() - 5000,
            agentState: {
                agentGoalStatus: {
                    status: 'active',
                    source: 'claude',
                    text: 'finish the feature',
                    observedAt: Date.now(),
                    sourceSessionId: 'claude-session-1',
                },
            } as any,
        });
        const recent = sessionWith({ id: 'recent-1', updatedAt: Date.now() - 1000, activityState: 'streaming' });
        const data = buildTaskCenterData([recent, goal], noMachines, []);

        expect(data.running.map((item) => item.sessionId)).toEqual(['goal-1', 'recent-1']);
    });

    it('does not rank a paused goal above real active work', () => {
        const paused = sessionWith({
            id: 'paused-goal',
            updatedAt: Date.now(),
            metadata: {
                path: '/tmp/project',
                host: 'local',
                codexThreadId: 'codex-thread-1',
            },
            agentState: {
                agentGoalStatusV2: {
                    version: 2,
                    status: 'active',
                    source: 'codex',
                    text: 'paused work',
                    observedAt: Date.now(),
                    sourceSessionId: 'codex-thread-1',
                    providerStatus: 'paused',
                },
            },
        });
        const thinking = sessionWith({
            id: 'thinking-work',
            updatedAt: Date.now() - 1000,
            activityState: 'thinking',
        });
        const data = buildTaskCenterData(
            [paused, thinking],
            noMachines,
            [],
            new Set(['paused-goal']),
        );

        expect(data.running.map((item) => item.sessionId)).toEqual(['thinking-work', 'paused-goal']);
    });

    it('sorts project groups and their sessions by most recent activity', () => {
        const a = withPath(sessionWith({ id: 'a1', active: false, presence: 1, updatedAt: 3000 }), '/tmp/zed');
        const b = withPath(sessionWith({ id: 'b1', active: false, presence: 1, updatedAt: 2000 }), '/tmp/alpha');
        const c = withPath(sessionWith({ id: 'c1', active: false, presence: 1, updatedAt: 4000 }), '/tmp/zed');
        const data = buildTaskCenterData([a, b, c], noMachines, []);

        expect(data.projects.map((group) => group.displayPath)).toEqual(['/tmp/zed', '/tmp/alpha']);
        const zed = data.projects[0];
        expect(zed.items.map((item) => item.sessionId)).toEqual(['c1', 'a1']);
    });

    it('includes running, pending, and inactive sessions in the all-project groups', () => {
        const running = sessionWith({ id: 'run-all', updatedAt: Date.now() - 1000, activityState: 'streaming' });
        const pending = sessionWith({ id: 'draft-all', draft: 'send this', updatedAt: Date.now() - 2000 });
        const inactive = sessionWith({ id: 'idle-all', active: false, presence: 1, updatedAt: Date.now() - 3000 });

        const data = buildTaskCenterData([inactive, pending, running], noMachines, []);

        expect(data.allProjects.flatMap((group) => group.items.map((item) => item.sessionId)))
            .toEqual(['run-all', 'draft-all', 'idle-all']);
    });

    it('puts sessions without a path into the "other" bucket', () => {
        const noPath = sessionWith({ id: 'nopath', metadata: { claudeSessionId: 'c-1' } as any, active: false, presence: 1 });
        const withPath = sessionWith({ id: 'withpath', active: false, presence: 1 });
        const data = buildTaskCenterData([noPath, withPath], noMachines, []);

        const other = data.projects.find((group) => group.key === OTHER_PROJECT_KEY);
        expect(other?.items.map((item) => item.sessionId)).toEqual(['nopath']);
    });

    it('resolves the machine display name with fallbacks', () => {
        const machine = machineWith({ id: 'm1' });
        const session = sessionWith({
            id: 's1',
            metadata: { machineId: 'm1', path: '/tmp/x', host: 'local' },
            active: false,
            presence: 1,
        });
        const data = buildTaskCenterData([session], { m1: machine }, []);
        expect(data.projects[0].machineName).toBe('local');

        const named = machineWith({ id: 'm1', metadata: { ...machine.metadata!, displayName: 'Studio' } as any });
        const data2 = buildTaskCenterData([session], { m1: named }, []);
        expect(data2.projects[0].machineName).toBe('Studio');
    });

    it('marks pinned sessions', () => {
        const session = sessionWith({ id: 'pinned-1', updatedAt: Date.now() - 1000, activityState: 'streaming' });
        const data = buildTaskCenterData([session], noMachines, ['pinned-1']);
        expect(data.running[0].isPinned).toBe(true);
    });

    it('attaches the visible agent goal for running sessions', () => {
        const session = sessionWith({
            id: 'goal-1',
            updatedAt: Date.now() - 1000,
            agentState: {
                agentGoalStatus: {
                    status: 'active',
                    source: 'claude',
                    text: 'finish the feature',
                    observedAt: 11_000,
                    sourceSessionId: 'claude-session-1',
                    capabilities: { clear: true },
                },
            } as any,
        });
        const data = buildTaskCenterData([session], noMachines, []);
        expect(data.running[0].goal?.text).toBe('finish the feature');
    });

    it('does not attach a goal when the session is not online', () => {
        const session = sessionWith({
            id: 'goal-2',
            active: false,
            presence: 42,
            updatedAt: 3000,
            agentState: {
                agentGoalStatus: {
                    status: 'active',
                    source: 'claude',
                    text: 'finish the feature',
                    observedAt: 11_000,
                    sourceSessionId: 'claude-session-1',
                    capabilities: { clear: true },
                },
            } as any,
        });
        const data = buildTaskCenterData([session], noMachines, []);
        expect(data.projects[0].items[0].goal).toBeNull();
    });
});
