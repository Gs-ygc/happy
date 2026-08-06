import { describe, expect, it } from 'vitest';
import { SIDEBAR_PANELS, formatSidebarUnreadCount } from './sidebarPanel';

describe('desktop sidebar panels', () => {
    it('keeps Tasks first so the desktop switch exposes the task center', () => {
        expect(SIDEBAR_PANELS.map((panel) => panel.key)).toEqual(['tasks', 'sessions']);
    });

    it('hides the unread badge when there is no unread session', () => {
        expect(formatSidebarUnreadCount(0)).toBeNull();
    });

    it('formats ordinary and large unread counts for the compact sidebar', () => {
        expect(formatSidebarUnreadCount(17)).toBe('17');
        expect(formatSidebarUnreadCount(120)).toBe('99+');
    });
});
