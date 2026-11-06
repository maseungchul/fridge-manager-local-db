/**
 * @file
 * 설정 탭의 기본 화면을 표시하며, 설정 항목은 추후 연결한다.
 */
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme/tokens';
import { headerStyles } from '@/theme/headerStyles';

export function SettingsScreen() {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>설정</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingBottom: spacing.lg,
  },
  ...headerStyles,
});
