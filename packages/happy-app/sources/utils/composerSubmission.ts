import type { Session } from '@/sync/storageTypes';

type ComposerSessionState = Pick<Session, 'thinking' | 'agentState'>;

export function isSessionTurnBusy(session: ComposerSessionState): boolean {
    return session.thinking
        || Boolean(session.agentState?.requests && Object.keys(session.agentState.requests).length > 0);
}
