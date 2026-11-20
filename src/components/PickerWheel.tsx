/**
 * @file
 * 공통 선택 휠의 스크롤·순환·접근성 조작을 처리한다.
 */
import { useRef, useState } from 'react';
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
}

const ROW_HEIGHT = 44;
const SIDE_ROWS = 2;
const CENTER_PADDING = ROW_HEIGHT * SIDE_ROWS;
const TOP_PADDING = spacing.md;
const FOOTER_HEIGHT = spacing.md;
const WHEEL_COPIES = 11;
const DECELERATION_RATE = Platform.OS === 'android' ? 0.95 : 0.994;

export function createWheel(optionCount: number, loop = true) {
  const copies = loop ? WHEEL_COPIES : 1;
  const offsets = Array.from({ length: optionCount * copies }, (_, index) => index * ROW_HEIGHT);
  return { optionCount, offsets, middleIndex: optionCount * Math.floor(copies / 2), loop };
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
  label, value, wheel: { offsets, optionCount, middleIndex, loop }, step = 1, disabled, onChange }: PickerWheelProps) {
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // 일반 렌더링에서 contentOffset을 다시 설정하면 사용자가 굴리는 도중 위치가 돌아간다.
  const [initialOffset] = useState(() => ({ x: 0, y: offsets[middleIndex + value] }));
  const scrollY = useAnimatedValue(initialOffset.y);
  // 강조는 JS의 선택값을 기다리지 않고 네이티브 스크롤 위치를 따라간다.
  const [opacities] = useState(() => offsets.map(offset => scrollY.interpolate({
    inputRange: [offset - ROW_HEIGHT * 2, offset - ROW_HEIGHT, offset, offset + ROW_HEIGHT, offset + ROW_HEIGHT * 2],
    outputRange: [0.28, 0.58, 1, 0.58, 0.28],
    extrapolate: 'clamp',
  })));
  const activeIndex = useRef(middleIndex + value);
  const lastIndex = offsets.length - 1;

  function updateIndex(index: number) {
    activeIndex.current = index;
    onChange(index % optionCount);
  }

  function select(index: number) {
    if (disabled) return;
    const option = (index % optionCount + optionCount) % optionCount;
    const target = loop ? middleIndex + option : Math.max(0, Math.min(lastIndex, index));
    updateIndex(target);
    scrollY.setValue(offsets[target]);
    scroll.current?.scrollTo({ y: offsets[target], animated: false });
  }

  function trackPosition(event: NativeSyntheticEvent<NativeScrollEvent>, settled = false) {
    if (disabled) return;
    const index = Math.max(0, Math.min(lastIndex, Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT)));
    // 같은 값이 놓인 가운데 묶음으로 옮겨도 선택과 주변 숫자의 순서가 유지된다.
    if (loop && (index <= SIDE_ROWS || index >= lastIndex - SIDE_ROWS
      || (settled && (index < middleIndex || index >= middleIndex + optionCount)))) {
      select(index);
    } else {
      updateIndex(index);
    }
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
        onScroll={onScroll} onMomentumScrollEnd={event => trackPosition(event, true)} scrollEventThrottle={16}>
        {offsets.map((offset, index) => {
          const option = index % optionCount;
          return (
            <Pressable key={offset} accessible={false} disabled={disabled} style={styles.row} onPress={() => select(index)}>
              <Animated.Text numberOfLines={1} maxFontSizeMultiplier={1.4}
                style={[styles.wheelText, side && styles[side], styles.number, { opacity: opacities[index] }]}>
                {formatOption(option * step)}
              </Animated.Text>
            </Pressable>
          );
        })}
      </Animated.ScrollView>
      <View pointerEvents="none" style={styles.topMask} />
    </View>
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
  row: { height: ROW_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  number: { color: colors.text, fontSize: 23, fontVariant: ['tabular-nums'] },
  selectionBand: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: CENTER_PADDING + FOOTER_HEIGHT, height: ROW_HEIGHT, borderRadius: 12, backgroundColor: colors.sageLight },
}));
