type AbortTurnResult = {
    hadActiveTurn: boolean;
    aborted: boolean;
    forcedRestart: boolean;
    resumedThread: boolean;
};

type RestartCodexBackendClient = {
    readonly threadId: string | null;
    abortTurnWithFallback: (opts: {
        gracePeriodMs: number;
        forceRestartOnTimeout: boolean;
    }) => Promise<AbortTurnResult>;
    reconnectAndResumeThread: () => Promise<boolean>;
};

export type RestartCodexBackendResult = {
    success: true;
    threadId: string;
};

export async function restartCodexBackend(
    client: RestartCodexBackendClient,
    opts?: { gracePeriodMs?: number },
): Promise<RestartCodexBackendResult> {
    const threadId = client.threadId;
    if (!threadId) {
        throw new Error('No active Codex thread to restart');
    }

    try {
        const abortResult = await client.abortTurnWithFallback({
            gracePeriodMs: opts?.gracePeriodMs ?? 3000,
            forceRestartOnTimeout: true,
        });

        // A timed-out abort already restarted the backend. Otherwise, restart
        // explicitly so this action always creates a fresh app-server process.
        const resumedThread = abortResult.forcedRestart
            ? abortResult.resumedThread
            : await client.reconnectAndResumeThread();

        if (!resumedThread) {
            throw new Error('the backend restarted but the thread could not be resumed');
        }

        return { success: true, threadId };
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to restart Codex thread ${threadId}: ${reason}`);
    }
}
