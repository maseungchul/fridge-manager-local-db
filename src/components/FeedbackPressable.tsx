/**
 * @file
 * FeedbackPressable은 버튼·선택 영역의 호버·누름·비활성화 효과를 공통으로 처리한다.
 * 배치와 선택 상태는 호출자가 정하고, 역할에 따른 배경색만 여기서 적용한다.
 * 설명을 요청한 아이콘 버튼에는 길게 누를 때 공통 말풍선을 표시한다.
 */
import { useCallback, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { PressableProps } from 'react-native';
import { createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { ButtonTooltip } from '@/components/ButtonTooltip';
import type { TooltipAnchor } from '@/components/ButtonTooltip';

interface FeedbackPressableProps extends PressableProps {
  feedback?: 'primary' | 'default' | 'danger' | 'chilled';
  // 일시적인 입력 차단은 비활성화 색상 없이 처리한다.
  interactionBlocked?: boolean;
  // 아이콘 버튼에서만 요청하며, true이면 기존 접근성 이름을 설명으로 사용한다.
  tooltip?: boolean | string;
  tooltipGap?: number;
}

/** 마우스 호버와 터치 누름에 같은 색상을 적용하며, 비활성화 중에는 효과를 막는다. */
export function FeedbackPressable({ feedback = 'default', disabled, interactionBlocked = false, tooltip, tooltipGap, style, onHoverIn, onHoverOut,
  onLongPress, onPress, onPressIn, ...props }: FeedbackPressableProps) {
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  const [hovered, setHovered] = useState(false);
  const button = useRef<ComponentRef<typeof Pressable>>(null);
  const longPressed = useRef(false);
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);
  const dismissTooltip = useCallback(() => setAnchor(null), []);
  const tooltipLabel = typeof tooltip === 'string' ? tooltip : tooltip ? props.accessibilityLabel : undefined;
  const isDisabled = disabled || interactionBlocked;
  if (isDisabled && anchor) setAnchor(null);

  return (
    <>
      <Pressable {...props} ref={button} disabled={isDisabled}
        delayLongPress={tooltipLabel ? 400 : props.delayLongPress}
        onPressIn={event => { longPressed.current = false; onPressIn?.(event); }}
        onPress={event => { if (!longPressed.current) onPress?.(event); }}
        onLongPress={tooltipLabel ? event => {
          longPressed.current = true;
          button.current?.measureInWindow((x, y, width, height) => {
            if (width > 0 && height > 0) setAnchor({ x, y, width, height });
          });
          onLongPress?.(event);
        } : onLongPress}
        onHoverIn={event => { setHovered(true); onHoverIn?.(event); }}
        onHoverOut={event => { setHovered(false); onHoverOut?.(event); }}
        style={state => [
          typeof style === 'function' ? style(state) : style,
          disabled && styles.disabled,
          !isDisabled && (state.pressed || hovered) && styles[feedback],
        ]} />
      {anchor && tooltipLabel && !isDisabled ? <ButtonTooltip anchor={anchor} label={tooltipLabel} gap={tooltipGap} onDismiss={dismissTooltip} /> : null}
    </>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  primary: { backgroundColor: colors.buttonPressed },
  chilled: { backgroundColor: colors.chilledPressed },
  default: { backgroundColor: colors.sageLight },
  danger: { backgroundColor: colors.rose },
  disabled: { opacity: 0.42 },
}));
