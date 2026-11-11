/**
 * @file
 * 선택한 위치의 재료와 임시이동목록을 공통 바텀 시트에 표시한다.
 * 추가·편집은 시트 종료 후 전달하고, 삭제·소비 완료·일괄 이동 결과로 홈 배지를 갱신한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, BackHandler, Keyboard, StyleSheet, Text, useAnimatedValue, useWindowDimensions, View } from 'react-native';
import { BottomSheetFlatList as FlatList } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IngredientSheet as BottomSheet } from '@/features/ingredient/components/IngredientSheet';
import type { IngredientSheetRef } from '@/features/ingredient/components/IngredientSheet';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useToast } from '@/components/ToastProvider';
import { alertTitles } from '@/constants/alertTitles';
import { consumeIngredients, deleteIngredients, getIngredientsByPosition, moveIngredients } from '@/db/ingredientRepository';
import type { FridgeLayout, SlotPosition } from '@/features/fridge/model/fridgeLayout';
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import { getIngredientExpirationStatus } from '@/features/ingredient/model/ingredient';
import { IngredientMoveQueueList } from '@/features/ingredient/components/IngredientMoveQueueList';
import { useIngredientMoveQueue } from '@/features/ingredient/IngredientMoveQueueProvider';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { HEADER_CONTENT_HEIGHT, HEADER_ICON_INSET, HEADER_ICON_SIZE, getHeaderStyles } from '@/theme/headerStyles';
import { useTranslation } from '@/i18n/LanguageProvider';
import { getErrorMessage } from '@/i18n/errors';

interface IngredientListSheetProps {
  position: SlotPosition;
  layout: FridgeLayout;
  allIngredients: Ingredient[];
  onClose: () => void;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  onOpenForm: (ingredient?: Ingredient) => void;
  onDeleted?: (ingredientId: string) => void;
  onMoved?: (ingredients: Ingredient[]) => void;
}

export function IngredientListSheet({ position, layout, allIngredients = [], initialIndex, onIndexChange, onClose, onOpenForm, onDeleted, onMoved }: IngredientListSheetProps) {
  const { mode, colors, ingredientBadgeColors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const showToast = useToast();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const moveQueue = useIngredientMoveQueue();
  const queuedIngredients = moveQueue.ingredientIds.flatMap(id => allIngredients.find(ingredient => ingredient.id === id) ?? []);
  const sheetRef = useRef<IngredientSheetRef>(null);
  const formRequest = useRef<{ ingredient?: Ingredient } | null>(null);
  const deleting = useRef(false);
  const moving = useRef(false);
  const transition = useRef<{ active: boolean; animation?: Animated.CompositeAnimation }>({ active: false });
  const panelProgress = useAnimatedValue(0);
  const { width: windowWidth } = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState(windowWidth);
  const [isChanging, setIsChanging] = useState(false);
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const [isOpeningForm, setIsOpeningForm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const isBusy = isOpeningForm || isDeleting || isMoving;
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{ requestKey: string; ingredients: Ingredient[]; error: 'ingredient.loadError' | null } | null>(null);
  const { slotId } = position;
  const drawerNumber = position.drawerNumber ?? 0;
  const requestKey = `${slotId}:${drawerNumber}:${reloadCount}`;
  const currentResult = result?.requestKey === requestKey ? result : null;
  const ingredients = currentResult?.ingredients ?? [];
  const error = currentResult?.error ?? null;
  const isLoading = currentResult === null;
  const selectedIngredients = ingredients.filter(item => selectedIds.includes(item.id));
  const allSelected = ingredients.length > 0 && selectedIngredients.length === ingredients.length;
  const canMove = queuedIngredients.some(ingredient => ingredient.slotId !== slotId || ingredient.drawerNumber !== drawerNumber)
    && !isLoading && error === null;

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
  const changePanel = useCallback((nextPage: 'list' | 'queue') => {
    const showSecondary = nextPage !== 'list';
    if (transition.current.active || showSecondary === isSecondaryOpen) return;
    Keyboard.dismiss();
    transition.current.active = true;
    setIsChanging(true);
    setIsSecondaryOpen(showSecondary);
    const target = showSecondary ? 1 : 0;
    const animation = Animated.timing(panelProgress, { toValue: target, duration: 240, useNativeDriver: true });
    transition.current.animation = animation;
    animation.start(({ finished }) => {
      if (!transition.current.active) return;
      if (!finished) panelProgress.setValue(target);
      transition.current.active = false;
      setIsChanging(false);
    });
  }, [isSecondaryOpen, panelProgress]);

  function openForm(ingredient?: Ingredient) {
    if (formRequest.current || deleting.current || moving.current || transition.current.active || isSecondaryOpen || isSelecting || isLoading || error !== null) return;
    formRequest.current = { ingredient };
    setIsOpeningForm(true);
    // 포털의 시트가 다음 화면을 덮지 않도록 종료 완료를 기다린 뒤 전환한다.
    sheetRef.current?.close();
  }

  function closeSheet() {
    if (formRequest.current || deleting.current || moving.current || transition.current.active) return;
    Keyboard.dismiss();
    sheetRef.current?.close();
  }

  const returnToList = useCallback(() => {
    if (formRequest.current || deleting.current || moving.current || transition.current.active) return;
    Keyboard.dismiss();
    changePanel('list');
  }, [changePanel]);

  useEffect(() => {
    // 저장·전환 중에는 홈의 종료 동작을 막고, 하위 화면에서는 먼저 목록으로 돌아간다.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (formRequest.current || deleting.current || moving.current || transition.current.active) return true;
      if (isSelecting) { setIsSelecting(false); setSelectedIds([]); return true; }
      if (!isSecondaryOpen) return false;
      returnToList();
      return true;
    });
    return () => subscription.remove();
  }, [isSelecting, isSecondaryOpen, returnToList]);

  function requestRemoval(kind: 'delete' | 'consume') {
    if (!canChangeSelection() || !isSelecting || selectedIngredients.length === 0) return;
    // 처리 대상을 확인창에 표시한 선택 목록으로 고정한다.
    const targets = selectedIngredients;
    deleting.current = true;
    setIsDeleting(true);
    let handled = false;
    function unlock() {
      deleting.current = false;
      setIsDeleting(false);
    }
    Alert.alert(t(kind === 'consume' ? alertTitles.info : alertTitles.warning),
      t(kind === 'consume' ? 'ingredient.consumeSelectedConfirm' : 'ingredient.deleteSelectedConfirm', { count: targets.length }), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => {
        if (handled) return;
        handled = true;
        unlock();
      } },
      { text: t(kind === 'consume' ? 'ingredient.consume' : 'common.delete'), style: kind === 'consume' ? 'default' : 'destructive', onPress: async () => {
        if (handled) return;
        handled = true;
        try {
          if (kind === 'consume') await consumeIngredients(db, targets);
          else await deleteIngredients(db, targets);
        } catch (error) {
          unlock();
          Alert.alert(t(alertTitles.error), getErrorMessage(error, t, t(kind === 'consume' ? 'ingredient.consumeError' : 'ingredient.deleteError')), [{ text: t('common.ok') }]);
          return;
        }
        setResult(current => current?.requestKey === requestKey
          ? { ...current, ingredients: current.ingredients.filter(item => !targets.some(target => target.id === item.id)) } : current);
        for (const ingredient of targets) {
          moveQueue.remove(ingredient.id);
          onDeleted?.(ingredient.id);
        }
        setIsSelecting(false);
        setSelectedIds([]);
        if (kind === 'consume') showToast(t('ingredient.consumed'));
        unlock();
      } },
    ], { cancelable: false });
  }

  function canChangeSelection() {
    return !formRequest.current && !deleting.current && !moving.current && !transition.current.active
      && !isSecondaryOpen && !isLoading && error === null;
  }

  function toggleSelectionMode() {
    if (!canChangeSelection()) return;
    setIsSelecting(current => !current);
    setSelectedIds([]);

  }

  function toggleIngredient(id: string) {
    if (!canChangeSelection() || !isSelecting) return;
    setSelectedIds(current => current.includes(id) ? current.filter(candidate => candidate !== id) : [...current, id]);
  }

  function enqueueSelectedIngredients() {
    if (!canChangeSelection() || !isSelecting || selectedIngredients.length === 0) return;
    for (const ingredient of selectedIngredients) moveQueue.add(ingredient.id);
    setIsSelecting(false);
    setSelectedIds([]);

  }

  function openMoveQueue() {
    if (formRequest.current || deleting.current || moving.current || transition.current.active || isSecondaryOpen || isSelecting) return;

    changePanel('queue');
  }

  async function moveQueuedIngredients() {
    if (formRequest.current || deleting.current || moving.current || transition.current.active || isSecondaryOpen || isSelecting || !canMove) return;
    moving.current = true;
    setIsMoving(true);

    try {
      const moved = await moveIngredients(db, queuedIngredients, { slotId, drawerNumber });
      onMoved?.(moved);
      moveQueue.clear();
      setReloadCount(count => count + 1);
      showToast(t('queue.moved', { count: moved.length }));
    } catch {
      Alert.alert(t(alertTitles.error), t('queue.moveError'), [{ text: t('common.ok') }]);
    } finally {
      moving.current = false;
      setIsMoving(false);
    }
  }

  return (
    <BottomSheet ref={sheetRef} disabled={isBusy || isChanging} initialIndex={initialIndex} onIndexChange={onIndexChange}
      header={
        <View style={styles.headerViewport}>
          <Animated.View style={[styles.headerTrack, { width: pageWidth * 2, transform: [{
            translateX: panelProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -pageWidth] }),
          }] }]}>
            {([false, true] as const).map(secondary => {
              return (
                <View key={secondary ? 'detail' : 'list'} style={{ width: pageWidth }}
                  pointerEvents={secondary === isSecondaryOpen && !isChanging && !isBusy ? 'auto' : 'none'}
                  accessibilityElementsHidden={secondary !== isSecondaryOpen || isChanging}
                  importantForAccessibility={secondary === isSecondaryOpen && !isChanging ? 'auto' : 'no-hide-descendants'}>
                  {secondary === isSecondaryOpen || isChanging ? (
                    <View style={styles.header}>
                      {secondary ? (
                        <FeedbackPressable iconFeedback tooltip accessibilityRole="button" accessibilityLabel={t('ingredient.back')}
                          disabled={isBusy} interactionBlocked={isChanging} accessibilityState={{ disabled: isBusy || isChanging }}
                          onPress={returnToList} style={[styles.headerIconButton, styles.headerLeftButton]}>
                          <MaterialDesignIcons name="arrow-left" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
                        </FeedbackPressable>
                      ) : (
                        <FeedbackPressable iconFeedback tooltip accessibilityRole="button" accessibilityLabel={t(isSelecting ? 'ingredient.selectAll' : 'ingredient.select')}
                          disabled={isBusy || isLoading || error !== null || ingredients.length === 0} interactionBlocked={isChanging}
                          onPress={() => {
                            if (!canChangeSelection()) return;
                            if (!isSelecting) toggleSelectionMode();
                            else setSelectedIds(allSelected ? [] : ingredients.map(item => item.id));
                          }} style={[styles.headerIconButton, styles.headerLeftButton]}>
                          <MaterialDesignIcons name={isSelecting ? 'check-all' : 'check'} size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
                        </FeedbackPressable>
                      )}
                      <View style={styles.heading}>
                        <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
                          style={styles.title}>{secondary ? t('queue.title', { count: queuedIngredients.length }) : t('ingredient.list')}</Text>
                      </View>
                      {secondary ? (
                        <FeedbackPressable iconFeedback tooltip accessibilityRole="button" accessibilityLabel={t('queue.clear')}
                          disabled={queuedIngredients.length === 0 || isBusy} interactionBlocked={isChanging}
                          accessibilityState={{ disabled: queuedIngredients.length === 0 || isBusy || isChanging }}
                          onPress={() => { if (!formRequest.current && !deleting.current && !moving.current && !transition.current.active) moveQueue.clear(); }}
                          style={[styles.headerIconButton, styles.headerRightButton]}>
                          <MaterialDesignIcons name="clipboard-remove-outline" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
                        </FeedbackPressable>
                      ) : isSelecting ? (
                        <FeedbackPressable iconFeedback tooltip accessibilityRole="button" accessibilityLabel={t('ingredient.cancelSelection')}
                          disabled={isBusy} interactionBlocked={isChanging} onPress={toggleSelectionMode} style={[styles.headerIconButton, styles.headerRightButton]}>
                          <MaterialDesignIcons name="close" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
                        </FeedbackPressable>
                      ) : (
                        <FeedbackPressable iconFeedback tooltip accessibilityRole="button" accessibilityLabel={t('ingredient.add')}
                          accessibilityState={{ disabled: isLoading || error !== null || isChanging || isBusy }} disabled={isLoading || error !== null || isBusy}
                          interactionBlocked={isChanging} onPress={() => openForm()} style={[styles.headerIconButton, styles.headerRightButton]}>
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
        if (deleting.current || moving.current || transition.current.active) return;
        if (formRequest.current) onOpenForm(formRequest.current.ingredient);
        else onClose();
      }}>
        <View style={styles.panel} onAccessibilityEscape={() => { if (isSelecting) toggleSelectionMode(); else closeSheet(); }}>
          <View style={styles.content} onLayout={({ nativeEvent }) => {
            if (nativeEvent.layout.width > 0) setPageWidth(nativeEvent.layout.width);
          }}>
            <Animated.View style={[styles.pageTrack, { width: pageWidth * 2, transform: [{
              translateX: panelProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -pageWidth] }),
            }] }]}>
              {([false, true] as const).map(secondary => {
                return (
                <View key={secondary ? 'detail' : 'list'} style={[styles.page, { width: pageWidth }]}
                  pointerEvents={secondary === isSecondaryOpen && !isChanging && !isBusy ? 'auto' : 'none'}
                  accessibilityElementsHidden={secondary !== isSecondaryOpen || isChanging}
                  importantForAccessibility={secondary === isSecondaryOpen && !isChanging ? 'auto' : 'no-hide-descendants'}>
                  {secondary === isSecondaryOpen || isChanging ? (
                    <>
                      {!secondary && !isSelecting && queuedIngredients.length > 0 ? (
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
                        {secondary ? (
                          <IngredientMoveQueueList ingredients={queuedIngredients} layout={layout} disabled={isBusy || isChanging}
                            onRemove={moveQueue.remove} />
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
                            extraData={{ isSelecting, selectedIds, queuedIds: moveQueue.ingredientIds }}
                            showsVerticalScrollIndicator indicatorStyle={mode === 'dark' ? 'white' : 'black'} automaticallyAdjustsScrollIndicatorInsets={false}
                            scrollIndicatorInsets={{ top: 0, bottom: spacing.md + (isSelecting ? 0 : insets.bottom), left: 0, right: spacing.xs }}
                            style={styles.list} contentContainerStyle={[ingredients.length === 0 ? styles.emptyList : undefined, { paddingBottom: isSelecting ? 0 : insets.bottom }]}
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
                                <FeedbackPressable accessibilityRole={isSelecting ? 'checkbox' : 'button'}
                                  accessibilityLabel={t(isSelecting ? 'ingredient.selectItem' : 'ingredient.editItem', { name: item.name })}
                                  accessibilityValue={{ text: `${item.quantity}, ${expiration.label}${item.memo ? `, ${item.memo}` : ''}` }}
                                  accessibilityHint={isSelecting ? t('ingredient.selectionHint') : isQueued ? t('ingredient.queuedHint') : t('ingredient.actionsHint')}
                                  accessibilityState={{ disabled: isBusy || isChanging, ...(isSelecting ? { checked: selectedIds.includes(item.id) } : {}) }}
                                  disabled={isBusy} interactionBlocked={isChanging}
                                  onPress={() => { if (isSelecting) toggleIngredient(item.id); else openForm(item); }}
                                  style={[styles.item, isSelecting && styles.selectableItem, isSelecting && selectedIds.includes(item.id) && styles.selectedItem]}>
                                  {isSelecting ? selectedIds.includes(item.id) ? (
                                    <MaterialDesignIcons name="checkbox-marked-circle" size={24} color={colors.chilled} accessible={false} />
                                  ) : <View style={styles.selectionCircleContainer}><View style={styles.selectionCircle} /></View> : null}
                                  <View style={styles.itemDetails}>
                                    <View style={styles.itemHeader}>
                                      <View style={styles.itemTitle}>
                                        <Text style={styles.itemName}>{item.name}<Text style={styles.quantity}>  {item.quantity}</Text></Text>
                                        {isQueued ? <Text style={styles.queuedBadge} accessible={false}>{t('queue.pending')}</Text> : null}
                                      </View>
                                      <Text style={[styles.expirationDate, item.expirationDate !== null && {
                                        color: ingredientBadgeColors[expiration.isExpired ? 'expired' : expiration.isUrgent ? 'warning' : 'normal'],
                                      }]}>{expiration.label}</Text>
                                    </View>
                                    {item.memo ? <Text style={styles.memo}>{item.memo}</Text> : null}
                                  </View>
                                </FeedbackPressable>
                              );
                            }} />
                        )}
                      </View>
                      {!secondary && isSelecting ? (
                        <View style={[styles.selectionToolbar, { height: 50 + insets.bottom, paddingBottom: insets.bottom,
                          paddingLeft: spacing.sm + insets.left, paddingRight: spacing.sm + insets.right }]}>
                          <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('ingredient.enqueueSelected')}
                            disabled={selectedIngredients.length === 0 || isBusy} interactionBlocked={isChanging}
                            accessibilityState={{ disabled: selectedIngredients.length === 0 || isBusy || isChanging }}
                            feedback="none" onPress={enqueueSelectedIngredients} style={styles.selectionAction}>
                            {({ pressed }) => <>
                              <MaterialDesignIcons name={pressed ? 'clipboard-plus' : 'clipboard-plus-outline'} size={24} color={colors.text} accessible={false} />
                              <Text style={styles.selectionActionLabel}>{t('ingredient.enqueueLabel')}</Text>
                            </>}
                          </FeedbackPressable>
                          <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('ingredient.consumeSelected')}
                            disabled={selectedIngredients.length === 0 || isBusy} interactionBlocked={isChanging}
                            accessibilityState={{ disabled: selectedIngredients.length === 0 || isBusy || isChanging }}
                            feedback="none" onPress={() => requestRemoval('consume')} style={styles.selectionAction}>
                            {({ pressed }) => <>
                              <MaterialDesignIcons name={pressed ? 'check-circle' : 'check-circle-outline'} size={24} color={colors.text} accessible={false} />
                              <Text style={styles.selectionActionLabel}>{t('ingredient.consume')}</Text>
                            </>}
                          </FeedbackPressable>
                          <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('ingredient.deleteSelected')}
                            disabled={selectedIngredients.length === 0 || isBusy} interactionBlocked={isChanging}
                            accessibilityState={{ disabled: selectedIngredients.length === 0 || isBusy || isChanging }}
                            feedback="none" onPress={() => requestRemoval('delete')} style={styles.selectionAction}>
                            {({ pressed }) => <>
                              <MaterialDesignIcons name={pressed ? 'trash-can' : 'trash-can-outline'} size={24} color={colors.error} accessible={false} />
                              <Text style={[styles.selectionActionLabel, styles.deleteLabel]}>{t('common.delete')}</Text>
                            </>}
                          </FeedbackPressable>
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </View>
                );
              })}
            </Animated.View>
          </View>
        </View>
    </BottomSheet>
  );
}

const getStyles = createThemedStyles(({ colors, ingredientBadgeColors }, mode) => StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerViewport: { overflow: 'hidden' },
  headerTrack: { flexDirection: 'row' },
  header: {
    ...getHeaderStyles(mode).header,
  },
  heading: { flex: 1, minHeight: HEADER_CONTENT_HEIGHT, justifyContent: 'center' },
  title: { ...getHeaderStyles(mode).title, textAlign: 'center' },
  headerIconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  headerLeftButton: { marginLeft: -HEADER_ICON_INSET },
  headerRightButton: { marginRight: -HEADER_ICON_INSET },
  selectionCircleContainer: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  selectionCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.textMuted },
  selectionToolbar: { flexDirection: 'row', flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  selectionAction: { flex: 1, minHeight: 48, marginHorizontal: spacing.xs, paddingTop: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  selectionActionLabel: { color: colors.text, fontSize: 12, lineHeight: 16, textAlign: 'center', fontWeight: '600' },
  deleteLabel: { color: colors.error },
  selectableItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selectedItem: { backgroundColor: colors.chilledBackground },
  itemDetails: { flex: 1, gap: spacing.xs },
  content: { flex: 1, overflow: 'hidden' },
  pageTrack: { flex: 1, flexDirection: 'row' },
  page: { height: '100%' },
  pageContent: { flex: 1 },
  moveToolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  queueButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, flexGrow: 1,
    paddingHorizontal: spacing.md, borderRadius: 22, backgroundColor: colors.chilledBackground },
  queueLabel: { color: colors.chilled, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  moveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, backgroundColor: colors.chilledFill },
  moveLabel: { color: colors.buttonText, fontSize: 15, fontWeight: '600' },
  feedback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  error: { color: colors.error, fontSize: 16, textAlign: 'center' },
  retryButton: { alignSelf: 'stretch' },
  list: { flex: 1 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: spacing.lg, gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyDescription: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  item: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  itemName: { flexShrink: 1, color: colors.text, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  queuedBadge: { alignSelf: 'flex-start', color: colors.chilled, backgroundColor: colors.chilledBackground, fontSize: 12, overflow: 'hidden',
    lineHeight: 16, marginTop: 2, paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: 6 },
  quantity: { fontSize: 17, fontWeight: '400' },
  memo: { color: colors.textMuted, fontSize: 15 },
  expirationDate: { color: ingredientBadgeColors.unknown, fontSize: 14, lineHeight: 24, textAlign: 'right', fontVariant: ['tabular-nums'] },
}));
