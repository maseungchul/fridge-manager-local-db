/**
 * @file
 * PrimaryButton은 주요·보조 동작의 색상을 구분하는 공통 버튼이다.
 * 비활성화·로딩·누름 상태에 따라 표시를 바꾸고, 로딩 중에는 추가 입력을 막는다.
 * 클릭 시 처리와 로딩 상태 관리는 호출하는 화면이 담당한다.
 */
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import type { ComponentProps } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { colors } from '@/theme/tokens';
import { FeedbackPressable } from '@/components/FeedbackPressable';

// 버튼 문구와 클릭 처리, 표시 상태, 추가 스타일을 호출하는 쪽에서 전달한다.
interface PrimaryButtonProps {
  label: string;
  icon?: ComponentProps<typeof MaterialDesignIcons>['name'];
  onPress: PressableProps['onPress'];
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 전달받은 상태에 맞춰 버튼 문구 또는 로딩 표시를 렌더링한다. */
export function PrimaryButton({
  label,
  icon,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: PrimaryButtonProps) {
  // 명시적인 비활성화뿐 아니라 처리 중인 상태에서도 중복 클릭을 막는다.
  const isDisabled = disabled || loading;

  return (
    <FeedbackPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      feedback={variant === 'primary' ? 'primary' : 'default'}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.button,
        variant === 'secondary' && styles.secondary,
        style,
      ]}
    >
      {/* 로딩 중에는 문구 대신 진행 표시를 보여준다. */}
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.text : colors.buttonText} />
      ) : (
        <>
          {icon ? <MaterialDesignIcons name={icon} size={20} color={variant === 'secondary' ? colors.text : colors.buttonText}
            accessible={false} style={styles.icon} /> : null}
          <Text style={[styles.text, variant === 'secondary' && styles.secondaryText]}>{label}</Text>
        </>
      )}
    </FeedbackPressable>
  );
}

const styles = StyleSheet.create({
  // 버튼 안의 문구와 로딩 표시를 중앙에 배치한다.
  button: {
    height: 54,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.button,
    borderRadius: 10,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    lineHeight: 22,
    includeFontPadding: false,
  },
  text: {
    color: colors.buttonText,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryText: {
    color: colors.text,
  },
});
