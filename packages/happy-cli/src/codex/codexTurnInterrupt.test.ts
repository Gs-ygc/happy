import { describe, expect, it, vi } from 'vitest';

import { interruptTurnForIncomingMessage } from './codexTurnInterrupt';

describe('interruptTurnForIncomingMessage', () => {
    it('does nothing when the client is not ready', () => {
        const abortAll = vi.fn();
        const log = vi.fn();

        expect(interruptTurnForIncomingMessage(undefined, { abortAll }, log)).toBe(false);
        expect(abortAll).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
    });

    it('does nothing when no turn is active', () => {
        const client = { turnId: null, interruptTurn: vi.fn() };
        const abortAll = vi.fn();
        const log = vi.fn();

        expect(interruptTurnForIncomingMessage(client, { abortAll }, log)).toBe(false);
        expect(client.interruptTurn).not.toHaveBeenCalled();
        expect(abortAll).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
    });

    it('interrupts the active turn and resolves pending permissions', () => {
        const client = {
            turnId: 'turn-1',
            interruptTurn: vi.fn().mockResolvedValue(undefined),
        };
        const abortAll = vi.fn();
        const log = vi.fn();

        expect(interruptTurnForIncomingMessage(client, { abortAll }, log)).toBe(true);
        expect(abortAll).toHaveBeenCalledTimes(1);
        expect(client.interruptTurn).toHaveBeenCalledWith({ timeoutMs: 2000 });
        expect(log).toHaveBeenCalledTimes(1);
    });

    it('forces the active turn through abortTurnWithFallback when available', () => {
        const client = {
            turnId: 'turn-1',
            interruptTurn: vi.fn(),
            abortTurnWithFallback: vi.fn().mockResolvedValue({
                hadActiveTurn: true,
                aborted: true,
                forcedRestart: false,
                resumedThread: false,
            }),
        };
        const abortAll = vi.fn();
        const log = vi.fn();

        expect(interruptTurnForIncomingMessage(client, { abortAll }, log)).toBe(true);
        expect(abortAll).toHaveBeenCalledTimes(1);
        expect(client.abortTurnWithFallback).toHaveBeenCalledWith({
            gracePeriodMs: 3000,
            forceRestartOnTimeout: true,
        });
        expect(client.interruptTurn).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledTimes(1);
    });

    it('survives an interrupt rejection without losing the message', async () => {
        const client = {
            turnId: 'turn-1',
            interruptTurn: vi.fn().mockRejectedValue(new Error('rpc failed')),
        };
        const abortAll = vi.fn();

        expect(interruptTurnForIncomingMessage(client, { abortAll })).toBe(true);
        await Promise.resolve();
        expect(client.interruptTurn).toHaveBeenCalledTimes(1);
    });
});
