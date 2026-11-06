/**
 * @file
 * 장보기 탭의 기본 화면을 표시하며, 목록 관리 기능은 추후 연결한다.
 */
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';
import { colors, spacing } from '@/theme/tokens';
import { headerStyles } from '@/theme/headerStyles';

export function ShoppingScreen() {
  return (
    <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} style={styles.container}>
      <View style={styles.header}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>장보기</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    paddingBottom: spacing.lg,
  },
  ...headerStyles,
});
