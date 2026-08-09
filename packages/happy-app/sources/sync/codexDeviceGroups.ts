import {
    CodexDeviceGroupsSchema,
    CodexPolicyAssignmentSchema,
    type CodexDeviceGroup,
    type CodexPolicyAssignment,
} from '@slopus/happy-wire';

export function assignMachineToCodexDeviceGroup(
    groups: CodexDeviceGroup[],
    machineId: string,
    groupId: string | null,
): CodexDeviceGroup[] {
    if (groupId !== null && !groups.some((group) => group.id === groupId)) {
        throw new Error('Codex device group not found');
    }
    return CodexDeviceGroupsSchema.parse(groups.map((group) => ({
        ...group,
        machineIds: group.id === groupId
            ? Array.from(new Set([...group.machineIds.filter((id) => id !== machineId), machineId]))
            : group.machineIds.filter((id) => id !== machineId),
    })));
}

export function resolveCodexPolicyAssignment(
    groups: CodexDeviceGroup[],
    machineId: string,
): CodexPolicyAssignment | null {
    const group = groups.find((candidate) => candidate.machineIds.includes(machineId));
    if (!group) return null;
    return CodexPolicyAssignmentSchema.parse({ groupId: group.id, groupName: group.name, policy: group.policy });
}

export function upsertCodexDeviceGroup(
    groups: CodexDeviceGroup[],
    updated: CodexDeviceGroup,
): CodexDeviceGroup[] {
    const found = groups.some((group) => group.id === updated.id);
    return CodexDeviceGroupsSchema.parse(found
        ? groups.map((group) => group.id === updated.id ? updated : group)
        : [...groups, updated]);
}

export function removeCodexDeviceGroup(groups: CodexDeviceGroup[], groupId: string): CodexDeviceGroup[] {
    return CodexDeviceGroupsSchema.parse(groups.filter((group) => group.id !== groupId));
}
