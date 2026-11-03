/**
 * @file
 * 장보기 탭의 기본 화면을 표시하며, 목록 관리 기능은 추후 연결한다.
 */
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';
import { colors, spacing } from '@/theme/tokens';

export function ShoppingScreen() {
  return (
    <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>장보기</Text>
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
