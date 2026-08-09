import type { MachineMetadata } from './storageTypes';

export function mergeMachineMetadataPatch(
    latest: MachineMetadata,
    patch: Partial<MachineMetadata>,
): MachineMetadata {
    return { ...latest, ...patch };
}
