import { z } from 'zod';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ASSET_HOST = 'github.com';
const REPOSITORY_PATH = '/Gs-ygc/happy/releases/download/';

export const HappyUpdateRequestSchema = z.object({
    operationId: z.string().trim().min(1).max(128),
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
    operationId: z.string().trim().min(1).max(128),
    targetVersion: z.string().trim().regex(SEMVER),
    phase: HappyUpdatePhaseSchema,
    progress: z.number().int().min(0).max(100),
    updatedAt: z.number().nonnegative(),
    message: z.string().max(500).optional(),
    error: z.string().max(500).optional(),
    installedVersion: z.string().max(64).optional(),
}).strict();
export type HappyUpdateOperationSnapshot = z.infer<typeof HappyUpdateOperationSnapshotSchema>;
