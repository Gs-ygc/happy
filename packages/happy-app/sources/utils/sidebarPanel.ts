export type SidebarPanel = 'tasks' | 'sessions';
export type HomeTab = SidebarPanel | 'settings';

export const SIDEBAR_PANELS: ReadonlyArray<{ key: SidebarPanel; icon: 'checkbox-outline' | 'list-outline' }> = [
    { key: 'tasks', icon: 'checkbox-outline' },
    { key: 'sessions', icon: 'list-outline' },
];

export function formatSidebarUnreadCount(count: number): string | null {
    if (count <= 0) return null;
    return count > 99 ? '99+' : String(count);
}

export function getDefaultHomeTab(platformOS: string): HomeTab {
    return platformOS === 'android' ? 'tasks' : 'sessions';
}
