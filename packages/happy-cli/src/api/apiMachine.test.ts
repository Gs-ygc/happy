import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiMachineClient } from './apiMachine';
import type { Machine } from './types';
import { decodeBase64, decrypt, encodeBase64, encrypt } from './encryption';

const {
    mockIo,
    mockShouldReconnect
} = vi.hoisted(() => ({
    mockIo: vi.fn(),
    mockShouldReconnect: vi.fn(() => true)
}));

vi.mock('socket.io-client', () => ({
    io: mockIo
}));

vi.mock('@/configuration', () => ({
    configuration: {
        serverUrl: 'http://127.0.0.1:3005',
        currentCliVersion: 'test'
    }
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn()
    }
}));

vi.mock('@/modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: vi.fn()
}));

vi.mock('@/api/rpc/RpcHandlerManager', () => ({
    RpcHandlerManager: class {
        onSocketConnect = vi.fn();
        onSocketDisconnect = vi.fn();
        handleRequest = vi.fn(async () => '');
        registerHandler = vi.fn();
        unregisterHandler = vi.fn();
        hasHandler = vi.fn(() => false);
    }
}));

vi.mock('@/utils/detectCLI', () => ({
    detectCLIAvailability: vi.fn(() => ({
        claude: false,
        codex: false,
        gemini: false,
        openclaw: false
    }))
}));

vi.mock('@/resume/localHappyAgentAuth', () => ({
    detectResumeSupport: vi.fn(() => ({
        rpcAvailable: false,
        requiresSameMachine: false,
        requiresHappyAgentAuth: false,
        happyAgentAuthenticated: false
    }))
}));

vi.mock('@/utils/lidState', () => ({
    shouldReconnect: mockShouldReconnect
}));

type SocketHandler = (...args: any[]) => void;
type SocketHandlers = Record<string, SocketHandler[]>;

function makeMachine(): Machine {
    return {
        id: 'test-machine-id',
        metadata: {
            host: 'localhost',
            platform: 'darwin',
            happyCliVersion: 'test',
            homeDir: '/home/user',
            happyHomeDir: '/home/user/.happy',
            happyLibDir: '/home/user/.happy/lib'
        },
        metadataVersion: 0,
        daemonState: null,
        daemonStateVersion: 0,
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy'
    };
}

describe('ApiMachineClient socket reconnection', () => {
    let socketHandlers: SocketHandlers;
    let mockSocket: any;

    const emitSocketEvent = (event: string, ...args: any[]) => {
        const handlers = socketHandlers[event] || [];
        handlers.forEach((handler) => handler(...args));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockShouldReconnect.mockReturnValue(true);
        socketHandlers = {};
        mockSocket = {
            connected: false,
            connect: vi.fn(),
            on: vi.fn((event: string, handler: SocketHandler) => {
                if (!socketHandlers[event]) {
                    socketHandlers[event] = [];
                }
                socketHandlers[event].push(handler);
            }),
            emit: vi.fn(),
            emitWithAck: vi.fn(),
            close: vi.fn(),
            io: {
                on: vi.fn()
            }
        };

        mockIo.mockReturnValue(mockSocket);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('retries after initial socket connection error', async () => {
        vi.useFakeTimers();

        const client = new ApiMachineClient('fake-token', makeMachine());
        client.connect();

        expect(mockIo).toHaveBeenCalledWith('ws://127.0.0.1:3005', expect.objectContaining({
            reconnection: false
        }));
        expect(mockSocket.connect).not.toHaveBeenCalled();

        emitSocketEvent('connect_error', new Error('ECONNREFUSED'));

        await vi.advanceTimersByTimeAsync(1000);
        expect(mockSocket.connect).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(3000);
        expect(mockSocket.connect).toHaveBeenCalledTimes(2);

        client.shutdown();
    });

    it('emits machine-alive immediately when the socket connects', async () => {
        vi.useFakeTimers();
        mockSocket.emitWithAck.mockImplementation(() => new Promise(() => {}));

        const client = new ApiMachineClient('fake-token', makeMachine());
        client.connect();

        expect(mockSocket.emit.mock.calls.filter(([event]: [string]) => event === 'machine-alive')).toHaveLength(0);

        emitSocketEvent('connect');

        let aliveCalls = mockSocket.emit.mock.calls.filter(([event]: [string]) => event === 'machine-alive');
        expect(aliveCalls).toHaveLength(1);
        expect(aliveCalls[0][1]).toEqual(expect.objectContaining({
            machineId: 'test-machine-id',
            time: expect.any(Number)
        }));

        await vi.advanceTimersByTimeAsync(19999);
        aliveCalls = mockSocket.emit.mock.calls.filter(([event]: [string]) => event === 'machine-alive');
        expect(aliveCalls).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(1);
        aliveCalls = mockSocket.emit.mock.calls.filter(([event]: [string]) => event === 'machine-alive');
        expect(aliveCalls).toHaveLength(2);

        client.shutdown();
    });

    it('publishes the running CLI version in daemon state', async () => {
        const machine = makeMachine();
        mockSocket.emitWithAck.mockImplementation(async (event: string, payload: any) => ({
            result: 'success',
            version: 1,
            daemonState: payload.daemonState,
            metadata: payload.metadata,
        }));

        const client = new ApiMachineClient('fake-token', machine);
        client.connect();
        emitSocketEvent('connect');
        await vi.waitFor(() => {
            expect(mockSocket.emitWithAck.mock.calls.some(([event]: [string]) => event === 'machine-update-state')).toBe(true);
        });

        const stateCall = mockSocket.emitWithAck.mock.calls.find(([event]: [string]) => event === 'machine-update-state');
        const state = decrypt(
            machine.encryptionKey,
            machine.encryptionVariant,
            decodeBase64(stateCall[1].daemonState),
        );
        expect(state).toMatchObject({ status: 'running', startedWithCliVersion: 'test' });
        client.shutdown();
    });

    it('refreshes a stale CLI version without replacing other machine metadata', async () => {
        const machine = makeMachine();
        machine.metadata = {
            ...machine.metadata,
            happyCliVersion: '1.2.0',
            codexPolicyAssignment: null,
            displayName: 'Build node',
        } as typeof machine.metadata;
        mockSocket.emitWithAck.mockImplementation(async (event: string, payload: any) => ({
            result: 'success',
            version: 1,
            daemonState: payload.daemonState,
            metadata: payload.metadata,
        }));

        const client = new ApiMachineClient('fake-token', machine, {
            ...machine.metadata,
            host: 'current-host',
            happyCliVersion: 'test',
            homeDir: '/current/home',
            happyHomeDir: '/current/home/.happy',
            happyLibDir: '/current/happy',
        });
        client.connect();
        emitSocketEvent('connect');
        await vi.waitFor(() => {
            expect(mockSocket.emitWithAck.mock.calls.some(([event]: [string]) => event === 'machine-update-metadata')).toBe(true);
        });

        const metadataCall = mockSocket.emitWithAck.mock.calls.find(([event]: [string]) => event === 'machine-update-metadata');
        const metadata = decrypt(
            machine.encryptionKey,
            machine.encryptionVariant,
            decodeBase64(metadataCall[1].metadata),
        ) as Record<string, unknown>;
        expect(metadata).toMatchObject({
            host: 'current-host',
            happyCliVersion: 'test',
            homeDir: '/current/home',
            happyHomeDir: '/current/home/.happy',
            happyLibDir: '/current/happy',
            codexPolicyAssignment: null,
            displayName: 'Build node',
        });
        client.shutdown();
    });

    it('ignores stale machine metadata updates after applying a newer policy', async () => {
        const machine = makeMachine();
        const client = new ApiMachineClient('fake-token', machine);
        const onMetadataUpdate = vi.fn();
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
            onMetadataUpdate,
        });
        client.connect();

        const updatedMetadata = { ...machine.metadata, host: 'updated-host' };
        emitSocketEvent('update', {
            id: 'newer-update',
            seq: 1,
            createdAt: Date.now(),
            body: {
                t: 'update-machine',
                machineId: machine.id,
                metadata: {
                    version: 1,
                    value: encodeBase64(encrypt(machine.encryptionKey, machine.encryptionVariant, updatedMetadata)),
                },
            },
        });
        await Promise.resolve();
        await Promise.resolve();

        emitSocketEvent('update', {
            id: 'stale-update',
            seq: 2,
            createdAt: Date.now(),
            body: {
                t: 'update-machine',
                machineId: machine.id,
                metadata: { version: 0, value: 'not-used-for-stale-update' },
            },
        });

        expect(machine.metadata.host).toBe('updated-host');
        expect(machine.metadataVersion).toBe(1);
        expect(onMetadataUpdate).toHaveBeenCalledTimes(1);
        client.shutdown();
    });
});
