/**
 * @file
 * 홈 이동·범례처럼 도면 위에 떠 있는 아이콘 버튼을 표시한다.
 * iOS는 별도 네이티브 구현을 사용하며, 위치·표시 문구·동작은 호출자가 관리한다.
 */
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

export interface FloatingIconButtonProps {
  label: string;
  icon: ComponentProps<typeof MaterialDesignIcons>['name'];
  accessibilityLabel: string;
  accessibilityHint?: string;
  expanded?: boolean;
  size?: 'small' | 'large';
  disabled: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export function FloatingIconButton({ label, icon, accessibilityLabel, accessibilityHint, expanded, size = 'large', disabled, onPress, style }: FloatingIconButtonProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  return (
    <FeedbackPressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, expanded }} disabled={disabled} onPress={onPress} style={[styles.button, size === 'small' && styles.smallButton, style]}>
      <MaterialDesignIcons name={icon} size={size === 'small' ? 16 : 20} color={colors.text} accessible={false} />
      <Text style={[styles.label, size === 'small' && styles.smallLabel]}>{label}</Text>
    </FeedbackPressable>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
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
  smallButton: { height: 32, paddingHorizontal: spacing.sm, borderRadius: 16, gap: 4 },
  smallLabel: { fontSize: 12 },
}));
