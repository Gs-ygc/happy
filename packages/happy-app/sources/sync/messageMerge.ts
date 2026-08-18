export function mergeSortedMessages<T extends { id: string; createdAt: number }>(existing: T[], existingMap: Record<string, T>, updates: T[]): { messages: T[]; messagesMap: Record<string, T> } {
    const messagesMap = { ...existingMap };
    let hasNewId = false;
    for (const message of updates) { if (!Object.prototype.hasOwnProperty.call(messagesMap, message.id)) hasNewId = true; messagesMap[message.id] = message; }
    if (!hasNewId) return { messages: existing.map(message => messagesMap[message.id]), messagesMap };
    return { messages: Object.values(messagesMap).sort((a, b) => b.createdAt - a.createdAt), messagesMap };
}
