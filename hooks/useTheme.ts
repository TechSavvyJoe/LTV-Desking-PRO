import { useEffect, useState } from 'react';

type Theme = 'dark';

// Enforce persistent dark mode.
export function useTheme(): Theme {
    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.classList.add('dark');
        }
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('theme', 'dark');
        }
    }, []);
    return 'dark';
}

// Hook retained for API compatibility, but always returns/sets dark.
export function useThemeControl(): [Theme, (theme: Theme) => void] {
    const [theme, setTheme] = useState<Theme>('dark');
    const setAndDispatchTheme = () => setTheme('dark');
    return [theme, setAndDispatchTheme];
}
