import { describe, expect, it } from 'vitest';
import { isSessionTurnBusy } from './composerSubmission';

describe('composer submission state', () => {
    it('keeps normal submission blocked while the agent is thinking', () => {
        expect(isSessionTurnBusy({ thinking: true, agentState: null })).toBe(true);
    });

    it('keeps normal submission blocked while permission is pending', () => {
        expect(isSessionTurnBusy({
            thinking: false,
            agentState: { requests: { request: { tool: 'shell', arguments: {}, createdAt: null, toolUseId: null } } },
        })).toBe(true);
    });

    it('allows normal submission after the turn becomes idle', () => {
        expect(isSessionTurnBusy({ thinking: false, agentState: { requests: {} } })).toBe(false);
    });
});
