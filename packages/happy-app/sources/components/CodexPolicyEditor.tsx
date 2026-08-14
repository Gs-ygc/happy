import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUnistyles } from 'react-native-unistyles';
import { CodexDevicePolicySchema, type CodexDeviceGroup } from '@slopus/happy-wire';
import { Typography } from '@/constants/Typography';
import { Switch } from '@/components/Switch';

export function CodexPolicyEditor({
    group,
    onSave,
    onClose,
}: {
    group: CodexDeviceGroup;
    onSave: (group: CodexDeviceGroup) => Promise<void>;
    onClose: () => void;
}) {
    const { theme } = useUnistyles();
    const [name, setName] = useState(group.name);
    const [enabled, setEnabled] = useState(group.policy.enabled);
    const [syncBaseConfig, setSyncBaseConfig] = useState(group.policy.syncBaseConfig);
    const [syncMcpServers, setSyncMcpServers] = useState(group.policy.syncMcpServers);
    const [syncSkills, setSyncSkills] = useState(group.policy.syncSkills);
    const [baseConfig, setBaseConfig] = useState(JSON.stringify(group.policy.baseConfig, null, 2));
    const [mcpServers, setMcpServers] = useState(JSON.stringify(group.policy.mcpServers, null, 2));
    const [skills, setSkills] = useState(JSON.stringify(group.policy.skills, null, 2));
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setError(null);
        setSaving(true);
        try {
            const policy = CodexDevicePolicySchema.parse({
                revision: group.policy.revision + 1,
                enabled,
                syncBaseConfig,
                syncMcpServers,
                syncSkills,
                baseConfig: JSON.parse(baseConfig),
                mcpServers: JSON.parse(mcpServers),
                skills: JSON.parse(skills),
            });
            await onSave({ ...group, name: name.trim(), policy });
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Invalid Codex policy');
        } finally {
            setSaving(false);
        }
    };

    const field = (label: string, value: string, onChangeText: (value: string) => void, multiline = true) => (
        <View style={{ gap: 6 }}>
            <Text style={[Typography.default('semiBold'), { color: theme.colors.text, fontSize: 13 }]}>{label}</Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                multiline={multiline}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                    minHeight: multiline ? 112 : 44,
                    maxHeight: multiline ? 180 : 44,
                    borderWidth: 1,
                    borderColor: theme.colors.divider,
                    borderRadius: 6,
                    padding: 10,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.groupped.background,
                    textAlignVertical: 'top',
                    fontFamily: multiline ? 'monospace' : undefined,
                    fontSize: 13,
                }}
            />
        </View>
    );

    return (
        <View style={{ width: '100%', maxWidth: 720, maxHeight: '88%', backgroundColor: theme.colors.surface, borderRadius: 8, overflow: 'hidden' }}>
            <View style={{ minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.divider }}>
                <Text style={[Typography.default('semiBold'), { flex: 1, color: theme.colors.text, fontSize: 17 }]}>Codex group policy</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
                    <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
                </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
                {field('Group name', name, setName, false)}
                <View style={{ gap: 4 }}>
                    {([
                        ['Enable managed policy', enabled, setEnabled],
                        ['Sync base config', syncBaseConfig, setSyncBaseConfig],
                        ['Sync MCP servers', syncMcpServers, setSyncMcpServers],
                        ['Sync Skills', syncSkills, setSyncSkills],
                    ] as const).map(([label, value, setter]) => (
                        <View key={label} style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={[Typography.default('regular'), { color: theme.colors.text, fontSize: 14 }]}>{label}</Text>
                            <Switch
                                value={value}
                                onValueChange={setter}
                                disabled={label !== 'Enable managed policy' && !enabled}
                            />
                        </View>
                    ))}
                </View>
                {field('Base config', baseConfig, setBaseConfig)}
                {field('MCP servers', mcpServers, setMcpServers)}
                {field('Skills', skills, setSkills)}
                {error ? <Text selectable style={{ color: theme.colors.textDestructive, fontSize: 12 }}>{error}</Text> : null}
            </ScrollView>
            <View style={{ minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: theme.colors.divider }}>
                <Pressable onPress={onClose} disabled={saving} style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Text style={{ color: theme.colors.textSecondary }}>Cancel</Text>
                </Pressable>
                <Pressable
                    onPress={() => void save()}
                    disabled={saving || name.trim().length === 0}
                    style={{ minWidth: 92, minHeight: 40, paddingHorizontal: 14, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: theme.colors.button.primary.background, opacity: saving ? 0.6 : 1 }}
                >
                    <Ionicons name="checkmark" size={18} color={theme.colors.button.primary.tint} />
                    <Text style={{ color: theme.colors.button.primary.tint, fontWeight: '600' }}>{saving ? 'Saving' : 'Save'}</Text>
                </Pressable>
            </View>
        </View>
    );
}
