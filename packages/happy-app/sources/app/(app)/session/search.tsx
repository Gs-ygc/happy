import * as React from 'react';
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    Platform,
    Pressable,
    TextInput,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { useSessionMessageSearchNav } from '@/-session/sessionMessageSearchNav';
import { useAllSessions } from '@/sync/storage';
import {
    sync,
    type GlobalSessionMessageSearchProgress,
    type GlobalSessionMessageSearchResult,
} from '@/sync/sync';
import { getSessionName } from '@/utils/sessionUtils';
import { t } from '@/text';
import {
    normalizeSessionSearchText,
    shouldPublishSearchProgress,
} from '@/utils/sessionMessageSearch';

export default React.memo(function GlobalSessionSearchScreen() {
    const router = useRouter();
    const { theme } = useUnistyles();
    const sessions = useAllSessions();
    const sessionsById = React.useMemo(
        () => new Map(sessions.map((session) => [session.id, session] as const)),
        [sessions],
    );
    const [query, setQuery] = React.useState('');
    const [submittedQuery, setSubmittedQuery] = React.useState('');
    const [results, setResults] = React.useState<GlobalSessionMessageSearchResult[]>([]);
    const [progress, setProgress] = React.useState<GlobalSessionMessageSearchProgress>({
        scannedSessions: 0,
        scannedMessages: 0,
        matches: 0,
    });
    const [isSearching, setIsSearching] = React.useState(false);
    const [hasSearched, setHasSearched] = React.useState(false);
    const [truncated, setTruncated] = React.useState(false);
    const [failed, setFailed] = React.useState(false);
    const abortRef = React.useRef<AbortController | null>(null);

    React.useEffect(() => () => abortRef.current?.abort(), []);

    const handleSearch = React.useCallback(async () => {
        const normalizedQuery = normalizeSessionSearchText(query);
        if (!normalizedQuery) return;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        Keyboard.dismiss();
        setSubmittedQuery(normalizedQuery);
        setResults([]);
        setProgress({ scannedSessions: 0, scannedMessages: 0, matches: 0 });
        setTruncated(false);
        setFailed(false);
        setHasSearched(true);
        setIsSearching(true);

        try {
            const response = await sync.searchGlobalMessages(normalizedQuery, {
                signal: controller.signal,
                onProgress: (nextProgress) => {
                    if (shouldPublishSearchProgress(controller.signal)) {
                        setProgress(nextProgress);
                    }
                },
                onResults: (nextResults) => {
                    if (!controller.signal.aborted) {
                        setResults(nextResults);
                    }
                },
            });
            if (controller.signal.aborted) return;
            setResults(response.results);
            setProgress({
                scannedSessions: response.scannedSessions,
                scannedMessages: response.scannedMessages,
                matches: response.results.length,
            });
            setTruncated(response.truncated);
        } catch (error) {
            if (controller.signal.aborted) return;
            console.error('Failed to search all sessions:', error);
            setFailed(true);
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
                setIsSearching(false);
            }
        }
    }, [query]);

    const handleResultPress = React.useCallback((result: GlobalSessionMessageSearchResult) => {
        if (!submittedQuery) return;
        useSessionMessageSearchNav.getState().requestJump({
            sessionId: result.sessionId,
            query: submittedQuery,
            result,
        });
        router.push(`/session/${encodeURIComponent(result.sessionId)}`);
    }, [router, submittedQuery]);

    const renderResult = React.useCallback(({ item }: { item: GlobalSessionMessageSearchResult }) => {
        const session = sessionsById.get(item.sessionId);
        return (
            <Pressable
                accessibilityRole="button"
                onPress={() => handleResultPress(item)}
                style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
            >
                <Text style={styles.sessionName} numberOfLines={1}>
                    {session ? getSessionName(session) : item.sessionId}
                </Text>
                <View style={styles.resultMeta}>
                    <Text style={styles.resultRole}>
                        {item.role === 'user' ? t('sessionSearch.user') : t('sessionSearch.assistant')}
                    </Text>
                    <Text style={styles.resultTime}>{new Date(item.createdAt).toLocaleString()}</Text>
                </View>
                <Text style={styles.resultPreview} numberOfLines={4}>{item.preview}</Text>
            </Pressable>
        );
    }, [handleResultPress, sessionsById]);

    const normalizedInput = normalizeSessionSearchText(query);
    const statusText = isSearching
        ? t('globalSearch.searching', {
            sessions: progress.scannedSessions,
            messages: progress.scannedMessages,
            matches: progress.matches,
        })
        : hasSearched && !failed
            ? t('globalSearch.resultCount', { count: results.length })
            : null;

    return (
        <View style={styles.container}>
            <View style={styles.searchBarArea}>
                <View style={styles.searchInputContainer}>
                    <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
                    <TextInput
                        autoFocus
                        value={query}
                        onChangeText={setQuery}
                        onSubmitEditing={handleSearch}
                        placeholder={t('globalSearch.placeholder')}
                        placeholderTextColor={theme.colors.input.placeholder}
                        style={styles.searchInput}
                        returnKeyType="search"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {query.length > 0 && (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t('sessionSearch.clear')}
                            hitSlop={8}
                            onPress={() => setQuery('')}
                        >
                            <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
                        </Pressable>
                    )}
                </View>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('sessionSearch.search')}
                    disabled={!normalizedInput || isSearching}
                    onPress={handleSearch}
                    style={({ pressed }) => [
                        styles.searchButton,
                        (!normalizedInput || isSearching) && styles.searchButtonDisabled,
                        pressed && styles.searchButtonPressed,
                    ]}
                >
                    {isSearching
                        ? <ActivityIndicator size="small" color="#FFFFFF" />
                        : <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />}
                </Pressable>
            </View>

            {(statusText || truncated) && (
                <View style={styles.statusRow}>
                    {statusText && <Text style={styles.statusText}>{statusText}</Text>}
                    {truncated && <Text style={styles.limitText}>{t('sessionSearch.truncated')}</Text>}
                </View>
            )}

            <FlatList
                data={results}
                keyExtractor={(item) => `${item.sessionId}:${item.sourceMessageId}:${item.seq}`}
                renderItem={renderResult}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={results.length === 0 ? styles.emptyList : undefined}
                ItemSeparatorComponent={() => <View style={styles.divider} />}
                ListEmptyComponent={hasSearched && !isSearching ? (
                    <View style={styles.emptyState}>
                        <Ionicons
                            name={failed ? 'cloud-offline-outline' : 'search-outline'}
                            size={32}
                            color={theme.colors.textSecondary}
                        />
                        <Text style={styles.emptyText}>
                            {failed ? t('sessionSearch.loadFailed') : t('globalSearch.noResults')}
                        </Text>
                    </View>
                ) : null}
            />
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    searchBarArea: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: Platform.select({ ios: 0.33, default: 1 }),
        borderBottomColor: theme.colors.divider,
    },
    searchInputContainer: {
        flex: 1,
        height: 42,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.input.background,
    },
    searchInput: {
        flex: 1,
        minWidth: 0,
        color: theme.colors.input.text,
        fontSize: 16,
        ...Typography.default(),
    },
    searchButton: {
        width: 42,
        height: 42,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.textLink,
    },
    searchButtonDisabled: {
        opacity: 0.4,
    },
    searchButtonPressed: {
        opacity: 0.75,
    },
    statusRow: {
        minHeight: 34,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        borderBottomWidth: Platform.select({ ios: 0.33, default: 1 }),
        borderBottomColor: theme.colors.divider,
    },
    statusText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        ...Typography.default(),
    },
    limitText: {
        color: theme.colors.warning,
        fontSize: 12,
        ...Typography.default(),
    },
    resultRow: {
        paddingHorizontal: 16,
        paddingVertical: 13,
        backgroundColor: theme.colors.surface,
    },
    resultRowPressed: {
        backgroundColor: theme.colors.surfaceHigh,
    },
    sessionName: {
        color: theme.colors.text,
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 5,
        ...Typography.default('semiBold'),
    },
    resultMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 5,
    },
    resultRole: {
        color: theme.colors.textLink,
        fontSize: 12,
        ...Typography.default('semiBold'),
    },
    resultTime: {
        flexShrink: 1,
        color: theme.colors.textSecondary,
        fontSize: 11,
        textAlign: 'right',
        ...Typography.default(),
    },
    resultPreview: {
        color: theme.colors.text,
        fontSize: 14,
        lineHeight: 20,
        ...Typography.default(),
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.divider,
    },
    emptyList: {
        flexGrow: 1,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 32,
    },
    emptyText: {
        color: theme.colors.textSecondary,
        fontSize: 15,
        textAlign: 'center',
        ...Typography.default(),
    },
}));
