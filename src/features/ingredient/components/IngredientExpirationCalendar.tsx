/**
 * @file
 * 재료 유통기한의 네이티브 달력을 입력 버튼에 맞춘 팝업으로 표시한다.
 * Android의 초기값 알림은 제외하며, 팝업 종료와 선택값 저장은 호출자가 관리한다.
 */
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
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

const IOS_CALENDAR_LAYOUT_HEIGHT = 300;

/** 현지 날짜를 유지해 UTC 변환으로 유통기한이 앞뒤로 바뀌지 않게 한다. */
function formatCalendarDate(date: Date) {
  return [String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function IngredientExpirationCalendar({ value, anchor, disabled = false, onSelect, onDismiss }: IngredientExpirationCalendarProps) {
  const [initialDate] = useState(() => value ? new Date(`${value}T12:00:00`) : new Date());
  const [calendarHeight, setCalendarHeight] = useState(0);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const popupWidth = Math.min(anchor.width, width - insets.left - insets.right - spacing.sm * 2);
  const calendarScale = Platform.OS === 'ios' ? 0.8 : 1;
  // iOS의 레이아웃 제약은 유지하되 팝업은 정렬 여백을 제외한 달력 내용만 감싼다.
  const nativeCalendarHeight = Platform.OS === 'ios' ? IOS_CALENDAR_LAYOUT_HEIGHT / calendarScale : undefined;
  const contentHeight = calendarHeight * calendarScale;
  const isCalendarReady = calendarHeight > 0;
  const calendarWidth = popupWidth - spacing.sm * 2 - 2;
  const nativeCalendarWidth = calendarWidth / calendarScale;
  const minTop = insets.top + spacing.sm;
  const maxBottom = height - insets.bottom - spacing.sm;
  const availableHeight = Math.max(0, maxBottom - minTop);
  const measuredHeight = Math.min(contentHeight + spacing.sm * 2 + 2, availableHeight);
  const left = Math.max(insets.left + spacing.sm,
    Math.min(anchor.x, width - insets.right - spacing.sm - popupWidth));
  const below = anchor.y + anchor.height + spacing.xs;
  // 폼 하단에서도 달력이 잘리지 않도록 공간이 부족하면 버튼 위로 펼친다.
  const top = below + measuredHeight <= maxBottom ? Math.max(minTop, below)
    : Math.max(minTop, Math.min(anchor.y - spacing.xs - measuredHeight, maxBottom - measuredHeight));

  return (
    <Modal transparent visible animationType="fade" presentationStyle="overFullScreen"
      statusBarTranslucent navigationBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.overlay} accessibilityViewIsModal onAccessibilityEscape={onDismiss}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="유통기한 달력 닫기" onPress={onDismiss} />
        <View style={[styles.popup, { left, top, width: popupWidth, maxWidth: popupWidth,
          height: isCalendarReady ? measuredHeight : undefined, maxHeight: availableHeight, opacity: isCalendarReady ? 1 : 0 }]}>
          <ScrollView style={{ flexGrow: 0, maxHeight: Math.max(0, availableHeight - 2) }}
            contentContainerStyle={styles.calendar} bounces={false} keyboardShouldPersistTaps="handled">
            {/* 기본 글꼴을 직접 바꿀 수 없는 iOS 달력은 표시 배율과 차지하는 높이를 함께 줄인다. */}
            <View style={{ width: calendarWidth, height: isCalendarReady ? contentHeight : undefined }}>
              <View style={{ width: nativeCalendarWidth,
                height: nativeCalendarHeight === undefined ? undefined : Math.max(nativeCalendarHeight, calendarHeight),
                transform: [{ scale: calendarScale }], transformOrigin: 'top left' }}
                onLayout={Platform.OS === 'ios' ? undefined : ({ nativeEvent }) => setCalendarHeight(nativeEvent.layout.height)}>
                <IngredientExpirationDatePicker value={initialDate} width={nativeCalendarWidth} height={nativeCalendarHeight} disabled={disabled}
                  onContentHeight={setCalendarHeight}
                  onChange={date => {
                    if (disabled) return;
                    const selectedDate = formatCalendarDate(date);
                    // Material 달력은 열릴 때도 현재 선택값을 전달하므로 사용자 변경과 구분한다.
                    if (Platform.OS === 'android' && selectedDate === formatCalendarDate(initialDate)) return;
                    onSelect(selectedDate);
                  }} />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
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
