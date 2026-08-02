type PendingVoiceConnection = {
    fallbackConversationId: string | null;
    resolve: (conversationId: string | null) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
};

export class VoiceConnectionWaiter {
    private pending: PendingVoiceConnection | null = null;

    get isPending(): boolean {
        return this.pending !== null;
    }

    wait(
        fallbackConversationId: string | null,
        timeoutMs: number,
        onTimeout: () => void,
    ): Promise<string | null> {
        this.reject(new Error('A newer voice session replaced the pending connection'));

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.reject(new Error('Voice session connection timed out'));
                onTimeout();
            }, timeoutMs);

            this.pending = {
                fallbackConversationId,
                resolve,
                reject,
                timeout,
            };
        });
    }

    resolve(conversationId?: string | null): void {
        if (!this.pending) return;

        const pending = this.takePending();
        pending?.resolve(conversationId || pending.fallbackConversationId);
    }

    reject(error: Error): void {
        const pending = this.takePending();
        pending?.reject(error);
    }

    private takePending(): PendingVoiceConnection | null {
        const pending = this.pending;
        if (!pending) return null;

        this.pending = null;
        clearTimeout(pending.timeout);
        return pending;
    }
}
