import { flattenMacThemeTokens, type MacThemeDefinition } from './macTheme';

export function isMacTauriEnvironment(): boolean {
    return typeof window !== 'undefined'
        && (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined
        && typeof navigator !== 'undefined'
        && /Mac/.test(navigator.platform);
}

export function applyMacTheme(
    theme: MacThemeDefinition,
    dark: boolean,
    reducedTransparency = false,
): void {
    if (!isMacTauriEnvironment() || typeof document === 'undefined') return;

    const root = document.documentElement;
    const tokens = flattenMacThemeTokens(theme, dark);
    for (const [name, value] of Object.entries(tokens)) {
        root.style.setProperty(`--happy-mac-${name}`, value);
    }
    root.style.setProperty('--happy-mac-opaque-surface', tokens['opaque-surface']);
    root.classList.add('happy-mac-theme');
    root.classList.toggle('happy-mac-reduced-transparency', reducedTransparency);
}

export function clearMacTheme(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove('happy-mac-theme', 'happy-mac-reduced-transparency');
    for (const name of [
        'content-background', 'content-text', 'opaque-surface', 'material-background',
        'material-tint', 'surface-border', 'popover-shadow', 'material-blur',
        'material-saturation', 'accent-color',
    ]) {
        root.style.removeProperty(`--happy-mac-${name}`);
    }
    root.style.removeProperty('--happy-mac-opaque-surface');
}
