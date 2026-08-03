import * as React from 'react';
import { useLocalSetting, useSession, useSessionMessages, useSetting } from "@/sync/storage";
import { sync } from '@/sync/sync';
import { ActivityIndicator, FlatList, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, View } from 'react-native';
import { useCallback } from 'react';
import { useHeaderHeight } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageView } from './MessageView';
import { AgentWorkGroupView, ToolGroupView } from './ToolGroupView';
import { DuplicateSheet } from './DuplicateSheet';
import { Metadata, Session } from '@/sync/storageTypes';
import { ChatFooter } from './ChatFooter';
import { Message } from '@/sync/typesMessage';
import { DisplayItem, ToolGroupItem, useGroupedMessages } from '@/hooks/useGroupedMessages';
import { Octicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Modal } from '@/modal';
import { useSessionQuickActions } from '@/hooks/useSessionQuickActions';
import { resolveControlMode } from '@/sync/controlHandoff';
import { usesControlledSessionUi } from '@/sync/rig';
import { useSessionMessageSearchNav } from '@/-session/sessionMessageSearchNav';
import { findDisplayItemIndexForMessage } from '@/utils/sessionMessageSearch';
import { t } from '@/text';

const SCROLL_THRESHOLD = 300;

export const ChatList = React.memo((props: { session: Session }) => {
    const { messages, hasMoreOlder, isLoadingOlder } = useSessionMessages(props.session.id);
    return (
        <ChatListInternal
            metadata={props.session.metadata}
            sessionId={props.session.id}
            messages={messages}
            hasMoreOlder={hasMoreOlder}
            isLoadingOlder={isLoadingOlder}
        />
    )
});

const ListHeader = React.memo((props: { isLoadingOlder: boolean }) => {
    const headerHeight = useHeaderHeight();
    const safeArea = useSafeAreaInsets();
    // ListFooterComponent on an inverted FlatList renders at the visual top
    // — that is exactly where the spinner for "loading older messages"
    // belongs. The spacer below keeps the header bar from clipping the
    // oldest message.
    return (
        <View>
            {props.isLoadingOlder && (
                <View style={{ paddingVertical: 12, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="small" />
                </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', height: headerHeight + safeArea.top + 32 }} />
        </View>
    );
});

const ListFooter = React.memo((props: { sessionId: string }) => {
    const session = useSession(props.sessionId)!;
    return (
        <ChatFooter controlledByUser={usesControlledSessionUi(session.metadata) && (session.agentState?.controlledByUser || false)} />
    )
});

const ChatListInternal = React.memo((props: {
    metadata: Metadata | null,
    sessionId: string,
    messages: Message[],
    hasMoreOlder: boolean,
    isLoadingOlder: boolean,
}) => {
    const { theme } = useUnistyles();
    const flatListRef = React.useRef<FlatList>(null);
    const [showScrollButton, setShowScrollButton] = React.useState(false);
    const [handoffListRevision, setHandoffListRevision] = React.useState(0);
    const [pendingSearchMessageId, setPendingSearchMessageId] = React.useState<string | null>(null);
    const [highlightedMessageId, setHighlightedMessageId] = React.useState<string | null>(null);
    const searchJump = useSessionMessageSearchNav((state) => state.jump);
    const handledSearchJumpRef = React.useRef<number | null>(null);
    const highlightTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    // Tracks whether the scroll-button is currently shown, so we only call
    // setShowScrollButton when the threshold is actually crossed instead of
    // on every scroll frame (60Hz). Without this guard, the entire list
    // parent re-renders on every wheel tick.
    const showScrollButtonRef = React.useRef(false);
    const session = useSession(props.sessionId);
    const controlMode = resolveControlMode(usesControlledSessionUi(session?.metadata) ? session?.agentState?.controlledByUser : false);
    const previousControlModeRef = React.useRef(controlMode);

    React.useEffect(() => {
        if (previousControlModeRef.current === controlMode) {
            return;
        }
        previousControlModeRef.current = controlMode;
        if (Platform.OS !== 'web') {
            return;
        }
        if (showScrollButtonRef.current) {
            showScrollButtonRef.current = false;
            setShowScrollButton(false);
        }
        setHandoffListRevision((revision) => revision + 1);
    }, [controlMode]);

    // Collapse agent work between a user prompt and the final answer.
    // Nested tool groups remain expandable inside the work block.
    const groupToolCalls = useSetting('groupToolCalls') || props.metadata?.flavor === 'codex';
    const showThinking = useLocalSetting('showThinking') || props.metadata?.flavor === 'codex';
    const hasPendingPermission = Boolean(
        session?.agentState?.requests && Object.keys(session.agentState.requests).length > 0,
    );
    const collapseCurrentTurn = session?.thinking !== true && !hasPendingPermission;
    const groupingOptions = React.useMemo(
        () => ({ collapseCurrentTurn, showThinking }),
        [collapseCurrentTurn, showThinking],
    );
    const displayItems = useGroupedMessages(props.messages, groupToolCalls, groupingOptions);

    // Keep the latest work/tool group expanded so current output is visible,
    // while leaving older history compact. New groups also start expanded.
    const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(() => {
        const initial = new Set<string>();
        let foundLatestGroup = false;
        for (const item of displayItems) {
            if (!isCollapsibleDisplayItem(item)) {
                continue;
            }
            if (!foundLatestGroup) {
                foundLatestGroup = true;
                continue;
            }
            if (!item.hasPendingPermission) {
                initial.add(item.id);
            }
        }
        return initial;
    });
    const hasInitializedGroupsRef = React.useRef(displayItems.some(isCollapsibleDisplayItem));

    // Auto-expand groups that need user approval — but only if the user
    // hasn't manually collapsed them.
    // We track manually-collapsed IDs so we never force-reopen them.
    const manuallyCollapsedRef = React.useRef<Set<string>>(new Set());
    React.useEffect(() => {
        setCollapsedGroups((prev) => {
            let changed = false;
            const next = new Set(prev);
            const groups = displayItems.filter(isCollapsibleDisplayItem);
            if (!hasInitializedGroupsRef.current && groups.length > 0) {
                hasInitializedGroupsRef.current = true;
                for (const item of groups.slice(1)) {
                    if (!item.hasPendingPermission) {
                        next.add(item.id);
                        changed = true;
                    }
                }
            }
            for (const item of displayItems) {
                if (!isCollapsibleDisplayItem(item)) {
                    continue;
                }
                if (item.hasPendingPermission && prev.has(item.id) && !manuallyCollapsedRef.current.has(item.id)) {
                    next.delete(item.id);
                    changed = true;
                    continue;
                }
            }
            return changed ? next : prev;
        });
    }, [displayItems]);

    const handleToggleGroup = useCallback((groupId: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) {
                next.delete(groupId);
                manuallyCollapsedRef.current.delete(groupId);
            } else {
                next.add(groupId);
                manuallyCollapsedRef.current.add(groupId);
            }
            return next;
        });
    }, []);

    React.useEffect(() => {
        if (!searchJump || searchJump.sessionId !== props.sessionId) return;
        if (handledSearchJumpRef.current === searchJump.requestId) return;
        handledSearchJumpRef.current = searchJump.requestId;

        let cancelled = false;
        void sync.loadSearchResult(props.sessionId, searchJump.result, searchJump.query)
            .then((messageId) => {
                if (cancelled) return;
                if (!messageId) {
                    Modal.alert(t('sessionSearch.jumpFailedTitle'), t('sessionSearch.jumpFailedMessage'));
                    return;
                }
                setPendingSearchMessageId(messageId);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error('Failed to load message search result:', error);
                Modal.alert(t('sessionSearch.jumpFailedTitle'), t('sessionSearch.jumpFailedMessage'));
            })
            .finally(() => {
                if (!cancelled) {
                    useSessionMessageSearchNav.getState().clearJump(searchJump.requestId);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [props.sessionId, searchJump]);

    React.useEffect(() => {
        if (!pendingSearchMessageId) return;
        const location = findDisplayItemIndexForMessage(displayItems, pendingSearchMessageId);
        if (!location) return;

        if (location.groupId) {
            manuallyCollapsedRef.current.delete(location.groupId);
            setCollapsedGroups((previous) => {
                if (!previous.has(location.groupId!)) return previous;
                const next = new Set(previous);
                next.delete(location.groupId!);
                return next;
            });
        }

        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        setHighlightedMessageId(pendingSearchMessageId);
        setPendingSearchMessageId(null);
        const scroll = () => flatListRef.current?.scrollToIndex({
            index: location.index,
            animated: true,
            viewPosition: 0.5,
        });
        requestAnimationFrame(() => requestAnimationFrame(scroll));
        highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(null), 2600);
    }, [displayItems, pendingSearchMessageId]);

    React.useEffect(() => () => {
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    }, []);

    const keyExtractor = useCallback((item: DisplayItem) => item.id, []);

    // The message action button opens fork-from-this-message. It uses the same canFork gate as
    // the rest of the fork affordances: ridden by the expResumeSession
    // experiments toggle, requires a Claude session with claudeSessionId
    // and a machine that's online. Active OR inactive — fork works either
    // way (the on-disk JSONL exists in both cases).
    const { canFork } = useSessionQuickActions(session!, {});

    const handleForkFromMessage = useCallback((messageId: string, rewindPointId: string | undefined, messageText: string) => {
        Modal.show({
            component: DuplicateSheet,
            props: {
                sessionId: props.sessionId,
                initialRewindPointId: rewindPointId,
                initialMessageText: messageText,
                initialForkedFromMessageId: messageId,
            },
        } as any);
    }, [props.sessionId]);

    const renderItem = useCallback(({ item }: { item: DisplayItem }) => {
        if (item.type === 'tool-group') {
            return (
                <ToolGroupView
                    group={item}
                    metadata={props.metadata}
                    sessionId={props.sessionId}
                    expanded={!collapsedGroups.has(item.id)}
                    onToggle={() => handleToggleGroup(item.id)}
                />
            );
        }
        if (item.type === 'agent-work-group') {
            return (
                <AgentWorkGroupView
                    group={item}
                    metadata={props.metadata}
                    sessionId={props.sessionId}
                    expanded={!collapsedGroups.has(item.id)}
                    onToggle={() => handleToggleGroup(item.id)}
                    highlightedMessageId={highlightedMessageId}
                />
            );
        }
        return (
            <MessageView
                message={item.message}
                metadata={props.metadata}
                sessionId={props.sessionId}
                onForkFromUserMessage={canFork ? handleForkFromMessage : undefined}
                highlighted={item.message.id === highlightedMessageId}
            />
        );
    }, [props.metadata, props.sessionId, canFork, handleForkFromMessage, collapsedGroups, handleToggleGroup, highlightedMessageId]);

    // In inverted FlatList, offset 0 = latest messages (visual bottom).
    // Offset increases as user scrolls up to see older messages.
    // Auto-stick-to-bottom on new messages is handled natively by FlatList's
    // maintainVisibleContentPosition.autoscrollToBottomThreshold — no JS-side
    // scrollToOffset is needed (and running both produces a fight that drags
    // the user's viewport when reading older messages mid-stream).
    const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetY = e.nativeEvent.contentOffset.y;
        const next = offsetY > SCROLL_THRESHOLD;
        if (next !== showScrollButtonRef.current) {
            showScrollButtonRef.current = next;
            setShowScrollButton(next);
        }
    }, []);

    const scrollToBottom = useCallback(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, []);

    // In an inverted FlatList, `onEndReached` fires when the user scrolls
    // past the visual top — i.e. when they want to see older history.
    // Initial fetch only loads the latest 100 messages (see
    // sync.fetchInitialLatestPage), so we lazy-load earlier pages here.
    const sessionId = props.sessionId;
    const hasMoreOlder = props.hasMoreOlder;
    const isLoadingOlder = props.isLoadingOlder;
    const handleLoadOlder = useCallback(() => {
        if (!hasMoreOlder || isLoadingOlder) return;
        void sync.loadOlderMessages(sessionId);
    }, [sessionId, hasMoreOlder, isLoadingOlder]);

    // On macOS/web, Shift+wheel swaps deltaX/deltaY — restore vertical scrolling
    React.useEffect(() => {
        if (Platform.OS !== 'web') return;
        const node = (flatListRef.current as any)?.getScrollableNode?.() as HTMLElement | undefined;
        if (!node) return;
        const handler = (e: WheelEvent) => {
            if (e.shiftKey && Math.abs(e.deltaX) > 0 && Math.abs(e.deltaY) < 1) {
                node.scrollTop += e.deltaX;
                e.preventDefault();
            }
        };
        node.addEventListener('wheel', handler, { passive: false });
        return () => node.removeEventListener('wheel', handler);
    }, []);

    return (
        <View style={{ flex: 1 }}>
            <FlatList
                key={`${props.sessionId}:${handoffListRevision}`}
                ref={flatListRef}
                data={displayItems}
                inverted={true}
                keyExtractor={keyExtractor}
                maintainVisibleContentPosition={{
                    // Anchor on the second-newest message (index 1), not the
                    // newest. The newest slot (index 0) gets a brand-new item
                    // each agent token, which would otherwise destabilise the
                    // anchor and drag the viewport up.
                    //
                    // autoscrollToTopThreshold: for INVERTED lists this is
                    // actually the auto-stick-to-visual-bottom threshold —
                    // contentOffset 0 is at the visual bottom in an inverted
                    // list, and this prop sticks the viewport to offset 0
                    // when the user is within N units of it.
                    minIndexForVisible: 1,
                    autoscrollToTopThreshold: 50,
                }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
                // Inverted list: paddingTop renders at the visual bottom,
                // keeping the newest message off the composer edge.
                contentContainerStyle={{ paddingTop: 8 }}
                renderItem={renderItem}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                ListHeaderComponent={<ListFooter sessionId={props.sessionId} />}
                ListFooterComponent={<ListHeader isLoadingOlder={props.isLoadingOlder} />}
                onEndReached={handleLoadOlder}
                onEndReachedThreshold={0.5}
                onScrollToIndexFailed={({ index }) => {
                    setTimeout(() => {
                        flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
                    }, 120);
                }}
                initialNumToRender={10}
                maxToRenderPerBatch={6}
                updateCellsBatchingPeriod={32}
                windowSize={7}
                removeClippedSubviews={Platform.OS === 'android'}
            />
            {showScrollButton && (
                <View style={styles.scrollButtonContainer}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.scrollButton,
                            pressed ? styles.scrollButtonPressed : styles.scrollButtonDefault
                        ]}
                        onPress={scrollToBottom}
                    >
                        <Octicons name="arrow-down" size={14} color={theme.colors.text} />
                    </Pressable>
                </View>
            )}
        </View>
    )
});

function isCollapsibleDisplayItem(item: DisplayItem): item is ToolGroupItem | Extract<DisplayItem, { type: 'agent-work-group' }> {
    return item.type === 'tool-group' || item.type === 'agent-work-group';
}

const styles = StyleSheet.create((theme) => ({
    scrollButtonContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 12,
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'box-none',
    },
    scrollButton: {
        borderRadius: 16,
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.divider,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 2,
        shadowOpacity: theme.colors.shadow.opacity * 0.5,
        elevation: 2,
    },
    scrollButtonDefault: {
        backgroundColor: theme.colors.surface,
        opacity: 0.9,
    },
    scrollButtonPressed: {
        backgroundColor: theme.colors.surface,
        opacity: 0.7,
    },
}));
