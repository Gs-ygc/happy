import { describe, expect, it, vi } from 'vitest';
import { checkForOtaUpdateIfEnabled } from './otaUpdates';

describe('checkForOtaUpdateIfEnabled', () => {
    it('skips Expo update checks when expo-updates is disabled', async () => {
        const checkForUpdateAsync = vi.fn();
        const fetchUpdateAsync = vi.fn();

        const result = await checkForOtaUpdateIfEnabled(
            false,
            checkForUpdateAsync as never,
            fetchUpdateAsync as never,
        );

        expect(result).toBeNull();
        expect(checkForUpdateAsync).not.toHaveBeenCalled();
        expect(fetchUpdateAsync).not.toHaveBeenCalled();
    });

    it('checks, fetches, and returns an available OTA update when enabled', async () => {
        const checkForUpdateAsync = vi.fn().mockResolvedValue({
            isAvailable: true,
            manifest: {
                id: 'update-ota-1',
                runtimeVersion: '21',
            },
        });
        const fetchUpdateAsync = vi.fn().mockResolvedValue({ isNew: true });

        const result = await checkForOtaUpdateIfEnabled(
            true,
            checkForUpdateAsync as never,
            fetchUpdateAsync as never,
        );

        expect(result).toEqual({
            ota_version: 'update-ota-1',
            ota_runtime_version: '21',
        });
        expect(checkForUpdateAsync).toHaveBeenCalledTimes(1);
        expect(fetchUpdateAsync).toHaveBeenCalledTimes(1);
    });
});
