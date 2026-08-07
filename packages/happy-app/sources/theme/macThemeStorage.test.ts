import { describe, expect, it } from 'vitest';
import { createMacTheme, MAC_THEME_PRESETS } from './macTheme';
import { exportMacThemes, importMacThemes } from './macThemeStorage';
import { localSettingsParse } from '@/sync/localSettings';

const systemGlass = createMacTheme(MAC_THEME_PRESETS['system-glass']);

describe('macOS theme import/export', () => {
    it('round-trips an indented theme bundle', () => {
        const raw = exportMacThemes([systemGlass]);
        expect(raw).toContain('\n  "schemaVersion"');
        expect(importMacThemes(raw, []).library).toEqual([systemGlass]);
    });

    it('replaces duplicate IDs while retaining the current selection', () => {
        const replacement = { ...systemGlass, name: 'Custom Glass' };
        const result = importMacThemes(exportMacThemes([replacement]), [systemGlass]);
        expect(result.library).toEqual([replacement]);
        expect(result.selectedId).toBe(systemGlass.id);
    });

    it('ignores malformed bundles without mutating the existing library', () => {
        const existing = [systemGlass];
        expect(importMacThemes('{bad json', existing)).toEqual({ library: existing, selectedId: systemGlass.id });
        expect(importMacThemes(JSON.stringify({ themes: [{ schemaVersion: 2 }] }), existing)).toEqual({ library: existing, selectedId: systemGlass.id });
    });

    it('supplies a valid system theme for legacy or malformed local settings', () => {
        expect(localSettingsParse({}).macThemeLibrary[0].id).toBe('system-glass');
        expect(localSettingsParse({ macThemeLibrary: [{ schemaVersion: 2 }] }).macThemeLibrary[0].id).toBe('system-glass');
    });
});
