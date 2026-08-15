import { z } from 'zod';

const SEMVER_IDENTIFIER = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
const SEMVER = new RegExp(`^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-${SEMVER_IDENTIFIER}(?:\\.${SEMVER_IDENTIFIER})*)?$`);
const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ASSET_HOST = 'github.com';
const REPOSITORY_PATH = '/Gs-ygc/happy/releases/download/';

export const HappyUpdateOperationIdSchema = z.string().trim()
    .regex(OPERATION_ID, 'operationId contains invalid characters');

export function isHappySemver(value: string): boolean {
    return SEMVER.test(value);
}

export function compareHappySemver(left: string, right: string): -1 | 0 | 1 {
    const parse = (value: string) => {
        const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
        if (!match || !isHappySemver(value)) return null;
        return { core: match.slice(1, 4).map(Number), pre: match[4]?.split('.') ?? [] };
    };
    const a = parse(left);
    const b = parse(right);
    if (!a || !b) throw new Error('Cannot compare invalid Happy semantic versions');
    for (let index = 0; index < 3; index++) {
        if (a.core[index] !== b.core[index]) return a.core[index] < b.core[index] ? -1 : 1;
    }
    if (a.pre.length === 0 && b.pre.length === 0) return 0;
    if (a.pre.length === 0) return 1;
    if (b.pre.length === 0) return -1;
    for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index++) {
        if (a.pre[index] === undefined) return -1;
        if (b.pre[index] === undefined) return 1;
        const aNumeric = /^\d+$/.test(a.pre[index]);
        const bNumeric = /^\d+$/.test(b.pre[index]);
        if (aNumeric && bNumeric && a.pre[index] !== b.pre[index]) return Number(a.pre[index]) < Number(b.pre[index]) ? -1 : 1;
        if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
        if (a.pre[index] !== b.pre[index]) return a.pre[index] < b.pre[index] ? -1 : 1;
    }
    return 0;
}

export const HappyUpdateRequestSchema = z.object({
    operationId: HappyUpdateOperationIdSchema,
    targetVersion: z.string().trim().regex(SEMVER, 'targetVersion must be a semantic version'),
    assetUrl: z.string().url().max(2048),
    sha256: z.string().regex(/^[a-f0-9]{64}$/, 'sha256 must be a lowercase SHA-256 digest'),
}).strict().superRefine((request, ctx) => {
    let url: URL;
    try {
        url = new URL(request.assetUrl);
    } catch {
        ctx.addIssue({ code: 'custom', path: ['assetUrl'], message: 'assetUrl must be a valid URL' });
        return;
    }

    const expectedPath = `${REPOSITORY_PATH}cli-${request.targetVersion}/happy-${request.targetVersion}.tgz`;
    if (url.protocol !== 'https:' || url.hostname !== ASSET_HOST || url.port || url.search || url.hash || url.pathname !== expectedPath) {
        ctx.addIssue({ code: 'custom', path: ['assetUrl'], message: 'assetUrl must be the matching Happy GitHub CLI release asset' });
    }
});
export type HappyUpdateRequest = z.infer<typeof HappyUpdateRequestSchema>;

export const HappyUpdatePhaseSchema = z.enum([
    'queued',
    'downloading',
    'verifying',
    'installing',
    'stopping-daemon',
    'starting-daemon',
    'completed',
    'failed',
    'recovered',
]);
export type HappyUpdatePhase = z.infer<typeof HappyUpdatePhaseSchema>;

export const HappyUpdateOperationSnapshotSchema = z.object({
    operationId: HappyUpdateOperationIdSchema,
    targetVersion: z.string().trim().regex(SEMVER),
    phase: HappyUpdatePhaseSchema,
    progress: z.number().int().min(0).max(100),
    updatedAt: z.number().nonnegative(),
    message: z.string().max(500).optional(),
    error: z.string().max(500).optional(),
    installedVersion: z.string().max(64).optional(),
}).strict();
export type HappyUpdateOperationSnapshot = z.infer<typeof HappyUpdateOperationSnapshotSchema>;
