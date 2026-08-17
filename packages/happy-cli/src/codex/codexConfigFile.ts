import { createHash, randomUUID } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    CODEX_CONFIG_MAX_BYTES,
    CodexConfigSnapshotSchema,
    CodexConfigWriteRequestSchema,
    type CodexConfigSnapshot,
    type CodexConfigWriteRequest,
} from '@slopus/happy-wire';
import { resolveCodexHome } from './codexManagedPolicy';
import { AsyncLock } from '@/utils/lock';

const writeLocks = new Map<string, AsyncLock>();

function writeLock(path: string): AsyncLock {
    let lock = writeLocks.get(path);
    if (!lock) {
        lock = new AsyncLock();
        writeLocks.set(path, lock);
    }
    return lock;
}

function digest(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

async function readContent(path: string): Promise<{ content: string; exists: boolean; modifiedAt: number | null }> {
    try {
        const fileStat = await stat(path);
        if (!fileStat.isFile()) throw new Error('Codex config path is not a regular file');
        if (fileStat.size > CODEX_CONFIG_MAX_BYTES) throw new Error('Codex config exceeds the 64 KiB limit');
        const content = await readFile(path, 'utf8');
        return { content, exists: true, modifiedAt: fileStat.mtimeMs };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { content: '', exists: false, modifiedAt: null };
        }
        throw error;
    }
}

export async function readCodexConfigFile(codexHome = resolveCodexHome()): Promise<CodexConfigSnapshot> {
    const path = join(codexHome, 'config.toml');
    const current = await readContent(path);
    return CodexConfigSnapshotSchema.parse({
        path,
        ...current,
        sha256: digest(current.content),
    });
}

export async function writeCodexConfigFile(
    input: CodexConfigWriteRequest,
    codexHome = resolveCodexHome(),
): Promise<CodexConfigSnapshot> {
    const request = CodexConfigWriteRequestSchema.parse(input);
    const path = join(codexHome, 'config.toml');
    return writeLock(path).inLock(async () => {
        const current = await readCodexConfigFile(codexHome);
        if (current.sha256 !== request.expectedSha256) {
            throw new Error('Codex config changed since it was loaded; reload before saving');
        }

        await mkdir(codexHome, { recursive: true, mode: 0o700 });
        const backupPath = `${path}.happy-backup`;
        const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
        try {
            await writeFile(tempPath, request.content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
            await chmod(tempPath, 0o600);

            const latest = await readCodexConfigFile(codexHome);
            if (latest.sha256 !== request.expectedSha256) {
                throw new Error('Codex config changed since it was loaded; reload before saving');
            }
            if (latest.exists) {
                await copyFile(path, backupPath);
                await chmod(backupPath, 0o600);
            }
            await rename(tempPath, path);
        } catch (error) {
            await rm(tempPath, { force: true }).catch(() => undefined);
            throw error;
        }
        return readCodexConfigFile(codexHome);
    });
}
