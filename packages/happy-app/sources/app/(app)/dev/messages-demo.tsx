import * as React from 'react';
import { FlatList, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { MessageView } from '@/components/MessageView';
import { debugMessages } from './messages-demo-data';
import { Message } from '@/sync/typesMessage';
import { useDemoMessages } from '@/hooks/useDemoMessages';
import { AgentGoalBar } from '@/components/AgentGoalBar';
import type { VisibleAgentGoalStatus } from '@/components/agentGoalStatus';

const DEMO_GOAL: VisibleAgentGoalStatus = {
    source: 'codex',
    status: 'active',
    text: 'Improve the Codex long-task review experience',
    sourceSessionId: 'demo-codex-thread',
    observedAt: Date.now(),
    providerStatus: 'active',
    progress: {
        state: 'active',
        tokensUsed: 18_500,
        tokenBudget: 50_000,
        timeUsedSeconds: 754,
    },
    capabilities: {
        edit: true,
        clear: true,
    },
};

export default React.memo(function MessagesDemoScreen() {
    // Combine all demo messages
    const allMessages = [...debugMessages];

    // Load demo messages into session storage
    const sessionId = useDemoMessages(allMessages);

    return (
        <View style={styles.container}>
            <View style={styles.goalPreview}>
                <AgentGoalBar goal={DEMO_GOAL} onAction={() => {}} />
            </View>
            {allMessages.length > 0 && (
                <FlatList
                    data={allMessages}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <MessageView
                            message={item}
                            metadata={null}
                            sessionId={sessionId}
                            getMessageById={(id: string): Message | null => {
                                return allMessages.find((m)=>m.id === id) || null;
                            }}
                        />
                    )}
                    style={{ flexGrow: 1, flexBasis: 0 }}
                    contentContainerStyle={{ paddingVertical: 20 }}
                />
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    goalPreview: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
}));
