import { compareVersions } from '@/utils/versionUtils';

const GITHUB_RELEASES_API = 'https://api.github.com/repos/Gs-ygc/happy/releases?per_page=100';
const STABLE_SEMVER = /^\d+\.\d+\.\d+$/;
const SHA256_DIGEST = /^sha256:([a-f0-9]{64})$/;

export const MIN_HAPPY_SELF_UPDATE_VERSION = '1.2.5';

export type HappyCliRelease = {
    version: string;
    assetUrl: string;
    sha256: string;
};

type GitHubAsset = {
    name?: unknown;
    browser_download_url?: unknown;
    digest?: unknown;
};

type GitHubRelease = {
    tag_name?: unknown;
    draft?: unknown;
    prerelease?: unknown;
    assets?: unknown;
};

function trustedAssetUrl(value: string, version: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && url.hostname === 'github.com'
            && !url.port
            && !url.search
            && !url.hash
            && url.pathname === `/Gs-ygc/happy/releases/download/cli-${version}/happy-${version}.tgz`;
    } catch {
        return false;
    }
}

export function isHappySelfUpdateSupported(version: string | null | undefined): boolean {
    return typeof version === 'string'
        && STABLE_SEMVER.test(version)
        && compareVersions(version, MIN_HAPPY_SELF_UPDATE_VERSION) >= 0;
}

export function selectLatestHappyCliRelease(payload: unknown, installedVersion: string): HappyCliRelease | null {
    if (!Array.isArray(payload) || !STABLE_SEMVER.test(installedVersion)) return null;
    let selected: HappyCliRelease | null = null;

    for (const candidate of payload as GitHubRelease[]) {
        if (!candidate || typeof candidate !== 'object' || candidate.draft === true || candidate.prerelease === true) continue;
        if (typeof candidate.tag_name !== 'string') continue;
        const match = /^cli-(\d+\.\d+\.\d+)$/.exec(candidate.tag_name);
        if (!match) continue;
        const version = match[1];
        if (compareVersions(version, installedVersion) <= 0) continue;
        const expectedName = `happy-${version}.tgz`;
        const assets = Array.isArray(candidate.assets) ? candidate.assets as GitHubAsset[] : [];
        const asset = assets.find((item) => item?.name === expectedName
            && typeof item.browser_download_url === 'string'
            && trustedAssetUrl(item.browser_download_url, version)
            && typeof item.digest === 'string'
            && SHA256_DIGEST.test(item.digest));
        if (!asset || typeof asset.browser_download_url !== 'string' || typeof asset.digest !== 'string') continue;
        const digest = SHA256_DIGEST.exec(asset.digest)?.[1];
        if (!digest) continue;
        if (!selected || compareVersions(version, selected.version) > 0) {
            selected = { version, assetUrl: asset.browser_download_url, sha256: digest };
        }
    }

    return selected;
}

export async function fetchLatestHappyCliRelease(
    installedVersion: string,
    fetchImpl: typeof fetch = fetch,
): Promise<HappyCliRelease | null> {
    const response = await fetchImpl(GITHUB_RELEASES_API, {
        headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });
    if (!response.ok) throw new Error(`GitHub release request failed: ${response.status}`);
    return selectLatestHappyCliRelease(await response.json(), installedVersion);
}
