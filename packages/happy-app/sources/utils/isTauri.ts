import { Platform } from 'react-native';

export function isTauri(): boolean {
    return Platform.OS === 'web'
        && typeof window !== 'undefined'
        && (window as any).__TAURI_INTERNALS__ !== undefined;
}

export function isMacTauri(): boolean {
    return isTauri()
        && typeof navigator !== 'undefined'
        && /Mac/.test(navigator.platform);
}
