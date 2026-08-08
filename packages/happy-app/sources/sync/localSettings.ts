import * as z from 'zod';
import { MAC_THEME_PRESETS, createMacTheme, sanitizeMacTheme, type MacThemeDefinition } from '@/theme/macTheme';

//
// Schema
//

export const LocalSettingsSchema = z.object({
    // Developer settings (device-specific)
    debugMode: z.boolean().describe('Enable debug logging'),
    devModeEnabled: z.boolean().describe('Enable developer menu in settings'),
    voiceUpsellOverride: z.enum(['control', 'show-paywall-before-first-voice-chat', 'voice-onboarding-and-upsell']).nullable().describe('Developer-only local override for the voice-upsell PostHog flag'),
    commandPaletteEnabled: z.boolean().describe('Enable CMD+K command palette (web only)'),
    themePreference: z.enum(['light', 'dark', 'adaptive']).describe('Theme preference: light, dark, or adaptive (follows system)'),
    macThemeLibrary: z.array(z.custom<MacThemeDefinition>()).describe('Local macOS theme definitions'),
    macThemeId: z.string().describe('Selected local macOS theme ID'),
    sidebarPanel: z.enum(['tasks', 'sessions']).describe('Selected desktop sidebar panel'),
    markdownCopyV2: z.boolean().describe('Replace native paragraph selection with long-press modal for full markdown copy'),
    consoleLoggingEnabled: z.boolean().describe('Enable console output in production builds'),
    verboseLogging: z.boolean().describe('Log all network requests and responses'),
    zenMode: z.boolean().describe('Hide all sidebars and non-essential UI for focused work'),
    showThinking: z.boolean().describe("Show agent thinking/reasoning in chat"),
    pinnedSessionIds: z.array(z.string()).describe("Session IDs that are pinned to the top of the sessions list"),
    pinnedMachineIds: z.array(z.string()).describe("Machine IDs that are pinned to the top of the machine list"),
    collapsedSessionMachineIds: z.array(z.string()).describe("Machine groups collapsed in the sessions list"),
    collapsedTaskProjectKeys: z.array(z.string()).describe("Task center project groups collapsed by the user"),
    // CLI version acknowledgments - keyed by machineId
    acknowledgedCliVersions: z.record(z.string(), z.string()).describe('Acknowledged CLI versions per machine'),
});

//
// NOTE: Local settings are device-specific and should NOT be synced.
// These are preferences that make sense to be different on each device.
//

const LocalSettingsSchemaPartial = LocalSettingsSchema.passthrough().partial();

export type LocalSettings = z.infer<typeof LocalSettingsSchema>;

//
// Defaults
//

export const localSettingsDefaults: LocalSettings = {
    debugMode: false,
    devModeEnabled: false,
    voiceUpsellOverride: null,
    commandPaletteEnabled: false,
    themePreference: 'adaptive',
    macThemeLibrary: [createMacTheme(MAC_THEME_PRESETS['system-glass'])],
    macThemeId: 'system-glass',
    sidebarPanel: 'tasks',
    markdownCopyV2: false,
    consoleLoggingEnabled: false,
    verboseLogging: false,
    zenMode: false,
    showThinking: true,
    pinnedSessionIds: [],
    pinnedMachineIds: [],
    collapsedSessionMachineIds: [],
    collapsedTaskProjectKeys: [],
    acknowledgedCliVersions: {},
};
Object.freeze(localSettingsDefaults);

//
// Parsing
//

export function localSettingsParse(settings: unknown): LocalSettings {
    const parsed = LocalSettingsSchemaPartial.safeParse(settings);
    if (!parsed.success) {
        return { ...localSettingsDefaults };
    }
    const parsedMacThemes = Array.isArray(parsed.data.macThemeLibrary)
        ? parsed.data.macThemeLibrary
            .map((theme) => sanitizeMacTheme(theme))
            .filter((theme): theme is MacThemeDefinition => theme !== null)
        : [];
    const macThemeLibrary = parsedMacThemes.length > 0 ? parsedMacThemes : localSettingsDefaults.macThemeLibrary;
    return { ...localSettingsDefaults, ...parsed.data, macThemeLibrary };
}

//
// Applying changes
//

export function applyLocalSettings(settings: LocalSettings, delta: Partial<LocalSettings>): LocalSettings {
    return { ...localSettingsDefaults, ...settings, ...delta };
}
