import * as React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { createMacTheme, MAC_THEME_PRESETS, type MacThemeDefinition, type MacThemeMode } from '@/theme/macTheme';
import { MacThemePreview } from './MacThemePreview';

const PRESET_ENTRIES = [
    ['system-glass', MAC_THEME_PRESETS.systemGlass],
    ['graphite', MAC_THEME_PRESETS.graphite],
    ['ink', MAC_THEME_PRESETS.ink],
    ['paper', MAC_THEME_PRESETS.paper],
] as const;

const stylesheet = StyleSheet.create((theme) => ({
    group: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
    sectionTitle: { color: theme.colors.groupped.sectionTitle, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    preset: { flex: 1, minWidth: 0, minHeight: 38, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.divider, alignItems: 'center', justifyContent: 'center' },
    presetSelected: { borderColor: theme.colors.status.connecting, backgroundColor: theme.colors.surfaceSelected },
    presetText: { color: theme.colors.text, fontSize: 12 },
    label: { flex: 1, color: theme.colors.textSecondary, fontSize: 13 },
    input: { width: 104, height: 36, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.divider, color: theme.colors.text, backgroundColor: theme.colors.input.background, textAlign: 'right' },
    colorInput: { flex: 1, height: 36, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.divider, color: theme.colors.text, backgroundColor: theme.colors.input.background },
    action: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.divider, alignItems: 'center', justifyContent: 'center' },
    actionText: { color: theme.colors.text, fontSize: 13, fontWeight: '600' },
    danger: { color: theme.colors.textDestructive },
}));

interface MacThemeEditorProps {
    library: MacThemeDefinition[];
    selectedId: string;
    onSelect: (id: string) => void;
    onSave: (theme: MacThemeDefinition) => void;
    onDelete: (id: string) => void;
    onDuplicate: (theme: MacThemeDefinition) => void;
    onImport: () => void;
    onExport: () => void;
}

export function MacThemeEditor(props: MacThemeEditorProps) {
    const { theme } = useUnistyles();
    const selected = props.library.find((item) => item.id === props.selectedId) ?? props.library[0];
    const [draft, setDraft] = React.useState<MacThemeDefinition | undefined>(selected);

    React.useEffect(() => setDraft(selected), [selected]);
    if (!draft) return null;

    const updateGenerator = (patch: Partial<MacThemeDefinition['generator']>) => setDraft((current) => current ? ({ ...current, generator: { ...current.generator, ...patch } }) : current);
    const updateName = (name: string) => setDraft((current) => current ? ({ ...current, name }) : current);
    const updateMode = (mode: MacThemeMode) => setDraft((current) => current ? ({ ...current, mode }) : current);
    const updateOverride = (key: 'contentBackground' | 'contentText' | 'accentColor', value: string) => setDraft((current) => current ? ({ ...current, tokenOverrides: { ...current.tokenOverrides, [key]: value || undefined } }) : current);

    return (
        <View style={stylesheet.group}>
            <Text style={stylesheet.sectionTitle}>macOS theme library</Text>
            <View style={stylesheet.row}>
                {PRESET_ENTRIES.map(([key, preset]) => (
                    <Pressable key={key} onPress={() => props.onSave(createMacTheme(preset))} style={[stylesheet.preset, draft.id === key && stylesheet.presetSelected]}>
                        <Text style={stylesheet.presetText}>{preset.name}</Text>
                    </Pressable>
                ))}
            </View>
            <View style={stylesheet.row}>
                <Text style={stylesheet.label}>Saved theme</Text>
                <Pressable style={stylesheet.action} onPress={() => props.onSelect(draft.id)}><Text style={stylesheet.actionText}>{draft.name}</Text></Pressable>
            </View>
            <MacThemePreview theme={draft} />
            <View style={stylesheet.row}>
                <Text style={stylesheet.label}>Name</Text>
                <TextInput value={draft.name} onChangeText={updateName} style={stylesheet.input} accessibilityLabel="Theme name" />
            </View>
            <View style={stylesheet.row}>
                <Text style={stylesheet.label}>Mode</Text>
                {(['adaptive', 'light', 'dark'] as const).map((mode) => (
                    <Pressable key={mode} onPress={() => updateMode(mode)} style={[stylesheet.action, draft.mode === mode && stylesheet.presetSelected]}><Text style={stylesheet.actionText}>{mode}</Text></Pressable>
                ))}
            </View>
            <View style={stylesheet.row}>
                <Text style={stylesheet.label}>Base color</Text>
                <TextInput value={draft.generator.baseColor} onChangeText={(value) => updateGenerator({ baseColor: value })} style={stylesheet.colorInput} autoCapitalize="none" accessibilityLabel="Base color" />
            </View>
            <View style={stylesheet.row}>
                <Text style={stylesheet.label}>Accent color</Text>
                <TextInput value={draft.generator.accentColor} onChangeText={(value) => updateGenerator({ accentColor: value })} style={stylesheet.colorInput} autoCapitalize="none" accessibilityLabel="Accent color" />
            </View>
            <View style={stylesheet.row}>
                <Text style={stylesheet.label}>Contrast (0-1)</Text>
                <TextInput value={String(draft.generator.contrast)} keyboardType="decimal-pad" onChangeText={(value) => updateGenerator({ contrast: Number(value) || 0 })} style={stylesheet.input} accessibilityLabel="Theme contrast" />
            </View>
            <View style={stylesheet.row}>
                <Text style={stylesheet.label}>Material strength (0-1)</Text>
                <TextInput value={String(draft.generator.materialStrength)} keyboardType="decimal-pad" onChangeText={(value) => updateGenerator({ materialStrength: Number(value) || 0 })} style={stylesheet.input} accessibilityLabel="Material strength" />
            </View>
            <Text style={stylesheet.sectionTitle}>Advanced token overrides</Text>
            <View style={stylesheet.row}><Text style={stylesheet.label}>Content background</Text><TextInput value={draft.tokenOverrides.contentBackground ?? ''} onChangeText={(value) => updateOverride('contentBackground', value)} style={stylesheet.colorInput} autoCapitalize="none" accessibilityLabel="Content background override" /></View>
            <View style={stylesheet.row}><Text style={stylesheet.label}>Content text</Text><TextInput value={draft.tokenOverrides.contentText ?? ''} onChangeText={(value) => updateOverride('contentText', value)} style={stylesheet.colorInput} autoCapitalize="none" accessibilityLabel="Content text override" /></View>
            <View style={stylesheet.row}><Text style={stylesheet.label}>Accent override</Text><TextInput value={draft.tokenOverrides.accentColor ?? ''} onChangeText={(value) => updateOverride('accentColor', value)} style={stylesheet.colorInput} autoCapitalize="none" accessibilityLabel="Accent override" /></View>
            <View style={stylesheet.row}>
                <Pressable style={stylesheet.action} onPress={() => props.onSave(draft)}><Ionicons name="checkmark" size={16} color={theme.colors.text} /><Text style={stylesheet.actionText}>Save</Text></Pressable>
                <Pressable style={stylesheet.action} onPress={() => props.onDuplicate(draft)}><Ionicons name="copy-outline" size={16} color={theme.colors.text} /><Text style={stylesheet.actionText}>Duplicate</Text></Pressable>
                <Pressable style={stylesheet.action} onPress={() => props.onDelete(draft.id)}><Ionicons name="trash-outline" size={16} color={theme.colors.textDestructive} /><Text style={[stylesheet.actionText, stylesheet.danger]}>Delete</Text></Pressable>
                <Pressable style={stylesheet.action} onPress={props.onImport} accessibilityLabel="Import themes"><Ionicons name="download-outline" size={16} color={theme.colors.text} /></Pressable>
                <Pressable style={stylesheet.action} onPress={props.onExport} accessibilityLabel="Export themes"><Ionicons name="share-outline" size={16} color={theme.colors.text} /></Pressable>
            </View>
        </View>
    );
}
