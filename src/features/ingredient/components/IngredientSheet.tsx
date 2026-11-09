/**
 * @file
 * 재료 패널의 네이티브 시트를 표시하고 추가 화면에서만 최대화 높이를 유지한다.
 * Android·웹은 기존 시트를 사용하며, iOS의 네이티브 표시 상태는 전용 구현에서 받는다.
 */
import { BottomSheet } from '@expo/ui/community/bottom-sheet';
import { useEffect, useImperativeHandle, useRef } from 'react';
import type { ReactNode, Ref } from 'react';
import { View } from 'react-native';
import { colors } from '@/theme/tokens';

export interface IngredientSheetRef {
  close: () => void;
}

export interface IngredientSheetProps {
  ref?: Ref<IngredientSheetRef>;
  children: ReactNode;
  disabled: boolean;
  expanded?: boolean;
  transitioning?: boolean;
  onListExpandedChange?: (expanded: boolean) => void;
  onClose: () => void;
}

const SNAP_POINTS = ['50%', '100%'];
const EXPANDED_SNAP_POINTS = ['100%'];

export function IngredientSheet({ ref, children, disabled, expanded = false, transitioning = false, onClose }: IngredientSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const closing = useRef(false);
  const previousExpanded = useRef(expanded);
  const listIndex = useRef(0);
  const heights = useRef({ list: 0, expanded: 0 });
  useEffect(() => {
    if (previousExpanded.current === expanded) return;
    previousExpanded.current = expanded;
    // Android의 사용자 드래그는 onChange를 전달하지 않아 실제 콘텐츠 높이도 함께 기억한다.
    if (!expanded && heights.current.list > 0 && heights.current.expanded > 0) {
      listIndex.current = heights.current.list < heights.current.expanded - 1 ? 0 : 1;
    }
    sheetRef.current?.snapToIndex(expanded ? 1 : listIndex.current);
  }, [expanded]);
  useImperativeHandle(ref, () => ({ close() {
    if (disabled || closing.current) return;
    closing.current = true;
    sheetRef.current?.close();
  } }));
  return (
    <BottomSheet ref={sheetRef} index={0} snapPoints={expanded && !transitioning ? EXPANDED_SNAP_POINTS : SNAP_POINTS} handleComponent={null}
      enableDynamicSizing={false} enablePanDownToClose={!disabled} backgroundStyle={{ backgroundColor: colors.surface }}
      onChange={index => { if (!expanded && !transitioning && index >= 0) listIndex.current = index; }}
      onClose={() => { if (!disabled) onClose(); }}>
      <View style={{ flex: 1 }} onLayout={({ nativeEvent: { layout } }) => {
        if (expanded) heights.current.expanded = Math.max(heights.current.expanded, layout.height);
        else if (!transitioning) heights.current.list = layout.height;
      }}>
        {children}
      </View>
    </BottomSheet>
  );
}
