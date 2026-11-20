/**
 * @file
 * 간격을 지정할 수 있는 24시간제 순환 휠을 표시하고 선택한 시각을 자정 기준 분으로 반환한다.
 */
import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { CenteredPickerPopup } from '@/components/CenteredPickerPopup';
import { useTranslation } from '@/i18n/LanguageProvider';
import { useAppTheme } from '@/theme/ThemeProvider';
import { createThemedStyles, spacing } from '@/theme/tokens';

interface TimePickerProps {
  minutes: number;
  minuteInterval?: 1 | 5 | 10;
  saving: boolean;
  onSave: (minutes: number) => Promise<void>;
  onDismiss: () => void;
}

interface TimeWheelProps {
  side: 'left' | 'right';
  label: string;
  value: number;
  wheel: ReturnType<typeof createWheel>;
  step?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

const ROW_HEIGHT = 44;
const SIDE_ROWS = 2;
const CENTER_PADDING = ROW_HEIGHT * SIDE_ROWS;
const HEADER_HEIGHT = spacing.md + 24 + spacing.xs;
const FOOTER_HEIGHT = spacing.md;
const WHEEL_COPIES = 11;

function createWheel(optionCount: number) {
  const offsets = Array.from({ length: optionCount * WHEEL_COPIES }, (_, index) => index * ROW_HEIGHT);
  return { optionCount, offsets, middleIndex: optionCount * Math.floor(WHEEL_COPIES / 2) };
}

const HOUR_WHEEL = createWheel(24);
const MINUTE_WHEELS = { 1: createWheel(60), 5: createWheel(12), 10: createWheel(6) };

export function TimePicker({ minutes, minuteInterval = 1, saving, onSave, onDismiss }: TimePickerProps) {
  const { t } = useTranslation();
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  const [hour, setHour] = useState(() => Math.floor(minutes / 60));
  const [minute, setMinute] = useState(() => minutes % 60);
  const minuteIndex = Math.floor(minute / minuteInterval);
  const [edited, setEdited] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempted = useRef<number | undefined>(undefined);
  const selected = hour * 60 + minuteIndex * minuteInterval;
  const shouldSave = edited && selected !== minutes;

  useEffect(() => {
    if (!shouldSave || saving || attempted.current === selected) return;
    // 휠이 움직이는 동안 중간값마다 알림을 다시 예약하지 않게 한다.
    timer.current = setTimeout(() => {
      attempted.current = selected;
      void onSave(selected);
    }, 350);
    return () => clearTimeout(timer.current);
  }, [onSave, saving, selected, shouldSave]);

  async function dismiss() {
    clearTimeout(timer.current);
    if (shouldSave) await onSave(selected);
    onDismiss();
  }

  return (
    <CenteredPickerPopup dismissLabel={t('timePicker.close')} dismissDisabled={saving} edgeToEdge onDismiss={() => void dismiss()}>
      <View style={styles.wheels}>
        <View pointerEvents="none" style={styles.selectionBand} />
        <TimeWheel side="left" label={t('timePicker.hour')} value={hour} wheel={HOUR_WHEEL} disabled={saving}
          onChange={value => { if (value !== hour) { attempted.current = undefined; setEdited(true); } setHour(value); }} />
        <TimeWheel key={minuteInterval} side="right" label={t('timePicker.minute')} value={minuteIndex} wheel={MINUTE_WHEELS[minuteInterval]}
          step={minuteInterval} disabled={saving}
          onChange={index => { if (index !== minuteIndex) { attempted.current = undefined; setEdited(true); } setMinute(index * minuteInterval); }} />
        <View pointerEvents="none" style={styles.separator} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.separatorDot} />
          <View style={styles.separatorDot} />
        </View>
        <View pointerEvents="none" style={styles.footer} />
      </View>
    </CenteredPickerPopup>
  );
}

function TimeWheel({ side, label, value, wheel: { offsets, optionCount, middleIndex }, step = 1, disabled, onChange }: TimeWheelProps) {
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // 일반 렌더링에서 contentOffset을 다시 설정하면 사용자가 굴리는 도중 위치가 돌아간다.
  const [initialOffset] = useState(() => ({ x: 0, y: offsets[middleIndex + value] }));
  const activeIndex = useRef(middleIndex + value);
  const lastIndex = offsets.length - 1;

  function updateIndex(index: number) {
    activeIndex.current = index;
    onChange(index % optionCount);
  }

  function select(index: number) {
    if (disabled) return;
    const option = (index % optionCount + optionCount) % optionCount;
    const target = middleIndex + option;
    updateIndex(target);
    scroll.current?.scrollTo({ y: offsets[target], animated: false });
  }

  function trackPosition(event: NativeSyntheticEvent<NativeScrollEvent>, settled = false) {
    if (disabled) return;
    const index = Math.max(0, Math.min(lastIndex, Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT)));
    // 같은 값이 놓인 가운데 묶음으로 옮겨도 선택과 주변 숫자의 순서가 유지된다.
    if (index <= SIDE_ROWS || index >= lastIndex - SIDE_ROWS
      || (settled && (index < middleIndex || index >= middleIndex + optionCount))) {
      select(index);
    } else {
      updateIndex(index);
    }
  }

  return (
    <View style={styles.column} accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityState={{ disabled }} accessibilityValue={{ text: String(value * step).padStart(2, '0') }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => {
        const action = event.nativeEvent.actionName;
        if (action === 'increment') select(activeIndex.current + 1);
        if (action === 'decrement') select(activeIndex.current - 1);
      }}>
      <ScrollView ref={scroll} style={styles.wheel} contentContainerStyle={styles.wheelContent}
        contentOffset={initialOffset} snapToOffsets={offsets} decelerationRate="fast" nestedScrollEnabled
        bounces={false} overScrollMode="never" showsVerticalScrollIndicator={false} scrollEnabled={!disabled}
        automaticallyAdjustContentInsets={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        onScroll={trackPosition} onMomentumScrollEnd={event => trackPosition(event, true)} scrollEventThrottle={16}>
        {offsets.map((offset, index) => {
          const option = index % optionCount;
          const difference = Math.abs(option - value);
          const distance = Math.min(difference, optionCount - difference);
          return (
            <Pressable key={offset} accessible={false} disabled={disabled} style={styles.row} onPress={() => select(index)}>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.4}
                style={[styles.wheelText, styles[side], styles.number,
                  distance === 0 ? styles.selectedNumber : { opacity: Math.max(0.25, 1 - distance * 0.32) }]}>
                {String(option * step).padStart(2, '0')}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View pointerEvents="none" style={styles.header} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[styles.wheelText, styles[side], styles.label]} maxFontSizeMultiplier={1.2}>{label}</Text>
      </View>
    </View>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  wheels: { width: '100%', flexDirection: 'row' },
  column: { flex: 1, minWidth: 0 },
  wheelText: { width: '50%', textAlign: 'center' },
  left: { alignSelf: 'flex-end' },
  right: { alignSelf: 'flex-start' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_HEIGHT, paddingTop: spacing.md, backgroundColor: colors.surface },
  label: { color: colors.textMuted, fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 24 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, height: FOOTER_HEIGHT, backgroundColor: colors.surface },
  wheel: { height: CENTER_PADDING * 2 + ROW_HEIGHT + HEADER_HEIGHT + FOOTER_HEIGHT, flexGrow: 0 },
  wheelContent: { paddingTop: CENTER_PADDING + HEADER_HEIGHT, paddingBottom: CENTER_PADDING + FOOTER_HEIGHT },
  row: { height: ROW_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  number: { color: colors.textMuted, fontSize: 25, fontVariant: ['tabular-nums'] },
  selectedNumber: { color: colors.text },
  selectionBand: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: CENTER_PADDING + FOOTER_HEIGHT, height: ROW_HEIGHT, borderRadius: 12, backgroundColor: colors.sageLight },
  separator: { position: 'absolute', left: 0, right: 0, bottom: CENTER_PADDING + FOOTER_HEIGHT, height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 8 },
  separatorDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#000000' },
}));
