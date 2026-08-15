import { describe, expect, it } from 'vitest';
import { reduceCodexActivityState } from './codexActivityState';

describe('reduceCodexActivityState', () => {
    it('marks a turn busy before the provider acknowledges it', () => {
        expect(reduceCodexActivityState('idle', 'turn-dispatched')).toBe('thinking');
    });

    it('keeps command execution and the following provider wait non-idle', () => {
        let state = reduceCodexActivityState('thinking', 'command-started');
        expect(state).toBe('tool');

        state = reduceCodexActivityState(state, 'command-completed');
        expect(state).toBe('thinking');
    });

    it('only returns to idle after the turn settles', () => {
        expect(reduceCodexActivityState('tool', 'turn-completed')).toBe('idle');
        expect(reduceCodexActivityState('streaming', 'turn-aborted')).toBe('idle');
    });
});
