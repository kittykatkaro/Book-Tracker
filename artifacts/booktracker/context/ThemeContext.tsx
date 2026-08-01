import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

// Named palettes are fixed, complete looks — picking one is an alternative
// to (not a variant of) light/dark/system, matching how the web app's
// theme picker works.
export const PALETTE_IDS = [
  'dark-academia',
  'cozy-nook',
  'pastel-sunset',
  'modern-social',
] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

type ThemeMode = 'light' | 'dark' | 'system' | PaletteId;
export type ResolvedTheme = 'light' | 'dark' | PaletteId;

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = 'app_theme';

function isPaletteId(value: string): value is PaletteId {
  return (PALETTE_IDS as readonly string[]).includes(value);
}

function resolveTheme(theme: ThemeMode, system: 'light' | 'dark' | null): ResolvedTheme {
  if (isPaletteId(theme)) return theme;
  if (theme === 'system') return system ?? 'light';
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark' || saved === 'system' || (saved && isPaletteId(saved))) {
          setThemeState(saved as ThemeMode);
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const resolvedTheme = resolveTheme(theme, systemScheme ?? 'light');

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
