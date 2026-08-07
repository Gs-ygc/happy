import * as React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { MacThemeDefinition } from '@/theme/macTheme';
import { flattenMacThemeTokens } from '@/theme/macTheme';

const stylesheet = StyleSheet.create((theme) => ({
    preview: {
        marginHorizontal: 16,
        marginVertical: 10,
        minHeight: 118,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.divider,
        flexDirection: 'row',
    },
    sidebar: {
        width: '30%',
        padding: 12,
        gap: 8,
    },
    content: {
        flex: 1,
        padding: 14,
        gap: 8,
    },
    line: {
        height: 7,
        borderRadius: 4,
        opacity: 0.72,
    },
    title: {
        fontSize: 12,
        fontWeight: '600',
    },
}));

export function MacThemePreview({ theme }: { theme: MacThemeDefinition }) {
    const tokens = flattenMacThemeTokens(theme, theme.mode === 'dark');
    return (
        <View style={stylesheet.preview} accessibilityLabel={`Preview ${theme.name}`}>
            <View style={[stylesheet.sidebar, { backgroundColor: tokens['material-background'] }]}>
                <Text style={[stylesheet.title, { color: tokens['content-text'] }]}>{theme.name}</Text>
                <View style={[stylesheet.line, { backgroundColor: tokens['accent-color'], width: '72%' }]} />
                <View style={[stylesheet.line, { backgroundColor: tokens['content-text'], width: '54%' }]} />
                <View style={[stylesheet.line, { backgroundColor: tokens['content-text'], width: '64%' }]} />
            </View>
            <View style={[stylesheet.content, { backgroundColor: tokens['content-background'] }]}>
                <View style={[stylesheet.line, { backgroundColor: tokens['content-text'], width: '36%' }]} />
                <View style={[stylesheet.line, { backgroundColor: tokens['opaque-surface'], height: 34, width: '100%' }]} />
                <View style={[stylesheet.line, { backgroundColor: tokens['accent-color'], width: '25%' }]} />
            </View>
        </View>
    );
}
