import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { isTrustedAndroidApkUpdateUrl } from './githubNativeUpdate';

const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;
const APK_MIME_TYPE = 'application/vnd.android.package-archive';

export async function installAndroidApkUpdate(downloadUrl: string): Promise<void> {
    if (Platform.OS !== 'android') {
        throw new Error('APK installation is only available on Android');
    }
    if (!isTrustedAndroidApkUpdateUrl(downloadUrl)) {
        throw new Error('Untrusted Android update URL');
    }

    const destination = new File(Paths.cache, 'happy-update.apk');
    const downloaded = await File.downloadFileAsync(downloadUrl, destination, { idempotent: true });
    if (!downloaded.exists || downloaded.size <= 0) {
        throw new Error('Downloaded Android update is empty');
    }

    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: downloaded.contentUri,
        type: APK_MIME_TYPE,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
}
