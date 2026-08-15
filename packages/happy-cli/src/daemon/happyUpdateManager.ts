import {
    HappyUpdateRequestSchema,
    type HappyUpdateOperationSnapshot,
    type HappyUpdateRequest,
} from '@slopus/happy-wire';
import { HappyUpdateJournal } from './happyUpdateJournal';
import { sanitizeHappyUpdateError } from './happyUpdateUpdater';

const TERMINAL_PHASES = new Set(['completed', 'failed', 'recovered']);

export type HappyUpdateManagerOptions = {
    journal: HappyUpdateJournal;
    launchWorker: (request: HappyUpdateRequest) => void | Promise<void>;
    now?: () => number;
};

function requestsEqual(left: HappyUpdateRequest, right: HappyUpdateRequest): boolean {
    return left.operationId === right.operationId
        && left.targetVersion === right.targetVersion
        && left.assetUrl === right.assetUrl
        && left.sha256 === right.sha256;
}

export class HappyUpdateManager {
    private readonly now: () => number;
    private startQueue: Promise<void> = Promise.resolve();

    constructor(private readonly options: HappyUpdateManagerOptions) {
        this.now = options.now ?? Date.now;
    }

    start(input: HappyUpdateRequest): Promise<HappyUpdateOperationSnapshot> {
        const task = this.startQueue.then(() => this.startInternal(input));
        this.startQueue = task.then(() => undefined, () => undefined);
        return task;
    }

    async get(operationId: string): Promise<HappyUpdateOperationSnapshot | null> {
        if (!operationId.trim()) throw new Error('operationId is required');
        return this.options.journal.read(operationId);
    }

    async reconcileInterruptedOperations(): Promise<void> {
        const active = (await this.options.journal.listRecent())
            .filter((snapshot) => !TERMINAL_PHASES.has(snapshot.phase));
        if (active.length === 0 || await this.options.journal.isLockActive()) return;
        await Promise.all(active.map((snapshot) => this.options.journal.write({
            ...snapshot,
            phase: 'failed',
            progress: 100,
            updatedAt: this.now(),
            message: 'Happy update worker stopped',
            error: 'Happy update worker stopped before completion',
        })));
    }

    private async startInternal(input: HappyUpdateRequest): Promise<HappyUpdateOperationSnapshot> {
        const request = HappyUpdateRequestSchema.parse(input);
        const existing = await this.options.journal.read(request.operationId);
        if (existing) {
            const priorRequest = await this.options.journal.readRequest(request.operationId);
            if (!priorRequest || !requestsEqual(priorRequest, request)) {
                throw new Error('Operation ID was already used for a different request');
            }
            return existing;
        }

        const active = (await this.options.journal.listRecent())
            .find((snapshot) => !TERMINAL_PHASES.has(snapshot.phase));
        if (active) throw new Error(`Happy update ${active.operationId} is already in progress`);

        const snapshot: HappyUpdateOperationSnapshot = {
            operationId: request.operationId,
            targetVersion: request.targetVersion,
            phase: 'queued',
            progress: 0,
            message: 'Happy update queued',
            updatedAt: this.now(),
        };
        await this.options.journal.writeRequest(request);
        await this.options.journal.write(snapshot);
        try {
            await this.options.launchWorker(request);
        } catch (error) {
            const failed: HappyUpdateOperationSnapshot = {
                ...snapshot,
                phase: 'failed',
                progress: 100,
                error: sanitizeHappyUpdateError(error),
                updatedAt: this.now(),
            };
            await this.options.journal.write(failed);
            return failed;
        }
        return snapshot;
    }
}
