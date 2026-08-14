type AgentPickerSource = {
    key: string;
    label: string;
};

type AgentAvailability = Record<string, unknown>;

type ModePickerSource = {
    key: string;
    name: string;
    description?: string | null;
};

export type NewSessionPickerItem = {
    key: string;
    label: string;
    subtitle?: string;
    dimmed?: boolean;
};

export function getAgentPickerItems(
    agents: AgentPickerSource[],
    availability?: AgentAvailability,
): NewSessionPickerItem[] {
    return agents.map((agent) => {
        const isDetected = availability?.[agent.key];
        return {
            key: agent.key,
            label: agent.label,
            ...(availability && isDetected === false
                ? { subtitle: 'not detected on machine', dimmed: true }
                : {}),
        };
    });
}

export function getModePickerItems(options: ModePickerSource[]): NewSessionPickerItem[] {
    return options.map((option) => ({
        key: option.key,
        label: option.name,
        ...(option.description ? { subtitle: option.description } : {}),
    }));
}
