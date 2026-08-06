# Desktop Task Center Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Task Center available from the permanent tablet and web sidebar.

**Architecture:** Add a small pure helper for the two desktop sidebar panels and unread badge formatting, then render a segmented control in `SidebarView`. The selected panel remains local UI state and swaps `MainView variant="sidebar"` with the existing `TaskCenterView` without changing routes.

**Tech Stack:** React Native, Expo Router, TypeScript, Vitest, react-native-unistyles

## Global Constraints

- Default desktop sidebar panel is `sessions`.
- Reuse the existing Task Center data and UI.
- Preserve phone bottom tabs and the main desktop route.
- Add no server API or dependency.

---

### Task 1: Sidebar Panel Model

**Files:**
- Create: `packages/happy-app/sources/utils/sidebarPanel.ts`
- Test: `packages/happy-app/sources/utils/sidebarPanel.spec.ts`

**Interfaces:**
- Produces: `SidebarPanel = 'tasks' | 'sessions'`
- Produces: `SIDEBAR_PANELS` ordered with Tasks then Sessions
- Produces: `formatSidebarUnreadCount(count: number): string | null`

- [ ] **Step 1: Write the failing test**

```ts
expect(SIDEBAR_PANELS.map((panel) => panel.key)).toEqual(['tasks', 'sessions']);
expect(formatSidebarUnreadCount(0)).toBeNull();
expect(formatSidebarUnreadCount(17)).toBe('17');
expect(formatSidebarUnreadCount(120)).toBe('99+');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter happy-app exec vitest run sources/utils/sidebarPanel.spec.ts`
Expected: FAIL because `sidebarPanel.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create the union, ordered descriptors, and badge formatter with the exact behavior above.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter happy-app exec vitest run sources/utils/sidebarPanel.spec.ts`
Expected: PASS.

### Task 2: Permanent Sidebar Segmented Control

**Files:**
- Modify: `packages/happy-app/sources/components/SidebarView.tsx`

**Interfaces:**
- Consumes: `SidebarPanel`, `SIDEBAR_PANELS`, and `formatSidebarUnreadCount`
- Consumes: `TaskCenterView`, `useAllSessions`, and `useUnreadSessionIds`

- [ ] **Step 1: Add local panel state and shared unread count**

Initialize `activePanel` to `sessions`; derive the count from session IDs that are both loaded and unread.

- [ ] **Step 2: Render the segmented control**

Use two equal-width pressable segments with Ionicons, translated labels, selected state, accessibility role/state, and a compact unread badge on Tasks.

- [ ] **Step 3: Swap only the sidebar body**

Render `<TaskCenterView />` for `tasks`; otherwise render `<MainView variant="sidebar" />`. Keep the new-session button, voice status, and bottom settings row outside the swap.

- [ ] **Step 4: Verify types and focused tests**

Run: `corepack pnpm --filter happy-app exec vitest run sources/utils/sidebarPanel.spec.ts sources/utils/taskCenterData.spec.ts`
Run: `corepack pnpm --filter happy-app typecheck`
Expected: both exit 0.

### Task 3: Cross-Screen Verification And Release

**Files:**
- Modify: app version metadata only if required by the release pipeline

- [ ] **Step 1: Run full app tests**

Run: `corepack pnpm --filter happy-app exec vitest run`
Expected: all tests pass.

- [ ] **Step 2: Export and smoke-test web**

Export the production web app, serve it locally, and inspect phone and desktop viewports. Confirm the desktop sidebar exposes both panels without obscuring the main pane.

- [ ] **Step 3: Build Android locally**

Use the repository `AGENTS.md` tmux Gradle workflow, verify package/version/signature, and name the APK with the new build number.

- [ ] **Step 4: Publish artifacts**

Create the matching GitHub release, upload the APK and exported web archive, and verify release asset URLs and digests.
