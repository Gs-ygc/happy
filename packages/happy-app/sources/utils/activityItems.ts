export type ActivitySection = 'today' | 'older';

export interface ActivitySource {
    sessionId: string;
    title: string;
    updatedAt: number;
    project: string | null;
    machine: string | null;
    summary: string | null;
    messageId?: string | null;
}

export interface ActivityItem extends ActivitySource {
    title: string;
    summary: string;
    section: ActivitySection;
    messageId: string | null;
}

export function buildActivityItems(
    sources: readonly ActivitySource[],
    unreadSessionIds: ReadonlySet<string>,
    now: number = Date.now(),
): ActivityItem[] {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const todayTimestamp = startOfToday.getTime();

    return sources
        .filter((source) => unreadSessionIds.has(source.sessionId))
        .map((source) => ({
            ...source,
            title: source.title.trim() || 'Session update',
            summary: source.summary?.trim() || 'New activity',
            messageId: source.messageId ?? null,
            section: source.updatedAt >= todayTimestamp ? 'today' as const : 'older' as const,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActivityRoute(item: Pick<ActivityItem, 'sessionId' | 'messageId'>): string {
    return item.messageId
        ? `/session/${encodeURIComponent(item.sessionId)}/message/${encodeURIComponent(item.messageId)}`
        : `/session/${encodeURIComponent(item.sessionId)}`;
}
