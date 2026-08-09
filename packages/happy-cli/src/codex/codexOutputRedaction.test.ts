import { describe, expect, it } from 'vitest';
import { redactCodexOutput } from './codexOutputRedaction';

describe('redactCodexOutput', () => {
    it('redacts named secrets, bearer tokens, and URL credentials', () => {
        const redacted = redactCodexOutput('token=one Authorization: Bearer two https://user:three@registry.example/path');
        expect(redacted).not.toContain('one');
        expect(redacted).not.toContain('two');
        expect(redacted).not.toContain('three');
        expect(redacted).toContain('[redacted]');
    });
});
