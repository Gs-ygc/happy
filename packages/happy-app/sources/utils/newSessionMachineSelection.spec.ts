import { describe, expect, it } from 'vitest';
import { resolveNewSessionMachineId } from './newSessionMachineSelection';

const machine = (id: string, online: boolean) => ({ id, active: online, activeAt: 0, presence: online ? 'online' : 0 }) as any;

describe('resolveNewSessionMachineId', () => {
    it('keeps an existing selection', () => expect(resolveNewSessionMachineId([machine('a', true)], 'a')).toBe('a'));
    it('replaces a missing selection with an online machine', () => expect(resolveNewSessionMachineId([machine('off', false), machine('on', true)], 'gone')).toBe('on'));
    it('falls back to an offline machine only when necessary', () => expect(resolveNewSessionMachineId([machine('off', false)], null)).toBe('off'));
});
