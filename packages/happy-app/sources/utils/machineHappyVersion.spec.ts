import { describe, expect, it } from 'vitest';
import type { Machine } from '@/sync/storageTypes';
import { resolveMachineHappyVersion } from './machineHappyVersion';

function machineWith(overrides: Partial<Machine>): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            host: 'node029',
            platform: 'linux',
            happyCliVersion: '1.2.0',
            happyHomeDir: '/home/user/.happy',
            homeDir: '/home/user',
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 0,
        ...overrides,
    };
}

describe('resolveMachineHappyVersion', () => {
    it('prefers the version of the daemon process that actually started', () => {
        expect(resolveMachineHappyVersion(machineWith({
            daemonState: { status: 'running', startedWithCliVersion: '1.2.6' },
        }))).toBe('1.2.6');
    });

    it('falls back to machine metadata for legacy daemon state', () => {
        expect(resolveMachineHappyVersion(machineWith({
            daemonState: { status: 'running' },
        }))).toBe('1.2.0');
    });

    it('returns null when neither source reports a version', () => {
        expect(resolveMachineHappyVersion(machineWith({
            metadata: null,
            daemonState: { status: 'running' },
        }))).toBeNull();
    });
});
