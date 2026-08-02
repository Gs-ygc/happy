const GITHUB_RELEASES_API = 'https://api.github.com/repos/Gs-ygc/happy/releases?per_page=30';
const TRUSTED_APK_PATH_PREFIX = '/Gs-ygc/happy/releases/download/';

export type GitHubNativeUpdate = {
    versionCode: number;
    tagName: string;
    downloadUrl: string;
    releaseUrl: string;
};

type GitHubReleaseAsset = {
    name?: unknown;
    browser_download_url?: unknown;
};

type GitHubRelease = {
    tag_name?: unknown;
    html_url?: unknown;
    draft?: unknown;
    prerelease?: unknown;
    assets?: unknown;
};

export function isTrustedAndroidApkUpdateUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && url.hostname === 'github.com'
            && url.pathname.startsWith(TRUSTED_APK_PATH_PREFIX)
            && url.pathname.toLowerCase().endsWith('.apk');
    } catch {
        return false;
    }
}

export function selectGitHubNativeUpdate(
    payload: unknown,
    runtimeVersion: string,
    currentVersionCode: number,
): GitHubNativeUpdate | null {
    if (!Array.isArray(payload) || !/^\d+$/.test(runtimeVersion)) {
        return null;
    }

    let newest: GitHubNativeUpdate | null = null;

    for (const candidate of payload as GitHubRelease[]) {
        if (!candidate || typeof candidate !== 'object' || candidate.draft === true || candidate.prerelease === true) {
            continue;
        }

        if (typeof candidate.tag_name !== 'string') {
            continue;
        }

        const match = /^native-(\d+)-(\d+)$/.exec(candidate.tag_name);
        if (!match || match[1] !== runtimeVersion) {
            continue;
        }

        const versionCode = Number(match[2]);
        if (!Number.isSafeInteger(versionCode) || versionCode <= currentVersionCode) {
            continue;
        }

        const assets = Array.isArray(candidate.assets) ? candidate.assets as GitHubReleaseAsset[] : [];
        const apkAsset = assets.find((asset) => (
            asset
            && typeof asset === 'object'
            && typeof asset.name === 'string'
            && asset.name.toLowerCase().endsWith('.apk')
            && typeof asset.browser_download_url === 'string'
            && isTrustedAndroidApkUpdateUrl(asset.browser_download_url)
        ));

        if (!apkAsset || typeof apkAsset.browser_download_url !== 'string') {
            continue;
        }

        if (!newest || versionCode > newest.versionCode) {
            newest = {
                versionCode,
                tagName: candidate.tag_name,
                downloadUrl: apkAsset.browser_download_url,
                releaseUrl: typeof candidate.html_url === 'string'
                    ? candidate.html_url
                    : `https://github.com/Gs-ygc/happy/releases/tag/${candidate.tag_name}`,
            };
        }
    }

    return newest;
}

export async function fetchGitHubNativeUpdate(
    runtimeVersion: string,
    currentVersionCode: number,
): Promise<GitHubNativeUpdate | null> {
    const response = await fetch(GITHUB_RELEASES_API, {
        headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });

    if (!response.ok) {
        throw new Error(`GitHub release request failed: ${response.status}`);
    }

    return selectGitHubNativeUpdate(await response.json(), runtimeVersion, currentVersionCode);
}
