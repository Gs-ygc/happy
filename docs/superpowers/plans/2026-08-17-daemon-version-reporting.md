# Daemon Version Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure upgraded Happy daemons immediately report and display their actual CLI version on every existing device, then publish and deploy all affected clients.

**Architecture:** The CLI refreshes only daemon-owned machine metadata after loading the existing encrypted record and also publishes its version in runtime daemon state. A pure App selector consistently resolves runtime versus persisted versions for display and update workflows.

**Tech Stack:** TypeScript, Vitest, React Native/Expo, Node.js, Gradle, Bun standalone server, GitHub Releases.

## Global Constraints

- Preserve App-owned machine metadata and Codex policy assignments.
- Metadata synchronization failure must not abort daemon startup.
- Android builds use the local SDK and JDK 17 in tmux.
- Publish the APK and Web archive to a GitHub Release in this work session.

---

### Task 1: CLI Version Refresh

**Files:**
- Modify: `packages/happy-cli/src/daemon/run.ts`
- Test: `packages/happy-cli/src/daemon/machineVersionMetadata.test.ts`

**Interfaces:**
- Produces: `mergeDaemonMachineMetadata(current, detected): MachineMetadata`
- Consumes: `ApiMachine.updateMachineMetadata` and `initialMachineMetadata`

- [ ] Write a failing unit test proving stale version replacement and preservation of display/policy fields.
- [ ] Run the focused test and verify the expected failure.
- [ ] Implement the pure merge helper and call it after machine client initialization without blocking startup on failure.
- [ ] Add `startedWithCliVersion` to synchronized running daemon state.
- [ ] Run the focused test and CLI typecheck.

### Task 2: App Version Resolution

**Files:**
- Create: `packages/happy-app/sources/utils/machineHappyVersion.ts`
- Test: `packages/happy-app/sources/utils/machineHappyVersion.spec.ts`
- Modify: `packages/happy-app/sources/app/(app)/machine/[id].tsx`

**Interfaces:**
- Produces: `resolveMachineHappyVersion(machine): string | null`
- Consumes: machine online state, metadata version, and daemon runtime version.

- [ ] Write failing tests for online, offline, and legacy version precedence.
- [ ] Run focused tests and verify the expected failure.
- [ ] Implement the selector and replace all metadata-first version reads in the machine screen.
- [ ] Run focused tests and App typecheck.

### Task 3: Device-level Codex Config Editor

**Files:**
- Modify: `packages/happy-wire/src/codexManagement.ts`
- Test: `packages/happy-wire/src/codexManagement.test.ts`
- Create: `packages/happy-cli/src/codex/codexConfigFile.ts`
- Test: `packages/happy-cli/src/codex/codexConfigFile.test.ts`
- Modify: `packages/happy-cli/src/api/apiMachine.ts`
- Modify: `packages/happy-app/sources/sync/ops.ts`
- Create: `packages/happy-app/sources/components/CodexConfigEditor.tsx`
- Modify: `packages/happy-app/sources/app/(app)/machine/[id].tsx`

**Interfaces:**
- Produces: `CodexConfigSnapshot`, `CodexConfigWriteRequest`, `codex-config-read`, and `codex-config-write`.
- Consumes: resolved `$CODEX_HOME`, encrypted machine RPC, and Modal component infrastructure.

- [ ] Add failing wire-contract and filesystem tests for current-content reads, conflicts, backups, and atomic writes.
- [ ] Implement bounded snapshot/read/write helpers and daemon RPC registration.
- [ ] Add App RPC wrappers and an always-visible device config editor entry.
- [ ] Verify focused tests and Wire/CLI/App typechecks.

### Task 4: Release And Deployment

**Files:**
- Modify: CLI/App version manifests and generated Android version code as required.
- Create: release APK, Web archive, CLI tarball, and Server x86_64 archive.

- [ ] Run focused and full verification gates.
- [ ] Build and smoke-test CLI package with the new version baked into the bundle.
- [ ] Install CLI on `node029` and `open10`, restart each daemon, and verify synchronized versions.
- [ ] Export Web and build the repeatable Server standalone package.
- [ ] Deploy Server/Web to `shvm` and smoke-test public endpoints.
- [ ] Build the Android release APK locally in tmux and inspect its version code.
- [ ] Commit and push code, create the next immutable GitHub release, upload artifacts, and verify download URLs and checksums.
