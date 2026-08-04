import type * as Updates from 'expo-updates';

export type PendingOtaUpdate = {
    ota_version?: string;
    ota_runtime_version?: string;
};

export async function checkForOtaUpdateIfEnabled(
    isEnabled: boolean,
    checkForUpdateAsync: typeof Updates.checkForUpdateAsync,
    fetchUpdateAsync: typeof Updates.fetchUpdateAsync,
): Promise<PendingOtaUpdate | null> {
    if (!isEnabled) {
        return null;
    }

    const update = await checkForUpdateAsync();
    if (!update.isAvailable) {
        return null;
    }

    const pendingUpdate: PendingOtaUpdate = {
        ota_version: update.manifest.id,
        ota_runtime_version: 'runtimeVersion' in update.manifest ? update.manifest.runtimeVersion : undefined,
    };
    await fetchUpdateAsync();
    return pendingUpdate;
}
