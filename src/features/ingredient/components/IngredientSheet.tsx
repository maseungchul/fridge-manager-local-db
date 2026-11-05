/**
 * @file
 * 재료 패널의 네이티브 시트를 표시하고 닫기 요청과 종료 완료를 구분한다.
 * Android·웹은 기존 시트를 사용하며, iOS의 네이티브 표시 상태는 전용 구현에서 받는다.
 */
import { BottomSheet } from '@expo/ui/community/bottom-sheet';
import { useImperativeHandle, useRef } from 'react';
import type { ReactNode, Ref } from 'react';
import { colors } from '@/theme/tokens';

export interface IngredientSheetRef {
  close: () => void;
}

export interface IngredientSheetProps {
  ref?: Ref<IngredientSheetRef>;
  children: ReactNode;
  disabled: boolean;
  onCloseStart?: () => void;
  onCloseCancel?: () => void;
  onClose: () => void;
}

const SNAP_POINTS = ['50%', '100%'];

export function IngredientSheet({ ref, children, disabled, onCloseStart, onClose }: IngredientSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const closing = useRef(false);
  function notifyCloseStart() {
    if (disabled || closing.current) return;
    closing.current = true;
    onCloseStart?.();
  }
  useImperativeHandle(ref, () => ({ close() {
    if (disabled || closing.current) return;
    notifyCloseStart();
    sheetRef.current?.close();
  } }));
  return (
    <BottomSheet ref={sheetRef} index={0} snapPoints={SNAP_POINTS} handleComponent={null}
      enableDynamicSizing={false} enablePanDownToClose={!disabled} backgroundStyle={{ backgroundColor: colors.surface }}
      onClose={() => { if (!disabled) { notifyCloseStart(); onClose(); } }}>
      {children}
    </BottomSheet>
  );
}
