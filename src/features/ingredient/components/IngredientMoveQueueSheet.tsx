/**
 * @file
 * 홈에서 임시이동목록을 확인·정리하는 공통 바텀 시트를 표시한다.
 * 기존 대기 목록을 재사용하고, 종료 후 홈 도면의 상태는 호출자가 유지한다.
 */
import { useEffect, useRef } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { BottomSheet } from '@/features/ingredient/components/BottomSheet';
import type { BottomSheetRef } from '@/features/ingredient/components/BottomSheet';
import { IngredientMoveQueueHeader, IngredientMoveQueueList, useMoveQueueSelection } from '@/features/ingredient/components/IngredientMoveQueueList';
import { useIngredientMoveQueue } from '@/features/ingredient/IngredientMoveQueueProvider';
import type { FridgeLayout } from '@/features/fridge/model/fridgeLayout';
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import { createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

interface IngredientMoveQueueSheetProps {
  ingredients: Ingredient[];
  layout: FridgeLayout;
  onClose: () => void;
}

export function IngredientMoveQueueSheet({ ingredients, layout, onClose }: IngredientMoveQueueSheetProps) {
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  const sheet = useRef<BottomSheetRef>(null);
  const { remove } = useIngredientMoveQueue();
  const selection = useMoveQueueSelection();
  const { selectedIds, setSelectedIds } = selection;
  const isSelecting = selectedIds !== null;
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isSelecting) setSelectedIds(null);
      else sheet.current?.close();
      return true;
    });
    return () => subscription.remove();
  }, [isSelecting, setSelectedIds]);

  return (
    <BottomSheet ref={sheet} disabled={false} onClose={onClose} header={
      <IngredientMoveQueueHeader ingredients={ingredients} selection={selection} disabled={false} />
    }>
      <View style={styles.panel} onAccessibilityEscape={() => {
        if (isSelecting) setSelectedIds(null);
        else sheet.current?.close();
      }}>
        <IngredientMoveQueueList ingredients={ingredients} layout={layout} disabled={false} selection={selection} onRemove={remove} />
      </View>
    </BottomSheet>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  panel: { flex: 1, backgroundColor: colors.surface },
}));
