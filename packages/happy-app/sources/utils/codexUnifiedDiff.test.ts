import { describe, expect, it } from 'vitest';
import { splitUnifiedDiffFiles } from './codexUnifiedDiff';

describe('splitUnifiedDiffFiles', () => {
    it('keeps a single-file patch intact', () => {
        const patch = '--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new';

        expect(splitUnifiedDiffFiles(patch)).toEqual([{ patch, fileName: 'a.ts' }]);
    });

    it('splits a git diff into individual file patches', () => {
        const patch = [
            'diff --git a/a.ts b/a.ts',
            '--- a/a.ts',
            '+++ b/a.ts',
            '@@ -1 +1 @@',
            '-old',
            '+new',
            'diff --git a/b.ts b/b.ts',
            '--- a/b.ts',
            '+++ b/b.ts',
            '@@ -1 +1 @@',
            '-before',
            '+after',
        ].join('\n');

        const files = splitUnifiedDiffFiles(patch);

        expect(files).toHaveLength(2);
        expect(files.map((file) => file.fileName)).toEqual(['a.ts', 'b.ts']);
        expect(files[0].patch).toContain('+new');
        expect(files[0].patch).not.toContain('b/b.ts');
        expect(files[1].patch).toContain('+after');
    });
});
