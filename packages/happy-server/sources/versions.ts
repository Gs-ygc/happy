export const IOS_UP_TO_DATE = '>=1.4.1';

// Latest known Android build. Multiple APKs share the same versionName
// (e.g. 1.7.1 builds 153 and 154), so the server prefers a numeric
// versionCode comparison over the semver range above whenever the client
// reports its build number.
export const ANDROID_LATEST_VERSION_CODE = 155;
export const ANDROID_LATEST_APK_URL =
    'https://github.com/Gs-ygc/happy/releases/download/native-21-155/happy-v1.7.1-155-update-fix.apk';
