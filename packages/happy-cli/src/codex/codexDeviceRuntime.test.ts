import { describe, expect, it } from 'vitest';
import { detectCodexInstallKind, parseCodexVersion } from './codexDeviceRuntime';

describe('Codex device runtime helpers', () => {
    it('parses the CLI version without exposing command output', () => {
        expect(parseCodexVersion('codex-cli 0.146.0')).toBe('codex-cli 0.146.0');
        expect(parseCodexVersion('unexpected output')).toBeNull();
    });

    it('detects supported package managers from the resolved executable path', () => {
        expect(detectCodexInstallKind('/usr/local/lib/node_modules/@openai/codex/bin/codex.js')).toBe('npm');
        expect(detectCodexInstallKind('/home/user/.local/share/pnpm/global/5/node_modules/@openai/codex/bin/codex.js')).toBe('pnpm');
        expect(detectCodexInstallKind('/opt/homebrew/Caskroom/codex/1.0/bin/codex')).toBe('homebrew');
        expect(detectCodexInstallKind('/tmp/codex')).toBe('unknown');
    });
});
