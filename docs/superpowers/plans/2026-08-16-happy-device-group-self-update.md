# Happy Device Group Self-Update Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with TDD and verification checkpoints.

**Goal:** Add a verified, restart-safe Happy CLI updater that the App can run on one device or a Codex device group with bounded concurrency and persistent progress.

**Architecture:** Add strict Happy-update request/snapshot schemas to `happy-wire`. The CLI daemon accepts a machine RPC, persists an operation journal, and launches a detached updater that downloads and verifies an exact GitHub CLI tarball, installs it, restarts the daemon, and records the outcome. The App resolves `cli-X.Y.Z` releases, coordinates at most three online devices per group, polls through reconnects, and reports partial results.

**Tech Stack:** TypeScript, Zod, Node 22 filesystem/process APIs, Socket.IO encrypted machine RPC, React Native/Expo App, Vitest, pnpm.

## Global Constraints

- Existing daemons require one manual/SSH bootstrap to a release containing this feature; no arbitrary shell bootstrap is added.
- Only `https://github.com/Gs-ygc/happy` CLI release assets named `happy-X.Y.Z.tgz` are accepted.
- The device request carries exact version, URL, and lowercase SHA-256; devices do not resolve `latest`.
- Only npm installation is supported initially; unsupported installation layouts are reported explicitly.
- No credentials, environment values, command output, or arbitrary package-manager flags cross the RPC boundary.
- Device-group updates run at most three devices concurrently.
- Every production behavior is preceded by a failing test and verified again after implementation.

---

### Task 1: Define Happy Update Wire Contract

**Files:**
- Create: `packages/happy-wire/src/happyUpdate.ts`
- Modify: `packages/happy-wire/src/index.ts`
- Test: `packages/happy-wire/src/happyUpdate.test.ts`

**Interfaces:**
- Produces `HappyUpdateRequestSchema`, `HappyUpdateOperationSnapshotSchema`, `HappyUpdatePhaseSchema`, and inferred types.
- Request fields: `operationId`, `targetVersion`, `assetUrl`, `sha256`.
- Snapshot fields: `operationId`, `targetVersion`, `phase`, `progress`, `updatedAt`, optional `message`, `error`, `installedVersion`.

- [ ] Write tests for valid requests, semantic-version validation, allowlisted HTTPS GitHub asset URLs, lowercase 64-character SHA-256, strict unknown-field rejection, valid phases, and bounded progress.
- [ ] Run `corepack pnpm --filter @slopus/happy-wire exec vitest run src/happyUpdate.test.ts` and verify the new tests fail because the schemas do not exist.
- [ ] Implement the schemas with strict Zod objects and URL/refinement checks.
- [ ] Export the schemas and types from the wire package index.
- [ ] Run the focused wire test and wire typecheck; both must pass.
- [ ] Commit `feat(wire): add Happy self-update operation contract`.

### Task 2: Build Persistent Update Journal and Detached Updater

**Files:**
- Create: `packages/happy-cli/src/daemon/happyUpdateJournal.ts`
- Create: `packages/happy-cli/src/daemon/happyUpdateUpdater.ts`
- Create: `packages/happy-cli/src/daemon/happyUpdateRuntime.test.ts`
- Modify: `packages/happy-cli/src/configuration.ts`

**Interfaces:**
- `HappyUpdateJournal` exposes atomic `read`, `write`, `listRecent`, and `prune` operations under `${configuration.happyHomeDir}/updates`.
- `HappyUpdateUpdater` accepts a validated request plus current install metadata and exposes injectable download, hash, command, clock, and process dependencies for tests.
- Updater phase transitions are journal writes; errors are sanitized and capped.

- [ ] Write tests for atomic snapshot persistence, idempotent operation IDs, seven-day/100-entry pruning, one-device update locking, URL/size/redirect rejection, SHA mismatch, package manifest mismatch, and sanitized errors.
- [ ] Run the focused CLI runtime tests and verify they fail because journal/updater modules are absent.
- [ ] Implement journal writes through temporary files and atomic rename, with a lock file that rejects a second active update.
- [ ] Implement detached updater argument serialization and safe download/hash/manifest validation without executing package-manager commands in tests.
- [ ] Implement npm install command construction using the existing CLI executable prefix, exact tarball path, and no user-controlled flags.
- [ ] Implement recovery metadata capture and recovery command path.
- [ ] Run focused runtime tests and CLI typecheck.
- [ ] Commit `feat(cli): add persistent detached Happy updater`.

### Task 3: Integrate Daemon RPC and Restart-Safe Operations

**Files:**
- Create: `packages/happy-cli/src/daemon/happyUpdateManager.ts`
- Modify: `packages/happy-cli/src/api/apiMachine.ts`
- Modify: `packages/happy-cli/src/daemon/run.ts`
- Modify: `packages/happy-cli/src/daemon/controlClient.ts`
- Test: `packages/happy-cli/src/api/apiMachine.happyUpdate.test.ts`
- Test: `packages/happy-cli/src/daemon/happyUpdateManager.test.ts`

**Interfaces:**
- `HappyUpdateManager.start(request)` returns an existing snapshot for the same request ID and rejects conflicting reuse.
- `HappyUpdateManager.get(operationId)` loads memory first, then the journal, and returns null for unknown IDs.
- Machine RPC methods are `happy-update-start` and `happy-update-status`.

- [ ] Write tests for RPC registration, duplicate starts, conflicting IDs, journal reload after manager construction, unsupported bootstrap classification, and status during daemon restart.
- [ ] Run the focused daemon/API tests and verify they fail before integration.
- [ ] Register strict machine handlers next to existing Codex operation handlers.
- [ ] Load/prune journals during daemon startup and expose recent snapshots through the manager.
- [ ] Start the updater detached, return `queued` immediately, and ensure daemon shutdown is requested only by the updater after it has persisted `stopping-daemon`.
- [ ] Make the new daemon publish the target version only after successful restart; preserve existing session reconnect behavior.
- [ ] Run focused daemon/API tests, CLI typecheck, and existing Codex operation tests.
- [ ] Commit `feat(cli): expose restart-safe Happy update RPC`.

### Task 4: Add App Release Discovery and Single-Device Update Flow

**Files:**
- Create: `packages/happy-app/sources/sync/happyUpdate.ts`
- Create: `packages/happy-app/sources/sync/happyUpdate.test.ts`
- Modify: `packages/happy-app/sources/sync/ops.ts`
- Modify: `packages/happy-app/sources/app/(app)/machine/[id].tsx`

**Interfaces:**
- `resolveLatestHappyCliRelease(fetcher, installedVersion)` returns `{ version, assetUrl, sha256 }` or a typed unavailable result.
- `machineHappyUpdateStart(machineId, request)` and `machineHappyUpdateStatus(machineId, operationId)` wrap the two machine RPCs.
- Single-device UI shows installed version, bootstrap-required/unsupported state, confirmation, progress, retry, and final outcome.

- [ ] Write tests for selecting the highest stable `cli-X.Y.Z` release, ignoring prereleases and unrelated tags/assets, rejecting malformed GitHub metadata, and disabling update when already current or discovery fails.
- [ ] Run the focused App tests and verify they fail before release discovery/coordinator implementation.
- [ ] Implement GitHub release discovery with injectable fetch and exact asset/digest extraction.
- [ ] Add typed machine RPC wrappers and resilient polling that tolerates disconnect during daemon restart.
- [ ] Add the single-device Happy section to the existing machine detail screen without changing Codex update controls.
- [ ] Add concise error states for offline, bootstrap-required, unsupported npm layout, recovered, and failed.
- [ ] Run focused App tests and App typecheck.
- [ ] Commit `feat(app): add single-device Happy CLI update flow`.

### Task 5: Add Device-Group Batch Coordinator and UI

**Files:**
- Create: `packages/happy-app/sources/sync/happyUpdateBatch.ts`
- Create: `packages/happy-app/sources/sync/happyUpdateBatch.test.ts`
- Modify: `packages/happy-app/sources/app/(app)/machine/[id].tsx`

**Interfaces:**
- `runHappyUpdateBatch(targets, requestFactory, options)` returns one result per target and never exceeds `concurrency: 3`.
- Target results are `updated`, `already-current`, `offline`, `bootstrap-required`, `recovered`, or `failed`, each with an optional operation snapshot/error.
- Retrying a batch creates new IDs only for retryable non-success results.

- [ ] Write tests for three-device concurrency, no work on offline/bootstrap targets, partial failure aggregation, reconnect polling, bounded timeout, and retry ID creation.
- [ ] Run focused batch tests and verify they fail because the coordinator is absent.
- [ ] Implement the queue with a worker count of three, per-device polling, and persistent result state independent of modal visibility.
- [ ] Add group-level confirmation and progress UI using existing device-group membership and styling patterns.
- [ ] Add per-row retry and final summary counts; never label partial results as full success.
- [ ] Run focused batch tests and App typecheck.
- [ ] Commit `feat(app): batch update Happy by device group`.

### Task 6: Full Verification, Build, and Release

**Files:**
- Modify: `.planning/2026-08-16-happy-device-group-self-update/task_plan.md`
- Modify: `.planning/2026-08-16-happy-device-group-self-update/findings.md`
- Modify: `.planning/2026-08-16-happy-device-group-self-update/progress.md`

- [ ] Run full wire, CLI, and App test suites plus both typechecks.
- [ ] Run `git diff --check` and inspect the final tracked diff for unrelated changes.
- [ ] Build the CLI, pack it, and perform an isolated manifest/hash/startup smoke test.
- [ ] Build the local Android release with the documented JDK 17/Android SDK/tmux procedure.
- [ ] Export and zip the Web build.
- [ ] Publish a new CLI Release, Android/Web Release assets, and notes including the one-time bootstrap requirement.
- [ ] Verify GitHub Release assets, SHA-256 values, APK versionCode, and daemon update operation tests.
- [ ] Update all planning phases to complete and commit the final release metadata.
