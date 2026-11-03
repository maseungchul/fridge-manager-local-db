/**
 * @file
 * 내부 설정의 홈 이동 버튼을 표시하며, iOS에서는 별도 네이티브 구현을 사용한다.
 * 위치·비활성화 상태·화면 종료 처리는 호출하는 화면에서 관리한다.
 */
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { StyleSheet, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { colors, spacing } from '@/theme/tokens';

export interface FridgeHomeButtonProps {
  disabled: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export function FridgeHomeButton({ disabled, onPress, style }: FridgeHomeButtonProps) {
  return (
    <FeedbackPressable accessibilityRole="button" accessibilityLabel="홈으로 이동"
      accessibilityHint="저장하지 않은 편집을 종료하고 홈으로 이동합니다."
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, style]}>
      <MaterialDesignIcons name="home" size={20} color={colors.text} accessible={false} />
      <Text style={styles.label}>홈</Text>
    </FeedbackPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
