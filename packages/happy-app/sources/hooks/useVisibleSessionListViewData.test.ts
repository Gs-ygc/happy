import { describe, expect, it } from 'vitest';
import type { SessionListViewItem } from '@/sync/storage';
import { getVisibleSessionListViewData } from '@/utils/sessionListVisibility';

function session(id: string, machineId: string): SessionListViewItem {
    return {
        type: 'session',
        session: { id, machineId, active: false } as Extract<SessionListViewItem, { type: 'session' }>['session'],
    };
}

describe('getVisibleSessionListViewData', () => {
    it('hides inactive sessions from collapsed machines without leaving empty headers', () => {
        const data: SessionListViewItem[] = [
            { type: 'active-sessions', sessions: [] },
            { type: 'header', title: 'Today' },
            session('hidden', 'machine-a'),
            { type: 'header', title: 'Yesterday' },
            session('visible', 'machine-b'),
        ];

        expect(getVisibleSessionListViewData(data, false, ['machine-a'])).toEqual([
            { type: 'active-sessions', sessions: [] },
            { type: 'archive-toggle', hidden: false },
            { type: 'header', title: 'Yesterday' },
            session('visible', 'machine-b'),
        ]);
    });

    it('keeps the archive toggle when archived sessions are hidden globally', () => {
        const data: SessionListViewItem[] = [session('one', 'machine-a')];

        expect(getVisibleSessionListViewData(data, true, [])).toEqual([
            { type: 'archive-toggle', hidden: true },
        ]);
    });
});
