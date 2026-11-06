/**
 * @file
 * 저장된 냉장고를 공통 도면으로 표시하며, 홈에서는 영역 대신 개별 수납 칸을 선택한다.
 * 칸 선택으로 재료 목록을 열고, 미등록 상태에서는 안내·등록 버튼을 표시한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeBottomTabScreenProps } from '@react-navigation/bottom-tabs/unstable';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { ActivityIndicator, Animated, AppState, BackHandler, Easing, ScrollView, StyleSheet, Text, View, useAnimatedValue } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { colors, fridgeDoorColors, spacing } from '@/theme/tokens';
import { headerStyles } from '@/theme/headerStyles';
import { SafeAreaView } from 'react-native-screens/experimental';
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
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import { useIngredientMoveQueue } from '@/features/ingredient/IngredientMoveQueueProvider';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import type { MainTabParamList } from '@/navigation/MainTabNavigator';
import { FRIDGE_HEADER_BUTTON_SIZE } from '@/features/fridge/components/fridgeDiagramLayout';
import { fridgeToolbarStyles } from '@/features/fridge/components/fridgeToolbarStyles';

type HomeScreenProps = CompositeScreenProps<
  NativeBottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
> & {
  onTabInteractionBlockedChange?: (blocked: boolean) => void;
};

const EMPTY_PREVIEW_ROWS = [{ id: 'top', doorCount: 1 }, { id: 'bottom', doorCount: 1 }];
const HOME_MENU_SIZE = 40;
const HOME_TOOLBAR_EDGE_SPACE = 8;

export function HomeScreen({ navigation, onTabInteractionBlockedChange }: HomeScreenProps) {
  const db = useSQLiteContext();
  const { ingredientIds: queuedIds, retain: retainMoveQueue } = useIngredientMoveQueue();
  const [refrigerator, setRefrigerator] = useState<Refrigerator | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ index: number; positionId?: string } | null>(null);
  const [isIngredientListOpen, setIsIngredientListOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [isMoveQueueOpen, setIsMoveQueueOpen] = useState(false);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(false);
  const [isToolbarChanging, setIsToolbarChanging] = useState(false);
  const [toolbarWidth, setToolbarWidth] = useState(0);
  const toolbarProgress = useAnimatedValue(0);
  const toolbarChanging = useRef(false);
  const closedScrollY = useRef(0);
  const isFocusBlocked = useCallback(() => toolbarChanging.current, []);
  const isSheetOpen = isIngredientListOpen || isMoveQueueOpen;
  const queuedIngredients = queuedIds.flatMap(id => ingredients.find(ingredient => ingredient.id === id) ?? []);
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
    setError(null);
    try {
      const result = await getRefrigerator(db);
      const storedIngredients = result ? await getIngredients(db) : [];
      if (request === loadRequest.current) {
        setRefrigerator(result);
        setIngredients(storedIngredients);
        retainMoveQueue(storedIngredients.map(ingredient => ingredient.id));
      }
    } catch {
      if (request === loadRequest.current) setError('냉장고 정보를 불러오지 못했습니다.');
    } finally {
      if (request === loadRequest.current) setIsLoading(false);
    }
  }, [db, resetFocus, retainMoveQueue]);

  useFocusEffect(useCallback(() => {
    void loadRefrigerator();
    return () => {
      loadRequest.current++; resetFocus();
      setSelectedSlot(null); setIsIngredientListOpen(false); setIsLegendOpen(false);
      setIsMoveQueueOpen(false);
    };
  }, [loadRefrigerator, resetFocus]));

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
      // 대기 목록은 네이티브 시트의 종료 신호에서만 정리한다.
      if (isMoveQueueOpen) return true;
      if (toolbarChanging.current) return true;
      if (isLegendOpen) setIsLegendOpen(false);
      else if (isIngredientListOpen) closeIngredientList();
      else closeFocusedArea();
      return true;
    });
    return () => subscription.remove();
  }, [activeFocus, closeFocusedArea, closeIngredientList, isIngredientListOpen, isLegendOpen, isMoveQueueOpen]);

  const layout = refrigerator ? getDraftLayout(refrigerator) : null;
  const selectedPosition = layout?.positions.find(position => position.id === selectedSlot?.positionId
    && position.areaId === selectedAreaId);
  const isToolbarAvailable = !!refrigerator && !isLoading && !error;
  const isToolbarHidden = isSheetOpen || isLegendOpen;
  const isToolbarBlocked = focusPhase === 'opening' || focusPhase === 'closing' || isToolbarChanging;
  const canUseToolbar = isToolbarExpanded && !isToolbarBlocked && !isToolbarHidden;

  function toggleToolbar() {
    if (toolbarChanging.current || isToolbarHidden || isToolbarBlocked || toolbarWidth <= 0) return;
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

  // 안전 영역의 바깥 여백도 홈 배경으로 채워 탭바 뒤에 기본 회색 배경이 드러나지 않게 한다.
  return (
    <View style={styles.container}>
      <SafeAreaView edges={{ bottom: true }} style={styles.container}>
        <View style={styles.scene}>
          <SafeAreaView style={[styles.container, (isLoading || error !== null) && styles.feedback]}
            edges={{ top: true, bottom: false, left: true, right: true }}
            pointerEvents={activeFocus || isToolbarHidden || isToolbarChanging ? 'none' : 'auto'} accessibilityElementsHidden={!!activeFocus || isToolbarHidden || isToolbarChanging}
            importantForAccessibility={activeFocus || isToolbarHidden || isToolbarChanging ? 'no-hide-descendants' : 'auto'}>
            {isLoading ? <ActivityIndicator color={colors.text} accessibilityLabel="냉장고 정보 불러오는 중" />
              : error ? <>
                <Text accessibilityRole="alert">{error}</Text>
                <PrimaryButton label="다시 불러오기" onPress={loadRefrigerator} />
              </> : refrigerator ? <>
                <View style={styles.header}>
                  <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.title}>{refrigerator.name}</Text>
                  <FeedbackPressable accessibilityRole="button" accessibilityLabel="냉장고 편집" style={styles.headerIconButton}
                    onPress={() => navigation.navigate('RefrigeratorRegistration', { refrigeratorId: refrigerator.id })}>
                    <MaterialDesignIcons name="pencil" size={24} color={colors.text} accessible={false} />
                  </FeedbackPressable>
                </View>
                <View style={styles.diagram}>
                  <View style={StyleSheet.absoluteFill}>
                    <FridgeInteriorMap draft={refrigerator} ingredients={ingredients} now={badgeDate} selectedAreaId={selectedAreaId ?? undefined}
                      onSelectArea={setSelectedAreaId} focus={activeFocus} onFocus={openFocusedArea} fitHeight layoutSize={diagramSizes.closed}
                      scrollVertically onCanvasOffsetChange={updateClosedScroll} />
                  </View>
                </View>
              </> : (
                <ScrollView style={styles.emptyScroll} contentContainerStyle={styles.emptyContent}
                  alwaysBounceVertical={false}>
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIllustration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
                      <FridgeStructurePreview rows={EMPTY_PREVIEW_ROWS} style={styles.emptyPreview} />
                    </View>
                    <Text accessibilityRole="header" style={styles.emptyTitle}>우리 집 냉장고를 등록해 보세요</Text>
                    <Text style={styles.emptyDescription}>문과 수납칸을 우리 집 냉장고 구조에 맞게 설정할 수 있어요.</Text>
                    <PrimaryButton label="냉장고 등록하기" icon="plus" style={styles.emptyButton}
                      onPress={() => navigation.navigate('RefrigeratorRegistration')} />
                  </View>
                </ScrollView>
              )}
          </SafeAreaView>
          {/* 떠 있는 도구 버튼의 높이를 제외하지 않고 전체 도면 영역을 측정한다. */}
          <View ref={focusViewport} collapsable={false} pointerEvents={isToolbarHidden || isToolbarChanging ? 'none' : 'box-none'}
            accessibilityElementsHidden={isToolbarHidden || isToolbarChanging}
            importantForAccessibility={isToolbarHidden || isToolbarChanging ? 'no-hide-descendants' : 'auto'}
            style={StyleSheet.absoluteFill} onLayout={layoutFocusViewport}>
            {refrigerator && activeFocus && focusBounds ? (
              <FridgeFocusView draft={refrigerator} ingredients={ingredients} now={badgeDate} target={activeFocus} viewport={focusBounds} phase={focusPhase}
                sizeViewport={diagramSizes.opened} flushVerticalEdges
                selectedAreaId={selectedAreaId ?? undefined} scrollHintEnabled={!hasSeenScrollHint}
                selectedSlotIndex={selectedSlot?.index}
                selectedPositionId={selectedSlot?.positionId}
                scrollHintBlocked={isToolbarHidden || isToolbarChanging}
                onSelectSlot={(areaId, index, positionId) => {
                  if (focusPhase !== 'open' || isToolbarHidden || toolbarChanging.current) return;
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
          <SafeAreaView edges={{ top: false, bottom: false, left: true, right: true }}
            pointerEvents={isToolbarHidden || isToolbarBlocked ? 'none' : 'box-none'} accessibilityElementsHidden={isToolbarHidden || isToolbarBlocked}
            importantForAccessibility={isToolbarHidden || isToolbarBlocked ? 'no-hide-descendants' : 'auto'}
            style={[styles.toolbarOverlay, isToolbarHidden && styles.hidden]}>
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
                    {queuedIngredients.length > 0 ? (
                      <FeedbackPressable accessibilityRole="button" accessibilityLabel="이동 대기 목록 열기"
                        accessibilityHint={`이동 대기 중인 재료 ${queuedIngredients.length}개를 확인합니다.`}
                        accessibilityState={{ disabled: !canUseToolbar }} disabled={false} interactionBlocked={!canUseToolbar}
                        onPress={() => { if (canUseToolbar && !toolbarChanging.current) setIsMoveQueueOpen(true); }}
                        style={[styles.action, styles.homeAction, styles.queueAction, styles.floatingButton]} hitSlop={4}>
                        <MaterialDesignIcons name="clipboard-text-outline" size={16} color={colors.chilled} accessible={false} />
                        <Text style={[styles.label, styles.homeLabel]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>이동 대기 {queuedIngredients.length}개</Text>
                      </FeedbackPressable>
                    ) : null}
                    <FeedbackPressable accessibilityRole="button" accessibilityLabel="재료 배지 범례"
                      accessibilityState={{ disabled: !canUseToolbar }} disabled={false} interactionBlocked={!canUseToolbar}
                      onPress={() => { if (canUseToolbar && !toolbarChanging.current) setIsLegendOpen(true); }}
                      style={[styles.action, styles.homeAction, styles.floatingButton]} hitSlop={4}>
                      <MaterialDesignIcons name="information-outline" size={16} color={colors.chilled} accessible={false} />
                      <Text style={[styles.label, styles.homeLabel]} numberOfLines={1}>범례</Text>
                    </FeedbackPressable>
                  </Animated.View>
                </View>
                <FeedbackPressable accessibilityRole="button" accessibilityLabel={isToolbarExpanded ? '도구 접기' : '도구 펼치기'}
                  accessibilityState={{ expanded: isToolbarExpanded, disabled: isToolbarBlocked }}
                  accessibilityHint={queuedIngredients.length ? `이동 대기 중인 재료 ${queuedIngredients.length}개가 있습니다.` : undefined}
                  disabled={false} interactionBlocked={isToolbarBlocked} onPress={toggleToolbar}
                  style={[styles.toolbarToggle, styles.floatingButton]} hitSlop={4}>
                  <MaterialDesignIcons name={isToolbarExpanded ? 'menu-close' : 'menu-open'} size={22} color={colors.chilled} accessible={false} />
                  {!isToolbarExpanded && queuedIngredients.length > 0 ? (
                    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.queueBadge}>
                      <Text style={styles.queueCount} numberOfLines={1} allowFontScaling={false} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {queuedIngredients.length > 99 ? '99+' : queuedIngredients.length}
                      </Text>
                    </View>
                  ) : null}
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
            onSaved={ingredient => setIngredients(current => current.some(item => item.id === ingredient.id)
              ? current.map(item => item.id === ingredient.id ? ingredient : item) : [...current, ingredient])}
            onDeleted={ingredientId => setIngredients(current => current.filter(item => item.id !== ingredientId))}
            onMoved={moved => setIngredients(current => current.map(item => moved.find(ingredient => ingredient.id === item.id) ?? item))}
            onClose={closeIngredientList} />
        ) : null}
      </SafeAreaView>
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
  title: {
    ...headerStyles.title,
    flex: 1,
  },
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
  homeActions: { alignItems: 'center' },
  homeAction: { flex: 0, flexShrink: 1, maxWidth: 180, minHeight: 36, flexDirection: 'row', gap: spacing.xs,
    paddingHorizontal: spacing.md, borderRadius: 18, borderColor: colors.sage },
  queueAction: { backgroundColor: colors.chilledBackground },
  homeLabel: { color: colors.chilled },
  floatingButton: { boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 8, color: `${colors.button}30` }] },
  toolbarToggle: { width: HOME_MENU_SIZE, height: HOME_MENU_SIZE, flexShrink: 0, alignItems: 'center', justifyContent: 'center',
    borderRadius: HOME_MENU_SIZE / 2, borderWidth: 1.5, borderColor: colors.chilled, backgroundColor: colors.sageLight },
  queueBadge: { position: 'absolute', top: -6, left: -6, width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background, backgroundColor: colors.chilled },
  queueCount: { maxWidth: 18, color: colors.buttonText, fontSize: 10, lineHeight: 12, textAlign: 'center', fontWeight: '700', includeFontPadding: false },
  hidden: { opacity: 0 },
  diagram: {
    flex: 1,
  },
});
