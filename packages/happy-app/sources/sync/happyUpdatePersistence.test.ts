import { describe, expect, it } from 'vitest';
import { parseHappyUpdatePersistence } from './happyUpdatePersistenceData';

const snapshot = {
    operationId: 'update-1',
    targetVersion: '1.2.5',
    phase: 'starting-daemon' as const,
    progress: 85,
    updatedAt: 1_000,
};

describe('Happy update local persistence', () => {
    it('restores valid device and group operations', () => {
        const parsed = parseHappyUpdatePersistence(JSON.stringify({
            version: 1,
            devices: {
                machine1: { snapshot, verificationPending: true, savedAt: 1_000 },
            },
            groups: {
                group1: {
                    savedAt: 1_000,
                    results: [{
                        target: { machineId: 'machine1', name: 'Build host', online: true, installedVersion: '1.2.4', targetVersion: '1.2.5' },
                        status: 'timed-out',
                        snapshot,
                    }],
                },
            },
        }), 2_000);

        expect(parsed.devices.machine1.snapshot.operationId).toBe('update-1');
        expect(parsed.groups.group1.results[0]).toMatchObject({ status: 'timed-out', snapshot: { operationId: 'update-1' } });
    });

    it('drops malformed and expired records', () => {
        const parsed = parseHappyUpdatePersistence(JSON.stringify({
            version: 1,
            devices: {
                expired: { snapshot, savedAt: 1 },
                malformed: { snapshot: { ...snapshot, operationId: '../escape' }, savedAt: 1_000 },
            },
            groups: {},
        }), 8 * 24 * 60 * 60 * 1000);

        expect(parsed.devices).toEqual({});
    });
});
