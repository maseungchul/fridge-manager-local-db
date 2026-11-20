/**
 * @file
 * 공통 선택 휠의 스크롤·순환·접근성 조작을 처리한다.
 */
import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, useAnimatedValue, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { createThemedStyles, spacing } from '@/theme/tokens';

interface PickerWheelProps {
  side?: 'left' | 'right';
  formatOption?: (value: number) => string;
  formatAccessibilityValue?: (value: number) => string;
  label: string;
  value: number;
  wheel: ReturnType<typeof createWheel>;
  step?: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onMovingChange: (moving: boolean) => void;
}

const ROW_HEIGHT = 44;
const SIDE_ROWS = 2;
const CENTER_PADDING = ROW_HEIGHT * SIDE_ROWS;
const TOP_PADDING = spacing.md;
const FOOTER_HEIGHT = spacing.md;
const LOOP_BUFFER_ROWS = 1200;
const RECENTER_DISTANCE = 120;
const SCROLL_SETTLE_DELAY = 150;
const WINDOW_STEP = 8;
const WINDOW_BUFFER = 16;
const DECELERATION_RATE = Platform.OS === 'android' ? 0.95 : 0.994;

export function createWheel(optionCount: number, loop = true) {
  // 옵션이 적은 분 휠도 한 번에 길게 돌릴 수 있도록 양쪽 행 수를 맞춘다.
  const sideCopies = loop ? Math.ceil(LOOP_BUFFER_ROWS / optionCount) : 0;
  const offsets = Array.from({ length: optionCount * (sideCopies * 2 + 1) }, (_, index) => index * ROW_HEIGHT);
  return { optionCount, offsets, middleIndex: optionCount * sideCopies, loop };
}


function formatNumber(value: number) {
  return String(value).padStart(2, '0');
}

export function PickerWheelTrack({ children }: { children: React.ReactNode }) {
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  return (
    <View style={styles.track}>
      <View pointerEvents="none" style={styles.selectionBand} />
      {children}
      <View pointerEvents="none" style={styles.footer} />
    </View>
  );
}

export const PICKER_ROW_HEIGHT = ROW_HEIGHT;
export const PICKER_ROW_BOTTOM = CENTER_PADDING + FOOTER_HEIGHT;

export function PickerWheel({ side, formatOption = formatNumber, formatAccessibilityValue = formatOption,
  label, value, wheel: { offsets, optionCount, middleIndex, loop }, step = 1, disabled, onChange, onMovingChange }: PickerWheelProps) {
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // 일반 렌더링에서 contentOffset을 다시 설정하면 사용자가 굴리는 도중 위치가 돌아간다.
  const [initialOffset] = useState(() => ({ x: 0, y: offsets[middleIndex + value] }));
  const scrollY = useAnimatedValue(initialOffset.y);
  const [windowStart, setWindowStart] = useState(() => Math.floor((middleIndex + value) / WINDOW_STEP) * WINDOW_STEP);
  const activeIndex = useRef(middleIndex + value);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragging = useRef(false);
  const lastIndex = offsets.length - 1;
  const windowFirst = Math.max(0, windowStart - WINDOW_BUFFER);
  const windowEnd = windowStart + WINDOW_STEP + WINDOW_BUFFER;
  const middleFirst = middleIndex - SIDE_ROWS;
  const middleEnd = middleIndex + optionCount + SIDE_ROWS;
  // 현재 위치와 되돌아갈 위치 주변만 잘라 전체 목록을 매번 순회하지 않는다.
  const visibleOffsets = loop ? [
    ...offsets.slice(middleFirst, Math.min(middleEnd, windowFirst)),
    ...offsets.slice(windowFirst, windowEnd),
    ...offsets.slice(Math.max(middleFirst, windowEnd), middleEnd),
  ] : offsets;

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  function cancelSettle() {
    clearTimeout(settleTimer.current);
    settleTimer.current = undefined;
  }

  function updateIndex(index: number) {
    activeIndex.current = index;
    if (loop) setWindowStart(Math.floor(index / WINDOW_STEP) * WINDOW_STEP);
    onChange(index % optionCount);
  }

  function select(index: number) {
    if (disabled) return;
    cancelSettle();
    const option = (index % optionCount + optionCount) % optionCount;
    const target = loop ? middleIndex + option : Math.max(0, Math.min(lastIndex, index));
    updateIndex(target);
    scroll.current?.scrollTo({ y: offsets[target], animated: false });
  }

  function trackPosition(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (disabled) return;
    const index = Math.max(0, Math.min(lastIndex, Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT)));
    updateIndex(index);
    if (settleTimer.current !== undefined) scheduleSettle();
  }

  function recenterAfterScroll() {
    cancelSettle();
    if (dragging.current) return;
    const index = activeIndex.current;
    // 관성이 끝난 뒤에만 같은 값으로 복귀해 다음 스와이프에 필요한 영역을 확보한다.
    if (loop && (index < middleIndex - RECENTER_DISTANCE || index >= middleIndex + optionCount + RECENTER_DISTANCE)) select(index);
    onMovingChange(false);
  }

  function scheduleSettle() {
    if (disabled || dragging.current) return;
    cancelSettle();
    // 관성 없이 손을 뗐을 때는 스크롤 이벤트가 잠잠해지기를 기다린다.
    settleTimer.current = setTimeout(recenterAfterScroll, SCROLL_SETTLE_DELAY);
  }

  // Animated.event는 스크롤 이벤트가 들어올 때만 listener를 호출한다.
  // eslint-disable-next-line react-hooks/refs
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true, listener: trackPosition });

  return (
    <View style={styles.column} accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityState={{ disabled }} accessibilityValue={{ text: formatAccessibilityValue(value * step) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => {
        const action = event.nativeEvent.actionName;
        if (action === 'increment') select(activeIndex.current + 1);
        if (action === 'decrement') select(activeIndex.current - 1);
      }}>
      <Animated.ScrollView ref={scroll} style={styles.wheel} contentContainerStyle={styles.wheelContent}
        contentOffset={initialOffset} snapToOffsets={offsets} decelerationRate={DECELERATION_RATE} nestedScrollEnabled
        bounces={false} overScrollMode="never" showsVerticalScrollIndicator={false} scrollEnabled={!disabled}
        automaticallyAdjustContentInsets={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        onScroll={onScroll}
        onScrollBeginDrag={() => { dragging.current = true; cancelSettle(); onMovingChange(true); }}
        onScrollEndDrag={() => { dragging.current = false; scheduleSettle(); }}
        onMomentumScrollBegin={() => { cancelSettle(); onMovingChange(true); }}
        onMomentumScrollEnd={event => { trackPosition(event); recenterAfterScroll(); }} scrollEventThrottle={16}>
        {/* 전체 높이를 유지하고, 순환 시 복귀할 가운데 묶음은 미리 그려 둔다. */}
        <View style={{ height: offsets.length * ROW_HEIGHT }}>
          {visibleOffsets.map(offset => {
            const index = offset / ROW_HEIGHT;
            return <WheelOption key={offset} offset={offset} scrollY={scrollY} side={side} disabled={disabled}
              text={formatOption((index % optionCount) * step)} onPress={() => select(index)} />;
          })}
        </View>
      </Animated.ScrollView>
      <View pointerEvents="none" style={styles.topMask} />
    </View>
  );
}

function WheelOption({ offset, scrollY, side, disabled, text, onPress }: {
  offset: number;
  scrollY: Animated.Value;
  side: PickerWheelProps['side'];
  disabled: boolean;
  text: string;
  onPress: () => void;
}) {
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  // 강조는 JS의 선택값을 기다리지 않고 네이티브 스크롤 위치를 따라간다.
  const [opacity] = useState(() => scrollY.interpolate({
    inputRange: [offset - ROW_HEIGHT * 2, offset - ROW_HEIGHT, offset, offset + ROW_HEIGHT, offset + ROW_HEIGHT * 2],
    outputRange: [0.28, 0.58, 1, 0.58, 0.28],
    extrapolate: 'clamp',
  }));
  return (
    <Pressable accessible={false} disabled={disabled} style={[styles.row, { top: offset }]} onPress={onPress}>
      <Animated.Text numberOfLines={1} maxFontSizeMultiplier={1.4}
        style={[styles.wheelText, side && styles[side], styles.number, { opacity }]}>
        {text}
      </Animated.Text>
    </Pressable>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  track: { width: '100%', flexDirection: 'row' },
  column: { flex: 1, minWidth: 0 },
  wheelText: { textAlign: 'center' },
  left: { width: '50%', alignSelf: 'flex-end' },
  right: { width: '50%', alignSelf: 'flex-start' },
  topMask: { position: 'absolute', top: 0, left: 0, right: 0, height: TOP_PADDING, backgroundColor: colors.surface },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, height: FOOTER_HEIGHT, backgroundColor: colors.surface },
  wheel: { height: CENTER_PADDING * 2 + ROW_HEIGHT + TOP_PADDING + FOOTER_HEIGHT, flexGrow: 0 },
  wheelContent: { paddingTop: CENTER_PADDING + TOP_PADDING, paddingBottom: CENTER_PADDING + FOOTER_HEIGHT },
  row: { position: 'absolute', left: 0, right: 0, height: ROW_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  number: { color: colors.text, fontSize: 23, fontVariant: ['tabular-nums'] },
  selectionBand: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: CENTER_PADDING + FOOTER_HEIGHT, height: ROW_HEIGHT, borderRadius: 12, backgroundColor: colors.sageLight },
}));
