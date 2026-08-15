import { mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    HappyUpdateOperationIdSchema,
    HappyUpdateOperationSnapshotSchema,
    HappyUpdateRequestSchema,
    type HappyUpdateOperationSnapshot,
    type HappyUpdateRequest,
} from '@slopus/happy-wire';

export const HAPPY_UPDATE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RETAINED_OPERATIONS = 100;
const LOCK_STALE_MS = 10 * 60 * 1000;

export type HappyUpdateJournalOptions = {
    rootDir: string;
    now?: () => number;
};

export class HappyUpdateJournal {
    private readonly now: () => number;
    private readonly lockPath: string;

    constructor(private readonly options: HappyUpdateJournalOptions) {
        this.now = options.now ?? Date.now;
        this.lockPath = join(options.rootDir, 'active.lock');
    }

    private async ensureRoot(): Promise<void> {
        await mkdir(this.options.rootDir, { recursive: true });
    }

    private pathFor(operationId: string): string {
        const validated = HappyUpdateOperationIdSchema.parse(operationId);
        return join(this.options.rootDir, `${validated}.json`);
    }

    private requestPathFor(operationId: string): string {
        const validated = HappyUpdateOperationIdSchema.parse(operationId);
        return join(this.options.rootDir, `${validated}.request`);
    }

    async read(operationId: string): Promise<HappyUpdateOperationSnapshot | null> {
        try {
            const raw = await readFile(this.pathFor(operationId), 'utf8');
            return HappyUpdateOperationSnapshotSchema.parse(JSON.parse(raw));
        } catch (error: any) {
            if (error?.code === 'ENOENT') return null;
            throw error;
        }
    }

    async write(snapshot: HappyUpdateOperationSnapshot): Promise<void> {
        const validated = HappyUpdateOperationSnapshotSchema.parse(snapshot);
        await this.ensureRoot();
        const path = this.pathFor(validated.operationId);
        const temporaryPath = `${path}.${process.pid}.${this.now()}.tmp`;
        await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 });
        await rename(temporaryPath, path);
    }

    async readRequest(operationId: string): Promise<HappyUpdateRequest | null> {
        try {
            const raw = await readFile(this.requestPathFor(operationId), 'utf8');
            return HappyUpdateRequestSchema.parse(JSON.parse(raw));
        } catch (error: any) {
            if (error?.code === 'ENOENT') return null;
            throw error;
        }
    }

    async writeRequest(request: HappyUpdateRequest): Promise<void> {
        const validated = HappyUpdateRequestSchema.parse(request);
        await this.ensureRoot();
        const path = this.requestPathFor(validated.operationId);
        const temporaryPath = `${path}.${process.pid}.${this.now()}.tmp`;
        await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 });
        await rename(temporaryPath, path);
    }

    async listRecent(): Promise<HappyUpdateOperationSnapshot[]> {
        await this.ensureRoot();
        const names = await readdir(this.options.rootDir);
        const snapshots: HappyUpdateOperationSnapshot[] = [];
        for (const name of names) {
            if (!name.endsWith('.json')) continue;
            try {
                const snapshot = await this.read(name.slice(0, -5));
                if (snapshot) snapshots.push(snapshot);
            } catch {
                // Ignore a partially written or corrupt historical entry.
            }
        }
        return snapshots.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_RETAINED_OPERATIONS);
    }

    async prune(): Promise<void> {
        await this.ensureRoot();
        const now = this.now();
        const names = await readdir(this.options.rootDir);
        const entries: Array<{ path: string; snapshot: HappyUpdateOperationSnapshot }> = [];
        for (const name of names) {
            if (!name.endsWith('.json')) continue;
            const snapshot = await this.read(name.slice(0, -5));
            if (snapshot) entries.push({ path: join(this.options.rootDir, name), snapshot });
        }
        entries.sort((a, b) => b.snapshot.updatedAt - a.snapshot.updatedAt);
        const expired = entries.slice(MAX_RETAINED_OPERATIONS);
        const aged = entries
            .filter((entry) => now - entry.snapshot.updatedAt > HAPPY_UPDATE_RETENTION_MS)
        const toDelete = new Map([...expired, ...aged].map((entry) => [entry.snapshot.operationId, entry]));
        await Promise.all([...toDelete.values()].flatMap((entry) => [
            unlink(entry.path).catch(() => undefined),
            unlink(this.requestPathFor(entry.snapshot.operationId)).catch(() => undefined),
        ]));
    }

    async acquireLock(): Promise<() => Promise<void>> {
        await this.ensureRoot();
        try {
            const handle = await open(this.lockPath, 'wx', 0o600);
            await handle.writeFile(`${process.pid}\n`);
            await handle.close();
        } catch (error: any) {
            if (error?.code === 'EEXIST') {
                try {
                    const lock = await stat(this.lockPath);
                    if (this.now() - lock.mtimeMs > LOCK_STALE_MS) {
                        await unlink(this.lockPath);
                        return this.acquireLock();
                    }
                } catch { /* race with the lock owner */ }
                throw new Error('A Happy update is already in progress');
            }
            throw error;
        }
        return async () => {
            await unlink(this.lockPath).catch(() => undefined);
        };
    }
}
