/**
 * @file
 * 홈에서 임시이동목록을 확인·정리하는 공통 바텀 시트를 표시한다.
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
import { createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { HEADER_ICON_INSET, HEADER_ICON_SIZE, getHeaderStyles } from '@/theme/headerStyles';
import { useTranslation } from '@/i18n/LanguageProvider';

interface IngredientMoveQueueSheetProps {
  ingredients: Ingredient[];
  layout: FridgeLayout;
  onClose: () => void;
}

export function IngredientMoveQueueSheet({ ingredients, layout, onClose }: IngredientMoveQueueSheetProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
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
    <IngredientSheet ref={sheet} disabled={false} onClose={onClose} header={
        <View style={styles.header}>
          <View style={[styles.clearButton, styles.leftSpacer]} pointerEvents="none" />
          <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.title}>{t('queue.title', { count: ingredients.length })}</Text>
          <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t('queue.clear')}
            disabled={ingredients.length === 0} accessibilityState={{ disabled: ingredients.length === 0 }}
            onPress={clear} style={[styles.clearButton, styles.rightButton]}>
            <MaterialDesignIcons name="clipboard-remove-outline" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
          </FeedbackPressable>
        </View>
    }>
      <View style={styles.panel} onAccessibilityEscape={() => sheet.current?.close()}>
        <IngredientMoveQueueList ingredients={ingredients} layout={layout} disabled={false} onRemove={remove} />
      </View>
    </IngredientSheet>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  panel: { flex: 1, backgroundColor: colors.surface },
  header: { ...getHeaderStyles(mode).header, justifyContent: 'space-between' },
  title: { ...getHeaderStyles(mode).title, flex: 1, textAlign: 'center' },
  clearButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  leftSpacer: { marginLeft: -HEADER_ICON_INSET },
  rightButton: { marginRight: -HEADER_ICON_INSET },
}));
