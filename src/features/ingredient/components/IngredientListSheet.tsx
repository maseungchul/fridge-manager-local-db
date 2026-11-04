/**
 * @file
 * 선택한 위치의 재료 목록과 등록 폼을 스와이프로 닫는 네이티브 시트에 표시한다.
 * 조회·등록은 여기서 처리하고, 도면의 선택과 시트 종료는 호출자가 관리한다.
 */
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@expo/ui/community/bottom-sheet';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { FormTextInput } from '@/components/FormTextInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getIngredientsByPosition, registerIngredient } from '@/db/ingredientRepository';
import type { SlotPosition } from '@/features/fridge/model/fridgeLayout';
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import { IngredientExpirationCalendar } from '@/features/ingredient/components/IngredientExpirationCalendar';
import { colors, spacing } from '@/theme/tokens';

interface IngredientListSheetProps {
  position: SlotPosition;
  onClose: () => void;
}

const SHEET_SNAP_POINTS = ['50%', '90%'];

export function IngredientListSheet({ position, onClose }: IngredientListSheetProps) {
  const db = useSQLiteContext();
  const sheetRef = useRef<BottomSheet>(null);
  const quantityInput = useRef<ComponentRef<typeof FormTextInput>>(null);
  const saving = useRef(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Pick<Ingredient, 'name' | 'quantity' | 'expirationDate'>>({
    name: '', quantity: '', expirationDate: null,
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{ requestKey: string; ingredients: Ingredient[]; error: string | null } | null>(null);
  const { slotId } = position;
  const drawerNumber = position.drawerNumber ?? 0;
  const requestKey = `${slotId}:${drawerNumber}:${reloadCount}`;
  const currentResult = result?.requestKey === requestKey ? result : null;
  const ingredients = currentResult?.ingredients ?? [];
  const error = currentResult?.error ?? null;
  const isLoading = currentResult === null;
  const canSave = !!draft.name.trim() && !!draft.quantity.trim()
    && draft.name.trim().length <= 50 && draft.quantity.trim().length <= 50 && !isDatePickerOpen;

  useEffect(() => {
    let active = true;
    async function loadIngredients() {
      try {
        const ingredients = await getIngredientsByPosition(db, { slotId, drawerNumber });
        if (active) setResult({ requestKey, ingredients, error: null });
      } catch {
        if (active) setResult({ requestKey, ingredients: [], error: '재료 목록을 불러오지 못했습니다.' });
      }
    }
    void loadIngredients();
    // 닫기·위치 변경 전에 시작한 조회가 늦게 끝나도 이전 목록을 반영하지 않는다.
    return () => { active = false; };
  }, [db, slotId, drawerNumber, requestKey]);

  function closeSheet() {
    if (saving.current) return;
    Keyboard.dismiss();
    sheetRef.current?.close();
  }

  function returnToList() {
    if (saving.current) return;
    Keyboard.dismiss();
    setIsDatePickerOpen(false);
    setSaveError(null);
    setIsAdding(false);
  }

  function toggleDatePicker() {
    if (saving.current) return;
    Keyboard.dismiss();
    setIsDatePickerOpen(!isDatePickerOpen);
  }

  function selectExpirationDate(date: string) {
    if (saving.current) return;
    setDraft(current => ({ ...current, expirationDate: date }));
    setIsDatePickerOpen(false);
  }

  async function saveIngredient() {
    if (saving.current || !canSave) return;
    saving.current = true;
    setIsSaving(true);
    setSaveError(null);
    Keyboard.dismiss();
    try {
      await registerIngredient(db, { ...draft, slotId, drawerNumber });
      setDraft({ name: '', quantity: '', expirationDate: null });
      setIsAdding(false);
      // 저장 후 재조회가 실패해도 등록 폼으로 돌아가지 않아 중복 등록을 막는다.
      setReloadCount(count => count + 1);
    } catch {
      setSaveError('재료를 저장하지 못했습니다. 보관 위치와 입력 내용을 확인하고 다시 시도해 주세요.');
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  return (
    <BottomSheet ref={sheetRef} index={isAdding ? 1 : 0} snapPoints={SHEET_SNAP_POINTS}
      enableDynamicSizing={false} enablePanDownToClose={!isSaving} backgroundStyle={styles.panel}
      onClose={() => { if (!saving.current) onClose(); }}>
        <View style={styles.panel} accessibilityViewIsModal onAccessibilityEscape={closeSheet}>
          <View style={styles.header}>
            {isAdding ? (
              <FeedbackPressable accessibilityRole="button" accessibilityLabel="재료 목록으로 돌아가기"
                disabled={isSaving} accessibilityState={{ disabled: isSaving }} onPress={returnToList} style={styles.headerIconButton}>
                <MaterialDesignIcons name="arrow-left" size={32} color={colors.text} accessible={false} />
              </FeedbackPressable>
            ) : null}
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.title}>{isAdding ? '재료 추가' : '재료 목록'}</Text>
            </View>
            {isAdding ? (
              <FeedbackPressable accessibilityRole="button" accessibilityLabel="재료 등록"
                accessibilityState={{ disabled: !canSave || isSaving, busy: isSaving }} disabled={!canSave || isSaving}
                onPress={saveIngredient} style={styles.headerIconButton}>
                {isSaving ? <ActivityIndicator color={colors.text} accessibilityLabel="재료 등록 중" />
                  : <MaterialDesignIcons name="checkbox-marked-circle-plus-outline" size={32} color={colors.text} accessible={false} />}
              </FeedbackPressable>
            ) : (
              <FeedbackPressable accessibilityRole="button" accessibilityLabel="재료 추가"
                accessibilityState={{ disabled: isLoading || error !== null }} disabled={isLoading || error !== null}
                onPress={() => { setSaveError(null); setIsAdding(true); }} style={styles.headerIconButton}>
                <MaterialDesignIcons name="plus" size={32} color={colors.text} accessible={false} />
              </FeedbackPressable>
            )}
          </View>
          <View style={styles.content}>
            {isAdding ? (
              <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
                <FormTextInput label="재료명" accessibilityLabel="재료명" placeholder="예: 계란"
                  value={draft.name} maxLength={50} editable={!isSaving} returnKeyType="next"
                  onSubmitEditing={() => quantityInput.current?.focus()}
                  onChangeText={name => { if (!saving.current) setDraft(current => ({ ...current, name })); }} />
                <FormTextInput ref={quantityInput} label="수량" accessibilityLabel="재료 수량" placeholder="예: 2개, 반 통, 500g"
                  value={draft.quantity} maxLength={50} editable={!isSaving} returnKeyType="done"
                  onChangeText={quantity => { if (!saving.current) setDraft(current => ({ ...current, quantity })); }} />
                <Text style={styles.fieldLabel}>유통기한 (선택)</Text>
                <View style={styles.dateRow}>
                  <FeedbackPressable accessibilityRole="button" accessibilityLabel="유통기한 날짜 선택"
                    accessibilityState={{ disabled: isSaving, expanded: isDatePickerOpen }} disabled={isSaving}
                    onPress={toggleDatePicker} style={styles.dateButton}>
                    <MaterialDesignIcons name="calendar-outline" size={22} color={colors.text} accessible={false} />
                    <Text style={styles.positionName}>{draft.expirationDate ?? '날짜 선택'}</Text>
                  </FeedbackPressable>
                  {draft.expirationDate ? (
                    <FeedbackPressable accessibilityRole="button" accessibilityLabel="유통기한 선택 해제"
                      disabled={isSaving} accessibilityState={{ disabled: isSaving }} style={styles.clearDateButton}
                      onPress={() => {
                        if (saving.current) return;
                        setDraft(current => ({ ...current, expirationDate: null }));
                        setIsDatePickerOpen(false);
                      }}>
                      <Text style={styles.clearDate}>선택 해제</Text>
                    </FeedbackPressable>
                  ) : null}
                </View>
                {isDatePickerOpen ? (
                  <View style={styles.calendar}>
                    <IngredientExpirationCalendar value={draft.expirationDate} disabled={isSaving} onSelect={selectExpirationDate} />
                  </View>
                ) : null}
                {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}
              </ScrollView>
            ) : isLoading ? (
              <View style={styles.feedback}>
                <ActivityIndicator color={colors.text} accessibilityLabel="재료 목록 불러오는 중" />
              </View>
            ) : error ? (
              <View style={styles.feedback}>
                <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
                <PrimaryButton label="다시 불러오기" onPress={() => setReloadCount(count => count + 1)}
                  variant="secondary" style={styles.retryButton} />
              </View>
            ) : (
              <FlatList data={ingredients} keyExtractor={item => item.id}
                style={styles.list} contentContainerStyle={ingredients.length === 0 ? styles.emptyList : undefined}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <MaterialDesignIcons name="tray-plus" size={40} color={colors.textMuted} accessible={false} />
                    <Text style={styles.emptyTitle}>아직 보관 중인 재료가 없어요</Text>
                    <Text style={styles.emptyDescription}>이 칸에 보관할 재료를 추가해 보세요.</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={styles.item}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.quantity}>{item.quantity}</Text>
                    <Text style={styles.expirationDate}>
                      {item.expirationDate ? `유통기한 ${item.expirationDate}` : '유통기한 미입력'}
                    </Text>
                  </View>
                )} />
            )}
          </View>
        </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  heading: { flex: 1, minHeight: 48, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '700', includeFontPadding: false },
  headerIconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  content: { flex: 1 },
  feedback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  error: { color: colors.error, fontSize: 16, textAlign: 'center' },
  retryButton: { alignSelf: 'stretch' },
  list: { flex: 1 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: spacing.lg, gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyDescription: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  item: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemName: { color: colors.text, fontSize: 17, fontWeight: '600' },
  quantity: { color: colors.text, fontSize: 15 },
  expirationDate: { color: colors.textMuted, fontSize: 14 },
  form: { padding: spacing.lg },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  positionName: { color: colors.text, fontSize: 16, flexShrink: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  dateButton: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 52, padding: spacing.md,
    gap: spacing.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  clearDateButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: 10 },
  clearDate: { color: colors.textMuted, fontSize: 14 },
  calendar: { marginTop: spacing.md, gap: spacing.sm, marginBottom: spacing.md },
});
