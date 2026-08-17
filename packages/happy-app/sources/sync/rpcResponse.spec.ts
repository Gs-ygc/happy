import { describe, expect, it } from 'vitest';
import { unwrapRpcResponse } from './rpcResponse';

describe('unwrapRpcResponse', () => {
    it('throws an encrypted daemon error envelope with its original message', () => {
        expect(() => unwrapRpcResponse({ error: 'Codex config changed since it was loaded' }))
            .toThrow('Codex config changed since it was loaded');
    });

    it('preserves normal RPC objects that contain additional error context', () => {
        expect(unwrapRpcResponse({ success: false, error: 'not found' }))
            .toEqual({ success: false, error: 'not found' });
    });
});
