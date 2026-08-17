import { z } from 'zod';

export const CODEX_CONFIG_MAX_BYTES = 64 * 1024;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const CodexConfigContentSchema = z.string()
    .max(CODEX_CONFIG_MAX_BYTES)
    .refine(
        (value) => new TextEncoder().encode(value).byteLength <= CODEX_CONFIG_MAX_BYTES,
        'Codex config exceeds the UTF-8 byte limit',
    );

export const CodexConfigSnapshotSchema = z.object({
    path: z.string().trim().min(1).max(4096),
    content: CodexConfigContentSchema,
    exists: z.boolean(),
    sha256: z.string().regex(SHA256_HEX),
    modifiedAt: z.number().nonnegative().nullable(),
}).strict();
export type CodexConfigSnapshot = z.infer<typeof CodexConfigSnapshotSchema>;

export const CodexConfigWriteRequestSchema = z.object({
    content: CodexConfigContentSchema,
    expectedSha256: z.string().regex(SHA256_HEX),
}).strict();
export type CodexConfigWriteRequest = z.infer<typeof CodexConfigWriteRequestSchema>;

export const CodexOperationKindSchema = z.enum(['status', 'restart', 'update']);
export type CodexOperationKind = z.infer<typeof CodexOperationKindSchema>;

export const CodexOperationRequestSchema = z.object({
    operationId: z.string().trim().min(1).max(128),
    kind: CodexOperationKindSchema,
    targetVersion: z.string().trim().regex(
        /^(?:latest|next|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/,
        'targetVersion must be latest, next, or a semantic version',
    ).optional(),
}).strict();
export type CodexOperationRequest = z.infer<typeof CodexOperationRequestSchema>;

export const CodexOperationStateSchema = z.enum(['queued', 'running', 'completed', 'failed']);
export type CodexOperationState = z.infer<typeof CodexOperationStateSchema>;

export const CodexInstallKindSchema = z.enum(['npm', 'pnpm', 'bun', 'homebrew', 'unknown']);
export type CodexInstallKind = z.infer<typeof CodexInstallKindSchema>;

export const CodexStatusSchema = z.object({
    installed: z.boolean(),
    version: z.string().nullable(),
    executablePath: z.string().nullable(),
    installKind: CodexInstallKindSchema,
    updateSupported: z.boolean(),
    checkedAt: z.number().nonnegative(),
}).strict();
export type CodexStatus = z.infer<typeof CodexStatusSchema>;

export const CodexOperationSnapshotSchema = z.object({
    operationId: z.string().trim().min(1).max(128),
    kind: CodexOperationKindSchema,
    state: CodexOperationStateSchema,
    progress: z.number().int().min(0).max(100).optional(),
    message: z.string().max(500).optional(),
    result: CodexStatusSchema.optional(),
    error: z.string().max(500).optional(),
    updatedAt: z.number().nonnegative(),
}).strict();
export type CodexOperationSnapshot = z.infer<typeof CodexOperationSnapshotSchema>;

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SENSITIVE_KEY = /(?:token|api[_-]?key|secret|password|authorization|credential)/i;
const ABSOLUTE_PATH = /^(?:\/|[A-Za-z]:[\\/])/;
const SENSITIVE_VALUE = /(?:bearer\s+|token\s*[=:]|api[_-]?key\s*[=:]|secret\s*[=:]|password\s*[=:])/i;

export const CodexMcpServerSchema = z.object({
    name: z.string().regex(SAFE_IDENTIFIER),
    command: z.string().trim().min(1).max(1024),
    args: z.array(z.string().max(4096)).max(100).default([]),
    cwd: z.string().trim().min(1).max(4096).optional(),
    plainEnv: z.record(z.string().regex(SAFE_IDENTIFIER), z.string().max(4096)).default({}),
    // Maps the MCP environment variable to an environment variable already
    // present on the target device. Secret values never enter synced policy.
    secretEnv: z.record(z.string().regex(SAFE_IDENTIFIER), z.string().regex(SAFE_IDENTIFIER)).default({}),
}).strict().superRefine((server, ctx) => {
    for (const key of Object.keys(server.plainEnv)) {
        if (SENSITIVE_KEY.test(key)) {
            ctx.addIssue({ code: 'custom', message: `${key} must use secretEnv`, path: ['plainEnv', key] });
        }
    }
    for (const [key, value] of Object.entries(server.plainEnv)) {
        if (SENSITIVE_VALUE.test(value)) {
            ctx.addIssue({ code: 'custom', message: `${key} must not contain credentials`, path: ['plainEnv', key] });
        }
    }
});
export type CodexMcpServer = z.infer<typeof CodexMcpServerSchema>;

export const CodexManagedSkillSourceSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('local'),
        path: z.string().trim().min(1).max(4096).regex(ABSOLUTE_PATH, 'Local skill path must be absolute'),
    }).strict(),
    z.object({
        kind: z.literal('git'),
        repository: z.string().trim().min(1).max(4096).refine(
            (value) => !/^https?:\/\/[^/@]+@/i.test(value) && !/[?&](?:token|api[_-]?key|secret|password)=/i.test(value),
            'Git repository URLs must not contain credentials',
        ),
        revision: z.string().trim().min(1).max(256).default('HEAD'),
        subdirectory: z.string().trim().min(1).max(1024).refine(
            (value) => !value.startsWith('/') && !value.split(/[\\/]/).includes('..'),
            'Skill subdirectory must stay inside the repository',
        ).optional(),
    }).strict(),
]);

export const CodexManagedSkillSchema = z.object({
    id: z.string().regex(SAFE_IDENTIFIER),
    name: z.string().regex(SAFE_IDENTIFIER),
    enabled: z.boolean().default(true),
    source: CodexManagedSkillSourceSchema,
}).strict();
export type CodexManagedSkill = z.infer<typeof CodexManagedSkillSchema>;

function findSensitiveConfigPath(value: unknown, path: Array<string | number> = [], depth = 0): Array<string | number> | null {
    if (!value || typeof value !== 'object' || depth > 100) return null;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (SENSITIVE_KEY.test(key) && typeof child === 'string' && child.length > 0) return [...path, key];
        if (typeof child === 'string' && SENSITIVE_VALUE.test(child)) {
            return [...path, key];
        }
        const nested = findSensitiveConfigPath(child, [...path, key], depth + 1);
        if (nested) return nested;
    }
    return null;
}

export const CodexDevicePolicySchema = z.object({
    revision: z.number().int().nonnegative(),
    // Managed Codex behavior is opt-in. These defaults intentionally protect
    // existing local config until the user explicitly enables a policy.
    enabled: z.boolean().default(false),
    syncBaseConfig: z.boolean().default(false),
    syncMcpServers: z.boolean().default(false),
    syncSkills: z.boolean().default(false),
    baseConfig: z.record(z.string().min(1).max(256), z.unknown()).default({}),
    mcpServers: z.array(CodexMcpServerSchema).max(100).default([]),
    skills: z.array(CodexManagedSkillSchema).max(100).default([]),
}).strict().superRefine((policy, ctx) => {
    const sensitivePath = findSensitiveConfigPath(policy.baseConfig);
    if (sensitivePath) {
        ctx.addIssue({ code: 'custom', message: 'Secrets must be referenced from the target environment', path: ['baseConfig', ...sensitivePath] });
    }
    for (const [serverIndex, server] of policy.mcpServers.entries()) {
        for (const [argIndex, arg] of server.args.entries()) {
            if (SENSITIVE_VALUE.test(arg)) {
                ctx.addIssue({ code: 'custom', message: 'MCP command arguments must not contain credentials', path: ['mcpServers', serverIndex, 'args', argIndex] });
            }
        }
    }
});
export type CodexDevicePolicy = z.infer<typeof CodexDevicePolicySchema>;

export const CodexDeviceGroupSchema = z.object({
    id: z.string().regex(SAFE_IDENTIFIER),
    name: z.string().trim().min(1).max(100),
    machineIds: z.array(z.string().trim().min(1).max(128)).max(500),
    membershipRevision: z.number().int().nonnegative().default(0),
    policy: CodexDevicePolicySchema,
}).strict();
export type CodexDeviceGroup = z.infer<typeof CodexDeviceGroupSchema>;

export const CodexDeviceGroupsSchema = z.array(CodexDeviceGroupSchema).max(100).superRefine((groups, ctx) => {
    const groupIds = new Set<string>();
    const assignedMachines = new Set<string>();
    for (const [groupIndex, group] of groups.entries()) {
        if (groupIds.has(group.id)) {
            ctx.addIssue({ code: 'custom', message: `Duplicate group id: ${group.id}`, path: [groupIndex, 'id'] });
        }
        groupIds.add(group.id);
        for (const [machineIndex, machineId] of group.machineIds.entries()) {
            if (assignedMachines.has(machineId)) {
                ctx.addIssue({ code: 'custom', message: `Machine belongs to multiple groups: ${machineId}`, path: [groupIndex, 'machineIds', machineIndex] });
            }
            assignedMachines.add(machineId);
        }
    }
});

export const CodexPolicyAssignmentSchema = z.object({
    groupId: z.string().regex(SAFE_IDENTIFIER),
    groupName: z.string().trim().min(1).max(100),
    policy: CodexDevicePolicySchema,
}).strict();
export type CodexPolicyAssignment = z.infer<typeof CodexPolicyAssignmentSchema>;
