import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceConnectionWaiter } from './VoiceConnectionWaiter';

afterEach(() => {
    vi.useRealTimers();
});

describe('VoiceConnectionWaiter', () => {
    it('resolves with the connected conversation id', async () => {
        const waiter = new VoiceConnectionWaiter();
        const connection = waiter.wait('server-id', 15_000, vi.fn());

        waiter.resolve('connected-id');

        await expect(connection).resolves.toBe('connected-id');
        expect(waiter.isPending).toBe(false);
    });

    it('uses the server conversation id when the SDK callback omits one', async () => {
        const waiter = new VoiceConnectionWaiter();
        const connection = waiter.wait('server-id', 15_000, vi.fn());

        waiter.resolve(null);

        await expect(connection).resolves.toBe('server-id');
    });

    it('rejects a pending connection when the SDK reports an error', async () => {
        const waiter = new VoiceConnectionWaiter();
        const connection = waiter.wait(null, 15_000, vi.fn());

        waiter.reject(new Error('LiveKit failed'));

        await expect(connection).rejects.toThrow('LiveKit failed');
    });

    it('times out and asks the SDK to end the stalled session', async () => {
        vi.useFakeTimers();
        const onTimeout = vi.fn();
        const waiter = new VoiceConnectionWaiter();
        const connection = waiter.wait(null, 15_000, onTimeout);
        const rejection = expect(connection).rejects.toThrow('Voice session connection timed out');

        await vi.advanceTimersByTimeAsync(15_000);

        await rejection;
        expect(onTimeout).toHaveBeenCalledOnce();
    });
});
