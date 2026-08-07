import type { MacThemeDefinition } from './macTheme';
import { sanitizeMacTheme } from './macTheme';

export function exportMacThemes(library: MacThemeDefinition[]): string {
    return JSON.stringify({ schemaVersion: 1, themes: library }, null, 2);
}

export function importMacThemes(
    raw: string,
    existing: MacThemeDefinition[],
): { library: MacThemeDefinition[]; selectedId: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { library: existing, selectedId: existing[0]?.id ?? 'system-glass' };
    }

    const values = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { themes?: unknown }).themes)
            ? (parsed as { themes: unknown[] }).themes
            : [];
    const imported = values
        .map(sanitizeMacTheme)
        .filter((theme): theme is MacThemeDefinition => theme !== null);
    if (imported.length === 0) {
        return { library: existing, selectedId: existing[0]?.id ?? 'system-glass' };
    }

    const byId = new Map(existing.map((theme) => [theme.id, theme]));
    for (const theme of imported) byId.set(theme.id, theme);
    const library = [...byId.values()];
    return { library, selectedId: existing[0]?.id ?? library[0]?.id ?? 'system-glass' };
}
