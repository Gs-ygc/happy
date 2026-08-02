import React, { useEffect, useRef } from 'react';
import { useConversation } from '@elevenlabs/react-native';
import { registerVoiceSession } from './RealtimeSession';
import { storage } from '@/sync/storage';
import { realtimeClientTools } from './realtimeClientTools';
import { getElevenLabsCodeFromPreference } from '@/constants/Languages';
import type { VoiceSession, VoiceSessionConfig } from './types';
import { VoiceConnectionWaiter } from './VoiceConnectionWaiter';

// Static reference to the conversation hook instance
let conversationInstance: ReturnType<typeof useConversation> | null = null;

const VOICE_CONNECTION_TIMEOUT_MS = 15_000;
const voiceConnectionWaiter = new VoiceConnectionWaiter();

// VAD state for user speech detection
const VAD_THRESHOLD = 0.5;
const VAD_SILENCE_MS = 300;
let vadSilenceTimer: ReturnType<typeof setTimeout> | null = null;
let agentIsSpeaking = false;

// Global voice session implementation
class RealtimeVoiceSessionImpl implements VoiceSession {
    
    async startSession(config: VoiceSessionConfig): Promise<string | null> {
        if (!conversationInstance) {
            console.warn('Realtime voice session not initialized');
            throw new Error('Realtime voice session not initialized');
        }

        try {
            storage.getState().setRealtimeStatus('connecting');
            
            // Get user's preferred language for voice assistant
            const userLanguagePreference = storage.getState().settings.voiceAssistantLanguage;
            const elevenLabsLanguage = getElevenLabsCodeFromPreference(userLanguagePreference);
            
            if (!config.conversationToken && !config.agentId) {
                throw new Error('No conversationToken or agentId provided');
            }

            const sessionConfig: any = {
                // conversationToken (WebRTC JWT from server) or agentId (bypass mode)
                ...(config.conversationToken
                    ? { conversationToken: config.conversationToken }
                    : { agentId: config.agentId }),
                userId: config.userId,
                dynamicVariables: {
                    sessionId: config.sessionId,
                    initialConversationContext: config.initialContext || ''
                },
                overrides: {
                    agent: {
                        ...(config.systemPrompt ? { prompt: { prompt: config.systemPrompt } } : {}),
                        ...(config.firstMessage ? { firstMessage: config.firstMessage } : {}),
                        language: elevenLabsLanguage
                    }
                },
            };
            
            const connection = voiceConnectionWaiter.wait(
                config.conversationId ?? null,
                VOICE_CONNECTION_TIMEOUT_MS,
                () => {
                    conversationInstance?.endSession();
                },
            );

            try {
                conversationInstance.startSession(sessionConfig);
            } catch (error) {
                voiceConnectionWaiter.reject(error instanceof Error ? error : new Error(String(error)));
            }

            return await connection;
        } catch (error) {
            console.error('Failed to start realtime session:', error);
            storage.getState().setRealtimeStatus('error');
            throw error;
        }
    }

    async endSession(): Promise<void> {
        if (!conversationInstance) {
            storage.getState().setRealtimeStatus('disconnected');
            return;
        }

        try {
            conversationInstance.endSession();
        } catch (error) {
            console.error('Failed to end realtime session:', error);
        } finally {
            storage.getState().setRealtimeStatus('disconnected');
        }
    }

    sendTextMessage(message: string): void {
        if (!conversationInstance) {
            console.warn('Realtime voice session not initialized');
            return;
        }

        try {
            conversationInstance.sendUserMessage(message);
        } catch (error) {
            console.error('Failed to send text message:', error);
        }
    }

    sendContextualUpdate(update: string): void {
        if (!conversationInstance) {
            console.warn('Realtime voice session not initialized');
            return;
        }

        try {
            conversationInstance.sendContextualUpdate(update);
        } catch (error) {
            console.error('Failed to send contextual update:', error);
        }
    }
}

export const RealtimeVoiceSession: React.FC = () => {
    const conversation = useConversation({
        clientTools: realtimeClientTools,
        onConnect: (data) => {
            console.log('Realtime session connected:', data);
            storage.getState().setRealtimeStatus('connected');
            storage.getState().setRealtimeMode('idle');
            voiceConnectionWaiter.resolve(data.conversationId);
        },
        onDisconnect: (details) => {
            console.log('Realtime session disconnected:', details);
            if (voiceConnectionWaiter.isPending) {
                const message = details.reason === 'error'
                    ? details.message
                    : 'Voice session disconnected before it connected';
                voiceConnectionWaiter.reject(new Error(message));
            }
            // Bump generation only when an active session ends — skipping the
            // initial 'disconnected' state avoids remounting on cold launch
            // (which previously caused a phantom keyboard).
            const prev = storage.getState().realtimeStatus;
            storage.getState().setRealtimeStatus('disconnected');
            storage.getState().setRealtimeMode('idle', true);
            storage.getState().clearRealtimeModeDebounce();
            if (prev === 'connected' || prev === 'connecting') {
                storage.getState().incrementVoiceSessionGeneration();
            }
        },
        onMessage: (data) => {
            console.log('Realtime message:', data);
        },
        onError: (message, context) => {
            // Log but don't block app - voice features will be unavailable
            // This prevents initialization errors from showing "Terminals error" on startup
            console.warn('Realtime voice not available:', message, context);
            voiceConnectionWaiter.reject(new Error(message || 'Voice session failed'));
            // Don't set error status during initialization - just set disconnected
            // This allows the app to continue working without voice features.
            // Don't bump generation here — onError can fire on transient/recoverable
            // errors (LiveKit retries internally). onDisconnect is where we know
            // the session is truly dead and a fresh provider is required.
            storage.getState().setRealtimeStatus('disconnected');
            storage.getState().setRealtimeMode('idle', true); // immediate mode change
        },
        onStatusChange: (data) => {
            console.log('Realtime status change:', data);
        },
        onModeChange: (data) => {
            console.log('Realtime mode change:', data);

            const mode = data.mode as string;
            agentIsSpeaking = mode === 'speaking';

            // Use centralized debounce logic from storage
            if (agentIsSpeaking) {
                storage.getState().setRealtimeMode('agent-speaking');
            } else {
                // Agent stopped speaking — defer to VAD for user-speaking, otherwise idle
                storage.getState().setRealtimeMode('idle');
            }
        },
        onVadScore: (data) => {
            const { vadScore } = data;
            if (agentIsSpeaking) return; // Agent speaking takes priority

            if (vadScore > VAD_THRESHOLD) {
                if (vadSilenceTimer) {
                    clearTimeout(vadSilenceTimer);
                    vadSilenceTimer = null;
                }
                storage.getState().setRealtimeMode('user-speaking', true);
            } else {
                if (!vadSilenceTimer) {
                    vadSilenceTimer = setTimeout(() => {
                        vadSilenceTimer = null;
                        if (!agentIsSpeaking) {
                            storage.getState().setRealtimeMode('idle');
                        }
                    }, VAD_SILENCE_MS);
                }
            }
        },
        onDebug: (message) => {
            console.debug('Realtime debug:', message);
        }
    });

    const hasRegistered = useRef(false);

    useEffect(() => {
        // The convenience hook returns a new composite object as status/mode
        // changes. Keep the bridge current without treating those updates as
        // provider teardown.
        conversationInstance = conversation;
    }, [conversation]);

    useEffect(() => {
        // Register the voice session once
        if (!hasRegistered.current) {
            try {
                registerVoiceSession(new RealtimeVoiceSessionImpl());
                hasRegistered.current = true;
            } catch (error) {
                console.error('Failed to register voice session:', error);
            }
        }

        return () => {
            conversationInstance = null;
            voiceConnectionWaiter.reject(new Error('Voice session provider was reset'));
        };
    }, []);

    // This component doesn't render anything visible
    return null;
};
