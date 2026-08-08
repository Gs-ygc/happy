/**
 * Mid-turn user message handling.
 *
 * Codex CLI semantics: typing while the agent is working interrupts the
 * current turn so the new prompt is processed immediately. Without this,
 * a message sent mid-turn sits in the queue until the running turn
 * completes, which differs from the CLI and surprises users.
 */

export type ActiveTurnInterruptClient = {
    turnId: string | null;
    interruptTurn(opts?: { timeoutMs?: number }): Promise<void>;
    abortTurnWithFallback?(opts?: {
        gracePeriodMs?: number;
        forceRestartOnTimeout?: boolean;
    }): Promise<unknown>;
};

export type PendingPermissionAborter = {
    abortAll(): void;
};

/**
 * Interrupt the running Codex turn for an incoming message.
 *
 * Resolves pending permission requests first so the interrupted turn does
 * not stay stuck on an approval that will be superseded. When the client
 * supports it, the interrupt uses the same forced fallback as Stop Execution:
 * if Codex does not settle within the grace period, the app-server is
 * restarted and the thread resumed. The call is fire-and-forget; the message
 * is already being enqueued and sendTurnAndWait waits for in-flight work
 * before starting the next turn.
 *
 * @returns true when a turn was active and an interrupt was triggered.
 */
export function interruptTurnForIncomingMessage(
    client: ActiveTurnInterruptClient | null | undefined,
    permissionHandler: PendingPermissionAborter | null | undefined,
    log?: (message: string) => void,
): boolean {
    if (!client || client.turnId === null) {
        return false;
    }

    permissionHandler?.abortAll();
    log?.('[Codex] User message during active turn — interrupting current turn');
    if (client.abortTurnWithFallback) {
        void client.abortTurnWithFallback({
            gracePeriodMs: 3000,
            forceRestartOnTimeout: true,
        }).catch(() => {
            // The real client never rejects, but guard anyway so a hostile/mock
            // client cannot break the message queue.
        });
    } else {
        void client.interruptTurn({ timeoutMs: 2000 }).catch(() => {
            // The real client never rejects (it swallows RPC errors), but guard
            // anyway so a hostile/mock client cannot break the message queue.
        });
    }
    return true;
}
