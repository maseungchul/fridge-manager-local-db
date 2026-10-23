/**
 * @file
 * SecondaryButton은 취소 같은 보조 동작에 사용하는 공통 텍스트 버튼이다.
 * 평소에는 배경·테두리 없이 표시하며, 클릭 처리는 호출하는 화면이 담당한다.
 */
import type { ComponentProps } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { StyleSheet, Text } from 'react-native';
import type { PressableProps } from 'react-native';
import { colors, spacing } from '@/theme/tokens';
import { FeedbackPressable } from '@/components/FeedbackPressable';

interface SecondaryButtonProps {
  label: string;
  icon?: ComponentProps<typeof MaterialDesignIcons>['name'];
  accessibilityLabel?: string;
  onPress: PressableProps['onPress'];
  disabled?: boolean;
}

/** 아이콘·문구와 비활성화·호버·누름 상태를 같은 규칙으로 표시한다. */
export function SecondaryButton({ label, icon, accessibilityLabel, onPress, disabled = false }: SecondaryButtonProps) {
  return (
    <FeedbackPressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={styles.button}>
      {icon ? <MaterialDesignIcons name={icon} size={15} color={colors.text} accessible={false} style={styles.content} /> : null}
      <Text style={[styles.label, styles.content]}>{label}</Text>
    </FeedbackPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    minWidth: 52,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: 8,
  },
  // 폰트 여백에 따른 차이를 줄여 아이콘과 문구의 세로 중앙을 맞춘다.
  content: {
    lineHeight: 18,
    includeFontPadding: false,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
});
