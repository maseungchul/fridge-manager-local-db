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
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useTranslation } from '@/i18n/LanguageProvider';

interface IngredientExpirationCalendarProps {
  value: string | null;
  disabled?: boolean;
  onSelect: (date: string) => void;
  onDismiss: () => void;
}

const weekdayKeys = ['date.sunday', 'date.monday', 'date.tuesday', 'date.wednesday', 'date.thursday', 'date.friday', 'date.saturday'] as const;
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
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const weekdays = weekdayKeys.map(key => t(key));
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
  const calendarCellCount = Math.ceil((firstWeekday + dayCount) / 7) * 7;
  const previousDisabled = disabled || (view === 'days' ? month.year === MIN_YEAR && month.month === 0
    : view === 'months' ? month.year === MIN_YEAR : yearStart === MIN_YEAR);
  const nextDisabled = disabled || (view === 'days' ? month.year === MAX_YEAR && month.month === 11
    : view === 'months' ? month.year === MAX_YEAR : yearStart + 12 > MAX_YEAR);
  const period = view === 'days' ? t('date.yearMonth', { year: month.year, month: month.month + 1 })
    : view === 'months' ? t('date.year', { year: month.year }) : t('date.year', { year: `${yearStart}–${Math.min(yearStart + 11, MAX_YEAR)}` });

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
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={t('calendar.close')}
          onPress={() => closeCalendar()} />
        <View style={styles.popup}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <FeedbackPressable iconFeedback accessibilityRole="button"
                accessibilityLabel={view === 'days' ? t('calendar.previousMonth') : view === 'months' ? t('calendar.previousYear') : t('calendar.previousYears')}
                accessibilityState={{ disabled: previousDisabled }} disabled={previousDisabled}
                onPress={() => changePeriod(-1)} style={[styles.iconButton, styles.previousButton]}>
                <MaterialDesignIcons name="chevron-left" size={24} color={colors.text} accessible={false} />
              </FeedbackPressable>
              {view === 'years' ? <Text accessibilityRole="header" style={styles.period}>{period}</Text> : (
                <FeedbackPressable accessibilityRole="button" accessibilityLabel={view === 'days' ? t('calendar.selectYearMonth') : t('calendar.selectYear')}
                  accessibilityValue={{ text: period }} disabled={disabled} accessibilityState={{ disabled }}
                  onPress={() => { if (!disabled && !closed.current) setView(view === 'days' ? 'months' : 'years'); }} style={styles.periodButton}>
                  <Text style={styles.periodText} maxFontSizeMultiplier={1.2}>{period}</Text>
                  <MaterialDesignIcons name="chevron-down" size={18} color={colors.text} accessible={false} />
                </FeedbackPressable>
              )}
              <FeedbackPressable iconFeedback accessibilityRole="button"
                accessibilityLabel={view === 'days' ? t('calendar.nextMonth') : view === 'months' ? t('calendar.nextYear') : t('calendar.nextYears')}
                accessibilityState={{ disabled: nextDisabled }} disabled={nextDisabled}
                onPress={() => changePeriod(1)} style={[styles.iconButton, styles.nextButton]}>
                <MaterialDesignIcons name="chevron-right" size={24} color={colors.text} accessible={false} />
              </FeedbackPressable>
            </View>
            {view === 'days' ? (
              <View>
                <View style={styles.weekdays} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {weekdays.map((day, index) => <Text key={day} style={[styles.weekday,
                    index === 0 && styles.sunday, index === 6 && styles.saturday]} maxFontSizeMultiplier={1.2}>{day}</Text>)}
                </View>
                <View style={styles.grid}>
                  {Array.from({ length: calendarCellCount }, (_, index) => {
                    const day = index - firstWeekday + 1;
                    if (day < 1 || (day > dayCount && month.year === MAX_YEAR && month.month === 11)) {
                      return <View key={index} style={styles.dayCell} />;
                    }
                    const nextMonth = day > dayCount;
                    const cellDate = nextMonth ? getCalendarDate(month.year, month.month, day) : null;
                    const year = cellDate?.getFullYear() ?? month.year;
                    const monthIndex = cellDate?.getMonth() ?? month.month;
                    const dayOfMonth = cellDate?.getDate() ?? day;
                    const date = formatCalendarDate(year, monthIndex, dayOfMonth);
                    const selected = value === date;
                    const isToday = todayDate === date;
                    return (
                      <View key={index} style={styles.dayCell}>
                        <FeedbackPressable accessibilityRole="button"
                          accessibilityLabel={`${t('date.full', { year, month: monthIndex + 1, day: dayOfMonth })}${isToday ? t('calendar.today') : ''}`}
                          accessibilityState={{ selected, disabled }} disabled={disabled} style={styles.dayButton}
                          onPress={() => closeCalendar(date)}>
                          <View style={[styles.dayNumber, isToday && styles.today, selected && styles.selected]}>
                            <Text maxFontSizeMultiplier={1.3} style={[styles.dayText, index % 7 === 0 && styles.sunday,
                              index % 7 === 6 && styles.saturday, nextMonth && styles.adjacentMonth, selected && styles.selectedText]}>{dayOfMonth}</Text>
                          </View>
                        </FeedbackPressable>
                      </View>
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
                      accessibilityLabel={view === 'years' ? t('calendar.selectYearLabel', { year }) : t('calendar.selectMonthLabel', { year, month: index + 1 })}
                      accessibilityState={{ selected, disabled }} disabled={disabled} style={styles.periodCell}
                      onPress={() => {
                        if (disabled || closed.current) return;
                        setMonth(current => view === 'years' ? { ...current, year } : { ...current, month: index });
                        setView(view === 'years' ? 'months' : 'days');
                      }}>
                      <View style={[styles.periodNumber, selected && styles.selected]}>
                        <Text style={[styles.dayText, selected && styles.selectedText]} maxFontSizeMultiplier={1.2}>
                          {view === 'years' ? t('date.year', { year }) : t('date.month', { month: index + 1 })}
                        </Text>
                      </View>
                    </FeedbackPressable>
                  );
                })}
              </View>
            )}
            <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('calendar.selectToday')}
              accessibilityState={{ disabled }} disabled={disabled} style={styles.todayButton}
              onPress={() => {
                const date = new Date();
                closeCalendar(formatCalendarDate(date.getFullYear(), date.getMonth(), date.getDate()));
              }}>
              <MaterialDesignIcons name="calendar-today" size={18} color={colors.chilled} accessible={false} />
              <Text style={styles.todayButtonLabel}>{t('calendar.selectToday')}</Text>
            </FeedbackPressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  popup: { width: '100%', maxWidth: 360, maxHeight: '100%', borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  previousButton: { marginLeft: -10 },
  nextButton: { marginRight: -10 },
  periodButton: { flex: 1, minHeight: 44, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  period: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  periodText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  todayButton: { minHeight: 44, paddingHorizontal: spacing.md, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: 22 },
  todayButtonLabel: { color: colors.chilled, fontSize: 14, fontWeight: '600' },
  weekdays: { flexDirection: 'row', height: 24, marginTop: spacing.sm, alignItems: 'center' },
  weekday: { width: `${100 / 7}%`, color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  dayButton: { width: '100%', maxWidth: 44, aspectRatio: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dayNumber: { width: '100%', maxWidth: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayText: { color: colors.text, fontSize: 16, fontVariant: ['tabular-nums'] },
  today: { borderWidth: 1, borderColor: colors.chilled },
  selected: { backgroundColor: colors.chilledFill },
  selectedText: { color: colors.buttonText, fontWeight: '600' },
  sunday: { color: colors.error },
  saturday: { color: colors.frozen },
  adjacentMonth: { color: colors.textMuted },
  periodCell: { width: `${100 / 3}%`, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  periodNumber: { minHeight: 40, paddingHorizontal: spacing.sm, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
}));
