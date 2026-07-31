import * as React from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { Modal } from '@/modal';

export const TextSelectionModal = React.memo((props: {
    text: string;
    onClose: () => void;
}) => {
    const { width, height } = useWindowDimensions();
    const { theme } = useUnistyles();
    const [copied, setCopied] = React.useState(false);
    const copiedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => () => {
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    }, []);

    const copyAll = React.useCallback(async () => {
        try {
            await Clipboard.setStringAsync(props.text);
            setCopied(true);
            if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
            copiedTimerRef.current = setTimeout(() => setCopied(false), 1600);
        } catch {
            Modal.alert(t('common.error'), t('textSelection.failedToCopy'));
        }
    }, [props.text]);

    return (
        <View
            style={[
                styles.container,
                {
                    width: Math.min(width - 32, 720),
                    height: Math.min(height - 64, 720),
                },
            ]}
        >
            <View style={styles.header}>
                <Text style={styles.title}>{t('textSelection.title')}</Text>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copied ? t('common.copied') : t('common.copy')}
                    onPress={copyAll}
                    hitSlop={8}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                >
                    <Ionicons
                        name={copied ? 'checkmark' : 'copy-outline'}
                        size={20}
                        color={copied ? theme.colors.success : theme.colors.text}
                    />
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.cancel')}
                    onPress={props.onClose}
                    hitSlop={8}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                >
                    <Ionicons name="close" size={22} color={theme.colors.text} />
                </Pressable>
            </View>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                <Text selectable style={styles.selectableText}>
                    {props.text}
                </Text>
            </ScrollView>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    header: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 16,
        paddingRight: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    title: {
        ...Typography.default('semiBold'),
        flex: 1,
        minWidth: 0,
        fontSize: 16,
        color: theme.colors.text,
    },
    iconButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
    },
    iconButtonPressed: {
        backgroundColor: theme.colors.surfacePressed,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    selectableText: {
        ...Typography.mono(),
        fontSize: 14,
        lineHeight: 21,
        color: theme.colors.text,
    },
}));
