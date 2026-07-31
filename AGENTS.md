# Agent Workflow

## Sync To Main

When the user says `sync to main` or `synt to main`, they mean:

1. Fetch `origin/main`.
2. Rebase the current branch on `origin/main`.
3. Push the current HEAD directly to `main` with a normal push, for example:
   `git push origin HEAD:main`

Do not force push for this workflow.

## User Action Notifications

When progress requires the user to provide additional material, make a decision,
or review work, send a Happy notification before requesting the action in chat:

`happy notify -t "<short task context>" -p "<specific action needed>"`

Keep the title concise and make the message state exactly what the user needs to
provide or review. Do not send notifications for routine progress updates or when
the work can continue without user input.

## Local Android APK Build

When the user asks to build an Android APK locally (not via EAS cloud build):

### Prerequisites

- Android SDK at /nfs/home/leguochun/android-sdk
- JDK 17 at $HOME/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2 (Gradle auto-cached)
- packages/happy-app/android/ must already exist (run npx expo prebuild once if missing)

### Build Steps

1. Kill any leftover Gradle daemons (they may be from a different JDK and block):
   pkill -f GradleDaemon 2>/dev/null
   pkill -f gradlew 2>/dev/null

2. Start the build in tmux (build takes ~3-9 min; tmux keeps it alive if agent disconnects):
   TMUX_TMPDIR=/tmp tmux new-session -d -s build
   TMUX_TMPDIR=/tmp tmux send-keys -t build \
     "cd /nfs/home/leguochun/happy/packages/happy-app/android && \
      ANDROID_HOME=/nfs/home/leguochun/android-sdk \
      JAVA_HOME=$HOME/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2 \
      ./gradlew assembleRelease" Enter

3. Monitor progress (output is in tmux pane, not stdout):
   TMUX_TMPDIR=/tmp tmux capture-pane -t build -p | tail -15
   Wait for "BUILD SUCCESSFUL in Xm Xs".

4. Verify APK:
   ls -lh packages/happy-app/android/app/build/outputs/apk/release/app-release.apk

5. Copy to named location:
   cp packages/happy-app/android/app/build/outputs/apk/release/app-release.apk \
      /nfs/home/leguochun/happy/happy-v<VERSION>-<desc>.apk

### Important Notes

- Do NOT use "expo run:android" — it tries connecting to a device. Use ./gradlew assembleRelease.
- System Java 21 is JRE-only (no javac). Always use JAVA_HOME pointing to Gradle-cached JDK 17.
- No EAS auth needed for local Gradle builds — this bypasses Expo entirely.
- ANDROID_HOME env var overrides local.properties sdk.dir if needed.

---

## Publish APK to GitHub Release

Every user-facing Android APK or Web App update must be published to a GitHub
Release in the same work session. Do not stop after building a local artifact;
upload the APK and the exported Web App archive (when a Web build is requested),
then verify the release assets and download URLs with `gh release view`.

After a successful local build, publish the APK as a GitHub Release.

### Prerequisites

- gh CLI authenticated (gh auth status)
- APK exists locally

### Create Release with APK

  cd /nfs/home/leguochun/happy
  gh release create <tag-name> --repo Gs-ygc/happy \
    happy-v<VERSION>-<desc>.apk \
    --title "<tag-name>" \
    --notes "<release notes>"

  Tag naming: native-<runtime-version> (e.g. native-21-144)

### Upload to Existing Release

  gh release upload <tag-name> --repo Gs-ygc/happy happy-v<VERSION>-<desc>.apk

### Verify

  gh release view <tag-name> --repo Gs-ygc/happy

  Download URL: https://github.com/Gs-ygc/happy/releases/tag/<tag-name>

### Notes

- Releases are immutable once created. To fix assets, delete via GitHub web UI and re-upload.
- APKs are ~120MB; uploads take 30-60 seconds.
