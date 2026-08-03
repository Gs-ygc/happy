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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { useSessionMessageSearchNav } from '@/-session/sessionMessageSearchNav';
import { sync, type SessionMessageSearchProgress } from '@/sync/sync';
import { t } from '@/text';
import {
    normalizeSessionSearchText,
    type SessionMessageSearchResult,
} from '@/utils/sessionMessageSearch';

export default React.memo(function SessionSearchScreen() {
    const router = useRouter();
    const { id: sessionId } = useLocalSearchParams<{ id: string }>();
    const { theme } = useUnistyles();
    const [query, setQuery] = React.useState('');
    const [submittedQuery, setSubmittedQuery] = React.useState('');
    const [results, setResults] = React.useState<SessionMessageSearchResult[]>([]);
    const [progress, setProgress] = React.useState<SessionMessageSearchProgress>({ scanned: 0, matches: 0 });
    const [isSearching, setIsSearching] = React.useState(false);
    const [hasSearched, setHasSearched] = React.useState(false);
    const [truncated, setTruncated] = React.useState(false);
    const [failed, setFailed] = React.useState(false);
    const abortRef = React.useRef<AbortController | null>(null);

    React.useEffect(() => () => abortRef.current?.abort(), []);

    const handleSearch = React.useCallback(async () => {
        const normalizedQuery = normalizeSessionSearchText(query);
        if (!sessionId || !normalizedQuery) return;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        Keyboard.dismiss();
        setSubmittedQuery(normalizedQuery);
        setResults([]);
        setProgress({ scanned: 0, matches: 0 });
        setTruncated(false);
        setFailed(false);
        setHasSearched(true);
        setIsSearching(true);

        try {
            const response = await sync.searchSessionMessages(sessionId, normalizedQuery, {
                signal: controller.signal,
                onProgress: setProgress,
            });
            if (controller.signal.aborted) return;
            setResults(response.results);
            setProgress({ scanned: response.scanned, matches: response.results.length });
            setTruncated(response.truncated);
        } catch (error) {
            if (controller.signal.aborted) return;
            console.error('Failed to search session messages:', error);
            setFailed(true);
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
                setIsSearching(false);
            }
        }
    }, [query, sessionId]);

    const handleResultPress = React.useCallback((result: SessionMessageSearchResult) => {
        if (!sessionId || !submittedQuery) return;
        useSessionMessageSearchNav.getState().requestJump({
            sessionId,
            query: submittedQuery,
            result,
        });
        router.back();
    }, [router, sessionId, submittedQuery]);

    const renderResult = React.useCallback(({ item }: { item: SessionMessageSearchResult }) => (
        <Pressable
            accessibilityRole="button"
            onPress={() => handleResultPress(item)}
            style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
        >
            <View style={styles.resultMeta}>
                <Text style={styles.resultRole}>
                    {item.role === 'user' ? t('sessionSearch.user') : t('sessionSearch.assistant')}
                </Text>
                <Text style={styles.resultTime}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
            <Text style={styles.resultPreview} numberOfLines={4}>{item.preview}</Text>
        </Pressable>
    ), [handleResultPress]);

    const normalizedInput = normalizeSessionSearchText(query);
    const statusText = isSearching
        ? t('sessionSearch.searching', { scanned: progress.scanned, matches: progress.matches })
        : hasSearched && !failed
            ? t('sessionSearch.resultCount', { count: results.length })
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
                        placeholder={t('sessionSearch.placeholder')}
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
                keyExtractor={(item) => `${item.sourceMessageId}:${item.seq}`}
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
                            {failed ? t('sessionSearch.loadFailed') : t('sessionSearch.noResults')}
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
        height: Platform.select({ ios: 0.33, default: 1 }),
        marginLeft: 16,
        backgroundColor: theme.colors.divider,
    },
    emptyList: {
        flexGrow: 1,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 32,
    },
    emptyText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        textAlign: 'center',
        ...Typography.default(),
    },
}));
