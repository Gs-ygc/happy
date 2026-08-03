import * as React from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { MarkdownView } from "./markdown/MarkdownView";
import { t } from '@/text';
import { Message, UserTextMessage, AgentTextMessage, ToolCallMessage } from "@/sync/typesMessage";
import { Metadata } from "@/sync/storageTypes";
import { ToolView } from "./tools/ToolView";
import { AgentEvent } from "@/sync/typesRaw";
import { sync } from '@/sync/sync';
import { useSetting, useLocalSetting } from '@/sync/storage';
import { Option } from './markdown/MarkdownView';
import * as Clipboard from 'expo-clipboard';
import { layout } from "./layout";
import { parseLocalCommandMessage, isUserSlashCommandEcho } from './parseLocalCommandMessage';
import { resolveUserMessageBubbleColor } from '@/utils/userMessageBubbleColor';


export const MessageView = React.memo((props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
  highlighted?: boolean;
  /** Opens the fork-from-message flow from the message action button. */
  onForkFromUserMessage?: (messageId: string, rewindPointId: string | undefined, messageText: string) => void;
}) => {
  return (
    <View style={[styles.messageContainer, props.highlighted && styles.messageHighlighted]}>
      <View style={styles.messageContent}>
        <RenderBlock
          message={props.message}
          metadata={props.metadata}
          sessionId={props.sessionId}
          getMessageById={props.getMessageById}
          onForkFromUserMessage={props.onForkFromUserMessage}
        />
      </View>
    </View>
  );
});

// RenderBlock function that dispatches to the correct component based on message kind
function CopyButton({ text }: { text: string }) {
    const { theme } = useUnistyles();
    const [copied, setCopied] = React.useState(false);
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const handleCopy = React.useCallback(async () => {
        try {
            await Clipboard.setStringAsync(text);
            setCopied(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setCopied(false), 1600);
        } catch (error) {
            console.error("Failed to copy:", error);
        }
    }, [text]);

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? t("common.copied") : t("common.copy")}
            onPress={handleCopy}
            hitSlop={8}
            style={({ pressed }) => [
                styles.copyButton,
                pressed && styles.copyButtonPressed,
            ]}
        >
            <Ionicons
                name={copied ? "checkmark" : "copy-outline"}
                size={14}
                color={copied ? theme.colors.success : theme.colors.textSecondary}
            />
        </Pressable>
    );
}

function RenderBlock(props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
  onForkFromUserMessage?: (messageId: string, rewindPointId: string | undefined, messageText: string) => void;
}): React.ReactElement {
  switch (props.message.kind) {
    case 'user-text':
      return (
        <UserTextBlock
          message={props.message}
          metadata={props.metadata}
          sessionId={props.sessionId}
          onForkFromUserMessage={props.onForkFromUserMessage}
        />
      );

    case 'agent-text':
      return <AgentTextBlock message={props.message} metadata={props.metadata} sessionId={props.sessionId} />;

    case 'tool-call':
      return <ToolCallBlock
        message={props.message}
        metadata={props.metadata}
        sessionId={props.sessionId}
        getMessageById={props.getMessageById}
      />;

    case 'agent-event':
      return <AgentEventBlock event={props.message.event} metadata={props.metadata} />;


    default:
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = props.message;
      throw new Error(`Unknown message kind: ${_exhaustive}`);
  }
}

function UserTextBlock(props: {
  message: UserTextMessage;
  metadata: Metadata | null;
  sessionId: string;
  onForkFromUserMessage?: (messageId: string, rewindPointId: string | undefined, messageText: string) => void;
}) {
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title, { source: 'option' });
  }, [props.sessionId]);

  const rewindPointId = props.message.claudeUuid ?? props.message.codexItemId;
  const canFork = Boolean(props.onForkFromUserMessage)
    && (Boolean(rewindPointId) || props.metadata?.flavor === 'codex');
  const userMessageBubbleColor = useSetting('userMessageBubbleColor');
  const { theme } = useUnistyles();
  const bubblePalette = resolveUserMessageBubbleColor(userMessageBubbleColor, theme.dark);
  // No border — matches the pre-picker bubble; color presets only tint the background
  const bubbleStyle = {
    backgroundColor: bubblePalette.background,
  };
  const handleForkPress = React.useCallback(() => {
    if (props.onForkFromUserMessage) {
      props.onForkFromUserMessage(props.message.id, rewindPointId, props.message.text);
    }
  }, [props.message.id, props.message.text, props.onForkFromUserMessage, rewindPointId]);
  const renderForkButton = (marginBottom: number) => canFork ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('session.forkFromHere')}
      hitSlop={8}
      onPress={handleForkPress}
      {...(Platform.OS === 'web' ? ({ title: t('session.forkFromHere') } as any) : {})}
      style={({ pressed }) => [
        styles.forkButton,
        { marginBottom },
        pressed && styles.forkButtonPressed,
      ]}
    >
      <Ionicons name="git-branch-outline" size={16} color={theme.colors.textSecondary} />
    </Pressable>
  ) : null;

  // Claude Agent SDK emits synthetic user messages wrapped in tags like
  // <local-command-caveat>…</local-command-caveat> and
  // <command-message>…</command-message><command-name>/foo</command-name>
  // whenever a slash command runs. The plain MarkdownView renders these as
  // literal text, which looks broken. Collapse them into chips or hide
  // them entirely depending on what kind of wrapper this is.
  // The user's own slash-command input is shown optimistically (carries a
  // localId); the SDK then injects the canonical wrapper chip. Hide the raw
  // echo so we don't render the command twice. Gated to Claude flavor only:
  // Codex/Gemini don't reliably emit the <command-*> wrapper, so hiding the
  // echo there would drop the command with nothing to replace it. (Absent
  // flavor == Claude, matching the convention used elsewhere.)
  const isClaudeFlavor = !props.metadata?.flavor || props.metadata.flavor === 'claude';
  if (isClaudeFlavor && isUserSlashCommandEcho(props.message.text, props.message.localId != null)) {
    return null;
  }

  const parsed = parseLocalCommandMessage(props.message.displayText || props.message.text);
  if (parsed.kind === 'caveat') {
    return null;
  }
  if (parsed.kind === 'goal-confirmation') {
    return null;
  }
  if (parsed.kind === 'goal-run') {
    return (
      <View style={styles.userMessageContainer}>
        <View style={styles.userMessageRow}>
          {renderForkButton(6)}
          <View style={[styles.userMessageBubble, bubbleStyle, styles.goalMessageBubble]}>
            <MarkdownView markdown={parsed.goal} onOptionPress={handleOptionPress} sessionId={props.sessionId} />
          </View>
        </View>
        <View style={styles.goalSentRow}>
          <Ionicons name="locate-outline" size={16} color={styles.goalSentText.color} />
          <Text style={styles.goalSentText}>{t('message.sentAsGoal')}</Text>
        </View>
      </View>
    );
  }
  if (parsed.kind === 'command-run') {
    return (
      <View style={styles.userMessageContainer}>
        {parsed.args ? (
          <View style={styles.userMessageRow}>
            {renderForkButton(6)}
            <View style={[styles.userMessageBubble, bubbleStyle, styles.commandMessageBubble]}>
              <MarkdownView markdown={parsed.args} onOptionPress={handleOptionPress} sessionId={props.sessionId} />
            </View>
          </View>
        ) : null}
        <View style={styles.userMessageRow}>
          {!parsed.args ? renderForkButton(12) : null}
          <View style={[styles.commandChip, bubbleStyle]}>
            <Text style={styles.commandChipText}>/{parsed.commandName}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.userMessageContainer}>
      <View style={styles.userMessageRow}>
        {renderForkButton(12)}
        <View style={[styles.userMessageBubble, bubbleStyle]}>
          <MarkdownView markdown={parsed.text} onOptionPress={handleOptionPress} sessionId={props.sessionId} />
        </View>
      </View>
      <View style={styles.copyRow}>
        <CopyButton text={parsed.text} />
      </View>
    </View>
  );
}

function ThinkingBlock({ text }: { text: string }) {
    const { theme } = useUnistyles();
    const [expanded, setExpanded] = React.useState(false);
    const displayText = text.replace(/^\*|\*$/g, "");
    const toggleExpanded = React.useCallback(() => {
        setExpanded((current) => !current);
    }, []);

    return (
        <View style={styles.agentMessageContainer}>
            <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={toggleExpanded}
                style={({ pressed }) => [
                    styles.thinkingHeader,
                    pressed && { opacity: 0.7 },
                ]}
            >
                <Ionicons
                    name={expanded ? "chevron-down" : "chevron-forward"}
                    size={14}
                    color={theme.colors.textSecondary}
                />
                <Ionicons name="bulb-outline" size={14} color={theme.colors.textSecondary} />
                <Text style={styles.thinkingHeaderText} numberOfLines={1}>
                    {t('sessionInfo.thinking')}
                </Text>
            </Pressable>
            {expanded ? (
                <View style={styles.thinkingContent}>
                    <MarkdownView markdown={displayText} />
                </View>
            ) : null}
        </View>
    );
}

function AgentTextBlock(props: {
  message: AgentTextMessage;
  metadata: Metadata | null;
  sessionId: string;
}) {
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title, { source: 'option' });
  }, [props.sessionId]);

  const showThinking = useLocalSetting('showThinking') || props.metadata?.flavor === 'codex';

  // Show thinking as a collapsed expandable block when enabled
  if (props.message.isThinking) {
    if (!showThinking) return null;
    return <ThinkingBlock text={props.message.text} />;
  }
  return (
    <View style={styles.agentMessageContainer}>
      <MarkdownView markdown={props.message.text} onOptionPress={handleOptionPress} sessionId={props.sessionId} />
      <View style={styles.copyRow}>
        <CopyButton text={props.message.text} />
      </View>
    </View>
  );
}

function AgentEventBlock(props: {
  event: AgentEvent;
  metadata: Metadata | null;
}) {
  if (props.event.type === 'switch') {
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>{t('message.switchedToMode', { mode: props.event.mode })}</Text>
      </View>
    );
  }
  if (props.event.type === 'message') {
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>{props.event.message}</Text>
      </View>
    );
  }
  if (props.event.type === 'limit-reached') {
    const formatTime = (timestamp: number): string => {
      try {
        const date = new Date(timestamp * 1000); // Convert from Unix timestamp
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return t('message.unknownTime');
      }
    };

    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>
          {t('message.usageLimitUntil', { time: formatTime(props.event.endsAt) })}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.agentEventContainer}>
      <Text style={styles.agentEventText}>{t('message.unknownEvent')}</Text>
    </View>
  );
}

function ToolCallBlock(props: {
  message: ToolCallMessage;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
}) {
  if (!props.message.tool) {
    return null;
  }
  return (
    <View style={styles.toolContainer}>
      <ToolView
        tool={props.message.tool}
        metadata={props.metadata}
        messages={props.message.children}
        sessionId={props.sessionId}
        messageId={props.message.id}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  messageContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  messageHighlighted: {
    backgroundColor: theme.colors.textLink + '20',
  },
  messageContent: {
    flexDirection: 'column',
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: layout.maxWidth,
    overflow: 'hidden',
  },
  userMessageContainer: {
    maxWidth: '100%',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  userMessageRow: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  forkButton: {
    width: 30,
    height: 30,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    backgroundColor: theme.colors.surfaceHigh,
    flexShrink: 0,
  },
  forkButtonPressed: {
    opacity: 0.6,
  },
  userMessageBubble: {
    backgroundColor: theme.colors.userMessageBackground,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
  },
  goalMessageBubble: {
    marginBottom: 6,
  },
  commandMessageBubble: {
    marginBottom: 6,
  },
  goalSentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    maxWidth: '100%',
    opacity: 0.72,
  },
  goalSentText: {
    color: theme.colors.agentEventText,
    fontSize: 14,
  },
  commandChip: {
    backgroundColor: theme.colors.userMessageBackground,
    borderColor: theme.colors.divider,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 12,
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
    opacity: 0.65,
  },
  commandChipText: {
    color: theme.colors.input.text,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  agentMessageContainer: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 16,
    borderRadius: 16,
    maxWidth: '100%',
  },
  thinkingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceHigh,
  },
  thinkingHeaderText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    flexShrink: 1,
  },
  thinkingContent: {
    marginTop: 6,
    paddingHorizontal: 4,
  },
  agentEventContainer: {
    marginHorizontal: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  agentEventText: {
    color: theme.colors.agentEventText,
    fontSize: 14,
  },
  toolContainer: {
    marginHorizontal: 8,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  debugText: {
    color: theme.colors.agentEventText,
    fontSize: 12,
  },
  copyRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 2,
  },
  copyButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.5,
  },
  copyButtonPressed: {
    opacity: 0.9,
  },
}));
