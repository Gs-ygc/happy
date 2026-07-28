import { ToolCall } from '@/sync/typesMessage';
import { stringifyToolCommand } from './toolCommand';

const TERMINAL_TOOL_NAMES = new Set([
    'Bash',
    'CodexBash',
    'GeminiBash',
    'shell',
    'execute',
]);

const EDIT_TOOL_NAMES = new Set([
    'Edit',
    'MultiEdit',
    'Write',
    'CodexPatch',
    'GeminiPatch',
    'edit',
    'NotebookEdit',
]);

const READ_TOOL_NAMES = new Set([
    'Read',
    'read',
    'NotebookRead',
    'LS',
]);

const SEARCH_TOOL_NAMES = new Set([
    'Grep',
    'Glob',
    'search',
    'WebSearch',
]);

const WEB_TOOL_NAMES = new Set([
    'WebFetch',
]);

const TASK_TOOL_NAMES = new Set([
    'Task',
    'Agent',
]);

export type ToolSummaryCategory = 'terminal' | 'edit' | 'read' | 'search' | 'web' | 'task' | 'other';

export type TerminalToolOutput = {
    stdout?: string;
    stderr?: string;
    error?: string;
};

export function isTerminalToolName(name: string): boolean {
    return TERMINAL_TOOL_NAMES.has(name);
}

export function shouldRenderToolCardHeader(toolName: string, platformOS: string): boolean {
    return !(platformOS === 'web' && toolName === 'CodexPatch');
}

export function getToolSummaryCategory(toolName: string): ToolSummaryCategory {
    if (TERMINAL_TOOL_NAMES.has(toolName)) {
        return 'terminal';
    }
    if (EDIT_TOOL_NAMES.has(toolName)) {
        return 'edit';
    }
    if (READ_TOOL_NAMES.has(toolName)) {
        return 'read';
    }
    if (SEARCH_TOOL_NAMES.has(toolName)) {
        return 'search';
    }
    if (WEB_TOOL_NAMES.has(toolName)) {
        return 'web';
    }
    if (TASK_TOOL_NAMES.has(toolName)) {
        return 'task';
    }
    return 'other';
}

export function getToolSummaryDetail(tool: Pick<ToolCall, 'name' | 'input' | 'description'>): string | null {
    const terminalCommand = getTerminalToolCommand(tool);
    if (terminalCommand) {
        return terminalCommand;
    }

    const filePath = tool.input?.file_path;
    if (typeof filePath === 'string' && filePath.trim().length > 0) {
        return filePath.trim();
    }

    const patchFiles = getPatchFiles(tool.input);
    if (patchFiles.length > 0) {
        if (patchFiles.length === 1) {
            return patchFiles[0];
        }
        return `${patchFiles[0]} +${patchFiles.length - 1}`;
    }

    const path = tool.input?.path;
    if (typeof path === 'string' && path.trim().length > 0) {
        return path.trim();
    }

    const pattern = tool.input?.pattern;
    if (typeof pattern === 'string' && pattern.trim().length > 0) {
        return pattern.trim();
    }

    const url = tool.input?.url;
    if (typeof url === 'string' && url.trim().length > 0) {
        return url.trim();
    }

    return tool.description?.trim() || null;
}

export function getTerminalToolCommand(tool: Pick<ToolCall, 'name' | 'input'>): string | null {
    if (!isTerminalToolName(tool.name)) {
        return null;
    }

    const parsedCmd = tool.input?.parsed_cmd;
    if (Array.isArray(parsedCmd) && parsedCmd.length > 0) {
        const cmd = parsedCmd.find((item) => typeof item?.cmd === 'string' && item.cmd.trim().length > 0)?.cmd;
        if (cmd) {
            return cmd.trim();
        }
    }

    const directCommand = stringifyToolCommand(tool.input?.command);
    if (directCommand) {
        return directCommand;
    }

    const title = tool.input?.toolCall?.title;
    if (typeof title === 'string') {
        const bracketIdx = title.indexOf(' [');
        const command = bracketIdx > 0 ? title.substring(0, bracketIdx) : title;
        const trimmed = command.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }

    return null;
}

/**
 * Normalizes the result shapes emitted by the supported terminal tools so the
 * compact transcript can render their output without knowing the provider.
 */
export function getTerminalToolOutput(tool: Pick<ToolCall, 'state' | 'result'>): TerminalToolOutput | null {
    if (tool.result === undefined || tool.result === null) {
        return null;
    }

    if (tool.state === 'error') {
        return { error: stringifyToolResult(tool.result) };
    }

    if (typeof tool.result === 'string') {
        return tool.result.trim().length > 0 ? { stdout: tool.result } : null;
    }

    if (typeof tool.result === 'object') {
        const result = tool.result as Record<string, unknown>;
        const stdout = getOutputText(result.stdout)
            ?? getOutputText(result.output)
            ?? getOutputText(result.content)
            ?? getOutputText(result.aggregated_output);
        const stderr = getOutputText(result.stderr);
        const error = getOutputText(result.error);

        if (stdout || stderr || error) {
            return { stdout, stderr, error };
        }
    }

    return { stdout: stringifyToolResult(tool.result) };
}

function getOutputText(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value.trim().length > 0 ? value : undefined;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (value !== undefined && value !== null) {
        return stringifyToolResult(value);
    }
    return undefined;
}

function stringifyToolResult(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    try {
        const result = JSON.stringify(value, null, 2);
        return typeof result === 'string' ? result : String(value);
    } catch {
        return String(value);
    }
}

function getPatchFiles(input: any): string[] {
    if (input?.changes && typeof input.changes === 'object' && !Array.isArray(input.changes)) {
        return Object.keys(input.changes);
    }
    if (input?.fileChanges && typeof input.fileChanges === 'object' && !Array.isArray(input.fileChanges)) {
        return Object.keys(input.fileChanges);
    }
    if (Array.isArray(input?.changes)) {
        return input.changes
            .map((change: unknown) => {
                if (!change || typeof change !== 'object' || Array.isArray(change)) {
                    return null;
                }
                const path = (change as { path?: unknown }).path;
                return typeof path === 'string' && path.trim().length > 0 ? path.trim() : null;
            })
            .filter((path: string | null): path is string => path !== null);
    }
    if (Array.isArray(input?.fileChanges)) {
        return input.fileChanges
            .map((change: unknown) => {
                if (!change || typeof change !== 'object' || Array.isArray(change)) {
                    return null;
                }
                const path = (change as { path?: unknown }).path;
                return typeof path === 'string' && path.trim().length > 0 ? path.trim() : null;
            })
            .filter((path: string | null): path is string => path !== null);
    }
    return [];
}
