/**
 * @file
 * ToggleSwitch는 앱 테마에 맞춰 켜짐·꺼짐 상태를 표시한다.
 * 값과 변경 처리는 호출자가 관리한다.
 */
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { interpolateColor, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { useAppTheme } from '@/theme/ThemeProvider';

interface ToggleSwitchProps {
  accessibilityLabel: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}

const TRACK_WIDTH = 42;
const TRACK_HEIGHT = 24;
const THUMB_INSET = 3;
const THUMB_SIZE = TRACK_HEIGHT - THUMB_INSET * 2;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;

export function ToggleSwitch({ accessibilityLabel, value, disabled = false, onValueChange }: ToggleSwitchProps) {
  const { colors } = useAppTheme();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.set(withTiming(value ? 1 : 0, { duration: 160, reduceMotion: ReduceMotion.System }));
  }, [progress, value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [colors.border, colors.chilled]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.get() * THUMB_TRAVEL }],
  }));

  return (
    <FeedbackPressable accessibilityRole="switch" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }} disabled={disabled}
      hitSlop={{ top: 2, bottom: 2 }}
      onPress={() => onValueChange(!value)} style={styles.touchTarget}>
      <Animated.View pointerEvents="none" style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, { backgroundColor: colors.surface }, thumbStyle]} />
      </Animated.View>
    </FeedbackPressable>
  );
}

const styles = StyleSheet.create({
  touchTarget: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  track: { width: TRACK_WIDTH, height: TRACK_HEIGHT, padding: THUMB_INSET, borderRadius: TRACK_HEIGHT / 2 },
  thumb: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2 },
});
