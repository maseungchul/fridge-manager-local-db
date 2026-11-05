/**
 * @file
 * 시스템 medium·large 시트로 재료 패널을 표시하고 추가 화면에서만 최대화 높이를 유지한다.
 * 내부 UIKit 화면은 표시 전환만 전달하며 시트의 높이와 외곽 전환은 시스템에 맡긴다.
 */
import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import { animation, Animation, interactiveDismissDisabled, presentationBackground, presentationDetents, presentationDragIndicator } from '@expo/ui/swift-ui/modifiers';
import { useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { ScreenStack, ScreenStackItem } from 'react-native-screens';
import { colors } from '@/theme/tokens';
import type { IngredientSheetProps } from './IngredientSheet';

export function IngredientSheet({ ref, children, disabled, expanded = false, transitioning = false, onCloseStart, onCloseCancel, onClose }: IngredientSheetProps) {
  const { width } = useWindowDimensions();
  const [isPresented, setIsPresented] = useState(true);
  const [listDetent, setListDetent] = useState<'medium' | 'large'>('medium');
  const phase = useRef<'open' | 'closing' | 'closed'>('open');
  function startClosing() {
    if (disabled || phase.current !== 'open') return;
    phase.current = 'closing';
    onCloseStart?.();
  }
  function finishClosing() {
    if (disabled || phase.current === 'closed') return;
    startClosing();
    phase.current = 'closed';
    onClose();
  }
  function cancelClosing() {
    if (!isPresented || phase.current !== 'closing') return;
    phase.current = 'open';
    onCloseCancel?.();
  }
  useImperativeHandle(ref, () => ({ close() {
    if (disabled || phase.current !== 'open') return;
    startClosing();
    setIsPresented(false);
  } }));
  return (
    <Host style={{ position: 'absolute', width }} pointerEvents="none">
      <BottomSheet isPresented={isPresented} onIsPresentedChange={setIsPresented} onDismiss={finishClosing}>
        <Group modifiers={[
          // fraction(1)은 커스텀 높이이므로 최대화에는 시스템 large를 사용한다.
          // 전환 중에는 기존 높이도 허용해 강제 재배치 없이 선택 단계만 애니메이션한다.
          presentationDetents(expanded && !transitioning ? ['large'] : ['medium', 'large'], {
            selection: expanded ? 'large' : listDetent,
            onSelectionChange: detent => {
              if (!expanded && !transitioning && (detent === 'medium' || detent === 'large')) setListDetent(detent);
            },
          }),
          presentationDragIndicator('hidden'),
          interactiveDismissDisabled(disabled), presentationBackground(colors.surface),
          animation(Animation.easeInOut({ duration: 0.24 }), expanded),
        ]}>
          <RNHostView matchContents={false}>
            <ScreenStack style={styles.container}>
              <ScreenStackItem screenId="ingredient-sheet-content" activityState={2}
                style={StyleSheet.absoluteFill} headerConfig={{ hidden: true }} contentStyle={styles.panel} freezeOnBlur={false}
                onWillDisappear={startClosing} onAppear={cancelClosing} onGestureCancel={cancelClosing}>
                {children}
              </ScreenStackItem>
            </ScreenStack>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, height: 0 },
  panel: { flex: 1, backgroundColor: colors.surface },
});
