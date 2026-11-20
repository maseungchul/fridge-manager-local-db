/**
 * @file
 * 소비 완료한 재료를 최근 순으로 표시하고 원래 위치 복구·영구 삭제를 처리한다.
 * 원래 위치를 사용할 수 없으면 공통 냉장고 도면의 위치 선택 화면으로 연결한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Alert, BackHandler, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { EmptyListState } from '@/components/EmptyListState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useToast } from '@/components/ToastProvider';
import { deleteConsumedIngredient, getConsumedIngredients, restoreConsumedIngredient } from '@/db/ingredientRepository';
import type { ConsumedIngredient } from '@/features/ingredient/model/ingredient';
import { useTranslation } from '@/i18n/LanguageProvider';
import { getErrorMessage } from '@/i18n/errors';
import { formatDate } from '@/i18n/translations';
import type { HomeStackParamList } from '@/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { HEADER_CONTENT_HEIGHT, COMPACT_HEADER_ICON_INSET, COMPACT_HEADER_ICON_SIZE, getCompactHeaderStyles } from '@/theme/headerStyles';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

export type ConsumedActions = { disabled: boolean; onRestore: () => void; onDelete: () => void };

type ConsumedIngredientsScreenProps = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'ConsumedIngredients'>,
  NativeStackScreenProps<RootStackParamList>
> & { onInteractionBlockedChange: (blocked: boolean) => void; onSelectionModeChange: (actions: ConsumedActions | null) => void };

export function ConsumedIngredientsScreen({ navigation, onInteractionBlockedChange, onSelectionModeChange }: ConsumedIngredientsScreenProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const showToast = useToast();
  const db = useSQLiteContext();
  const [records, setRecords] = useState<ConsumedIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = records.filter(item => selectedIds.includes(item.id));
  const allSelected = records.length > 0 && selected.length === records.length;
  const busy = useRef(false);
  const loadRequest = useRef(0);

  const loadRecords = useCallback(async () => {
    const request = ++loadRequest.current;
    setIsLoading(true);
    setHasError(false);

    try {
      const result = await getConsumedIngredients(db);
      if (request === loadRequest.current) setRecords(result);
    } catch {
      if (request === loadRequest.current) setHasError(true);
    } finally {
      if (request === loadRequest.current) setIsLoading(false);
    }
  }, [db]);
  useFocusEffect(useCallback(() => {
    void loadRecords();
    return () => { loadRequest.current++; };
  }, [loadRecords]));

  useEffect(() => {
    onInteractionBlockedChange(isBusy);
    return () => onInteractionBlockedChange(false);
  }, [isBusy, onInteractionBlockedChange]);
  usePreventRemove(isBusy, () => undefined);

  function unlock() {
    busy.current = false;
    setIsBusy(false);
  }

  const finishSelection = useCallback(() => {
    setIsSelecting(false);
    setSelectedIds([]);
  }, []);

  useFocusEffect(useCallback(() => {
    if (!isSelecting) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy.current) finishSelection();
      return true;
    });
    return () => subscription.remove();
  }, [finishSelection, isSelecting]));

  async function restore() {
    if (busy.current || isLoading || hasError || selected.length === 0) return;
    busy.current = true;
    setIsBusy(true);

    try {
      // 새 위치가 필요한 기록은 기존 위치 선택 화면에서 개별 복구한다.
      for (const record of selected) {
        const restored = await restoreConsumedIngredient(db, record);
        if (!restored) {
          navigation.navigate('IngredientRestore', { id: record.id, consumedAt: record.consumedAt });
          return;
        }
        setRecords(current => current.filter(item => item.id !== record.id));
      }
      finishSelection();
      showToast(t('consumed.restored'));
    } catch (error) {
      Alert.alert(t('common.error'), getErrorMessage(error, t, t('consumed.restoreError')), [{ text: t('common.ok') }]);
    } finally {
      unlock();
    }
  }

  function requestDelete() {
    if (busy.current || isLoading || hasError || selected.length === 0) return;
    busy.current = true;
    setIsBusy(true);
    let handled = false;
    Alert.alert(t('common.warning'), t('ingredient.deleteSelectedConfirm', { count: selected.length }), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => {
        if (handled) return;
        handled = true;
        unlock();
      } },
      { text: t('consumed.delete'), style: 'destructive', onPress: async () => {
        if (handled) return;
        handled = true;
        try {
          await db.withExclusiveTransactionAsync(async transaction => {
            for (const record of selected) await deleteConsumedIngredient(transaction, record);
          });
          setRecords(current => current.filter(item => !selectedIds.includes(item.id)));
          finishSelection();
        } catch (error) {
          Alert.alert(t('common.error'), getErrorMessage(error, t, t('consumed.deleteError')), [{ text: t('common.ok') }]);
        } finally {
          unlock();
        }
      } },
    ], { cancelable: false });
  }

  const actionHandlers = useRef({ restore, requestDelete });
  useEffect(() => { actionHandlers.current = { restore, requestDelete }; });
  const actionsDisabled = isBusy || isLoading || hasError || selected.length === 0;
  useFocusEffect(useCallback(() => {
    if (!isSelecting) return;
    onSelectionModeChange({ disabled: actionsDisabled, onRestore: () => void actionHandlers.current.restore(),
      onDelete: () => actionHandlers.current.requestDelete() });
    return () => onSelectionModeChange(null);
  }, [actionsDisabled, isSelecting, onSelectionModeChange]));

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.headerSide, isSelecting && styles.selectionHeaderLeft]}>
          {!isSelecting && (
            <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t('more.back')}
              disabled={isBusy} accessibilityState={{ disabled: isBusy }} onPress={() => { if (!busy.current) navigation.goBack(); }}
              style={[styles.headerButton, styles.backButton]}>
              <MaterialDesignIcons name="arrow-left" size={COMPACT_HEADER_ICON_SIZE} color={colors.text} accessible={false} />
            </FeedbackPressable>
          )}
          <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t(isSelecting ? 'ingredient.selectAll' : 'ingredient.select')}
            disabled={isBusy || isLoading || hasError || records.length === 0}
            accessibilityState={isSelecting ? { selected: allSelected } : undefined}
            onPress={() => {
              if (busy.current) return;
              if (!isSelecting) setIsSelecting(true);
              else setSelectedIds(allSelected ? [] : records.map(item => item.id));
            }} style={styles.headerButton}>
            <MaterialDesignIcons name={isSelecting ? 'check-all' : 'check'} size={COMPACT_HEADER_ICON_SIZE}
              color={allSelected ? colors.chilled : colors.text} accessible={false} />
          </FeedbackPressable>
        </View>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{t('consumed.title')}</Text>
        <View style={[styles.headerSide, styles.headerRight, isSelecting && styles.selectionHeaderRight]}>
          {isSelecting && <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t('ingredient.cancelSelection')}
            disabled={isBusy} onPress={finishSelection} style={styles.headerButton}>
            <MaterialDesignIcons name="close" size={COMPACT_HEADER_ICON_SIZE} color={colors.text} accessible={false} />
          </FeedbackPressable>}
        </View>
      </View>
      {isLoading ? <View style={styles.feedback}><ActivityIndicator color={colors.text} accessibilityLabel={t('consumed.loading')} /></View>
        : hasError ? <View style={styles.feedback}>
          <Text accessibilityRole="alert" style={styles.error}>{t('consumed.loadError')}</Text>
          <PrimaryButton label={t('common.retry')} variant="secondary" onPress={loadRecords} style={styles.retry} />
        </View> : (
          <FlatList data={records} keyExtractor={item => item.id} extraData={selectedIds} style={styles.list}
            contentContainerStyle={records.length === 0 ? styles.empty : styles.listContent}
            ListEmptyComponent={<EmptyListState message={t('consumed.emptyTitle')} description={t('consumed.emptyGuide')} />}
            renderItem={({ item }) => {
              const date = new Date(item.consumedAt);
              const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
              const checked = selectedIds.includes(item.id);
              const content = (
                <View style={styles.itemContent}>
                  <Text style={styles.name}>{item.name}<Text style={styles.quantity}>  {item.quantity}</Text></Text>
                  {item.memo ? <Text style={styles.detail}>{item.memo}</Text> : null}
                  <Text style={styles.detail}>{item.expirationDate ? t('consumed.expiration', { date: formatDate(item.expirationDate, t) }) : t('ingredient.noExpiration')}</Text>
                  <Text style={styles.detail}>{t('consumed.date', { date: formatDate(localDate, t) })}</Text>
                </View>
              );
              return isSelecting ? (
                <FeedbackPressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled: isBusy }}
                  disabled={isBusy} onPress={() => {
                    if (!busy.current) setSelectedIds(current => current.includes(item.id)
                      ? current.filter(id => id !== item.id) : [...current, item.id]);
                  }} style={[styles.item, checked && styles.checkedItem]}>
                  <MaterialDesignIcons name={checked ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={24}
                    color={checked ? colors.chilled : colors.textMuted} accessible={false} />
                  {content}
                </FeedbackPressable>
              ) : <View style={styles.item}>{content}</View>;
            }} />
        )}
    </SafeAreaView>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  ...getCompactHeaderStyles(mode),
  header: { ...getCompactHeaderStyles(mode).header, gap: 0 },
  title: { ...getCompactHeaderStyles(mode).title, flex: 1, textAlign: 'center' },
  headerSide: { width: HEADER_CONTENT_HEIGHT * 2 - spacing.sm, flexDirection: 'row' },
  headerRight: { justifyContent: 'flex-end' },
  selectionHeaderLeft: { width: HEADER_CONTENT_HEIGHT, marginLeft: -COMPACT_HEADER_ICON_INSET },
  selectionHeaderRight: { width: HEADER_CONTENT_HEIGHT, marginRight: -COMPACT_HEADER_ICON_INSET },
  headerButton: { width: HEADER_CONTENT_HEIGHT, height: HEADER_CONTENT_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  backButton: { marginLeft: -spacing.sm },
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.lg },
  empty: { flexGrow: 1, justifyContent: 'center' },
  feedback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  error: { color: colors.error, fontSize: 16, textAlign: 'center' },
  retry: { alignSelf: 'stretch' },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.lg, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemContent: { flex: 1, gap: spacing.xs },
  checkedItem: { backgroundColor: colors.chilledBackground },
  name: { color: colors.text, fontSize: 17, fontWeight: '600' },
  quantity: { fontWeight: '400' },
  detail: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
}));
