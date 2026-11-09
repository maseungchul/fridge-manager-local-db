/**
 * @file
 * 저장된 냉장고를 공통 도면으로 표시하며, 홈에서는 영역 대신 개별 수납 칸을 선택한다.
 * 칸 선택으로 재료 목록을 열고, 미등록 상태에서는 안내·등록 버튼을 표시한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { ActivityIndicator, Animated, AppState, BackHandler, Easing, ScrollView, StyleSheet, Text, View, useAnimatedValue } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { colors, fridgeDoorColors, spacing } from '@/theme/tokens';
import { headerStyles } from '@/theme/headerStyles';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { getRefrigerator } from '@/db/refrigeratorRepository';
import { getIngredients } from '@/db/ingredientRepository';
import { FridgeStructurePreview } from '@/features/fridge/components/FridgeStructurePreview';
import { FridgeIngredientLegend } from '@/features/fridge/components/FridgeIngredientLegend';
import { FridgeFocusView, FridgeInteriorMap, useFridgeFocus } from '@/features/fridge/components/FridgeInteriorMap';
import type { FridgeFocusPhase } from '@/features/fridge/components/FridgeInteriorMap';
import { getDraftLayout } from '@/features/fridge/model/fridgeLayout';
import type { Refrigerator } from '@/features/fridge/model/fridgeLayout';
import { IngredientListSheet } from '@/features/ingredient/components/IngredientListSheet';
import { IngredientMoveQueueSheet } from '@/features/ingredient/components/IngredientMoveQueueSheet';
import type { Ingredient, IngredientDraft } from '@/features/ingredient/model/ingredient';
import type { IngredientFormResult } from '@/screens/IngredientFormScreen';
import { useIngredientMoveQueue } from '@/features/ingredient/IngredientMoveQueueProvider';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import type { MainTabParamList } from '@/navigation/MainTabNavigator';
import { FRIDGE_HEADER_BUTTON_SIZE } from '@/features/fridge/components/fridgeDiagramLayout';
import { fridgeToolbarStyles } from '@/features/fridge/components/fridgeToolbarStyles';
import { useTranslation } from '@/i18n/LanguageProvider';

type HomeScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
> & {
  onTabInteractionBlockedChange?: (blocked: boolean) => void;
  takeIngredientFormResult: () => IngredientFormResult | null;
};

const EMPTY_PREVIEW_ROWS = [{ id: 'top', doorCount: 1 }, { id: 'bottom', doorCount: 1 }];
const HOME_MENU_SIZE = 40;
const HOME_TOOL_ICON_SIZE = 22;
const HOME_TOOLBAR_EDGE_SPACE = 8;
const LOADING_DELAY_MS = 200;
const MIN_LOADING_VISIBLE_MS = 300;
const EMPTY_INGREDIENT_DRAFT: IngredientDraft = { name: '', quantity: '', memo: '', expirationDate: null };

export function HomeScreen({ navigation, onTabInteractionBlockedChange, takeIngredientFormResult }: HomeScreenProps) {
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const { ingredientIds: queuedIds, retain: retainMoveQueue } = useIngredientMoveQueue();
  const [refrigerator, setRefrigerator] = useState<Refrigerator | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<'home.loadError' | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ index: number; positionId?: string } | null>(null);
  const [isIngredientListOpen, setIsIngredientListOpen] = useState(false);
  const ingredientFormPending = useRef(false);
  const [ingredientListIndex, setIngredientListIndex] = useState(0);
  const addIngredientDraft = useRef(EMPTY_INGREDIENT_DRAFT);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [isMoveQueueOpen, setIsMoveQueueOpen] = useState(false);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(true);
  const [isToolbarChanging, setIsToolbarChanging] = useState(false);
  const [toolbarWidth, setToolbarWidth] = useState(0);
  const toolbarProgress = useAnimatedValue(1);
  const toolbarChanging = useRef(false);
  const closedScrollY = useRef(0);
  const isFocusBlocked = useCallback(() => toolbarChanging.current, []);
  const isSheetOpen = isIngredientListOpen || isMoveQueueOpen;
  const queuedIngredients = queuedIds.flatMap(id => ingredients.find(ingredient => ingredient.id === id) ?? []);
  const hasQueuedIngredients = queuedIngredients.length > 0;
  const [badgeDate, setBadgeDate] = useState(() => new Date());
  const loadRequest = useRef(0);
  const {
    selectedAreaId, setSelectedAreaId, setFocusTarget, focusPhase, focusBounds, focusViewport, activeFocus,
    hasSeenScrollHint, markScrollHintSeen, finishFocusTransition, resetFocus,
    layoutFocusViewport, openFocusedArea, closeFocusedArea, diagramSizes,
  } = useFridgeFocus(0, isFocusBlocked);
  const finishHomeFocus = useCallback((phase: FridgeFocusPhase) => {
    finishFocusTransition(phase);
    if (phase === 'closed') { setSelectedSlot(null); setIsIngredientListOpen(false); }
  }, [finishFocusTransition]);
  // 시트 종료 후 패널과 선택 상태를 함께 비운다.
  const closeIngredientList = useCallback(() => {
    setIsIngredientListOpen(false);
    setIngredientListIndex(0);
    addIngredientDraft.current = EMPTY_INGREDIENT_DRAFT;
    setSelectedSlot(null);
    setSelectedAreaId(null);
  }, [setSelectedAreaId]);

  // 홈 재진입·재시도 이전에 시작한 조회가 늦게 끝나도 최신 결과만 반영한다.
  const loadRefrigerator = useCallback(async () => {
    const request = ++loadRequest.current;
    closedScrollY.current = 0;
    resetFocus();
    setSelectedSlot(null);
    setIsIngredientListOpen(false);
    setIsLegendOpen(false);
    setIsMoveQueueOpen(false);
    setIsLoading(true);
    setShowLoading(false);
    setError(null);
    let loadingShownAt: number | null = null;
    const loadingTimer = setTimeout(() => {
      if (request !== loadRequest.current) return;
      loadingShownAt = Date.now();
      setShowLoading(true);
    }, LOADING_DELAY_MS);
    try {
      const result = await getRefrigerator(db);
      const storedIngredients = result ? await getIngredients(db) : [];
      if (request === loadRequest.current) {
        setRefrigerator(result);
        setIngredients(storedIngredients);
        retainMoveQueue(storedIngredients.map(ingredient => ingredient.id));
      }
    } catch {
      if (request === loadRequest.current) setError('home.loadError');
    } finally {
      clearTimeout(loadingTimer);
      if (loadingShownAt !== null) {
        const remaining = MIN_LOADING_VISIBLE_MS - (Date.now() - loadingShownAt);
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
      }
      if (request === loadRequest.current) {
        setHasLoaded(true);
        setIsLoading(false);
        setShowLoading(false);
      }
    }
  }, [db, resetFocus, retainMoveQueue]);

  useFocusEffect(useCallback(() => {
    if (ingredientFormPending.current) {
      ingredientFormPending.current = false;
      const result = takeIngredientFormResult();
      if (result) {
        if (!result.isEditing) addIngredientDraft.current = result.savedIngredient ? EMPTY_INGREDIENT_DRAFT : result.draft;
        const savedIngredient = result.savedIngredient;
        if (savedIngredient) setIngredients(current => current.some(item => item.id === savedIngredient.id)
          ? current.map(item => item.id === savedIngredient.id ? savedIngredient : item) : [...current, savedIngredient]);
      }
      setIsIngredientListOpen(true);
    } else {
      void loadRefrigerator();
    }
    return () => {
      loadRequest.current++;
      // 재료 입력 화면을 다녀올 때는 도면·선택·목록 높이와 추가 초안을 유지한다.
      if (ingredientFormPending.current) return;
      setIngredientListIndex(0);
      addIngredientDraft.current = EMPTY_INGREDIENT_DRAFT;
      resetFocus();
      setSelectedSlot(null); setIsIngredientListOpen(false); setIsLegendOpen(false);
      setIsMoveQueueOpen(false);
    };
  }, [loadRefrigerator, resetFocus, takeIngredientFormResult]));

  // 자정과 앱 복귀 때 날짜를 갱신해 도면을 다시 열지 않아도 배지의 기한 분류를 맞춘다.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refreshBadgeDate() {
      const now = new Date();
      setBadgeDate(now);
      clearTimeout(timer);
      timer = setTimeout(refreshBadgeDate, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime());
    }
    refreshBadgeDate();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refreshBadgeDate(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);

  // 네이티브 패널이 열린 동안에만 배경 탭의 조작을 막는다.
  useEffect(() => {
    onTabInteractionBlockedChange?.(isSheetOpen);
    return () => onTabInteractionBlockedChange?.(false);
  }, [isSheetOpen, onTabInteractionBlockedChange]);

  // 도면의 크기·스크롤은 유지하고 떠 있는 도구 버튼만 가로로 전환한다.
  useEffect(() => {
    if (!toolbarChanging.current) return;
    let active = true;
    const animation = Animated.timing(toolbarProgress, {
      toValue: isToolbarExpanded ? 1 : 0, duration: 240,
      easing: Easing.inOut(Easing.cubic), useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (!active) return;
      if (!finished) toolbarProgress.setValue(isToolbarExpanded ? 1 : 0);
      toolbarChanging.current = false;
      setIsToolbarChanging(false);
    });
    return () => { active = false; animation.stop(); };
  }, [isToolbarExpanded, toolbarProgress]);

  useEffect(() => {
    if (!activeFocus && !isMoveQueueOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (ingredientFormPending.current) return false;
      // 대기 목록은 시트의 닫기 애니메이션 완료 신호에서만 정리한다.
      if (isMoveQueueOpen) return true;
      if (toolbarChanging.current) return true;
      if (isLegendOpen) setIsLegendOpen(false);
      else if (isIngredientListOpen) closeIngredientList();
      else closeFocusedArea();
      return true;
    });
    return () => subscription.remove();
  }, [activeFocus, closeFocusedArea, closeIngredientList, isIngredientListOpen, isLegendOpen, isMoveQueueOpen]);

  const layout = refrigerator ? getDraftLayout(refrigerator, [], t) : null;
  const selectedPosition = layout?.positions.find(position => position.id === selectedSlot?.positionId
    && position.areaId === selectedAreaId);
  const isToolbarAvailable = !!refrigerator && (!isLoading || (hasLoaded && !showLoading)) && !error;
  const isOverlayOpen = isSheetOpen || isLegendOpen;
  const isToolbarBlocked = isLoading || focusPhase === 'opening' || focusPhase === 'closing' || isToolbarChanging;
  const canUseToolbar = isToolbarExpanded && !isToolbarBlocked && !isOverlayOpen;

  function toggleToolbar() {
    if (toolbarChanging.current || isOverlayOpen || isToolbarBlocked || toolbarWidth <= 0) return;
    toolbarChanging.current = true;
    setIsToolbarChanging(true);
    setIsToolbarExpanded(current => !current);
  }

  function updateClosedScroll(y: number) {
    const shift = closedScrollY.current - y;
    closedScrollY.current = y;
    // 배경 스크롤이 표시 영역에 맞게 보정돼도 문이 실제 원래 자리로 돌아가게 한다.
    if (activeFocus && shift !== 0) setFocusTarget(current => current
      ? { ...current, canvas: { ...current.canvas, y: current.canvas.y + shift } } : current);
  }

  // 하단 안전 영역은 탭바가 확보하며, 도구와 도면은 탭바 위의 같은 영역을 사용한다.
  return (
    <View style={styles.container}>
      <View style={styles.container}>
        <View style={styles.scene}>
          <SafeAreaView style={[styles.container, ((isLoading && (!hasLoaded || showLoading)) || error !== null) && styles.feedback]}
            edges={['top', 'left', 'right']}
            pointerEvents={activeFocus || isOverlayOpen || isToolbarChanging || isLoading ? 'none' : 'auto'} accessibilityElementsHidden={!!activeFocus || isOverlayOpen || isToolbarChanging || (isLoading && !showLoading)}
            importantForAccessibility={activeFocus || isOverlayOpen || isToolbarChanging || (isLoading && !showLoading) ? 'no-hide-descendants' : 'auto'}>
            {isLoading && (!hasLoaded || showLoading) ? (showLoading ? <ActivityIndicator color={colors.text} accessibilityLabel={t('home.loading')} /> : null)
              : error ? <>
                <Text accessibilityRole="alert">{t(error)}</Text>
                <PrimaryButton label={t('common.retry')} onPress={loadRefrigerator} />
              </> : <>
                <View style={styles.header}>
                  <View style={styles.headerText}>
                    <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{t('tabs.fridge')}</Text>
                    {refrigerator && <Text numberOfLines={1} ellipsizeMode="tail" accessibilityLabel={refrigerator.name} style={styles.refrigeratorName}>{refrigerator.name}</Text>}
                  </View>
                  {refrigerator && <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('fridge.edit')} style={styles.headerIconButton}
                    onPress={() => navigation.navigate('RefrigeratorRegistration', { refrigeratorId: refrigerator.id })}>
                    <MaterialDesignIcons name="pencil" size={24} color={colors.text} accessible={false} />
                  </FeedbackPressable>}
                </View>
                {refrigerator ? <View style={styles.diagram}>
                  <View style={StyleSheet.absoluteFill}>
                    <FridgeInteriorMap draft={refrigerator} ingredients={ingredients} now={badgeDate} selectedAreaId={selectedAreaId ?? undefined}
                      onSelectArea={setSelectedAreaId} focus={activeFocus} onFocus={openFocusedArea} fitHeight layoutSize={diagramSizes.closed}
                      scrollVertically onCanvasOffsetChange={updateClosedScroll} />
                  </View>
                </View> : (
                  <ScrollView style={styles.emptyScroll} contentContainerStyle={styles.emptyContent}
                    alwaysBounceVertical={false}>
                    <View style={styles.emptyState}>
                      <View style={styles.emptyIllustration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
                        <FridgeStructurePreview rows={EMPTY_PREVIEW_ROWS} style={styles.emptyPreview} />
                      </View>
                      <Text accessibilityRole="header" style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
                      <Text style={styles.emptyDescription}>{t('home.emptyDescription')}</Text>
                      <PrimaryButton label={t('home.register')} icon="plus" style={styles.emptyButton}
                        onPress={() => navigation.navigate('RefrigeratorRegistration')} />
                    </View>
                  </ScrollView>
                )}
              </>}
          </SafeAreaView>
          {/* 떠 있는 도구 버튼의 높이를 제외하지 않고 전체 도면 영역을 측정한다. */}
          <View ref={focusViewport} collapsable={false} pointerEvents={isOverlayOpen || isToolbarChanging ? 'none' : 'box-none'}
            accessibilityElementsHidden={isOverlayOpen || isToolbarChanging}
            importantForAccessibility={isOverlayOpen || isToolbarChanging ? 'no-hide-descendants' : 'auto'}
            style={StyleSheet.absoluteFill} onLayout={layoutFocusViewport}>
            {refrigerator && activeFocus && focusBounds ? (
              <FridgeFocusView draft={refrigerator} ingredients={ingredients} now={badgeDate} target={activeFocus} viewport={focusBounds} phase={focusPhase}
                sizeViewport={diagramSizes.opened} flushVerticalEdges
                selectedAreaId={selectedAreaId ?? undefined} scrollHintEnabled={!hasSeenScrollHint}
                selectedSlotIndex={selectedSlot?.index}
                selectedPositionId={selectedSlot?.positionId}
                scrollHintBlocked={isOverlayOpen || isToolbarChanging}
                onSelectSlot={(areaId, index, positionId) => {
                  if (focusPhase !== 'open' || isOverlayOpen || toolbarChanging.current) return;
                  setSelectedAreaId(areaId);
                  setSelectedSlot({ index, positionId });
                  setIsIngredientListOpen(!!layout?.positions.some(position => position.id === positionId && position.areaId === areaId));
                }}
                onScrollHintSeen={markScrollHintSeen} onPhaseChange={finishHomeFocus}
                onClose={closeFocusedArea} />
            ) : null}
          </View>
        </View>
        {isToolbarAvailable ? (
          <SafeAreaView edges={['left', 'right']}
            pointerEvents={isOverlayOpen || isToolbarBlocked ? 'none' : 'box-none'} accessibilityElementsHidden={isOverlayOpen || isToolbarBlocked}
            importantForAccessibility={isOverlayOpen || isToolbarBlocked ? 'no-hide-descendants' : 'auto'}
            style={styles.toolbarOverlay}>
            <View pointerEvents="box-none" style={styles.toolbarAnchor}>
              <View pointerEvents="box-none" style={styles.toolbarRow}>
                <View style={styles.toolbarToolsViewport}
                  onLayout={({ nativeEvent: { layout } }) => setToolbarWidth(layout.width)}
                  pointerEvents={canUseToolbar ? 'box-none' : 'none'} accessibilityElementsHidden={!canUseToolbar}
                  importantForAccessibility={canUseToolbar ? 'auto' : 'no-hide-descendants'}>
                  <Animated.View style={[styles.actions, styles.homeActions, { opacity: toolbarProgress,
                    transform: [{ translateX: toolbarProgress.interpolate({ inputRange: [0, 1], outputRange: [toolbarWidth, 0] }) }] }]}
                    pointerEvents={canUseToolbar ? 'box-none' : 'none'} accessibilityElementsHidden={!canUseToolbar}
                    importantForAccessibility={canUseToolbar ? 'auto' : 'no-hide-descendants'}>
                    <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('legend.open')}
                      accessibilityState={{ disabled: !canUseToolbar }} disabled={false} interactionBlocked={!canUseToolbar}
                      onPress={() => { if (canUseToolbar && !toolbarChanging.current) setIsLegendOpen(true); }}
                      style={[styles.action, styles.homeAction]} hitSlop={4}>
                      <MaterialDesignIcons name="information-outline" size={18} color={colors.chilled} accessible={false} />
                      <Text style={[styles.label, styles.homeLabel]} numberOfLines={1}>{t('legend.label')}</Text>
                    </FeedbackPressable>
                    <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('queue.open')}
                      accessibilityHint={hasQueuedIngredients ? t('queue.openHint', { count: queuedIngredients.length }) : t('queue.emptyDescription')}
                      accessibilityState={{ disabled: !canUseToolbar }} disabled={false} interactionBlocked={!canUseToolbar}
                      onPress={() => { if (canUseToolbar && !toolbarChanging.current) setIsMoveQueueOpen(true); }}
                      style={[styles.action, styles.homeAction]} hitSlop={4}>
                      <View>
                        <MaterialDesignIcons name="clipboard-text-outline" size={18} color={colors.chilled} accessible={false} />
                        {hasQueuedIngredients && isToolbarExpanded ? (
                          <View style={styles.queueDot} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                            <View style={styles.queueDotFill} />
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.label, styles.homeLabel]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('queue.pending')}</Text>
                    </FeedbackPressable>
                  </Animated.View>
                </View>
                <FeedbackPressable accessibilityRole="button" accessibilityLabel={isToolbarExpanded ? t('home.collapseTools') : t('home.expandTools')}
                  accessibilityHint={!isToolbarExpanded && hasQueuedIngredients ? t('queue.openHint', { count: queuedIngredients.length }) : undefined}
                  accessibilityState={{ expanded: isToolbarExpanded, disabled: isToolbarBlocked }}
                  disabled={false} interactionBlocked={isToolbarBlocked} onPress={toggleToolbar} feedback="chilled"
                  style={[styles.toolbarToggle, styles.floatingButton]} hitSlop={4}>
                  <View>
                    <MaterialDesignIcons name={isToolbarExpanded ? 'menu-close' : 'menu-open'} size={HOME_TOOL_ICON_SIZE} color={colors.buttonText} accessible={false} />
                    {!isToolbarExpanded && hasQueuedIngredients ? (
                      <View style={[styles.queueDot, styles.queueDotOnToggle]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                        <View style={styles.queueDotFill} />
                      </View>
                    ) : null}
                  </View>
                </FeedbackPressable>
              </View>
            </View>
          </SafeAreaView>
        ) : null}
        {isLegendOpen ? <FridgeIngredientLegend onClose={() => setIsLegendOpen(false)} /> : null}
        {isMoveQueueOpen && layout ? <IngredientMoveQueueSheet ingredients={queuedIngredients} layout={layout}
          onClose={() => setIsMoveQueueOpen(false)} /> : null}
        {isIngredientListOpen && focusPhase === 'open' && selectedPosition && layout ? (
          <IngredientListSheet key={selectedPosition.id} position={selectedPosition} layout={layout} allIngredients={ingredients}
            initialIndex={ingredientListIndex} onIndexChange={setIngredientListIndex}
            onOpenForm={ingredient => {
              if (ingredientFormPending.current) return;
              ingredientFormPending.current = true;
              setIsIngredientListOpen(false);
              navigation.navigate('IngredientForm', {
                position: { slotId: selectedPosition.slotId, drawerNumber: selectedPosition.drawerNumber ?? 0 },
                ingredient,
                draft: ingredient ? { name: ingredient.name, quantity: ingredient.quantity,
                  memo: ingredient.memo, expirationDate: ingredient.expirationDate } : addIngredientDraft.current,
              });
            }}
            onDeleted={ingredientId => setIngredients(current => current.filter(item => item.id !== ingredientId))}
            onMoved={moved => setIngredients(current => current.map(item => moved.find(ingredient => ingredient.id === item.id) ?? item))}
            onClose={closeIngredientList} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ...fridgeToolbarStyles,
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  feedback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  emptyScroll: {
    flex: 1,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg * 3,
  },
  emptyState: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    alignItems: 'center',
  },
  emptyIllustration: {
    width: 176,
    height: 176,
    borderRadius: 88,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: fridgeDoorColors.CHILLED.background,
    marginBottom: spacing.lg,
  },
  emptyPreview: {
    width: 72,
  },
  emptyTitle: {
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  emptyDescription: {
    marginTop: spacing.sm,
    maxWidth: 288,
    fontSize: 15,
    lineHeight: 24,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyButton: {
    width: '100%',
    marginTop: spacing.lg,
  },
  header: {
    ...headerStyles.header,
  },
  headerText: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  title: { ...headerStyles.title },
  refrigeratorName: { flex: 1, color: colors.textMuted, fontSize: 14, lineHeight: 20, includeFontPadding: false },
  headerIconButton: {
    width: FRIDGE_HEADER_BUTTON_SIZE,
    height: FRIDGE_HEADER_BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  scene: { flex: 1, minHeight: 0, overflow: 'hidden' },
  toolbarOverlay: { ...StyleSheet.absoluteFill, zIndex: 30 },
  toolbarAnchor: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: HOME_TOOLBAR_EDGE_SPACE, paddingBottom: 4 },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // 슬라이드 영역 안쪽에 그림자 여유를 두고 버튼 밖의 터치는 도면으로 전달한다.
  toolbarToolsViewport: { flex: 1, minWidth: 0, overflow: 'hidden', paddingVertical: spacing.sm, paddingHorizontal: HOME_TOOLBAR_EDGE_SPACE },
  homeActions: { alignItems: 'center', justifyContent: 'flex-end' },
  homeAction: { flex: 0, flexShrink: 1, maxWidth: 180, minHeight: HOME_MENU_SIZE, flexDirection: 'row', gap: spacing.xs,
    paddingHorizontal: spacing.sm, borderRadius: 18, borderColor: colors.sage,
    boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: `${colors.button}14` }] },
  homeLabel: { color: colors.chilled, fontSize: 14 },
  // 점 주변은 각 버튼 배경색으로 채워 아이콘과 구분한다.
  queueDot: { position: 'absolute', top: -4, right: -3, width: 10, height: 10, borderRadius: 5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  queueDotOnToggle: { top: -2, right: -2, backgroundColor: colors.chilled },
  queueDotFill: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.moveQueueBadge },
  floatingButton: { boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 8, color: `${colors.button}30` }] },
  toolbarToggle: { width: HOME_MENU_SIZE, height: HOME_MENU_SIZE, flexShrink: 0, alignItems: 'center', justifyContent: 'center',
    borderRadius: HOME_MENU_SIZE / 2, backgroundColor: colors.chilled },
  diagram: {
    flex: 1,
  },
});
