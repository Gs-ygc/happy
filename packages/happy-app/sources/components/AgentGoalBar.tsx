import { Ionicons } from '@expo/vector-icons';
import { t } from '@/text';
import type { VisibleAgentGoalStatus } from './agentGoalStatus';
import * as React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

export type AgentGoalAction = 'clear' | 'stop' | 'edit';

type AgentGoalBarProps = {
    goal: VisibleAgentGoalStatus;
    onAction?: (action: AgentGoalAction) => void;
    inFlightAction?: AgentGoalAction | null;
    onPressDetails?: () => void;
};

function formatCount(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    return String(value);
}

function formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

export function getGoalProgressText(goal: VisibleAgentGoalStatus): string | null {
    const progress = goal.progress;
    if (!progress) return null;

    const parts: string[] = [];
    if (progress.state && progress.state !== 'active') {
        parts.push(progress.state.replace(/([A-Z])/g, ' $1').toLowerCase());
    }
    if (progress.currentStep && progress.totalSteps) {
        parts.push(`${progress.currentStep}/${progress.totalSteps}`);
    }
    if (progress.tokensUsed !== undefined) {
        parts.push(progress.tokenBudget
            ? `${formatCount(progress.tokensUsed)}/${formatCount(progress.tokenBudget)} tokens`
            : `${formatCount(progress.tokensUsed)} tokens`);
    }
    if (progress.timeUsedSeconds !== undefined) {
        parts.push(formatDuration(progress.timeUsedSeconds));
    }
    return parts.length > 0 ? parts.join(' · ') : null;
}

const ACTION_CONFIG: Array<{
    action: AgentGoalAction;
    capability: keyof NonNullable<VisibleAgentGoalStatus['capabilities']>;
    icon: keyof typeof Ionicons.glyphMap;
}> = [
    { action: 'edit', capability: 'edit', icon: 'create-outline' },
    { action: 'stop', capability: 'stop', icon: 'pause-outline' },
    { action: 'clear', capability: 'clear', icon: 'trash-outline' },
];

export function AgentGoalBar(props: AgentGoalBarProps) {
    const { theme } = useUnistyles();
    const actions = props.onAction
        ? ACTION_CONFIG.filter((item) => props.goal.capabilities?.[item.capability])
        : [];
    const actionLabels: Record<AgentGoalAction, string> = {
        edit: t('components.agentGoalBar.editGoal'),
        stop: t('components.agentGoalBar.stopGoal'),
        clear: t('components.agentGoalBar.clearGoal'),
    };
    const progressText = getGoalProgressText(props.goal);
    const tokenProgress = props.goal.progress?.tokenBudget
        ? Math.min(1, (props.goal.progress.tokensUsed ?? 0) / props.goal.progress.tokenBudget)
        : null;

    return (
        <Pressable
            accessibilityLabel={t('components.agentGoalBar.accessibilityLabel', { goal: props.goal.text })}
            onPress={props.onPressDetails}
            style={({ pressed }) => ({
                backgroundColor: theme.colors.surfaceHigh,
                borderColor: theme.colors.divider,
                borderWidth: 1,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 8,
                opacity: pressed && props.onPressDetails ? 0.8 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
            })}
        >
            <Ionicons name="locate-outline" size={18} color={theme.colors.textSecondary} />
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                    style={{
                        color: theme.colors.textSecondary,
                        fontSize: 12,
                        lineHeight: 16,
                        fontWeight: '600',
                    }}
                    numberOfLines={1}
                >
                    {t('components.agentGoalBar.currentGoal')}
                </Text>
                <Text
                    style={{
                        color: theme.colors.text,
                        fontSize: 14,
                        lineHeight: 19,
                    }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                >
                    {props.goal.text}
                </Text>
                {progressText && (
                    <Text
                        style={{
                            color: theme.colors.textSecondary,
                            fontSize: 11,
                            lineHeight: 15,
                            marginTop: 2,
                        }}
                        numberOfLines={1}
                    >
                        {progressText}
                    </Text>
                )}
                {tokenProgress !== null && (
                    <View style={{ height: 3, borderRadius: 2, backgroundColor: theme.colors.divider, marginTop: 6, overflow: 'hidden' }}>
                        <View
                            style={{
                                height: 3,
                                borderRadius: 2,
                                backgroundColor: theme.colors.button.secondary.tint,
                                width: `${Math.round(tokenProgress * 100)}%`,
                            }}
                        />
                    </View>
                )}
            </View>
            {actions.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {actions.map((item) => {
                        const disabled = props.inFlightAction === item.action;
                        return (
                            <Pressable
                                key={item.action}
                                accessibilityRole="button"
                                accessibilityLabel={actionLabels[item.action]}
                                accessibilityState={{ disabled }}
                                disabled={disabled}
                                onPress={() => props.onAction?.(item.action)}
                                hitSlop={8}
                                style={({ pressed }) => ({
                                    width: 30,
                                    height: 30,
                                    borderRadius: 15,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent',
                                    opacity: disabled ? 0.6 : 1,
                                })}
                            >
                                {disabled ? (
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                ) : (
                                    <Ionicons name={item.icon} size={16} color={theme.colors.button.secondary.tint} />
                                )}
                            </Pressable>
                        );
                    })}
                </View>
            )}
        </Pressable>
    );
}
