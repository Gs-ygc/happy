import { describe, expect, it } from 'vitest';
import type { ApiMessage } from '@/sync/apiTypes';
import type { NormalizedMessage } from '@/sync/typesRaw';
import {
    createSessionMessageSearchResult,
    findDisplayItemIndexForMessage,
    findLoadedSessionMessageSearchResults,
    findLoadedMessageForSearchResult,
    getSearchLocationResolution,
    getSearchScrollRecovery,
    getNormalizedMessageSearchText,
    mapWithConcurrency,
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

    it('uses normalized message identity so a search result can reopen its rendered message', () => {
        const normalized = {
            id: 'inner-envelope-id',
            localId: null,
            createdAt: 5678,
            role: 'agent',
            content: [
                { type: 'text', text: 'The deployment finished', uuid: 'a', parentUUID: null },
            ],
            isSidechain: false,
        } satisfies NormalizedMessage;

        expect(createSessionMessageSearchResult(apiMessage, normalized, 'deployment')).toMatchObject({
            seq: 42,
            sourceMessageId: 'inner-envelope-id',
            createdAt: 5678,
        });
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

    it('moves a virtualized list near an unmeasured search result before retrying', () => {
        expect(getSearchScrollRecovery({
            averageItemLength: 84,
            highestMeasuredFrameIndex: 9,
            index: 120,
        }, 0)).toEqual({
            kind: 'retry',
            offset: 10080,
            delayMs: 160,
            nextAttempt: 1,
        });
    });

    it('stops retrying an unreachable search result so the UI can report failure', () => {
        expect(getSearchScrollRecovery({
            averageItemLength: 84,
            highestMeasuredFrameIndex: 30,
            index: 120,
        }, 3)).toEqual({ kind: 'failed' });
    });

    it('waits briefly for a loaded message to enter the rendered list', () => {
        expect(getSearchLocationResolution(false, 0)).toEqual({
            kind: 'retry',
            delayMs: 160,
            nextAttempt: 1,
        });
        expect(getSearchLocationResolution(true, 1)).toEqual({ kind: 'ready' });
    });

    it('reports failure when a loaded message never becomes renderable', () => {
        expect(getSearchLocationResolution(false, 3)).toEqual({ kind: 'failed' });
    });

    it('finds loaded visible messages immediately and deduplicates source records', () => {
        const results = findLoadedSessionMessageSearchResults([
            { kind: 'agent-text', id: 'thinking', sourceMessageId: 'source-thinking', localId: null, createdAt: 40, text: 'deploy secret plan', isThinking: true },
            { kind: 'agent-text', id: 'agent-new', sourceMessageId: 'source-agent', localId: null, createdAt: 30, text: 'Deploy completed successfully' },
            { kind: 'agent-text', id: 'agent-duplicate', sourceMessageId: 'source-agent', localId: null, createdAt: 29, text: 'Deploy duplicate block' },
            { kind: 'user-text', id: 'user', sourceMessageId: 'source-user', localId: null, createdAt: 20, text: 'Please deploy production' },
            { kind: 'user-text', id: 'unmatched', sourceMessageId: 'source-unmatched', localId: null, createdAt: 10, text: 'Unrelated text' },
        ], 'DEPLOY');

        expect(results).toEqual([
            {
                seq: 0,
                sourceMessageId: 'source-agent',
                createdAt: 30,
                role: 'agent',
                text: 'Deploy completed successfully',
                preview: 'Deploy completed successfully',
            },
            {
                seq: 0,
                sourceMessageId: 'source-user',
                createdAt: 20,
                role: 'user',
                text: 'Please deploy production',
                preview: 'Please deploy production',
            },
        ]);
    });

    it('maps work with bounded concurrency while preserving input order', async () => {
        let active = 0;
        let peakActive = 0;
        const values = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
            active += 1;
            peakActive = Math.max(peakActive, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active -= 1;
            return value * 10;
        });

        expect(values).toEqual([10, 20, 30, 40, 50]);
        expect(peakActive).toBe(2);
    });
});
