export interface FileCacheEntry { content: string | null; diff: string | null; isBinary: boolean; cachedAt: number; }
export type FileCache = Record<string, Record<string, FileCacheEntry>>;

export function pruneFileCache(cache: FileCache, limits: { maxEntries?: number; maxCharacters?: number } = {}): FileCache {
    const maxEntries = limits.maxEntries ?? 24;
    const maxCharacters = limits.maxCharacters ?? 12 * 1024 * 1024;
    const entries = Object.entries(cache).flatMap(([sessionId, files]) => Object.entries(files).map(([filePath, entry]) => ({ sessionId, filePath, entry }))).sort((a, b) => b.entry.cachedAt - a.entry.cachedAt);
    const kept: typeof entries = [];
    let characters = 0;
    for (const item of entries) {
        const size = item.entry.content?.length ?? 0;
        if (kept.length >= maxEntries || (kept.length > 0 && characters + size > maxCharacters)) continue;
        kept.push(item); characters += size;
    }
    const next: FileCache = {};
    for (const { sessionId, filePath, entry } of kept) (next[sessionId] ??= {})[filePath] = entry;
    return next;
}

export function pruneHistoricalSessionCaches<T>(caches: Record<string, T>, updatedAt: Record<string, number>, protectedSessionIds: ReadonlySet<string>, maxHistorical = 8): Record<string, T> {
    const historical = Object.keys(caches).filter(id => !protectedSessionIds.has(id)).sort((a, b) => (updatedAt[b] ?? 0) - (updatedAt[a] ?? 0)).slice(0, maxHistorical);
    const keep = new Set([...protectedSessionIds, ...historical]);
    return Object.fromEntries(Object.entries(caches).filter(([id]) => keep.has(id)));
}
