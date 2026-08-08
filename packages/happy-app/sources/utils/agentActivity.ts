import type { Message, ToolCallMessage } from '@/sync/typesMessage';
import { getToolSummaryCategory, getToolSummaryDetail } from './toolDisplay';

export type AgentActivityKind =
    | 'user'
    | 'streaming'
    | 'thinking'
    | 'tool'
    | 'diff'
    | 'goal'
    | 'permission'
    | 'completed'
    | 'error';

export type AgentActivityStatus = 'running' | 'completed' | 'waiting' | 'error';

export interface AgentActivity {
    id: string;
    kind: AgentActivityKind;
    title: string;
    summary: string | null;
    status: AgentActivityStatus;
    timestamp: number;
    expandable: boolean;
    messageIds: string[];
    durationMs?: number;
    progress?: { completed: number; total: number; label: string };
}

function projectTool(message: ToolCallMessage): AgentActivity {
    const { tool } = message;
    const permissionPending = tool.permission?.status === 'pending';
    const category = getToolSummaryCategory(tool.name);
    const durationMs = tool.startedAt !== null && tool.completedAt !== null
        ? Math.max(0, tool.completedAt - tool.startedAt)
        : undefined;
    const status: AgentActivityStatus = permissionPending
        ? 'waiting'
        : tool.state === 'error'
            ? 'error'
            : tool.state;

    return {
        id: message.id,
        kind: permissionPending ? 'permission' : category === 'edit' ? 'diff' : 'tool',
        title: tool.name.trim() || 'Tool',
        summary: getToolSummaryDetail(tool),
        status,
        timestamp: message.createdAt,
        expandable: true,
        messageIds: [message.id],
        ...(durationMs !== undefined ? { durationMs } : {}),
    };
}

export function projectAgentActivities(messages: readonly Message[]): AgentActivity[] {
    return messages.map((message): AgentActivity => {
        if (message.kind === 'user-text') {
            return {
                id: message.id,
                kind: 'user',
                title: 'You',
                summary: message.displayText ?? message.text,
                status: 'completed',
                timestamp: message.createdAt,
                expandable: false,
                messageIds: [message.id],
            };
        }
        if (message.kind === 'agent-text') {
            return {
                id: message.id,
                kind: message.isThinking ? 'thinking' : 'streaming',
                title: message.isThinking ? 'Thinking' : 'Agent',
                summary: message.text,
                status: 'completed',
                timestamp: message.createdAt,
                expandable: !!message.isThinking,
                messageIds: [message.id],
            };
        }
        if (message.kind === 'tool-call') {
            return projectTool(message);
        }

        const isError = message.event.type === 'limit-reached';
        return {
            id: message.id,
            kind: isError ? 'error' : message.event.type === 'ready' ? 'completed' : 'streaming',
            title: isError ? 'Limit reached' : message.event.type === 'ready' ? 'Ready' : 'Agent event',
            summary: message.event.type === 'message' ? message.event.message : null,
            status: isError ? 'error' : 'completed',
            timestamp: message.createdAt,
            expandable: false,
            messageIds: [message.id],
        };
    });
}
