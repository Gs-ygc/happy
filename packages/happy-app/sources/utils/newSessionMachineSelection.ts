import type { Machine } from '@/sync/storageTypes';
import { isMachineOnline } from './machineUtils';

export function resolveNewSessionMachineId(machines: Machine[], selectedMachineId: string | null): string | null {
    if (selectedMachineId && machines.some(machine => machine.id === selectedMachineId)) return selectedMachineId;
    return machines.find(isMachineOnline)?.id ?? machines[0]?.id ?? null;
}
