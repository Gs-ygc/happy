import { HappyUpdateOperationSnapshotSchema, type HappyUpdateOperationSnapshot } from '@slopus/happy-wire';
import type { HappyUpdateBatchResult, HappyUpdateBatchStatus, HappyUpdateBatchTarget } from './happyUpdateBatch';

export const HAPPY_UPDATE_PERSISTENCE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const VALID_BATCH_STATUSES = new Set<HappyUpdateBatchStatus>([
    'pending', 'updating', 'updated', 'already-current', 'offline', 'bootstrap-required', 'recovered', 'failed', 'timed-out',
]);

export type PersistedHappyDeviceUpdate = {
    snapshot: HappyUpdateOperationSnapshot;
    verificationPending: boolean;
    savedAt: number;
};

export type PersistedHappyGroupUpdate = {
    results: HappyUpdateBatchResult[];
    savedAt: number;
};

export type HappyUpdatePersistence = {
    version: 1;
    devices: Record<string, PersistedHappyDeviceUpdate>;
    groups: Record<string, PersistedHappyGroupUpdate>;
};

export const emptyHappyUpdatePersistence = (): HappyUpdatePersistence => ({ version: 1, devices: {}, groups: {} });

function parseTarget(value: unknown): HappyUpdateBatchTarget | null {
    const target = value as Partial<HappyUpdateBatchTarget> | null;
    if (!target || typeof target.machineId !== 'string' || !target.machineId
        || typeof target.name !== 'string' || typeof target.online !== 'boolean'
        || typeof target.targetVersion !== 'string'
        || (target.installedVersion !== undefined && target.installedVersion !== null && typeof target.installedVersion !== 'string')) return null;
    return target as HappyUpdateBatchTarget;
}

function parseResult(value: unknown): HappyUpdateBatchResult | null {
    const result = value as Partial<HappyUpdateBatchResult> | null;
    const target = parseTarget(result?.target);
    if (!result || !target || typeof result.status !== 'string' || !VALID_BATCH_STATUSES.has(result.status as HappyUpdateBatchStatus)) return null;
    const snapshot = result.snapshot === undefined ? undefined : HappyUpdateOperationSnapshotSchema.safeParse(result.snapshot);
    if (snapshot && !snapshot.success) return null;
    if (result.error !== undefined && typeof result.error !== 'string') return null;
    return {
        target,
        status: result.status as HappyUpdateBatchStatus,
        snapshot: snapshot?.success ? snapshot.data : undefined,
        error: result.error,
    };
}

export function parseHappyUpdatePersistence(raw: string | null | undefined, now = Date.now()): HappyUpdatePersistence {
    if (!raw) return emptyHappyUpdatePersistence();
    try {
        const value = JSON.parse(raw) as any;
        if (!value || value.version !== 1) return emptyHappyUpdatePersistence();
        const parsed = emptyHappyUpdatePersistence();
        for (const [machineId, entry] of Object.entries(value.devices ?? {})) {
            const candidate = entry as any;
            const snapshot = HappyUpdateOperationSnapshotSchema.safeParse(candidate?.snapshot);
            if (!snapshot.success || typeof candidate.savedAt !== 'number' || now - candidate.savedAt > HAPPY_UPDATE_PERSISTENCE_RETENTION_MS) continue;
            parsed.devices[machineId] = {
                snapshot: snapshot.data,
                verificationPending: candidate.verificationPending === true,
                savedAt: candidate.savedAt,
            };
        }
        for (const [groupId, entry] of Object.entries(value.groups ?? {})) {
            const candidate = entry as any;
            if (!Array.isArray(candidate?.results) || typeof candidate.savedAt !== 'number' || now - candidate.savedAt > HAPPY_UPDATE_PERSISTENCE_RETENTION_MS) continue;
            const results = candidate.results.map(parseResult).filter((result: HappyUpdateBatchResult | null): result is HappyUpdateBatchResult => result !== null);
            if (results.length === candidate.results.length) parsed.groups[groupId] = { results, savedAt: candidate.savedAt };
        }
        return parsed;
    } catch {
        return emptyHappyUpdatePersistence();
    }
}
