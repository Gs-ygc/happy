import { describe, expect, it } from 'vitest';
import { pruneFileCache, pruneHistoricalSessionCaches } from './performanceCache';

describe('pruneFileCache', () => {
    it('keeps the newest entries within both count and character budgets', () => {
        const cache = {
            s1: {
                old: { content: 'a'.repeat(8), diff: null, isBinary: false, cachedAt: 1 },
                middle: { content: 'b'.repeat(8), diff: null, isBinary: false, cachedAt: 2 },
            },
            s2: {
                newest: { content: 'c'.repeat(8), diff: null, isBinary: false, cachedAt: 3 },
            },
        };

        expect(pruneFileCache(cache, { maxEntries: 2, maxCharacters: 16 })).toEqual({
            s1: { middle: cache.s1.middle },
            s2: { newest: cache.s2.newest },
        });
    });
});

describe('pruneHistoricalSessionCaches', () => {
    it('retains protected sessions and only the newest historical caches', () => {
        const caches = { current: 1, unread: 2, old: 3, recent: 4 };
        const updatedAt = { current: 1, unread: 2, old: 10, recent: 20 };

        expect(pruneHistoricalSessionCaches(caches, updatedAt, new Set(['current', 'unread']), 1)).toEqual({
            current: 1,
            unread: 2,
            recent: 4,
        });
    });
});
