type RestartableCodexSession = {
    startedBy?: string;
    childProcess?: unknown;
    happySessionId?: string;
    happySessionMetadataFromLocalWebhook?: { flavor?: string };
    encryption?: unknown;
};

export function isRestartableCodexSession(session: RestartableCodexSession): boolean {
    return session.startedBy === 'daemon'
        && (Boolean(session.childProcess) || Boolean((session as { tmuxSessionId?: string }).tmuxSessionId))
        && Boolean(session.happySessionId)
        && session.happySessionMetadataFromLocalWebhook?.flavor === 'codex'
        && Boolean(session.encryption);
}
