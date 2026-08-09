import { describe, expect, it } from 'vitest';
import { mergeMachineMetadataPatch } from './machineMetadataPatch';

describe('mergeMachineMetadataPatch', () => {
    it('replays only intended fields after a metadata version conflict', () => {
        expect(mergeMachineMetadataPatch(
            { host: 'new-host', happyCliVersion: '2.0.0', platform: 'linux', happyHomeDir: '/h', homeDir: '/u' },
            { codexPolicyAssignment: null },
        )).toMatchObject({
            host: 'new-host',
            happyCliVersion: '2.0.0',
            codexPolicyAssignment: null,
        });
    });
});
