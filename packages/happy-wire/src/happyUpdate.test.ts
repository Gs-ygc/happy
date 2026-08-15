import { describe, expect, it } from 'vitest';
import {
    HappyUpdateOperationSnapshotSchema,
    HappyUpdatePhaseSchema,
    HappyUpdateRequestSchema,
} from './happyUpdate';

const validRequest = {
    operationId: 'update-1',
    targetVersion: '1.2.5',
    assetUrl: 'https://github.com/Gs-ygc/happy/releases/download/cli-1.2.5/happy-1.2.5.tgz',
    sha256: 'a'.repeat(64),
};

const requestForVersion = (targetVersion: string) => ({
    ...validRequest,
    targetVersion,
    assetUrl: `https://github.com/Gs-ygc/happy/releases/download/cli-${targetVersion}/happy-${targetVersion}.tgz`,
});

describe('Happy update wire contract', () => {
    it('accepts an exact verified CLI release request', () => {
        expect(HappyUpdateRequestSchema.parse(validRequest)).toEqual(validRequest);
    });

    it('rejects non-semver targets, non-GitHub assets, and invalid digests', () => {
        expect(() => HappyUpdateRequestSchema.parse({ ...validRequest, targetVersion: 'latest' })).toThrow();
        expect(() => HappyUpdateRequestSchema.parse(requestForVersion('01.2.3'))).toThrow();
        expect(() => HappyUpdateRequestSchema.parse(requestForVersion('1.2.3-..'))).toThrow();
        expect(() => HappyUpdateRequestSchema.parse(requestForVersion('1.2.3-01'))).toThrow();
        expect(() => HappyUpdateRequestSchema.parse({ ...validRequest, assetUrl: 'https://evil.example/happy.tgz' })).toThrow();
        expect(() => HappyUpdateRequestSchema.parse({ ...validRequest, sha256: 'A'.repeat(64) })).toThrow();
        expect(() => HappyUpdateRequestSchema.parse({ ...validRequest, sha256: 'a'.repeat(63) })).toThrow();
    });

    it('rejects extra request fields', () => {
        expect(() => HappyUpdateRequestSchema.parse({ ...validRequest, command: 'npm install' })).toThrow();
    });

    it('rejects operation ids that could escape the update journal directory', () => {
        expect(() => HappyUpdateRequestSchema.parse({ ...validRequest, operationId: '../escape' })).toThrow();
        expect(() => HappyUpdateRequestSchema.parse({ ...validRequest, operationId: 'nested/update' })).toThrow();
        expect(() => HappyUpdateOperationSnapshotSchema.parse({
            operationId: '../escape',
            targetVersion: validRequest.targetVersion,
            phase: 'queued',
            progress: 0,
            updatedAt: 123,
        })).toThrow();
    });

    it('accepts each lifecycle phase and bounds snapshot progress', () => {
        const phases = ['queued', 'downloading', 'verifying', 'installing', 'stopping-daemon', 'starting-daemon', 'completed', 'failed', 'recovered'] as const;
        for (const phase of phases) expect(HappyUpdatePhaseSchema.parse(phase)).toBe(phase);
        expect(HappyUpdateOperationSnapshotSchema.parse({
            operationId: validRequest.operationId,
            targetVersion: validRequest.targetVersion,
            phase: 'verifying',
            progress: 50,
            updatedAt: 123,
        })).toMatchObject({ phase: 'verifying', progress: 50 });
        expect(() => HappyUpdateOperationSnapshotSchema.parse({
            operationId: validRequest.operationId,
            targetVersion: validRequest.targetVersion,
            phase: 'downloading',
            progress: 101,
            updatedAt: 123,
        })).toThrow();
    });
});
