import { z } from 'zod';

/** Provider activity, separate from daemon/session liveness. */
export const SessionActivityStateSchema = z.enum([
    'idle',
    'thinking',
    'streaming',
    'tool',
    'permission',
    'goal',
]);
export type SessionActivityState = z.infer<typeof SessionActivityStateSchema>;
