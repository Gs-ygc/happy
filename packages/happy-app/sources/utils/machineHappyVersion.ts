import type { Machine } from '@/sync/storageTypes';

type MachineVersionSources = Pick<Machine, 'metadata' | 'daemonState'>;

export function resolveMachineHappyVersion(machine: MachineVersionSources | null | undefined): string | null {
    const runtimeVersion = machine?.daemonState?.startedWithCliVersion;
    if (typeof runtimeVersion === 'string' && runtimeVersion.length > 0) {
        return runtimeVersion;
    }

    const metadataVersion = machine?.metadata?.happyCliVersion;
    return typeof metadataVersion === 'string' && metadataVersion.length > 0 ? metadataVersion : null;
}
