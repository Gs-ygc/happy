export const LARGE_FILE_CHARACTER_LIMIT = 512 * 1024;
export function shouldEnableSyntaxHighlighting(value: string | number): boolean { return (typeof value === 'number' ? value : value.length) <= LARGE_FILE_CHARACTER_LIMIT; }
export function shouldPollExternalFile(characterCount: number, isDirty: boolean): boolean { return !isDirty && characterCount <= LARGE_FILE_CHARACTER_LIMIT; }
