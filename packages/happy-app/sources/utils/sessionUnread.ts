import type { SessionState } from './sessionUtils';

/** Unread is a history marker and must not hide a live state needing attention. */
export function unreadMayOverride(state: SessionState): boolean {
    return state === 'waiting' || state === 'disconnected';
}
