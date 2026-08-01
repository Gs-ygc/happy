import type { SessionListViewItem } from '@/sync/storage';

export function getVisibleSessionListViewData(
    data: SessionListViewItem[],
    hideInactiveSessions: boolean,
    collapsedMachineIds: readonly string[],
): SessionListViewItem[] {
    const result: SessionListViewItem[] = [];
    const collapsedMachines = new Set(collapsedMachineIds);
    let hasInactive = false;

    for (const item of data) {
        if (item.type === 'active-sessions') {
            result.push(item);
        } else if (item.type === 'session' && !item.session.active) {
            hasInactive = true;
        }
    }

    if (hasInactive) {
        result.push({ type: 'archive-toggle', hidden: hideInactiveSessions });
    }

    if (hideInactiveSessions) {
        return result;
    }

    let pendingHeader: Extract<SessionListViewItem, { type: 'header' }> | null = null;
    let pendingProjectGroup: Extract<SessionListViewItem, { type: 'project-group' }> | null = null;

    for (const item of data) {
        if (item.type === 'active-sessions') {
            continue;
        }
        if (item.type === 'header') {
            pendingHeader = item;
            pendingProjectGroup = null;
            continue;
        }
        if (item.type === 'project-group') {
            pendingProjectGroup = item;
            continue;
        }
        if (item.type !== 'session' || item.session.active) {
            continue;
        }
        if (item.session.machineId && collapsedMachines.has(item.session.machineId)) {
            continue;
        }

        if (pendingHeader) {
            result.push(pendingHeader);
            pendingHeader = null;
        }
        if (pendingProjectGroup) {
            result.push(pendingProjectGroup);
            pendingProjectGroup = null;
        }
        result.push(item);
    }

    return result;
}
