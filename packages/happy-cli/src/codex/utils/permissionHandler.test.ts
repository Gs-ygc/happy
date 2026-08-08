import { describe, expect, it, vi } from 'vitest';

import { CodexPermissionHandler } from './permissionHandler';

function createFakeSession() {
    return {
        sessionId: 'session-1',
        getMetadata: () => ({ path: '/tmp/demo' }),
        updateAgentState: vi.fn(),
        rpcHandlerManager: { registerHandler: vi.fn() },
    } as any;
}

describe('CodexPermissionHandler', () => {
    it('invokes the notification callback when a tool request becomes pending', async () => {
        const session = createFakeSession();
        const onPermissionRequest = vi.fn();
        const handler = new CodexPermissionHandler(session, onPermissionRequest);

        const resultPromise = handler.handleToolCall('call-1', 'Bash', { command: 'ls' });

        expect(onPermissionRequest).toHaveBeenCalledTimes(1);
        expect(onPermissionRequest).toHaveBeenCalledWith({
            toolCallId: 'call-1',
            toolName: 'Bash',
            input: { command: 'ls' },
        });

        // Resolve via the registered RPC handler to avoid a dangling promise.
        const rpcHandler = session.rpcHandlerManager.registerHandler.mock.calls[0][1];
        await rpcHandler({ id: 'call-1', approved: true, decision: 'approved' });
        await expect(resultPromise).resolves.toEqual({ decision: 'approved' });
    });

    it('does not notify for auto-approved tools', async () => {
        const session = createFakeSession();
        const onPermissionRequest = vi.fn();
        const handler = new CodexPermissionHandler(session, onPermissionRequest);

        const result = await handler.handleToolCall('change_title-123', 'change_title', { title: 'x' });

        expect(result).toEqual({ decision: 'approved' });
        expect(onPermissionRequest).not.toHaveBeenCalled();
    });
});
