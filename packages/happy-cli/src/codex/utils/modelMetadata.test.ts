import { describe, expect, it } from 'vitest';
import type { CodexModel } from '../codexAppServerTypes';
import { toMetadataModels } from './modelMetadata';

function model(overrides: Partial<CodexModel>): CodexModel {
    return {
        id: 'gpt-default',
        model: 'gpt-default',
        displayName: 'GPT Default',
        description: '',
        hidden: false,
        isDefault: false,
        defaultReasoningEffort: 'medium',
        supportedReasoningEfforts: ['medium'],
        ...overrides,
    };
}

describe('toMetadataModels', () => {
    it('maps visible Codex models into session metadata', () => {
        expect(toMetadataModels([
            model({ id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', description: 'Agentic coding' }),
            model({ id: 'hidden-model', hidden: true }),
            model({ id: 'gpt-fallback', displayName: '', description: '' }),
        ])).toEqual([
            { code: 'gpt-5.6-sol', value: 'GPT-5.6 Sol', description: 'Agentic coding' },
            { code: 'gpt-fallback', value: 'gpt-fallback', description: null },
        ]);
    });
});
