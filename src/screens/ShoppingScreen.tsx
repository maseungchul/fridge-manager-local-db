/**
 * @file
 * 장보기 목록과 장본리스트를 관리하고 선택한 구매 완료 품목을 보관 위치 선택 화면에 전달한다.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { EmptyListState } from '@/components/EmptyListState';
import { IconChipTabs } from '@/components/IconChipTabs';
import { PrimaryButton } from '@/components/PrimaryButton';
import { deleteShoppingItems, getShoppingItems, setShoppingItemsPurchased } from '@/db/shoppingRepository';
import type { PurchasedShoppingItem } from '@/db/shoppingRepository';
import { ShoppingItemRow } from '@/features/shopping/components/ShoppingItemRow';
import type { MainTabParamList } from '@/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { HEADER_CONTENT_HEIGHT, HEADER_ICON_INSET, HEADER_ICON_SIZE, getHeaderStyles } from '@/theme/headerStyles';
import { useTranslation } from '@/i18n/LanguageProvider';
import { alertTitles } from '@/constants/alertTitles';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';

export interface ShoppingSelectionActions {
  disabled: boolean;
  isUndo: boolean;
  onPurchase: () => void;
  onDelete?: () => void;
  onRegister?: () => void;
}

type ShoppingScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Shopping'>,
  NativeStackScreenProps<RootStackParamList>
> & { onSelectionModeChange: (actions: ShoppingSelectionActions | null) => void };

const shoppingTabs = [
  { id: 'planned', label: 'shopping.plannedTab', icon: 'format-list-bulleted' },
  { id: 'purchased', label: 'shopping.purchasedTab', icon: 'shopping-outline' },
] as const;

type ShoppingTab = (typeof shoppingTabs)[number]['id'];

export function ShoppingScreen({ navigation, onSelectionModeChange }: ShoppingScreenProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const [activeTab, setActiveTab] = useState<ShoppingTab>('planned');
  const [allItems, setItems] = useState<Awaited<ReturnType<typeof getShoppingItems>>>([]);
  const { isLoading, showLoading, hasLoaded, runLoad, cancelLoad } = useDelayedLoading();
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processing = useRef(false);
  const openingRegistration = useRef(false);
  const isPlannedTab = activeTab === 'planned';
  const items = allItems.filter(item => (item.purchasedAt === null) === isPlannedTab);
  const allSelected = isSelecting && items.length > 0 && items.every(item => selectedIds.includes(item.id));

  // 품목 입력이나 재료 등록에서 돌아오면 저장 결과를 반영한다.
  const loadItems = useCallback(() => runLoad(async isCurrent => {
    setHasLoadError(false);

    try {
      const result = await getShoppingItems(db);
      if (isCurrent()) setItems(result);
    } catch {
      if (isCurrent()) setHasLoadError(true);
    }
  }), [db, runLoad]);

  useFocusEffect(useCallback(() => {
    openingRegistration.current = false;
    void loadItems();
    return () => { cancelLoad(); setIsSelecting(false); setSelectedIds([]); };
  }, [cancelLoad, loadItems]));

  // 하단 장보기 탭을 다시 눌러도 구매 예정 목록부터 보여 준다.
  useEffect(() => navigation.addListener('tabPress', () => {
    setActiveTab('planned');
  }), [navigation]);

  const requestDelete = useCallback(() => {
    if (processing.current || openingRegistration.current || selectedIds.length === 0) return;
    const targets = selectedIds;
    processing.current = true;
    setIsProcessing(true);
    const unlock = () => { processing.current = false; setIsProcessing(false); };
    Alert.alert(t(alertTitles.warning), t('shopping.deleteConfirm', { count: targets.length }), [
      { text: t('common.cancel'), style: 'cancel', onPress: unlock },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        try {
          await deleteShoppingItems(db, targets);
          setItems(current => current.filter(item => !targets.includes(item.id)));
          setSelectedIds([]);
          setIsSelecting(false);
        } catch {
          Alert.alert(t(alertTitles.error), t('shopping.deleteError'));
        } finally { unlock(); }
      } },
    ], { cancelable: false });
  }, [db, selectedIds, t]);

  const changePurchaseState = useCallback(async () => {
    if (processing.current || openingRegistration.current || selectedIds.length === 0) return;
    processing.current = true;
    setIsProcessing(true);
    try {
      await setShoppingItemsPurchased(db, selectedIds, isPlannedTab);
      setSelectedIds([]);
      setIsSelecting(false);
      await loadItems();
    } catch {
      Alert.alert(t(alertTitles.error), t('shopping.purchaseError'));
    } finally {
      processing.current = false;
      setIsProcessing(false);
    }
  }, [db, isPlannedTab, loadItems, selectedIds, t]);

  const openRegistration = useCallback(() => {
    if (processing.current || openingRegistration.current || isLoading || hasLoadError) return;
    const items = allItems.filter((item): item is PurchasedShoppingItem =>
      item.purchasedAt !== null && selectedIds.includes(item.id));
    if (items.length === 0) return;
    openingRegistration.current = true;
    navigation.navigate('ShoppingIngredientRegistration', { items });
  }, [allItems, hasLoadError, isLoading, navigation, selectedIds]);

  useLayoutEffect(() => {
    onSelectionModeChange(isSelecting ? {
      disabled: selectedIds.length === 0 || isProcessing || isLoading || hasLoadError,
      isUndo: !isPlannedTab,
      onPurchase: changePurchaseState,
      onDelete: isPlannedTab ? requestDelete : undefined,
      onRegister: isPlannedTab ? undefined : openRegistration,
    } : null);
    return () => onSelectionModeChange(null);
  }, [isSelecting, selectedIds.length, isProcessing, isLoading, hasLoadError, isPlannedTab, changePurchaseState, requestDelete,
    openRegistration, onSelectionModeChange]);

  function openTab(tab: ShoppingTab) {
    if (tab === activeTab || processing.current || openingRegistration.current) return;
    setIsSelecting(false);
    setSelectedIds([]);
    setActiveTab(tab);
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        {(isPlannedTab || items.length > 0) ? <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t(isSelecting ? 'ingredient.selectAll' : 'ingredient.select')}
          disabled={isLoading || hasLoadError || isProcessing || items.length === 0}
          accessibilityState={isSelecting ? { selected: allSelected } : undefined}
          onPress={() => { if (!isSelecting) setIsSelecting(true); else setSelectedIds(allSelected ? [] : items.map(item => item.id)); }}
          style={[styles.headerButton, styles.leftButton]}>
          <MaterialDesignIcons name={isSelecting ? 'check-all' : 'check'} size={HEADER_ICON_SIZE}
            color={allSelected ? colors.chilled : colors.text} accessible={false} />
        </FeedbackPressable> : null}
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{t('tabs.shopping')}</Text>
        {isPlannedTab || isSelecting ? <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t(isSelecting ? 'ingredient.cancelSelection' : 'shopping.add')}
          accessibilityState={{ disabled: isLoading || hasLoadError || isProcessing }} disabled={isLoading || hasLoadError || isProcessing}
          onPress={() => { if (isSelecting) { setIsSelecting(false); setSelectedIds([]); } else navigation.navigate('ShoppingForm'); }} style={[styles.headerButton, styles.rightButton]}>
          <MaterialDesignIcons name={isSelecting ? 'close' : 'plus'} size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
        </FeedbackPressable> : items.length > 0 ? <View style={[styles.headerButton, styles.rightButton]} /> : null}
      </View>
      <IconChipTabs tabs={shoppingTabs.map(tab => ({ ...tab, label: t(tab.label) }))}
        activeTab={activeTab} onChange={openTab} interactionBlocked={isProcessing} style={styles.listTabs} />
      {isLoading && (!hasLoaded || showLoading) ? (
        <View style={styles.feedback}>
          {showLoading ? <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} /> : null}
        </View>
      ) : hasLoadError ? (
        <View style={styles.feedback}>
          <Text accessibilityRole="alert" style={styles.error}>{t('shopping.loadError')}</Text>
          <PrimaryButton label={t('common.retry')} variant="secondary" onPress={loadItems} />
        </View>
      ) : (
        <>
        <FlatList
          data={items} extraData={selectedIds} keyExtractor={item => item.id} indicatorStyle={mode === 'dark' ? 'white' : 'black'}
          contentContainerStyle={items.length === 0 ? styles.emptyList : styles.listContent}
          ListEmptyComponent={(
            <EmptyListState key={activeTab} message={t(isPlannedTab ? 'shopping.empty' : 'shopping.purchasedEmpty')}
              description={t(isPlannedTab ? 'shopping.emptyGuide' : 'shopping.purchasedEmptyGuide')} />
          )}
          renderItem={({ item }) => (
            <ShoppingItemRow item={item} selected={isSelecting ? selectedIds.includes(item.id) : undefined}
              disabled={isLoading || isProcessing}
              onPress={isSelecting || isPlannedTab ? () => {
                if (isSelecting) setSelectedIds(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id]);
                else navigation.navigate('ShoppingForm', { item });
              } : undefined} />
          )}
        />
        </>
      )}
    </SafeAreaView>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  ...getHeaderStyles(mode),
  title: { ...getHeaderStyles(mode).title, flex: 1, textAlign: 'center' },
  headerButton: { width: HEADER_CONTENT_HEIGHT, height: HEADER_CONTENT_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  leftButton: { marginLeft: -HEADER_ICON_INSET },
  rightButton: { marginRight: -HEADER_ICON_INSET },
  listTabs: { marginHorizontal: spacing.md, marginTop: 12, marginBottom: spacing.xs },
  listContent: { paddingBottom: spacing.lg },
  feedback: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.md, gap: spacing.md },
  error: { color: colors.error, marginTop: spacing.xs },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
}));
