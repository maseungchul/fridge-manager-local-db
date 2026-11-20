/**
 * @file
 * 소비 완료한 재료를 최근 순으로 표시하고 원래 위치 복구·영구 삭제를 처리한다.
 * 원래 위치를 사용할 수 없으면 공통 냉장고 도면의 위치 선택 화면으로 연결한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, BackHandler, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheetFlatList as FlatList } from '@gorhom/bottom-sheet';
import { BottomSheet, type BottomSheetRef } from '@/features/ingredient/components/BottomSheet';
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
import { HEADER_CONTENT_HEIGHT, COMPACT_HEADER_ICON_INSET, COMPACT_HEADER_ICON_SIZE, getCompactHeaderStyles } from '@/theme/headerStyles';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

type RestoreRecord = Pick<ConsumedIngredient, 'id' | 'consumedAt'>;

interface ConsumedIngredientsScreenProps {
  onClose: () => void;
  onRecordsLoaded: () => void;
  onPickRestorePosition: (record: RestoreRecord) => void;
}

export function ConsumedIngredientsScreen({ onClose, onRecordsLoaded, onPickRestorePosition }: ConsumedIngredientsScreenProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const insets = useSafeAreaInsets();
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
  const sheet = useRef<BottomSheetRef>(null);
  const [pendingRestore, setPendingRestore] = useState<RestoreRecord | null>(null);

  const loadRecords = useCallback(async () => {
    const request = ++loadRequest.current;
    setIsLoading(true);
    setHasError(false);

    try {
      const result = await getConsumedIngredients(db);
      if (request === loadRequest.current) {
        setRecords(result);
        onRecordsLoaded();
      }
    } catch {
      if (request === loadRequest.current) setHasError(true);
    } finally {
      if (request === loadRequest.current) setIsLoading(false);
    }
  }, [db, onRecordsLoaded]);
  useFocusEffect(useCallback(() => {
    void loadRecords();
    return () => { loadRequest.current++; };
  }, [loadRecords]));

  // 위치 선택 화면이 시트 아래에 열리지 않도록 닫기 완료까지 기다린다.
  useEffect(() => {
    if (pendingRestore && !isBusy) sheet.current?.close();
  }, [isBusy, pendingRestore]);

  function unlock() {
    busy.current = false;
    setIsBusy(false);
  }

  const finishSelection = useCallback(() => {
    setIsSelecting(false);
    setSelectedIds([]);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy.current) {
        if (isSelecting) finishSelection();
        else sheet.current?.close();
      }
      return true;
    });
    return () => subscription.remove();
  }, [finishSelection, isSelecting]);

  async function restore() {
    if (busy.current || isLoading || hasError || selected.length === 0) return;
    busy.current = true;
    setIsBusy(true);

    try {
      // 새 위치가 필요한 기록은 기존 위치 선택 화면에서 개별 복구한다.
      for (const record of selected) {
        const restored = await restoreConsumedIngredient(db, record);
        if (!restored) {
          setPendingRestore({ id: record.id, consumedAt: record.consumedAt });
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

  const actionsDisabled = isBusy || isLoading || hasError || selected.length === 0;

  return (
    <BottomSheet ref={sheet} disabled={isBusy} onClose={() => {
      onClose();
      if (pendingRestore) onPickRestorePosition(pendingRestore);
    }} header={
      <View style={styles.header}>
        <View style={[styles.headerSide, styles.selectionHeaderLeft]}>
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
        {isSelecting ? (
          <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t('ingredient.cancelSelection')}
            disabled={isBusy} onPress={() => { if (!busy.current) finishSelection(); }}
            style={[styles.headerButton, styles.selectionHeaderRight]}>
            <MaterialDesignIcons name="close" size={COMPACT_HEADER_ICON_SIZE} color={colors.text} accessible={false} />
          </FeedbackPressable>
        ) : <View style={[styles.headerButton, styles.selectionHeaderRight]} />}
      </View>
    }>
      <View style={styles.container}>
      {isLoading ? <View style={styles.feedback}><ActivityIndicator color={colors.text} accessibilityLabel={t('consumed.loading')} /></View>
        : hasError ? <View style={styles.feedback}>
          <Text accessibilityRole="alert" style={styles.error}>{t('consumed.loadError')}</Text>
          <PrimaryButton label={t('common.retry')} variant="secondary" onPress={loadRecords} style={styles.retry} />
        </View> : (
          <FlatList data={records} keyExtractor={item => item.id} extraData={selectedIds}
            showsVerticalScrollIndicator indicatorStyle={mode === 'dark' ? 'white' : 'black'} automaticallyAdjustsScrollIndicatorInsets={false}
            scrollIndicatorInsets={{ top: 0, bottom: spacing.md + (isSelecting ? 0 : insets.bottom), left: 0, right: spacing.xs }}
            style={styles.list} contentContainerStyle={[records.length === 0 ? styles.empty : undefined, { paddingBottom: isSelecting ? 0 : insets.bottom }]}
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
                  {checked ? (
                    <MaterialDesignIcons name="checkbox-marked-circle" size={24} color={colors.chilled} accessible={false} />
                  ) : <View style={styles.selectionCircleContainer}><View style={styles.selectionCircle} /></View>}
                  {content}
                </FeedbackPressable>
              ) : <View style={styles.item}>{content}</View>;
            }} />
        )}
      {isSelecting ? (
        <View style={[styles.selectionToolbar, { height: 50 + insets.bottom, paddingBottom: insets.bottom,
          paddingLeft: spacing.sm + insets.left, paddingRight: spacing.sm + insets.right }]}>
          <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('consumed.restore')}
            disabled={actionsDisabled} accessibilityState={{ disabled: actionsDisabled }}
            feedback="none" onPress={restore} style={styles.selectionAction}>
            {({ pressed }) => <>
              <MaterialDesignIcons name="restore" size={24} color={pressed ? colors.iconPressed : colors.text} accessible={false} />
              <Text style={[styles.restoreLabel, pressed && { color: colors.iconPressed }]}>{t('consumed.restore')}</Text>
            </>}
          </FeedbackPressable>
          <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('consumed.delete')}
            disabled={actionsDisabled} accessibilityState={{ disabled: actionsDisabled }}
            feedback="none" onPress={requestDelete} style={styles.selectionAction}>
            {({ pressed }) => <>
              <MaterialDesignIcons name="trash-can-outline" size={24} color={pressed ? colors.errorPressed : colors.error} accessible={false} />
              <Text style={[styles.deleteLabel, pressed && { color: colors.errorPressed }]}>{t('consumed.delete')}</Text>
            </>}
          </FeedbackPressable>
        </View>
      ) : null}
      </View>
    </BottomSheet>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  ...getCompactHeaderStyles(mode),
  header: { ...getCompactHeaderStyles(mode).header, gap: 0 },
  title: { ...getCompactHeaderStyles(mode).title, flex: 1, textAlign: 'center' },
  headerSide: { flexDirection: 'row' },
  selectionHeaderLeft: { width: HEADER_CONTENT_HEIGHT, marginLeft: -COMPACT_HEADER_ICON_INSET },
  selectionHeaderRight: { width: HEADER_CONTENT_HEIGHT, marginRight: -COMPACT_HEADER_ICON_INSET },
  headerButton: { width: HEADER_CONTENT_HEIGHT, height: HEADER_CONTENT_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  selectionToolbar: { flexDirection: 'row', flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  selectionAction: { flex: 1, minHeight: 48, marginHorizontal: spacing.xs, paddingTop: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  restoreLabel: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  deleteLabel: { color: colors.error, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  list: { flex: 1 },
  empty: { flexGrow: 1, justifyContent: 'center' },
  feedback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  error: { color: colors.error, fontSize: 16, textAlign: 'center' },
  retry: { alignSelf: 'stretch' },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.lg, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemContent: { flex: 1, gap: spacing.xs },
  checkedItem: { backgroundColor: colors.chilledBackground },
  selectionCircleContainer: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  selectionCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.textMuted },
  name: { color: colors.text, fontSize: 17, fontWeight: '600' },
  quantity: { fontWeight: '400' },
  detail: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
}));
