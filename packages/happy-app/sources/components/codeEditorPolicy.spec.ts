import { describe, expect, it } from 'vitest';
import {
    LARGE_FILE_CHARACTER_LIMIT,
    shouldEnableSyntaxHighlighting,
    shouldPollExternalFile,
} from './codeEditorPolicy';

describe('large file editor policy', () => {
    it('disables whole-document work above the large-file threshold', () => {
        expect(shouldEnableSyntaxHighlighting('x'.repeat(LARGE_FILE_CHARACTER_LIMIT))).toBe(true);
        expect(shouldEnableSyntaxHighlighting('x'.repeat(LARGE_FILE_CHARACTER_LIMIT + 1))).toBe(false);
        expect(shouldPollExternalFile(LARGE_FILE_CHARACTER_LIMIT + 1, false)).toBe(false);
    });

    it('does not poll while the user has unsaved changes', () => {
        expect(shouldPollExternalFile(100, true)).toBe(false);
        expect(shouldPollExternalFile(100, false)).toBe(true);
    });
});
