import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMacTheme, clearMacTheme } from './macThemeRuntime';
import { createMacTheme, MAC_THEME_PRESETS } from './macTheme';

describe('macOS theme runtime', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        const values = new Map<string, string>();
        const classes = new Set<string>();
        const root = {
            style: {
                setProperty: (name: string, value: string) => values.set(name, value),
                removeProperty: (name: string) => values.delete(name),
                getPropertyValue: (name: string) => values.get(name) ?? '',
            },
            classList: {
                add: (...names: string[]) => names.forEach((name) => classes.add(name)),
                remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
                toggle: (name: string, force?: boolean) => force ? classes.add(name) : classes.delete(name),
                contains: (name: string) => classes.has(name),
            },
            get className() { return [...classes].join(' '); },
        };
        vi.stubGlobal('document', { documentElement: root });
    });

    it('applies CSS variables and root classes in a macOS Tauri window', () => {
        vi.stubGlobal('navigator', { platform: 'MacIntel' });
        vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
        applyMacTheme(createMacTheme(MAC_THEME_PRESETS.systemGlass), false);
        expect(document.documentElement.classList.contains('happy-mac-theme')).toBe(true);
        expect(document.documentElement.style.getPropertyValue('--happy-mac-content-background')).toMatch(/^#/);
        expect(document.documentElement.style.getPropertyValue('--happy-mac-material-blur')).toBeTruthy();
    });

    it('does not alter a normal browser document', () => {
        vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
        vi.stubGlobal('window', {});
        applyMacTheme(createMacTheme(MAC_THEME_PRESETS.systemGlass), false);
        expect(document.documentElement.classList.contains('happy-mac-theme')).toBe(false);
    });

    it('clears root classes and variables', () => {
        vi.stubGlobal('navigator', { platform: 'MacIntel' });
        vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
        applyMacTheme(createMacTheme(MAC_THEME_PRESETS.systemGlass), false);
        clearMacTheme();
        expect(document.documentElement.className).toBe('');
        expect(document.documentElement.style.getPropertyValue('--happy-mac-content-background')).toBe('');
    });
});
