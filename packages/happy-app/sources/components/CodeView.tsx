import * as React from 'react';
import { Text, View, Platform, Pressable, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { t } from '@/text';
import { Modal } from '@/modal';

interface CodeViewProps {
    code: string;
    language?: string;
    maxHeight?: number;
}

export const CodeView = React.memo<CodeViewProps>(({ 
    code, 
    language,
    maxHeight,
}) => {
    const { theme } = useUnistyles();
    const [copied, setCopied] = React.useState(false);
    const resetCopiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => () => {
        if (resetCopiedTimer.current) {
            clearTimeout(resetCopiedTimer.current);
        }
    }, []);

    const copyCode = React.useCallback(async () => {
        try {
            await Clipboard.setStringAsync(code);
            setCopied(true);
            if (resetCopiedTimer.current) {
                clearTimeout(resetCopiedTimer.current);
            }
            resetCopiedTimer.current = setTimeout(() => setCopied(false), 1600);
        } catch (error) {
            console.error('Failed to copy code:', error);
            Modal.alert(t('common.error'), t('markdown.copyFailed'));
        }
    }, [code]);

    return (
        <View style={styles.codeBlock}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={copied ? t('common.copied') : t('common.copy')}
                onPress={copyCode}
                hitSlop={8}
                style={({ pressed }) => [styles.copyButton, pressed && styles.copyButtonPressed]}
            >
                <Ionicons
                    name={copied ? 'checkmark' : 'copy-outline'}
                    size={15}
                    color={copied ? theme.colors.success : theme.colors.textSecondary}
                />
            </Pressable>
            <ScrollView
                style={maxHeight ? { maxHeight } : undefined}
                nestedScrollEnabled={Boolean(maxHeight)}
                showsVerticalScrollIndicator={Boolean(maxHeight)}
            >
                <Text selectable style={styles.codeText}>{code}</Text>
            </ScrollView>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    codeBlock: {
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 6,
        padding: 12,
        paddingTop: 42,
        position: 'relative',
    },
    copyButton: {
        position: 'absolute',
        top: 7,
        right: 8,
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surfaceHighest,
        zIndex: 1,
    },
    copyButtonPressed: {
        opacity: 0.65,
    },
    codeText: {
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
        fontSize: 12,
        color: theme.colors.text,
        lineHeight: 18,
    },
}));
