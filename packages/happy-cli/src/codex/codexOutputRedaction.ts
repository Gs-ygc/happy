export function redactCodexOutput(value: string): string {
    return value
        .replace(/(token|api[_-]?key|secret|password)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
        .replace(/(authorization\s*:\s*bearer)\s+[^\s,;]+/gi, '$1 [redacted]')
        .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@');
}
