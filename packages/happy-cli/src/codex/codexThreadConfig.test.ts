import { describe, expect, it } from 'vitest';
import { buildCodexThreadConfig } from './codexThreadConfig';

describe('buildCodexThreadConfig', () => {
    it('merges managed base config with runtime MCP servers', () => {
        expect(buildCodexThreadConfig(
            { model_reasoning_effort: 'high', mcp_servers: { managed: { command: 'managed' } } },
            { happy: { command: 'happy' } },
        )).toEqual({
            model_reasoning_effort: 'high',
            mcp_servers: {
                managed: { command: 'managed' },
                happy: { command: 'happy' },
            },
        });
    });
});
