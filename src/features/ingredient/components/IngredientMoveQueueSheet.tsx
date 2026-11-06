/**
 * @file
 * 홈에서 임시이동목록을 확인·정리하는 네이티브 시트를 표시한다.
 * 기존 대기 목록을 재사용하고, 종료 후 홈 도면의 상태는 호출자가 유지한다.
 */
import { useEffect, useRef } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { IngredientSheet } from '@/features/ingredient/components/IngredientSheet';
import type { IngredientSheetRef } from '@/features/ingredient/components/IngredientSheet';
import { IngredientMoveQueueList } from '@/features/ingredient/components/IngredientMoveQueueList';
import { useIngredientMoveQueue } from '@/features/ingredient/IngredientMoveQueueProvider';
import type { FridgeLayout } from '@/features/fridge/model/fridgeLayout';
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import { colors, spacing } from '@/theme/tokens';

interface IngredientMoveQueueSheetProps {
  ingredients: Ingredient[];
  layout: FridgeLayout;
  onClose: () => void;
}

export function IngredientMoveQueueSheet({ ingredients, layout, onClose }: IngredientMoveQueueSheetProps) {
  const sheet = useRef<IngredientSheetRef>(null);
  const { remove, clear } = useIngredientMoveQueue();
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      sheet.current?.close();
      return true;
    });
    return () => subscription.remove();
  }, []);

  return (
    <IngredientSheet ref={sheet} disabled={false} onClose={onClose}>
      <View style={styles.panel} accessibilityViewIsModal onAccessibilityEscape={() => sheet.current?.close()}>
        <View style={styles.dragIndicator} pointerEvents="none" />
        <View style={styles.header}>
          <View style={styles.clearButton} pointerEvents="none" />
          <Text accessibilityRole="header" style={styles.title}>이동 대기 {ingredients.length}개</Text>
          <FeedbackPressable accessibilityRole="button" accessibilityLabel="이동 대기 목록 전체 비우기"
            disabled={ingredients.length === 0} accessibilityState={{ disabled: ingredients.length === 0 }}
            onPress={clear} style={styles.clearButton}>
            <MaterialDesignIcons name="clipboard-remove-outline" size={32} color={colors.text} accessible={false} />
          </FeedbackPressable>
        </View>
        <IngredientMoveQueueList ingredients={ingredients} layout={layout} disabled={false} onRemove={remove} />
      </View>
    </IngredientSheet>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: colors.surface },
  dragIndicator: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3,
    marginTop: spacing.xs, marginBottom: 5, backgroundColor: '#C4C4C4' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg,
    paddingTop: spacing.md, paddingBottom: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { flex: 1, color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '700', textAlign: 'center', includeFontPadding: false },
  clearButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
});
