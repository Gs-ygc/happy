import { MMKV } from 'react-native-mmkv';
import type { HappyUpdateOperationSnapshot } from '@slopus/happy-wire';
import type { HappyUpdateBatchResult } from './happyUpdateBatch';
import {
    parseHappyUpdatePersistence,
    type HappyUpdatePersistence,
    type PersistedHappyDeviceUpdate,
    type PersistedHappyGroupUpdate,
} from './happyUpdatePersistenceData';

const STORAGE_KEY = 'happy-update-operations-v1';
const mmkv = new MMKV();

function loadAll(): HappyUpdatePersistence {
    return parseHappyUpdatePersistence(mmkv.getString(STORAGE_KEY));
}

function saveAll(value: HappyUpdatePersistence): void {
    mmkv.set(STORAGE_KEY, JSON.stringify(value));
}

export function loadHappyDeviceUpdate(machineId: string): PersistedHappyDeviceUpdate | null {
    return loadAll().devices[machineId] ?? null;
}

export function saveHappyDeviceUpdate(machineId: string, snapshot: HappyUpdateOperationSnapshot, verificationPending = false): void {
    const value = loadAll();
    value.devices[machineId] = { snapshot, verificationPending, savedAt: Date.now() };
    saveAll(value);
}

export function loadHappyGroupUpdate(groupId: string): PersistedHappyGroupUpdate | null {
    return loadAll().groups[groupId] ?? null;
}

export function saveHappyGroupUpdate(groupId: string, results: HappyUpdateBatchResult[]): void {
    const value = loadAll();
    value.groups[groupId] = { results, savedAt: Date.now() };
    saveAll(value);
}
