import type { ApiMessage } from '@/sync/apiTypes';
import type { Message } from '@/sync/typesMessage';
import type { NormalizedMessage } from '@/sync/typesRaw';

export const SESSION_SEARCH_RESULT_LIMIT = 200;
const SEARCH_SCROLL_MAX_RETRIES = 3;
const SEARCH_SCROLL_RETRY_DELAY_MS = 160;

export type SessionMessageSearchResult = {
    seq: number;
    sourceMessageId: string;
    createdAt: number;
    role: 'user' | 'agent';
    text: string;
    preview: string;
};

export function normalizeSessionSearchText(value: string): string {
    return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function getNormalizedMessageSearchText(message: NormalizedMessage): string | null {
    const blocks = getNormalizedMessageSearchBlocks(message);
    return blocks.length > 0 ? blocks.join('\n') : null;
}

function getNormalizedMessageSearchBlocks(message: NormalizedMessage): string[] {
    if (message.isSidechain) {
        return [];
    }
    if (message.role === 'user') {
        const text = normalizeSessionSearchText(message.content.text);
        return text ? [text] : [];
    }
    if (message.role !== 'agent') {
        return [];
    }

    return message.content
        .filter((content): content is Extract<typeof content, { type: 'text' }> => content.type === 'text')
        .map((content) => content.text)
        .map(normalizeSessionSearchText)
        .filter((text) => text.length > 0);
}

type SearchDisplayItem =
    | { type: 'message'; message: { id: string } }
    | { type: 'tool-group' | 'agent-work-group'; id: string; messages: readonly { id: string }[] };

export function findDisplayItemIndexForMessage(
    items: readonly SearchDisplayItem[],
    messageId: string,
): { index: number; groupId: string | null } | null {
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item.type === 'message') {
            if (item.message.id === messageId) {
                return { index, groupId: null };
            }
            continue;
        }
        if (item.messages.some((message) => message.id === messageId)) {
            return { index, groupId: item.id };
        }
    }
    return null;
}

export function findLoadedSessionMessageSearchResults(
    messages: readonly Message[],
    query: string,
): SessionMessageSearchResult[] {
    const normalizedQuery = normalizeSessionSearchText(query).toLocaleLowerCase();
    if (!normalizedQuery) return [];

    const seenSourceMessageIds = new Set<string>();
    const results: SessionMessageSearchResult[] = [];
    for (const message of messages) {
        if (message.kind !== 'user-text' && message.kind !== 'agent-text') continue;
        if (message.kind === 'agent-text' && message.isThinking) continue;

        const text = normalizeSessionSearchText(message.text);
        const matchIndex = text.toLocaleLowerCase().indexOf(normalizedQuery);
        if (matchIndex < 0) continue;

        const sourceMessageId = message.sourceMessageId ?? message.id;
        if (seenSourceMessageIds.has(sourceMessageId)) continue;
        seenSourceMessageIds.add(sourceMessageId);
        results.push({
            seq: 0,
            sourceMessageId,
            createdAt: message.createdAt,
            role: message.kind === 'user-text' ? 'user' : 'agent',
            text,
            preview: buildSearchPreview(text, matchIndex, normalizedQuery.length),
        });
    }
    return results;
}

export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>,
    shouldStop: () => boolean = () => false,
): Promise<R[]> {
    const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
    const completed = new Map<number, R>();
    let nextIndex = 0;

    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (!shouldStop()) {
            const index = nextIndex;
            if (index >= items.length) return;
            nextIndex += 1;
            completed.set(index, await worker(items[index], index));
        }
    }));

    return [...completed.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, value]) => value);
}

export function mergeGlobalSessionMessageSearchResults<
    T extends SessionMessageSearchResult & { sessionId: string },
>(
    current: readonly T[],
    incoming: readonly T[],
    limit: number,
    sourceTruncated = false,
): { results: T[]; truncated: boolean } {
    const merged = new Map<string, T>();
    for (const result of [...current, ...incoming]) {
        const key = `${result.sessionId}:${result.sourceMessageId}`;
        if (!merged.has(key)) {
            merged.set(key, result);
        }
    }
    const sorted = [...merged.values()].sort((left, right) => right.createdAt - left.createdAt);
    return {
        results: sorted.slice(0, Math.max(0, limit)),
        truncated: sourceTruncated || sorted.length > limit,
    };
}

export function shouldPublishSearchProgress(signal?: AbortSignal): boolean {
    return !signal?.aborted;
}

export type SearchScrollFailureInfo = {
    averageItemLength: number;
    highestMeasuredFrameIndex: number;
    index: number;
};

export type SearchScrollRecovery =
    | { kind: 'retry'; offset: number; delayMs: number; nextAttempt: number }
    | { kind: 'failed' };

export type SearchLocationResolution =
    | { kind: 'ready' }
    | { kind: 'retry'; delayMs: number; nextAttempt: number }
    | { kind: 'failed' };

export function getSearchLocationResolution(
    found: boolean,
    attempt: number,
): SearchLocationResolution {
    if (found) {
        return { kind: 'ready' };
    }
    if (attempt >= SEARCH_SCROLL_MAX_RETRIES) {
        return { kind: 'failed' };
    }
    return {
        kind: 'retry',
        delayMs: SEARCH_SCROLL_RETRY_DELAY_MS,
        nextAttempt: attempt + 1,
    };
}

export function getSearchScrollRecovery(
    info: SearchScrollFailureInfo,
    attempt: number,
): SearchScrollRecovery {
    if (attempt >= SEARCH_SCROLL_MAX_RETRIES) {
        return { kind: 'failed' };
    }

    const averageItemLength = Number.isFinite(info.averageItemLength) && info.averageItemLength > 0
        ? info.averageItemLength
        : 72;
    return {
        kind: 'retry',
        offset: Math.max(0, Math.round(averageItemLength * info.index)),
        delayMs: SEARCH_SCROLL_RETRY_DELAY_MS,
        nextAttempt: attempt + 1,
    };
}

export function createSessionMessageSearchResult(
    apiMessage: ApiMessage,
    message: NormalizedMessage,
    query: string,
): SessionMessageSearchResult | null {
    const normalizedQuery = normalizeSessionSearchText(query).toLocaleLowerCase();
    if (!normalizedQuery) return null;

    const role = message.role === 'user' || message.role === 'agent' ? message.role : null;
    if (!role) return null;

    let matchingText: string | null = null;
    let matchIndex = -1;
    for (const text of getNormalizedMessageSearchBlocks(message)) {
        const index = text.toLocaleLowerCase().indexOf(normalizedQuery);
        if (index >= 0) {
            matchingText = text;
            matchIndex = index;
            break;
        }
    }
    if (!matchingText || matchIndex < 0) return null;

    return {
        seq: apiMessage.seq,
        sourceMessageId: message.id,
        createdAt: message.createdAt,
        role,
        text: matchingText,
        preview: buildSearchPreview(matchingText, matchIndex, normalizedQuery.length),
    };
}

export function findLoadedMessageForSearchResult(
    messages: readonly Message[],
    result: SessionMessageSearchResult,
    query: string,
): string | null {
    const normalizedQuery = normalizeSessionSearchText(query).toLocaleLowerCase();
    if (!normalizedQuery) return null;

    for (const message of messages) {
        if (message.sourceMessageId === result.sourceMessageId) {
            if (message.kind !== 'user-text' && message.kind !== 'agent-text') continue;
            if (message.kind === 'agent-text' && message.isThinking) continue;
            if (result.role === 'user' && message.kind !== 'user-text') continue;
            if (result.role === 'agent' && message.kind !== 'agent-text') continue;
            return message.id;
        }
    }

    for (const message of messages) {
        if (message.createdAt !== result.createdAt) continue;
        if (message.kind !== 'user-text' && message.kind !== 'agent-text') continue;
        if (result.role === 'user' && message.kind !== 'user-text') continue;
        if (result.role === 'agent' && message.kind !== 'agent-text') continue;
        const text = normalizeSessionSearchText(message.text).toLocaleLowerCase();
        if (text.includes(normalizedQuery)) {
            return message.id;
        }
    }
    return null;
}

function buildSearchPreview(text: string, matchIndex: number, matchLength: number): string {
    const context = 72;
    const start = Math.max(0, matchIndex - context);
    const end = Math.min(text.length, matchIndex + matchLength + context);
    return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`;
}
