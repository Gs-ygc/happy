import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUnistyles } from 'react-native-unistyles';
import type { CodexConfigSnapshot, CodexConfigWriteRequest } from '@slopus/happy-wire';
import { Typography } from '@/constants/Typography';

export function CodexConfigEditor({
    initialSnapshot,
    onSave,
    onReload,
    onClose,
}: {
    initialSnapshot: CodexConfigSnapshot;
    onSave: (request: CodexConfigWriteRequest) => Promise<CodexConfigSnapshot>;
    onReload: () => Promise<CodexConfigSnapshot>;
    onClose: () => void;
}) {
    const { theme } = useUnistyles();
    const [snapshot, setSnapshot] = useState(initialSnapshot);
    const [content, setContent] = useState(initialSnapshot.content);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<'save' | 'reload' | null>(null);
    const dirty = content !== snapshot.content;

    const reload = async () => {
        setBusy('reload');
        setError(null);
        try {
            const latest = await onReload();
            setSnapshot(latest);
            setContent(latest.content);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Failed to read Codex config');
        } finally {
            setBusy(null);
        }
    };

    const save = async () => {
        setBusy('save');
        setError(null);
        try {
            const saved = await onSave({ content, expectedSha256: snapshot.sha256 });
            setSnapshot(saved);
            setContent(saved.content);
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Failed to save Codex config');
        } finally {
            setBusy(null);
        }
    };

    return (
        <View style={{ width: '100%', maxWidth: 820, maxHeight: '90%', backgroundColor: theme.colors.surface, borderRadius: 8, overflow: 'hidden' }}>
            <View style={{ minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.divider }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[Typography.default('semiBold'), { color: theme.colors.text, fontSize: 17 }]}>config.toml</Text>
                    <Text numberOfLines={1} style={{ color: theme.colors.textSecondary, fontSize: 11 }}>{snapshot.path}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Reload config" onPress={() => void reload()} disabled={busy !== null} hitSlop={10} style={{ padding: 8 }}>
                    {busy === 'reload'
                        ? <ActivityIndicator size="small" />
                        : <Ionicons name="refresh" size={20} color={theme.colors.textSecondary} />}
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} disabled={busy !== null} hitSlop={10} style={{ padding: 8 }}>
                    <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
                </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} keyboardShouldPersistTaps="handled">
                <TextInput
                    value={content}
                    onChangeText={setContent}
                    multiline
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    textAlignVertical="top"
                    style={{
                        minHeight: Platform.OS === 'web' ? 420 : 300,
                        maxHeight: Platform.OS === 'web' ? 560 : 440,
                        borderWidth: 1,
                        borderColor: error ? theme.colors.textDestructive : theme.colors.divider,
                        borderRadius: 6,
                        padding: 12,
                        color: theme.colors.text,
                        backgroundColor: theme.colors.groupped.background,
                        fontFamily: 'monospace',
                        fontSize: 13,
                        lineHeight: 19,
                    }}
                />
                {error ? <Text selectable style={{ color: theme.colors.textDestructive, fontSize: 12 }}>{error}</Text> : null}
            </ScrollView>
            <View style={{ minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: theme.colors.divider }}>
                <Pressable onPress={onClose} disabled={busy !== null} style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Text style={{ color: theme.colors.textSecondary }}>Cancel</Text>
                </Pressable>
                <Pressable
                    onPress={() => void save()}
                    disabled={busy !== null || !dirty}
                    style={{ minWidth: 92, minHeight: 40, paddingHorizontal: 14, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: theme.colors.button.primary.background, opacity: busy !== null || !dirty ? 0.5 : 1 }}
                >
                    {busy === 'save' ? <ActivityIndicator size="small" color={theme.colors.button.primary.tint} /> : <Ionicons name="save-outline" size={18} color={theme.colors.button.primary.tint} />}
                    <Text style={{ color: theme.colors.button.primary.tint, fontWeight: '600' }}>{busy === 'save' ? 'Saving' : 'Save'}</Text>
                </Pressable>
            </View>
        </View>
    );
}
