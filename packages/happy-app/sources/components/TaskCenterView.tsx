import * as React from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/text';
import {
    storage,
    useAllMachines,
    useAllSessions,
    useLocalSetting,
    useLocalSettingMutable,
    useSessions,
    useUnreadSessionIds,
} from '@/sync/storage';
import type { Machine, Session } from '@/sync/storageTypes';
import { sessionAbort, sessionArchive, sessionKill } from '@/sync/ops';
import { sync } from '@/sync/sync';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useSessionActionAlert } from '@/hooks/useSessionQuickActions';
import { maybeCleanupWorktree } from '@/hooks/useWorktreeCleanup';
import { getSessionName } from '@/utils/sessionUtils';
import { getGoalProgressText } from './AgentGoalBar';
import { StatusDot } from './StatusDot';
import { layout } from './layout';
import {
    buildTaskCenterData,
    filterCollapsedProjects,
    type TaskItem,
    type TaskProjectGroup,
    type TaskRunState,
} from '@/utils/taskCenterData';

const STATUS_CONFIG: Record<TaskRunState, { color: string; isPulsing: boolean }> = {
    thinking: { color: '#007AFF', isPulsing: true },
    permission_required: { color: '#FF9500', isPulsing: true },
    running: { color: '#34C759', isPulsing: false },
};
const PENDING_COLOR = '#FF9F0A';

function getStatusText(state: TaskRunState): string {
    switch (state) {
        case 'thinking':
            return t('taskCenter.statusThinking');
        case 'permission_required':
            return t('taskCenter.statusPermission');
        case 'running':
            return t('taskCenter.statusRunning');
    }
}

type Row =
    | { kind: 'running-header'; count: number }
    | { kind: 'empty-running' }
    | { kind: 'all-header'; count: number }
    | { kind: 'group-header'; group: TaskProjectGroup }
    | { kind: 'pending-header'; count: number }
    | { kind: 'task'; item: TaskItem };

const SectionHeader = React.memo(({ title, count }: { title: string; count: number }) => {
    const { theme } = useUnistyles();
    return (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <View style={[styles.sectionCountBadge, { backgroundColor: theme.colors.surfaceHigh }]}>
                <Text style={styles.sectionCountText}>{count}</Text>
            </View>
        </View>
    );
});

const GroupHeader = React.memo(({ group, collapsed, onToggle }: {
    group: TaskProjectGroup;
    collapsed: boolean;
    onToggle: () => void;
}) => {
    const { theme } = useUnistyles();
    return (
        <Pressable
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityLabel={collapsed ? t('taskCenter.expandGroup') : t('taskCenter.collapseGroup')}
            style={({ pressed }) => [styles.groupHeader, pressed && { backgroundColor: theme.colors.surfacePressed }]}
        >
            <Ionicons name={collapsed ? 'chevron-forward' : 'chevron-down'} size={15} color={theme.colors.textSecondary} />
            <View style={styles.groupHeaderText}>
                <Text style={styles.groupTitle} numberOfLines={1}>
                    {group.displayPath || t('taskCenter.otherProjects')}
                </Text>
                {group.machineName ? (
                    <Text style={styles.groupSubtitle} numberOfLines={1}>
                        {group.machineName}
                    </Text>
                ) : null}
            </View>
            <Text style={styles.groupCount}>{group.items.length}</Text>
        </Pressable>
    );
});

const TaskRow = React.memo(({ item, name, onPress, onSubmitDraft }: {
    item: TaskItem;
    name: string;
    onPress: () => void;
    onSubmitDraft?: (item: TaskItem) => void;
}) => {
    const { theme } = useUnistyles();
    const showActionAlert = useSessionActionAlert(item.sessionId);
    const [pinnedIds, setPinnedIds] = useLocalSettingMutable('pinnedSessionIds');
    const [archiving, setArchiving] = React.useState(false);
    const isPinned = pinnedIds.includes(item.sessionId);

    const togglePin = React.useCallback(() => {
        if (isPinned) {
            setPinnedIds(pinnedIds.filter((id) => id !== item.sessionId));
        } else {
            setPinnedIds([item.sessionId, ...pinnedIds]);
        }
    }, [isPinned, pinnedIds, item.sessionId, setPinnedIds]);

    const archive = React.useCallback(() => {
        if (archiving) return;
        setArchiving(true);
        void (async () => {
            try {
                await maybeCleanupWorktree(item.sessionId, item.path ?? undefined, item.machineId ?? undefined);
                // Try to kill the CLI process; if it's already dead, force-archive via server
                const killResult = await sessionKill(item.sessionId);
                if (!killResult.success) {
                    await sessionArchive(item.sessionId);
                }
                await sync.refreshSessions();
            } finally {
                setArchiving(false);
            }
        })();
    }, [archiving, item]);

    const status = item.hasPendingInput
        ? { color: PENDING_COLOR, isPulsing: false }
        : item.isRunning
            ? STATUS_CONFIG[item.state]
            : { color: '#999999', isPulsing: false };
    const progressText = item.goal ? getGoalProgressText(item.goal) : null;
    const tokenProgress = item.goal?.progress?.tokenBudget
        ? Math.min(1, (item.goal.progress.tokensUsed ?? 0) / item.goal.progress.tokenBudget)
        : null;
    const pathBasename = item.path ? item.path.split(/[/\\]/).filter(Boolean).pop() : null;

    return (
        <Pressable
            onPress={onPress}
            onLongPress={showActionAlert}
            accessibilityRole="button"
            accessibilityLabel={name}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.colors.surfacePressed }]}
        >
            <View style={styles.rowDot}>
                <StatusDot color={status.color} isPulsing={status.isPulsing} />
            </View>
            <View style={styles.rowBody}>
                <View style={styles.rowTitleRow}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                        {name}
                    </Text>
                    {item.isPinned && (
                        <Ionicons name="pin" size={12} color={theme.colors.textSecondary} style={styles.rowPin} />
                    )}
                </View>
                <Text style={[styles.rowStatus, { color: status.color }]} numberOfLines={1}>
                    {item.hasPendingInput
                        ? t('taskCenter.statusPending') + (pathBasename ? ' · ' + pathBasename : '')
                        : item.isRunning
                            ? getStatusText(item.state) + (pathBasename ? ' · ' + pathBasename : '')
                            : item.isOnline
                                ? (pathBasename ? pathBasename + ' · ' + t('taskCenter.statusIdle') : t('taskCenter.statusIdle'))
                                : (pathBasename || t('status.offline'))}
                </Text>
                {item.hasPendingInput && item.draft ? (
                    <Text style={styles.draftPreview} numberOfLines={1}>
                        {item.draft.replace(/\s+/g, ' ').trim()}
                    </Text>
                ) : null}
                {item.goal ? (
                    <View style={styles.goalContainer}>
                        <Text style={styles.goalText} numberOfLines={1}>
                            {item.goal.text}
                        </Text>
                        {progressText ? (
                            <Text style={styles.goalProgress} numberOfLines={1}>
                                {progressText}
                            </Text>
                        ) : null}
                        {tokenProgress !== null ? (
                            <View style={styles.progressTrack}>
                                <View
                                    style={[
                                        styles.progressFill,
                                        { width: `${Math.round(tokenProgress * 100)}%` },
                                    ]}
                                />
                            </View>
                        ) : null}
                    </View>
                ) : null}
            </View>
            <View style={styles.rowActions}>
                {item.hasPendingInput && onSubmitDraft ? (
                    <Pressable
                        onPress={() => onSubmitDraft(item)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t('taskCenter.forceSubmit')}
                        style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: theme.colors.surfacePressed }]}
                    >
                        <Ionicons name="send" size={16} color={PENDING_COLOR} />
                    </Pressable>
                ) : null}
                <Pressable
                    onPress={togglePin}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={isPinned ? t('session.unpin') : t('session.pin')}
                    style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: theme.colors.surfacePressed }]}
                >
                    <Ionicons
                        name={isPinned ? 'pin' : 'pin-outline'}
                        size={16}
                        color={isPinned ? theme.colors.textLink : theme.colors.textSecondary}
                    />
                </Pressable>
                <Pressable
                    onPress={archive}
                    hitSlop={8}
                    disabled={archiving}
                    accessibilityRole="button"
                    accessibilityLabel={t('sessionInfo.archiveSession')}
                    style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: theme.colors.surfacePressed }]}
                >
                    {archiving ? (
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    ) : (
                        <Ionicons name="archive-outline" size={16} color={theme.colors.textSecondary} />
                    )}
                </Pressable>
            </View>
        </Pressable>
    );
});

export function TaskCenterView() {
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const sessions = useAllSessions();
    const sessionsReady = useSessions() !== null;
    const machines = useAllMachines({ includeOffline: true });
    const unreadSessionIds = useUnreadSessionIds();
    const pinnedSessionIds = useLocalSetting('pinnedSessionIds');
    const [collapsedKeys, setCollapsedKeys] = useLocalSettingMutable('collapsedTaskProjectKeys');
    const navigateToSession = useNavigateToSession();

    const machinesById = React.useMemo(() => {
        const map: Record<string, Machine> = {};
        for (const machine of machines) {
            map[machine.id] = machine;
        }
        return map;
    }, [machines]);

    const sessionById = React.useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

    const data = React.useMemo(
        () => buildTaskCenterData(sessions, machinesById, pinnedSessionIds, unreadSessionIds),
        [sessions, machinesById, pinnedSessionIds, unreadSessionIds],
    );

    const forceSubmitDraft = React.useCallback((item: TaskItem) => {
        const draft = item.draft;
        if (!draft?.trim()) return;
        void (async () => {
            try {
                // Interrupt the running turn first so the draft is processed
                // immediately instead of waiting for the agent to finish.
                const session = storage.getState().sessions[item.sessionId];
                const isWorking = !!session && (
                    session.thinking
                    || (session.agentState?.requests && Object.keys(session.agentState.requests).length > 0)
                );
                if (isWorking) {
                    try {
                        await sessionAbort(item.sessionId);
                    } catch (error) {
                        console.log('Force submit: abort unavailable, sending anyway:', error);
                    }
                }
                await sync.sendMessage(item.sessionId, draft, { source: 'chat' });
                storage.getState().updateSessionDraft(item.sessionId, null);
            } catch (error) {
                console.error('Force submit failed:', error);
            }
        })();
    }, []);

    const visibleProjects = React.useMemo(
        () => filterCollapsedProjects(data.projects, collapsedKeys),
        [data.projects, collapsedKeys],
    );

    const toggleGroup = React.useCallback((key: string) => {
        setCollapsedKeys(
            collapsedKeys.includes(key)
                ? collapsedKeys.filter((k) => k !== key)
                : [...collapsedKeys, key],
        );
    }, [collapsedKeys, setCollapsedKeys]);

    const rows = React.useMemo(() => {
        const list: Row[] = [];
        list.push({ kind: 'running-header', count: data.runningCount });
        if (data.running.length === 0) {
            list.push({ kind: 'empty-running' });
        }
        for (const item of data.running) {
            list.push({ kind: 'task', item });
        }
        list.push({ kind: 'all-header', count: data.projects.reduce((n, group) => n + group.items.length, 0) });
        const collapsed = new Set(collapsedKeys);
        for (const group of visibleProjects) {
            list.push({ kind: 'group-header', group });
            if (!collapsed.has(group.key)) {
                for (const item of group.items) {
                    list.push({ kind: 'task', item });
                }
            }
        }
        if (data.pending.length > 0) {
            list.push({ kind: 'pending-header', count: data.pendingCount });
            for (const item of data.pending) {
                list.push({ kind: 'task', item });
            }
        }
        return list;
    }, [data, visibleProjects, collapsedKeys]);

    const keyExtractor = React.useCallback((row: Row) => {
        switch (row.kind) {
            case 'running-header': return 'running-header';
            case 'empty-running': return 'empty-running';
            case 'all-header': return 'all-header';
            case 'group-header': return 'group-' + row.group.key;
            case 'pending-header': return 'pending-header';
            case 'task': return 'task-' + row.item.sessionId;
        }
    }, []);

    const renderItem = React.useCallback(({ item }: { item: Row }) => {
        switch (item.kind) {
            case 'running-header':
                return <SectionHeader title={t('taskCenter.running')} count={item.count} />;
            case 'empty-running':
                return <Text style={styles.emptyRunningText}>{t('taskCenter.noRunning')}</Text>;
            case 'all-header':
                return <SectionHeader title={t('taskCenter.all')} count={item.count} />;
            case 'group-header':
                return (
                    <GroupHeader
                        group={item.group}
                        collapsed={collapsedKeys.includes(item.group.key)}
                        onToggle={() => toggleGroup(item.group.key)}
                    />
                );
            case 'pending-header':
                return <SectionHeader title={t('taskCenter.pending')} count={item.count} />;
            case 'task': {
                const session = sessionById.get(item.item.sessionId);
                return (
                    <TaskRow
                        item={item.item}
                        name={session ? getSessionName(session) : item.item.sessionId}
                        onPress={() => navigateToSession(item.item.sessionId)}
                        onSubmitDraft={forceSubmitDraft}
                    />
                );
            }
        }
    }, [collapsedKeys, toggleGroup, sessionById, navigateToSession]);

    if (!sessionsReady) {
        return <View style={styles.container} />;
    }

    if (data.totalCount === 0) {
        return (
            <View style={[styles.container, styles.emptyContainer]}>
                <Ionicons name="checkbox-outline" size={44} color={theme.colors.textSecondary} />
                <Text style={styles.emptyTitle}>{t('taskCenter.noTasks')}</Text>
                <Text style={styles.emptyDescription}>{t('taskCenter.noTasksDescription')}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={rows}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                contentContainerStyle={[
                    styles.listContent,
                    { paddingBottom: insets.bottom + 24 },
                ]}
                windowSize={5}
                maxToRenderPerBatch={10}
                initialNumToRender={14}
            />
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
    },
    listContent: {
        maxWidth: layout.maxWidth,
        width: '100%',
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 18,
        paddingBottom: 6,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: theme.colors.text,
    },
    sectionCountBadge: {
        borderRadius: 10,
        minWidth: 22,
        height: 20,
        paddingHorizontal: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionCountText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    emptyRunningText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        paddingVertical: 10,
        paddingLeft: 4,
    },
    groupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 6,
        borderRadius: 10,
        gap: 8,
        marginTop: 6,
    },
    groupHeaderText: {
        flex: 1,
        minWidth: 0,
    },
    groupTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text,
    },
    groupSubtitle: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 1,
    },
    groupCount: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        fontWeight: '600',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 6,
        borderRadius: 10,
        gap: 10,
    },
    rowDot: {
        width: 14,
        alignItems: 'center',
    },
    rowBody: {
        flex: 1,
        minWidth: 0,
    },
    rowTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    rowTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: theme.colors.text,
        flexShrink: 1,
    },
    rowPin: {
        marginLeft: 5,
    },
    rowStatus: {
        fontSize: 12,
        marginTop: 1,
    },
    draftPreview: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 2,
        fontStyle: 'italic',
    },
    goalContainer: {
        marginTop: 5,
        backgroundColor: theme.colors.surfaceHigh,
        borderColor: theme.colors.divider,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    goalText: {
        fontSize: 13,
        color: theme.colors.text,
        fontWeight: '500',
    },
    goalProgress: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    progressTrack: {
        height: 3,
        borderRadius: 2,
        backgroundColor: theme.colors.divider,
        marginTop: 6,
        overflow: 'hidden',
    },
    progressFill: {
        height: 3,
        borderRadius: 2,
        backgroundColor: theme.colors.button.secondary.tint,
    },
    rowActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    iconButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 8,
    },
    emptyTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: theme.colors.text,
        marginTop: 8,
    },
    emptyDescription: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        lineHeight: 19,
    },
}));
