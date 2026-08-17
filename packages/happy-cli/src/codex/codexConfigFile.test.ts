import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCodexConfigFile, writeCodexConfigFile } from './codexConfigFile';

const sha256 = (content: string) => createHash('sha256').update(content).digest('hex');

describe('Codex config file', () => {
    it('reads the existing user-level config without replacing it with defaults', async () => {
        const codexHome = await mkdtemp(join(tmpdir(), 'happy-codex-config-'));
        const content = 'model = "gpt-5.6-sol"\n[features]\nmulti_agent = true\n';
        await writeFile(join(codexHome, 'config.toml'), content);

        await expect(readCodexConfigFile(codexHome)).resolves.toMatchObject({
            path: join(codexHome, 'config.toml'),
            content,
            exists: true,
            sha256: sha256(content),
        });
    });

    it('rejects a save when the config changed after it was loaded', async () => {
        const codexHome = await mkdtemp(join(tmpdir(), 'happy-codex-config-'));
        const path = join(codexHome, 'config.toml');
        await writeFile(path, 'model = "old"\n');
        const loaded = await readCodexConfigFile(codexHome);
        await writeFile(path, 'model = "changed-elsewhere"\n');

        await expect(writeCodexConfigFile({
            content: 'model = "from-app"\n',
            expectedSha256: loaded.sha256,
        }, codexHome)).rejects.toThrow('changed since it was loaded');
        await expect(readFile(path, 'utf8')).resolves.toBe('model = "changed-elsewhere"\n');
    });

    it('backs up and atomically replaces the current config with private permissions', async () => {
        const codexHome = await mkdtemp(join(tmpdir(), 'happy-codex-config-'));
        await mkdir(codexHome, { recursive: true });
        const path = join(codexHome, 'config.toml');
        const previous = 'model = "old"\n';
        const next = 'model = "new"\n';
        await writeFile(path, previous);
        const loaded = await readCodexConfigFile(codexHome);

        const saved = await writeCodexConfigFile({ content: next, expectedSha256: loaded.sha256 }, codexHome);

        expect(saved).toMatchObject({ content: next, exists: true, sha256: sha256(next) });
        await expect(readFile(path, 'utf8')).resolves.toBe(next);
        await expect(readFile(`${path}.happy-backup`, 'utf8')).resolves.toBe(previous);
        expect((await stat(path)).mode & 0o777).toBe(0o600);
    });

    it('allows only one of two concurrent saves from the same snapshot', async () => {
        const codexHome = await mkdtemp(join(tmpdir(), 'happy-codex-config-'));
        const path = join(codexHome, 'config.toml');
        await writeFile(path, 'model = "old"\n');
        const loaded = await readCodexConfigFile(codexHome);

        const results = await Promise.allSettled([
            writeCodexConfigFile({ content: 'model = "first"\n', expectedSha256: loaded.sha256 }, codexHome),
            writeCodexConfigFile({ content: 'model = "second"\n', expectedSha256: loaded.sha256 }, codexHome),
        ]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
        expect(['model = "first"\n', 'model = "second"\n']).toContain(await readFile(path, 'utf8'));
    });
});
