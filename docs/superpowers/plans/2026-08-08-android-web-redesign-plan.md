# Android/Web Agent Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a shared Agent activity presentation model and platform-specific Android/Web task, session, notification, and Activity surfaces.

**Architecture:** Add a pure projection layer over normalized messages and session state, then consume it from the existing ChatList, TaskCenterView, SidebarView, and replacement Activity view. Keep encrypted storage and provider protocols unchanged; Android and Web differ only in shell/layout behavior.

**Tech Stack:** React Native, React Native Web, Expo Router, Unistyles, Zustand/MMKV, Vitest, Playwright, local Gradle Android build.

## Global Constraints

- No new server protocol or plaintext search endpoint.
- Android and Web only; iOS behavior must remain unchanged.
- Heartbeats never update task recency or running state.
- Goal sessions sort before ordinary running sessions.
- Pending permissions stay visible and actionable.
- Draft text stays in the composer until submit; force submit disables duplicate presses and uses abort-then-send.

---

### Task 1: Agent activity projection

**Files:**
- Create: `packages/happy-app/sources/utils/agentActivity.ts`
- Create: `packages/happy-app/sources/utils/agentActivity.spec.ts`

**Interfaces:**
- `AgentActivityKind`, `AgentActivityStatus`, and `AgentActivity` match the design spec.
- `projectAgentActivities(messages: Message[]): AgentActivity[]` maps user text, assistant text/thinking, tools, edits/diffs, permissions, and mode/completion events without mutating messages.
- `sortTaskActivity(items: TaskItem[]): TaskItem[]` preserves Goal-first and real-activity ordering.

- [ ] Write failing tests for every activity kind, tool timing/summary, permission precedence, edit-to-diff mapping, malformed input fallback, and stable source order.
- [ ] Run the focused test and confirm missing exports fail.
- [ ] Implement the smallest pure projection using existing `toolDisplay` and `toolCommand` helpers.
- [ ] Run focused tests and app typecheck.
- [ ] Commit `feat: add agent activity projection`.

### Task 2: Android task and session surfaces

**Files:**
- Modify: `packages/happy-app/sources/components/MainView.tsx`
- Modify: `packages/happy-app/sources/components/TaskCenterView.tsx`
- Modify: `packages/happy-app/sources/components/TabBar.tsx`
- Modify: `packages/happy-app/sources/components/ChatList.tsx`
- Modify: `packages/happy-app/sources/components/AgentInput.tsx`

**Interfaces:**
- Android authenticated home defaults to Tasks; Sessions and Settings remain one tap away.
- Task Center exposes Running/All segments and uses Goal-first ordering.
- ChatList renders typed activity rows while leaving assistant streaming text continuous.
- Force-submit is visible only for an active turn with a non-empty draft and disables while sending.

- [ ] Add failing tests for initial tab, segment filtering, row ordering, and force-submit state.
- [ ] Implement Android-only shell changes and shared timeline rows.
- [ ] Verify 320px/390px layouts and keyboard behavior.
- [ ] Run focused tests and typecheck.
- [ ] Commit `feat: redesign Android task workflow`.

### Task 3: Web workspace navigation

**Files:**
- Modify: `packages/happy-app/sources/components/SidebarView.tsx`
- Modify: `packages/happy-app/sources/components/SidebarNavigator.tsx`
- Modify: `packages/happy-app/sources/components/HomeHeader.tsx`
- Modify: `packages/happy-app/sources/app/(app)/session/search.tsx`
- Modify: `packages/happy-app/sources/hooks/useBrowserNavigationShortcuts.ts`

**Interfaces:**
- Desktop sidebar Tasks/Sessions state persists locally and defaults to Tasks.
- Search result navigation expands the target display group and scrolls to the exact message.
- `/` focuses search outside text inputs; `Esc` closes the active detail surface.

- [ ] Add failing tests for persisted sidebar state and keyboard guards.
- [ ] Implement Web-only navigation and focus behavior.
- [ ] Verify desktop and narrow browser layouts with Playwright.
- [ ] Run tests/typecheck and commit `feat: improve Web agent workspace`.

### Task 4: Activity replaces Inbox

**Files:**
- Create: `packages/happy-app/sources/components/ActivityView.tsx`
- Create: `packages/happy-app/sources/utils/activityItems.ts`
- Create: `packages/happy-app/sources/utils/activityItems.spec.ts`
- Modify: `packages/happy-app/sources/app/(app)/inbox/index.tsx`
- Modify: `packages/happy-app/sources/components/InboxView.tsx`
- Modify: `packages/happy-app/sources/text/_default.ts`
- Modify: `packages/happy-app/sources/text/translations/*.ts`

**Interfaces:**
- Activity rows derive from unread sessions and local notification metadata, grouped Today/Older.
- Opening a row marks its session read and navigates directly to session/message.
- Friend requests and social feed remain reachable under Settings/Friends.

- [ ] Add failing tests for grouping, direct routes, mark-one, mark-all, and missing target fallback.
- [ ] Implement Activity projection and view.
- [ ] Replace Inbox route content while preserving friend routes.
- [ ] Run tests/typecheck and commit `feat: replace Inbox with Activity`.

### Task 5: Release verification

**Files:**
- Modify documentation only if observed behavior requires clarification.

- [ ] Run full Happy App and changed CLI test suites.
- [ ] Run app typecheck and Web export.
- [ ] Playwright test 1440x900 and 390x844 with screenshots and console checks.
- [ ] Build Android release APK locally in tmux with the repository JDK/SDK instructions.
- [ ] Publish APK and Web archive to a native GitHub Release and verify release assets.

