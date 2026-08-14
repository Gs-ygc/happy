import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexPolicyAssignmentSchema } from '@slopus/happy-wire';
import { applyCodexManagedPolicy, assertNoSymbolicLinks, buildCodexManagedRuntime, materializeCodexManagedSkills, readCodexManagedPolicy, writeCodexManagedPolicy } from './codexManagedPolicy';

describe('Codex managed policy', () => {
    it('writes and reads an encrypted-device metadata snapshot atomically', async () => {
        const root = await mkdtemp(join(tmpdir(), 'happy-codex-policy-'));
        const assignment = CodexPolicyAssignmentSchema.parse({
            groupId: 'dev',
            groupName: 'Development',
            policy: { revision: 4, baseConfig: { model_reasoning_effort: 'high' } },
        });
        const path = join(root, 'policy.json');

        await writeCodexManagedPolicy(assignment, path);
        expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ groupId: 'dev' });
        expect(await readCodexManagedPolicy(path)).toEqual(assignment);
    });

    it('merges MCP servers and resolves only referenced environment variables', () => {
        const runtime = buildCodexManagedRuntime({
            groupId: 'dev',
            groupName: 'Development',
            policy: {
                revision: 1,
                enabled: true,
                syncBaseConfig: true,
                syncMcpServers: true,
                syncSkills: true,
                baseConfig: { model_reasoning_effort: 'high' },
                mcpServers: [{
                    name: 'github', command: 'npx', args: ['server'],
                    plainEnv: { LOG_LEVEL: 'info' }, secretEnv: { GITHUB_TOKEN: 'GITHUB_TOKEN' },
                }],
                skills: [],
            },
        }, { GITHUB_TOKEN: 'token-value' });

        expect(runtime.baseConfig).toEqual({ model_reasoning_effort: 'high' });
        expect(runtime.mcpServers.github).toMatchObject({ command: 'npx', env: { LOG_LEVEL: 'info', GITHUB_TOKEN: 'token-value' } });
    });

    it('does not inject disabled managed policy sections', () => {
        const runtime = buildCodexManagedRuntime({
            groupId: 'dev',
            groupName: 'Development',
            policy: {
                revision: 1,
                enabled: true,
                syncBaseConfig: false,
                syncMcpServers: false,
                syncSkills: false,
                baseConfig: { model_reasoning_effort: 'high' },
                mcpServers: [{ name: 'github', command: 'server', args: [], plainEnv: {}, secretEnv: {} }],
                skills: [],
            },
        });
        expect(runtime).toEqual({ baseConfig: {}, mcpServers: {} });
    });

    it('does not inject anything when the policy master switch is disabled', () => {
        const runtime = buildCodexManagedRuntime({
            groupId: 'dev',
            groupName: 'Development',
            policy: {
                revision: 1,
                enabled: false,
                syncBaseConfig: true,
                syncMcpServers: true,
                syncSkills: true,
                baseConfig: { model_reasoning_effort: 'high' },
                mcpServers: [{ name: 'github', command: 'server', args: [], plainEnv: {}, secretEnv: {} }],
                skills: [],
            },
        });
        expect(runtime).toEqual({ baseConfig: {}, mcpServers: {} });
    });

    it('materializes local skills only inside the managed subtree', async () => {
        const root = await mkdtemp(join(tmpdir(), 'happy-codex-skills-'));
        const source = join(root, 'source');
        const codexHome = join(root, 'codex-home');
        await mkdir(source, { recursive: true });
        await writeFile(join(source, 'SKILL.md'), '# Review\n');

        await materializeCodexManagedSkills(CodexPolicyAssignmentSchema.parse({
            groupId: 'dev', groupName: 'Development',
            policy: {
                revision: 1,
                enabled: true,
                syncBaseConfig: false,
                syncMcpServers: false,
                syncSkills: true,
                skills: [{ id: 'review', name: 'review', enabled: true, source: { kind: 'local', path: source } }],
            },
        }), codexHome);

        expect(await readFile(join(codexHome, 'skills', '.happy-managed', 'review', 'SKILL.md'), 'utf8')).toBe('# Review\n');
    });

    it('rolls back the policy snapshot when skill materialization fails', async () => {
        const root = await mkdtemp(join(tmpdir(), 'happy-codex-rollback-'));
        const path = join(root, 'policy.json');
        const previous = CodexPolicyAssignmentSchema.parse({ groupId: 'old', groupName: 'Old', policy: { revision: 1 } });
        const next = CodexPolicyAssignmentSchema.parse({ groupId: 'new', groupName: 'New', policy: { revision: 2 } });
        await writeCodexManagedPolicy(previous, path);
        let calls = 0;

        await expect(applyCodexManagedPolicy(next, {
            policyPath: path,
            codexHome: join(root, 'codex-home'),
            materializeSkills: async () => {
                calls += 1;
                if (calls === 1) throw new Error('clone failed');
            },
        })).rejects.toThrow('clone failed');

        expect(await readCodexManagedPolicy(path)).toEqual(previous);
        expect(calls).toBe(2);
    });

    it('rejects symbolic links before copying a Git-provided skill', async () => {
        const root = await mkdtemp(join(tmpdir(), 'happy-codex-symlink-'));
        await symlink('/etc/passwd', join(root, 'outside'));
        await expect(assertNoSymbolicLinks(root)).rejects.toThrow('symbolic link');
    });
});
