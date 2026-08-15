import { describe, expect, it } from 'vitest';
import { unreadMayOverride } from './sessionUnread';

describe('unreadMayOverride', () => {
    it('keeps live states visible', () => {
        expect(unreadMayOverride('thinking')).toBe(false);
        expect(unreadMayOverride('permission_required')).toBe(false);
    });

    it('shows unread once a session is waiting or disconnected', () => {
        expect(unreadMayOverride('waiting')).toBe(true);
        expect(unreadMayOverride('disconnected')).toBe(true);
    });
});
