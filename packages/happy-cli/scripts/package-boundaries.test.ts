import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('published package boundaries', () => {
    it('bundles the workspace wire protocol instead of resolving the stale registry package at runtime', () => {
        const packageJson = JSON.parse(
            readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
        ) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };

        expect(packageJson.dependencies).not.toHaveProperty('@slopus/happy-wire');
        expect(packageJson.devDependencies?.['@slopus/happy-wire']).toBe('workspace:*');
    });
});
