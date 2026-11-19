/**
 * @file
 * 구매 완료 품목의 선택을 관리하고 헤더에서 현재 칸으로 등록하는 동작을 제공한다.
 */
import { useLayoutEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyListState } from '@/components/EmptyListState';
import { alertTitles } from '@/constants/alertTitles';
import { preparePurchasedIngredientRegistrations } from '@/db/shoppingRepository';
import type { PurchasedIngredientRegistration, PurchasedShoppingItem } from '@/db/shoppingRepository';
import { ShoppingItemRow } from '@/features/shopping/components/ShoppingItemRow';
import { getErrorMessage } from '@/i18n/errors';
import { useTranslation } from '@/i18n/LanguageProvider';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

export interface PurchasedSelectionAction {
  allSelected: boolean;
  toggle: () => void;
  register?: () => void;
}

interface PurchasedItemPickerProps {
  disabled: boolean;
  items: PurchasedShoppingItem[];
  onRegister: (registrations: readonly PurchasedIngredientRegistration[]) => Promise<void>;
  onSelectionActionChange: (action: PurchasedSelectionAction | null) => void;
}

export function PurchasedItemPicker({ disabled, items, onRegister, onSelectionActionChange }: PurchasedItemPickerProps) {
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const allSelected = items.length > 0 && items.every(item => selectedIds.has(item.id));
  useLayoutEffect(() => {
    onSelectionActionChange(items.length > 0 ? {
      allSelected,
      toggle: () => setSelectedIds(allSelected ? new Set() : new Set(items.map(item => item.id))),
      register: selectedIds.size > 0 ? async () => {
        const selected = items.filter(item => selectedIds.has(item.id));
        try {
          await onRegister(preparePurchasedIngredientRegistrations(selected));
        } catch (cause) {
          Alert.alert(t(alertTitles.error), getErrorMessage(cause, t, t('ingredient.saveError')));
        }
      } : undefined,
    } : null);
    return () => onSelectionActionChange(null);
  }, [allSelected, items, onRegister, onSelectionActionChange, selectedIds, t]);

  function toggleItem(id: string) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <BottomSheetFlatList data={items} extraData={selectedIds} keyExtractor={item => item.id}
      indicatorStyle={mode === 'dark' ? 'white' : 'black'} automaticallyAdjustsScrollIndicatorInsets={false}
      scrollIndicatorInsets={{ top: 0, bottom: spacing.md + insets.bottom, left: 0, right: spacing.xs }}
      style={styles.list} contentContainerStyle={[items.length === 0 && styles.empty, { paddingBottom: insets.bottom }]}
      ListEmptyComponent={<EmptyListState message={t('shopping.purchasedEmpty')} description={t('shopping.purchasedEmptyGuide')} />}
      renderItem={({ item }) => (
        <ShoppingItemRow item={item} selected={selectedIds.has(item.id)} disabled={disabled} onPress={() => toggleItem(item.id)} />
      )} />
  );
}

const getStyles = createThemedStyles(() => StyleSheet.create({
  list: { flex: 1 },
  empty: { flexGrow: 1, justifyContent: 'center' },
}));
