import { describe, expect, it, vi } from 'vitest';
import { runHappyUpdateBatch, summarizeHappyUpdateBatch, type HappyUpdateBatchTarget } from './happyUpdateBatch';

const target = (id: string, overrides: Partial<HappyUpdateBatchTarget> = {}): HappyUpdateBatchTarget => ({
    machineId: id,
    name: id,
    online: true,
    installedVersion: '1.2.5',
    targetVersion: '1.2.6',
    ...overrides,
});

describe('Happy update batch coordinator', () => {
    it('runs no more than three device updates concurrently', async () => {
        let active = 0;
        let maximum = 0;
        const execute = vi.fn(async (item: HappyUpdateBatchTarget) => {
            active++;
            maximum = Math.max(maximum, active);
            await new Promise((resolve) => setTimeout(resolve, 10));
            active--;
            return { operationId: `op-${item.machineId}`, targetVersion: item.targetVersion, phase: 'completed' as const, progress: 100, updatedAt: 1 };
        });

        const results = await runHappyUpdateBatch(
            Array.from({ length: 8 }, (_, index) => target(`machine-${index}`)),
            execute,
            { concurrency: 3 },
        );

        expect(maximum).toBe(3);
        expect(execute).toHaveBeenCalledTimes(8);
        expect(results.every((result) => result.status === 'updated')).toBe(true);
    });

    it('classifies offline, bootstrap-required, and current devices without executing them', async () => {
        const execute = vi.fn();
        const results = await runHappyUpdateBatch([
            target('offline', { online: false }),
            target('bootstrap', { installedVersion: '1.2.4' }),
            target('current', { installedVersion: '1.2.6' }),
        ], execute);

        expect(results.map((result) => result.status)).toEqual(['offline', 'bootstrap-required', 'already-current']);
        expect(execute).not.toHaveBeenCalled();
    });

    it('keeps recovered and failed devices out of the success count', async () => {
        const results = await runHappyUpdateBatch([
            target('updated'),
            target('recovered'),
            target('failed'),
        ], async (item) => ({
            operationId: `op-${item.machineId}`,
            targetVersion: item.targetVersion,
            phase: item.machineId === 'updated' ? 'completed' : item.machineId as 'recovered' | 'failed',
            progress: 100,
            updatedAt: 1,
            error: item.machineId === 'failed' ? 'install failed' : undefined,
        }));

        expect(results.map((result) => result.status)).toEqual(['updated', 'recovered', 'failed']);
        expect(summarizeHappyUpdateBatch(results)).toEqual({
            total: 3,
            updated: 1,
            alreadyCurrent: 0,
            offline: 0,
            bootstrapRequired: 0,
            recovered: 1,
            failed: 1,
        });
    });
});
