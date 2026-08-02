import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
import { getSub2ApiDateRange, normalizeSub2ApiUsage } from './apiUsage';

describe('getSub2ApiDateRange', () => {
    it('returns an inclusive local date range', () => {
        expect(getSub2ApiDateRange(new Date(2026, 7, 2), 7)).toEqual({
            startDate: '2026-07-27',
            endDate: '2026-08-02',
        });
        expect(getSub2ApiDateRange(new Date(2026, 7, 2), 'all')).toEqual({
            startDate: '2000-01-01',
            endDate: '2026-08-02',
        });
    });
});

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
            accounts: [{ id: 1, name: 'PPToken', status: 'active', quota_daily_used: 2, quota_daily_limit: 10, credentials: { api_key: 'must not persist' } } as any],
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
            accounts: [{ id: 1, name: 'PPToken', status: 'active', quota_daily_used: 2, quota_daily_limit: 10 }],
            fetchedAt: 123,
        });
    });
});
