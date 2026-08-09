export function buildCodexThreadConfig(
    baseConfig?: Record<string, unknown>,
    mcpServers?: Record<string, unknown>,
): Record<string, unknown> | null {
    const config = { ...(baseConfig ?? {}) };
    if (mcpServers && Object.keys(mcpServers).length > 0) {
        const configuredServers = config.mcp_servers;
        config.mcp_servers = {
            ...(configuredServers && typeof configuredServers === 'object' && !Array.isArray(configuredServers)
                ? configuredServers as Record<string, unknown>
                : {}),
            ...mcpServers,
        };
    }
    return Object.keys(config).length > 0 ? config : null;
}
