/**
 * @file
 * 재료 유통기한의 네이티브 달력을 입력 버튼에 맞춘 팝업으로 표시한다.
 * 선택값은 즉시 전달하고, 달력 레이어의 페이드가 끝난 뒤 종료를 알린다.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, useAnimatedValue, useWindowDimensions, View } from 'react-native';
import type { LayoutRectangle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IngredientExpirationDatePicker } from '@/features/ingredient/components/IngredientExpirationDatePicker';
import { colors, spacing } from '@/theme/tokens';

interface IngredientExpirationCalendarProps {
  value: string | null;
  anchor: LayoutRectangle;
  disabled?: boolean;
  onSelect: (date: string) => void;
  onDismiss: () => void;
}

const CALENDAR_FADE_DURATION = 140;

/** 현지 날짜를 유지해 UTC 변환으로 유통기한이 앞뒤로 바뀌지 않게 한다. */
function formatCalendarDate(date: Date) {
  return [String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function IngredientExpirationCalendar({ value, anchor, disabled = false, onSelect, onDismiss }: IngredientExpirationCalendarProps) {
  const [initialDate] = useState(() => value ? new Date(`${value}T12:00:00`) : new Date());
  const [calendarHeight, setCalendarHeight] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const opacity = useAnimatedValue(0);
  const dismissal = useRef<{ active: boolean; closing: boolean; completed: boolean; animation?: Animated.CompositeAnimation }>({
    active: true, closing: false, completed: false,
  });
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const popupWidth = Math.min(anchor.width, width - insets.left - insets.right - spacing.sm * 2);
  const isCalendarReady = calendarHeight > 0;
  const calendarWidth = popupWidth - spacing.sm * 2 - 2;
  const minTop = insets.top + spacing.sm;
  const maxBottom = height - insets.bottom - spacing.sm;
  const availableHeight = Math.max(0, maxBottom - minTop);
  const measuredHeight = Math.min(calendarHeight + spacing.sm * 2 + 2, availableHeight);
  const left = Math.max(insets.left + spacing.sm,
    Math.min(anchor.x, width - insets.right - spacing.sm - popupWidth));
  const below = anchor.y + anchor.height + spacing.xs;
  // 폼 하단에서도 달력이 잘리지 않도록 공간이 부족하면 버튼 위로 펼친다.
  const top = below + measuredHeight <= maxBottom ? Math.max(minTop, below)
    : Math.max(minTop, Math.min(anchor.y - spacing.xs - measuredHeight, maxBottom - measuredHeight));

  useEffect(() => {
    const currentDismissal = dismissal.current;
    currentDismissal.active = true;
    return () => {
      currentDismissal.active = false;
      currentDismissal.animation?.stop();
    };
  }, []);

  useEffect(() => {
    if (!isCalendarReady || dismissal.current.closing) return;
    const animation = Animated.timing(opacity, { toValue: 1, duration: CALENDAR_FADE_DURATION, useNativeDriver: true });
    dismissal.current.animation = animation;
    animation.start();
  }, [isCalendarReady, opacity]);

  function closeCalendar(selectedDate?: string) {
    if (!dismissal.current.active || dismissal.current.closing) return;
    dismissal.current.closing = true;
    dismissal.current.animation?.stop();
    // 같은 이벤트 묶음에 들어온 측정값도 덮어 마지막으로 표시한 크기를 유지한다.
    setCalendarHeight(calendarHeight);
    setIsClosing(true);
    if (selectedDate !== undefined) onSelect(selectedDate);
    // 모달의 표시 상태를 바꾸지 않아 UIKit 전환 중 달력이 다시 배치되는 것을 막는다.
    const animation = Animated.timing(opacity, { toValue: 0, duration: CALENDAR_FADE_DURATION, useNativeDriver: true });
    dismissal.current.animation = animation;
    animation.start(() => {
      if (!dismissal.current.active || dismissal.current.completed) return;
      dismissal.current.completed = true;
      onDismiss();
    });
  }

  function updateCalendarHeight(height: number) {
    if (!dismissal.current.closing) setCalendarHeight(height);
  }

  return (
    <Modal transparent visible animationType="none" presentationStyle="overFullScreen"
      statusBarTranslucent navigationBarTranslucent onRequestClose={() => closeCalendar()}>
      <Animated.View style={[styles.overlay, { opacity }]} accessibilityViewIsModal onAccessibilityEscape={() => closeCalendar()}
        pointerEvents={isClosing ? 'none' : 'auto'}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="유통기한 달력 닫기"
          onPress={() => closeCalendar()} />
        <View style={[styles.popup, { left, top, width: popupWidth, maxWidth: popupWidth,
          height: isCalendarReady ? measuredHeight : undefined, maxHeight: availableHeight, opacity: isCalendarReady ? 1 : 0 }]}>
          <ScrollView style={{ flexGrow: 0, maxHeight: Math.max(0, availableHeight - 2) }}
            contentContainerStyle={styles.calendar} bounces={false} keyboardShouldPersistTaps="handled">
            <View style={{ width: calendarWidth }}
              onLayout={Platform.OS === 'ios' ? undefined : ({ nativeEvent }) => updateCalendarHeight(nativeEvent.layout.height)}>
              <IngredientExpirationDatePicker value={initialDate} width={calendarWidth} disabled={disabled}
                layoutFrozen={isClosing} onContentHeight={updateCalendarHeight}
                onChange={date => {
                  if (disabled || dismissal.current.closing) return;
                  const selectedDate = formatCalendarDate(date);
                  // Material 달력은 열릴 때도 현재 선택값을 전달하므로 사용자 변경과 구분한다.
                  if (Platform.OS === 'android' && selectedDate === formatCalendarDate(initialDate)) return;
                  closeCalendar(selectedDate);
                }} />
            </View>
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  popup: {
    position: 'absolute', backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  calendar: { padding: spacing.sm },
});
