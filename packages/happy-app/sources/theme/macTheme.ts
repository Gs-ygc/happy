export type MacThemeMode = 'adaptive' | 'light' | 'dark';

export interface MacThemeTokens {
    contentBackground: string;
    contentText: string;
    opaqueSurface: string;
    materialBackground: string;
    materialTint: string;
    surfaceBorder: string;
    popoverShadow: string;
    materialBlur: number;
    materialSaturation: number;
    accentColor: string;
}

export interface MacThemeGeneratorInput {
    id: string;
    name: string;
    mode: MacThemeMode;
    baseColor: string;
    accentColor: string;
    contrast: number;
    materialStrength: number;
    tokenOverrides?: Partial<MacThemeTokens>;
}

export interface MacThemeDefinition {
    schemaVersion: 1;
    id: string;
    name: string;
    mode: MacThemeMode;
    generator: {
        baseColor: string;
        accentColor: string;
        contrast: number;
        materialStrength: number;
    };
    tokenOverrides: Partial<MacThemeTokens>;
}

const macThemePresets: Record<string, MacThemeGeneratorInput> = {
    systemGlass: {
        id: 'system-glass',
        name: 'System Glass',
        mode: 'adaptive',
        baseColor: '#f2f2f7',
        accentColor: '#007aff',
        contrast: 0.55,
        materialStrength: 0.78,
    },
    graphite: {
        id: 'graphite',
        name: 'Graphite',
        mode: 'adaptive',
        baseColor: '#6b7078',
        accentColor: '#5e8edc',
        contrast: 0.72,
        materialStrength: 0.42,
    },
    ink: {
        id: 'ink',
        name: 'Ink',
        mode: 'dark',
        baseColor: '#202632',
        accentColor: '#7da7ff',
        contrast: 0.78,
        materialStrength: 0.5,
    },
    paper: {
        id: 'paper',
        name: 'Paper',
        mode: 'light',
        baseColor: '#ece9e1',
        accentColor: '#2f6f8f',
        contrast: 0.82,
        materialStrength: 0.28,
    },
};

// Keep the serialized preset ID available as a lookup alias without exposing a
// duplicate entry to preset pickers that iterate the enumerable values.
Object.defineProperty(macThemePresets, 'system-glass', {
    value: macThemePresets.systemGlass,
    enumerable: false,
});

export const MAC_THEME_PRESETS = macThemePresets;

const TOKEN_KEYS = [
    'contentBackground',
    'contentText',
    'opaqueSurface',
    'materialBackground',
    'materialTint',
    'surfaceBorder',
    'popoverShadow',
    'materialBlur',
    'materialSaturation',
    'accentColor',
] as const satisfies readonly (keyof MacThemeTokens)[];

const HEX_COLOR = /^#[\da-f]{6}(?:[\da-f]{2})?$/i;
const ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

function clamp(value: number, minimum = 0, maximum = 1): number {
    if (!Number.isFinite(value)) return minimum;
    return Math.min(maximum, Math.max(minimum, value));
}

function normalizeColor(value: string, fallback: string): string {
    const color = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return HEX_COLOR.test(color) ? color : fallback;
}

function normalizeId(value: string): string {
    const normalized = String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return normalized || 'custom-theme';
}

function hexToRgb(hex: string): Rgb {
    const value = hex.slice(1, 7);
    return {
        r: Number.parseInt(value.slice(0, 2), 16),
        g: Number.parseInt(value.slice(2, 4), 16),
        b: Number.parseInt(value.slice(4, 6), 16),
    };
}

function rgbToHex({ r, g, b }: Rgb): string {
    return `#${[r, g, b].map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: lightness };
    const difference = max - min;
    const saturation = lightness > 0.5 ? difference / (2 - max - min) : difference / (max + min);
    let hue: number;
    switch (max) {
        case red:
            hue = (green - blue) / difference + (green < blue ? 6 : 0);
            break;
        case green:
            hue = (blue - red) / difference + 2;
            break;
        default:
            hue = (red - green) / difference + 4;
    }
    return { h: hue / 6, s: saturation, l: lightness };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
    if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
    const hue = (h + 1) % 1;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hueToChannel = (t: number): number => {
        const value = (t + 1) % 1;
        if (value < 1 / 6) return p + (q - p) * 6 * value;
        if (value < 1 / 2) return q;
        if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
        return p;
    };
    return { r: hueToChannel(hue + 1 / 3) * 255, g: hueToChannel(hue) * 255, b: hueToChannel(hue - 1 / 3) * 255 };
}

function adjustLightness(color: string, lightness: number, saturation?: number): string {
    const hsl = rgbToHsl(hexToRgb(color));
    return rgbToHex(hslToRgb({ h: hsl.h, s: clamp(saturation ?? hsl.s), l: clamp(lightness) }));
}

function mix(first: string, second: string, amount: number): string {
    const a = hexToRgb(first);
    const b = hexToRgb(second);
    const ratio = clamp(amount);
    return rgbToHex({
        r: a.r + (b.r - a.r) * ratio,
        g: a.g + (b.g - a.g) * ratio,
        b: a.b + (b.b - a.b) * ratio,
    });
}

function relativeLuminance(color: string): number {
    const channels = Object.values(hexToRgb(color)).map((channel) => channel / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function deriveTokens(baseColor: string, accentColor: string, contrast: number, materialStrength: number, dark: boolean): MacThemeTokens {
    const base = normalizeColor(baseColor, '#808080');
    const accent = normalizeColor(accentColor, '#007aff');
    const baseHsl = rgbToHsl(hexToRgb(base));
    const saturation = Math.min(0.8, baseHsl.s + materialStrength * 0.12);
    const background = dark
        ? adjustLightness(base, 0.08 + (1 - baseHsl.l) * 0.12, saturation)
        : adjustLightness(base, 0.94 + (1 - baseHsl.l) * 0.04, saturation);
    const opaqueSurface = dark ? mix(background, '#ffffff', 0.09 + (1 - contrast) * 0.06) : mix(background, '#ffffff', 0.34 + (1 - contrast) * 0.12);
    const materialBackground = dark ? mix(background, '#ffffff', materialStrength * 0.14) : mix(background, '#ffffff', materialStrength * 0.1);
    const contentText = relativeLuminance(background) > 0.45 ? '#17181c' : '#f5f7fa';
    const border = dark ? mix(contentText, background, 0.78 - contrast * 0.18) : mix(contentText, background, 0.88 - contrast * 0.16);
    return {
        contentBackground: background,
        contentText,
        opaqueSurface,
        materialBackground,
        materialTint: mix(accent, background, dark ? 0.18 : 0.08),
        surfaceBorder: border,
        popoverShadow: dark ? '#000000' : '#6b6d73',
        materialBlur: Math.round(materialStrength * 24),
        materialSaturation: Math.round((0.85 + materialStrength * 0.75) * 100) / 100,
        accentColor: accent,
    };
}

export function createMacTheme(input: MacThemeGeneratorInput): MacThemeDefinition {
    const baseColor = normalizeColor(input.baseColor, '#808080');
    const accentColor = normalizeColor(input.accentColor, '#007aff');
    return {
        schemaVersion: 1,
        id: normalizeId(input.id),
        name: String(input.name ?? '').trim() || normalizeId(input.id),
        mode: input.mode === 'dark' || input.mode === 'light' ? input.mode : 'adaptive',
        generator: {
            baseColor,
            accentColor,
            contrast: clamp(input.contrast),
            materialStrength: clamp(input.materialStrength),
        },
        tokenOverrides: input.tokenOverrides ? { ...input.tokenOverrides } : {},
    };
}

function isTokenOverride(value: unknown, key: keyof MacThemeTokens): value is MacThemeTokens[typeof key] {
    if (key === 'materialBlur') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
    if (key === 'materialSaturation') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 2;
    return typeof value === 'string' && HEX_COLOR.test(value.trim());
}

export function sanitizeMacTheme(value: unknown): MacThemeDefinition | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    if (candidate.schemaVersion !== 1 || typeof candidate.id !== 'string' || !ID.test(candidate.id) || typeof candidate.name !== 'string' || !candidate.name.trim()) return null;
    if (candidate.mode !== 'adaptive' && candidate.mode !== 'light' && candidate.mode !== 'dark') return null;
    const generator = candidate.generator;
    if (!generator || typeof generator !== 'object') return null;
    const rawGenerator = generator as Record<string, unknown>;
    if (typeof rawGenerator.baseColor !== 'string' || !HEX_COLOR.test(rawGenerator.baseColor.trim()) || typeof rawGenerator.accentColor !== 'string' || !HEX_COLOR.test(rawGenerator.accentColor.trim())) return null;
    if (typeof rawGenerator.contrast !== 'number' || !Number.isFinite(rawGenerator.contrast) || rawGenerator.contrast < 0 || rawGenerator.contrast > 1) return null;
    if (typeof rawGenerator.materialStrength !== 'number' || !Number.isFinite(rawGenerator.materialStrength) || rawGenerator.materialStrength < 0 || rawGenerator.materialStrength > 1) return null;
    const overrides = candidate.tokenOverrides;
    if (overrides !== undefined && (!overrides || typeof overrides !== 'object' || Array.isArray(overrides))) return null;
    const normalizedOverrides: Partial<MacThemeTokens> = {};
    for (const [key, override] of Object.entries((overrides ?? {}) as Record<string, unknown>)) {
        if (!(TOKEN_KEYS as readonly string[]).includes(key) || !isTokenOverride(override, key as keyof MacThemeTokens)) return null;
        Object.assign(normalizedOverrides, {
            [key]: typeof override === 'string' ? override.trim().toLowerCase() : override,
        });
    }
    return {
        schemaVersion: 1,
        id: candidate.id,
        name: candidate.name.trim(),
        mode: candidate.mode,
        generator: {
            baseColor: rawGenerator.baseColor.trim().toLowerCase(),
            accentColor: rawGenerator.accentColor.trim().toLowerCase(),
            contrast: rawGenerator.contrast,
            materialStrength: rawGenerator.materialStrength,
        },
        tokenOverrides: normalizedOverrides,
    };
}

export function flattenMacThemeTokens(theme: MacThemeDefinition, dark: boolean): Record<string, string> {
    const tokens = deriveTokens(theme.generator.baseColor, theme.generator.accentColor, theme.generator.contrast, theme.generator.materialStrength, dark);
    const resolved = { ...tokens, ...theme.tokenOverrides };
    return {
        'content-background': resolved.contentBackground,
        'content-text': resolved.contentText,
        'opaque-surface': resolved.opaqueSurface,
        'material-background': resolved.materialBackground,
        'material-tint': resolved.materialTint,
        'surface-border': resolved.surfaceBorder,
        'popover-shadow': resolved.popoverShadow,
        'material-blur': String(resolved.materialBlur),
        'material-saturation': String(resolved.materialSaturation),
        'accent-color': resolved.accentColor,
    };
}
