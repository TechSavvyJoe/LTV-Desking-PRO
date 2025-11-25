import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

// A single instance of this hook should be used at the root of the app.
let isInitialized = false;

export function useTheme() {
    // This hook is designed to be a singleton. It sets up global listeners
    // and modifies the root element. It should only run once.
    if (isInitialized) {
        return;
    }
    isInitialized = true;

    const getInitialTheme = (): Theme => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('theme') as Theme | null) || 'system';
        }
        return 'system';
    };

    const [theme, setThemeState] = useState<Theme>(getInitialTheme);

    const applyTheme = useCallback((selectedTheme: Theme) => {
        const isDark = selectedTheme === 'dark' || (selectedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.classList.toggle('dark', isDark);
    }, []);

    useEffect(() => {
        applyTheme(theme);
    }, [theme, applyTheme]);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            if (theme === 'system') {
                applyTheme('system');
            }
        };
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme, applyTheme]);

    useEffect(() => {
        // Custom event listener to allow ThemeToggle to update the hook's state
        const handleThemeChange = (event: Event) => {
            const customEvent = event as CustomEvent<Theme>;
            const newTheme = customEvent.detail;
            localStorage.setItem('theme', newTheme);
            setThemeState(newTheme);
        };

        window.addEventListener('themechange', handleThemeChange);
        return () => window.removeEventListener('themechange', handleThemeChange);
    }, []);
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
