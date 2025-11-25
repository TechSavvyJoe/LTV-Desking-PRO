import { useState, useEffect, useCallback, useRef } from 'react';

type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
    // Keep theme in state so React’s hook order remains stable under StrictMode.
    const getInitialTheme = (): Theme => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('theme') as Theme | null) || 'system';
        }
        return 'system';
    };

    const [theme, setThemeState] = useState<Theme>(getInitialTheme);
    const hasSyncedRef = useRef(false);

    const applyTheme = useCallback((selectedTheme: Theme) => {
        const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = selectedTheme === 'dark' || (selectedTheme === 'system' && prefersDark);
        document.documentElement.classList.toggle('dark', isDark);
    }, []);

    // Apply and persist whenever the theme state changes.
    useEffect(() => {
        applyTheme(theme);
        localStorage.setItem('theme', theme);
        hasSyncedRef.current = true;
    }, [theme, applyTheme]);

    // React to OS theme changes only when using system theme.
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            if ((localStorage.getItem('theme') as Theme | null) === 'system') {
                setThemeState('system'); // triggers applyTheme via effect
            }
        };
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // Listen for custom themechange events dispatched by the toggle control.
    useEffect(() => {
        const handleThemeChange = (event: Event) => {
            const customEvent = event as CustomEvent<Theme>;
            if (!customEvent?.detail) return;
            setThemeState(customEvent.detail);
        };
        window.addEventListener('themechange', handleThemeChange);
        return () => window.removeEventListener('themechange', handleThemeChange);
    }, []);

    return hasSyncedRef.current ? theme : undefined;
}

// Separate hook for components to read and update the theme
export function useThemeControl(): [Theme, (theme: Theme) => void] {
    const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme | null) || 'system');
    
    const setAndDispatchTheme = (newTheme: Theme) => {
        setTheme(newTheme);
        window.dispatchEvent(new CustomEvent('themechange', { detail: newTheme }));
    };

    return [theme, setAndDispatchTheme];
}
