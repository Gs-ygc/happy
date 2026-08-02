import * as SecureStore from 'expo-secure-store';

const SUB2API_CONFIG_KEY = 'sub2api_usage_config';

function isWebRuntime(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined' && typeof localStorage !== 'undefined';
}

export type Sub2ApiConfig = {
    baseUrl: string;
    email: string;
    password: string;
};

export type Sub2ApiUser = {
    email?: string;
    balance?: number;
    frozen_balance?: number;
    total_recharged?: number;
};

export type Sub2ApiModelUsage = {
    model: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
    total_tokens: number;
    cost: number;
    actual_cost: number;
};

export type Sub2ApiDailyUsage = {
    date: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
    total_tokens: number;
    cost: number;
    actual_cost: number;
};

export type Sub2ApiAccount = {
    id: number;
    name: string;
    platform?: string;
    status?: string;
    schedulable?: boolean;
    rate_multiplier?: number;
    concurrency?: number;
    quota_daily_used?: number | null;
    quota_daily_limit?: number | null;
    quota_weekly_used?: number | null;
    quota_weekly_limit?: number | null;
    quota_monthly_used?: number | null;
    quota_monthly_limit?: number | null;
    session_window_status?: string;
    usage?: {
        requests: number;
        totalTokens: number;
        cost: number;
        actualCost: number;
    };
};

export type Sub2ApiUsage = {
    user: Sub2ApiUser;
    today: {
        requests: number;
        inputTokens: number;
        outputTokens: number;
        cacheCreationTokens: number;
        cacheReadTokens: number;
        totalTokens: number;
        cost: number;
        actualCost: number;
    };
    models: Sub2ApiModelUsage[];
    trend: Sub2ApiDailyUsage[];
    accounts: Sub2ApiAccount[];
    fetchedAt: number;
};

export type Sub2ApiPeriod = 'today' | '7d' | '30d' | 'all';

// Kept for the existing chart component and older callers.
export interface UsageDataPoint {
    timestamp: number;
    tokens: Record<string, number>;
    cost: Record<string, number>;
    reportCount: number;
}

export function calculateTotals(usage: UsageDataPoint[]): {
    totalTokens: number;
    totalCost: number;
    tokensByModel: Record<string, number>;
    costByModel: Record<string, number>;
} {
    const result = { totalTokens: 0, totalCost: 0, tokensByModel: {} as Record<string, number>, costByModel: {} as Record<string, number> };
    for (const point of usage) {
        for (const [model, value] of Object.entries(point.tokens)) {
            result.totalTokens += value;
            result.tokensByModel[model] = (result.tokensByModel[model] || 0) + value;
        }
        for (const [model, value] of Object.entries(point.cost)) {
            result.totalCost += value;
            result.costByModel[model] = (result.costByModel[model] || 0) + value;
        }
    }
    return result;
}

function normalizeBaseUrl(value: string): string {
    return value.trim().replace(/\/+$/, '');
}

function readEnvelope<T>(payload: unknown): T {
    if (payload && typeof payload === 'object' && 'code' in payload) {
        const envelope = payload as { code?: unknown; message?: unknown; data?: unknown };
        if (envelope.code !== 0) {
            throw new Error(typeof envelope.message === 'string' ? envelope.message : 'Sub2API request failed');
        }
        return envelope.data as T;
    }
    return payload as T;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'message' in payload
            && typeof payload.message === 'string'
            ? payload.message
            : `Sub2API request failed (${response.status})`;
        throw new Error(message);
    }
    return readEnvelope<T>(payload);
}

async function login(config: Sub2ApiConfig): Promise<string> {
    const data = await requestJson<{ access_token?: string }>(`${normalizeBaseUrl(config.baseUrl)}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: config.email.trim(), password: config.password }),
    });
    if (!data?.access_token) {
        throw new Error('Sub2API did not return an access token');
    }
    return data.access_token;
}

export function getSub2ApiDateRange(now = new Date(), days: number | 'all' = 7): { startDate: string; endDate: string } {
    const toDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const end = new Date(now);
    const start = new Date(now);
    if (days === 'all') {
        start.setFullYear(2000, 0, 1);
    } else {
        start.setDate(start.getDate() - Math.max(0, days - 1));
    }
    return { startDate: toDate(start), endDate: toDate(end) };
}

function getPeriodDays(period: Sub2ApiPeriod): number | 'all' {
    if (period === 'today') return 1;
    if (period === '7d') return 7;
    if (period === '30d') return 30;
    return 'all';
}

function getAccountStatsDays(period: Sub2ApiPeriod): number {
    const days = getPeriodDays(period);
    return days === 'all' ? 36500 : days;
}

function summarizeTrend(trend: Sub2ApiDailyUsage[]): Sub2ApiUsage['today'] {
    return trend.reduce((total, day) => ({
        requests: total.requests + day.requests,
        inputTokens: total.inputTokens + day.input_tokens,
        outputTokens: total.outputTokens + day.output_tokens,
        cacheCreationTokens: total.cacheCreationTokens + day.cache_creation_tokens,
        cacheReadTokens: total.cacheReadTokens + day.cache_read_tokens,
        totalTokens: total.totalTokens + day.total_tokens,
        cost: total.cost + day.cost,
        actualCost: total.actualCost + day.actual_cost,
    }), {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        cost: 0,
        actualCost: 0,
    });
}

function sanitizeAccount(account: Sub2ApiAccount): Sub2ApiAccount {
    return {
        id: account.id,
        name: account.name,
        platform: account.platform,
        status: account.status,
        schedulable: account.schedulable,
        rate_multiplier: account.rate_multiplier,
        concurrency: account.concurrency,
        quota_daily_used: account.quota_daily_used,
        quota_daily_limit: account.quota_daily_limit,
        quota_weekly_used: account.quota_weekly_used,
        quota_weekly_limit: account.quota_weekly_limit,
        quota_monthly_used: account.quota_monthly_used,
        quota_monthly_limit: account.quota_monthly_limit,
        session_window_status: account.session_window_status,
        usage: account.usage ? { ...account.usage } : undefined,
    };
}

export async function loadSub2ApiConfig(): Promise<Sub2ApiConfig | null> {
    try {
        const value = isWebRuntime()
            ? localStorage.getItem(SUB2API_CONFIG_KEY)
            : await SecureStore.getItemAsync(SUB2API_CONFIG_KEY);
        if (!value) return null;
        const parsed = JSON.parse(value) as Partial<Sub2ApiConfig>;
        if (!parsed.baseUrl || !parsed.email || !parsed.password) return null;
        return {
            baseUrl: normalizeBaseUrl(parsed.baseUrl),
            email: parsed.email,
            password: parsed.password,
        };
    } catch {
        return null;
    }
}

export async function saveSub2ApiConfig(config: Sub2ApiConfig): Promise<void> {
    const value = JSON.stringify({
        baseUrl: normalizeBaseUrl(config.baseUrl),
        email: config.email.trim(),
        password: config.password,
    });
    if (isWebRuntime()) {
        localStorage.setItem(SUB2API_CONFIG_KEY, value);
    } else {
        await SecureStore.setItemAsync(SUB2API_CONFIG_KEY, value);
    }
}

export async function clearSub2ApiConfig(): Promise<void> {
    if (isWebRuntime()) {
        localStorage.removeItem(SUB2API_CONFIG_KEY);
    } else {
        await SecureStore.deleteItemAsync(SUB2API_CONFIG_KEY);
    }
}

export function normalizeSub2ApiUsage(input: {
    user: Sub2ApiUser;
    stats: Record<string, number>;
    models: Sub2ApiModelUsage[];
    trend: Sub2ApiDailyUsage[];
    accounts?: Sub2ApiAccount[];
}, fetchedAt = Date.now()): Sub2ApiUsage {
    const stats = input.stats || {};
    return {
        user: input.user || {},
        today: {
            requests: stats.today_requests || 0,
            inputTokens: stats.today_input_tokens || 0,
            outputTokens: stats.today_output_tokens || 0,
            cacheCreationTokens: stats.today_cache_creation_tokens || 0,
            cacheReadTokens: stats.today_cache_read_tokens || 0,
            totalTokens: stats.today_tokens || 0,
            cost: stats.today_cost || 0,
            actualCost: stats.today_actual_cost ?? stats.today_cost ?? 0,
        },
        models: Array.isArray(input.models) ? input.models : [],
        trend: Array.isArray(input.trend) ? input.trend : [],
        accounts: Array.isArray(input.accounts) ? input.accounts.map(sanitizeAccount) : [],
        fetchedAt,
    };
}

export async function fetchSub2ApiUsage(config: Sub2ApiConfig, period: Sub2ApiPeriod = 'today'): Promise<Sub2ApiUsage> {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    const token = await login({ ...config, baseUrl });
    const headers = { Authorization: `Bearer ${token}` };
    const range = getSub2ApiDateRange(new Date(), getPeriodDays(period));
    const params = `?start_date=${encodeURIComponent(range.startDate)}&end_date=${encodeURIComponent(range.endDate)}`;

    const [user, stats, models, trend, accounts] = await Promise.all([
        requestJson<Sub2ApiUser>(`${baseUrl}/api/v1/auth/me`, { headers }),
        requestJson<Record<string, number>>(`${baseUrl}/api/v1/admin/dashboard/stats`, { headers }),
        requestJson<{ models?: Sub2ApiModelUsage[] }>(`${baseUrl}/api/v1/admin/dashboard/models${params}`, { headers }),
        requestJson<{ trend?: Sub2ApiDailyUsage[] }>(`${baseUrl}/api/v1/admin/dashboard/trend${params}&granularity=day`, { headers }),
        requestJson<{ items?: Sub2ApiAccount[] }>(`${baseUrl}/api/v1/admin/accounts?page=1&page_size=100`, { headers }),
    ]);

    const trendRows = trend?.trend || [];
    const accountItems = accounts?.items || [];
    const accountStats = await Promise.all(accountItems.map(async (account) => {
        try {
            const stats = await requestJson<{
                summary?: {
                    total_requests?: number;
                    total_tokens?: number;
                    total_cost?: number;
                    total_user_cost?: number;
                };
            }>(`${baseUrl}/api/v1/admin/accounts/${account.id}/stats?days=${getAccountStatsDays(period)}`, { headers });
            const summary = stats?.summary || {};
            const cost = summary.total_cost || summary.total_user_cost || 0;
            return [account.id, {
                requests: summary.total_requests || 0,
                totalTokens: summary.total_tokens || 0,
                cost,
                actualCost: cost,
            }] as const;
        } catch {
            return [account.id, null] as const;
        }
    }));
    const accountStatsById = new Map(accountStats);
    const accountsWithUsage = accountItems.map((account) => {
        const usage = accountStatsById.get(account.id);
        return usage ? { ...account, usage } : account;
    });
    const normalized = normalizeSub2ApiUsage({
        user,
        stats,
        models: models?.models || [],
        trend: trendRows,
        accounts: accountsWithUsage,
    });
    if (period !== 'today') {
        normalized.today = summarizeTrend(trendRows);
    }

    return normalized;
}
