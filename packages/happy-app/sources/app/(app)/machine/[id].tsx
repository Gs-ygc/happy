import React, { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, Platform, Pressable, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Typography } from '@/constants/Typography';
import { storage, useSessions, useAllMachines, useMachine, useSettings } from '@/sync/storage';
import { Ionicons, Octicons } from '@expo/vector-icons';
import type { Session } from '@/sync/storageTypes';
import { machineStopDaemon, machineUpdateMetadata, machinePatchMetadata, machineDelete, machineCodexOperationStart, machineCodexOperationStatus, machineHappyUpdateStart, machineHappyUpdateStatus } from '@/sync/ops';
import { Modal } from '@/modal';
import { formatPathRelativeToHome, getSessionName, getSessionSubtitle } from '@/utils/sessionUtils';
import { isMachineOnline } from '@/utils/machineUtils';
import { sync } from '@/sync/sync';
import { useUnistyles, StyleSheet } from 'react-native-unistyles';
import { t } from '@/text';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { machineSpawnNewSession } from '@/sync/ops';
import { resolveAbsolutePath } from '@/utils/pathUtils';
import { MultiTextInput, type MultiTextInputHandle } from '@/components/MultiTextInput';
import type { CodexOperationKind, CodexOperationSnapshot, CodexStatus, HappyUpdateOperationSnapshot } from '@slopus/happy-wire';
import type { CodexDeviceGroup } from '@slopus/happy-wire';
import { assignMachineToCodexDeviceGroup, removeCodexDeviceGroup, resolveCodexPolicyAssignment, upsertCodexDeviceGroup } from '@/sync/codexDeviceGroups';
import { CodexPolicyEditor } from '@/components/CodexPolicyEditor';
import { fetchLatestHappyCliRelease, isHappySelfUpdateSupported } from '@/sync/happyUpdate';

const styles = StyleSheet.create((theme) => ({
    pathInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    pathInput: {
        flex: 1,
        borderRadius: 8,
        backgroundColor: theme.colors.input?.background ?? theme.colors.groupped.background,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        minHeight: 44,
        position: 'relative',
        paddingHorizontal: 12,
        paddingVertical: Platform.select({ web: 10, ios: 8, default: 10 }) as any,
    },
    inlineSendButton: {
        position: 'absolute',
        right: 8,
        bottom: 10,
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    inlineSendActive: {
        backgroundColor: theme.colors.button.primary.background,
    },
    inlineSendInactive: {
        // Use a darker neutral in light theme to avoid blending into input
        backgroundColor: Platform.select({
            ios: theme.colors.permissionButton?.inactive?.background ?? theme.colors.surfaceHigh,
            android: theme.colors.permissionButton?.inactive?.background ?? theme.colors.surfaceHigh,
            default: theme.colors.permissionButton?.inactive?.background ?? theme.colors.surfaceHigh,
        }) as any,
    },
}));

export default function MachineDetailScreen() {
    const { theme } = useUnistyles();
    const { id: machineId } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const sessions = useSessions();
    const machine = useMachine(machineId!);
    const allMachines = useAllMachines({ includeOffline: true });
    const settings = useSettings();
    const navigateToSession = useNavigateToSession();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isStoppingDaemon, setIsStoppingDaemon] = useState(false);
    const [isRenamingMachine, setIsRenamingMachine] = useState(false);
    const [isDeletingMachine, setIsDeletingMachine] = useState(false);
    const [customPath, setCustomPath] = useState('');
    const [isSpawning, setIsSpawning] = useState(false);
    const inputRef = useRef<MultiTextInputHandle>(null);
    const [showAllPaths, setShowAllPaths] = useState(false);
    const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
    const [codexOperation, setCodexOperation] = useState<CodexOperationSnapshot | null>(null);
    const [isCodexBusy, setIsCodexBusy] = useState(false);
    const [isApplyingCodexGroup, setIsApplyingCodexGroup] = useState(false);
    const [happyUpdateOperation, setHappyUpdateOperation] = useState<HappyUpdateOperationSnapshot | null>(null);
    const [isHappyUpdateBusy, setIsHappyUpdateBusy] = useState(false);
    // Variant D only

    const machineSessions = useMemo(() => {
        if (!sessions || !machineId) return [];

        return sessions.filter(item => {
            if (typeof item === 'string') return false;
            const session = item as Session;
            return session.metadata?.machineId === machineId;
        }) as Session[];
    }, [sessions, machineId]);

    const previousSessions = useMemo(() => {
        return [...machineSessions]
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            .slice(0, 5);
    }, [machineSessions]);

    const assignedCodexGroup = useMemo(() => (
        settings.codexDeviceGroups.find((group) => group.machineIds.includes(machineId!)) ?? null
    ), [machineId, settings.codexDeviceGroups]);
    const hasPendingCodexOperation = codexOperation?.state === 'queued' || codexOperation?.state === 'running';
    const hasPendingHappyUpdate = happyUpdateOperation !== null
        && !['completed', 'failed', 'recovered'].includes(happyUpdateOperation.phase);

    const recentPaths = useMemo(() => {
        const paths = new Set<string>();
        machineSessions.forEach(session => {
            if (session.metadata?.path) {
                paths.add(session.metadata.path);
            }
        });
        return Array.from(paths).sort();
    }, [machineSessions]);

    const pathsToShow = useMemo(() => {
        if (showAllPaths) return recentPaths;
        return recentPaths.slice(0, 5);
    }, [recentPaths, showAllPaths]);

    // Determine daemon status from metadata
    const daemonStatus = useMemo(() => {
        if (!machine) return 'unknown';

        // Check metadata for daemon status
        const metadata = machine.metadata as any;
        if (metadata?.daemonLastKnownStatus === 'shutting-down') {
            return 'stopped';
        }

        // Use machine online status as proxy for daemon status
        return isMachineOnline(machine) ? 'likely alive' : 'stopped';
    }, [machine]);

    const handleStopDaemon = async () => {
        // Show confirmation modal using alert with buttons
        Modal.alert(
            'Stop Daemon?',
            'You will not be able to spawn new sessions on this machine until you restart the daemon on your computer again. Your current sessions will stay alive.',
            [
                {
                    text: 'Cancel',
                    style: 'cancel'
                },
                {
                    text: 'Stop Daemon',
                    style: 'destructive',
                    onPress: async () => {
                        setIsStoppingDaemon(true);
                        try {
                            const result = await machineStopDaemon(machineId!);
                            Modal.alert('Daemon Stopped', result.message);
                            // Refresh to get updated metadata
                            await sync.refreshMachines();
                        } catch (error) {
                            Modal.alert(t('common.error'), 'Failed to stop daemon. It may not be running.');
                        } finally {
                            setIsStoppingDaemon(false);
                        }
                    }
                }
            ]
        );
    };

    // inline control below

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await sync.refreshMachines();
        setIsRefreshing(false);
    };

    const pollCodexOperation = async (initial: CodexOperationSnapshot) => {
        if (!machineId) return initial;
        let snapshot = initial;
        for (let attempt = 0; attempt < 400 && (snapshot.state === 'queued' || snapshot.state === 'running'); attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const next = await machineCodexOperationStatus(machineId, snapshot.operationId);
            snapshot = next ?? {
                ...snapshot,
                state: 'failed',
                error: 'The device no longer has this operation. It may have restarted before completing it.',
                updatedAt: Date.now(),
            };
            setCodexOperation(snapshot);
        }
        if (snapshot.result) setCodexStatus(snapshot.result);
        if (snapshot.state === 'failed') {
            Modal.alert('Codex operation failed', snapshot.error || 'The device could not complete the operation.');
        } else if (snapshot.state === 'queued' || snapshot.state === 'running') {
            Modal.alert('Codex operation still running', 'You can continue monitoring this operation from the device page.');
        }
        return snapshot;
    };

    const runCodexOperation = async (kind: CodexOperationKind) => {
        if (!machine || !machineId || isCodexBusy || hasPendingCodexOperation || !isMachineOnline(machine)) return;
        if (kind !== 'status') {
            const confirmed = await Modal.confirm(
                kind === 'restart' ? 'Restart Codex sessions?' : 'Update Codex CLI?',
                kind === 'restart'
                    ? 'Active daemon-owned Codex sessions on this device will reconnect.'
                    : 'The detected package manager will update Codex on this device.',
                { confirmText: kind === 'restart' ? 'Restart' : 'Update' },
            );
            if (!confirmed) return;
        }
        setIsCodexBusy(true);
        const operationId = sync.encryption.generateId();
        try {
            const snapshot = await machineCodexOperationStart(machineId, { operationId, kind });
            setCodexOperation(snapshot);
            await pollCodexOperation(snapshot);
        } catch (error) {
            Modal.alert(t('common.error'), error instanceof Error ? error.message : 'The device is unavailable.');
        } finally {
            setIsCodexBusy(false);
        }
    };

    const continueCodexOperation = async () => {
        if (!codexOperation || !hasPendingCodexOperation || isCodexBusy) return;
        setIsCodexBusy(true);
        try {
            await pollCodexOperation(codexOperation);
        } catch (error) {
            Modal.alert(t('common.error'), error instanceof Error ? error.message : 'The device is unavailable.');
        } finally {
            setIsCodexBusy(false);
        }
    };

    const pollHappyUpdate = async (targetMachineId: string, initial: HappyUpdateOperationSnapshot) => {
        let snapshot = initial;
        for (let attempt = 0; attempt < 400 && !['completed', 'failed', 'recovered'].includes(snapshot.phase); attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            try {
                const next = await machineHappyUpdateStatus(targetMachineId, snapshot.operationId);
                if (next) {
                    snapshot = next;
                    setHappyUpdateOperation(next);
                }
            } catch {
                // A disconnect is expected while the updater replaces the daemon.
                if (attempt % 4 === 0) await sync.refreshMachines().catch(() => undefined);
            }
        }
        await sync.refreshMachines().catch(() => undefined);
        return snapshot;
    };

    const runHappyUpdate = async () => {
        if (!machine || !machineId || isHappyUpdateBusy || hasPendingHappyUpdate || !isMachineOnline(machine)) return;
        const installedVersion = machine.metadata?.happyCliVersion || machine.daemonState?.startedWithCliVersion;
        if (!isHappySelfUpdateSupported(installedVersion)) {
            Modal.alert(
                'One-time bootstrap required',
                'This device daemon is too old for remote updates. Install Happy CLI 1.2.5 or newer once through SSH, then future updates can run here.',
            );
            return;
        }
        setIsHappyUpdateBusy(true);
        try {
            const release = await fetchLatestHappyCliRelease(installedVersion!);
            if (!release) {
                Modal.alert('Happy CLI is current', `Version ${installedVersion} is already the newest published CLI.`);
                return;
            }
            const confirmed = await Modal.confirm(
                'Update Happy and restart daemon?',
                `Update ${installedVersion} to ${release.version}. Existing session processes stay alive while the daemon reconnects.`,
                { confirmText: 'Update' },
            );
            if (!confirmed) return;
            const operationId = sync.encryption.generateId();
            const started = await machineHappyUpdateStart(machineId, {
                operationId,
                targetVersion: release.version,
                assetUrl: release.assetUrl,
                sha256: release.sha256,
            });
            setHappyUpdateOperation(started);
            const result = await pollHappyUpdate(machineId, started);
            if (result.phase === 'completed') {
                Modal.alert('Happy CLI updated', `Device restarted with Happy CLI ${result.installedVersion || release.version}.`);
            } else if (result.phase === 'recovered') {
                Modal.alert('Update rolled back', result.error || 'The previous Happy CLI version was restored.');
            } else if (result.phase === 'failed') {
                Modal.alert('Happy update failed', result.error || 'Manual repair may be required on this device.');
            } else {
                Modal.alert('Update still running', 'You can continue monitoring this operation from the device page.');
            }
        } catch (error) {
            Modal.alert(t('common.error'), error instanceof Error ? error.message : 'Happy update could not be started.');
        } finally {
            setIsHappyUpdateBusy(false);
        }
    };

    const continueHappyUpdate = async () => {
        if (!machineId || !happyUpdateOperation || !hasPendingHappyUpdate || isHappyUpdateBusy) return;
        setIsHappyUpdateBusy(true);
        try {
            await pollHappyUpdate(machineId, happyUpdateOperation);
        } finally {
            setIsHappyUpdateBusy(false);
        }
    };

    const persistCodexGroups = async (groups: CodexDeviceGroup[], affectedMachineIds: string[]) => {
        const previousGroups = storage.getState().settings.codexDeviceGroups;
        const applyAssignments = (targetGroups: CodexDeviceGroup[], machineIds: string[]) => Promise.allSettled(machineIds.map(async (affectedMachineId) => {
            const target = allMachines.find((candidate) => candidate.id === affectedMachineId);
            if (!target?.metadata) throw new Error(`Machine metadata unavailable: ${affectedMachineId}`);
            await machinePatchMetadata(
                affectedMachineId,
                target.metadata,
                { codexPolicyAssignment: resolveCodexPolicyAssignment(groups, affectedMachineId) },
                target.metadataVersion,
            );
        }));
        const results = await applyAssignments(groups, affectedMachineIds);
        const failed = results.filter((result) => result.status === 'rejected');
        if (failed.length > 0) {
            const successfulMachineIds = affectedMachineIds.filter((_, index) => results[index]?.status === 'fulfilled');
            const rollback = await applyAssignments(previousGroups, successfulMachineIds);
            const rollbackFailed = rollback.filter((result) => result.status === 'rejected').length;
            const suffix = rollbackFailed > 0 ? `; rollback also failed on ${rollbackFailed} device(s), so retry the update` : '';
            throw new Error(`Policy was not saved because ${failed.length} device update(s) failed${suffix}`);
        }
        sync.applySettings({ codexDeviceGroups: groups });
    };

    const assignCodexGroup = async (groupId: string | null) => {
        if (!machineId || isApplyingCodexGroup) return;
        setIsApplyingCodexGroup(true);
        try {
            const next = assignMachineToCodexDeviceGroup(settings.codexDeviceGroups, machineId, groupId);
            await persistCodexGroups(next, [machineId]);
        } catch (error) {
            Modal.alert(t('common.error'), error instanceof Error ? error.message : 'Failed to assign Codex group');
        } finally {
            setIsApplyingCodexGroup(false);
        }
    };

    const createCodexGroup = async () => {
        if (!machineId || isApplyingCodexGroup) return;
        const name = await Modal.prompt('New Codex device group', undefined, { placeholder: 'Group name', confirmText: 'Create' });
        if (!name?.trim()) return;
        const group: CodexDeviceGroup = {
            id: `group-${sync.encryption.generateId()}`,
            name: name.trim(),
            machineIds: [],
            membershipRevision: 0,
            policy: {
                revision: 1,
                enabled: false,
                syncBaseConfig: false,
                syncMcpServers: false,
                syncSkills: false,
                baseConfig: {},
                mcpServers: [],
                skills: [],
            },
        };
        const withGroup = upsertCodexDeviceGroup(settings.codexDeviceGroups, group);
        setIsApplyingCodexGroup(true);
        try {
            const next = assignMachineToCodexDeviceGroup(withGroup, machineId, group.id);
            await persistCodexGroups(next, [machineId]);
        } catch (error) {
            Modal.alert(t('common.error'), error instanceof Error ? error.message : 'Failed to create Codex group');
        } finally {
            setIsApplyingCodexGroup(false);
        }
    };

    const editCodexGroup = (group: CodexDeviceGroup) => {
        Modal.show({
            component: CodexPolicyEditor,
            props: {
                group,
                onSave: async (updated: CodexDeviceGroup) => {
                    const latestGroups = storage.getState().settings.codexDeviceGroups;
                    const latest = latestGroups.find((candidate) => candidate.id === group.id);
                    if (!latest
                        || latest.policy.revision !== group.policy.revision
                        || latest.membershipRevision !== group.membershipRevision) {
                        throw new Error('This group changed on another client. Close and reopen the editor.');
                    }
                    const next = upsertCodexDeviceGroup(latestGroups, updated);
                    await persistCodexGroups(next, updated.machineIds);
                },
            },
        });
    };

    const deleteCodexGroup = async (group: CodexDeviceGroup) => {
        const confirmed = await Modal.confirm(
            'Delete Codex device group?',
            `${group.name} will be removed from ${group.machineIds.length} device(s).`,
            { confirmText: 'Delete', destructive: true },
        );
        if (!confirmed) return;
        setIsApplyingCodexGroup(true);
        try {
            const next = removeCodexDeviceGroup(storage.getState().settings.codexDeviceGroups, group.id);
            await persistCodexGroups(next, group.machineIds);
        } catch (error) {
            Modal.alert(t('common.error'), error instanceof Error ? error.message : 'Failed to delete Codex group');
        } finally {
            setIsApplyingCodexGroup(false);
        }
    };

    const handleDeleteMachine = async () => {
        if (!machineId) return;
        const confirmed = await Modal.confirm(
            t('machine.deleteConfirmTitle'),
            t('machine.deleteConfirmMessage'),
            { cancelText: t('common.cancel'), confirmText: t('common.delete'), destructive: true }
        );
        if (!confirmed) return;

        setIsDeletingMachine(true);
        try {
            const result = await machineDelete(machineId);
            if (result.success) {
                router.back();
            } else {
                Modal.alert(t('common.error'), result.message || t('machine.deleteFailed'));
            }
        } catch (error) {
            Modal.alert(
                t('common.error'),
                error instanceof Error ? error.message : t('machine.deleteFailed')
            );
        } finally {
            setIsDeletingMachine(false);
        }
    };

    const handleRenameMachine = async () => {
        if (!machine || !machineId) return;

        const newDisplayName = await Modal.prompt(
            'Rename Machine',
            'Give this machine a custom name. Leave empty to use the default hostname.',
            {
                defaultValue: machine.metadata?.displayName || '',
                placeholder: machine.metadata?.host || 'Enter machine name',
                cancelText: t('common.cancel'),
                confirmText: t('common.rename')
            }
        );

        if (newDisplayName !== null) {
            setIsRenamingMachine(true);
            try {
                const updatedMetadata = {
                    ...machine.metadata!,
                    displayName: newDisplayName.trim() || undefined
                };
                
                await machineUpdateMetadata(
                    machineId,
                    updatedMetadata,
                    machine.metadataVersion
                );
                
                Modal.alert(t('common.success'), 'Machine renamed successfully');
            } catch (error) {
                Modal.alert(
                    'Error',
                    error instanceof Error ? error.message : 'Failed to rename machine'
                );
                // Refresh to get latest state
                await sync.refreshMachines();
            } finally {
                setIsRenamingMachine(false);
            }
        }
    };

    const handleStartSession = async (approvedNewDirectoryCreation: boolean = false): Promise<void> => {
        if (!machine || !machineId) return;
        try {
            const pathToUse = (customPath.trim() || '~');
            if (!isMachineOnline(machine)) return;
            setIsSpawning(true);
            const absolutePath = resolveAbsolutePath(pathToUse, machine?.metadata?.homeDir);
            const result = await machineSpawnNewSession({
                machineId: machineId!,
                directory: absolutePath,
                approvedNewDirectoryCreation
            });
            switch (result.type) {
                case 'success':
                    // Dismiss machine picker & machine detail screen
                    router.back();
                    router.back();
                    navigateToSession(result.sessionId);
                    break;
                case 'requestToApproveDirectoryCreation': {
                    const approved = await Modal.confirm('Create Directory?', `The directory '${result.directory}' does not exist. Would you like to create it?`, { cancelText: t('common.cancel'), confirmText: t('common.create') });
                    if (approved) {
                        await handleStartSession(true);
                    }
                    break;
                }
                case 'error':
                    Modal.alert(t('common.error'), result.errorMessage);
                    break;
            }
        } catch (error) {
            let errorMessage = 'Failed to start session. Make sure the daemon is running on the target machine.';
            if (error instanceof Error && !error.message.includes('Failed to spawn session')) {
                errorMessage = error.message;
            }
            Modal.alert(t('common.error'), errorMessage);
        } finally {
            setIsSpawning(false);
        }
    };

    const pastUsedRelativePath = useCallback((session: Session) => {
        if (!session.metadata) return 'unknown path';
        return formatPathRelativeToHome(session.metadata.path, session.metadata.homeDir);
    }, []);

    if (!machine) {
        return (
            <>
                <Stack.Screen
                    options={{
                        headerShown: true,
                        headerTitle: '',
                        headerBackTitle: t('machine.back')
                    }}
                />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={[Typography.default(), { fontSize: 16, color: '#666' }]}>
                        Machine not found
                    </Text>
                </View>
            </>
        );
    }

    const metadata = machine.metadata;
    const machineName = metadata?.displayName || metadata?.host || 'unknown machine';
    const happyCliVersion = metadata?.happyCliVersion || machine.daemonState?.startedWithCliVersion || null;
    const happySelfUpdateSupported = isHappySelfUpdateSupported(happyCliVersion);

    const spawnButtonDisabled = !customPath.trim() || isSpawning || !isMachineOnline(machine!);

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: () => (
                        <View style={{ alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons
                                    name="desktop-outline"
                                    size={18}
                                    color={theme.colors.header.tint}
                                    style={{ marginRight: 6 }}
                                />
                                <Text style={[Typography.default('semiBold'), { fontSize: 17, color: theme.colors.header.tint }]}>
                                    {machineName}
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                                <View style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: isMachineOnline(machine) ? '#34C759' : '#999',
                                    marginRight: 4
                                }} />
                                <Text style={[Typography.default(), {
                                    fontSize: 12,
                                    color: isMachineOnline(machine) ? '#34C759' : '#999'
                                }]}>
                                    {isMachineOnline(machine) ? t('status.online') : t('status.offline')}
                                </Text>
                            </View>
                        </View>
                    ),
                    headerRight: () => (
                        <Pressable
                            onPress={handleRenameMachine}
                            hitSlop={10}
                            style={{
                                opacity: isRenamingMachine ? 0.5 : 1
                            }}
                            disabled={isRenamingMachine}
                        >
                            <Octicons
                                name="pencil"
                                size={24}
                                color={theme.colors.text}
                            />
                        </Pressable>
                    ),
                    headerBackTitle: t('machine.back')
                }}
            />
            <ItemList
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                    />
                }
                keyboardShouldPersistTaps="handled"
            >
                {/* Launch section */}
                {machine && (
                    <>
                        {!isMachineOnline(machine) && (
                            <ItemGroup>
                                <Item
                                    title={t('machine.offlineUnableToSpawn')}
                                    subtitle={t('machine.offlineHelp')}
                                    subtitleLines={0}
                                    showChevron={false}
                                />
                            </ItemGroup>
                        )}
                        <ItemGroup title={t('machine.launchNewSessionInDirectory')}>
                        <View style={{ opacity: isMachineOnline(machine) ? 1 : 0.5 }}>
                            <View style={styles.pathInputContainer}>
                                <View style={[styles.pathInput, { paddingVertical: 8 }]}>
                                    <MultiTextInput
                                        ref={inputRef}
                                        value={customPath}
                                        onChangeText={setCustomPath}
                                        placeholder={'Enter custom path'}
                                        maxHeight={76}
                                        paddingTop={8}
                                        paddingBottom={8}
                                        paddingRight={48}
                                    />
                                    <Pressable
                                        onPress={() => handleStartSession()}
                                        disabled={spawnButtonDisabled}
                                        style={[
                                            styles.inlineSendButton,
                                            spawnButtonDisabled ? styles.inlineSendInactive : styles.inlineSendActive
                                        ]}
                                    >
                                        <Ionicons
                                            name="play"
                                            size={16}
                                            color={spawnButtonDisabled ? theme.colors.textSecondary : theme.colors.button.primary.tint}
                                            style={{ marginLeft: 1 }}
                                        />
                                    </Pressable>
                                </View>
                            </View>
                            <View style={{ paddingTop: 4 }} />
                            {pathsToShow.map((path, index) => {
                                const display = formatPathRelativeToHome(path, machine.metadata?.homeDir);
                                const isSelected = customPath.trim() === display;
                                const isLast = index === pathsToShow.length - 1;
                                const hideDivider = isLast && pathsToShow.length <= 5;
                                return (
                                    <Item
                                        key={path}
                                        title={display}
                                        leftElement={<Ionicons name="folder-outline" size={18} color={theme.colors.textSecondary} />}
                                        onPress={isMachineOnline(machine) ? () => {
                                            setCustomPath(display);
                                            setTimeout(() => inputRef.current?.focus(), 50);
                                        } : undefined}
                                        disabled={!isMachineOnline(machine)}
                                        selected={isSelected}
                                        showChevron={false}
                                        pressableStyle={isSelected ? { backgroundColor: theme.colors.surfaceSelected } : undefined}
                                        showDivider={!hideDivider}
                                    />
                                );
                            })}
                            {recentPaths.length > 5 && (
                                <Item
                                    title={showAllPaths ? t('machineLauncher.showLess') : t('machineLauncher.showAll', { count: recentPaths.length })}
                                    onPress={() => setShowAllPaths(!showAllPaths)}
                                    showChevron={false}
                                    showDivider={false}
                                    titleStyle={{
                                        textAlign: 'center',
                                        color: (theme as any).dark ? theme.colors.button.primary.tint : theme.colors.button.primary.background
                                    }}
                                />
                            )}
                        </View>
                        </ItemGroup>
                    </>
                )}

                {/* Daemon */}
                <ItemGroup title={t('machine.daemon')}>
                        <Item
                            title={t('machine.status')}
                            detail={daemonStatus}
                            detailStyle={{
                                color: daemonStatus === 'likely alive' ? '#34C759' : '#FF9500'
                            }}
                            showChevron={false}
                        />
                        <Item
                            title={t('machine.stopDaemon')}
                            titleStyle={{ 
                                color: daemonStatus === 'stopped' ? '#999' : '#FF9500' 
                            }}
                            onPress={daemonStatus === 'stopped' ? undefined : handleStopDaemon}
                            disabled={isStoppingDaemon || daemonStatus === 'stopped'}
                            rightElement={
                                isStoppingDaemon ? (
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                ) : (
                                    <Ionicons 
                                        name="stop-circle" 
                                        size={20} 
                                        color={daemonStatus === 'stopped' ? '#999' : '#FF9500'} 
                                    />
                                )
                            }
                        />
                        {machine.daemonState && (
                            <>
                                {machine.daemonState.pid && (
                                    <Item
                                        title={t('machine.lastKnownPid')}
                                        subtitle={String(machine.daemonState.pid)}
                                        subtitleStyle={{ fontFamily: 'Menlo', fontSize: 13 }}
                                    />
                                )}
                                {machine.daemonState.httpPort && (
                                    <Item
                                        title={t('machine.lastKnownHttpPort')}
                                        subtitle={String(machine.daemonState.httpPort)}
                                        subtitleStyle={{ fontFamily: 'Menlo', fontSize: 13 }}
                                    />
                                )}
                                {machine.daemonState.startTime && (
                                    <Item
                                        title={t('machine.startedAt')}
                                        subtitle={new Date(machine.daemonState.startTime).toLocaleString()}
                                    />
                                )}
                                {machine.daemonState.startedWithCliVersion && (
                                    <Item
                                        title={t('machine.cliVersion')}
                                        subtitle={machine.daemonState.startedWithCliVersion}
                                        subtitleStyle={{ fontFamily: 'Menlo', fontSize: 13 }}
                                    />
                                )}
                            </>
                        )}
                        <Item
                            title={t('machine.daemonStateVersion')}
                            subtitle={String(machine.daemonStateVersion)}
                        />
                </ItemGroup>

                <ItemGroup title="Happy CLI">
                    <Item
                        title="Installed version"
                        subtitle={happyCliVersion || 'Unknown'}
                        subtitleStyle={{ fontFamily: 'Menlo', fontSize: 13 }}
                        showChevron={false}
                    />
                    <Item
                        title={happySelfUpdateSupported ? 'Update Happy & restart daemon' : 'One-time bootstrap required'}
                        subtitle={happyUpdateOperation
                            ? `${happyUpdateOperation.phase} (${happyUpdateOperation.progress}%)`
                            : happySelfUpdateSupported
                                ? 'Checks the verified Gs-ygc/happy CLI release'
                                : 'Install Happy CLI 1.2.5 or newer once through SSH'}
                        onPress={() => void runHappyUpdate()}
                        disabled={isHappyUpdateBusy || hasPendingHappyUpdate || !isMachineOnline(machine)}
                        rightElement={isHappyUpdateBusy
                            ? <ActivityIndicator size="small" />
                            : <Ionicons
                                name={happySelfUpdateSupported ? 'cloud-download-outline' : 'terminal-outline'}
                                size={20}
                                color={theme.colors.textSecondary}
                            />}
                    />
                    {hasPendingHappyUpdate && !isHappyUpdateBusy && (
                        <Item
                            title="Continue monitoring Happy update"
                            subtitle={`${happyUpdateOperation!.phase} (${happyUpdateOperation!.progress}%)`}
                            onPress={() => void continueHappyUpdate()}
                            rightElement={<Ionicons name="pulse-outline" size={20} color={theme.colors.textSecondary} />}
                        />
                    )}
                </ItemGroup>

                {/* CLI Availability */}
                {metadata?.cliAvailability && (
                    <ItemGroup title={t('machine.cliAvailability')}>
                        <Item
                            title="Claude"
                            showChevron={false}
                            rightElement={
                                <Text style={{ color: metadata.cliAvailability.claude ? '#34C759' : theme.colors.textSecondary, fontSize: 14 }}>
                                    {metadata.cliAvailability.claude ? t('machine.cliInstalled') : t('machine.cliNotFound')}
                                </Text>
                            }
                        />
                        <Item
                            title="Codex"
                            showChevron={false}
                            rightElement={
                                <Text style={{ color: metadata.cliAvailability.codex ? '#34C759' : theme.colors.textSecondary, fontSize: 14 }}>
                                    {metadata.cliAvailability.codex ? t('machine.cliInstalled') : t('machine.cliNotFound')}
                                </Text>
                            }
                        />
                        <Item
                            title="Gemini"
                            showChevron={false}
                            rightElement={
                                <Text style={{ color: metadata.cliAvailability.gemini ? '#34C759' : theme.colors.textSecondary, fontSize: 14 }}>
                                    {metadata.cliAvailability.gemini ? t('machine.cliInstalled') : t('machine.cliNotFound')}
                                </Text>
                            }
                        />
                        <Item
                            title="OpenClaw"
                            showChevron={false}
                            rightElement={
                                <Text style={{ color: metadata.cliAvailability.openclaw ? '#34C759' : theme.colors.textSecondary, fontSize: 14 }}>
                                    {metadata.cliAvailability.openclaw ? t('machine.cliInstalled') : t('machine.cliNotFound')}
                                </Text>
                            }
                        />
                        <Item
                            title={t('machine.lastDetected')}
                            subtitle={new Date(metadata.cliAvailability.detectedAt).toLocaleString()}
                            showChevron={false}
                        />
                    </ItemGroup>
                )}

                {metadata?.cliAvailability?.codex && (
                    <ItemGroup title="Codex">
                        <Item
                            title="Version"
                            subtitle={codexStatus?.version || 'Tap check to read the installed version'}
                            showChevron={false}
                        />
                        <Item
                            title="Check Codex status"
                            subtitle={codexOperation?.kind === 'status' ? `${codexOperation.state}${codexOperation.progress !== undefined ? ` (${codexOperation.progress}%)` : ''}` : undefined}
                            onPress={() => void runCodexOperation('status')}
                            disabled={isCodexBusy || hasPendingCodexOperation || !isMachineOnline(machine)}
                            rightElement={isCodexBusy && codexOperation?.kind === 'status' ? <ActivityIndicator size="small" /> : <Ionicons name="refresh-outline" size={20} color={theme.colors.textSecondary} />}
                        />
                        <Item
                            title="Restart Codex sessions"
                            subtitle="Reconnect all Codex sessions on this device"
                            onPress={() => void runCodexOperation('restart')}
                            disabled={isCodexBusy || hasPendingCodexOperation || !isMachineOnline(machine)}
                            rightElement={isCodexBusy && codexOperation?.kind === 'restart' ? <ActivityIndicator size="small" /> : <Ionicons name="reload-outline" size={20} color={theme.colors.textSecondary} />}
                        />
                        <Item
                            title="Update Codex CLI"
                            subtitle="Uses the detected package manager"
                            onPress={() => void runCodexOperation('update')}
                            disabled={isCodexBusy || hasPendingCodexOperation || !isMachineOnline(machine)}
                            rightElement={isCodexBusy && codexOperation?.kind === 'update' ? <ActivityIndicator size="small" /> : <Ionicons name="cloud-download-outline" size={20} color={theme.colors.textSecondary} />}
                        />
                        {hasPendingCodexOperation && !isCodexBusy && (
                            <Item
                                title="Continue monitoring"
                                subtitle={`${codexOperation.kind} · ${codexOperation.state}${codexOperation.progress !== undefined ? ` (${codexOperation.progress}%)` : ''}`}
                                onPress={() => void continueCodexOperation()}
                                rightElement={<Ionicons name="pulse-outline" size={20} color={theme.colors.textSecondary} />}
                            />
                        )}
                    </ItemGroup>
                )}

                {metadata?.cliAvailability?.codex && (
                    <ItemGroup title="Codex device group">
                        <Item
                            title="Current group"
                            subtitle={assignedCodexGroup?.name || 'Not assigned'}
                            showChevron={false}
                            rightElement={isApplyingCodexGroup ? <ActivityIndicator size="small" /> : undefined}
                        />
                        {settings.codexDeviceGroups.map((group) => (
                            <Item
                                key={group.id}
                                title={group.name}
                                subtitle={`Policy revision ${group.policy.revision} · ${group.machineIds.length} device(s)`}
                                onPress={() => void assignCodexGroup(group.id)}
                                disabled={isApplyingCodexGroup}
                                rightElement={group.id === assignedCodexGroup?.id
                                    ? <Ionicons name="checkmark-circle" size={21} color={theme.colors.success} />
                                    : <Ionicons name="ellipse-outline" size={21} color={theme.colors.textSecondary} />}
                            />
                        ))}
                        <Item
                            title="Create device group"
                            onPress={() => void createCodexGroup()}
                            disabled={isApplyingCodexGroup}
                            rightElement={<Ionicons name="add-circle-outline" size={21} color={theme.colors.textSecondary} />}
                        />
                        {assignedCodexGroup && (
                            <>
                                <Item
                                    title="Edit group policy"
                                    subtitle="Base config, MCP servers, and Skills"
                                    onPress={() => editCodexGroup(assignedCodexGroup)}
                                    disabled={isApplyingCodexGroup}
                                    rightElement={<Ionicons name="options-outline" size={21} color={theme.colors.textSecondary} />}
                                />
                                <Item
                                    title="Remove from group"
                                    onPress={() => void assignCodexGroup(null)}
                                    disabled={isApplyingCodexGroup}
                                    rightElement={<Ionicons name="remove-circle-outline" size={21} color={theme.colors.textDestructive} />}
                                />
                                <Item
                                    title="Delete group"
                                    onPress={() => void deleteCodexGroup(assignedCodexGroup)}
                                    disabled={isApplyingCodexGroup}
                                    destructive
                                    rightElement={<Ionicons name="trash-outline" size={21} color={theme.colors.textDestructive} />}
                                />
                            </>
                        )}
                    </ItemGroup>
                )}

                {/* Previous Sessions (debug view) */}
                {previousSessions.length > 0 && (
                    <ItemGroup title={'Previous Sessions (up to 5 most recent)'}>
                        {previousSessions.map(session => (
                            <Item
                                key={session.id}
                                title={getSessionName(session)}
                                subtitle={getSessionSubtitle(session)}
                                onPress={() => navigateToSession(session.id)}
                                rightElement={<Ionicons name="chevron-forward" size={20} color="#C7C7CC" />}
                            />
                        ))}
                    </ItemGroup>
                )}

                {/* Machine */}
                <ItemGroup title={t('machine.machineGroup')}>
                        <Item
                            title={t('machine.host')}
                            subtitle={metadata?.host || machineId}
                        />
                        <Item
                            title={t('machine.machineId')}
                            subtitle={machineId}
                            subtitleStyle={{ fontFamily: 'Menlo', fontSize: 12 }}
                        />
                        {metadata?.username && (
                            <Item
                                title={t('machine.username')}
                                subtitle={metadata.username}
                            />
                        )}
                        {metadata?.homeDir && (
                            <Item
                                title={t('machine.homeDirectory')}
                                subtitle={metadata.homeDir}
                                subtitleStyle={{ fontFamily: 'Menlo', fontSize: 13 }}
                            />
                        )}
                        {metadata?.platform && (
                            <Item
                                title={t('machine.platform')}
                                subtitle={metadata.platform}
                            />
                        )}
                        {metadata?.arch && (
                            <Item
                                title={t('machine.architecture')}
                                subtitle={metadata.arch}
                            />
                        )}
                        <Item
                            title={t('machine.lastSeen')}
                            subtitle={machine.activeAt ? new Date(machine.activeAt).toLocaleString() : t('machine.never')}
                        />
                        <Item
                            title={t('machine.metadataVersion')}
                            subtitle={String(machine.metadataVersion)}
                        />
                </ItemGroup>

                {/* Danger zone */}
                <ItemGroup title={t('machine.dangerZone')} footer={t('machine.deleteFooter')}>
                    <Item
                        title={t('machine.delete')}
                        titleStyle={{ color: '#FF3B30' }}
                        onPress={handleDeleteMachine}
                        disabled={isDeletingMachine}
                        showChevron={false}
                        rightElement={
                            isDeletingMachine ? (
                                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                            ) : (
                                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                            )
                        }
                    />
                </ItemGroup>
            </ItemList>
        </>
    );
}
