# Android/Web Agent Workspace Redesign

## Context

Happy now has the basic Task Center, session search, Codex turn interruption, Goal metadata, and notification routing seams. The Android and Web surfaces still expose those capabilities as separate controls and generic message blocks, which makes a long Codex interaction difficult to scan and a large task list difficult to manage.

## Goals

1. Make every meaningful Agent state visually identifiable without hiding streaming output.
2. Keep user input predictable while an Agent turn is active: draft stays in the composer until explicit submit; force submit interrupts and sends immediately.
3. Make 20+ tasks and multiple machines/projects scannable on Android and Web.
4. Make notification taps open the exact session and preserve unread semantics.
5. Replace the primary Inbox surface with an execution-oriented Activity view while leaving friend data reachable from Settings/Friends.

## Non-goals

- No new server message protocol or plaintext search endpoint.
- No redesign of iOS in this phase.
- No change to Codex execution semantics beyond the already committed interrupt/send path.
- No removal of social/friend data; only its primary navigation entry changes.

## Shared Agent Activity Timeline

Introduce a view-only projection from existing normalized messages and session metadata:

```ts
type AgentActivityKind =
  | 'user'
  | 'streaming'
  | 'thinking'
  | 'tool'
  | 'diff'
  | 'goal'
  | 'permission'
  | 'completed'
  | 'error';

type AgentActivity = {
  id: string;
  kind: AgentActivityKind;
  title: string;
  summary: string | null;
  status: 'running' | 'completed' | 'waiting' | 'error';
  timestamp: number;
  expandable: boolean;
  messageIds: string[];
  progress?: { completed: number; total: number; label: string };
};
```

Rules:

- Assistant text is rendered as normal streaming content; thinking is a separate muted row with a distinct icon and a global collapse preference.
- Tool rows show tool name, running/completed/error status, elapsed time, a one-line command or target, and expandable result output. Long output is truncated until expanded.
- File edits and diffs become `diff` rows with file count and a compact additions/deletions summary; opening the row uses the existing diff viewer.
- Goal rows show the current goal title, completed/total steps, and last progress timestamp. A Goal session sorts above ordinary running sessions.
- Permission rows remain actionable and are never collapsed while pending.
- A completed turn is a compact divider/status row, not a repeated full tool transcript.

## Android Shell

- The home route keeps the existing bottom navigation but makes Tasks the first tab and default tab after authentication.
- Task Center uses `运行中` and `全部` segments. Goal sessions appear first in `运行中`; then thinking, permission-required, recently active, and idle-with-unread.
- Machine and project groups are independently foldable. Group headers show active count, unread count, and last real input/output timestamp. Heartbeats alone do not update ordering.
- Session rows expose a compact state icon, model/provider identity, last activity summary, unread marker, and pending draft marker. Tapping opens the session directly.
- Inside a session, the timeline uses typed activity rows. The composer is anchored above the keyboard and displays an unsent draft at the bottom. A force-submit icon is visible only when a draft exists during an active turn and invokes the existing abort-then-send path.

## Web Workspace

- Tablet/desktop keeps a permanent sidebar with a two-state Tasks/Sessions switcher, preserving the current main content area.
- The task segment defaults to Running and exposes All through a compact header control; groups remain foldable and sorted by real activity.
- The session header search button opens the existing local encrypted search route and jumps to the target message, expanding its containing tool/goal group first.
- A notification item navigates directly to `/session/[id]` and passes an optional message target; no Inbox intermediate route is used.
- Web keyboard navigation: `Cmd/Ctrl+K` opens global commands, `/` focuses session search when no text input is active, and `Esc` closes expanded tool/diff detail.

## Activity View Replacing Inbox

- Replace the primary Inbox tab content with Activity items derived from unread session events and local notification records.
- Group items by Today and Older. Each row includes session title, machine/project, event kind, short summary, and relative time.
- Opening an item marks that session read and navigates directly to the target session/message.
- `Mark all read` clears only session unread IDs; friend requests remain available under Friends/Settings.
- Empty state says there are no recent execution updates and links to Tasks, rather than presenting a social onboarding message.

## Data Flow and Error Handling

- The projection consumes `SessionMessages`, `Session.agentState`, Goal status, unread IDs, and notification payloads; it never changes encrypted storage.
- Missing or malformed metadata falls back to a generic `streaming`, `tool`, or `completed` row with the original message available for inspection.
- Navigation targets that no longer exist fall back to the task/session list and retain the notification as read only after the fallback is shown.
- Draft force-submit is idempotent per session: duplicate presses are disabled while abort/send is in flight.

## Accessibility and Responsive Rules

- Every icon-only action has an accessibility label and tooltip on Web.
- Text remains inside its row at 320px Android width; tool output uses horizontal scrolling for code and never expands the row height unexpectedly.
- Web sidebar has a stable width and a visible focus ring; Android touch targets are at least 44dp.
- Reduced motion and reduced transparency settings disable decorative animations and glass effects without removing state distinctions.

## Testing and Acceptance

- Pure projection tests cover every activity kind, status precedence, Goal-first sorting, heartbeat exclusion, and malformed metadata fallback.
- Component tests cover draft persistence, force-submit visibility/disable state, group folding, unread clearing, and direct notification navigation.
- Full Happy App and CLI suites remain green.
- Web Playwright smoke tests cover 1440px desktop and 390px narrow layouts, search deep-linking, Activity empty/populated states, and no console errors.
- Local Android release build opens Task Center, preserves composer draft under the keyboard, and renders tool/diff/Goal rows without overlap.
