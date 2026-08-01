import * as React from 'react';
import { SessionListViewItem, useLocalSetting, useSessionListViewData, useSetting } from '@/sync/storage';
import { getVisibleSessionListViewData } from '@/utils/sessionListVisibility';

export function useVisibleSessionListViewData(): SessionListViewItem[] | null {
    const data = useSessionListViewData();
    const hideInactiveSessions = useSetting('hideInactiveSessions');
    const collapsedMachineIds = useLocalSetting('collapsedSessionMachineIds');

    return React.useMemo(() => {
        if (!data) {
            return data;
        }
        return getVisibleSessionListViewData(data, hideInactiveSessions, collapsedMachineIds);
    }, [collapsedMachineIds, data, hideInactiveSessions]);
}
