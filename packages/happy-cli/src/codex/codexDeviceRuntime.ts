import { execFile, execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { promisify } from 'node:util';
import type { CodexInstallKind, CodexStatus } from '@slopus/happy-wire';
import { redactCodexOutput } from './codexOutputRedaction';

const execFileAsync = promisify(execFile);

export function parseCodexVersion(output: string): string | null {
    const match = output.match(/codex-cli\s+\d+\.\d+\.\d+/i);
    return match?.[0] ?? null;
}

export function detectCodexInstallKind(executablePath: string): CodexInstallKind {
    const normalized = executablePath.replaceAll('\\', '/').toLowerCase();
    if (normalized.includes('/caskroom/') || normalized.includes('/homebrew/')) return 'homebrew';
    if (normalized.includes('/pnpm/') || normalized.includes('/.pnpm/')) return 'pnpm';
    if (normalized.includes('/.bun/') || normalized.includes('/bun/')) return 'bun';
    if (normalized.includes('/node_modules/@openai/codex/')) return 'npm';
    return 'unknown';
}

function resolveCodexExecutable(): string | null {
    try {
        const command = process.platform === 'win32' ? 'where' : 'which';
        return execFileSync(command, ['codex'], { encoding: 'utf8', windowsHide: true })
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find(Boolean) ?? null;
    } catch {
        return null;
    }
}

export function readCodexStatus(): CodexStatus {
    const executable = resolveCodexExecutable();
    if (!executable) {
        return {
            installed: false,
            version: null,
            executablePath: null,
            installKind: 'unknown',
            updateSupported: false,
            checkedAt: Date.now(),
        };
    }

    let resolvedPath = executable;
    try {
        resolvedPath = realpathSync(executable);
    } catch { /* keep the command path */ }

    let version: string | null = null;
    try {
        version = parseCodexVersion(execFileSync('codex', ['--version'], { encoding: 'utf8', windowsHide: true }));
    } catch { /* report installed but version unknown */ }

    const installKind = detectCodexInstallKind(resolvedPath);
    return {
        installed: true,
        version,
        executablePath: resolvedPath,
        installKind,
        updateSupported: version !== null && installKind !== 'unknown',
        checkedAt: Date.now(),
    };
}

function sanitizeOutput(output: string): string {
    return redactCodexOutput(output)
        .trim()
        .split(/\r?\n/)
        .slice(-1)[0]
        ?.slice(0, 300) || 'command failed';
}

export async function updateCodexCli(targetVersion?: string): Promise<CodexStatus> {
    const current = readCodexStatus();
    if (!current.installed) throw new Error('Codex CLI is not installed');
    if (!current.updateSupported) throw new Error('Codex CLI installation source is not supported for automatic updates');

    const version = targetVersion || 'latest';
    let command: string;
    let args: string[];
    switch (current.installKind) {
        case 'npm':
            command = 'npm';
            args = ['install', '--global', `@openai/codex@${version}`];
            break;
        case 'pnpm':
            command = 'pnpm';
            args = ['add', '--global', `@openai/codex@${version}`];
            break;
        case 'bun':
            command = 'bun';
            args = ['add', '--global', `@openai/codex@${version}`];
            break;
        case 'homebrew':
            if (targetVersion) throw new Error('Homebrew Codex updates only support the latest cask');
            command = 'brew';
            args = ['upgrade', '--cask', 'codex'];
            break;
        default:
            throw new Error('Codex CLI installation source is not supported for automatic updates');
    }

    try {
        await execFileAsync(command, args, {
            timeout: 10 * 60 * 1000,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
        });
    } catch (error: any) {
        const output = `${error?.stdout ?? ''}\n${error?.stderr ?? ''}`;
        throw new Error(`Codex CLI update failed: ${sanitizeOutput(output)}`);
    }

    return readCodexStatus();
}
