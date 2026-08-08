import * as React from 'react';
import { Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useHeaderHeight } from '@/utils/responsive';
import { VoiceAssistantStatusBar } from './VoiceAssistantStatusBar';
import { useRealtimeStatus } from '@/sync/storage';
import { MainView } from './MainView';
import { TaskCenterView } from './TaskCenterView';
import { StyleSheet } from 'react-native-unistyles';
import { t } from '@/text';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { useAllSessions, useLocalSettingMutable, useUnreadSessionIds } from '@/sync/storage';
import { formatSidebarUnreadCount, SIDEBAR_PANELS } from '@/utils/sidebarPanel';
import { isMacTauri } from '@/utils/isTauri';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        borderStyle: 'solid',
        backgroundColor: theme.colors.groupped.background,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    newSessionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
        gap: 8,
    },
    primaryActions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 4,
        gap: 8,
    },
    searchButton: {
        width: 42,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
    newSessionButtonPressed: {
        backgroundColor: theme.colors.surfacePressed,
    },
    newSessionText: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    settingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
        gap: 10,
    },
    settingsText: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text,
        ...Typography.default(),
    },
    panelSwitcher: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 8,
        padding: 3,
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
        gap: 3,
    },
    panelOption: {
        flex: 1,
        minWidth: 0,
        minHeight: 34,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 8,
    },
    panelOptionSelected: {
        backgroundColor: theme.colors.surfaceHigh,
    },
    panelOptionText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    panelOptionTextSelected: {
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    panelBadge: {
        minWidth: 17,
        height: 17,
        paddingHorizontal: 4,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.status.error,
    },
    panelBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        ...Typography.default('semiBold'),
    },
}));

export const SidebarView = React.memo(() => {
    const styles = stylesheet;
    const safeArea = useSafeAreaInsets();
    const router = useRouter();
    const headerHeight = useHeaderHeight();
    const realtimeStatus = useRealtimeStatus();
    const sessions = useAllSessions();
    const unreadSessionIds = useUnreadSessionIds();
    const [activePanel, setActivePanel] = useLocalSettingMutable('sidebarPanel');

    const unreadCount = React.useMemo(
        () => sessions.reduce(
            (count, session) => count + (unreadSessionIds.has(session.id) ? 1 : 0),
            0,
        ),
        [sessions, unreadSessionIds],
    );
    const unreadBadge = formatSidebarUnreadCount(unreadCount);

    const handleNewSession = React.useCallback(() => {
        router.navigate('/new');
    }, [router]);

    return (
        <View
            style={[styles.container, { paddingTop: safeArea.top + headerHeight }]}
            {...(isMacTauri() ? { dataSet: { happyMacSidebar: 'true' } } : {})}
        >
            <View style={styles.primaryActions}>
                <Pressable
                    onPress={handleNewSession}
                    style={({ pressed }) => [
                        styles.newSessionButton,
                        pressed && styles.newSessionButtonPressed,
                    ]}
                >
                    <Ionicons name="create-outline" size={16} color={stylesheet.newSessionText.color} />
                    <Text style={styles.newSessionText}>{t('sidebar.newSession')}</Text>
                </Pressable>
                <Pressable
                    onPress={() => router.navigate('/session/search')}
                    accessibilityRole="button"
                    accessibilityLabel={t('globalSearch.open')}
                    style={({ pressed }) => [styles.searchButton, pressed && styles.newSessionButtonPressed]}
                >
                    <Ionicons name="search-outline" size={20} color={stylesheet.newSessionText.color} />
                </Pressable>
            </View>

            {realtimeStatus !== 'disconnected' && (
                <VoiceAssistantStatusBar variant="sidebar" />
            )}

            <View
                style={styles.panelSwitcher}
                accessibilityRole="tablist"
            >
                {SIDEBAR_PANELS.map((panel) => {
                    const selected = activePanel === panel.key;
                    const label = panel.key === 'tasks' ? t('tabs.tasks') : t('tabs.sessions');
                    return (
                        <Pressable
                            key={panel.key}
                            onPress={() => setActivePanel(panel.key)}
                            accessibilityRole="tab"
                            accessibilityLabel={label}
                            accessibilityState={{ selected }}
                            style={({ pressed }) => [
                                styles.panelOption,
                                selected && styles.panelOptionSelected,
                                pressed && { opacity: 0.7 },
                            ]}
                        >
                            <Ionicons
                                name={panel.icon}
                                size={16}
                                color={selected ? stylesheet.panelOptionTextSelected.color : stylesheet.panelOptionText.color}
                            />
                            <Text style={[styles.panelOptionText, selected && styles.panelOptionTextSelected]} numberOfLines={1}>
                                {label}
                            </Text>
                            {panel.key === 'tasks' && unreadBadge ? (
                                <View style={styles.panelBadge}>
                                    <Text style={styles.panelBadgeText}>{unreadBadge}</Text>
                                </View>
                            ) : null}
                        </Pressable>
                    );
                })}
            </View>

            {/* Keep both panels in the same sidebar slot so the main route remains untouched. */}
            {activePanel === 'tasks' ? <TaskCenterView /> : <MainView variant="sidebar" />}

            {/* Settings at bottom */}
            <Pressable
                onPress={() => router.push('/settings')}
                style={styles.settingsRow}
            >
                <Ionicons name="settings-outline" size={18} color={stylesheet.settingsText.color} />
                <Text style={styles.settingsText}>{t('settings.title')}</Text>
            </Pressable>
        </View>
    );
});
