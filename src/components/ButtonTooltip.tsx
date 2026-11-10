/**
 * @file
 * 버튼의 화면 좌표를 기준으로 짧은 설명을 말풍선에 표시한다.
 * 안전 영역과 키보드를 피해 위아래 위치를 정하고, 바깥 터치로 닫는다.
 * 네이티브 모달 대신 앱 최상위에 겹쳐 표시해 입력 포커스와 키보드를 유지한다.
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { BackHandler, Keyboard, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';

export interface TooltipAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ButtonTooltipProps {
  anchor: TooltipAnchor;
  label: string;
  gap?: number;
  onDismiss: () => void;
}

interface TooltipEntry extends ButtonTooltipProps {
  owner: string;
}

const TooltipContext = createContext<{
  show: (entry: TooltipEntry) => void;
  hide: (owner: string) => void;
} | null>(null);

/** 시트를 포함한 화면 바깥에서 하나의 설명 레이어를 공유한다. */
export function ButtonTooltipProvider({ children }: PropsWithChildren) {
  const [entry, setEntry] = useState<TooltipEntry | null>(null);
  const show = useCallback((next: TooltipEntry) => setEntry(next), []);
  const hide = useCallback((owner: string) => setEntry(current => current?.owner === owner ? null : current), []);
  const context = useMemo(() => ({ show, hide }), [show, hide]);
  return (
    <TooltipContext.Provider value={context}>
      <View style={styles.container}>
        {children}
        {entry ? <TooltipBubble key={entry.owner} {...entry} /> : null}
      </View>
    </TooltipContext.Provider>
  );
}

/** 버튼의 해제·비활성화에 맞춰 해당 버튼의 설명만 종료한다. */
export function ButtonTooltip({ anchor, label, gap, onDismiss }: ButtonTooltipProps) {
  const context = useContext(TooltipContext);
  const owner = useId();
  useEffect(() => {
    context?.show({ anchor, label, gap, onDismiss, owner });
    return () => context?.hide(owner);
  }, [context, anchor, label, gap, onDismiss, owner]);
  return null;
}

function TooltipBubble({ anchor, label, gap = 8, onDismiss }: ButtonTooltipProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  // 키보드가 닫힌 뒤에는 이전 버튼 좌표로 안내를 표시하지 않는다.
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidHide', onDismiss);
    return () => subscription.remove();
  }, [onDismiss]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onDismiss(); return true; });
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
    <View style={styles.overlay} onAccessibilityEscape={onDismiss}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessible={false} />
      <View pointerEvents="none" style={[styles.bubble, { left, top, maxWidth: Math.min(260, width - insets.left - insets.right - 32),
        opacity: size.width ? 1 : 0 }]}
        onLayout={({ nativeEvent: { layout } }) => setSize(current => current.width === layout.width && current.height === layout.height
          ? current : { width: layout.width, height: layout.height })}>
        <View style={[styles.arrow, { left: arrowLeft }, showBelow ? styles.arrowAbove : styles.arrowBelow]} />
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 1000 },
  bubble: { position: 'absolute', backgroundColor: colors.chilledPressed, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 6, color: `${colors.button}30` }] },
  label: { color: colors.buttonText, fontSize: 13, lineHeight: 19 },
  arrow: { position: 'absolute', width: 12, height: 12, backgroundColor: colors.chilledPressed, transform: [{ rotate: '45deg' }] },
  arrowAbove: { top: -6 },
  arrowBelow: { bottom: -6 },
});
