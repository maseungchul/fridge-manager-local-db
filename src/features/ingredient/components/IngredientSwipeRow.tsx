/**
 * @file
 * 네이티브 가로 스크롤로 이동목록 담기·삭제 버튼을 표시하고, 세로 이동은 목록 스크롤에 맡긴다.
 * 열린 행과 재료 변경 요청은 호출자가 관리하며, 이 컴포넌트는 스크롤·버튼 표시만 처리한다.
 */
import { useEffect, useRef } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { colors, spacing } from '@/theme/tokens';
import { useTranslation } from '@/i18n/LanguageProvider';

interface IngredientSwipeRowProps {
  children: ReactNode;
  name: string;
  width: number;
  isOpen: boolean;
  disabled: boolean;
  isQueued: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEnqueue: () => void;
  onDelete: () => void;
}

const ACTIONS_WIDTH = 144;
const SNAP_OFFSETS = [0, ACTIONS_WIDTH];

export function IngredientSwipeRow({ children, name, width, isOpen, disabled, isQueued, onOpen, onClose, onEnqueue, onDelete }: IngredientSwipeRowProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const swipe = useRef({ dragging: false, pending: false });

  useEffect(() => {
    if (swipe.current.dragging) return;
    swipe.current.pending = false;
    scrollRef.current?.scrollTo({ x: isOpen ? ACTIONS_WIDTH : 0, animated: true });
  }, [isOpen, width]);

  function finishSwipe(offset: number) {
    if (!swipe.current.pending) return;
    swipe.current.pending = false;
    if (offset >= ACTIONS_WIDTH / 2) onOpen();
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
        <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('queue.enqueueItem', { name, action: t(isQueued ? 'queue.enqueued' : 'queue.enqueue') })}
          accessibilityState={{ disabled: disabled || isQueued }} disabled={disabled || isQueued}
          onPress={() => { if (!disabled && !isQueued) onEnqueue(); }} style={[styles.actionButton, styles.moveButton]}>
          <MaterialDesignIcons name={isQueued ? 'clipboard-check-outline' : 'clipboard-plus-outline'} size={24} color={colors.chilled} accessible={false} />
        </FeedbackPressable>
        <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('ingredient.deleteItem', { name })}
          accessibilityState={{ disabled }} disabled={disabled} feedback="danger" onPress={onDelete} style={[styles.actionButton, styles.deleteButton]}>
          <MaterialDesignIcons name="trash-can-outline" size={24} color={colors.error} accessible={false} />
        </FeedbackPressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexGrow: 0 },
  content: { backgroundColor: colors.surface },
  action: { width: ACTIONS_WIDTH, flexDirection: 'row', gap: spacing.md,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  actionButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  moveButton: { backgroundColor: `${colors.sageLight}80` },
  deleteButton: { backgroundColor: `${colors.rose}33` },
});
