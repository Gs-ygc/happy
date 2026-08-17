export function unwrapRpcResponse<T>(value: unknown): T {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        if (Object.keys(record).length === 1 && typeof record.error === 'string') {
            throw new Error(record.error);
        }
    }
    return value as T;
}
