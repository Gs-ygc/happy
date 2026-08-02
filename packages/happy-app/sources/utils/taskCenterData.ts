import type { Machine, Session } from '@/sync/storageTypes';
import { resolveVisibleAgentGoalStatus, type VisibleAgentGoalStatus } from '@/components/agentGoalStatus';

/**
 * Pure data-layer helpers for the Task Center tab.
 *
 * The Task Center shows two sections:
 *   1. Running - sessions that are active and online right now.
 *   2. All - every remaining session, grouped by project path.
 *
 * Everything here is a pure function over storage data so it can be unit
 * tested without React Native / storage dependencies.
 */

export type TaskRunState = 'thinking' | 'permission_required' | 'running';

export interface TaskItem {
    sessionId: string;
    path: string | null;
    machineId: string | null;
    machineName: string | null;
    state: TaskRunState;
    goal: VisibleAgentGoalStatus | null;
    updatedAt: number;
    createdAt: number;
    isPinned: boolean;
    /** True when the daemon is alive and connected (regardless of activity). */
    isOnline: boolean;
    /** True when the task belongs in the Running section (online + active work). */
    isRunning: boolean;
}

export interface TaskProjectGroup {
    /** Stable key for collapse persistence: machineId + ':' + path, or OTHER_PROJECT_KEY. */
    key: string;
    /** Project path, or '' for sessions without a path (the "other" bucket). */
    displayPath: string;
    machineName: string;
    items: TaskItem[];
}

export interface TaskCenterData {
    running: TaskItem[];
    projects: TaskProjectGroup[];
    runningCount: number;
    totalCount: number;
}

export const OTHER_PROJECT_KEY = '__other__';

/**
 * How long a session can go without real activity (messages / state changes)
 * before it is considered idle, even though the daemon is still connected.
 * The CLI heartbeats every 2 seconds regardless of activity, so aliveness
 * alone does not mean the agent is actually doing something.
 */
export const TASK_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * A session is "online" when it is active AND the daemon reports it online.
 * Presence is "online" while active, or a last-seen timestamp.
 */
export function isTaskOnline(session: Pick<Session, 'active' | 'presence'>): boolean {
    return session.active && session.presence === 'online';
}

/**
 * True when the agent is actually working (thinking, waiting for a permission
 * decision) or has seen real activity within the idle window.
 */
export function isTaskActivelyWorking(session: Session, now: number = Date.now()): boolean {
    const hasPendingRequests = !!(session.agentState?.requests && Object.keys(session.agentState.requests).length > 0);
    if (hasPendingRequests || session.thinking) {
        return true;
    }
    // Heartbeats never touch updatedAt, so it only moves on real activity
    // (messages, metadata, agent state changes).
    return now - session.updatedAt < TASK_IDLE_TIMEOUT_MS;
}

/**
 * A task belongs in the Running section when the session is online AND
 * actively working. Online sessions that have been idle for a long time fall
 * back to the project groups (still marked online, see TaskItem.isOnline).
 */
export function isTaskRunning(session: Session, now: number = Date.now()): boolean {
    return isTaskOnline(session) && isTaskActivelyWorking(session, now);
}

/**
 * Sub-state shown in the running section:
 * - permission_required: agent is waiting for a tool permission decision
 * - thinking: agent is actively working
 * - running: online, idle, but still an active session
 */
export function getTaskRunState(session: Session): TaskRunState {
    const hasPendingRequests = !!(session.agentState?.requests && Object.keys(session.agentState.requests).length > 0);
    if (hasPendingRequests) return 'permission_required';
    if (session.thinking) return 'thinking';
    return 'running';
}

export function getMachineDisplayName(machine: Machine | undefined | null): string {
    if (!machine) return '';
    return machine.metadata?.displayName || machine.metadata?.host || machine.id;
}

export function buildTaskItem(
    session: Session,
    machines: Record<string, Machine>,
    pinnedSessionIds: ReadonlySet<string>,
): TaskItem {
    const machineId = session.metadata?.machineId ?? null;
    const isOnline = isTaskOnline(session);
    const isRunning = isOnline && isTaskActivelyWorking(session);
    return {
        sessionId: session.id,
        path: session.metadata?.path ?? null,
        machineId,
        machineName: machineId ? getMachineDisplayName(machines[machineId]) : null,
        state: getTaskRunState(session),
        goal: resolveVisibleAgentGoalStatus(session),
        updatedAt: session.updatedAt,
        createdAt: session.createdAt,
        isPinned: pinnedSessionIds.has(session.id),
        isOnline,
        isRunning,
    };
}

/**
 * Build the two-section Task Center dataset.
 *
 * - Running tasks are sorted by most recent activity (updatedAt desc).
 * - Everything else is grouped by project path; groups are sorted by path
 *   (the no-path "other" bucket last) and items inside a group are sorted by
 *   most recent activity.
 */
export function buildTaskCenterData(
    sessions: readonly Session[],
    machines: Record<string, Machine>,
    pinnedSessionIds: readonly string[],
): TaskCenterData {
    const pinned = new Set(pinnedSessionIds);
    const running: TaskItem[] = [];
    const remaining: TaskItem[] = [];

    for (const session of sessions) {
        const item = buildTaskItem(session, machines, pinned);
        if (item.isRunning) {
            running.push(item);
        } else {
            remaining.push(item);
        }
    }

    running.sort((a, b) => b.updatedAt - a.updatedAt);

    const groupMap = new Map<string, TaskProjectGroup>();
    for (const item of remaining) {
        const key = item.path ? item.machineId + ':' + item.path : OTHER_PROJECT_KEY;
        let group = groupMap.get(key);
        if (!group) {
            group = {
                key,
                displayPath: item.path ?? '',
                machineName: item.machineName ?? '',
                items: [],
            };
            groupMap.set(key, group);
        }
        group.items.push(item);
    }

    const projects = Array.from(groupMap.values());
    for (const group of projects) {
        group.items.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    projects.sort((a, b) => {
        if (a.key === OTHER_PROJECT_KEY) return 1;
        if (b.key === OTHER_PROJECT_KEY) return -1;
        return a.displayPath.localeCompare(b.displayPath);
    });

    return {
        running,
        projects,
        runningCount: running.length,
        totalCount: sessions.length,
    };
}

/** Drop project groups the user collapsed (filtering is done in the view). */
export function filterCollapsedProjects(
    projects: readonly TaskProjectGroup[],
    collapsedKeys: readonly string[],
): TaskProjectGroup[] {
    if (collapsedKeys.length === 0) {
        return projects as TaskProjectGroup[];
    }
    const collapsed = new Set(collapsedKeys);
    return projects.filter((group) => !collapsed.has(group.key));
}
