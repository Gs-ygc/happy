# Global Search Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream fast global search results without a plaintext persistent index and make every result reopen reliably.

**Architecture:** Pure helpers own normalized result creation, loaded-message matching, and bounded concurrency. `Sync.searchGlobalMessages` composes those helpers with encrypted page fetching and exposes partial results to the existing search screen.

**Tech Stack:** TypeScript, React Native/Expo, Zustand storage, Vitest, encrypted Happy v3 message API.

## Global Constraints

- Preserve end-to-end encryption; no server-side or persistent plaintext search index.
- Limit remote scans to four concurrent sessions.
- Preserve cancellation, the 200-result cap, progress reporting, and per-session failure isolation.

---

### Task 1: Repair Search Identity And Add Fast Pure Helpers

**Files:**
- Modify: `packages/happy-app/sources/utils/sessionMessageSearch.ts`
- Test: `packages/happy-app/sources/utils/sessionMessageSearch.spec.ts`

**Interfaces:**
- Produces: `findLoadedSessionMessageSearchResults(messages, query)` and `mapWithConcurrency(items, concurrency, worker, shouldStop?)`.
- Changes: `createSessionMessageSearchResult` returns normalized message ID/time with the API sequence number.

- [x] Add failing tests proving an outer API ID cannot replace a normalized inner envelope ID, loaded matches are deduplicated and exclude thinking, and active workers never exceed the supplied concurrency.
- [x] Run `corepack pnpm --filter happy-app test --run sources/utils/sessionMessageSearch.spec.ts` and confirm the new assertions fail for the missing behavior.
- [x] Implement the smallest pure helpers and normalized identity fix.
- [x] Rerun the focused suite and confirm it passes.

### Task 2: Stream And Bound Global Scanning

**Files:**
- Modify: `packages/happy-app/sources/sync/sync.ts`
- Modify: `packages/happy-app/sources/app/(app)/session/search.tsx`
- Modify: `packages/happy-app/app.config.js`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `searchGlobalMessages(query, { signal, onProgress, onResults })`, where `onResults` receives a deduplicated newest-first snapshot.

- [ ] Wire the loaded-message pass before remote work and publish it through `onResults`.
- [ ] Skip loaded latest pages using `sessionOldestSeq` and `hasMoreOlder`.
- [ ] Run remote session scans with concurrency `4`, page-level result callbacks, aggregate progress, cancellation, and the global result cap.
- [ ] Update the global search screen to render `onResults` snapshots during the active scan.
- [ ] Bump Android `versionCode` to `167` and run focused tests, full App tests, typecheck, Web smoke, local Gradle build, and GitHub Release verification.
