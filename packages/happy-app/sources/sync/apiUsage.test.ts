import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
import { normalizeSub2ApiUsage } from './apiUsage';

describe('normalizeSub2ApiUsage', () => {
    it('maps Sub2API dashboard fields into the mobile usage view', () => {
        const result = normalizeSub2ApiUsage({
            user: { balance: 12.5, frozen_balance: 1 },
            stats: {
                today_requests: 9,
                today_input_tokens: 10,
                today_output_tokens: 11,
                today_cache_creation_tokens: 12,
                today_cache_read_tokens: 13,
                today_tokens: 46,
                today_cost: 1.2,
                today_actual_cost: 0.8,
            },
            models: [{ model: 'gpt-5.6-sol', requests: 9, input_tokens: 10, output_tokens: 11, cache_creation_tokens: 12, cache_read_tokens: 13, total_tokens: 46, cost: 1.2, actual_cost: 0.8 }],
            trend: [{ date: '2026-08-02', requests: 9, input_tokens: 10, output_tokens: 11, cache_creation_tokens: 12, cache_read_tokens: 13, total_tokens: 46, cost: 1.2, actual_cost: 0.8 }],
        }, 123);

        expect(result).toEqual({
            user: { balance: 12.5, frozen_balance: 1 },
            today: {
                requests: 9,
                inputTokens: 10,
                outputTokens: 11,
                cacheCreationTokens: 12,
                cacheReadTokens: 13,
                totalTokens: 46,
                cost: 1.2,
                actualCost: 0.8,
            },
            models: [{ model: 'gpt-5.6-sol', requests: 9, input_tokens: 10, output_tokens: 11, cache_creation_tokens: 12, cache_read_tokens: 13, total_tokens: 46, cost: 1.2, actual_cost: 0.8 }],
            trend: [{ date: '2026-08-02', requests: 9, input_tokens: 10, output_tokens: 11, cache_creation_tokens: 12, cache_read_tokens: 13, total_tokens: 46, cost: 1.2, actual_cost: 0.8 }],
            fetchedAt: 123,
        });
    });
});
