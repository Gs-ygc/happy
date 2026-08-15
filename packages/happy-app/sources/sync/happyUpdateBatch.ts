import type { HappyUpdateOperationSnapshot } from '@slopus/happy-wire';
import { compareVersions } from '@/utils/versionUtils';
import { isHappySelfUpdateSupported } from './happyUpdate';

export type HappyUpdateBatchTarget = {
    machineId: string;
    name: string;
    online: boolean;
    installedVersion: string | null | undefined;
    targetVersion: string;
};

export type HappyUpdateBatchStatus = 'pending' | 'updating' | 'updated' | 'already-current' | 'offline' | 'bootstrap-required' | 'recovered' | 'failed';

export type HappyUpdateBatchResult = {
    target: HappyUpdateBatchTarget;
    status: HappyUpdateBatchStatus;
    snapshot?: HappyUpdateOperationSnapshot;
    error?: string;
};

export type HappyUpdateBatchOptions = {
    concurrency?: number;
    onResult?: (result: HappyUpdateBatchResult) => void;
};

type ExecuteHappyUpdate = (
    target: HappyUpdateBatchTarget,
    report?: (snapshot: HappyUpdateOperationSnapshot) => void,
) => Promise<HappyUpdateOperationSnapshot>;

function initialResult(target: HappyUpdateBatchTarget): HappyUpdateBatchResult {
    if (!target.online) return { target, status: 'offline' };
    if (!isHappySelfUpdateSupported(target.installedVersion)) return { target, status: 'bootstrap-required' };
    if (compareVersions(target.installedVersion!, target.targetVersion) >= 0) return { target, status: 'already-current' };
    return { target, status: 'pending' };
}

export async function runHappyUpdateBatch(
    targets: HappyUpdateBatchTarget[],
    execute: ExecuteHappyUpdate,
    options: HappyUpdateBatchOptions = {},
): Promise<HappyUpdateBatchResult[]> {
    const results = targets.map(initialResult);
    const emit = (result: HappyUpdateBatchResult) => options.onResult?.({ ...result });
    results.forEach(emit);
    const eligible = results
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => result.status === 'pending');
    const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 3));
    let nextIndex = 0;

    const worker = async () => {
        while (nextIndex < eligible.length) {
            const current = eligible[nextIndex++];
            results[current.index] = { ...current.result, status: 'updating' };
            emit(results[current.index]);
            try {
                const snapshot = await execute(current.result.target, (progress) => {
                    results[current.index] = { ...results[current.index], status: 'updating', snapshot: progress };
                    emit(results[current.index]);
                });
                const status: HappyUpdateBatchStatus = snapshot.phase === 'completed'
                    ? 'updated'
                    : snapshot.phase === 'recovered'
                        ? 'recovered'
                        : 'failed';
                results[current.index] = {
                    ...results[current.index],
                    status,
                    snapshot,
                    error: snapshot.error,
                };
            } catch (error) {
                results[current.index] = {
                    ...results[current.index],
                    status: 'failed',
                    error: error instanceof Error ? error.message : String(error),
                };
            }
            emit(results[current.index]);
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, eligible.length) }, () => worker()));
    return results;
}

export function summarizeHappyUpdateBatch(results: HappyUpdateBatchResult[]) {
    return {
        total: results.length,
        updated: results.filter((result) => result.status === 'updated').length,
        alreadyCurrent: results.filter((result) => result.status === 'already-current').length,
        offline: results.filter((result) => result.status === 'offline').length,
        bootstrapRequired: results.filter((result) => result.status === 'bootstrap-required').length,
        recovered: results.filter((result) => result.status === 'recovered').length,
        failed: results.filter((result) => result.status === 'failed').length,
    };
}
