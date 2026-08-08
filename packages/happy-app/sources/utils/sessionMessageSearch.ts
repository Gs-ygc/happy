import type { ApiMessage } from '@/sync/apiTypes';
import type { Message } from '@/sync/typesMessage';
import type { NormalizedMessage } from '@/sync/typesRaw';

export const SESSION_SEARCH_RESULT_LIMIT = 200;

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
        sourceMessageId: apiMessage.id,
        createdAt: apiMessage.createdAt,
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
