import { create } from 'zustand';
import type { SessionMessageSearchResult } from '@/utils/sessionMessageSearch';

export type SessionMessageSearchJump = {
    requestId: number;
    sessionId: string;
    query: string;
    result: SessionMessageSearchResult;
};

type SessionMessageSearchNavStore = {
    jump: SessionMessageSearchJump | null;
    requestJump: (request: Omit<SessionMessageSearchJump, 'requestId'>) => void;
    clearJump: (requestId: number) => void;
};

let nextRequestId = 1;

export const useSessionMessageSearchNav = create<SessionMessageSearchNavStore>((set) => ({
    jump: null,
    requestJump: (request) => set({
        jump: {
            ...request,
            requestId: nextRequestId++,
        },
    }),
    clearJump: (requestId) => set((state) => (
        state.jump?.requestId === requestId ? { jump: null } : state
    )),
}));
