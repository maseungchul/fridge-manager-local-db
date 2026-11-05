/**
 * @file
 * 네이티브 가로 스크롤로 삭제 버튼을 표시하고, 세로 이동은 목록·네이티브 시트에 맡긴다.
 * 열린 행과 삭제 요청은 호출자가 관리하며, 이 컴포넌트는 이동·버튼 표시만 처리한다.
 */
import { useEffect, useRef } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { colors } from '@/theme/tokens';

interface IngredientSwipeRowProps {
  children: ReactNode;
  name: string;
  width: number;
  isOpen: boolean;
  disabled: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDelete: () => void;
}

const DELETE_WIDTH = 80;
const SNAP_OFFSETS = [0, DELETE_WIDTH];

export function IngredientSwipeRow({ children, name, width, isOpen, disabled, onOpen, onClose, onDelete }: IngredientSwipeRowProps) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const swipe = useRef({ dragging: false, pending: false });

  useEffect(() => {
    if (swipe.current.dragging) return;
    swipe.current.pending = false;
    scrollRef.current?.scrollTo({ x: isOpen ? DELETE_WIDTH : 0, animated: true });
  }, [isOpen, width]);

  function finishSwipe(offset: number) {
    if (!swipe.current.pending) return;
    swipe.current.pending = false;
    if (offset >= DELETE_WIDTH / 2) onOpen();
    else onClose();
  }

  return (
    <ScrollView ref={scrollRef} horizontal directionalLockEnabled nestedScrollEnabled
      bounces={false} alwaysBounceVertical={false} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}
      scrollsToTop={false} automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never"
      scrollEnabled={!disabled} snapToOffsets={SNAP_OFFSETS} decelerationRate="fast" style={styles.row}
      onScrollBeginDrag={() => {
        swipe.current.dragging = true;
        swipe.current.pending = true;
        onOpen();
      }}
      onScrollEndDrag={({ nativeEvent }) => {
        swipe.current.dragging = false;
        // iOS는 스냅 목적지를 즉시 전달하고, Android의 관성 이동은 완료 후 확정한다.
        if (nativeEvent.targetContentOffset) finishSwipe(nativeEvent.targetContentOffset.x);
        else if (!nativeEvent.velocity?.x) finishSwipe(nativeEvent.contentOffset.x);
      }}
      onMomentumScrollEnd={({ nativeEvent }) => finishSwipe(nativeEvent.contentOffset.x)}>
      <View style={[styles.content, { width }]}>{children}</View>
      <View style={styles.action} pointerEvents={isOpen && !disabled ? 'auto' : 'none'}
        accessibilityElementsHidden={!isOpen} importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}>
        <FeedbackPressable accessibilityRole="button" accessibilityLabel={`${name} 삭제`}
          accessibilityState={{ disabled }} disabled={disabled} feedback="danger" onPress={onDelete} style={styles.deleteButton}>
          <MaterialDesignIcons name="trash-can-outline" size={24} color={colors.error} accessible={false} />
        </FeedbackPressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexGrow: 0 },
  content: { backgroundColor: colors.surface },
  action: { width: DELETE_WIDTH, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  deleteButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    backgroundColor: `${colors.rose}33` },
});
