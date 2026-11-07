/**
 * @file
 * 앱 전체의 표시 언어를 공유하고 기존 SQLite 키·값 저장소에 선택을 유지한다.
 * 저장된 언어를 복원한 뒤 화면을 열고, 변경값은 저장에 성공했을 때만 반영한다.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Storage from 'expo-sqlite/kv-store';
import { DEFAULT_LANGUAGE, resolveLanguage, translate } from '@/i18n/translations';
import type { AppLanguage, TranslationArgs, TranslationKey, Translator } from '@/i18n/translations';
import { colors } from '@/theme/tokens';

interface LanguageContextValue {
  language: AppLanguage;
  isChangingLanguage: boolean;
  changeLanguage: (language: AppLanguage) => Promise<void>;
  t: Translator;
}

const LANGUAGE_STORAGE_KEY = 'settings.language';
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage | null>(null);
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);
  const changing = useRef(false);

  useEffect(() => {
    let active = true;
    Storage.getItemAsync(LANGUAGE_STORAGE_KEY).then(saved => {
      if (active) setLanguage(resolveLanguage(saved));
    }).catch(() => {
      if (active) setLanguage(DEFAULT_LANGUAGE);
    });
    return () => { active = false; };
  }, []);

  const currentLanguage = language ?? DEFAULT_LANGUAGE;
  const t = useCallback(function translateKey<Key extends TranslationKey>(key: Key, ...args: TranslationArgs<Key>) {
    return translate(currentLanguage, key, ...args);
  }, [currentLanguage]);
  const changeLanguage = useCallback(async (next: AppLanguage) => {
    if (next === language || changing.current) return;
    // 재렌더링 전에 연속으로 눌러도 저장 순서가 뒤집히지 않게 한다.
    changing.current = true;
    setIsChangingLanguage(true);
    try {
      await Storage.setItemAsync(LANGUAGE_STORAGE_KEY, next);
      setLanguage(next);
    } finally {
      changing.current = false;
      setIsChangingLanguage(false);
    }
  }, [language]);

  if (language === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  return (
    <LanguageContext.Provider value={{ language, isChangingLanguage, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('표시 언어의 공통 상태를 찾을 수 없습니다.');
  return context;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
