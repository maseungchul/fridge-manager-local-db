/**
 * @file
 * FeedbackPressable은 버튼·선택 영역의 호버·누름·비활성화 효과를 공통으로 처리한다.
 * 배치와 선택 상태는 호출자가 정하고, 역할에 따른 배경색만 여기서 적용한다.
 */
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { PressableProps } from 'react-native';
import { colors } from '@/theme/tokens';

interface FeedbackPressableProps extends PressableProps {
  feedback?: 'primary' | 'default' | 'danger';
  // 일시적인 입력 차단은 비활성화 색상 없이 처리한다.
  interactionBlocked?: boolean;
}

/** 마우스 호버와 터치 누름에 같은 색상을 적용하며, 비활성화 중에는 효과를 막는다. */
export function FeedbackPressable({ feedback = 'default', disabled, interactionBlocked = false, style, onHoverIn, onHoverOut, ...props }: FeedbackPressableProps) {
  const [hovered, setHovered] = useState(false);
  const isDisabled = disabled || interactionBlocked;

  return (
    <Pressable {...props} disabled={isDisabled}
      onHoverIn={event => { setHovered(true); onHoverIn?.(event); }}
      onHoverOut={event => { setHovered(false); onHoverOut?.(event); }}
      style={state => [
        typeof style === 'function' ? style(state) : style,
        disabled && styles.disabled,
        !isDisabled && (state.pressed || hovered) && styles[feedback],
      ]} />
  );
}

const styles = StyleSheet.create({
  primary: { backgroundColor: colors.buttonPressed },
  default: { backgroundColor: colors.sageLight },
  danger: { backgroundColor: colors.rose },
  disabled: { opacity: 0.42 },
});
