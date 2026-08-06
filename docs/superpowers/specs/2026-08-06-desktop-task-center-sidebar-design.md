# Desktop Task Center Sidebar Design

## Problem

The Task Center is only reachable through the phone bottom tab bar. Tablet and
web layouts render a permanent sidebar instead, and that sidebar currently
contains only the session list. As a result, the same authenticated account has
no Task Center entry on larger screens.

## Design

- Add a compact `Tasks / Sessions` segmented control below the new-session
  button in the permanent sidebar.
- Default to `Sessions` so existing desktop startup behavior remains unchanged.
- Switching panels replaces only the sidebar body. It must not navigate away
  from the open session or replace the main content pane.
- Reuse `TaskCenterView` without duplicating task filtering, ordering, Goal
  progress, unread clearing, or task actions.
- Show the existing unread-session count on the Tasks segment, capped at `99+`,
  using the same source as the phone Task Center badge.
- Keep the settings row pinned to the bottom in both modes.
- Do not change the phone bottom tab bar, server API, or persisted task data.

## Verification

- Unit-test the shared panel descriptors and unread badge formatting.
- Run the Happy App tests and TypeScript check.
- Export the web app and verify the large-screen sidebar in a browser.
- Build the Android APK locally and publish both requested user-facing artifacts.

