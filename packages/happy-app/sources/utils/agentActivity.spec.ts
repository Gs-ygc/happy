import { describe, expect, it } from 'vitest';
import type { Message, ToolCallMessage } from '@/sync/typesMessage';
import { projectAgentActivities } from './agentActivity';

function toolMessage(overrides: Partial<ToolCallMessage> = {}): ToolCallMessage {
    return {
        kind: 'tool-call',
        id: 'tool-1',
        localId: null,
        createdAt: 20,
        children: [],
        tool: {
            name: 'exec_command',
            state: 'completed',
            input: { cmd: 'pnpm test' },
            createdAt: 20,
            startedAt: 22,
            completedAt: 1022,
            description: null,
            result: { stdout: 'ok' },
        },
        ...overrides,
    };
}

describe('projectAgentActivities', () => {
    it('keeps user, streaming, and thinking messages in source order', () => {
        const messages: Message[] = [
            { kind: 'user-text', id: 'u1', localId: null, createdAt: 1, text: 'Fix it' },
            { kind: 'agent-text', id: 'a1', localId: null, createdAt: 2, text: 'Working' },
            { kind: 'agent-text', id: 'a2', localId: null, createdAt: 3, text: 'Inspecting state', isThinking: true },
        ];

        expect(projectAgentActivities(messages).map((item) => ({ kind: item.kind, summary: item.summary }))).toEqual([
            { kind: 'user', summary: 'Fix it' },
            { kind: 'streaming', summary: 'Working' },
            { kind: 'thinking', summary: 'Inspecting state' },
        ]);
    });

    it('summarizes a completed terminal tool with elapsed time and command', () => {
        const [activity] = projectAgentActivities([toolMessage()]);
        expect(activity).toMatchObject({
            kind: 'tool',
            title: 'exec_command',
            summary: 'pnpm test',
            status: 'completed',
            durationMs: 1000,
            expandable: true,
        });
    });

    it('maps editing tools to diff activities', () => {
        const [activity] = projectAgentActivities([toolMessage({
            tool: {
                ...toolMessage().tool,
                name: 'CodexPatch',
                input: { changes: { '/repo/a.ts': { diff: '@@ -1 +1 @@' } } },
            },
        })]);
        expect(activity.kind).toBe('diff');
        expect(activity.summary).toContain('/repo/a.ts');
    });

    it('keeps pending permission visible even when the tool is otherwise running', () => {
        const [activity] = projectAgentActivities([toolMessage({
            tool: {
                ...toolMessage().tool,
                state: 'running',
                permission: { id: 'p1', status: 'pending' },
            },
        })]);
        expect(activity).toMatchObject({ kind: 'permission', status: 'waiting', expandable: true });
    });

    it('falls back safely for malformed tool payloads', () => {
        const [activity] = projectAgentActivities([toolMessage({
            tool: { ...toolMessage().tool, name: '', input: null, description: null },
        })]);
        expect(activity).toMatchObject({ kind: 'tool', title: 'Tool', summary: null });
    });
});
