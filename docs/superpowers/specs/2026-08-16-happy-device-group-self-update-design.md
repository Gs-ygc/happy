# Happy Device Group Self-Update Design

## Goal

Allow a user to update Happy CLI and restart the Happy daemon on one online device or every device in a configured device group, with verified artifacts, persistent progress, bounded concurrency, and clear partial-failure reporting.

## Rollout Boundary

Daemons released before this feature do not expose the update RPC and cannot acquire it remotely. Each existing device therefore requires one manual or SSH bootstrap installation of the first release containing this feature. After that bootstrap, future Happy CLI updates can be managed from the App.

The implementation must not use an Agent prompt or arbitrary shell RPC as a bootstrap mechanism. Those paths depend on model behavior and would create an unacceptable remote-code-execution surface.

## Protocol

Add Happy-specific operation schemas to `@slopus/happy-wire`, separate from Codex operations.

An update request contains:

- a client-generated operation ID used for idempotency;
- the exact semantic target version;
- an HTTPS release asset URL;
- the expected lowercase SHA-256 digest.

An operation snapshot contains the operation ID, target version, phase, progress, timestamps, optional sanitized error, and optional installed version. Phases are `queued`, `downloading`, `verifying`, `installing`, `stopping-daemon`, `starting-daemon`, `completed`, `failed`, and `recovered`.

Machine RPC exposes start and status methods. Repeating a start request with the same operation ID returns the existing snapshot. A different request body using an existing ID is rejected.

## Device Update Runtime

The daemon validates the request, records its initial snapshot in a JSON journal under `~/.happy/updates`, copies a standalone updater entrypoint to an operation-specific temporary directory, and launches it detached from the daemon process.

The updater performs these steps:

1. Download the tarball to an operation-specific temporary file without forwarding authentication headers.
2. Enforce HTTPS and the configured GitHub release host, cap redirects, and reject oversized responses.
3. Compute SHA-256 and compare it to the request before running any package-manager command.
4. Inspect the tarball manifest and require package name `happy` and the exact target version.
5. Record `installing`, then install with the package manager associated with the running Happy executable. The initial implementation supports npm and reports other install layouts as unsupported rather than guessing.
6. Stop the old daemon through its localhost control endpoint and wait for the old PID to exit.
7. Start the newly installed daemon with the existing Happy environment and home directory.
8. Wait for daemon state to report the target version, then record `completed`.

Before installation, the updater records the currently installed Happy package location and version. If installation or validation of the new daemon fails, it attempts to reinstall the prior version, starts the old daemon, and records `recovered`. If recovery also fails, it records `failed` with explicit manual recovery instructions.

Journal writes use write-to-temporary-file plus atomic rename. Snapshots exclude command output, environment variables, tokens, and filesystem paths beyond a sanitized install-kind label.

## Daemon Integration

The new daemon loads recent update journals at startup and serves their status through the same machine RPC. Journals are retained for seven days with a maximum of 100 operations. An update lock under `~/.happy/updates` permits only one Happy update per device at a time.

The daemon publishes its existing `happyCliVersion` metadata after restart. The App considers an update successful only when both the operation reports completion and machine metadata reconnects with the target version.

Existing coding sessions are not killed by the update coordinator. Daemon-owned sessions temporarily lose daemon supervision and reconnect after restart; already-running session processes keep their loaded CLI code until individually restarted.

## App Experience

The device detail screen gains a Happy CLI section showing installed version, update capability, last operation state, and an `Update Happy & Restart` action. Offline devices disable the action.

Each device group gains the same action. After confirmation, the App resolves group membership against known machines and divides targets into online-capable, offline, and bootstrap-required devices. It executes at most three online device operations concurrently and retains a row for every target.

The progress modal shows device name, current phase, percentage, and result. Closing the modal does not cancel updates; reopening the group operation view resumes polling by operation ID. Completion presents counts for updated, already-current, offline, bootstrap-required, recovered, and failed devices. Failed rows expose a concise reason and retry action.

The App must never claim group success when any target is offline, unsupported, recovered, or failed.

## Release Discovery

The App resolves CLI releases from `Gs-ygc/happy` tags named `cli-X.Y.Z`. It selects the highest stable semantic version newer than the installed version and reads the `happy-X.Y.Z.tgz` asset URL and GitHub-provided SHA-256 digest. The confirmation screen displays the selected version.

Release discovery failure leaves update actions disabled with a retryable error. Devices receive an exact version, URL, and digest; they do not independently resolve `latest`.

## Error Handling

- Offline devices are skipped and reported, not treated as RPC failures.
- Devices without the new RPC are classified as bootstrap-required.
- Digest, manifest, host, package-manager, permission, install, restart, and recovery failures have distinct sanitized messages.
- Polling tolerates disconnects during restart and resumes after the machine reconnects.
- Operation polling has a bounded overall timeout while preserving the operation ID for later continuation.
- Group retry creates new operation IDs only for eligible non-successful devices.

## Security

- Only an allowlisted HTTPS GitHub release host is accepted.
- The asset digest and tarball package identity/version are verified before installation.
- RPC input is strict-schema validated and target versions are semantic versions.
- No arbitrary command, package name, registry, environment override, or install flags cross the RPC boundary.
- Errors and journals are redacted and size-limited.
- Only authenticated, encrypted machine RPC can start or query an operation.

## Testing

- Wire schema tests cover valid requests, invalid hosts/digests/versions, operation phases, and strict objects.
- CLI unit tests cover idempotency, persistent journals, atomic writes, locking, download constraints, digest and manifest validation, updater command selection, recovery, and stale journal pruning.
- Daemon RPC tests cover registration, start/status behavior, restart-safe journal lookup, unsupported bootstrap classification, and sanitized failures.
- App tests cover release selection, three-device concurrency, offline/bootstrap classification, reconnect polling, retries, partial summaries, and single-device actions.
- Full CLI and App test suites and typechecks must pass.
- Release verification must include an isolated tarball install smoke test, local Android release build, Web export, GitHub Release asset inspection, and SHA-256 checks.

## Delivery

Publish a new CLI bootstrap release, Android APK, and Web archive in the same work session. Release notes must call out the one-time manual bootstrap requirement for devices running older daemons.
