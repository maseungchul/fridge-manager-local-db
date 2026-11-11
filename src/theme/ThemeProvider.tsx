/**
 * @file
 * 앱에서 사용하는 색상 테마를 공유하고 선택한 모드를 SQLite에 저장한다.
 * 저장에 성공한 모드만 반영하며, 앱을 열 때 저장값을 먼저 복원한다.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import Storage from 'expo-sqlite/kv-store';
import { getAppTheme } from '@/theme/tokens';
import type { AppTheme, ThemeMode } from '@/theme/tokens';

interface ThemeContextValue extends AppTheme {
  mode: ThemeMode;
  isChangingTheme: boolean;
  changeTheme: (mode: ThemeMode) => Promise<void>;
}

const THEME_STORAGE_KEY = 'settings.theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode | null>(null);
  const [isChangingTheme, setIsChangingTheme] = useState(false);
  const changing = useRef(false);

  useEffect(() => {
    let active = true;
    Storage.getItemAsync(THEME_STORAGE_KEY).then(saved => {
      if (active) setMode(saved === 'dark' ? 'dark' : 'light');
    }).catch(() => {
      if (active) setMode('light');
    });
    return () => { active = false; };
  }, []);

  const changeTheme = useCallback(async (next: ThemeMode) => {
    if (next === mode || changing.current) return;
    // 저장 중에는 재렌더링 전에 들어오는 연속 입력도 무시한다.
    changing.current = true;
    setIsChangingTheme(true);
    try {
      await Storage.setItemAsync(THEME_STORAGE_KEY, next);
      setMode(next);
    } finally {
      changing.current = false;
      setIsChangingTheme(false);
    }
  }, [mode]);

  if (mode === null) return null;

  return (
    <ThemeContext.Provider value={{ ...getAppTheme(mode), mode, isChangingTheme, changeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useAppTheme requires ThemeProvider.');
  return theme;
}
