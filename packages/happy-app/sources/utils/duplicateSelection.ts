export type RewindPointLike = {
    id: string;
    text: string;
    timestamp: number;
};

function normalize(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
}

export function selectUniqueRewindPointByText<T extends RewindPointLike>(points: T[], text: string): T | null {
    const target = normalize(text);
    const matches = points.filter((point) => normalize(point.text) === target);
    return matches.length === 1 ? matches[0] : null;
}
