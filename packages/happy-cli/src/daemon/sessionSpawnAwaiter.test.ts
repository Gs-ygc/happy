import { describe, expect, it, vi } from 'vitest';

import { registerSpawnAwaiter, settleSpawnAwaiter, type SpawnAwaiter } from './sessionSpawnAwaiter';

describe('session spawn awaiters', () => {
  it('immediately succeeds when a webhook arrived before registration', () => {
    const awaiters = new Map<number, SpawnAwaiter>();
    const complete = vi.fn();

    registerSpawnAwaiter(awaiters, 42, complete, 'session-1', true);

    expect(complete).toHaveBeenCalledWith({ type: 'success', sessionId: 'session-1' });
    expect(awaiters.size).toBe(0);
  });

  it('immediately fails when the child exited before registration', () => {
    const awaiters = new Map<number, SpawnAwaiter>();
    const complete = vi.fn();

    registerSpawnAwaiter(awaiters, 43, complete, undefined, false);

    expect(complete).toHaveBeenCalledWith({
      type: 'error',
      errorMessage: 'Happy process PID 43 exited before reporting its session',
    });
    expect(awaiters.size).toBe(0);
  });

  it('settles an active waiter only once', () => {
    const awaiters = new Map<number, SpawnAwaiter>();
    const complete = vi.fn();
    registerSpawnAwaiter(awaiters, 44, complete, undefined, true);

    expect(settleSpawnAwaiter(awaiters, 44, { type: 'success', sessionId: 'session-2' })).toBe(true);
    expect(settleSpawnAwaiter(awaiters, 44, { type: 'error', errorMessage: 'late exit' })).toBe(false);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
