import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { THEMES, ThemeColors, ThemeName } from './tokens';

const STORAGE_KEY = 'oto_theme';

type ThemeValue = {
  themeName: ThemeName;
  colors: ThemeColors;
  setTheme: (n: ThemeName) => Promise<void>;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>('navy');

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === 'navy' || stored === 'dark' || stored === 'light') setThemeName(stored);
    })();
  }, []);

  const setTheme = useCallback(async (n: ThemeName) => {
    setThemeName(n);
    await AsyncStorage.setItem(STORAGE_KEY, n);
  }, []);

  const value = useMemo(
    () => ({ themeName, colors: THEMES[themeName], setTheme }),
    [themeName, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
