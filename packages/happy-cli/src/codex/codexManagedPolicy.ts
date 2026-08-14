import { chmod, cp, lstat, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import {
    CodexPolicyAssignmentSchema,
    type CodexDevicePolicy,
    type CodexPolicyAssignment,
} from '@slopus/happy-wire';

const execFileAsync = promisify(execFile);

export type CodexManagedRuntime = {
    baseConfig: Record<string, unknown>;
    mcpServers: Record<string, unknown>;
};

export function codexManagedPolicyPath(happyHomeDir: string): string {
    return join(happyHomeDir, 'codex-managed-policy.json');
}

export function resolveCodexHome(environment: NodeJS.ProcessEnv = process.env): string {
    const configured = environment.CODEX_HOME;
    if (!configured || configured === '~') return join(homedir(), '.codex');
    if (configured.startsWith('~/') || configured.startsWith('~\\')) {
        return join(homedir(), configured.slice(2));
    }
    return resolve(configured);
}

export async function readCodexManagedPolicy(path: string): Promise<CodexPolicyAssignment | null> {
    try {
        return CodexPolicyAssignmentSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    } catch {
        return null;
    }
}

export async function writeCodexManagedPolicy(
    assignment: CodexPolicyAssignment | null,
    path: string,
): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    if (assignment === null) {
        await rm(path, { force: true });
        return;
    }
    const parsed = CodexPolicyAssignmentSchema.parse(assignment);
    const tempPath = `${path}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, path);
}

export async function applyCodexManagedPolicy(
    assignment: CodexPolicyAssignment | null,
    options: {
        policyPath: string;
        codexHome: string;
        materializeSkills?: typeof materializeCodexManagedSkills;
    },
): Promise<void> {
    const previous = await readCodexManagedPolicy(options.policyPath);
    if (JSON.stringify(previous) === JSON.stringify(assignment)) return;
    const materializeSkills = options.materializeSkills ?? materializeCodexManagedSkills;
    try {
        await materializeSkills(assignment, options.codexHome);
        await writeCodexManagedPolicy(assignment, options.policyPath);
    } catch (error) {
        await materializeSkills(previous, options.codexHome).catch(() => undefined);
        await writeCodexManagedPolicy(previous, options.policyPath).catch(() => undefined);
        throw error;
    }
}

export function buildCodexManagedRuntime(
    assignment: CodexPolicyAssignment | null,
    environment: NodeJS.ProcessEnv = process.env,
): CodexManagedRuntime {
    const policy: CodexDevicePolicy | null = assignment?.policy ?? null;
    if (!policy?.enabled) return { baseConfig: {}, mcpServers: {} };
    const mcpServers: Record<string, unknown> = {};
    for (const server of policy.syncMcpServers ? policy.mcpServers : []) {
        const env: Record<string, string> = { ...server.plainEnv };
        for (const [targetName, sourceName] of Object.entries(server.secretEnv)) {
            const value = environment[sourceName];
            if (value !== undefined) env[targetName] = value;
        }
        mcpServers[server.name] = {
            command: server.command,
            args: server.args,
            ...(server.cwd ? { cwd: server.cwd } : {}),
            ...(Object.keys(env).length > 0 ? { env } : {}),
        };
    }
    return {
        baseConfig: policy.syncBaseConfig ? { ...policy.baseConfig } : {},
        mcpServers,
    };
}

export async function materializeCodexManagedSkills(
    assignment: CodexPolicyAssignment | null,
    codexHome: string,
): Promise<void> {
    const root = join(codexHome, 'skills', '.happy-managed');
    const staging = `${root}.${process.pid}.tmp`;
    const backup = `${root}.${process.pid}.old`;
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    for (const skill of assignment?.policy.enabled && assignment.policy.syncSkills ? assignment.policy.skills : []) {
        if (!skill.enabled) continue;
        const destination = join(staging, skill.id);
        if (skill.source.kind === 'local') {
            await symlink(skill.source.path, destination, 'junction');
        } else {
            await materializeGitCodexSkill(
                skill.source.repository,
                skill.source.revision,
                destination,
                skill.source.subdirectory,
            );
        }
    }
    await rm(backup, { recursive: true, force: true });
    await rename(root, backup).catch(() => undefined);
    await rename(staging, root);
    await rm(backup, { recursive: true, force: true });
}

export async function materializeGitCodexSkill(
    repository: string,
    revision: string,
    destination: string,
    subdirectory?: string,
): Promise<void> {
    const staging = `${destination}.${process.pid}.tmp`;
    await rm(staging, { recursive: true, force: true });
    await mkdir(dirname(destination), { recursive: true });
    await execFileAsync('git', ['clone', '--filter=blob:none', '--no-checkout', '--no-tags', repository, staging], { timeout: 10 * 60 * 1000 });
    await execFileAsync('git', ['-C', staging, 'fetch', '--depth', '1', 'origin', revision], { timeout: 10 * 60 * 1000 });
    await execFileAsync('git', ['-C', staging, 'checkout', '--quiet', 'FETCH_HEAD'], { timeout: 60 * 1000 });
    const source = subdirectory ? join(staging, subdirectory) : staging;
    await assertNoSymbolicLinks(source);
    await rm(destination, { recursive: true, force: true });
    await cp(source, destination, { recursive: true, dereference: false });
    await rm(staging, { recursive: true, force: true });
}

export async function assertNoSymbolicLinks(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        const stat = await lstat(path);
        if (stat.isSymbolicLink()) {
            throw new Error(`Managed Git skill contains a symbolic link: ${entry.name}`);
        }
        if (stat.isDirectory()) await assertNoSymbolicLinks(path);
    }
}
