import type { AgentGoalStatus } from '@/api/types';
import type { ThreadGoal } from './codexAppServerTypes';

type CodexGoalEvent = Record<string, unknown>;
type AgentGoalCapabilities = NonNullable<Extract<AgentGoalStatus, { status: 'active' }>['capabilities']>;

type CodexGoalStatusBase = {
    source: 'codex';
    observedAt: number;
    sourceSessionId: string;
    sourceRevision?: string | number;
};

export type CodexGoalCommand =
    | { type: 'set'; objective: string }
    | { type: 'clear' };

export type CodexGoalProgressSnapshot = {
    state?: string;
    tokensUsed?: number;
    tokenBudget?: number | null;
    timeUsedSeconds?: number;
};

const ACTIVE_CODEX_GOAL_STATUSES = new Set([
    'active',
    'paused',
    'blocked',
    'usageLimited',
    'budgetLimited',
]);

function nonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function goalRecord(value: unknown): (ThreadGoal & Record<string, unknown>) | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as ThreadGoal & Record<string, unknown>
        : null;
}

export function codexGoalActionCapabilities(supported: boolean): AgentGoalCapabilities | undefined {
    return supported ? { clear: true, edit: true } : undefined;
}

function eventThreadId(message: CodexGoalEvent): string | null {
    const goal = goalRecord(message.goal);
    return nonEmptyString(message.threadId)
        ?? nonEmptyString(message.thread_id)
        ?? nonEmptyString(goal?.threadId)
        ?? nonEmptyString(goal?.thread_id);
}

function baseStatus(threadId: string, sourceRevision?: string | number): CodexGoalStatusBase {
    return {
        source: 'codex',
        observedAt: Date.now(),
        sourceSessionId: threadId,
        ...(sourceRevision !== undefined ? { sourceRevision } : {}),
    };
}

export function mapCodexGoalEventToAgentGoalStatus(
    message: CodexGoalEvent,
    currentThreadId?: string | null,
    opts?: { capabilities?: AgentGoalCapabilities },
): AgentGoalStatus | null {
    if (message.type !== 'thread_goal_updated' && message.type !== 'thread_goal_cleared') {
        return null;
    }

    const threadId = eventThreadId(message) ?? currentThreadId ?? null;
    if (!threadId) {
        return null;
    }
    if (currentThreadId && threadId !== currentThreadId) {
        return null;
    }

    if (message.type === 'thread_goal_cleared') {
        return {
            ...baseStatus(threadId),
            status: 'inactive',
            reason: 'cleared',
        };
    }

    const goal = goalRecord(message.goal);
    if (!goal) {
        return {
            ...baseStatus(threadId),
            status: 'unavailable',
            reason: 'malformed',
        };
    }

    const objective = nonEmptyString(goal.objective);
    const sourceRevision = finiteNumber(goal.updatedAt) ?? undefined;
    const status = nonEmptyString(goal.status);

    if (status === 'complete') {
        return {
            ...baseStatus(threadId, sourceRevision),
            status: 'inactive',
            reason: 'completed',
        };
    }

    if (!status || !ACTIVE_CODEX_GOAL_STATUSES.has(status) || !objective) {
        return {
            ...baseStatus(threadId, sourceRevision),
            status: 'unavailable',
            reason: 'malformed',
        };
    }

    const tokensUsed = finiteNumber(goal.tokensUsed);
    const tokenBudget = finiteNumber(goal.tokenBudget);
    const timeUsedSeconds = finiteNumber(goal.timeUsedSeconds);

    return {
        ...baseStatus(threadId, sourceRevision),
        status: 'active',
        text: objective,
        progress: {
            state: status as 'active' | 'paused' | 'blocked' | 'usageLimited' | 'budgetLimited',
            ...(tokensUsed !== null ? { tokensUsed } : {}),
            ...(tokenBudget !== null ? { tokenBudget } : {}),
            ...(timeUsedSeconds !== null ? { timeUsedSeconds } : {}),
        },
        ...(opts?.capabilities ? { capabilities: opts.capabilities } : {}),
    };
}

export function getCodexGoalProgressSnapshot(status: AgentGoalStatus): CodexGoalProgressSnapshot | null {
    if (status.status !== 'active') return null;
    return {
        state: status.progress?.state,
        tokensUsed: status.progress?.tokensUsed,
        tokenBudget: status.progress?.tokenBudget,
        timeUsedSeconds: status.progress?.timeUsedSeconds,
    };
}

export function shouldNotifyCodexGoalProgress(
    previous: CodexGoalProgressSnapshot,
    next: CodexGoalProgressSnapshot,
    elapsedMs: number,
): boolean {
    if (previous.state !== next.state) {
        return true;
    }

    if (elapsedMs < 10 * 60 * 1000) {
        return false;
    }

    const tokenThreshold = next.tokenBudget
        ? Math.max(1_000, next.tokenBudget * 0.1)
        : 10_000;
    const tokenDelta = next.tokensUsed !== undefined && previous.tokensUsed !== undefined
        ? next.tokensUsed - previous.tokensUsed
        : 0;
    const timeDelta = next.timeUsedSeconds !== undefined && previous.timeUsedSeconds !== undefined
        ? next.timeUsedSeconds - previous.timeUsedSeconds
        : 0;

    return tokenDelta >= tokenThreshold || timeDelta >= 15 * 60;
}

function compactCount(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    return String(value);
}

export function formatCodexGoalProgressNotification(status: AgentGoalStatus): string | null {
    if (status.status !== 'active') return null;

    const parts = [status.text];
    const progress = status.progress;
    if (progress?.state && progress.state !== 'active') {
        parts.push(progress.state.replace(/([A-Z])/g, ' $1').toLowerCase());
    }
    if (progress?.tokensUsed !== undefined) {
        parts.push(progress.tokenBudget
            ? `${compactCount(progress.tokensUsed)}/${compactCount(progress.tokenBudget)} tokens`
            : `${compactCount(progress.tokensUsed)} tokens`);
    }
    if (progress?.timeUsedSeconds !== undefined) {
        parts.push(`${Math.max(0, Math.floor(progress.timeUsedSeconds / 60))}m elapsed`);
    }
    return parts.join(' · ').slice(0, 500);
}

export function parseCodexGoalCommand(text: string): CodexGoalCommand | null {
    const trimmed = text.trim();
    const match = trimmed.match(/^\/goal(?:\s+([\s\S]+))?$/i);
    if (!match) {
        return null;
    }

    const objective = match[1]?.trim() ?? '';
    if (!objective) {
        return null;
    }

    if (objective.toLowerCase() === 'clear') {
        return { type: 'clear' };
    }

    return { type: 'set', objective };
}

export function parseCodexGoalActionParams(params: Record<string, unknown>): CodexGoalCommand | null {
    if (params.action === 'clear') {
        return { type: 'clear' };
    }

    if (params.action === 'edit') {
        const objective = nonEmptyString(params.objective);
        return objective ? { type: 'set', objective } : null;
    }

    return null;
}
