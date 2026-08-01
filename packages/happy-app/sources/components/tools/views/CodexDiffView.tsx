import * as React from 'react';
import { Pressable, View, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons, Octicons } from '@expo/vector-icons';
import { ToolCall } from '@/sync/typesMessage';
import { ToolSectionView } from '../ToolSectionView';
import { ToolDiffView } from '@/components/tools/ToolDiffView';
import { Metadata } from '@/sync/storageTypes';
import { splitUnifiedDiffFiles, UnifiedDiffFile } from '@/utils/codexUnifiedDiff';
import { getPatchDiffStats } from '@/components/diff/calculateDiff';

interface CodexDiffViewProps {
    tool: ToolCall;
    metadata: Metadata | null;
}

export const CodexDiffView = React.memo<CodexDiffViewProps>(({ tool }) => {
    const { input } = tool;
    const patch = typeof input?.unified_diff === 'string' ? input.unified_diff : undefined;
    const files = React.useMemo(() => (patch ? splitUnifiedDiffFiles(patch) : []), [patch]);

    if (!patch) return null;

    return (
        <>
            {files.map((file, index) => (
                <CodexDiffFile
                    key={`${file.fileName ?? 'diff'}-${index}`}
                    file={file}
                    initiallyExpanded={files.length === 1}
                />
            ))}
        </>
    );
});

const CodexDiffFile = React.memo(function CodexDiffFile({
    file,
    initiallyExpanded,
}: {
    file: UnifiedDiffFile;
    initiallyExpanded: boolean;
}) {
    const { theme } = useUnistyles();
    const [expanded, setExpanded] = React.useState(initiallyExpanded);
    const stats = React.useMemo(() => getPatchDiffStats(file.patch), [file.patch]);

    return (
        <ToolSectionView fullWidth>
            <View style={styles.fileGroup}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    onPress={() => setExpanded((value) => !value)}
                    style={({ pressed }) => [styles.fileHeader, pressed && styles.fileHeaderPressed]}
                >
                    <Ionicons
                        name={expanded ? 'chevron-down' : 'chevron-forward'}
                        size={14}
                        color={theme.colors.textSecondary}
                    />
                    <Octicons name="file-diff" size={15} color={theme.colors.textSecondary} />
                    <Text style={styles.fileName} numberOfLines={1}>{file.fileName ?? 'Changes'}</Text>
                    {stats.additions > 0 || stats.deletions > 0 ? (
                        <DiffStats additions={stats.additions} deletions={stats.deletions} />
                    ) : null}
                </Pressable>
                {expanded ? <ToolDiffView patch={file.patch} fileName={file.fileName} /> : null}
            </View>
        </ToolSectionView>
    );
});

const DiffStats = React.memo<{ additions: number; deletions: number }>(({ additions, deletions }) => (
    <View style={styles.stats}>
        {additions > 0 ? <Text style={styles.added}>+{additions}</Text> : null}
        {deletions > 0 ? <Text style={styles.removed}>-{deletions}</Text> : null}
    </View>
));

const styles = StyleSheet.create((theme) => ({
    fileGroup: {
        overflow: 'hidden',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    fileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: theme.colors.surfaceHigh,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    fileHeaderPressed: {
        opacity: 0.65,
    },
    fileName: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.textSecondary,
        fontFamily: 'monospace',
    },
    stats: {
        flexDirection: 'row',
        gap: 8,
    },
    added: {
        fontSize: 12,
        fontFamily: 'monospace',
        color: '#34C759',
    },
    removed: {
        fontSize: 12,
        fontFamily: 'monospace',
        color: '#FF3B30',
    },
}));
