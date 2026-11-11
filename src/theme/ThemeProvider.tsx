/**
 * @file
 * 앱에서 사용하는 색상 테마를 공유하고 선택한 모드를 SQLite에 저장한다.
 * 저장에 성공한 모드만 반영하며, 앱을 열 때 저장값을 먼저 복원한다.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import Storage from 'expo-sqlite/kv-store';
import { getAppTheme } from '@/theme/tokens';
import type { AppTheme, ThemeMode } from '@/theme/tokens';

export type ThemePreference = ThemeMode | 'system';

interface ThemeContextValue extends AppTheme {
  mode: ThemeMode;
  preference: ThemePreference;
  isChangingTheme: boolean;
  changeTheme: (preference: ThemePreference) => Promise<void>;
}

const THEME_STORAGE_KEY = 'settings.theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreference] = useState<ThemePreference | null>(null);
  const systemColorScheme = useColorScheme();
  const [isChangingTheme, setIsChangingTheme] = useState(false);
  const changing = useRef(false);

  useEffect(() => {
    let active = true;
    Storage.getItemAsync(THEME_STORAGE_KEY).then(saved => {
      if (active) setPreference(saved === 'dark' || saved === 'system' ? saved : 'light');
    }).catch(() => {
      if (active) setPreference('light');
    });
    return () => { active = false; };
  }, []);

  const changeTheme = useCallback(async (next: ThemePreference) => {
    if (next === preference || changing.current) return;
    // 저장 중에는 재렌더링 전에 들어오는 연속 입력도 무시한다.
    changing.current = true;
    setIsChangingTheme(true);
    try {
      await Storage.setItemAsync(THEME_STORAGE_KEY, next);
      setPreference(next);
    } finally {
      changing.current = false;
      setIsChangingTheme(false);
    }
  }, [preference]);

  if (preference === null) return null;
  const mode: ThemeMode = preference === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : preference;

  return (
    <ThemeContext.Provider value={{ ...getAppTheme(mode), mode, preference, isChangingTheme, changeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useAppTheme requires ThemeProvider.');
  return theme;
}
