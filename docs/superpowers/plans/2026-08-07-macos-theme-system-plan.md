# macOS Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a macOS-only, locally persisted theme library with generated presets, advanced token controls, CSS-variable runtime application, and restrained native/material surfaces for the Tauri desktop app.

**Architecture:** Keep the existing light/dark Unistyles themes as the cross-platform base. Add a pure `MacThemeDefinition` model and generator, persist the selected definition in existing device-local settings, and apply its flattened tokens as CSS custom properties plus a root class only when the app is a Tauri WebView on macOS. The native window remains a normal opaque content surface while Tauri's titlebar material and explicit sidebar/popover classes provide the glass hierarchy.

**Tech Stack:** React Native Web, Expo Router, `react-native-unistyles`, Tauri 2 window configuration, Zod, MMKV, Vitest, TypeScript.

## Global Constraints

- macOS theme controls and runtime effects must be gated by `isTauri()` and a macOS platform check.
- Web, Android, iOS, Catalyst, and non-macOS desktop behavior must retain the existing light/dark/adaptive theme behavior.
- Theme data is local-only, schema-versioned, JSON import/export compatible, and must reject malformed or unsafe values without changing the active theme.
- Glass is limited to titlebar, sidebar, and floating surfaces; chat content, composer, terminal, and diff surfaces remain opaque for readability.
- Every new pure transformation has focused Vitest coverage; verification runs `pnpm --filter happy-app test --run` for touched tests and `pnpm --filter happy-app typecheck`.

---

### Task 1: Define macOS theme model and generator

**Files:**
- Create: `packages/happy-app/sources/theme/macTheme.ts`
- Create: `packages/happy-app/sources/theme/macTheme.test.ts`

**Interfaces:**
- `MacThemeDefinition`, `MacThemeTokens`, `MacThemeGeneratorInput`, and `MAC_THEME_PRESETS` are exported.
- `createMacTheme(input: MacThemeGeneratorInput): MacThemeDefinition` deterministically derives accessible light/dark tokens from base and accent colors.
- `sanitizeMacTheme(value: unknown): MacThemeDefinition | null` validates schema version, IDs, hex colors, bounded numeric controls, and token override values.
- `flattenMacThemeTokens(theme: MacThemeDefinition, dark: boolean): Record<string, string>` returns CSS-variable-ready values with overrides applied.

- [ ] **Step 1: Write failing tests** for preset determinism, clamping/normalization, invalid import rejection, and override precedence.
- [ ] **Step 2: Run `pnpm --filter happy-app vitest run sources/theme/macTheme.test.ts`** and confirm the new exports are missing.
- [ ] **Step 3: Implement the model, HSL/lightness helpers, preset definitions (`system-glass`, `graphite`, `ink`, `paper`), and sanitizer.** Keep all color math pure and avoid platform imports.
- [ ] **Step 4: Run the focused test until all assertions pass.**
- [ ] **Step 5: Commit with `git add packages/happy-app/sources/theme/macTheme.ts packages/happy-app/sources/theme/macTheme.test.ts && git commit -m "feat: add macOS theme model"`.

### Task 2: Persist the local theme library

**Files:**
- Modify: `packages/happy-app/sources/sync/localSettings.ts`
- Modify: `packages/happy-app/sources/sync/persistence.ts`
- Create: `packages/happy-app/sources/theme/macThemeStorage.ts`
- Create: `packages/happy-app/sources/theme/macThemeStorage.test.ts`

**Interfaces:**
- Add `macThemeLibrary: MacThemeDefinition[]` and `macThemeId: string` to `LocalSettings`, with the system-glass default selected.
- `loadMacThemeState(): { library: MacThemeDefinition[]; selectedId: string }` and `saveMacThemeState(...)` use the existing local-settings persistence boundary.
- `exportMacThemes(library: MacThemeDefinition[]): string` emits indented JSON; `importMacThemes(raw: string, existing: MacThemeDefinition[]): { library: MacThemeDefinition[]; selectedId: string }` merges valid themes by ID and preserves the current selection.

- [ ] **Step 1: Add failing tests** for defaults, legacy local-settings parsing, JSON round-trip, duplicate-ID replacement, and malformed import rejection.
- [ ] **Step 2: Run the focused storage tests and observe failures.**
- [ ] **Step 3: Extend the Zod schema/defaults and implement storage/import/export helpers using `loadLocalSettings`, `saveLocalSettings`, and `sanitizeMacTheme`.**
- [ ] **Step 4: Run storage tests and the existing local-settings-related tests.**
- [ ] **Step 5: Commit only the four task files with `git commit -m "feat: persist macOS theme library"`.

### Task 3: Apply macOS tokens at runtime

**Files:**
- Create: `packages/happy-app/sources/theme/macThemeRuntime.ts`
- Create: `packages/happy-app/sources/theme/MacThemeProvider.tsx`
- Create: `packages/happy-app/sources/theme/macThemeRuntime.test.ts`
- Modify: `packages/happy-app/sources/unistyles.ts`
- Modify: `packages/happy-app/sources/theme.css`

**Interfaces:**
- `isMacTauriEnvironment(): boolean` is the single runtime gate.
- `applyMacTheme(theme: MacThemeDefinition, dark: boolean, reducedTransparency?: boolean): void` sets `--happy-mac-*` variables and `happy-mac-theme`/`happy-mac-reduced-transparency` classes on `document.documentElement`.
- `MacThemeProvider` subscribes to local settings, Appearance changes, and `prefers-reduced-transparency`, applies the selected theme, and renders children unchanged on non-macOS platforms.

- [ ] **Step 1: Write failing runtime tests** with a document shim for variable/class updates, macOS gating, and reduced-transparency behavior.
- [ ] **Step 2: Run the focused test and confirm missing runtime exports.**
- [ ] **Step 3: Implement flattening-to-CSS, root class management, and provider lifecycle.** Register `macLight`/`macDark` Unistyles themes whose colors point at the CSS variables, while leaving normal themes untouched.
- [ ] **Step 4: Wrap the authenticated app root with `MacThemeProvider` at the existing root boundary and add CSS fallback rules for reduced transparency, contrast, and scrollbar/accent colors.**
- [ ] **Step 5: Run runtime tests and typecheck the touched modules.**
- [ ] **Step 6: Commit with `git commit -m "feat: apply macOS themes at runtime"`.

### Task 4: Add native titlebar and material surfaces

**Files:**
- Modify: `packages/happy-app/src-tauri/tauri.conf.json`
- Modify: `packages/happy-app/src-tauri/tauri.dev.conf.json`
- Modify: `packages/happy-app/src-tauri/tauri.preview.conf.json`
- Modify: `packages/happy-app/sources/components/SidebarNavigator.tsx`
- Modify: `packages/happy-app/sources/components/SidebarView.tsx`
- Modify: `packages/happy-app/sources/components/FloatingOverlay.tsx`
- Modify: `packages/happy-app/sources/theme.css`

**Interfaces:**
- Tauri window configs enable transparent overlay titlebars and the `titlebar` effect with a 12px native radius; all three variants stay aligned.
- Sidebar and floating overlay components expose stable `happy-mac-sidebar` and `happy-mac-popover` web class/data selectors while retaining existing RN styles elsewhere.

- [ ] **Step 1: Add CSS selector tests or static assertions** covering that only the three intended surface selectors receive blur/material rules.
- [ ] **Step 2: Update Tauri configs with `transparent: true`, `windowEffects.effects: ["titlebar"]`, `state: "followsWindowActiveState"`, and `radius: 12`.**
- [ ] **Step 3: Add macOS-only selectors/data attributes to the persistent header, drawer content, sidebar container, and `FloatingOverlay`.**
- [ ] **Step 4: Add CSS using `backdrop-filter`, `--happy-mac-*` alpha/blur/saturation values, inactive-window fallback, and opaque main content defaults.**
- [ ] **Step 5: Run config JSON parsing, focused tests, and typecheck.**
- [ ] **Step 6: Commit with `git commit -m "feat: add macOS glass surfaces"`.

### Task 5: Build the Appearance theme library/editor UI

**Files:**
- Create: `packages/happy-app/sources/components/mac-theme/MacThemeEditor.tsx`
- Create: `packages/happy-app/sources/components/mac-theme/MacThemePreview.tsx`
- Create: `packages/happy-app/sources/components/mac-theme/macThemeEditorStyles.ts`
- Modify: `packages/happy-app/sources/app/(app)/settings/appearance.tsx`
- Modify: `packages/happy-app/sources/text.ts`

**Interfaces:**
- `MacThemeEditor` accepts `library`, `selectedId`, `onSelect`, `onSave`, `onDelete`, `onDuplicate`, `onImport`, and `onExport` callbacks.
- The UI provides four presets, smart controls for base/accent/contrast/material strength, an advanced token override section, live preview, and local library actions. It is rendered only when `isMacTauriEnvironment()` is true.

- [ ] **Step 1: Add component tests** for selecting a preset, editing a numeric control, saving a generated theme, deleting a non-selected theme, and importing/exporting through callbacks.
- [ ] **Step 2: Run focused component tests and confirm missing component behavior.**
- [ ] **Step 3: Implement the preview/editor with existing `Item`, `ItemGroup`, `Switch`, and Ionicons conventions; use native color inputs on web and text fallback for invalid values.**
- [ ] **Step 4: Wire the screen to `useLocalSettingMutable`, `MacThemeProvider` actions, and browser file/download APIs without changing the existing cross-platform appearance controls.**
- [ ] **Step 5: Run component tests, typecheck, and verify the settings route does not render macOS controls in a normal web environment.**
- [ ] **Step 6: Commit with `git commit -m "feat: add macOS theme editor"`.

### Task 6: Verify visual and regression behavior

**Files:**
- Modify: `docs/superpowers/specs/2026-08-07-macos-theme-system-design.md` only if implementation constraints require clarification.
- Create: `packages/happy-app/sources/theme/macTheme.integration.test.ts` if a cross-module regression is needed.

- [ ] **Step 1: Run `pnpm --filter happy-app test --run` and record any pre-existing failures separately from new failures.**
- [ ] **Step 2: Run `pnpm --filter happy-app typecheck`.**
- [ ] **Step 3: Run the web app with the existing dev command and use the `webapp-testing` Playwright workflow to verify the settings screen, active theme switching, sidebar surface classes, and no console errors at desktop and narrow viewport sizes.**
- [ ] **Step 4: Run `git diff --check` and inspect the final diff for platform gating, accidental Android/iOS changes, and untracked build output.**
- [ ] **Step 5: Commit verification-only fixes with `git commit -m "test: verify macOS theme system"` if needed.**

