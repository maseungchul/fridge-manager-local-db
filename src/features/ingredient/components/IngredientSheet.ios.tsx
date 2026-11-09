/**
 * @file
 * 시스템 medium·large 시트로 재료 패널을 표시하고 추가 화면에서만 최대화 높이를 유지한다.
 * 배경 터치로 닫히지 않게 하고, 스와이프로 시트가 종료되면 호출자에게 알린다.
 */
import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import { animation, Animation, interactiveDismissDisabled, presentationBackground, presentationBackgroundInteraction, presentationDetents, presentationDragIndicator } from '@expo/ui/swift-ui/modifiers';
import { useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { colors } from '@/theme/tokens';
import type { IngredientSheetProps } from './IngredientSheet';

export function IngredientSheet({ ref, children, disabled, expanded = false, transitioning = false, onListExpandedChange, onClose }: IngredientSheetProps) {
  const { width } = useWindowDimensions();
  const [isPresented, setIsPresented] = useState(true);
  const [listDetent, setListDetent] = useState<'medium' | 'large'>('medium');
  const phase = useRef<'open' | 'closing' | 'closed'>('open');
  function finishClosing() {
    if (disabled || phase.current === 'closed') return;
    phase.current = 'closed';
    onClose();
  }
  useImperativeHandle(ref, () => ({ close() {
    if (disabled || phase.current !== 'open') return;
    phase.current = 'closing';
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
              if (!expanded && !transitioning && (detent === 'medium' || detent === 'large')) {
                setListDetent(detent);
                onListExpandedChange?.(detent === 'large');
              }
            },
          }),
          presentationDragIndicator('hidden'),
          // 모든 높이에서 시스템 배경의 닫기를 막고, 뒤 화면 입력은 홈과 탭에서 차단한다.
          presentationBackgroundInteraction({ type: 'enabledUpThrough', detent: 'large' }),
          interactiveDismissDisabled(disabled), presentationBackground(colors.surface),
          animation(Animation.easeInOut({ duration: 0.24 }), expanded),
        ]}>
          <RNHostView matchContents={false}>
            <View style={styles.container}>{children}</View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, height: 0 },
});
