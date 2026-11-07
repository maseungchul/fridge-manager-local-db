/**
 * @file
 * 로컬 DB를 초기화하고 실패한 경우 현재 표시 언어로 오류와 재시도를 안내한다.
 * 초기화가 끝나기 전에는 DB를 사용하는 화면을 열지 않는다.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { initializeDatabase } from '@/db/initializeDatabase';
import { useTranslation } from '@/i18n/LanguageProvider';
import { getErrorMessage } from '@/i18n/errors';
import { colors, spacing } from '@/theme/tokens';

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [error, setError] = useState<Error | null>(null);

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text accessibilityRole="alert" style={styles.error}>{getErrorMessage(error, t, t('errors.databaseInit'))}</Text>
          <PrimaryButton label={t('common.retry')} onPress={() => setError(null)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SQLiteProvider databaseName="fridge-manager.db" onInit={initializeDatabase} onError={setError}>
      {children}
    </SQLiteProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  error: { color: colors.error, fontSize: 16, lineHeight: 24 },
});
