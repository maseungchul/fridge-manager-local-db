/**
 * @file
 * 장보기 탭의 기본 화면을 표시하며, 목록 관리 기능은 추후 연결한다.
 */
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getHeaderStyles } from '@/theme/headerStyles';
import { useTranslation } from '@/i18n/LanguageProvider';

export function ShoppingScreen() {
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{t('tabs.shopping')}</Text>
      </View>
    </SafeAreaView>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingBottom: spacing.lg,
  },
  ...getHeaderStyles(mode),
}));
