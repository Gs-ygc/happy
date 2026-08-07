# macOS Theme System Design

## Context

The Tauri macOS client currently reuses the mobile-oriented light and dark
palettes. Its transparent title bar is functional, but the sidebar and floating
surfaces do not have a distinct macOS material layer. The result is visually
flat and does not give long-running agent work a stable reading hierarchy.

This feature is macOS-only. Android and regular browser Web builds keep their
existing theme behavior and storage format.

## Goals

- Provide a small set of polished macOS presets with adaptive light/dark pairs.
- Let users generate a theme from a base color, accent color, contrast, and
  material strength.
- Allow advanced token-level adjustments after generation.
- Use macOS materials for the title bar, sidebar, and floating surfaces only.
- Keep messages, code, diffs, tool output, and the composer opaque and readable.
- Save themes locally and support versioned JSON import/export.
- Switch themes without restarting the app.

## Non-goals

- No server-side theme sync.
- No Android or ordinary browser Web redesign in this feature.
- No full-window blur, decorative gradient blobs, or translucent code surfaces.
- No automatic modification of user-created themes when a preset changes.

## User Experience

The Appearance settings screen gains a macOS Theme section when running in the
Tauri macOS client. It contains a theme card grid with these initial presets:

- System Glass: follows system appearance and accent color.
- Graphite: restrained neutral surfaces for dense operational work.
- Ink: dark, code-friendly surfaces with a cool accent.
- Paper: light, low-saturation surfaces with high reading contrast.

Selecting a preset applies it immediately. Creating a custom theme starts in
Smart mode with base color, accent color, contrast, and material strength
controls. A live preview shows the title bar, sidebar, popover, chat message,
and diff surfaces. Advanced mode exposes grouped token overrides for surfaces,
text, borders, accents, materials, and status colors.

The local theme library supports rename, duplicate, delete, JSON export, and
JSON import. Imported themes are validated before they can be applied. Invalid
colors, unsupported schema versions, and insufficient text contrast produce an
inline error and leave the active theme unchanged.

## Visual Hierarchy

The Tauri window remains transparent with an overlay title bar and native
macOS title-bar material. The sidebar receives its own CSS material layer with
theme-controlled alpha, blur, and saturation. Popovers and command surfaces
use a stronger material and a subtle border.

The main chat surface is opaque. User and agent messages, tool results, code,
diffs, and the composer use opaque theme surfaces. The active/inactive window
state changes material contrast, while reduced-transparency and high-contrast
system settings fall back to opaque surfaces.

## Theme Model

```ts
type MacThemeDefinition = {
  schemaVersion: 1;
  id: string;
  name: string;
  mode: 'adaptive' | 'light' | 'dark';
  generator: {
    baseColor: string;
    accentColor: string;
    contrast: number;          // 0..1
    materialStrength: number;  // 0..1
  };
  tokenOverrides: Partial<MacThemeTokens>;
};
```

The generator produces complete light and dark tokens from the four Smart mode
inputs. Advanced editing stores only overrides, so changing the generator
inputs keeps untouched tokens coherent. The derived token set includes opaque
content surfaces plus separate title-bar, sidebar, and popover material values.
The generator must enforce readable foreground/background contrast for body
text and controls before a theme can be applied.

The local setting stores the active theme ID and the user theme library. The
library is versioned independently from the normal mobile theme preference.

## Runtime Architecture

The macOS Tauri build registers a static native title-bar effect in
`tauri.conf.json`. The frontend owns the dynamic theme layer through CSS
variables, allowing a theme switch without rebuilding the native window.

The macOS theme provider is enabled only when both Tauri and macOS are detected.
It publishes the resolved token set as CSS variables and a stable root class.
Existing components opt into the material layer with explicit surface classes;
content components continue using opaque theme tokens. The non-Tauri Web build
does not receive these classes or variables.

Import/export uses browser-compatible file download/upload in the Tauri WebView,
so no server endpoint or new native file permission is required.

## Error Handling and Accessibility

- A malformed JSON file is rejected without mutating the theme library.
- Unknown token keys are ignored and reported as import warnings.
- Unsupported schema versions are rejected with an upgrade message.
- Low contrast is blocked for body text, controls, and selected states.
- Reduced transparency and high contrast disable blur and increase surface
  opacity while preserving color roles.
- Deleting the active custom theme falls back to System Glass.

## Testing and Acceptance

- Unit tests cover generator determinism, contrast validation, schema migration,
  import/export round trips, and fallback behavior.
- Component tests cover preset selection, Smart mode, Advanced mode, import
  rejection, and active-theme deletion.
- Desktop WebView screenshots cover System Glass light/dark, Graphite, a custom
  theme, inactive window state, and reduced transparency fallback.
- The Tauri macOS CI build must produce a working DMG for Apple Silicon and
  Intel without affecting Android or normal Web typecheck/tests.

The feature is complete when a user can create, save, export, import, and apply
a custom macOS theme without restarting, while the chat and code surfaces stay
fully readable under every built-in preset.
