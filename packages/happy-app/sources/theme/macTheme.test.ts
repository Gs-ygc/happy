import { describe, expect, it } from 'vitest';

import {
    MAC_THEME_PRESETS,
    createMacTheme,
    flattenMacThemeTokens,
    sanitizeMacTheme,
} from './macTheme';

describe('macOS theme model', () => {
    it('generates deterministic complete tokens for every built-in preset', () => {
        for (const preset of Object.values(MAC_THEME_PRESETS)) {
            const first = createMacTheme(preset);
            const second = createMacTheme(preset);

            expect(first).toEqual(second);
            expect(first.schemaVersion).toBe(1);
            expect(Object.keys(flattenMacThemeTokens(first, false))).toEqual([
                'content-background',
                'content-text',
                'opaque-surface',
                'material-background',
                'material-tint',
                'surface-border',
                'popover-shadow',
                'material-blur',
                'material-saturation',
                'accent-color',
            ]);
            expect(flattenMacThemeTokens(first, false)['content-text']).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it('normalizes colors and clamps generator controls', () => {
        const theme = createMacTheme({
            id: 'custom theme',
            name: ' Custom Theme ',
            mode: 'light',
            baseColor: '#ABCDEF80',
            accentColor: ' #123456 ',
            contrast: 4,
            materialStrength: -2,
        });

        expect(theme.id).toBe('custom-theme');
        expect(theme.name).toBe('Custom Theme');
        expect(theme.generator).toEqual({
            baseColor: '#abcdef80',
            accentColor: '#123456',
            contrast: 1,
            materialStrength: 0,
        });
        expect(flattenMacThemeTokens(theme, false)['material-blur']).toBe('0');
    });

    it('rejects malformed or unsupported imported themes', () => {
        expect(sanitizeMacTheme(null)).toBeNull();
        expect(sanitizeMacTheme({ schemaVersion: 2 })).toBeNull();
        expect(sanitizeMacTheme({
            schemaVersion: 1,
            id: 'bad id',
            name: 'Bad',
            mode: 'light',
            generator: {
                baseColor: '#ffffff',
                accentColor: '#000000',
                contrast: 0.5,
                materialStrength: 0.5,
            },
            tokenOverrides: { unknownToken: '#fff' },
        })).toBeNull();
        expect(sanitizeMacTheme({
            schemaVersion: 1,
            id: 'valid-id',
            name: 'Valid',
            mode: 'light',
            generator: {
                baseColor: '#ffffff',
                accentColor: '#000000',
                contrast: 0.5,
                materialStrength: 0.5,
            },
            tokenOverrides: { contentText: 'not-a-color' },
        })).toBeNull();
    });

    it('applies token overrides after selecting the light or dark token set', () => {
        const theme = createMacTheme({
            id: 'override',
            name: 'Override',
            mode: 'adaptive',
            baseColor: '#ffffff',
            accentColor: '#ff0000',
            contrast: 0.5,
            materialStrength: 0.5,
            tokenOverrides: {
                contentText: '#123456',
                materialBlur: 42,
            },
        });

        expect(flattenMacThemeTokens(theme, false)).toMatchObject({
            'content-text': '#123456',
            'material-blur': '42',
        });
        expect(flattenMacThemeTokens(theme, true)).toMatchObject({
            'content-text': '#123456',
            'material-blur': '42',
        });
    });
});
