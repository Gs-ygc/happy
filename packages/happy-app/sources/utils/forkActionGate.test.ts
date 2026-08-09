import { describe, expect, it } from 'vitest';
import { claimForkAction } from './forkActionGate';

describe('claimForkAction', () => {
    it('only lets the newest fork action navigate', () => {
        const first = claimForkAction();
        const second = claimForkAction();

        expect(first.isCurrent()).toBe(false);
        expect(second.isCurrent()).toBe(true);
    });

    it('invalidates a completed action when it releases its claim', () => {
        const claim = claimForkAction();
        expect(claim.isCurrent()).toBe(true);

        claim.release();

        expect(claim.isCurrent()).toBe(false);
    });
});
