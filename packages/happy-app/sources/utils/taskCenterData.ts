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

export type TaskRunState = 'thinking' | 'permission_required' | 'running' | 'streaming' | 'tool' | 'idle';

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
    /** True when the session has unread agent output (needs attention). */
    hasUnread: boolean;
    /** Local draft text (typed but not submitted yet), if any. */
    draft: string | null;
    /** True when the user typed input that hasn't been submitted. */
    hasPendingInput: boolean;
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
    /** Sessions with unsubmitted user input; pinned at the very bottom. */
    pending: TaskItem[];
    /** Every session grouped for the All segment. */
    allProjects: TaskProjectGroup[];
    /** Non-running sessions retained for callers that need the old partition. */
    projects: TaskProjectGroup[];
    runningCount: number;
    pendingCount: number;
    totalCount: number;
}

export const OTHER_PROJECT_KEY = '__other__';

/**
 * Explicit provider events take precedence. Recent real message activity is
 * retained for this window so tasks do not disappear between provider events.
 */
export const TASK_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * A session is "online" when it is active AND the daemon reports it online.
 * Presence is "online" while active, or a last-seen timestamp.
 */
export function isTaskOnline(session: Pick<Session, 'active' | 'presence'>): boolean {
    return session.active && session.presence === 'online';
}

/**
 * True when the provider reports a work state, the session has a pending
 * request/goal, or a real message recently advanced updatedAt.
 */
export function isTaskActivelyWorking(session: Session, now: number = Date.now()): boolean {
    const hasPendingRequests = !!(session.agentState?.requests && Object.keys(session.agentState.requests).length > 0);
    if (hasPendingRequests || session.thinking) {
        return true;
    }
    const activityState = session.activityState;
    if (activityState === 'thinking' || activityState === 'streaming' || activityState === 'tool' || activityState === 'permission') {
        return true;
    }
    const goal = resolveVisibleAgentGoalStatus(session);
    if (goal) {
        return goal.providerStatus === 'active';
    }
    if (activityState === 'goal') {
        return true;
    }
    const hasRecentRealActivity = session.updatedAt > session.createdAt
        && now >= session.updatedAt
        && now - session.updatedAt <= TASK_IDLE_TIMEOUT_MS;
    return hasRecentRealActivity;
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
 * Membership in the Running section: the session must be online AND either
 * actively working or carrying unread agent output. Sessions that had no
 * input/output for the idle window and no unread messages are not "active".
 */
export function isTaskActive(
    session: Session,
    unreadSessionIds: ReadonlySet<string>,
    now: number = Date.now(),
): boolean {
    return isTaskOnline(session)
        && (isTaskActivelyWorking(session, now) || unreadSessionIds.has(session.id));
}

/** True when the user typed input for this session that hasn't been submitted. */
export function hasPendingUserInput(session: Pick<Session, 'draft'>): boolean {
    return !!session.draft && session.draft.trim().length > 0;
}

/**
 * Sub-state shown in the running section:
 * - permission_required: agent is waiting for a tool permission decision
 * - thinking: agent is actively working
 * - running: goal-mode execution
 */
export function getTaskRunState(session: Session, now: number = Date.now()): TaskRunState {
    const hasPendingRequests = !!(session.agentState?.requests && Object.keys(session.agentState.requests).length > 0);
    if (hasPendingRequests) return 'permission_required';
    if (session.activityState === 'permission') return 'permission_required';
    if (session.activityState === 'streaming') return 'streaming';
    if (session.activityState === 'tool') return 'tool';
    if (session.thinking || session.activityState === 'thinking') return 'thinking';
    const goal = resolveVisibleAgentGoalStatus(session);
    if ((session.activityState === 'goal' && !goal) || goal?.providerStatus === 'active') return 'running';
    return 'idle';
}

export function getMachineDisplayName(machine: Machine | undefined | null): string {
    if (!machine) return '';
    return machine.metadata?.displayName || machine.metadata?.host || machine.id;
}

export function buildTaskItem(
    session: Session,
    machines: Record<string, Machine>,
    pinnedSessionIds: ReadonlySet<string>,
    unreadSessionIds: ReadonlySet<string>,
    now: number = Date.now(),
): TaskItem {
    const machineId = session.metadata?.machineId ?? null;
    const isOnline = isTaskOnline(session);
    return {
        sessionId: session.id,
        path: session.metadata?.path ?? null,
        machineId,
        machineName: machineId ? getMachineDisplayName(machines[machineId]) : null,
        state: getTaskRunState(session, now),
        goal: resolveVisibleAgentGoalStatus(session),
        updatedAt: session.updatedAt,
        createdAt: session.createdAt,
        isPinned: pinnedSessionIds.has(session.id),
        isOnline,
        isRunning: isTaskActive(session, unreadSessionIds, now),
        hasUnread: unreadSessionIds.has(session.id),
        draft: session.draft ?? null,
        hasPendingInput: hasPendingUserInput(session),
    };
}

/**
 * Build the two-section Task Center dataset.
 *
 * - Running tasks are sorted by active work state first, then in-progress
 *   goals, then most recent activity (updatedAt desc).
 * - Everything else is grouped by project path. Groups and their items are
 *   both sorted by most recent activity.
 */
export function buildTaskCenterData(
    sessions: readonly Session[],
    machines: Record<string, Machine>,
    pinnedSessionIds: readonly string[],
    unreadSessionIds: ReadonlySet<string> = new Set(),
    now: number = Date.now(),
): TaskCenterData {
    const pinned = new Set(pinnedSessionIds);
    const running: TaskItem[] = [];
    const pending: TaskItem[] = [];
    const remaining: TaskItem[] = [];

    for (const session of sessions) {
        const item = buildTaskItem(session, machines, pinned, unreadSessionIds, now);
        if (item.hasPendingInput) {
            // Unsubmitted input always pins the session at the bottom.
            pending.push(item);
        } else if (item.isRunning) {
            running.push(item);
        } else {
            remaining.push(item);
        }
    }

    // Goal-mode work is always first. Within each goal tier, active work stays
    // ahead of idle-but-recent/unread sessions, then recency breaks ties.
    running.sort((a, b) => {
        const aGoal = a.goal?.providerStatus === 'active' ? 1 : 0;
        const bGoal = b.goal?.providerStatus === 'active' ? 1 : 0;
        if (aGoal !== bGoal) return bGoal - aGoal;
        const statePriority: Record<TaskRunState, number> = {
            thinking: 0,
            permission_required: 1,
            tool: 2,
            streaming: 3,
            running: 4,
            idle: 5,
        };
        const aPriority = statePriority[a.state];
        const bPriority = statePriority[b.state];
        if (aPriority !== bPriority) return aPriority - bPriority;
        return b.updatedAt - a.updatedAt;
    });
    pending.sort((a, b) => b.updatedAt - a.updatedAt);

    const groupItems = (items: readonly TaskItem[]): TaskProjectGroup[] => {
        const groupMap = new Map<string, TaskProjectGroup>();
        for (const item of items) {
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
        const groups = Array.from(groupMap.values());
        for (const group of groups) {
            group.items.sort((a, b) => b.updatedAt - a.updatedAt);
        }
        groups.sort((a, b) => {
            const activityDelta = (b.items[0]?.updatedAt ?? 0) - (a.items[0]?.updatedAt ?? 0);
            return activityDelta || a.displayPath.localeCompare(b.displayPath);
        });
        return groups;
    };

    const projects = groupItems(remaining);
    const allProjects = groupItems([...running, ...pending, ...remaining]);

    return {
        running,
        pending,
        allProjects,
        projects,
        runningCount: running.length,
        pendingCount: pending.length,
        totalCount: sessions.length,
    };
}
