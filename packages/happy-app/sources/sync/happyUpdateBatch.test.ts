import { describe, expect, it, vi } from 'vitest';
import { classifyHappyUpdateRetry, runHappyUpdateBatch, summarizeHappyUpdateBatch, type HappyUpdateBatchTarget } from './happyUpdateBatch';

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
            timedOut: 0,
        });
    });

    it('preserves a nonterminal operation as timed out instead of failed', async () => {
        const results = await runHappyUpdateBatch([target('slow')], async (item) => ({
            operationId: `op-${item.machineId}`,
            targetVersion: item.targetVersion,
            phase: 'starting-daemon' as const,
            progress: 85,
            updatedAt: 1,
        }));

        expect(results[0]).toMatchObject({
            status: 'timed-out',
            snapshot: { operationId: 'op-slow', phase: 'starting-daemon' },
        });
        expect(classifyHappyUpdateRetry(results[0])).toBe('continue');
    });

    it('creates new operations only for retryable terminal or newly-online results', () => {
        expect(classifyHappyUpdateRetry({ target: target('failed'), status: 'failed' })).toBe('restart');
        expect(classifyHappyUpdateRetry({ target: target('recovered'), status: 'recovered' })).toBe('restart');
        expect(classifyHappyUpdateRetry({ target: target('offline'), status: 'offline' })).toBe('restart');
        expect(classifyHappyUpdateRetry({ target: target('current'), status: 'already-current' })).toBe('none');
        expect(classifyHappyUpdateRetry({ target: target('bootstrap'), status: 'bootstrap-required' })).toBe('none');
    });

    it('times out a hanging start and keeps the operation snapshot for continuation', async () => {
        const results = await runHappyUpdateBatch([target('hung')], () => new Promise(() => undefined), { timeoutMs: 10 });

        expect(results[0].status).toBe('timed-out');
        expect(results[0].error).toContain('timed out');
    });
});
