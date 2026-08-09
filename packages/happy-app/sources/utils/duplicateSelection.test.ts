import { describe, expect, it } from 'vitest';
import { selectUniqueRewindPointByText } from './duplicateSelection';

describe('selectUniqueRewindPointByText', () => {
    const points = [
        { id: 'one', text: 'same prompt', timestamp: 1 },
        { id: 'two', text: 'different prompt', timestamp: 2 },
    ];

    it('selects the only normalized text match', () => {
        expect(selectUniqueRewindPointByText(points, '  same   prompt ')).toEqual(points[0]);
    });

    it('returns null for repeated text instead of guessing', () => {
        expect(selectUniqueRewindPointByText([
            points[0],
            { id: 'three', text: 'same prompt', timestamp: 3 },
        ], 'same prompt')).toBeNull();
    });
});
