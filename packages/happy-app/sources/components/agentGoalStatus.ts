import type { AgentGoalStatus, Session } from '@/sync/storageTypes';

export type VisibleAgentGoalStatus = {
    status: 'active';
    source: AgentGoalStatus['source'];
    observedAt: number;
    sourceSessionId: string;
    sourceRevision?: string | number;
    text: string;
    providerStatus: 'active' | 'paused' | 'blocked' | 'usageLimited' | 'budgetLimited';
    capabilities?: {
        clear?: boolean;
        edit?: boolean;
        pause?: boolean;
        resume?: boolean;
    };
    progress?: Extract<AgentGoalStatus, { status: 'active' }>['progress'];
};

type GoalSession = Pick<Session, 'agentState' | 'presence' | 'metadata'>;

function expectedSourceSessionId(session: GoalSession, source: AgentGoalStatus['source']): string | null {
    if (source === 'claude') {
        return session.metadata?.claudeSessionId ?? null;
    }
    if (source === 'codex') {
        return session.metadata?.codexThreadId ?? null;
    }
    return null;
}

function sourceIdentityMatches(session: GoalSession, goal: { source: AgentGoalStatus['source']; sourceSessionId: string }): boolean {
    const expected = expectedSourceSessionId(session, goal.source);
    return expected !== null
        && typeof goal.sourceSessionId === 'string'
        && goal.sourceSessionId.trim().length > 0
        && goal.sourceSessionId === expected;
}

export function resolveVisibleAgentGoalStatus(session: GoalSession): VisibleAgentGoalStatus | null {
    if (session.presence !== 'online') {
        return null;
    }

    const legacy = session.agentState?.agentGoalStatus;
    const detailed = session.agentState?.agentGoalStatusV2;
    const visibleLegacy = legacy?.status === 'active' && sourceIdentityMatches(session, legacy)
        ? {
            ...legacy,
            providerStatus: legacy.progress?.state ?? 'active' as const,
            capabilities: legacy.capabilities
                ? {
                    clear: legacy.capabilities.clear,
                    edit: legacy.capabilities.edit,
                }
                : undefined,
        }
        : null;
    const visibleDetailed = detailed?.status === 'active' && sourceIdentityMatches(session, detailed)
        ? detailed
        : null;

    if (visibleDetailed && (!visibleLegacy || visibleDetailed.observedAt >= visibleLegacy.observedAt)) {
        return visibleDetailed;
    }

    return visibleLegacy;
}
