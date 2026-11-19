/**
 * @file
 * 재료 패널에서 구매 완료 품목을 불러오고 여러 품목의 선택을 관리한다.
 * 패널을 나가면 선택을 버린다.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { EmptyListState } from '@/components/EmptyListState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getShoppingItems } from '@/db/shoppingRepository';
import type { ShoppingItem } from '@/db/shoppingRepository';
import { ShoppingItemRow } from '@/features/shopping/components/ShoppingItemRow';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { useTranslation } from '@/i18n/LanguageProvider';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

export function PurchasedItemPicker({ disabled }: { disabled: boolean }) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { isLoading, showLoading, runLoad } = useDelayedLoading();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const loadItems = useCallback(() => runLoad(async isCurrent => {
    setHasLoadError(false);
    try {
      const items = await getShoppingItems(db);
      if (isCurrent()) setItems(items.filter(item => item.purchasedAt !== null));
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
        </View>
      ) : null}
    </>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  list: { flex: 1 },
  empty: { flexGrow: 1, justifyContent: 'center' },
  feedback: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.md, gap: spacing.md },
  error: { color: colors.error, textAlign: 'center' },
  footer: { flexShrink: 0, paddingHorizontal: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  count: { color: colors.text, textAlign: 'center', fontSize: 15, fontWeight: '600' },
}));
