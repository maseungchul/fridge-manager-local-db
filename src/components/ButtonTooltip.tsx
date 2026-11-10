/**
 * @file
 * 버튼의 화면 좌표를 기준으로 짧은 설명을 말풍선에 표시한다.
 * 안전 영역과 키보드를 피해 위아래 위치를 정하고, 바깥 터치로 닫는다.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';

export interface TooltipAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function ButtonTooltip({ anchor, label, gap = 8, onDismiss }: {
  anchor: TooltipAnchor;
  label: string;
  gap?: number;
  onDismiss: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  // 키보드가 닫힌 뒤에는 이전 버튼 좌표로 안내를 표시하지 않는다.
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidHide', onDismiss);
    return () => subscription.remove();
  }, [onDismiss]);
  useEffect(() => () => onDismiss(), [width, height, onDismiss]);
  const topEdge = insets.top + 8;
  const bottomEdge = Math.min(height - insets.bottom, Keyboard.metrics()?.screenY ?? height) - 8;
  const above = anchor.y - topEdge;
  const below = bottomEdge - anchor.y - anchor.height;
  const showBelow = below >= size.height + gap || below >= above;
  const center = anchor.x + anchor.width / 2;
  const left = Math.max(insets.left + 8, Math.min(center - size.width / 2, width - insets.right - size.width - 8));
  const top = Math.max(topEdge, Math.min(showBelow ? anchor.y + anchor.height + gap : anchor.y - size.height - gap,
    bottomEdge - size.height));
  const arrowLeft = Math.max(12, Math.min(center - left - 6, size.width - 24));

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onDismiss}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessible={false} />
      <View pointerEvents="none" style={[styles.bubble, { left, top, maxWidth: Math.min(260, width - insets.left - insets.right - 32),
        opacity: size.width ? 1 : 0 }]}
        onLayout={({ nativeEvent: { layout } }) => setSize(current => current.width === layout.width && current.height === layout.height
          ? current : { width: layout.width, height: layout.height })}>
        <View style={[styles.arrow, { left: arrowLeft }, showBelow ? styles.arrowAbove : styles.arrowBelow]} />
        <Text style={styles.label}>{label}</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bubble: { position: 'absolute', backgroundColor: colors.chilledPressed, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 6, color: `${colors.button}30` }] },
  label: { color: colors.buttonText, fontSize: 13, lineHeight: 19 },
  arrow: { position: 'absolute', width: 12, height: 12, backgroundColor: colors.chilledPressed, transform: [{ rotate: '45deg' }] },
  arrowAbove: { top: -6 },
  arrowBelow: { bottom: -6 },
});
