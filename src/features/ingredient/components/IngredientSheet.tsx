/**
 * @file
 * Gorhom 시트로 재료 패널을 표시하고 본문 스크롤과 제목 드래그를 구분한다.
 * 목록 높이를 기억해 추가·편집 후 복원하고, 닫기 애니메이션이 끝난 뒤 호출자에게 알린다.
 */
import { BottomSheetBackdrop, BottomSheetModal, useBottomSheet, useBottomSheetInternal } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PropsWithChildren, ReactNode, Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme/tokens';

export interface IngredientSheetRef {
  close: () => void;
}

export interface IngredientSheetProps {
  ref?: Ref<IngredientSheetRef>;
  children: ReactNode;
  header?: ReactNode;
  disabled: boolean;
  expanded?: boolean;
  halfHeightForm?: boolean;
  transitioning?: boolean;
  onClose: () => void;
}

const SNAP_POINTS = ['50%', '100%'];
const EXPANDED_SNAP_POINTS = ['100%'];
// 시트 닫기 완료가 기본 스프링의 정착 시간에 늦춰지지 않도록 전환 시간을 고정한다.
const TRANSITION_ANIMATION = { duration: 240 };

// 포털에 표시되는 제목과 본문을 하나의 모달 접근성 경계로 묶는다.
function SheetContainer({ children }: PropsWithChildren) {
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal>{children}</View>;
}

function SheetContent({ children, expanded, halfHeightForm, transitioning, restoreIndex, onClose }: PropsWithChildren<{
  expanded: boolean;
  halfHeightForm: boolean;
  transitioning: boolean;
  restoreIndex: number;
  onClose: () => void;
}>) {
  const { snapToIndex } = useBottomSheet();
  const { animatedLayoutState, animatedPosition, animatedDetentsState } = useBottomSheetInternal();
  // Gorhom의 본문은 최대 높이를 기준으로 배치되므로 반높이에서도 마지막 항목까지 스크롤되게 제한한다.
  const contentStyle = useAnimatedStyle(() => {
    const { containerHeight, handleHeight } = animatedLayoutState.value;
    return { maxHeight: Math.max(0, containerHeight - animatedPosition.value - handleHeight) };
  });
  // 포털과 UI 스레드에 단계 변경이 반영된 뒤 이동해 폼 복귀 시 인덱스 범위를 벗어나지 않게 한다.
  useAnimatedReaction(
    () => ({ count: animatedDetentsState.value.detents?.length ?? 0, expanded, halfHeightForm, transitioning }),
    (next, previous) => {
      const expectedCount = next.expanded && !next.transitioning ? 1 : 2;
      if (next.count !== expectedCount) return;
      if (next.count === previous?.count && next.expanded === previous.expanded
        && next.halfHeightForm === previous.halfHeightForm && next.transitioning === previous.transitioning) return;
      runOnJS(snapToIndex)(next.expanded ? next.count - 1 : next.halfHeightForm ? 0 : restoreIndex, TRANSITION_ANIMATION);
    },
    [expanded, halfHeightForm, transitioning, restoreIndex, snapToIndex],
  );
  // 하단 안전 영역은 각 목록·폼의 스크롤 콘텐츠에 포함해 고정된 빈 띠가 생기지 않게 한다.
  return (
    <Animated.View style={[styles.content, contentStyle]} onAccessibilityEscape={onClose}>
      {children}
    </Animated.View>
  );
}

export function IngredientSheet({ ref, children, header, disabled, expanded = false, halfHeightForm = false, transitioning = false, onClose }: IngredientSheetProps) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const phase = useRef<'open' | 'closing' | 'closed'>('open');
  const [listIndex, setListIndex] = useState(0);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    sheetRef.current?.present();
  }, []);
  const close = useCallback(() => {
    if (disabled || phase.current !== 'open') return;
    phase.current = 'closing';
    sheetRef.current?.dismiss();
  }, [disabled]);
  useImperativeHandle(ref, () => ({ close }), [close]);
  // iOS는 opacity 0인 뷰를 터치 대상에서 제외하므로 배경색만 투명하게 처리한다.
  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1}
      pressBehavior={disabled ? 'none' : 'close'} opacity={1} accessible={false}
      style={[props.style, styles.backdrop]} />
  ), [disabled]);
  // 제목과 고정 드래그 바만 손잡이로 사용해 목록 최상단의 아래 스와이프도 스크롤로 처리한다.
  const renderHandle = useCallback(() => (
    <View onAccessibilityEscape={close}>
      <View style={styles.dragIndicator} pointerEvents="none" accessible={false} />
      {header}
    </View>
  ), [header, close]);
  return (
    <BottomSheetModal ref={sheetRef} index={0}
      snapPoints={expanded && !transitioning ? EXPANDED_SNAP_POINTS : SNAP_POINTS}
      animationConfigs={TRANSITION_ANIMATION}
      topInset={insets.top} handleComponent={renderHandle} backdropComponent={renderBackdrop}
      containerComponent={SheetContainer}
      enableDynamicSizing={false} enableOverDrag={false} enableContentPanningGesture={false}
      enableHandlePanningGesture={!disabled} enablePanDownToClose={!disabled}
      keyboardBehavior="extend" keyboardBlurBehavior="none" android_keyboardInputMode="adjustResize"
      backgroundStyle={styles.background}
      onChange={index => {
        if (phase.current === 'open' && !expanded && !halfHeightForm && !transitioning && index >= 0) setListIndex(index);
      }}
      onDismiss={() => {
        if (phase.current === 'closed') return;
        phase.current = 'closed';
        onClose();
      }}>
      <SheetContent expanded={expanded} halfHeightForm={halfHeightForm} transitioning={transitioning} restoreIndex={listIndex}
        onClose={close}>
        {children}
      </SheetContent>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  backdrop: { backgroundColor: 'transparent' },
  background: { backgroundColor: colors.surface, borderRadius: 24 },
  dragIndicator: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3,
    marginTop: spacing.xs, marginBottom: 5, backgroundColor: '#C4C4C4' },
});
