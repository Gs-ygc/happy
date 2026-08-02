import { describe, expect, it } from 'vitest';
import { isTrustedAndroidApkUpdateUrl, selectGitHubNativeUpdate } from './githubNativeUpdate';

const release = (tagName: string, assetName = 'happy.apk', repository = 'Gs-ygc/happy') => ({
    tag_name: tagName,
    html_url: `https://github.com/${repository}/releases/tag/${tagName}`,
    draft: false,
    prerelease: false,
    assets: [{
        name: assetName,
        browser_download_url: `https://github.com/${repository}/releases/download/${tagName}/${assetName}`,
    }],
});

describe('GitHub native update selection', () => {
    it('selects the newest APK for the current runtime', () => {
        const result = selectGitHubNativeUpdate([
            release('native-21-149'),
            release('native-20-999'),
            release('native-21-151'),
            release('native-21-150', 'happy-web.zip'),
        ], '21', 148);

        expect(result).toMatchObject({
            versionCode: 151,
            tagName: 'native-21-151',
        });
    });

    it('does not offer the installed or an older build', () => {
        expect(selectGitHubNativeUpdate([
            release('native-21-148'),
            release('native-21-147'),
        ], '21', 148)).toBeNull();
    });

    it('ignores drafts, prereleases, legacy tag formats, and foreign assets', () => {
        expect(selectGitHubNativeUpdate([
            { ...release('native-21-152'), draft: true },
            { ...release('native-21-151'), prerelease: true },
            release('native-21-production-150'),
            release('native-21-149', 'happy.apk', 'someone-else/happy'),
        ], '21', 148)).toBeNull();
    });
});

describe('trusted Android update URLs', () => {
    it('accepts only HTTPS APK assets from the configured repository', () => {
        expect(isTrustedAndroidApkUpdateUrl(
            'https://github.com/Gs-ygc/happy/releases/download/native-21-149/happy.apk',
        )).toBe(true);
        expect(isTrustedAndroidApkUpdateUrl(
            'https://github.com/other/happy/releases/download/native-21-149/happy.apk',
        )).toBe(false);
        expect(isTrustedAndroidApkUpdateUrl(
            'http://github.com/Gs-ygc/happy/releases/download/native-21-149/happy.apk',
        )).toBe(false);
        expect(isTrustedAndroidApkUpdateUrl(
            'https://github.com/Gs-ygc/happy/releases/download/native-21-149/happy.zip',
        )).toBe(false);
    });
});
