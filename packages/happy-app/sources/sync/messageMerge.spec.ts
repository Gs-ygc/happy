import { describe, expect, it } from 'vitest';
import { mergeSortedMessages } from './messageMerge';

describe('mergeSortedMessages', () => {
    it('replaces streaming messages without changing the existing order', () => {
        const older = { id: 'older', createdAt: 10, text: 'old' };
        const latest = { id: 'latest', createdAt: 20, text: 'partial' };
        const updated = { ...latest, text: 'complete' };

        const result = mergeSortedMessages([latest, older], { latest, older }, [updated]);
        expect(result.messages.map((message) => message.id)).toEqual(['latest', 'older']);
        expect(result.messages[0]).toBe(updated);
    });

    it('sorts when a genuinely new message is inserted', () => {
        const older = { id: 'older', createdAt: 10 };
        const newest = { id: 'newest', createdAt: 30 };
        const result = mergeSortedMessages([older], { older }, [newest]);
        expect(result.messages.map((message) => message.id)).toEqual(['newest', 'older']);
    });
});
