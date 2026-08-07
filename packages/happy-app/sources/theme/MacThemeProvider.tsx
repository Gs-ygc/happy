import * as React from 'react';
import { Appearance } from 'react-native';
import { useLocalSettings } from '@/sync/storage';
import { applyMacTheme, clearMacTheme, isMacTauriEnvironment } from './macThemeRuntime';

export function MacThemeProvider({ children }: { children: React.ReactNode }) {
    const { macThemeLibrary, macThemeId } = useLocalSettings();
    const [systemDark, setSystemDark] = React.useState(Appearance.getColorScheme() === 'dark');
    const [reducedTransparency, setReducedTransparency] = React.useState(false);

    React.useEffect(() => {
        const subscription = Appearance.addChangeListener(({ colorScheme }) => {
            setSystemDark(colorScheme === 'dark');
        });
        return () => subscription.remove();
    }, []);

    React.useEffect(() => {
        if (!isMacTauriEnvironment() || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const query = window.matchMedia('(prefers-reduced-transparency: reduce)');
        const update = () => setReducedTransparency(query.matches);
        update();
        query.addEventListener?.('change', update);
        return () => query.removeEventListener?.('change', update);
    }, []);

    React.useEffect(() => {
        if (!isMacTauriEnvironment()) {
            clearMacTheme();
            return;
        }
        const selected = macThemeLibrary.find((theme) => theme.id === macThemeId) ?? macThemeLibrary[0];
        if (selected) {
            const dark = selected.mode === 'dark' || (selected.mode === 'adaptive' && systemDark);
            applyMacTheme(selected, dark, reducedTransparency);
        }
    }, [macThemeId, macThemeLibrary, reducedTransparency, systemDark]);

    return <>{children}</>;
}
