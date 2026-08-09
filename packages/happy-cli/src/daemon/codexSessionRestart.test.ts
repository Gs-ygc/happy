import { describe, expect, it } from 'vitest';
import { isRestartableCodexSession } from './codexSessionRestart';

describe('isRestartableCodexSession', () => {
    const base = {
        happySessionId: 'session-1',
        happySessionMetadataFromLocalWebhook: { flavor: 'codex' },
        encryption: { encryptionKey: new Uint8Array(), encryptionVariant: 'dataKey' as const, seq: 0, metadataVersion: 0, agentStateVersion: 0 },
    };

    it('accepts only daemon-owned Codex child processes', () => {
        expect(isRestartableCodexSession({ ...base, startedBy: 'daemon', childProcess: {} })).toBe(true);
        expect(isRestartableCodexSession({ ...base, startedBy: 'happy directly - likely by user from terminal', childProcess: {} })).toBe(false);
        expect(isRestartableCodexSession({ ...base, startedBy: 'daemon' })).toBe(false);
        expect(isRestartableCodexSession({ ...base, startedBy: 'daemon', childProcess: {}, happySessionMetadataFromLocalWebhook: { flavor: 'claude' } })).toBe(false);
    });
});
