import type { AgentGoalProviderStatus, AgentGoalStatus, AgentGoalStatusV2 } from '@/api/types';
import type { ThreadGoal } from './codexAppServerTypes';

type CodexGoalEvent = Record<string, unknown>;
type AgentGoalCapabilities = NonNullable<Extract<AgentGoalStatus, { status: 'active' }>['capabilities']>;
type AgentGoalCapabilitiesV2 = NonNullable<Extract<AgentGoalStatusV2, { status: 'active' }>['capabilities']>;

type CodexGoalStatusBase = {
    source: 'codex';
    observedAt: number;
    sourceSessionId: string;
    sourceRevision?: string | number;
};

export type CodexGoalCommand =
    | { type: 'set'; objective: string }
    | { type: 'set-status'; status: 'active' | 'paused' }
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

export function codexGoalActionCapabilities(
    supported: boolean,
    providerStatus: AgentGoalProviderStatus = 'active',
): AgentGoalCapabilitiesV2 | undefined {
    if (!supported) return undefined;
    return {
        clear: true,
        edit: true,
        ...(providerStatus === 'active' ? { pause: true } : {}),
        ...(providerStatus === 'paused' ? { resume: true } : {}),
    };
}

function legacyCapabilities(capabilities: AgentGoalCapabilitiesV2 | undefined): AgentGoalCapabilities | undefined {
    if (!capabilities) return undefined;
    return {
        ...(capabilities.clear !== undefined ? { clear: capabilities.clear } : {}),
        ...(capabilities.edit !== undefined ? { edit: capabilities.edit } : {}),
    };
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
    opts?: { capabilities?: AgentGoalCapabilitiesV2 },
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
        ...(opts?.capabilities ? { capabilities: legacyCapabilities(opts.capabilities) } : {}),
    };
}

export function mapCodexGoalEventToAgentGoalStatusV2(
    message: CodexGoalEvent,
    currentThreadId?: string | null,
    opts?: { capabilities?: AgentGoalCapabilitiesV2 },
): AgentGoalStatusV2 | null {
    const legacy = mapCodexGoalEventToAgentGoalStatus(message, currentThreadId, opts);
    if (!legacy) return null;
    if (legacy.status !== 'active') {
        return { ...legacy, version: 2 };
    }

    const providerStatus = legacy.progress?.state ?? 'active';
    return {
        ...legacy,
        version: 2,
        providerStatus,
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
    if (objective.toLowerCase() === 'pause') {
        return { type: 'set-status', status: 'paused' };
    }
    if (objective.toLowerCase() === 'resume') {
        return { type: 'set-status', status: 'active' };
    }

    return { type: 'set', objective };
}

export async function consumeCodexGoalCommandText(
    text: string,
    execute: (command: CodexGoalCommand) => Promise<void>,
    onError?: (error: unknown) => void,
): Promise<boolean> {
    const command = parseCodexGoalCommand(text);
    if (!command) return false;

    try {
        await execute(command);
    } catch (error) {
        onError?.(error);
    }
    return true;
}

export function reportCodexGoalCommandError(
    error: unknown,
    reportLocal: (message: string) => void,
    reportSession: (message: string) => void,
): void {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `Goal action failed: ${detail}`;
    reportLocal(message);
    reportSession(message);
}

export function createCodexGoalMutationQueue(): <T>(operation: () => Promise<T>) => Promise<T> {
    let tail: Promise<void> = Promise.resolve();
    return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = tail.then(operation, operation);
        tail = result.then(() => undefined, () => undefined);
        return result;
    };
}

export function parseCodexGoalActionParams(params: Record<string, unknown>): CodexGoalCommand | null {
    if (params.action === 'clear') {
        return { type: 'clear' };
    }

    if (params.action === 'edit') {
        const objective = nonEmptyString(params.objective);
        return objective ? { type: 'set', objective } : null;
    }

    if (params.action === 'pause') {
        return { type: 'set-status', status: 'paused' };
    }

    if (params.action === 'resume') {
        return { type: 'set-status', status: 'active' };
    }

    return null;
}
