import * as React from 'react';
import { ActivityIndicator, Pressable, SectionList, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useRouter } from 'expo-router';
import { useAllMachines, useAllSessions, useUnreadSessionIds, storage } from '@/sync/storage';
import type { Session } from '@/sync/storageTypes';
import { useIsTablet } from '@/utils/responsive';
import { Header } from './navigation/Header';
import { Typography } from '@/constants/Typography';
import { layout } from './layout';
import { t } from '@/text';
import { getSessionName } from '@/utils/sessionUtils';
import { resolveVisibleAgentGoalStatus } from './agentGoalStatus';
import { getGoalProgressText } from './AgentGoalBar';
import { buildActivityItems, getActivityRoute, type ActivityItem } from '@/utils/activityItems';

const styles = StyleSheet.create((theme) => ({
    container: { flex: 1, backgroundColor: theme.colors.groupped.background },
    headerTitle: { fontSize: 17, color: theme.colors.header.tint, ...Typography.default('semiBold') },
    headerAction: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    section: { paddingTop: 18, paddingBottom: 6, paddingHorizontal: 16, fontSize: 13, color: theme.colors.textSecondary, ...Typography.default('semiBold'), textTransform: 'uppercase' },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.divider },
    rowPressed: { backgroundColor: theme.colors.surfacePressed },
    icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceHigh },
    rowBody: { flex: 1, minWidth: 0 },
    title: { color: theme.colors.text, fontSize: 15, ...Typography.default('semiBold') },
    subtitle: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 3, ...Typography.default() },
    summary: { color: theme.colors.text, fontSize: 13, marginTop: 5, ...Typography.default() },
    time: { color: theme.colors.textSecondary, fontSize: 11, alignSelf: 'flex-start', ...Typography.default() },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyTitle: { color: theme.colors.text, fontSize: 20, textAlign: 'center', ...Typography.default('semiBold') },
    emptyDescription: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, ...Typography.default() },
    emptyButton: { marginTop: 18, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9, backgroundColor: theme.colors.surfaceHigh },
    emptyButtonText: { color: theme.colors.textLink, fontSize: 14, ...Typography.default('semiBold') },
}));

function formatRelativeTime(timestamp: number, now: number): string {
    const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
    if (minutes < 1) return t('time.justNow');
    if (minutes < 60) return t('time.minutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('time.hoursAgo', { count: hours });
    return t('time.daysAgo', { count: Math.floor(hours / 24) });
}

function activityForSession(session: Session): { summary: string; icon: keyof typeof Ionicons.glyphMap; color: string } {
    const goal = resolveVisibleAgentGoalStatus(session);
    if (goal) {
        const progress = getGoalProgressText(goal);
        return { summary: progress ? `${goal.text} · ${progress}` : goal.text, icon: 'locate-outline', color: '#5856D6' };
    }
    if (session.agentState?.requests && Object.keys(session.agentState.requests).length > 0) {
        return { summary: t('taskCenter.statusPermission'), icon: 'hand-left-outline', color: '#FF9500' };
    }
    if (session.thinking) {
        return { summary: t('taskCenter.statusThinking'), icon: 'sparkles-outline', color: '#007AFF' };
    }
    if (session.metadata?.summary?.text?.trim()) {
        return { summary: session.metadata.summary.text.trim(), icon: 'chatbubble-ellipses-outline', color: '#34C759' };
    }
    return { summary: t('activity.newActivity'), icon: 'pulse-outline', color: '#34C759' };
}

function ActivityRow({ item, onPress }: { item: ActivityItem; onPress: () => void }) {
    const { theme } = useUnistyles();
    const session = storage.getState().sessions[item.sessionId];
    const details = session ? activityForSession(session) : { summary: item.summary, icon: 'pulse-outline' as const, color: theme.colors.textLink };
    const subtitle = [item.project, item.machine].filter(Boolean).join(' · ');
    const now = Date.now();
    return (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.title}: ${details.summary}`} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <View style={[styles.icon, { backgroundColor: `${details.color}22` }]}>
                <Ionicons name={details.icon} size={18} color={details.color} />
            </View>
            <View style={styles.rowBody}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
                <Text style={styles.summary} numberOfLines={2}>{details.summary}</Text>
            </View>
            <Text style={styles.time}>{formatRelativeTime(item.updatedAt, now)}</Text>
        </Pressable>
    );
}

export const ActivityView = React.memo(() => {
    const { theme } = useUnistyles();
    const router = useRouter();
    const isTablet = useIsTablet();
    const sessions = useAllSessions();
    const machines = useAllMachines({ includeOffline: true });
    const unreadSessionIds = useUnreadSessionIds();
    const now = Date.now();
    const machineNames = React.useMemo(() => new Map(machines.map((machine) => [machine.id, machine.metadata?.displayName || machine.metadata?.host || machine.id])), [machines]);
    const items = React.useMemo(() => buildActivityItems(sessions.map((session) => ({
        sessionId: session.id,
        title: getSessionName(session),
        updatedAt: session.updatedAt,
        project: session.metadata?.path ?? null,
        machine: session.metadata?.machineId ? machineNames.get(session.metadata.machineId) ?? session.metadata.machineId : null,
        summary: session.metadata?.summary?.text ?? null,
    })), unreadSessionIds, now), [sessions, unreadSessionIds, machineNames, now]);
    const handlePress = React.useCallback((item: ActivityItem) => {
        storage.getState().markSessionRead(item.sessionId);
        router.push(getActivityRoute(item) as never);
    }, [router]);
    const renderItem = React.useCallback(({ item }: { item: ActivityItem }) => <ActivityRow item={item} onPress={() => handlePress(item)} />, [handlePress]);
    const sections = React.useMemo(() => items.filter((item) => item.section === 'today').length > 0 && items.some((item) => item.section === 'older') ? [{ title: t('activity.today'), data: items.filter((item) => item.section === 'today') }, { title: t('activity.older'), data: items.filter((item) => item.section === 'older') }] : [{ title: items.some((item) => item.section === 'today') ? t('activity.today') : t('activity.older'), data: items }], [items]);

    if (sessions.length === 0) {
        return <View style={styles.container}><View style={styles.empty}><ActivityIndicator color={theme.colors.textSecondary} /></View></View>;
    }

    return (
        <View style={styles.container}>
            {isTablet ? <Header title={<Text style={styles.headerTitle}>{t('activity.title')}</Text>} headerLeft={() => null} headerRight={() => (
                <Pressable onPress={() => storage.getState().markAllSessionsRead()} accessibilityRole="button" accessibilityLabel={t('activity.markAllRead')} style={styles.headerAction}>
                    <Ionicons name="checkmark-done-outline" size={21} color={theme.colors.header.tint} />
                </Pressable>
            )} headerShadowVisible={false} headerTransparent={true} /> : null}
            {items.length === 0 ? (
                <View style={styles.empty}>
                    <Ionicons name="pulse-outline" size={42} color={theme.colors.textSecondary} />
                    <Text style={styles.emptyTitle}>{t('activity.emptyTitle')}</Text>
                    <Text style={styles.emptyDescription}>{t('activity.emptyDescription')}</Text>
                    <Pressable onPress={() => router.push('/')} style={styles.emptyButton} accessibilityRole="button"><Text style={styles.emptyButtonText}>{t('tabs.tasks')}</Text></Pressable>
                </View>
            ) : (
                <SectionList sections={sections} keyExtractor={(item) => item.sessionId} renderItem={renderItem} renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>} contentContainerStyle={{ maxWidth: layout.maxWidth, width: '100%', alignSelf: 'center', paddingBottom: 24 }} />
            )}
        </View>
    );
});
