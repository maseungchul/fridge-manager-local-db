/**
 * @file
 * 소비 완료한 재료를 최근 순으로 표시하고 원래 위치 복구·영구 삭제를 처리한다.
 * 원래 위치를 사용할 수 없으면 공통 냉장고 도면의 위치 선택 화면으로 연결한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useToast } from '@/components/ToastProvider';
import { deleteConsumedIngredient, getConsumedIngredients, restoreConsumedIngredient } from '@/db/ingredientRepository';
import type { ConsumedIngredient } from '@/features/ingredient/model/ingredient';
import { useTranslation } from '@/i18n/LanguageProvider';
import { getErrorMessage } from '@/i18n/errors';
import { formatDate } from '@/i18n/translations';
import type { MoreStackParamList } from '@/navigation/MoreStackNavigator';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { HEADER_CONTENT_HEIGHT, HEADER_ICON_SIZE, getHeaderStyles } from '@/theme/headerStyles';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

type ConsumedIngredientsScreenProps = CompositeScreenProps<
  NativeStackScreenProps<MoreStackParamList, 'ConsumedIngredients'>,
  NativeStackScreenProps<RootStackParamList>
> & { onInteractionBlockedChange: (blocked: boolean) => void };

export function ConsumedIngredientsScreen({ navigation, onInteractionBlockedChange }: ConsumedIngredientsScreenProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const showToast = useToast();
  const db = useSQLiteContext();
  const [records, setRecords] = useState<ConsumedIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
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

  async function restore(record: ConsumedIngredient) {
    if (busy.current || isLoading || hasError) return;
    busy.current = true;
    setIsBusy(true);

    try {
      const restored = await restoreConsumedIngredient(db, record);
      if (restored) {
        setRecords(current => current.filter(item => item.id !== record.id));
        showToast(t('consumed.restored'));
      } else {
        navigation.navigate('IngredientRestore', { id: record.id, consumedAt: record.consumedAt });
      }
    } catch (error) {
      Alert.alert(t('common.error'), getErrorMessage(error, t, t('consumed.restoreError')), [{ text: t('common.ok') }]);
    } finally {
      unlock();
    }
  }

  function requestDelete(record: ConsumedIngredient) {
    if (busy.current || isLoading || hasError) return;
    busy.current = true;
    setIsBusy(true);
    let handled = false;
    Alert.alert(t('common.warning'), t('consumed.deleteConfirm', { name: record.name }), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => {
        if (handled) return;
        handled = true;
        unlock();
      } },
      { text: t('consumed.delete'), style: 'destructive', onPress: async () => {
        if (handled) return;
        handled = true;
        try {
          await deleteConsumedIngredient(db, record);
          setRecords(current => current.filter(item => item.id !== record.id));
        } catch (error) {
          Alert.alert(t('common.error'), getErrorMessage(error, t, t('consumed.deleteError')), [{ text: t('common.ok') }]);
        } finally {
          unlock();
        }
      } },
    ], { cancelable: false });
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('more.back')}
          disabled={isBusy} accessibilityState={{ disabled: isBusy }} onPress={() => { if (!busy.current) navigation.goBack(); }} style={styles.backButton}>
          <MaterialDesignIcons name="arrow-left" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
        </FeedbackPressable>
        <Text accessibilityRole="header" style={styles.title}>{t('consumed.title')}</Text>
      </View>
      {isLoading ? <View style={styles.feedback}><ActivityIndicator color={colors.text} accessibilityLabel={t('consumed.loading')} /></View>
        : hasError ? <View style={styles.feedback}>
          <Text accessibilityRole="alert" style={styles.error}>{t('consumed.loadError')}</Text>
          <PrimaryButton label={t('common.retry')} variant="secondary" onPress={loadRecords} style={styles.retry} />
        </View> : (
          <FlatList data={records} keyExtractor={item => item.id} extraData={isBusy} style={styles.list}
            contentContainerStyle={records.length === 0 ? styles.empty : styles.listContent}
            ListEmptyComponent={<View style={styles.feedback}>
              <MaterialDesignIcons name="check-circle-outline" size={40} color={colors.textMuted} accessible={false} />
              <Text style={styles.emptyTitle}>{t('consumed.emptyTitle')}</Text>
              <Text style={styles.detail}>{t('consumed.emptyDescription')}</Text>
            </View>}
            renderItem={({ item }) => {
              const date = new Date(item.consumedAt);
              const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
              return (
                <View style={styles.item}>
                  <Text style={styles.name}>{item.name}<Text style={styles.quantity}>  {item.quantity}</Text></Text>
                  {item.memo ? <Text style={styles.detail}>{item.memo}</Text> : null}
                  <Text style={styles.detail}>{item.expirationDate ? t('consumed.expiration', { date: formatDate(item.expirationDate, t) }) : t('ingredient.noExpiration')}</Text>
                  <Text style={styles.detail}>{t('consumed.date', { date: formatDate(localDate, t) })}</Text>
                  <View style={styles.actions}>
                    <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('consumed.restoreItem', { name: item.name })}
                      disabled={isBusy} accessibilityState={{ disabled: isBusy }} onPress={() => restore(item)} style={styles.restoreButton}>
                      <MaterialDesignIcons name="restore" size={20} color={colors.chilled} accessible={false} />
                      <Text style={styles.restoreLabel}>{t('consumed.restore')}</Text>
                    </FeedbackPressable>
                    <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('consumed.deleteItem', { name: item.name })}
                      disabled={isBusy} accessibilityState={{ disabled: isBusy }} feedback="danger" onPress={() => requestDelete(item)} style={styles.deleteButton}>
                      <MaterialDesignIcons name="trash-can-outline" size={20} color={colors.error} accessible={false} />
                      <Text style={styles.deleteLabel}>{t('consumed.delete')}</Text>
                    </FeedbackPressable>
                  </View>
                </View>
              );
            }} />
        )}
    </SafeAreaView>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  ...getHeaderStyles(mode),
  title: { ...getHeaderStyles(mode).title, flexShrink: 1 },
  backButton: { width: HEADER_CONTENT_HEIGHT, height: HEADER_CONTENT_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.lg },
  empty: { flexGrow: 1 },
  feedback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  error: { color: colors.error, fontSize: 16, textAlign: 'center' },
  retry: { alignSelf: 'stretch' },
  item: { paddingHorizontal: spacing.md, paddingVertical: spacing.lg, gap: spacing.xs, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { color: colors.text, fontSize: 17, fontWeight: '600' },
  quantity: { fontWeight: '400' },
  detail: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  restoreButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: 22, backgroundColor: colors.chilledBackground },
  deleteButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: 22 },
  restoreLabel: { color: colors.chilled, fontSize: 15, fontWeight: '600' },
  deleteLabel: { color: colors.error, fontSize: 15 },
}));
