/**
 * @file
 * 선택한 위치의 재료 목록·등록·편집 폼과 임시이동목록을 공통 바텀 시트에 표시한다.
 * 현재 칸으로 일괄 이동하고, 변경 결과와 홈 도면의 배지 반영은 호출자가 관리한다.
 */
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, BackHandler, Keyboard, StyleSheet, Text, useAnimatedValue, useWindowDimensions, View } from 'react-native';
import { BottomSheetFlatList as FlatList, BottomSheetScrollView as ScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { IngredientSheet as BottomSheet } from '@/features/ingredient/components/IngredientSheet';
import type { IngredientSheetRef } from '@/features/ingredient/components/IngredientSheet';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { FormTextInput, type FormTextInputProps } from '@/components/FormTextInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Toast } from '@/components/Toast';
import { alertTitles } from '@/constants/alertTitles';
import { deleteIngredient, getIngredientsByPosition, moveIngredients, registerIngredient, updateIngredient } from '@/db/ingredientRepository';
import type { FridgeLayout, SlotPosition } from '@/features/fridge/model/fridgeLayout';
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import { getIngredientExpirationStatus } from '@/features/ingredient/model/ingredient';
import { IngredientExpirationCalendar } from '@/features/ingredient/components/IngredientExpirationCalendar';
import { IngredientSwipeRow } from '@/features/ingredient/components/IngredientSwipeRow';
import { IngredientMoveQueueList } from '@/features/ingredient/components/IngredientMoveQueueList';
import { useIngredientMoveQueue } from '@/features/ingredient/IngredientMoveQueueProvider';
import { colors, ingredientBadgeColors, spacing } from '@/theme/tokens';
import { HEADER_CONTENT_HEIGHT, HEADER_ICON_SIZE, headerStyles } from '@/theme/headerStyles';
import { useTranslation } from '@/i18n/LanguageProvider';
import { getErrorMessage } from '@/i18n/errors';
import { formatDate } from '@/i18n/translations';

// Gesture Handler의 입력 ref 선언을 공통 입력이 사용하는 React Native 인스턴스 타입에 맞춘다.
const SheetTextInput = BottomSheetTextInput as unknown as NonNullable<FormTextInputProps['inputComponent']>;

interface IngredientListSheetProps {
  position: SlotPosition;
  layout: FridgeLayout;
  allIngredients: Ingredient[];
  onClose: () => void;
  onSaved?: (ingredient: Ingredient) => void;
  onDeleted?: (ingredientId: string) => void;
  onMoved?: (ingredients: Ingredient[]) => void;
}

export function IngredientListSheet({ position, layout, allIngredients = [], onClose, onSaved, onDeleted, onMoved }: IngredientListSheetProps) {
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const moveQueue = useIngredientMoveQueue();
  const queuedIngredients = moveQueue.ingredientIds.flatMap(id => allIngredients.find(ingredient => ingredient.id === id) ?? []);
  const sheetRef = useRef<IngredientSheetRef>(null);
  const quantityInput = useRef<ComponentRef<typeof FormTextInput>>(null);
  const memoInput = useRef<ComponentRef<typeof FormTextInput>>(null);
  const saving = useRef(false);
  const deleting = useRef(false);
  const moving = useRef(false);
  const transition = useRef<{ active: boolean; animation?: Animated.CompositeAnimation }>({ active: false });
  const panelProgress = useAnimatedValue(0);
  const { width: windowWidth } = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState(windowWidth);
  const [isChanging, setIsChanging] = useState(false);
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const [secondaryPage, setSecondaryPage] = useState<'form' | 'queue'>('form');
  const isFormOpen = isSecondaryOpen && secondaryPage === 'form';
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const isEditing = editingIngredient !== null;
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [moveNotice, setMoveNotice] = useState<{ count: number } | null>(null);
  const [swipedIngredientId, setSwipedIngredientId] = useState<string | null>(null);
  const isBusy = isSaving || isDeleting || isMoving;
  const [saveError, setSaveError] = useState<{ cause: unknown } | null>(null);
  const [draft, setDraft] = useState<Pick<Ingredient, 'name' | 'quantity' | 'memo' | 'expirationDate'>>({
    name: '', quantity: '', memo: '', expirationDate: null,
  });
  // 편집을 마치거나 취소해도 목록으로 돌아오기 전 작성한 추가 초안을 복원한다.
  const addDraft = useRef(draft);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{ requestKey: string; ingredients: Ingredient[]; error: 'ingredient.loadError' | null } | null>(null);
  const { slotId } = position;
  const drawerNumber = position.drawerNumber ?? 0;
  const requestKey = `${slotId}:${drawerNumber}:${reloadCount}`;
  const currentResult = result?.requestKey === requestKey ? result : null;
  const ingredients = currentResult?.ingredients ?? [];
  const error = currentResult?.error ?? null;
  const isLoading = currentResult === null;
  const canMove = queuedIngredients.some(ingredient => ingredient.slotId !== slotId || ingredient.drawerNumber !== drawerNumber)
    && !isLoading && error === null;
  const canSave = !!draft.name.trim() && !!draft.quantity.trim()
    && draft.name.trim().length <= 50 && draft.quantity.trim().length <= 50 && !isDatePickerOpen;

  useEffect(() => {
    let active = true;
    async function loadIngredients() {
      try {
        const ingredients = await getIngredientsByPosition(db, { slotId, drawerNumber });
        if (active) setResult({ requestKey, ingredients, error: null });
      } catch {
        if (active) setResult({ requestKey, ingredients: [], error: 'ingredient.loadError' });
      }
    }
    void loadIngredients();
    // 닫기·위치 변경 전에 시작한 조회가 늦게 끝나도 이전 목록을 반영하지 않는다.
    return () => { active = false; };
  }, [db, slotId, drawerNumber, requestKey]);

  useEffect(() => {
    const currentTransition = transition.current;
    return () => {
      currentTransition.active = false;
      currentTransition.animation?.stop();
    };
  }, []);

  // 제목·버튼·본문을 함께 전환하고 완료 전까지 연속 조작을 막는다.
  const changePanel = useCallback((nextPage: 'list' | 'form' | 'queue', onComplete?: () => void) => {
    const showSecondary = nextPage !== 'list';
    if (transition.current.active || showSecondary === isSecondaryOpen) return;
    Keyboard.dismiss();
    transition.current.active = true;
    setIsChanging(true);
    if (nextPage !== 'list') setSecondaryPage(nextPage);
    setIsSecondaryOpen(showSecondary);
    const target = showSecondary ? 1 : 0;
    const animation = Animated.timing(panelProgress, { toValue: target, duration: 240, useNativeDriver: true });
    transition.current.animation = animation;
    animation.start(({ finished }) => {
      if (!transition.current.active) return;
      if (!finished) panelProgress.setValue(target);
      transition.current.active = false;
      setIsChanging(false);
      onComplete?.();
    });
  }, [isSecondaryOpen, panelProgress]);

  function startAdding() {
    if (saving.current || deleting.current || moving.current || transition.current.active || isSecondaryOpen || isLoading || error !== null) return;
    setSwipedIngredientId(null);
    setSaveError(null);
    changePanel('form');
  }

  function startEditing(ingredient: Ingredient) {
    if (saving.current || deleting.current || moving.current || transition.current.active || isSecondaryOpen || isLoading || error !== null) return;
    setSwipedIngredientId(null);
    addDraft.current = draft;
    setEditingIngredient(ingredient);
    setDraft({ name: ingredient.name, quantity: ingredient.quantity, memo: ingredient.memo, expirationDate: ingredient.expirationDate });
    setSaveError(null);
    changePanel('form');
  }

  const dismissDatePicker = useCallback(() => {
    setIsDatePickerOpen(false);
  }, []);

  function closeSheet() {
    if (saving.current || deleting.current || moving.current || transition.current.active) return;
    dismissDatePicker();
    Keyboard.dismiss();
    sheetRef.current?.close();
  }

  const returnToList = useCallback(() => {
    if (saving.current || deleting.current || moving.current || transition.current.active) return;
    Keyboard.dismiss();
    dismissDatePicker();
    setSaveError(null);
    changePanel('list', () => {
      if (isEditing) {
        setEditingIngredient(null);
        setDraft(addDraft.current);
      }
    });
  }, [changePanel, dismissDatePicker, isEditing]);

  useEffect(() => {
    // 저장·전환 중에는 홈의 종료 동작을 막고, 하위 화면에서는 먼저 목록으로 돌아간다.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (saving.current || deleting.current || moving.current || transition.current.active) return true;
      if (!isSecondaryOpen) return false;
      returnToList();
      return true;
    });
    return () => subscription.remove();
  }, [isSecondaryOpen, returnToList]);

  function toggleDatePicker() {
    if (saving.current || transition.current.active) return;
    Keyboard.dismiss();
    setIsDatePickerOpen(current => !current);
  }

  function selectExpirationDate(date: string) {
    if (saving.current || transition.current.active) return;
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
      ingredient = editingIngredient
        ? await updateIngredient(db, { ...editingIngredient, ...draft })
        : await registerIngredient(db, { ...draft, slotId, drawerNumber });
    } catch (cause) {
      setSaveError({ cause });
      saving.current = false;
      setIsSaving(false);
      return;
    }
    onSaved?.(ingredient);
    // 성공 알림을 확인하고 목록 전환이 끝날 때까지 잠금을 유지해 중복 저장을 막는다.
    Alert.alert(t(alertTitles.info), isEditing ? t('ingredient.updated') : t('ingredient.registered'), [{ text: t('common.ok'), onPress: () => {
      if (!saving.current || transition.current.active) return;
      changePanel('list', () => {
        setDraft(isEditing ? addDraft.current : { name: '', quantity: '', memo: '', expirationDate: null });
        setEditingIngredient(null);
        saving.current = false;
        setIsSaving(false);
      });
      // 저장 후 재조회가 실패해도 폼으로 돌아가지 않아 중복 저장을 막는다.
      setReloadCount(count => count + 1);
    } }], { cancelable: false });
  }

  function requestDelete(ingredient: Ingredient) {
    if (saving.current || deleting.current || moving.current || transition.current.active || isSecondaryOpen || isLoading || error !== null) return;
    deleting.current = true;
    setIsDeleting(true);
    let handled = false;
    function unlock() {
      deleting.current = false;
      setIsDeleting(false);
    }
    Alert.alert(t(alertTitles.warning), t('ingredient.deleteConfirm', { name: ingredient.name }), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => {
        if (handled) return;
        handled = true;
        unlock();
      } },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        if (handled) return;
        handled = true;
        try {
          await deleteIngredient(db, ingredient);
        } catch {
          unlock();
          Alert.alert(t(alertTitles.error), t('ingredient.deleteError'), [{ text: t('common.ok') }]);
          return;
        }
        setResult(current => current?.requestKey === requestKey
          ? { ...current, ingredients: current.ingredients.filter(item => item.id !== ingredient.id) } : current);
        setSwipedIngredientId(null);
        moveQueue.remove(ingredient.id);
        onDeleted?.(ingredient.id);
        unlock();
      } },
    ], { cancelable: false });
  }

  function enqueueIngredient(ingredient: Ingredient) {
    if (saving.current || deleting.current || moving.current || transition.current.active || isSecondaryOpen
      || isLoading || error !== null || moveQueue.ingredientIds.includes(ingredient.id)) return;
    moveQueue.add(ingredient.id);
    setSwipedIngredientId(null);
    setMoveNotice(null);
  }

  function openMoveQueue() {
    if (saving.current || deleting.current || moving.current || transition.current.active || isSecondaryOpen) return;
    setSwipedIngredientId(null);
    setMoveNotice(null);
    changePanel('queue');
  }

  async function moveQueuedIngredients() {
    if (saving.current || deleting.current || moving.current || transition.current.active || isSecondaryOpen || !canMove) return;
    moving.current = true;
    setIsMoving(true);
    setSwipedIngredientId(null);
    setMoveNotice(null);
    try {
      const moved = await moveIngredients(db, queuedIngredients, { slotId, drawerNumber });
      onMoved?.(moved);
      moveQueue.clear();
      setReloadCount(count => count + 1);
      setMoveNotice({ count: moved.length });
    } catch {
      Alert.alert(t(alertTitles.error), t('queue.moveError'), [{ text: t('common.ok') }]);
    } finally {
      moving.current = false;
      setIsMoving(false);
    }
  }

  // 항목·작업 버튼이 먼저 처리하는 버블 단계만 확인하고, 터치는 가로채지 않는다.
  function dismissSwipeActions() {
    if (!saving.current && !deleting.current && !moving.current && !transition.current.active) setSwipedIngredientId(null);
    return false;
  }

  return (
    <BottomSheet ref={sheetRef} disabled={isBusy || isChanging} expanded={isFormOpen} transitioning={isChanging}
      header={
        <View style={styles.headerViewport} onStartShouldSetResponder={dismissSwipeActions}>
          <Animated.View style={[styles.headerTrack, { width: pageWidth * 2, transform: [{
            translateX: panelProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -pageWidth] }),
          }] }]}>
            {([false, true] as const).map(secondary => {
              const formPage = secondary && secondaryPage === 'form';
              const queuePage = secondary && secondaryPage === 'queue';
              return (
                <View key={secondary ? 'detail' : 'list'} style={{ width: pageWidth }}
                  pointerEvents={secondary === isSecondaryOpen && !isChanging && !isBusy ? 'auto' : 'none'}
                  accessibilityElementsHidden={secondary !== isSecondaryOpen || isChanging}
                  importantForAccessibility={secondary === isSecondaryOpen && !isChanging ? 'auto' : 'no-hide-descendants'}>
                  {secondary === isSecondaryOpen || isChanging ? (
                    <View style={styles.header}>
                      {secondary ? (
                        <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('ingredient.back')}
                          disabled={isBusy} interactionBlocked={isChanging} accessibilityState={{ disabled: isBusy || isChanging }}
                          onPress={returnToList} style={styles.headerIconButton}>
                          <MaterialDesignIcons name="arrow-left" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
                        </FeedbackPressable>
                      ) : <View style={styles.headerIconButton} pointerEvents="none" />}
                      <View style={styles.heading}>
                        <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
                          style={styles.title}>{formPage ? isEditing ? t('ingredient.edit') : t('ingredient.add') : queuePage ? t('queue.title', { count: queuedIngredients.length }) : t('ingredient.list')}</Text>
                      </View>
                      {formPage ? (
                        <FeedbackPressable accessibilityRole="button" accessibilityLabel={isEditing ? t('ingredient.saveEdit') : t('ingredient.register')}
                          accessibilityState={{ disabled: !canSave || isSaving || isChanging, busy: isSaving }}
                          disabled={!canSave || isSaving} interactionBlocked={isChanging}
                          onPress={saveIngredient} style={styles.headerIconButton}>
                          {isSaving ? <ActivityIndicator color={colors.text} accessibilityLabel={isEditing ? t('ingredient.updating') : t('ingredient.registering')} />
                            : <MaterialDesignIcons name={isEditing ? 'checkbox-marked-circle-outline' : 'checkbox-marked-circle-plus-outline'} size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />}
                        </FeedbackPressable>
                      ) : queuePage ? (
                        <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('queue.clear')}
                          disabled={queuedIngredients.length === 0 || isBusy} interactionBlocked={isChanging}
                          accessibilityState={{ disabled: queuedIngredients.length === 0 || isBusy || isChanging }}
                          onPress={() => { if (!saving.current && !deleting.current && !moving.current && !transition.current.active) moveQueue.clear(); }}
                          style={styles.headerIconButton}>
                          <MaterialDesignIcons name="clipboard-remove-outline" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
                        </FeedbackPressable>
                      ) : (
                        <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('ingredient.add')}
                          accessibilityState={{ disabled: isLoading || error !== null || isChanging || isBusy }} disabled={isLoading || error !== null || isBusy}
                          interactionBlocked={isChanging} onPress={startAdding} style={styles.headerIconButton}>
                          <MaterialDesignIcons name="plus" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
                        </FeedbackPressable>
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Animated.View>
        </View>
      }
      onClose={() => {
        if (saving.current || deleting.current || moving.current || transition.current.active) return;
        onClose();
      }}>
        <View style={styles.panel} onAccessibilityEscape={closeSheet}
          onStartShouldSetResponder={dismissSwipeActions}>
          <View style={styles.content} onLayout={({ nativeEvent }) => {
            if (nativeEvent.layout.width > 0) setPageWidth(nativeEvent.layout.width);
          }}>
            <Animated.View style={[styles.pageTrack, { width: pageWidth * 2, transform: [{
              translateX: panelProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -pageWidth] }),
            }] }]}>
              {([false, true] as const).map(secondary => {
                const formPage = secondary && secondaryPage === 'form';
                const queuePage = secondary && secondaryPage === 'queue';
                return (
                <View key={secondary ? 'detail' : 'list'} style={[styles.page, { width: pageWidth }]}
                  pointerEvents={secondary === isSecondaryOpen && !isChanging && !isBusy ? 'auto' : 'none'}
                  accessibilityElementsHidden={secondary !== isSecondaryOpen || isChanging}
                  importantForAccessibility={secondary === isSecondaryOpen && !isChanging ? 'auto' : 'no-hide-descendants'}>
                  {secondary === isSecondaryOpen || isChanging ? (
                    <>
                      {!secondary && queuedIngredients.length > 0 ? (
                        <View style={styles.moveToolbar}>
                          <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('queue.check', { count: queuedIngredients.length })}
                            disabled={isBusy} interactionBlocked={isChanging} accessibilityState={{ disabled: isBusy || isChanging }}
                            onPress={openMoveQueue} style={styles.queueButton}>
                            <MaterialDesignIcons name="clipboard-text-outline" size={20} color={colors.chilled} accessible={false} />
                            <Text style={styles.queueLabel}>{t('queue.title', { count: queuedIngredients.length })}</Text>
                            <MaterialDesignIcons name="chevron-right" size={18} color={colors.chilled} accessible={false} />
                          </FeedbackPressable>
                          <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('queue.moveHere')}
                            disabled={!canMove || isBusy} interactionBlocked={isChanging}
                            accessibilityState={{ disabled: !canMove || isBusy || isChanging, busy: isMoving }}
                            onPress={moveQueuedIngredients} style={styles.moveButton} feedback="chilled">
                            {isMoving ? <ActivityIndicator color={colors.buttonText} accessibilityLabel={t('queue.moving')} />
                              : <MaterialDesignIcons name="clipboard-arrow-down-outline" size={20} color={colors.buttonText} accessible={false} />}
                            <Text style={styles.moveLabel}>{t('queue.moveHereLabel')}</Text>
                          </FeedbackPressable>
                        </View>
                      ) : null}
                      <View style={styles.pageContent}>
                        {queuePage ? (
                          <IngredientMoveQueueList ingredients={queuedIngredients} layout={layout} disabled={isBusy || isChanging}
                            onRemove={moveQueue.remove} />
                        ) : formPage ? (
                          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="always"
                            keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets={false} scrollsChildToFocus={false}>
                            <FormTextInput inputComponent={SheetTextInput} label={t('ingredient.name')} accessibilityLabel={t('ingredient.name')} placeholder={t('ingredient.namePlaceholder')}
                              value={draft.name} maxLength={50} editable={!isSaving && !isChanging} returnKeyType="next"
                              onSubmitEditing={() => quantityInput.current?.focus()}
                              onChangeText={name => { if (!saving.current && !transition.current.active) setDraft(current => ({ ...current, name })); }} />
                            <FormTextInput inputComponent={SheetTextInput} ref={quantityInput} label={t('ingredient.quantity')} accessibilityLabel={t('ingredient.quantityLabel')} placeholder={t('ingredient.quantityPlaceholder')}
                              value={draft.quantity} maxLength={50} editable={!isSaving && !isChanging} returnKeyType="next"
                              onSubmitEditing={() => memoInput.current?.focus()}
                              onChangeText={quantity => { if (!saving.current && !transition.current.active) setDraft(current => ({ ...current, quantity })); }} />
                            <FormTextInput inputComponent={SheetTextInput} ref={memoInput} label={t('ingredient.memo')} accessibilityLabel={t('ingredient.memoLabel')} placeholder={t('ingredient.memoPlaceholder')}
                              value={draft.memo ?? ''} editable={!isSaving && !isChanging} returnKeyType="done"
                              onChangeText={memo => { if (!saving.current && !transition.current.active) setDraft(current => ({ ...current, memo })); }} />
                            <Text style={styles.fieldLabel}>{t('ingredient.expiration')}</Text>
                            <View style={styles.dateRow}>
                              <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('ingredient.selectDate')}
                                accessibilityState={{ disabled: isSaving || isChanging, expanded: isDatePickerOpen }}
                                disabled={isSaving} interactionBlocked={isChanging}
                                onPress={toggleDatePicker} style={styles.dateButton}>
                                <MaterialDesignIcons name="calendar-outline" size={22} color={colors.text} accessible={false} />
                                <Text style={styles.positionName}>{(draft.expirationDate ? formatDate(draft.expirationDate, t) : t('ingredient.datePlaceholder'))}</Text>
                              </FeedbackPressable>
                              {draft.expirationDate ? (
                                <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('ingredient.clearDate')}
                                  disabled={isSaving} interactionBlocked={isChanging} accessibilityState={{ disabled: isSaving || isChanging }} style={styles.clearDateButton}
                                  onPress={() => {
                                    if (saving.current || transition.current.active) return;
                                    setDraft(current => ({ ...current, expirationDate: null }));
                                    dismissDatePicker();
                                  }}>
                                  <Text style={styles.clearDate}>{t('ingredient.clearDateLabel')}</Text>
                                </FeedbackPressable>
                              ) : null}
                            </View>
                            {saveError ? <Text accessibilityRole="alert" style={styles.error}>{getErrorMessage(saveError.cause, t, t('ingredient.saveError'))}</Text> : null}
                          </ScrollView>
                        ) : isLoading ? (
                          <View style={styles.feedback}>
                            <ActivityIndicator color={colors.text} accessibilityLabel={t('ingredient.loading')} />
                          </View>
                        ) : error ? (
                          <View style={styles.feedback}>
                            <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text>
                            <PrimaryButton label={t('common.retry')} onPress={() => setReloadCount(count => count + 1)}
                              variant="secondary" style={styles.retryButton} />
                          </View>
                        ) : (
                          <FlatList data={ingredients} keyExtractor={item => item.id}
                            extraData={{ swipedIngredientId, queuedIds: moveQueue.ingredientIds }} onScrollBeginDrag={() => setSwipedIngredientId(null)}
                            showsVerticalScrollIndicator indicatorStyle="black" automaticallyAdjustsScrollIndicatorInsets={false}
                            scrollIndicatorInsets={{ top: 0, bottom: spacing.md, left: 0, right: spacing.xs }}
                            style={styles.list} contentContainerStyle={ingredients.length === 0 ? styles.emptyList : undefined}
                            ListEmptyComponent={
                              <View style={styles.emptyState}>
                                <MaterialDesignIcons name="tray-plus" size={40} color={colors.textMuted} accessible={false} />
                                <Text style={styles.emptyTitle}>{t('ingredient.emptyTitle')}</Text>
                                <Text style={styles.emptyDescription}>{t('ingredient.emptyDescription')}</Text>
                              </View>
                            }
                            renderItem={({ item }) => {
                              const expiration = getIngredientExpirationStatus(item.expirationDate, undefined, t);
                              const isQueued = moveQueue.ingredientIds.includes(item.id);
                              return (
                                <IngredientSwipeRow name={item.name} width={pageWidth} isOpen={swipedIngredientId === item.id} disabled={isBusy || isChanging} isQueued={isQueued}
                                  onOpen={() => setSwipedIngredientId(item.id)} onClose={() => setSwipedIngredientId(null)}
                                  onEnqueue={() => enqueueIngredient(item)}
                                  onDelete={() => requestDelete(item)}>
                                  <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('ingredient.editItem', { name: item.name })}
                                    accessibilityValue={{ text: `${item.quantity}, ${expiration.label}${item.memo ? `, ${item.memo}` : ''}` }}
                                    accessibilityHint={isQueued ? t('ingredient.queuedHint') : t('ingredient.actionsHint')}
                                    accessibilityActions={[...(!isQueued ? [{ name: 'enqueue', label: t('queue.enqueue') }] : []), { name: 'delete', label: t('ingredient.delete') }]}
                                    onAccessibilityAction={({ nativeEvent }) => {
                                      if (nativeEvent.actionName === 'enqueue') enqueueIngredient(item);
                                      else if (nativeEvent.actionName === 'delete') requestDelete(item);
                                    }}
                                    accessibilityState={{ disabled: isBusy || isChanging }} disabled={isBusy} interactionBlocked={isChanging}
                                    onPress={() => { if (swipedIngredientId !== null) setSwipedIngredientId(null); else startEditing(item); }} style={styles.item}>
                                    <View style={styles.itemHeader}>
                                      <View style={styles.itemTitle}>
                                        {isQueued ? <MaterialDesignIcons name="clipboard-check-outline" size={20} color={colors.chilled} accessible={false} /> : null}
                                        <Text style={styles.itemName}>{item.name}<Text style={styles.quantity}>  {item.quantity}</Text></Text>
                                      </View>
                                      <Text style={[styles.expirationDate, item.expirationDate !== null && {
                                        color: ingredientBadgeColors[expiration.isExpired ? 'expired' : expiration.isUrgent ? 'warning' : 'normal'],
                                      }]}>{expiration.label}</Text>
                                    </View>
                                    {item.memo ? <Text style={styles.memo}>{item.memo}</Text> : null}
                                  </FeedbackPressable>
                                </IngredientSwipeRow>
                              );
                            }} />
                        )}
                      </View>
                    </>
                  ) : null}
                </View>
                );
              })}
            </Animated.View>
          </View>
          {isDatePickerOpen ? (
            <IngredientExpirationCalendar value={draft.expirationDate}
              disabled={isSaving || isChanging} onSelect={selectExpirationDate} onDismiss={dismissDatePicker} />
          ) : null}
          {moveNotice ? <View pointerEvents="none" style={styles.notice}>
            <Toast key={moveNotice.count} message={t('queue.moved', { count: moveNotice.count })} icon="check-circle-outline"
              onDismiss={() => setMoveNotice(current => current === moveNotice ? null : current)} />
          </View> : null}
        </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerViewport: { overflow: 'hidden' },
  headerTrack: { flexDirection: 'row' },
  header: {
    ...headerStyles.header,
  },
  heading: { flex: 1, minHeight: HEADER_CONTENT_HEIGHT, justifyContent: 'center' },
  title: { ...headerStyles.title, textAlign: 'center' },
  headerIconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  content: { flex: 1, overflow: 'hidden' },
  pageTrack: { flex: 1, flexDirection: 'row' },
  page: { height: '100%' },
  pageContent: { flex: 1 },
  moveToolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  queueButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, flexGrow: 1,
    paddingHorizontal: spacing.md, borderRadius: 22, backgroundColor: colors.chilledBackground },
  queueLabel: { color: colors.chilled, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  moveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, backgroundColor: colors.chilled },
  moveLabel: { color: colors.buttonText, fontSize: 15, fontWeight: '600' },
  notice: { position: 'absolute', left: 0, right: 0, bottom: spacing.lg, alignItems: 'center' },
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
  itemHeader: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  itemTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  itemName: { flexShrink: 1, color: colors.text, fontSize: 17, fontWeight: '600' },
  quantity: { fontSize: 17, fontWeight: '400' },
  memo: { color: colors.textMuted, fontSize: 15 },
  expirationDate: { color: ingredientBadgeColors.unknown, fontSize: 14, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] },
  form: { padding: spacing.lg },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  positionName: { color: colors.text, fontSize: 16, flexShrink: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  dateButton: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 52, padding: spacing.md,
    gap: spacing.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  clearDateButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: 10 },
  clearDate: { color: colors.textMuted, fontSize: 14 },
});
