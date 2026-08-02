import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/StyledText';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { Modal } from '@/modal';
import { t } from '@/text';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import {
    clearSub2ApiConfig,
    fetchSub2ApiUsage,
    loadSub2ApiConfig,
    saveSub2ApiConfig,
    type Sub2ApiConfig,
    type Sub2ApiPeriod,
    type Sub2ApiUsage,
} from '@/sync/apiUsage';

const sub2ApiText = {
    title: 'Sub2API 使用情况',
    description: '连接 Sub2API 账户，查看余额、今日用量、模型费用和近期趋势。',
    connect: '连接 Sub2API',
    edit: '编辑 Sub2API 连接',
    disconnect: '断开 Sub2API',
    endpoint: 'Sub2API 地址',
    endpointDescription: '输入 Sub2API 后台地址。',
    email: 'Sub2API 邮箱',
    emailDescription: '输入 Sub2API 后台账户邮箱。',
    password: 'Sub2API 密码',
    passwordDescription: '密码仅保存在设备安全存储中。',
    loadFailed: '无法加载 Sub2API 使用情况。',
    saveFailed: '无法保存 Sub2API 连接。',
    refresh: '刷新使用情况',
    balance: '可用余额',
    frozenBalance: '冻结余额',
    actualCost: '实际费用',
    standardCost: '标准费用',
    inputTokens: '输入 Token',
    outputTokens: '输出 Token',
    cacheTokens: '缓存 Token',
    requests: '请求数',
    recentDays: '近期每日用量',
    periodToday: '今日',
    period7d: '近 7 日',
    period30d: '近 30 日',
    periodAll: '全部',
    accounts: '中转账号与限额',
    noExplicitLimit: '未设置显式额度',
    daily: '日',
    weekly: '周',
    monthly: '月',
    accountActive: '可用',
    accountPaused: '已暂停',
    accountUnavailable: '不可用',
    accountUsage: '周期用量',
};

const styles = StyleSheet.create((theme) => ({
    container: { flex: 1 },
    content: { paddingBottom: 32 },
    hero: { padding: 20, margin: 16, borderRadius: 14, backgroundColor: theme.colors.surface },
    heroLabel: { color: theme.colors.textSecondary, fontSize: 13 },
    balance: { color: theme.colors.text, fontSize: 32, fontWeight: '700', marginTop: 4 },
    balanceMeta: { color: theme.colors.textSecondary, fontSize: 13, marginTop: 4 },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
    stat: { width: '48%', minHeight: 78, padding: 12, borderRadius: 10, backgroundColor: theme.colors.surface },
    statLabel: { color: theme.colors.textSecondary, fontSize: 12 },
    statValue: { color: theme.colors.text, fontSize: 18, fontWeight: '700', marginTop: 5 },
    statDetail: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 3 },
    modelRow: { paddingHorizontal: 16, paddingVertical: 12 },
    modelHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    modelName: { flex: 1, color: theme.colors.text, fontSize: 15, fontWeight: '600' },
    modelCost: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
    modelMeta: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 },
    toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    toolbarText: { color: theme.colors.textSecondary, fontSize: 12 },
    periodRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
    periodButton: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: theme.colors.surface },
    periodButtonActive: { backgroundColor: theme.colors.textLink },
    periodButtonText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
    periodButtonTextActive: { color: '#FFFFFF' },
    error: { alignItems: 'center', padding: 32, gap: 10 },
    errorText: { color: theme.colors.status.error, textAlign: 'center' },
    empty: { color: theme.colors.textSecondary, textAlign: 'center', padding: 20 },
}));

type MetricProps = { label: string; value: string; detail?: string };

function Metric({ label, value, detail }: MetricProps) {
    return <View style={styles.stat}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
        {detail ? <Text style={styles.statDetail}>{detail}</Text> : null}
    </View>;
}

function formatNumber(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return Math.round(value).toLocaleString();
}

function formatMoney(value: number): string {
    return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}

function formatQuota(used?: number | null, limit?: number | null): string {
    if (used == null && limit == null) return sub2ApiText.noExplicitLimit;
    const usedText = formatMoney(used || 0);
    return limit == null ? `${usedText} / ∞` : `${usedText} / ${formatMoney(limit)}`;
}

function accountStatusLabel(status?: string, schedulable?: boolean): string {
    if (status !== 'active') return sub2ApiText.accountUnavailable;
    return schedulable === false ? sub2ApiText.accountPaused : sub2ApiText.accountActive;
}

async function promptForConfig(current?: Sub2ApiConfig): Promise<Sub2ApiConfig | null> {
    const baseUrl = await Modal.prompt(
        sub2ApiText.endpoint,
        sub2ApiText.endpointDescription,
        { defaultValue: current?.baseUrl || 'https://subapi.boundlesslabs.tech', placeholder: 'https://subapi.example.com' },
    );
    if (!baseUrl) return null;
    const email = await Modal.prompt(sub2ApiText.email, sub2ApiText.emailDescription, {
        defaultValue: current?.email,
        inputType: 'email-address',
    });
    if (!email) return null;
    const password = await Modal.prompt(sub2ApiText.password, sub2ApiText.passwordDescription, {
        inputType: 'secure-text',
    });
    if (!password) return null;
    return { baseUrl, email, password };
}

export const UsagePanel: React.FC = () => {
    const { theme } = useUnistyles();
    const [config, setConfig] = React.useState<Sub2ApiConfig | null>(null);
    const [usage, setUsage] = React.useState<Sub2ApiUsage | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [period, setPeriod] = React.useState<Sub2ApiPeriod>('today');

    const load = React.useCallback(async (nextConfig?: Sub2ApiConfig | null, nextPeriod: Sub2ApiPeriod = period) => {
        const activeConfig = nextConfig === undefined ? await loadSub2ApiConfig() : nextConfig;
        setConfig(activeConfig);
        if (!activeConfig) {
            setUsage(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            setUsage(await fetchSub2ApiUsage(activeConfig, nextPeriod));
        } catch (cause) {
            setUsage(null);
            setError(cause instanceof Error ? cause.message : sub2ApiText.loadFailed);
        } finally {
            setLoading(false);
        }
    }, [period]);

    React.useEffect(() => { void load(undefined, period); }, [load, period]);

    const configure = React.useCallback(async () => {
        setSaving(true);
        try {
            const nextConfig = await promptForConfig(config || undefined);
            if (!nextConfig) return;
            await saveSub2ApiConfig(nextConfig);
            await load(nextConfig, period);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : sub2ApiText.saveFailed);
        } finally {
            setSaving(false);
        }
    }, [config, load, period]);

    const disconnect = React.useCallback(async () => {
        await clearSub2ApiConfig();
        setConfig(null);
        setUsage(null);
    }, []);

    if (!config) {
        return <View style={styles.error}>
            <Ionicons name="analytics-outline" size={48} color={theme.colors.textSecondary} />
            <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '600' }}>{sub2ApiText.title}</Text>
            <Text style={{ color: theme.colors.textSecondary, textAlign: 'center' }}>{sub2ApiText.description}</Text>
            <Item title={sub2ApiText.connect} onPress={configure} loading={saving} />
        </View>;
    }

    if (loading && !usage) {
        return <View style={styles.error}><ActivityIndicator size="large" color={theme.colors.textLink} /><Text style={{ color: theme.colors.textSecondary }}>{t('common.loading')}</Text></View>;
    }

    if (error && !usage) {
        return <View style={styles.error}>
            <Ionicons name="alert-circle-outline" size={44} color={theme.colors.status.error} />
            <Text style={styles.errorText}>{error}</Text>
            <Item title={t('common.retry')} onPress={() => void load(config)} />
            <Item title={sub2ApiText.edit} onPress={configure} />
        </View>;
    }

    const today = usage?.today;
    const models = [...(usage?.models || [])].sort((a, b) => b.actual_cost - a.actual_cost);
    const accounts = [...(usage?.accounts || [])].sort((a, b) => a.name.localeCompare(b.name));
    const periodLabel = period === 'today'
        ? sub2ApiText.periodToday
        : period === '7d'
            ? sub2ApiText.period7d
            : period === '30d'
                ? sub2ApiText.period30d
                : sub2ApiText.periodAll;
    return <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.toolbar}>
            <Text style={styles.toolbarText}>{config.email}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={sub2ApiText.refresh} onPress={() => void load(config)}>
                {loading ? <ActivityIndicator size="small" color={theme.colors.textLink} /> : <Ionicons name="refresh" size={20} color={theme.colors.textLink} />}
            </Pressable>
        </View>
        <View style={styles.periodRow}>
            {([
                ['today', sub2ApiText.periodToday],
                ['7d', sub2ApiText.period7d],
                ['30d', sub2ApiText.period30d],
                ['all', sub2ApiText.periodAll],
            ] as const).map(([key, label]) => (
                <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: period === key }} style={[styles.periodButton, period === key && styles.periodButtonActive]} onPress={() => setPeriod(key)}>
                    <Text style={[styles.periodButtonText, period === key && styles.periodButtonTextActive]}>{label}</Text>
                </Pressable>
            ))}
        </View>
        <View style={styles.hero}>
            <Text style={styles.heroLabel}>{sub2ApiText.balance}</Text>
            <Text style={styles.balance}>{formatMoney(usage?.user.balance || 0)}</Text>
            <Text style={styles.balanceMeta}>{sub2ApiText.frozenBalance}: {formatMoney(usage?.user.frozen_balance || 0)}</Text>
        </View>
        <ItemGroup title={sub2ApiText.accounts}>
            {accounts.length ? accounts.map((account) => (
                <View key={account.id} style={styles.modelRow}>
                    <View style={styles.modelHeader}>
                        <Text style={styles.modelName} numberOfLines={1}>{account.name}</Text>
                        <Text style={styles.modelCost}>{accountStatusLabel(account.status, account.schedulable)}</Text>
                    </View>
                    <Text style={styles.modelMeta}>
                        {sub2ApiText.daily} {formatQuota(account.quota_daily_used, account.quota_daily_limit)} · {sub2ApiText.weekly} {formatQuota(account.quota_weekly_used, account.quota_weekly_limit)}
                    </Text>
                    <Text style={styles.modelMeta}>
                        {sub2ApiText.monthly} {formatQuota(account.quota_monthly_used, account.quota_monthly_limit)} · {account.rate_multiplier ?? 1}x · {account.concurrency ?? 0} 并发
                    </Text>
                    {account.usage ? <Text style={styles.modelMeta}>
                        {sub2ApiText.accountUsage}: {formatMoney(account.usage.actualCost)} · {formatNumber(account.usage.requests)} {sub2ApiText.requests} · {formatNumber(account.usage.totalTokens)} {t('usage.tokens').toLowerCase()}
                    </Text> : null}
                </View>
            )) : <Text style={styles.empty}>{t('usage.noData')}</Text>}
        </ItemGroup>
        <ItemGroup title={periodLabel}>
            <View style={styles.statGrid}>
                <Metric label={sub2ApiText.requests} value={formatNumber(today?.requests || 0)} />
                <Metric label={sub2ApiText.actualCost} value={formatMoney(today?.actualCost || 0)} detail={`${sub2ApiText.standardCost}: ${formatMoney(today?.cost || 0)}`} />
                <Metric label={t('usage.totalTokens')} value={formatNumber(today?.totalTokens || 0)} detail={`${sub2ApiText.inputTokens}: ${formatNumber(today?.inputTokens || 0)}`} />
                <Metric label={sub2ApiText.outputTokens} value={formatNumber(today?.outputTokens || 0)} detail={`${sub2ApiText.cacheTokens}: ${formatNumber((today?.cacheCreationTokens || 0) + (today?.cacheReadTokens || 0))}`} />
            </View>
        </ItemGroup>
        <ItemGroup title={t('usage.byModel')}>
            {models.length ? models.map((model) => <View key={model.model} style={styles.modelRow}>
                <View style={styles.modelHeader}><Text style={styles.modelName}>{model.model}</Text><Text style={styles.modelCost}>{formatMoney(model.actual_cost)}</Text></View>
                <Text style={styles.modelMeta}>{formatNumber(model.requests)} {sub2ApiText.requests} · {formatNumber(model.total_tokens)} {t('usage.tokens').toLowerCase()} · {sub2ApiText.standardCost} {formatMoney(model.cost)}</Text>
            </View>) : <Text style={styles.empty}>{t('usage.noData')}</Text>}
        </ItemGroup>
        <ItemGroup title={sub2ApiText.recentDays}>
            {usage?.trend?.length ? usage.trend.slice().reverse().map((day) => <View key={day.date} style={styles.modelRow}>
                <View style={styles.modelHeader}><Text style={styles.modelName}>{day.date}</Text><Text style={styles.modelCost}>{formatMoney(day.actual_cost)}</Text></View>
                <Text style={styles.modelMeta}>{formatNumber(day.requests)} {sub2ApiText.requests} · {formatNumber(day.total_tokens)} {t('usage.tokens').toLowerCase()}</Text>
            </View>) : <Text style={styles.empty}>{t('usage.noData')}</Text>}
        </ItemGroup>
        <ItemGroup>
            <Item title={sub2ApiText.edit} onPress={configure} loading={saving} />
            <Item title={sub2ApiText.disconnect} onPress={disconnect} destructive />
        </ItemGroup>
    </ScrollView>;
};
