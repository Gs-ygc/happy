import { describe, expect, it } from 'vitest';
import {
    CodexDeviceGroupsSchema,
    CodexPolicyAssignmentSchema,
    CodexConfigSnapshotSchema,
    CodexConfigWriteRequestSchema,
    CodexOperationRequestSchema,
    CodexOperationSnapshotSchema,
} from './codexManagement';

describe('Codex config file wire contract', () => {
    it('accepts an exact device config snapshot', () => {
        expect(CodexConfigSnapshotSchema.parse({
            path: '/home/user/.codex/config.toml',
            content: 'model = "gpt-5.6-sol"\n',
            exists: true,
            sha256: 'a'.repeat(64),
            modifiedAt: 123,
        })).toMatchObject({ exists: true, modifiedAt: 123 });
    });

    it('rejects oversized config writes', () => {
        expect(CodexConfigWriteRequestSchema).toBeDefined();
        expect(() => CodexConfigWriteRequestSchema.parse({
            content: 'x'.repeat(64 * 1024 + 1),
            expectedSha256: 'a'.repeat(64),
        })).toThrow();
    });

    it('measures the config limit in UTF-8 bytes instead of JavaScript characters', () => {
        expect(() => CodexConfigWriteRequestSchema.parse({
            content: '你'.repeat(30_000),
            expectedSha256: 'a'.repeat(64),
        })).toThrow();
    });
});

describe('Codex management wire contract', () => {
    it('accepts the minimal idempotent operation request', () => {
        expect(CodexOperationRequestSchema.parse({
            operationId: 'op-1',
            kind: 'status',
        })).toEqual({
            operationId: 'op-1',
            kind: 'status',
        });
    });

    it('rejects operation IDs that could be used to flood the daemon cache', () => {
        expect(() => CodexOperationRequestSchema.parse({
            operationId: 'x'.repeat(129),
            kind: 'status',
        })).toThrow();
    });

    it('rejects arbitrary package specifications as update targets', () => {
        expect(() => CodexOperationRequestSchema.parse({
            operationId: 'op-update',
            kind: 'update',
            targetVersion: 'file:/tmp/untrusted-package',
        })).toThrow();
    });

    it('preserves explicit progress and result state', () => {
        expect(CodexOperationSnapshotSchema.parse({
            operationId: 'op-1',
            kind: 'update',
            state: 'running',
            progress: 40,
            message: 'Updating Codex',
            updatedAt: 123,
        })).toMatchObject({ state: 'running', progress: 40 });
    });
});

describe('Codex device policy schemas', () => {
    it('defaults all managed sync controls to disabled for new policies', () => {
        const policy = CodexPolicyAssignmentSchema.parse({
            groupId: 'a',
            groupName: 'A',
            policy: { revision: 1 },
        }).policy;
        expect(policy).toMatchObject({
            enabled: false,
            syncBaseConfig: false,
            syncMcpServers: false,
            syncSkills: false,
        });
    });

    it('accepts an account-scoped group without embedding secret values', () => {
        const groups = CodexDeviceGroupsSchema.parse([{
            id: 'group-dev',
            name: 'Development',
            machineIds: ['machine-1'],
            policy: {
                revision: 3,
                baseConfig: { model_reasoning_effort: 'high' },
                mcpServers: [{
                    name: 'github',
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-github'],
                    plainEnv: { LOG_LEVEL: 'info' },
                    secretEnv: { GITHUB_TOKEN: 'GITHUB_TOKEN' },
                }],
                skills: [{
                    id: 'review',
                    name: 'review',
                    enabled: true,
                    source: { kind: 'local', path: '/opt/codex-skills/review' },
                }],
            },
        }]);

        expect(groups[0].policy.mcpServers[0].secretEnv).toEqual({ GITHUB_TOKEN: 'GITHUB_TOKEN' });
        expect(JSON.stringify(groups)).not.toContain('secret-value');
    });

    it('rejects duplicate machine assignments and unsafe skill names', () => {
        expect(() => CodexDeviceGroupsSchema.parse([
            { id: 'a', name: 'A', machineIds: ['machine-1'], policy: { revision: 1 } },
            { id: 'b', name: 'B', machineIds: ['machine-1'], policy: { revision: 1 } },
        ])).toThrow();
        expect(() => CodexPolicyAssignmentSchema.parse({
            groupId: 'a',
            groupName: 'A',
            policy: {
                revision: 1,
                skills: [{ id: '../escape', name: '../escape', enabled: true, source: { kind: 'local', path: '/tmp/x' } }],
            },
        })).toThrow();
    });

    it('rejects plaintext secrets in synced policy', () => {
        expect(() => CodexPolicyAssignmentSchema.parse({
            groupId: 'a', groupName: 'A',
            policy: { revision: 1, baseConfig: { openai_api_key: 'secret-value' } },
        })).toThrow();
        expect(() => CodexPolicyAssignmentSchema.parse({
            groupId: 'a', groupName: 'A',
            policy: {
                revision: 1,
                mcpServers: [{ name: 'github', command: 'server', plainEnv: { GITHUB_TOKEN: 'secret-value' } }],
            },
        })).toThrow();
        expect(() => CodexPolicyAssignmentSchema.parse({
            groupId: 'a', groupName: 'A',
            policy: { revision: 1, baseConfig: { headers: { Authorization: 'Bearer secret-value' } } },
        })).toThrow();
        expect(() => CodexPolicyAssignmentSchema.parse({
            groupId: 'a', groupName: 'A',
            policy: { revision: 1, mcpServers: [{ name: 'github', command: 'server', args: ['--api-key=secret-value'] }] },
        })).toThrow();
        expect(() => CodexPolicyAssignmentSchema.parse({
            groupId: 'a', groupName: 'A',
            policy: { revision: 1, mcpServers: [{ name: 'github', command: 'server', plainEnv: { UPSTREAM: 'Bearer secret-value' } }] },
        })).toThrow();
    });
});
