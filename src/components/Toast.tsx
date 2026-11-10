/**
 * @file
 * 짧은 안내의 아이콘·문구와 페이드·자동 숨김을 공통으로 처리한다.
 * 표시 위치·노출 조건은 호출자가 정하고, 숨김이 끝나면 onDismiss로 안내를 정리한다.
 */
import { useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import { Animated, Pressable, StyleSheet, Text, useAnimatedValue } from 'react-native';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { colors } from '@/theme/tokens';

interface ToastProps {
  message: string;
  icon: ComponentProps<typeof MaterialDesignIcons>['name'];
  duration?: number;
  accessibilityHidden?: boolean;
  closeLabel?: string;
  variant?: 'default' | 'success';
  onDismiss: () => void;
}

const SUCCESS_BACKGROUND = '#173522';
const SUCCESS_FOREGROUND = '#45EF85';
const FADE_IN_DURATION = 200;
const HOLD_DURATION = 2500;
const FADE_OUT_DURATION = 200;

export function Toast({ message, icon, duration = FADE_IN_DURATION + HOLD_DURATION + FADE_OUT_DURATION, accessibilityHidden = false, closeLabel, variant = 'default', onDismiss }: ToastProps) {
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
    <Animated.View pointerEvents={closeLabel ? "box-none" : "none"} accessibilityElementsHidden={accessibilityHidden}
      importantForAccessibility={accessibilityHidden ? 'no-hide-descendants' : 'auto'} style={[styles.toast, variant === 'success' && styles.successToast, { opacity }]}>
      <MaterialDesignIcons name={icon} size={icon === 'check-circle-outline' ? 16 : 20} color={variant === 'success' ? SUCCESS_FOREGROUND : colors.buttonText} accessible={false} />
      <Text style={[styles.message, variant === 'success' && styles.successMessage]} accessibilityRole={accessibilityHidden ? undefined : 'alert'}
        accessibilityLiveRegion={accessibilityHidden ? 'none' : 'polite'}>{message}</Text>
      {closeLabel && <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onDismiss} hitSlop={8}>
        <MaterialDesignIcons name="close" size={16} color={SUCCESS_FOREGROUND} accessible={false} />
      </Pressable>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: { maxWidth: '90%', flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(34, 35, 31, 0.86)' },
  successToast: { backgroundColor: SUCCESS_BACKGROUND, borderWidth: 1, borderColor: SUCCESS_FOREGROUND },
  successMessage: { color: SUCCESS_FOREGROUND, fontWeight: '600' },
  message: { flexShrink: 1, color: colors.buttonText, fontSize: 13, lineHeight: 18 },
});




