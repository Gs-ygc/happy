import { describe, expect, it } from 'vitest';
import {
    isHappySelfUpdateSupported,
    selectLatestHappyCliRelease,
} from './happyUpdate';

function release(version: string, overrides: Record<string, unknown> = {}) {
    const tag = `cli-${version}`;
    return {
        tag_name: tag,
        draft: false,
        prerelease: false,
        assets: [{
            name: `happy-${version}.tgz`,
            browser_download_url: `https://github.com/Gs-ygc/happy/releases/download/${tag}/happy-${version}.tgz`,
            digest: `sha256:${'a'.repeat(64)}`,
        }],
        ...overrides,
    };
}

describe('Happy CLI release selection', () => {
    it('selects the newest stable release newer than the installed version', () => {
        expect(selectLatestHappyCliRelease([
            release('1.2.5'),
            release('1.3.0'),
            release('1.2.9'),
        ], '1.2.4')).toEqual({
            version: '1.3.0',
            assetUrl: 'https://github.com/Gs-ygc/happy/releases/download/cli-1.3.0/happy-1.3.0.tgz',
            sha256: 'a'.repeat(64),
        });
    });

    it('ignores prereleases, unrelated tags, mismatched assets, and malformed digests', () => {
        expect(selectLatestHappyCliRelease([
            release('1.3.0', { prerelease: true }),
            release('1.2.9', { tag_name: 'native-21-200' }),
            release('1.2.8', { assets: [{ name: 'other.tgz', browser_download_url: 'https://github.com/Gs-ygc/happy/releases/download/cli-1.2.8/other.tgz', digest: `sha256:${'a'.repeat(64)}` }] }),
            release('1.2.7', { assets: [{ name: 'happy-1.2.7.tgz', browser_download_url: 'https://github.com/Gs-ygc/happy/releases/download/cli-1.2.7/happy-1.2.7.tgz', digest: 'sha256:bad' }] }),
        ], '1.2.4')).toBeNull();
    });

    it('does not offer the installed or an older release', () => {
        expect(selectLatestHappyCliRelease([release('1.2.5'), release('1.2.4')], '1.2.5')).toBeNull();
    });

    it('marks pre-bootstrap daemon versions as unsupported', () => {
        expect(isHappySelfUpdateSupported('1.2.4')).toBe(false);
        expect(isHappySelfUpdateSupported('1.2.5')).toBe(true);
        expect(isHappySelfUpdateSupported('2.0.0')).toBe(true);
        expect(isHappySelfUpdateSupported('invalid')).toBe(false);
    });
});
