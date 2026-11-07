/**
 * @file
 * 재료 유통기한을 선택하는 공통 달력을 화면 중앙의 팝업으로 표시한다.
 * 오늘 표시와 실제 선택값을 구분하고, 날짜를 누르면 즉시 입력에 반영한 뒤 닫는다.
 */
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { colors, spacing } from '@/theme/tokens';

interface IngredientExpirationCalendarProps {
  value: string | null;
  disabled?: boolean;
  onSelect: (date: string) => void;
  onDismiss: () => void;
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const MIN_YEAR = 1;
const MAX_YEAR = 9999;

/** 현지 날짜를 사용하고 0~99년을 1900년대로 바꾸는 Date 생성자 보정을 피한다. */
function getCalendarDate(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

function formatCalendarDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function IngredientExpirationCalendar({ value, disabled = false, onSelect, onDismiss }: IngredientExpirationCalendarProps) {
  const [month, setMonth] = useState(() => {
    const date = value ? new Date(`${value}T12:00:00`) : new Date();
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  const closed = useRef(false);
  const insets = useSafeAreaInsets();
  const today = new Date();
  const todayDate = formatCalendarDate(today.getFullYear(), today.getMonth(), today.getDate());
  const yearStart = Math.floor((month.year - 1) / 12) * 12 + 1;
  const firstWeekday = getCalendarDate(month.year, month.month, 1).getDay();
  const dayCount = getCalendarDate(month.year, month.month + 1, 0).getDate();
  const previousDisabled = disabled || (view === 'days' ? month.year === MIN_YEAR && month.month === 0
    : view === 'months' ? month.year === MIN_YEAR : yearStart === MIN_YEAR);
  const nextDisabled = disabled || (view === 'days' ? month.year === MAX_YEAR && month.month === 11
    : view === 'months' ? month.year === MAX_YEAR : yearStart + 12 > MAX_YEAR);
  const period = view === 'days' ? `${month.year}년 ${month.month + 1}월`
    : view === 'months' ? `${month.year}년` : `${yearStart}–${Math.min(yearStart + 11, MAX_YEAR)}년`;

  useEffect(() => {
    closed.current = false;
    return () => { closed.current = true; };
  }, []);

  function closeCalendar(date?: string) {
    if (closed.current || date !== undefined && disabled) return;
    closed.current = true;
    if (date !== undefined) onSelect(date);
    onDismiss();
  }

  function changePeriod(direction: -1 | 1) {
    if (closed.current || (direction === -1 ? previousDisabled : nextDisabled)) return;
    setMonth(current => {
      if (view !== 'days') return { ...current, year: Math.max(MIN_YEAR, Math.min(MAX_YEAR,
        current.year + direction * (view === 'years' ? 12 : 1))) };
      const date = getCalendarDate(current.year, current.month + direction, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }

  return (
    <Modal transparent visible animationType="fade" presentationStyle="overFullScreen"
      statusBarTranslucent navigationBarTranslucent onRequestClose={() => closeCalendar()}>
      <View style={[styles.overlay, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md,
        paddingLeft: insets.left + spacing.md, paddingRight: insets.right + spacing.md }]}
        accessibilityViewIsModal onAccessibilityEscape={() => closeCalendar()}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="유통기한 달력 닫기"
          onPress={() => closeCalendar()} />
        <View style={styles.popup}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>유통기한 선택</Text>
              <FeedbackPressable accessibilityRole="button" accessibilityLabel="유통기한 달력 닫기 버튼"
                onPress={() => closeCalendar()} style={styles.iconButton}>
                <MaterialDesignIcons name="close" size={22} color={colors.textMuted} accessible={false} />
              </FeedbackPressable>
            </View>
            <View style={styles.header}>
              <FeedbackPressable accessibilityRole="button"
                accessibilityLabel={view === 'days' ? '이전 달' : view === 'months' ? '이전 연도' : '이전 연도 묶음'}
                accessibilityState={{ disabled: previousDisabled }} disabled={previousDisabled}
                onPress={() => changePeriod(-1)} style={styles.iconButton}>
                <MaterialDesignIcons name="chevron-left" size={24} color={colors.chilled} accessible={false} />
              </FeedbackPressable>
              {view === 'years' ? <Text accessibilityRole="header" style={styles.period}>{period}</Text> : (
                <FeedbackPressable accessibilityRole="button" accessibilityLabel={view === 'days' ? '연도·월 선택' : '연도 선택'}
                  accessibilityValue={{ text: period }} disabled={disabled} accessibilityState={{ disabled }}
                  onPress={() => { if (!disabled && !closed.current) setView(view === 'days' ? 'months' : 'years'); }} style={styles.periodButton}>
                  <Text style={styles.periodText} maxFontSizeMultiplier={1.2}>{period}</Text>
                  <MaterialDesignIcons name="chevron-down" size={18} color={colors.chilled} accessible={false} />
                </FeedbackPressable>
              )}
              <FeedbackPressable accessibilityRole="button"
                accessibilityLabel={view === 'days' ? '다음 달' : view === 'months' ? '다음 연도' : '다음 연도 묶음'}
                accessibilityState={{ disabled: nextDisabled }} disabled={nextDisabled}
                onPress={() => changePeriod(1)} style={styles.iconButton}>
                <MaterialDesignIcons name="chevron-right" size={24} color={colors.chilled} accessible={false} />
              </FeedbackPressable>
            </View>
            {view === 'days' ? (
              <View>
                <View style={styles.weekdays} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {weekdays.map((day, index) => <Text key={day} style={[styles.weekday,
                    index === 0 && styles.sunday, index === 6 && styles.saturday]} maxFontSizeMultiplier={1.2}>{day}</Text>)}
                </View>
                {/* 여섯 주를 유지해 월을 바꿔도 달력 높이와 버튼 위치가 움직이지 않게 한다. */}
                <View style={styles.grid}>
                  {Array.from({ length: 42 }, (_, index) => {
                    const day = index - firstWeekday + 1;
                    if (day < 1 || day > dayCount) return <View key={index} style={styles.dayCell} />;
                    const date = formatCalendarDate(month.year, month.month, day);
                    const selected = value === date;
                    const isToday = todayDate === date;
                    return (
                      <FeedbackPressable key={index} accessibilityRole="button"
                        accessibilityLabel={`${month.year}년 ${month.month + 1}월 ${day}일${isToday ? ', 오늘' : ''}`}
                        accessibilityState={{ selected, disabled }} disabled={disabled} style={styles.dayCell}
                        onPress={() => closeCalendar(date)}>
                        <View style={[styles.dayNumber, isToday && styles.today, selected && styles.selected]}>
                          <Text maxFontSizeMultiplier={1.3} style={[styles.dayText, index % 7 === 0 && styles.sunday,
                            index % 7 === 6 && styles.saturday, selected && styles.selectedText]}>{day}</Text>
                        </View>
                      </FeedbackPressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.grid}>
                {Array.from({ length: 12 }, (_, index) => {
                  const year = view === 'years' ? yearStart + index : month.year;
                  if (year > MAX_YEAR) return <View key={index} style={styles.periodCell} />;
                  const selected = value !== null && (view === 'years'
                    ? Number(value.slice(0, 4)) === year
                    : Number(value.slice(0, 4)) === year && Number(value.slice(5, 7)) === index + 1);
                  return (
                    <FeedbackPressable key={index} accessibilityRole="button"
                      accessibilityLabel={view === 'years' ? `${year}년 선택` : `${year}년 ${index + 1}월 선택`}
                      accessibilityState={{ selected, disabled }} disabled={disabled} style={styles.periodCell}
                      onPress={() => {
                        if (disabled || closed.current) return;
                        setMonth(current => view === 'years' ? { ...current, year } : { ...current, month: index });
                        setView(view === 'years' ? 'months' : 'days');
                      }}>
                      <View style={[styles.periodNumber, selected && styles.selected]}>
                        <Text style={[styles.dayText, selected && styles.selectedText]} maxFontSizeMultiplier={1.2}>
                          {view === 'years' ? `${year}년` : `${index + 1}월`}
                        </Text>
                      </View>
                    </FeedbackPressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  popup: { width: '100%', maxWidth: 360, maxHeight: '100%', borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '700' },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  periodButton: { flex: 1, minHeight: 44, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  period: { flex: 1, color: colors.chilled, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  periodText: { color: colors.chilled, fontSize: 17, fontWeight: '600' },
  weekdays: { flexDirection: 'row', height: 24, alignItems: 'center' },
  weekday: { width: `${100 / 7}%`, color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  dayNumber: { width: '100%', maxWidth: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayText: { color: colors.text, fontSize: 16, fontVariant: ['tabular-nums'] },
  today: { borderWidth: 1, borderColor: colors.chilled },
  selected: { backgroundColor: colors.chilled },
  selectedText: { color: colors.buttonText, fontWeight: '600' },
  sunday: { color: colors.error },
  saturday: { color: colors.frozen },
  periodCell: { width: `${100 / 3}%`, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  periodNumber: { minHeight: 40, paddingHorizontal: spacing.sm, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
