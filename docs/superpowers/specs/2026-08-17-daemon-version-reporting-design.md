# Daemon Version Reporting Design

## Problem

An existing machine keeps the encrypted metadata created by its first daemon registration. After the CLI is upgraded, `POST /v1/machines` returns that old metadata, the daemon does not refresh `happyCliVersion`, and the App prefers the stale metadata over runtime state. A running CLI 1.2.5 daemon can therefore be shown as 1.2.0.

## Design

On every daemon startup, merge the daemon-owned machine fields from `initialMachineMetadata` into the current decrypted machine metadata through the existing optimistic-concurrency metadata update API. Preserve App-owned and account-owned fields such as display names, device-group configuration, and Codex policy assignments.

Include `startedWithCliVersion` in the server-synchronized daemon runtime state whenever the machine socket connects. In the App, centralize installed-version selection and prefer the last daemon version that actually ran, falling back to metadata for legacy daemons that did not publish a runtime version. Use the same selector for display, update eligibility, update verification, and device-group progress.

## Failure Handling

Metadata refresh failure must not prevent daemon startup. Log the failure and continue because runtime state still provides the current version. Existing optimistic-concurrency retry behavior resolves simultaneous App metadata edits without replacing unrelated fields.

## Verification

- CLI unit test: stale machine metadata is merged with current daemon-owned fields while preserving policy and display fields.
- App unit test: online runtime version wins over stale metadata; offline and legacy data retain sensible fallbacks.
- CLI and App unit suites and typechecks.
- Install the new CLI on `node029` and `open10`, restart daemons, and verify both local status and App-facing synchronized state.
- Rebuild Web, Server bundle, and Android APK; deploy Web/Server to `shvm`; publish verified GitHub release assets.

## Device Config Editor Follow-up

The device detail screen exposes a config editor whether or not the device belongs to a group. Opening it reads the target daemon's user-level `$CODEX_HOME/config.toml` over the existing encrypted machine RPC and displays the exact current text. Group policy remains a separate, opt-in runtime overlay.

Reads return the file path, content, existence flag, modification time, and SHA-256. Writes accept at most 64 KiB of UTF-8 content, leaving room for worst-case JSON escaping, encryption, and Base64 under the Socket.IO packet ceiling, and require the caller's original SHA-256. The daemon serializes local writes, rechecks the digest immediately before replacement, creates a mode-0600 temporary file, preserves the previous file as a backup, and atomically renames the temporary file into place. Neither contents nor secrets are persisted in Happy account settings or Server storage.
