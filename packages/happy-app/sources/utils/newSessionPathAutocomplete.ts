import { resolveAbsolutePath } from './pathUtils';

export type PathSuggestionItem = {
    key: string;
    label: string;
    subtitle?: string;
};

export type PathAutocompleteRequest = {
    queryPath: string;
    parentDisplay: string;
    prefix: string;
};

export function getPathAutocompleteRequest(
    value: string,
    homeDir?: string,
): PathAutocompleteRequest | null {
    const input = value.trim();
    if (!input) return null;

    const lastSeparator = Math.max(input.lastIndexOf('/'), input.lastIndexOf('\\'));
    const hasTrailingSeparator = /[\\/]$/.test(input);
    const parentDisplay = hasTrailingSeparator
        ? input
        : lastSeparator >= 0
            ? input.slice(0, lastSeparator + 1)
            : '~/';
    const prefix = input === '~' || hasTrailingSeparator
        ? ''
        : lastSeparator >= 0
            ? input.slice(lastSeparator + 1)
            : input;

    return {
        queryPath: resolveAbsolutePath(parentDisplay, homeDir),
        parentDisplay,
        prefix,
    };
}

export function getDirectoryPathSuggestions(
    request: PathAutocompleteRequest,
    entries: Array<{ name: string; type: 'file' | 'directory' | 'other' }>,
    limit = 30,
): PathSuggestionItem[] {
    const normalizedPrefix = request.prefix.toLocaleLowerCase();
    return entries
        .filter((entry) => entry.type === 'directory')
        .filter((entry) => !normalizedPrefix || entry.name.toLocaleLowerCase().startsWith(normalizedPrefix))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, limit)
        .map((entry) => ({
            key: `${request.parentDisplay}${entry.name}`,
            label: `${request.parentDisplay}${entry.name}`,
            subtitle: 'on machine',
        }));
}

export function filterPathSuggestions(
    value: string,
    homeDir: string | undefined,
    items: PathSuggestionItem[],
    normalizePath: (path: string, homeDir?: string) => string | null,
    limit = 30,
): PathSuggestionItem[] {
    const query = value.trim().toLocaleLowerCase();
    const normalizedQuery = normalizePath(value, homeDir)?.toLocaleLowerCase() ?? '';
    const seen = new Set<string>();

    return items
        .filter((item) => {
            const label = item.label.toLocaleLowerCase();
            const normalizedItem = normalizePath(item.key, homeDir)?.toLocaleLowerCase() ?? label;
            const matches = !query
                || label.startsWith(query)
                || label.includes(query)
                || normalizedItem.startsWith(normalizedQuery);
            if (!matches || seen.has(normalizedItem)) return false;
            seen.add(normalizedItem);
            return true;
        })
        .slice(0, limit);
}
