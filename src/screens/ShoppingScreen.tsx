/**
 * @file
 * 장보기 목록을 표시하고 상단 추가 버튼으로 품목 입력 화면을 연다.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PrimaryButton } from '@/components/PrimaryButton';
import { deleteShoppingItems, getShoppingItems } from '@/db/shoppingRepository';
import type { ShoppingItem } from '@/db/shoppingRepository';
import type { MainTabParamList } from '@/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { HEADER_CONTENT_HEIGHT, HEADER_ICON_INSET, HEADER_ICON_SIZE, getHeaderStyles } from '@/theme/headerStyles';
import { useTranslation } from '@/i18n/LanguageProvider';
import { alertTitles } from '@/constants/alertTitles';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';

type ShoppingScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Shopping'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function ShoppingScreen({ navigation }: ShoppingScreenProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const { isLoading, showLoading, hasLoaded, runLoad, cancelLoad } = useDelayedLoading();
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleting = useRef(false);

  // 등록 화면에서 돌아오면 저장된 순서대로 목록을 다시 읽는다.
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
    void loadItems();
    return () => { cancelLoad(); setIsSelecting(false); setSelectedIds([]); };
  }, [cancelLoad, loadItems]));

  function requestDelete() {
    if (deleting.current || selectedIds.length === 0) return;
    const targets = selectedIds;
    deleting.current = true;
    setIsDeleting(true);
    const unlock = () => { deleting.current = false; setIsDeleting(false); };
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
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t(isSelecting ? 'ingredient.selectAll' : 'ingredient.select')}
          disabled={isLoading || hasLoadError || isDeleting || items.length === 0}
          onPress={() => { if (!isSelecting) setIsSelecting(true); else setSelectedIds(selectedIds.length === items.length ? [] : items.map(item => item.id)); }}
          style={[styles.headerButton, styles.leftButton]}>
          <MaterialDesignIcons name={isSelecting ? 'check-all' : 'check'} size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
        </FeedbackPressable>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{t('tabs.shopping')}</Text>
        <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t(isSelecting ? 'ingredient.cancelSelection' : 'shopping.add')}
          accessibilityState={{ disabled: isLoading || hasLoadError || isDeleting }} disabled={isLoading || hasLoadError || isDeleting}
          onPress={() => { if (isSelecting) { setIsSelecting(false); setSelectedIds([]); } else navigation.navigate('ShoppingForm'); }} style={[styles.headerButton, styles.rightButton]}>
          <MaterialDesignIcons name={isSelecting ? 'close' : 'plus'} size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
        </FeedbackPressable>
      </View>
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
            <View style={styles.emptyState}>
              <MaterialDesignIcons name="tray-plus" size={40} color={colors.textMuted} accessible={false} />
              <Text style={styles.emptyTitle}>{t('shopping.empty')}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <FeedbackPressable accessibilityRole={isSelecting ? 'checkbox' : undefined}
              accessibilityLabel={isSelecting ? t('shopping.selectItem', { name: item.name }) : undefined}
              accessibilityState={isSelecting ? { checked: selectedIds.includes(item.id), disabled: isDeleting } : undefined}
              interactionBlocked={!isSelecting || isDeleting} feedback="none"
              onPress={() => setSelectedIds(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])}
              style={[styles.item, isSelecting && styles.selectableItem, isSelecting && selectedIds.includes(item.id) && styles.selectedItem]}>
              {isSelecting ? selectedIds.includes(item.id) ? <MaterialDesignIcons name="checkbox-marked-circle" size={24} color={colors.chilled} accessible={false} /> : <View style={styles.selectionCircleContainer}><View style={styles.selectionCircle} /></View> : null}
              <View style={styles.itemDetails}>
                <Text style={styles.name}>{item.name}<Text style={styles.quantity}>  {item.quantity}</Text></Text>
                {item.memo ? <Text style={styles.memo}>{item.memo}</Text> : null}
              </View>
            </FeedbackPressable>
          )}
        />
        {isSelecting ? <View style={styles.selectionToolbar}>
          <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('shopping.deleteSelected')}
            accessibilityState={{ disabled: selectedIds.length === 0 || isDeleting }} disabled={selectedIds.length === 0 || isDeleting}
            feedback="none" onPress={requestDelete} style={styles.selectionAction}>
            {({ pressed }) => <><MaterialDesignIcons name="trash-can-outline" size={24} color={pressed ? colors.errorPressed : colors.error} accessible={false} />
              <Text style={[styles.deleteLabel, pressed && { color: colors.errorPressed }]}>{t('common.delete')}</Text></>}
          </FeedbackPressable>
        </View> : null}
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
  listContent: { paddingBottom: spacing.lg },
  feedback: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.md, gap: spacing.md },
  error: { color: colors.error, marginTop: spacing.xs },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: spacing.lg, gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  item: {
    padding: spacing.md, gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  selectableItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selectedItem: { backgroundColor: colors.chilledBackground },
  itemDetails: { flex: 1, gap: spacing.xs },
  selectionCircleContainer: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  selectionCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.textMuted },
  selectionToolbar: { height: 50, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  selectionAction: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  deleteLabel: { color: colors.error, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  name: { color: colors.text, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  quantity: { fontSize: 17, fontWeight: '400' },
  memo: { color: colors.textMuted, fontSize: 15 },
}));
