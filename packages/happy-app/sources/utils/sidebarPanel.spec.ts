import { describe, expect, it } from 'vitest';
import { SIDEBAR_PANELS, formatSidebarUnreadCount, getDefaultHomeTab } from './sidebarPanel';
import { localSettingsParse } from '@/sync/localSettings';

describe('desktop sidebar panels', () => {
    it('keeps Tasks first so the desktop switch exposes the task center', () => {
        expect(SIDEBAR_PANELS.map((panel) => panel.key)).toEqual(['tasks', 'sessions']);
    });

    it('opens Tasks first on Android while preserving the existing default elsewhere', () => {
        expect(getDefaultHomeTab('android')).toBe('tasks');
        expect(getDefaultHomeTab('web')).toBe('sessions');
        expect(getDefaultHomeTab('ios')).toBe('sessions');
    });

    it('persists the desktop sidebar panel locally with Tasks as the default', () => {
        expect(localSettingsParse({}).sidebarPanel).toBe('tasks');
        expect(localSettingsParse({ sidebarPanel: 'sessions' }).sidebarPanel).toBe('sessions');
    });

    it('hides the unread badge when there is no unread session', () => {
        expect(formatSidebarUnreadCount(0)).toBeNull();
    });

    it('formats ordinary and large unread counts for the compact sidebar', () => {
        expect(formatSidebarUnreadCount(17)).toBe('17');
        expect(formatSidebarUnreadCount(120)).toBe('99+');
    });
});
