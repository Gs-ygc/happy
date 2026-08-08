import { describe, expect, it } from 'vitest';
import { buildActivityItems, getActivityRoute } from './activityItems';

const NOW = Date.UTC(2026, 7, 8, 12, 0, 0);

describe('Activity items', () => {
    it('keeps only unread sessions and sorts newest first', () => {
        const items = buildActivityItems([
            { sessionId: 'old', title: 'Older task', updatedAt: NOW - 48 * 60 * 60 * 1000, project: '/repo/a', machine: 'vps', summary: 'Completed' },
            { sessionId: 'new', title: 'New task', updatedAt: NOW - 60_000, project: '/repo/b', machine: 'laptop', summary: 'Permission required' },
            { sessionId: 'read', title: 'Read task', updatedAt: NOW, project: null, machine: null, summary: null },
        ], new Set(['old', 'new']), NOW);

        expect(items.map((item) => item.sessionId)).toEqual(['new', 'old']);
        expect(items.map((item) => item.section)).toEqual(['today', 'older']);
    });

    it('creates direct session and message routes', () => {
        expect(getActivityRoute({ sessionId: 's1', messageId: null })).toBe('/session/s1');
        expect(getActivityRoute({ sessionId: 's1', messageId: 'm1' })).toBe('/session/s1/message/m1');
    });

    it('uses a stable fallback summary for missing metadata', () => {
        const [item] = buildActivityItems([
            { sessionId: 's1', title: '', updatedAt: NOW, project: null, machine: null, summary: null },
        ], new Set(['s1']), NOW);
        expect(item).toMatchObject({ title: 'Session update', summary: 'New activity' });
    });
});
