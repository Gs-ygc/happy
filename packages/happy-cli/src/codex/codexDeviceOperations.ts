import {
    CodexOperationRequestSchema,
    CodexOperationSnapshotSchema,
    type CodexOperationRequest,
    type CodexOperationSnapshot,
    type CodexStatus,
} from '@slopus/happy-wire';
import { redactCodexOutput } from './codexOutputRedaction';

export type CodexDeviceOperationDependencies = {
    readStatus: () => Promise<CodexStatus>;
    restart: () => Promise<CodexStatus>;
    update: (targetVersion?: string) => Promise<CodexStatus>;
    now?: () => number;
};

const MAX_RETAINED_OPERATIONS = 100;

function safeError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return redactCodexOutput(raw).slice(0, 500);
}

export class CodexDeviceOperationManager {
    private readonly operations = new Map<string, CodexOperationSnapshot>();
    private readonly now: () => number;
    private operationQueue: Promise<void> = Promise.resolve();

    constructor(private readonly dependencies: CodexDeviceOperationDependencies) {
        this.now = dependencies.now ?? Date.now;
    }

    async start(input: CodexOperationRequest): Promise<CodexOperationSnapshot> {
        const request = CodexOperationRequestSchema.parse(input);
        const existing = this.operations.get(request.operationId);
        if (existing) {
            return { ...existing };
        }

        this.pruneCompletedOperations();
        if (this.operations.size >= MAX_RETAINED_OPERATIONS) {
            throw new Error('Too many Codex operations are already pending');
        }

        const snapshot: CodexOperationSnapshot = {
            operationId: request.operationId,
            kind: request.kind,
            state: 'queued',
            progress: 0,
            updatedAt: this.now(),
        };
        this.operations.set(request.operationId, snapshot);
        this.operationQueue = this.operationQueue
            .then(() => this.run(request))
            .catch(() => undefined);
        return { ...snapshot };
    }

    get(operationId: string): CodexOperationSnapshot | null {
        const snapshot = this.operations.get(operationId);
        return snapshot ? { ...snapshot } : null;
    }

    private pruneCompletedOperations(): void {
        if (this.operations.size < MAX_RETAINED_OPERATIONS) return;

        for (const [operationId, snapshot] of this.operations) {
            if (snapshot.state !== 'queued' && snapshot.state !== 'running') {
                this.operations.delete(operationId);
                if (this.operations.size < MAX_RETAINED_OPERATIONS) return;
            }
        }
    }

    private update(operationId: string, patch: Partial<CodexOperationSnapshot>): void {
        const current = this.operations.get(operationId);
        if (!current) return;
        const next = CodexOperationSnapshotSchema.parse({
            ...current,
            ...patch,
            updatedAt: this.now(),
        });
        this.operations.set(operationId, next);
    }

    private async run(request: CodexOperationRequest): Promise<void> {
        this.update(request.operationId, {
            state: 'running',
            progress: 10,
            message: request.kind === 'status' ? 'Reading Codex status' : request.kind === 'restart' ? 'Restarting Codex sessions' : 'Updating Codex CLI',
        });
        try {
            const result = request.kind === 'status'
                ? await this.dependencies.readStatus()
                : request.kind === 'restart'
                    ? await this.dependencies.restart()
                    : await this.dependencies.update(request.targetVersion);
            this.update(request.operationId, {
                state: 'completed',
                progress: 100,
                message: 'Codex operation completed',
                result,
            });
        } catch (error) {
            this.update(request.operationId, {
                state: 'failed',
                progress: 100,
                message: 'Codex operation failed',
                error: safeError(error),
            });
        }
    }
}
