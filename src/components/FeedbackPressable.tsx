/**
 * @file
 * FeedbackPressable은 버튼·선택 영역의 호버·누름·비활성화 효과를 공통으로 처리한다.
 * 배치와 선택 상태는 호출자가 정하고, 버튼 종류에 따라 배경 또는 아이콘 색상을 적용한다.
 */
import { Children, cloneElement, isValidElement, useState } from 'react';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { PressableProps } from 'react-native';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

interface FeedbackPressableProps extends PressableProps {
  feedback?: 'primary' | 'default' | 'danger' | 'chilled' | 'none';
  // 아이콘 전용 버튼은 배경 대신 아이콘 색상으로 누름 상태를 표시한다.
  iconFeedback?: boolean;
  // 일시적인 입력 차단은 비활성화 색상 없이 처리한다.
  interactionBlocked?: boolean;
}

/** 마우스 호버와 터치 누름에 같은 색상을 적용하며, 비활성화 중에는 효과를 막는다. */
export function FeedbackPressable({ feedback = 'default', iconFeedback = false, children, disabled, interactionBlocked = false, style, onHoverIn, onHoverOut,
  ...props }: FeedbackPressableProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const [hovered, setHovered] = useState(false);
  const isDisabled = disabled || interactionBlocked;

  return (
    <>
      <Pressable {...props} disabled={isDisabled}
        onHoverIn={event => { setHovered(true); onHoverIn?.(event); }}
        onHoverOut={event => { setHovered(false); onHoverOut?.(event); }}
        style={state => [
          typeof style === 'function' ? style(state) : style,
          disabled && styles.disabled,
          !iconFeedback && !isDisabled && (state.pressed || hovered) && styles[feedback],
        ]}>
        {iconFeedback ? state => {
          const content = typeof children === 'function' ? children(state) : children;
          return Children.map(content, child =>
            isValidElement<ComponentProps<typeof MaterialDesignIcons>>(child) && child.type === MaterialDesignIcons
              ? cloneElement(child, {
                pointerEvents: 'none',
                color: !isDisabled && (state.pressed || hovered)
                  ? feedback === 'danger' ? colors.errorPressed : colors.iconPressed
                  : child.props.color,
              })
              : child);
        } : children}
      </Pressable>
    </>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  primary: { backgroundColor: colors.buttonPressed },
  chilled: { backgroundColor: colors.chilledPressed },
  default: { backgroundColor: colors.sageLight },
  danger: { backgroundColor: colors.rose },
  none: {},
  disabled: { opacity: 0.42 },
}));
