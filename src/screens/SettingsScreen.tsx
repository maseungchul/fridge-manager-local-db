/**
 * @file
 * 설정 탭의 기본 화면을 표시하며, 설정 항목은 추후 연결한다.
 */
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';
import { colors, spacing } from '@/theme/tokens';

export function SettingsScreen() {
  return (
    <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>설정</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
});
