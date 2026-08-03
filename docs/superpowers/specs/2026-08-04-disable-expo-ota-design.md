# Disable Expo OTA for GitHub Android Releases

## Context

Happy Android build 162 embeds the fork's current JavaScript bundle, including
GPT-5.6 and the Codex `max` and `ultra` reasoning levels. The APK also embeds
the upstream Expo project URL and the `production` channel for runtime 21.

On 2026-08-04, that channel served update
`019fc6e8-82a9-7aab-ac3c-f56b0640f34f`, built from upstream commit
`b90d5b2c43358101fba083fcbf1f452236fd50aa`. Its manifest identifies itself as
Happy dev 1.7.0 (`com.slopus.happy.dev`). The upstream implementation at that
commit offers only `low`, `medium`, `high`, and `xhigh` for Codex. Expo Updates
therefore replaces the newer embedded fork bundle with an unrelated upstream
bundle and removes fork-specific behavior after restart.

The `exp.host/--/api/v2/push/getExpoPushToken` endpoint is unrelated. It
registers push tokens. The bundle replacement comes from the `u.expo.dev` EAS
Update endpoint configured in the APK.

## Decision

GitHub-distributed Happy Android builds will not use Expo OTA. They will run the
JavaScript bundle embedded in the installed APK and receive application updates
only through the existing GitHub Release APK updater.

This is preferred over retaining the upstream EAS project because the fork does
not control that project's production channel. A separate EAS project can be
introduced later as a distinct feature with its own credentials and release
process.

## Configuration

- Disable Expo Updates in `app.config.js`.
- Remove the upstream EAS update URL and production request header from the app
  configuration.
- Disable Expo Updates in the checked-in Android manifest, set launch checking
  to `NEVER`, and remove the upstream update URL and channel metadata.
- Keep runtime version `21`; the GitHub native updater uses it to select tags in
  the form `native-21-<versionCode>`.
- Guard the JavaScript update hook with Expo's runtime enabled flag so it does
  not call `checkForUpdateAsync`, fetch an OTA bundle, or emit expected errors
  when OTA is disabled.

The native GitHub update checker remains unchanged. It continues to select the
highest non-draft, non-prerelease `native-21-*` release with a trusted APK asset.

## Release

- Increment Android `versionCode` from 162 to 163 in both Expo and Gradle
  configuration.
- Build a release APK from the checked-in Android project with JDK 17 and the
  configured Android SDK.
- Name the artifact `happy-v1.7.1-163-no-expo-ota.apk`.
- Publish and verify GitHub Release `native-21-163` in `Gs-ygc/happy`.
- Existing clients already running the upstream OTA may have lost the fork's
  GitHub updater. They must install build 163 manually once. Builds at 163 and
  later will then use GitHub APK updates normally.

## Verification

Automated tests and release checks must prove:

1. The update hook skips Expo network calls when Expo Updates is disabled.
2. Expo public config reports OTA disabled and does not expose the upstream
   update URL or production channel.
3. The Android source manifest reports Expo Updates disabled, checks on launch
   `NEVER`, and contains neither `u.expo.dev` nor `expo-channel-name`.
4. Existing GitHub release-selection tests continue to pass.
5. The built APK reports versionCode 163 and has Expo Updates disabled in its
   packaged manifest.
6. The APK's embedded Hermes bundle contains GPT-5.6 model identifiers and the
   Codex `Max` and `Ultra` options.
7. The GitHub Release contains the expected APK with a working download URL.

## Error Handling

Disabling Expo OTA removes the EAS update failure path entirely. GitHub update
lookup behavior is unchanged: GitHub request failures fall back to the Happy
server, and a later app foreground transition retries the check.

## Non-Goals

- Do not create or configure a new EAS project.
- Do not change push-notification registration or Expo push-token behavior.
- Do not change Codex model or effort selection logic in this release; build
  163 restores the already-present fork implementation by preventing it from
  being overwritten.
- Do not publish a Web build or change server deployment as part of this Android
  recovery release.
