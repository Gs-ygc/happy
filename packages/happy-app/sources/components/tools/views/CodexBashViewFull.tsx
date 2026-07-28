import * as React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { CommandView } from '@/components/CommandView';
import { ToolCall } from '@/sync/typesMessage';
import { getTerminalToolCommand, getTerminalToolOutput } from '@/utils/toolDisplay';

export const CodexBashViewFull = React.memo((props: { tool: ToolCall }) => {
    const output = getTerminalToolOutput(props.tool);
    const command = getTerminalToolCommand(props.tool) ?? '';

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                contentContainerStyle={styles.scrollContent}
            >
                <View style={styles.commandWrapper}>
                    <CommandView
                        command={command}
                        stdout={output?.stdout}
                        stderr={output?.stderr}
                        error={output?.error}
                        fullWidth
                    />
                </View>
            </ScrollView>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        paddingTop: 32,
        paddingBottom: 64,
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    commandWrapper: {
        flex: 1,
        minWidth: '100%',
    },
});
