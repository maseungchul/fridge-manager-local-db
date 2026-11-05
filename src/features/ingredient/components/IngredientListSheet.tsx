/**
 * @file
 * 선택한 위치의 재료 목록과 등록 폼을 스와이프로 닫는 네이티브 시트에 표시한다.
 * 조회·등록은 여기서 처리하고, 저장 결과 전달 후 도면 갱신과 시트 종료는 호출자가 관리한다.
 */
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Keyboard, ScrollView, StyleSheet, Text, useAnimatedValue, useWindowDimensions, View } from 'react-native';
import type { LayoutRectangle } from 'react-native';
import { IngredientSheet as BottomSheet } from '@/features/ingredient/components/IngredientSheet';
import type { IngredientSheetRef } from '@/features/ingredient/components/IngredientSheet';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { FormTextInput } from '@/components/FormTextInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { alertTitles } from '@/constants/alertTitles';
import { getIngredientsByPosition, registerIngredient } from '@/db/ingredientRepository';
import type { SlotPosition } from '@/features/fridge/model/fridgeLayout';
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import { getIngredientExpirationStatus } from '@/features/ingredient/model/ingredient';
import { IngredientDateFieldAnchor } from '@/features/ingredient/components/IngredientDateFieldAnchor';
import { IngredientExpirationCalendar } from '@/features/ingredient/components/IngredientExpirationCalendar';
import { colors, spacing } from '@/theme/tokens';

interface IngredientListSheetProps {
  position: SlotPosition;
  onClose: () => void;
  onCloseStart?: () => void;
  onCloseCancel?: () => void;
  onRegistered?: (ingredient: Ingredient) => void;
}

export function IngredientListSheet({ position, onClose, onCloseStart, onCloseCancel, onRegistered }: IngredientListSheetProps) {
  const db = useSQLiteContext();
  const sheetRef = useRef<IngredientSheetRef>(null);
  const quantityInput = useRef<ComponentRef<typeof FormTextInput>>(null);
  const datePicker = useRef<{ request: number; keyboardSubscription?: ReturnType<typeof Keyboard.addListener> }>({ request: 0 });
  const saving = useRef(false);
  const transition = useRef<{ active: boolean; animation?: Animated.CompositeAnimation }>({ active: false });
  const panelProgress = useAnimatedValue(0);
  const { width: windowWidth } = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState(windowWidth);
  const [isChanging, setIsChanging] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Pick<Ingredient, 'name' | 'quantity' | 'expirationDate'>>({
    name: '', quantity: '', expirationDate: null,
  });
  const [datePickerAnchor, setDatePickerAnchor] = useState<LayoutRectangle | null>(null);
  const [datePickerMeasurement, setDatePickerMeasurement] = useState<number | null>(null);
  const isDatePickerOpen = datePickerAnchor !== null;
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
    && draft.name.trim().length <= 50 && draft.quantity.trim().length <= 50 && !isDatePickerOpen && datePickerMeasurement === null;

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

  useEffect(() => {
    const currentTransition = transition.current;
    const currentDatePicker = datePicker.current;
    return () => {
      currentTransition.active = false;
      currentTransition.animation?.stop();
      currentDatePicker.request++;
      currentDatePicker.keyboardSubscription?.remove();
    };
  }, []);

  // 제목·버튼·본문을 함께 전환하고 완료 전까지 연속 조작을 막는다.
  function changePanel(adding: boolean, onComplete?: () => void) {
    if (transition.current.active || adding === isAdding) return;
    Keyboard.dismiss();
    transition.current.active = true;
    setIsChanging(true);
    setIsAdding(adding);
    const target = adding ? 1 : 0;
    const animation = Animated.timing(panelProgress, { toValue: target, duration: 240, useNativeDriver: true });
    transition.current.animation = animation;
    animation.start(({ finished }) => {
      if (!transition.current.active) return;
      if (!finished) panelProgress.setValue(target);
      transition.current.active = false;
      setIsChanging(false);
      onComplete?.();
    });
  }

  function startAdding() {
    if (saving.current || transition.current.active || isLoading || error !== null) return;
    setSaveError(null);
    changePanel(true);
  }

  function closeSheet() {
    if (saving.current || transition.current.active) return;
    dismissDatePicker();
    Keyboard.dismiss();
    sheetRef.current?.close();
  }

  function returnToList() {
    if (saving.current || transition.current.active) return;
    Keyboard.dismiss();
    dismissDatePicker();
    setSaveError(null);
    changePanel(false);
  }

  function dismissDatePicker() {
    datePicker.current.request++;
    datePicker.current.keyboardSubscription?.remove();
    datePicker.current.keyboardSubscription = undefined;
    setDatePickerMeasurement(null);
    setDatePickerAnchor(null);
  }

  function toggleDatePicker() {
    if (saving.current || transition.current.active) return;
    dismissDatePicker();
    if (isDatePickerOpen) return;
    const request = datePicker.current.request;
    const measureAnchor = () => {
      if (request !== datePicker.current.request || saving.current || transition.current.active) return;
      datePicker.current.keyboardSubscription?.remove();
      datePicker.current.keyboardSubscription = undefined;
      setDatePickerMeasurement(request);
    };
    // 키보드가 사라진 뒤 네이티브 측정기를 새로 마운트해 최종 화면 위치를 받는다.
    const keyboardVisible = Keyboard.isVisible();
    if (keyboardVisible) datePicker.current.keyboardSubscription = Keyboard.addListener('keyboardDidHide', measureAnchor);
    Keyboard.dismiss();
    if (!keyboardVisible) measureAnchor();
  }

  function selectExpirationDate(date: string) {
    if (saving.current || transition.current.active) return;
    // 입력은 즉시 반영하고 팝업 제거는 달력의 페이드 완료 콜백에서 처리한다.
    setDraft(current => ({ ...current, expirationDate: date }));
  }

  async function saveIngredient() {
    if (saving.current || transition.current.active || !canSave) return;
    saving.current = true;
    setIsSaving(true);
    dismissDatePicker();
    setSaveError(null);
    Keyboard.dismiss();
    let ingredient: Ingredient;
    try {
      ingredient = await registerIngredient(db, { ...draft, slotId, drawerNumber });
    } catch {
      setSaveError('재료를 저장하지 못했습니다. 보관 위치와 입력 내용을 확인하고 다시 시도해 주세요.');
      saving.current = false;
      setIsSaving(false);
      return;
    }
    onRegistered?.(ingredient);
    // 성공 알림을 확인하고 목록 전환이 끝날 때까지 잠금을 유지해 중복 등록을 막는다.
    Alert.alert(alertTitles.info, '재료를 등록했습니다.', [{ text: '확인', onPress: () => {
      if (!saving.current || transition.current.active) return;
      changePanel(false, () => {
        setDraft({ name: '', quantity: '', expirationDate: null });
        saving.current = false;
        setIsSaving(false);
      });
      // 저장 후 재조회가 실패해도 등록 폼으로 돌아가지 않아 중복 등록을 막는다.
      setReloadCount(count => count + 1);
    } }], { cancelable: false });
  }

  return (
    <BottomSheet ref={sheetRef} disabled={isSaving || isChanging} expanded={isAdding} transitioning={isChanging}
      onCloseStart={() => { if (!saving.current && !transition.current.active) onCloseStart?.(); }}
      onCloseCancel={onCloseCancel}
      onClose={() => { if (!saving.current && !transition.current.active) onClose(); }}>
        <View style={styles.panel} accessibilityViewIsModal onAccessibilityEscape={closeSheet}>
          {/* 시스템 표시기의 가변 색상 대신 고정색으로 표시하고, 드래그는 네이티브 시트에 맡긴다. */}
          <View style={styles.dragIndicator} pointerEvents="none" accessible={false} />
          <View style={styles.content} onLayout={({ nativeEvent }) => {
            if (nativeEvent.layout.width > 0) setPageWidth(nativeEvent.layout.width);
          }}>
            <Animated.View style={[styles.pageTrack, { width: pageWidth * 2, transform: [{
              translateX: panelProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -pageWidth] }),
            }] }]}>
              {([false, true] as const).map(addingPage => (
                <View key={addingPage ? 'add' : 'list'} style={[styles.page, { width: pageWidth }]}
                  pointerEvents={addingPage === isAdding && !isChanging && !isSaving ? 'auto' : 'none'}
                  accessibilityElementsHidden={addingPage !== isAdding || isChanging}
                  importantForAccessibility={addingPage === isAdding && !isChanging ? 'auto' : 'no-hide-descendants'}>
                  {addingPage === isAdding || isChanging ? (
                    <>
                      <View style={styles.header}>
                        {addingPage ? (
                          <FeedbackPressable accessibilityRole="button" accessibilityLabel="재료 목록으로 돌아가기"
                            disabled={isSaving} interactionBlocked={isChanging} accessibilityState={{ disabled: isSaving || isChanging }}
                            onPress={returnToList} style={styles.headerIconButton}>
                            <MaterialDesignIcons name="arrow-left" size={32} color={colors.text} accessible={false} />
                          </FeedbackPressable>
                        ) : null}
                        <View style={styles.heading}>
                          <Text accessibilityRole="header" style={[styles.title, addingPage && styles.centeredTitle]}>{addingPage ? '재료 추가' : '재료 목록'}</Text>
                        </View>
                        {addingPage ? (
                          <FeedbackPressable accessibilityRole="button" accessibilityLabel="재료 등록"
                            accessibilityState={{ disabled: !canSave || isSaving || isChanging, busy: isSaving }}
                            disabled={!canSave || isSaving} interactionBlocked={isChanging}
                            onPress={saveIngredient} style={styles.headerIconButton}>
                            {isSaving ? <ActivityIndicator color={colors.text} accessibilityLabel="재료 등록 중" />
                              : <MaterialDesignIcons name="checkbox-marked-circle-plus-outline" size={32} color={colors.text} accessible={false} />}
                          </FeedbackPressable>
                        ) : (
                          <FeedbackPressable accessibilityRole="button" accessibilityLabel="재료 추가"
                            accessibilityState={{ disabled: isLoading || error !== null || isChanging }} disabled={isLoading || error !== null}
                            interactionBlocked={isChanging} onPress={startAdding} style={styles.headerIconButton}>
                            <MaterialDesignIcons name="plus" size={32} color={colors.text} accessible={false} />
                          </FeedbackPressable>
                        )}
                      </View>
                      <View style={styles.pageContent}>
                        {addingPage ? (
                          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets={false} scrollsChildToFocus={false}>
                            <FormTextInput label="재료명" accessibilityLabel="재료명" placeholder="예: 계란"
                              value={draft.name} maxLength={50} editable={!isSaving && !isChanging} returnKeyType="next"
                              onSubmitEditing={() => quantityInput.current?.focus()}
                              onChangeText={name => { if (!saving.current && !transition.current.active) setDraft(current => ({ ...current, name })); }} />
                            <FormTextInput ref={quantityInput} label="수량" accessibilityLabel="재료 수량" placeholder="예: 2개, 반 통, 500g"
                              value={draft.quantity} maxLength={50} editable={!isSaving && !isChanging} returnKeyType="done"
                              onChangeText={quantity => { if (!saving.current && !transition.current.active) setDraft(current => ({ ...current, quantity })); }} />
                            <Text style={styles.fieldLabel}>유통기한 (선택)</Text>
                            <View style={styles.dateRow}>
                              {datePickerMeasurement !== null ? (
                                <IngredientDateFieldAnchor key={datePickerMeasurement} onMeasure={frame => {
                                  if (datePickerMeasurement !== datePicker.current.request || saving.current || transition.current.active
                                    || frame.width <= 0 || frame.height <= 0) return;
                                  datePicker.current.request++;
                                  setDatePickerMeasurement(null);
                                  setDatePickerAnchor(frame);
                                }} />
                              ) : null}
                              <FeedbackPressable accessibilityRole="button" accessibilityLabel="유통기한 날짜 선택"
                                accessibilityState={{ disabled: isSaving || isChanging, expanded: isDatePickerOpen }}
                                disabled={isSaving} interactionBlocked={isChanging}
                                onPress={toggleDatePicker} style={styles.dateButton}>
                                <MaterialDesignIcons name="calendar-outline" size={22} color={colors.text} accessible={false} />
                                <Text style={styles.positionName}>{draft.expirationDate ?? '날짜 선택'}</Text>
                              </FeedbackPressable>
                              {draft.expirationDate ? (
                                <FeedbackPressable accessibilityRole="button" accessibilityLabel="유통기한 선택 해제"
                                  disabled={isSaving} interactionBlocked={isChanging} accessibilityState={{ disabled: isSaving || isChanging }} style={styles.clearDateButton}
                                  onPress={() => {
                                    if (saving.current || transition.current.active) return;
                                    setDraft(current => ({ ...current, expirationDate: null }));
                                    dismissDatePicker();
                                  }}>
                                  <Text style={styles.clearDate}>선택 해제</Text>
                                </FeedbackPressable>
                              ) : null}
                            </View>
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
                            renderItem={({ item }) => {
                              const expiration = getIngredientExpirationStatus(item.expirationDate);
                              return (
                                <View style={styles.item}>
                                  <View style={styles.itemInfo}>
                                    <Text style={styles.itemName}>{item.name}</Text>
                                    <Text style={styles.quantity}>{item.quantity}</Text>
                                  </View>
                                  <Text style={[styles.expirationDate, expiration.isUrgent && styles.urgentExpiration]}>{expiration.label}</Text>
                                </View>
                              );
                            }} />
                        )}
                      </View>
                    </>
                  ) : null}
                </View>
              ))}
            </Animated.View>
          </View>
          {datePickerAnchor ? (
            <IngredientExpirationCalendar value={draft.expirationDate} anchor={datePickerAnchor}
              disabled={isSaving || isChanging} onSelect={selectExpirationDate} onDismiss={dismissDatePicker} />
          ) : null}
        </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  dragIndicator: {
    alignSelf: 'center', width: 36, height: 5, borderRadius: 3,
    marginTop: spacing.xs, marginBottom: 5, backgroundColor: '#C4C4C4',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  heading: { flex: 1, minHeight: 48, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '700', includeFontPadding: false },
  centeredTitle: { textAlign: 'center' },
  headerIconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  content: { flex: 1, overflow: 'hidden' },
  pageTrack: { flex: 1, flexDirection: 'row' },
  page: { height: '100%' },
  pageContent: { flex: 1 },
  feedback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  error: { color: colors.error, fontSize: 16, textAlign: 'center' },
  retryButton: { alignSelf: 'stretch' },
  list: { flex: 1 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: spacing.lg, gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyDescription: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemName: { color: colors.text, fontSize: 17, fontWeight: '600' },
  quantity: { color: colors.text, fontSize: 15 },
  itemInfo: { flex: 1, minWidth: 0, gap: spacing.xs },
  expirationDate: { color: colors.textMuted, fontSize: 14, textAlign: 'right', fontVariant: ['tabular-nums'] },
  urgentExpiration: { color: colors.error },
  form: { padding: spacing.lg },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  positionName: { color: colors.text, fontSize: 16, flexShrink: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  dateButton: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 52, padding: spacing.md,
    gap: spacing.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  clearDateButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: 10 },
  clearDate: { color: colors.textMuted, fontSize: 14 },
});
