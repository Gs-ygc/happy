import { describe, expect, it } from 'vitest';
import {
    assignMachineToCodexDeviceGroup,
    resolveCodexPolicyAssignment,
    upsertCodexDeviceGroup,
    removeCodexDeviceGroup,
} from './codexDeviceGroups';

describe('Codex device groups', () => {
    const disabledPolicy = { revision: 1, enabled: false, syncBaseConfig: false, syncMcpServers: false, syncSkills: false, baseConfig: {}, mcpServers: [], skills: [] };
    const groups = [
        { id: 'dev', name: 'Development', machineIds: ['machine-1'], membershipRevision: 0, policy: disabledPolicy },
        { id: 'prod', name: 'Production', machineIds: [], membershipRevision: 0, policy: { ...disabledPolicy, revision: 2 } },
    ];

    it('moves a machine between groups instead of assigning it twice', () => {
        const next = assignMachineToCodexDeviceGroup(groups, 'machine-1', 'prod');
        expect(next.find((group) => group.id === 'dev')?.machineIds).toEqual([]);
        expect(next.find((group) => group.id === 'prod')?.machineIds).toEqual(['machine-1']);
        expect(next.find((group) => group.id === 'dev')?.membershipRevision).toBe(1);
        expect(next.find((group) => group.id === 'prod')?.membershipRevision).toBe(1);
    });

    it('resolves the policy snapshot sent to one device', () => {
        expect(resolveCodexPolicyAssignment(groups, 'machine-1')).toMatchObject({
            groupId: 'dev',
            groupName: 'Development',
            policy: { revision: 1 },
        });
        expect(resolveCodexPolicyAssignment(groups, 'missing')).toBeNull();
    });

    it('upserts a group without losing other groups', () => {
        const next = upsertCodexDeviceGroup(groups, { ...groups[0], name: 'Developers' });
        expect(next.map((group) => group.name)).toEqual(['Developers', 'Production']);
    });

    it('removes a group and its assignments together', () => {
        expect(removeCodexDeviceGroup(groups, 'dev')).toEqual([groups[1]]);
    });
});
