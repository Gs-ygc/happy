import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Item } from './Item';
import { ItemGroup } from './ItemGroup';
import { useUnistyles } from 'react-native-unistyles';
import { useUpdates } from '@/hooks/useUpdates';
import { useChangelog } from '@/hooks/useChangelog';
import { useNativeUpdate } from '@/hooks/useNativeUpdate';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { t } from '@/text';
import { installAndroidApkUpdate } from '@/utils/installAndroidUpdate';
import { isTrustedAndroidApkUpdateUrl } from '@/utils/githubNativeUpdate';
import { Modal } from '@/modal';

export const UpdateBanner = React.memo(() => {
    const { theme } = useUnistyles();
    const { updateAvailable, reloadApp } = useUpdates();
    const { hasUnread, markAsRead } = useChangelog();
    const updateUrl = useNativeUpdate();
    const router = useRouter();
    const [isInstallingNativeUpdate, setIsInstallingNativeUpdate] = React.useState(false);

    const handleNativeUpdate = React.useCallback(async () => {
        if (!updateUrl || isInstallingNativeUpdate) {
            return;
        }

        setIsInstallingNativeUpdate(true);
        try {
            if (Platform.OS === 'android' && isTrustedAndroidApkUpdateUrl(updateUrl)) {
                await installAndroidApkUpdate(updateUrl);
            } else {
                await openExternalUrl(updateUrl);
            }
        } catch (error) {
            console.error('Failed to install native update:', error);
            Modal.alert(t('common.error'), t('errors.tryAgain'));
        } finally {
            setIsInstallingNativeUpdate(false);
        }
    }, [isInstallingNativeUpdate, updateUrl]);

    // Show native app update banner (highest priority)
    if (updateUrl) {
        const isDirectAndroidUpdate = Platform.OS === 'android'
            && isTrustedAndroidApkUpdateUrl(updateUrl);

        return (
            <ItemGroup>
                <Item
                    title={t('updateBanner.nativeUpdateAvailable')}
                    subtitle={Platform.OS === 'ios'
                        ? t('updateBanner.tapToUpdateAppStore')
                        : isDirectAndroidUpdate
                            ? t('updateBanner.pressToApply')
                            : t('updateBanner.tapToUpdatePlayStore')}
                    icon={<Ionicons name="download-outline" size={28} color={theme.colors.success} />}
                    showChevron={!isDirectAndroidUpdate}
                    loading={isInstallingNativeUpdate}
                    onPress={handleNativeUpdate}
                />
            </ItemGroup>
        );
    }

    // Show OTA update banner if available (second priority)
    if (updateAvailable) {
        return (
            <ItemGroup>
                <Item
                    title={t('updateBanner.updateAvailable')}
                    subtitle={t('updateBanner.pressToApply')}
                    icon={<Ionicons name="download-outline" size={28} color={theme.colors.success} />}
                    showChevron={false}
                    onPress={reloadApp}
                />
            </ItemGroup>
        );
    }

    // Show changelog banner if there are unread changelog entries (lowest priority)
    if (hasUnread) {
        return (
            <ItemGroup>
                <Item
                    title={t('updateBanner.whatsNew')}
                    subtitle={t('updateBanner.seeLatest')}
                    icon={<Ionicons name="sparkles-outline" size={28} color={theme.colors.text} />}
                    showChevron={true}
                    onPress={() => {
                        router.push('/changelog');
                        setTimeout(() => {
                            markAsRead();
                        }, 1000);
                    }}
                />
            </ItemGroup>
        );
    }

    return null;
});
