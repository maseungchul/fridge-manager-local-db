/**
 * @file
 * 문·칸 개수 조절에 사용하는 캡슐형 증감 버튼을 표시한다.
 * 개수와 변경 처리는 호출자가 관리하며, 터치 영역·눌림 효과는 두 화면에서 동일하게 유지한다.
 */
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { StyleSheet, Text, View } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { colors } from '@/theme/tokens';

export const QUANTITY_STEPPER_WIDTH = 128;

interface QuantityStepperProps {
  value: number;
  maximum: number;
  unit: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onChange: (delta: -1 | 1) => void;
}

/** 최소 한 개와 최대 개수에 맞춰 양쪽 버튼을 비활성화하고, 현재 개수는 고정된 가운데 영역에 표시한다. */
export function QuantityStepper({ value, maximum, unit, accessibilityLabel, disabled = false, onChange }: QuantityStepperProps) {
  return (
    <View style={styles.counter}>
      <FeedbackPressable accessibilityRole="button" accessibilityLabel={`${accessibilityLabel} 줄이기`}
        disabled={disabled || value <= 1} onPress={() => onChange(-1)} style={styles.button}>
        <MaterialDesignIcons name="minus" size={20} color={colors.text} accessible={false} />
      </FeedbackPressable>
      <Text numberOfLines={1} accessibilityLiveRegion="polite" style={styles.count}>{value}{unit}</Text>
      <FeedbackPressable accessibilityRole="button" accessibilityLabel={`${accessibilityLabel} 늘리기`}
        disabled={disabled || value >= maximum} onPress={() => onChange(1)} style={styles.button}>
        <MaterialDesignIcons name="plus" size={20} color={colors.text} accessible={false} />
      </FeedbackPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  counter: {
    flexShrink: 0,
    width: QUANTITY_STEPPER_WIDTH,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  button: {
    flexShrink: 0,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  count: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
