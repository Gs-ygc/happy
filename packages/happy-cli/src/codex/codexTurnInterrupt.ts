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
};

export type PendingPermissionAborter = {
    abortAll(): void;
};

/**
 * Best-effort interrupt of the running Codex turn for an incoming message.
 *
 * Resolves pending permission requests first so the interrupted turn does
 * not stay stuck on an approval that will be superseded. The interrupt is
 * fire-and-forget: sendTurnAndWait already waits for in-flight interrupts
 * before starting the next turn, and a slow/failed interrupt only delays
 * the message instead of losing it.
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
    void client.interruptTurn({ timeoutMs: 2000 }).catch(() => {
        // The real client never rejects (it swallows RPC errors), but guard
        // anyway so a hostile/mock client cannot break the message queue.
    });
    return true;
}
