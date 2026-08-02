import { describe, expect, it } from 'vitest';
import type { Machine, Session } from '@/sync/storageTypes';
import {
    OTHER_PROJECT_KEY,
    TASK_IDLE_TIMEOUT_MS,
    buildTaskCenterData,
    filterCollapsedProjects,
    getTaskRunState,
    isTaskActivelyWorking,
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

    it('returns true when the session had real activity recently', () => {
        expect(isTaskActivelyWorking(sessionWith({ updatedAt: now - 60_000 }), now)).toBe(true);
    });

    it('returns false when the session has been idle past the timeout', () => {
        expect(isTaskActivelyWorking(
            sessionWith({ updatedAt: now - TASK_IDLE_TIMEOUT_MS - 1000 }),
            now,
        )).toBe(false);
    });
});

describe('isTaskRunning', () => {
    const now = 10_000_000_000;

    it('is running when online and actively working', () => {
        expect(isTaskRunning(sessionWith({ updatedAt: now - 5000 }), now)).toBe(true);
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

    it('returns running otherwise', () => {
        expect(getTaskRunState(sessionWith({}))).toBe('running');
    });
});

describe('buildTaskCenterData', () => {
    it('partitions running sessions into the running section and the rest into projects', () => {
        const running = sessionWith({ id: 'run-1', updatedAt: Date.now() - 1000 });
        const inactive = sessionWith({ id: 'rest-1', active: false, presence: 99, updatedAt: 4000 });
        const data = buildTaskCenterData([inactive, running], noMachines, []);

        expect(data.runningCount).toBe(1);
        expect(data.totalCount).toBe(2);
        expect(data.running.map((item) => item.sessionId)).toEqual(['run-1']);
        expect(data.projects.flatMap((group) => group.items.map((item) => item.sessionId))).toEqual(['rest-1']);
    });

    it('sorts the running section by most recent activity first', () => {
        const older = sessionWith({ id: 'old', updatedAt: Date.now() - 200_000 });
        const newer = sessionWith({ id: 'new', updatedAt: Date.now() - 1000 });
        const data = buildTaskCenterData([older, newer], noMachines, []);
        expect(data.running.map((item) => item.sessionId)).toEqual(['new', 'old']);
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

    it('groups remaining sessions by project path and sorts groups by path', () => {
        const a = withPath(sessionWith({ id: 'a1', active: false, presence: 1, updatedAt: 3000 }), '/tmp/zed');
        const b = withPath(sessionWith({ id: 'b1', active: false, presence: 1, updatedAt: 2000 }), '/tmp/alpha');
        const c = withPath(sessionWith({ id: 'c1', active: false, presence: 1, updatedAt: 4000 }), '/tmp/zed');
        const data = buildTaskCenterData([a, b, c], noMachines, []);

        expect(data.projects.map((group) => group.displayPath)).toEqual(['/tmp/alpha', '/tmp/zed']);
        const zed = data.projects[1];
        expect(zed.items.map((item) => item.sessionId)).toEqual(['c1', 'a1']);
    });

    it('puts sessions without a path into the "other" bucket last', () => {
        const noPath = sessionWith({ id: 'nopath', metadata: { claudeSessionId: 'c-1' } as any, active: false, presence: 1 });
        const withPath = sessionWith({ id: 'withpath', active: false, presence: 1 });
        const data = buildTaskCenterData([noPath, withPath], noMachines, []);

        expect(data.projects[data.projects.length - 1].key).toBe(OTHER_PROJECT_KEY);
        expect(data.projects[data.projects.length - 1].items.map((item) => item.sessionId)).toEqual(['nopath']);
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
        const session = sessionWith({ id: 'pinned-1', updatedAt: Date.now() - 1000 });
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

describe('filterCollapsedProjects', () => {
    it('keeps everything when nothing is collapsed', () => {
        const projects = [{ key: 'a', displayPath: '/a', machineName: '', items: [] }];
        expect(filterCollapsedProjects(projects, [])).toHaveLength(1);
    });

    it('removes collapsed groups by key', () => {
        const projects = [
            { key: 'a', displayPath: '/a', machineName: '', items: [] },
            { key: 'b', displayPath: '/b', machineName: '', items: [] },
        ];
        const visible = filterCollapsedProjects(projects, ['a']);
        expect(visible.map((group) => group.key)).toEqual(['b']);
    });
});
