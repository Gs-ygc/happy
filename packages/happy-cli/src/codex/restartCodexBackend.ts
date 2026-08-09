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
    reconnectAndResumeThread: () => Promise<string | null>;
};

export type RestartCodexBackendResult = {
    success: true;
    threadId: string;
};

type CodexRestartMetadata = Record<string, unknown> & {
    codexThreadId?: string;
    lifecycleState?: string;
    lifecycleStateSince?: number;
};

export class CodexSessionLifecycleCoordinator {
    private abortInProgress: Promise<void> | null = null;
    private restartInProgress: Promise<RestartCodexBackendResult> | null = null;

    async runAbort(operation: () => Promise<void>): Promise<void> {
        if (this.restartInProgress) {
            try {
                await this.restartInProgress;
            } catch {
                // The restart caller receives the failure.
            }
            return;
        }

        if (this.abortInProgress) {
            await this.abortInProgress;
            return;
        }

        const pending = operation();
        this.abortInProgress = pending;
        try {
            await pending;
        } finally {
            if (this.abortInProgress === pending) {
                this.abortInProgress = null;
            }
        }
    }

    async runRestart(
        operation: () => Promise<RestartCodexBackendResult>,
    ): Promise<RestartCodexBackendResult> {
        if (this.restartInProgress) {
            return await this.restartInProgress;
        }

        const pending = (async () => {
            if (this.abortInProgress) {
                await this.abortInProgress;
            }
            return await operation();
        })();
        this.restartInProgress = pending;
        try {
            return await pending;
        } finally {
            if (this.restartInProgress === pending) {
                this.restartInProgress = null;
            }
        }
    }

    async waitForRestart(): Promise<void> {
        if (this.restartInProgress) {
            await this.restartInProgress;
        }
    }
}

export function markCodexRestartSucceeded<T extends CodexRestartMetadata>(
    metadata: T,
    threadId: string,
    now: number = Date.now(),
): T {
    return {
        ...metadata,
        codexThreadId: threadId,
        lifecycleState: 'running',
        lifecycleStateSince: now,
    };
}

export function markCodexRestartFailed<T extends CodexRestartMetadata>(
    metadata: T,
    now: number = Date.now(),
): T {
    const nextMetadata = {
        ...metadata,
        lifecycleState: 'error',
        lifecycleStateSince: now,
    };
    delete nextMetadata.codexThreadId;
    return nextMetadata;
}

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
        const resumedThreadId = abortResult.forcedRestart
            ? (abortResult.resumedThread ? client.threadId : null)
            : await client.reconnectAndResumeThread();

        if (!resumedThreadId) {
            throw new Error('the backend restarted but the thread could not be resumed');
        }

        return { success: true, threadId: resumedThreadId };
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to restart Codex thread ${threadId}: ${reason}`);
    }
}
