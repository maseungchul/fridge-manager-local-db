/**
 * @file
 * 짧은 안내의 아이콘·문구와 페이드·자동 숨김을 공통으로 처리한다.
 * 표시 위치·노출 조건은 호출자가 정하고, 숨김이 끝나면 onDismiss로 안내를 정리한다.
 */
import { useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import { Animated, StyleSheet, Text, useAnimatedValue } from 'react-native';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { colors } from '@/theme/tokens';

interface ToastProps {
  message: string;
  icon: ComponentProps<typeof MaterialDesignIcons>['name'];
  duration?: number;
  accessibilityHidden?: boolean;
  onDismiss: () => void;
}

const FADE_IN_DURATION = 150;
const FADE_OUT_DURATION = 200;

export function Toast({ message, icon, duration = 2000, accessibilityHidden = false, onDismiss }: ToastProps) {
  const opacity = useAnimatedValue(0);
  const dismiss = useRef(onDismiss);
  // 부모의 노출 이력·콜백 변경으로 표시 시간을 다시 시작하지 않는다.
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    let active = true;
    let fadeOut: Animated.CompositeAnimation | undefined;
    opacity.setValue(0);
    const fadeIn = Animated.timing(opacity, { toValue: 1, duration: FADE_IN_DURATION, useNativeDriver: true });
    fadeIn.start();
    const timer = setTimeout(() => {
      fadeOut = Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_DURATION, useNativeDriver: true });
      fadeOut.start(({ finished }) => { if (active && finished) dismiss.current(); });
    }, Math.max(0, duration - FADE_OUT_DURATION));
    return () => {
      active = false;
      clearTimeout(timer);
      fadeIn.stop();
      fadeOut?.stop();
      opacity.stopAnimation();
    };
  }, [message, icon, duration, opacity]);

  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden={accessibilityHidden}
      importantForAccessibility={accessibilityHidden ? 'no-hide-descendants' : 'auto'} style={[styles.toast, { opacity }]}>
      <MaterialDesignIcons name={icon} size={20} color={colors.buttonText} accessible={false} />
      <Text style={styles.message} accessibilityRole={accessibilityHidden ? undefined : 'alert'}
        accessibilityLiveRegion={accessibilityHidden ? 'none' : 'polite'}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: { maxWidth: '90%', flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(34, 35, 31, 0.86)' },
  message: { flexShrink: 1, color: colors.buttonText, fontSize: 13, lineHeight: 18 },
});
