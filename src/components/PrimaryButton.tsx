/**
 * @file
 * PrimaryButton은 주요·보조 동작의 색상을 구분하는 공통 버튼이다.
 * 비활성화·로딩·누름 상태에 따라 표시를 바꾸고, 로딩 중에는 추가 입력을 막는다.
 * 클릭 시 처리와 로딩 상태 관리는 호출하는 화면이 담당한다.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { colors } from '@/theme/tokens';

// 버튼 문구와 클릭 처리, 표시 상태, 추가 스타일을 호출하는 쪽에서 전달한다.
interface PrimaryButtonProps {
  label: string;
  onPress: PressableProps['onPress'];
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 전달받은 상태에 맞춰 버튼 문구 또는 로딩 표시를 렌더링한다. */
export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: PrimaryButtonProps) {
  // 명시적인 비활성화뿐 아니라 처리 중인 상태에서도 중복 클릭을 막는다.
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      // 뒤의 스타일이 앞의 값을 덮어쓴다. 상태별 스타일은 호출자가 전달한 스타일보다 나중에 적용한다.
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.secondary,
        style,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        pressed && !isDisabled && variant === 'secondary' && styles.secondaryPressed,
      ]}
    >
      {/* 로딩 중에는 문구 대신 진행 표시를 보여준다. */}
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.text : colors.buttonText} />
      ) : (
        <Text style={[styles.text, variant === 'secondary' && styles.secondaryText]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 버튼 안의 문구와 로딩 표시를 중앙에 배치한다.
  button: {
    height: 54,
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
  // 비활성 상태를 흐리게 표시한다. 클릭 차단은 Pressable의 disabled가 담당한다.
  disabled: {
    opacity: 0.42,
  },
  // 누르는 동안 배경색과 크기를 바꿔 입력 피드백을 제공한다.
  pressed: {
    backgroundColor: colors.buttonPressed,
    transform: [{ scale: 0.99 }],
  },
  secondaryPressed: {
    backgroundColor: colors.background,
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
