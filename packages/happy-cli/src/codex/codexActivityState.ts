import type { SessionActivityState } from '@slopus/happy-wire';

export type CodexActivitySignal =
    | 'turn-dispatched'
    | 'turn-started'
    | 'reasoning'
    | 'message-streaming'
    | 'command-started'
    | 'command-completed'
    | 'patch-started'
    | 'patch-completed'
    | 'turn-completed'
    | 'turn-aborted';

export function reduceCodexActivityState(
    current: SessionActivityState,
    signal: CodexActivitySignal,
): SessionActivityState {
    switch (signal) {
        case 'message-streaming':
            return 'streaming';
        case 'command-started':
        case 'patch-started':
            return 'tool';
        case 'turn-completed':
        case 'turn-aborted':
            return 'idle';
        case 'turn-dispatched':
        case 'turn-started':
        case 'reasoning':
        case 'command-completed':
        case 'patch-completed':
            return 'thinking';
        default:
            return current;
    }
}
