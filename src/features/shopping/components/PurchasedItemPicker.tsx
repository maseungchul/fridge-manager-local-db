/**
 * @file
 * 재료 패널에서 구매 완료 품목을 불러오고 선택한 품목을 등록 확인 화면에 전달한다.
 * 확인을 취소하면 선택을 유지하고 패널을 나갈 때 버린다.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { EmptyListState } from '@/components/EmptyListState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getShoppingItems } from '@/db/shoppingRepository';
import type { PurchasedIngredientRegistration, PurchasedShoppingItem } from '@/db/shoppingRepository';
import { PurchasedIngredientReview } from '@/features/shopping/components/PurchasedIngredientReview';
import { ShoppingItemRow } from '@/features/shopping/components/ShoppingItemRow';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { useTranslation } from '@/i18n/LanguageProvider';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

interface PurchasedItemPickerProps {
  disabled: boolean;
  onRegister: (registrations: readonly PurchasedIngredientRegistration[]) => Promise<void>;
}

export function PurchasedItemPicker({ disabled, onRegister }: PurchasedItemPickerProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { isLoading, showLoading, runLoad } = useDelayedLoading();
  const [items, setItems] = useState<PurchasedShoppingItem[]>([]);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [reviewItems, setReviewItems] = useState<PurchasedShoppingItem[] | null>(null);

  const loadItems = useCallback(() => runLoad(async isCurrent => {
    setHasLoadError(false);
    try {
      const items = await getShoppingItems(db);
      if (isCurrent()) setItems(items.filter((item): item is PurchasedShoppingItem => item.purchasedAt !== null));
    } catch {
      if (isCurrent()) setHasLoadError(true);
    }
  }), [db, runLoad]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  function toggleItem(id: string) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return <View style={styles.feedback}>
      {showLoading ? <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} /> : null}
    </View>;
  }

  if (hasLoadError) {
    return <View style={styles.feedback}>
      <Text accessibilityRole="alert" style={styles.error}>{t('shopping.loadError')}</Text>
      <PrimaryButton label={t('common.retry')} variant="secondary" disabled={disabled} onPress={loadItems} />
    </View>;
  }

  return (
    <>
      <BottomSheetFlatList data={items} extraData={selectedIds} keyExtractor={item => item.id}
        indicatorStyle={mode === 'dark' ? 'white' : 'black'} automaticallyAdjustsScrollIndicatorInsets={false}
        scrollIndicatorInsets={{ top: 0, bottom: spacing.md + (items.length === 0 ? insets.bottom : 0), left: 0, right: spacing.xs }}
        style={styles.list} contentContainerStyle={items.length === 0 ? [styles.empty, { paddingBottom: insets.bottom }] : undefined}
        ListEmptyComponent={<EmptyListState message={t('shopping.purchasedEmpty')} description={t('shopping.purchasedEmptyGuide')} />}
        renderItem={({ item }) => (
          <ShoppingItemRow item={item} selected={selectedIds.has(item.id)} disabled={disabled} onPress={() => toggleItem(item.id)} />
        )} />
      {items.length > 0 ? (
        <View style={[styles.footer, { paddingBottom: spacing.sm + insets.bottom }]}>
          <Text accessibilityLiveRegion="polite" style={styles.count}>{t('shopping.selectedCount', { count: selectedIds.size })}</Text>
          <PrimaryButton label={t('shopping.reviewPurchased')} disabled={disabled || selectedIds.size === 0}
            onPress={() => setReviewItems(items.filter(item => selectedIds.has(item.id)))} />
        </View>
      ) : null}
      {reviewItems ? (
        <PurchasedIngredientReview items={reviewItems} onClose={() => setReviewItems(null)} onRegister={onRegister} />
      ) : null}
    </>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  list: { flex: 1 },
  empty: { flexGrow: 1, justifyContent: 'center' },
  feedback: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.md, gap: spacing.md },
  error: { color: colors.error, textAlign: 'center' },
  footer: { flexShrink: 0, gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  count: { color: colors.text, textAlign: 'center', fontSize: 15, fontWeight: '600' },
}));
