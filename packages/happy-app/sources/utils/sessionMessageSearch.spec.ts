import { describe, expect, it } from 'vitest';
import type { ApiMessage } from '@/sync/apiTypes';
import type { NormalizedMessage } from '@/sync/typesRaw';
import {
    createSessionMessageSearchResult,
    findDisplayItemIndexForMessage,
    findLoadedMessageForSearchResult,
    getNormalizedMessageSearchText,
    normalizeSessionSearchText,
} from './sessionMessageSearch';

const apiMessage = {
    id: 'api-1',
    seq: 42,
    localId: null,
    createdAt: 1234,
    updatedAt: 1234,
    content: { t: 'encrypted', c: 'ciphertext' },
} as ApiMessage;

describe('sessionMessageSearch', () => {
    it('normalizes whitespace and compatibility characters', () => {
        expect(normalizeSessionSearchText('  hello\n\tworld  ')).toBe('hello world');
        expect(normalizeSessionSearchText('ＡＢＣ')).toBe('ABC');
    });

    it('searches user and agent text without indexing internal events', () => {
        const user = {
            id: 'raw-user',
            localId: null,
            createdAt: 1234,
            role: 'user',
            content: { type: 'text', text: 'Find the deployment command' },
            isSidechain: false,
        } satisfies NormalizedMessage;
        const agent = {
            id: 'raw-agent',
            localId: null,
            createdAt: 1234,
            role: 'agent',
            content: [
                { type: 'thinking', thinking: 'private reasoning', uuid: 't', parentUUID: null },
                { type: 'text', text: 'Use systemctl restart happy', uuid: 'a', parentUUID: null },
            ],
            isSidechain: false,
        } satisfies NormalizedMessage;

        expect(getNormalizedMessageSearchText(user)).toBe('Find the deployment command');
        expect(getNormalizedMessageSearchText(agent)).toBe('Use systemctl restart happy');
        expect(createSessionMessageSearchResult(apiMessage, agent, 'SYSTEMCTL')?.seq).toBe(42);
        expect(createSessionMessageSearchResult(apiMessage, agent, 'private reasoning')).toBeNull();
        expect(getNormalizedMessageSearchText({ ...agent, isSidechain: true })).toBeNull();

        const separateAgentBlocks = {
            ...agent,
            content: [
                { type: 'text', text: 'first block', uuid: 'a', parentUUID: null },
                { type: 'text', text: 'second block', uuid: 'b', parentUUID: null },
            ],
        } satisfies NormalizedMessage;
        expect(createSessionMessageSearchResult(apiMessage, separateAgentBlocks, 'block second')).toBeNull();
    });

    it('finds the rendered message after the target page is loaded', () => {
        const result = {
            seq: 42,
            sourceMessageId: 'api-1',
            createdAt: 1234,
            role: 'agent' as const,
            text: 'Use systemctl restart happy',
            preview: 'Use systemctl restart happy',
        };
        expect(findLoadedMessageForSearchResult([
            { kind: 'agent-text', id: 'rendered-1', localId: null, createdAt: 1234, text: 'Use systemctl restart happy' },
        ], result, 'restart')).toBe('rendered-1');
    });

    it('prefers an exact source message id match over fuzzy timestamp/text matching', () => {
        const result = {
            seq: 42,
            sourceMessageId: 'api-1',
            createdAt: 1234,
            role: 'agent' as const,
            text: 'Use systemctl restart happy',
            preview: 'Use systemctl restart happy',
        };
        expect(findLoadedMessageForSearchResult([
            { kind: 'agent-text', id: 'decoy', sourceMessageId: 'api-other', localId: null, createdAt: 1234, text: 'Use systemctl restart happy' },
            { kind: 'agent-text', id: 'target', sourceMessageId: 'api-1', localId: null, createdAt: 9999, text: 'completely different text' },
        ], result, 'restart')).toBe('target');
    });

    it('locates direct messages and messages inside collapsed groups', () => {
        const direct = { kind: 'user-text', id: 'direct', localId: null, createdAt: 3, text: 'hello' } as const;
        const nested = { kind: 'agent-text', id: 'nested', localId: null, createdAt: 2, text: 'result' } as const;
        const items = [
            { type: 'message', id: direct.id, message: direct },
            {
                type: 'agent-work-group',
                id: 'work-1',
                messages: [nested],
                hasRunning: false,
                hasPendingPermission: false,
                startedAt: 1,
                completedAt: 2,
            },
        ] as const;

        expect(findDisplayItemIndexForMessage(items, 'direct')).toEqual({ index: 0, groupId: null });
        expect(findDisplayItemIndexForMessage(items, 'nested')).toEqual({ index: 1, groupId: 'work-1' });
        expect(findDisplayItemIndexForMessage(items, 'missing')).toBeNull();
    });
});
