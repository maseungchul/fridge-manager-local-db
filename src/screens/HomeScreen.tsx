/**
 * @file
 * 저장된 냉장고를 공통 도면으로 표시하며, 홈에서는 영역 대신 개별 수납 칸을 선택한다.
 * 칸 선택을 재료 목록 또는 이동 목적지로 연결하고, 미등록 상태에서는 안내·등록 버튼을 표시한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeBottomTabScreenProps } from '@react-navigation/bottom-tabs/unstable';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { ActivityIndicator, Alert, AppState, BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { colors, fridgeDoorColors, spacing } from '@/theme/tokens';
import { SafeAreaView } from 'react-native-screens/experimental';
import { PrimaryButton } from '@/components/PrimaryButton';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { FloatingIconButton } from '@/components/FloatingIconButton';
import { alertTitles } from '@/constants/alertTitles';
import { getRefrigerator } from '@/db/refrigeratorRepository';
import { getIngredients, moveIngredient } from '@/db/ingredientRepository';
import { FridgeStructurePreview } from '@/features/fridge/components/FridgeStructurePreview';
import { FridgeIngredientLegend } from '@/features/fridge/components/FridgeIngredientLegend';
import { FridgeFocusView, FridgeInteriorMap, useFridgeFocus } from '@/features/fridge/components/FridgeInteriorMap';
import type { FridgeFocusPhase } from '@/features/fridge/components/FridgeInteriorMap';
import { getDraftLayout } from '@/features/fridge/model/fridgeLayout';
import type { Refrigerator, SlotPosition } from '@/features/fridge/model/fridgeLayout';
import { IngredientListSheet } from '@/features/ingredient/components/IngredientListSheet';
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import type { MainTabParamList } from '@/navigation/MainTabNavigator';
import { FRIDGE_HEADER_BUTTON_SIZE } from '@/features/fridge/components/fridgeDiagramLayout';

type HomeScreenProps = CompositeScreenProps<
  NativeBottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
> & { onTabInteractionBlockedChange?: (blocked: boolean) => void };

interface IngredientMove {
  ingredient: Ingredient;
  phase: 'selecting' | 'saving';
}

const EMPTY_PREVIEW_ROWS = [{ id: 'top', doorCount: 1 }, { id: 'bottom', doorCount: 1 }];
const MOVE_NOTICE_DURATION = 2000;

export function HomeScreen({ navigation, onTabInteractionBlockedChange }: HomeScreenProps) {
  const db = useSQLiteContext();
  const [refrigerator, setRefrigerator] = useState<Refrigerator | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ index: number; positionId?: string } | null>(null);
  const [isIngredientListOpen, setIsIngredientListOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [badgeDate, setBadgeDate] = useState(() => new Date());
  const [ingredientMove, setIngredientMove] = useState<IngredientMove | null>(null);
  const [moveNotice, setMoveNotice] = useState<{ message: string } | null>(null);
  const moveRequest = useRef<IngredientMove | null>(null);
  const isMoveLocked = ingredientMove?.phase === 'saving';
  const isTabInteractionBlocked = isIngredientListOpen || ingredientMove !== null;
  const loadRequest = useRef(0);
  // 같은 이벤트 묶음의 중복 선택·확인도 막을 수 있게 화면 상태와 요청 참조를 함께 바꾼다.
  const changeIngredientMove = useCallback((move: IngredientMove | null) => {
    moveRequest.current = move;
    setIngredientMove(move);
  }, []);
  const isMoveBlocked = useCallback(() => moveRequest.current?.phase === 'saving', []);
  const {
    selectedAreaId, setSelectedAreaId, focusPhase, focusBounds, focusViewport, activeFocus,
    hasSeenScrollHint, markScrollHintSeen, finishFocusTransition, resetFocus,
    layoutFocusViewport, openFocusedArea, closeFocusedArea, diagramSizes,
  } = useFridgeFocus(0, isMoveBlocked);
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

  const cancelIngredientMove = useCallback(() => {
    if (moveRequest.current?.phase !== 'selecting') return;
    changeIngredientMove(null);
    closeIngredientList();
  }, [changeIngredientMove, closeIngredientList]);

  // 홈 재진입·재시도 이전에 시작한 조회가 늦게 끝나도 최신 결과만 반영한다.
  const loadRefrigerator = useCallback(async () => {
    const request = ++loadRequest.current;
    changeIngredientMove(null);
    setMoveNotice(null);
    resetFocus();
    setSelectedSlot(null);
    setIsIngredientListOpen(false);
    setIsLegendOpen(false);
    setIsLoading(true);
    setError(null);
    try {
      const result = await getRefrigerator(db);
      const storedIngredients = result ? await getIngredients(db) : [];
      if (request === loadRequest.current) {
        setRefrigerator(result);
        setIngredients(storedIngredients);
      }
    } catch {
      if (request === loadRequest.current) setError('냉장고 정보를 불러오지 못했습니다.');
    } finally {
      if (request === loadRequest.current) setIsLoading(false);
    }
  }, [db, resetFocus, changeIngredientMove]);

  useFocusEffect(useCallback(() => {
    void loadRefrigerator();
    return () => {
      loadRequest.current++; changeIngredientMove(null); resetFocus();
      setMoveNotice(null);
      setSelectedSlot(null); setIsIngredientListOpen(false); setIsLegendOpen(false);
    };
  }, [loadRefrigerator, resetFocus, changeIngredientMove]));

  // 연속 이동도 마지막 성공 시점부터 표시 시간을 다시 계산하고, 화면 종료 시 타이머를 정리한다.
  useEffect(() => {
    if (!moveNotice) return;
    const timer = setTimeout(() => setMoveNotice(current => current === moveNotice ? null : current), MOVE_NOTICE_DURATION);
    return () => clearTimeout(timer);
  }, [moveNotice]);

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

  // 패널·이동을 종료할 때까지 탭 이동으로 작업 흐름이 끊기지 않게 한다.
  useEffect(() => {
    onTabInteractionBlockedChange?.(isTabInteractionBlocked);
    return () => onTabInteractionBlockedChange?.(false);
  }, [isTabInteractionBlocked, onTabInteractionBlockedChange]);

  useEffect(() => {
    if (!activeFocus && !ingredientMove) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (moveRequest.current) cancelIngredientMove();
      else if (isLegendOpen) setIsLegendOpen(false);
      else if (isIngredientListOpen) closeIngredientList();
      else closeFocusedArea();
      return true;
    });
    return () => subscription.remove();
  }, [activeFocus, closeFocusedArea, closeIngredientList, isIngredientListOpen, isLegendOpen, ingredientMove, cancelIngredientMove]);

  const layout = refrigerator ? getDraftLayout(refrigerator) : null;
  const selectedPosition = layout?.positions.find(position => position.id === selectedSlot?.positionId
    && position.areaId === selectedAreaId);
  const legendButton = refrigerator && !isLoading && !error && !isIngredientListOpen && !ingredientMove ? (
    <FloatingIconButton label="범례" icon="information-outline" accessibilityLabel="재료 배지 범례" size="small"
      accessibilityHint="재료 배지의 색상과 의미를 확인합니다." expanded={isLegendOpen}
      disabled={focusPhase === 'opening' || focusPhase === 'closing'}
      onPress={() => setIsLegendOpen(true)} />
  ) : null;

  async function selectMoveDestination(destination: SlotPosition, index: number) {
    const move = moveRequest.current;
    if (!move || move.phase !== 'selecting') return;
    if (move.ingredient.slotId === destination.slotId && move.ingredient.drawerNumber === (destination.drawerNumber ?? 0)) return;
    const saving: IngredientMove = { ...move, phase: 'saving' };
    changeIngredientMove(saving);
    setSelectedAreaId(destination.areaId);
    setSelectedSlot({ index, positionId: destination.id });
    let ingredient: Ingredient;
    try {
      ingredient = await moveIngredient(db, move.ingredient, { slotId: destination.slotId, drawerNumber: destination.drawerNumber ?? 0 });
    } catch {
      if (moveRequest.current !== saving) return;
      changeIngredientMove({ ...move, phase: 'selecting' });
      closeIngredientList();
      Alert.alert(alertTitles.error, '재료를 이동하지 못했습니다. 보관 위치를 다시 확인하고 재시도해 주세요.');
      return;
    }
    if (moveRequest.current !== saving) return;
    setIngredients(current => current.map(item => item.id === ingredient.id ? ingredient : item));
    changeIngredientMove(null);
    closeIngredientList();
    setMoveNotice({ message: '재료를 이동했습니다.' });
  }

  return (
    <View style={styles.container} onAccessibilityEscape={ingredientMove ? cancelIngredientMove : undefined}>
      <SafeAreaView style={[styles.container, (isLoading || error !== null) && styles.feedback]}
        edges={{ top: true, bottom: true, left: true, right: true }}
        pointerEvents={activeFocus || isLegendOpen || isMoveLocked ? 'none' : 'auto'} accessibilityElementsHidden={!!activeFocus || isLegendOpen || isMoveLocked}
        importantForAccessibility={activeFocus || isLegendOpen || isMoveLocked ? 'no-hide-descendants' : 'auto'}>
        {isLoading ? <ActivityIndicator color={colors.text} accessibilityLabel="냉장고 정보 불러오는 중" />
          : error ? <>
            <Text accessibilityRole="alert">{error}</Text>
            <PrimaryButton label="다시 불러오기" onPress={loadRefrigerator} />
          </> : refrigerator ? <>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>{refrigerator.name}</Text>
              <FeedbackPressable accessibilityRole="button" accessibilityLabel="냉장고 편집" style={styles.headerIconButton}
                disabled={ingredientMove !== null} accessibilityState={{ disabled: ingredientMove !== null }}
                onPress={() => { if (!moveRequest.current) navigation.navigate('RefrigeratorRegistration', { refrigeratorId: refrigerator.id }); }}>
                <MaterialDesignIcons name="pencil" size={24} color={colors.text} accessible={false} />
              </FeedbackPressable>
            </View>
            <View style={styles.diagram}>
              <View style={[StyleSheet.absoluteFill, styles.content]}>
                <FridgeInteriorMap draft={refrigerator} ingredients={ingredients} now={badgeDate} selectedAreaId={selectedAreaId ?? undefined}
                  onSelectArea={setSelectedAreaId} focus={activeFocus} onFocus={openFocusedArea} fitHeight layoutSize={diagramSizes.closed} />
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
      {/* 이름과 안전 영역의 여백을 제외하지 않은 화면 전체를 중앙 보기의 기준으로 사용한다. */}
      <View ref={focusViewport} collapsable={false} pointerEvents={isIngredientListOpen || isLegendOpen || isMoveLocked ? 'none' : 'box-none'}
        accessibilityElementsHidden={isIngredientListOpen || isLegendOpen || isMoveLocked}
        importantForAccessibility={isIngredientListOpen || isLegendOpen || isMoveLocked ? 'no-hide-descendants' : 'auto'}
        style={StyleSheet.absoluteFill} onLayout={layoutFocusViewport}>
        {refrigerator && activeFocus && focusBounds ? (
          <FridgeFocusView draft={refrigerator} ingredients={ingredients} now={badgeDate} target={activeFocus} viewport={focusBounds} phase={focusPhase}
            sizeViewport={diagramSizes.opened}
            selectedAreaId={selectedAreaId ?? undefined} scrollHintEnabled={!hasSeenScrollHint}
            selectedSlotIndex={selectedSlot?.index}
            selectedPositionId={selectedSlot?.positionId}
            scrollHintBlocked={isIngredientListOpen || isLegendOpen || ingredientMove !== null}
            onSelectSlot={(areaId, index, positionId) => {
              if (focusPhase !== 'open' || isMoveBlocked()) return;
              const destination = layout?.positions.find(position => position.id === positionId && position.areaId === areaId);
              if (moveRequest.current) {
                if (!destination || isIngredientListOpen) return;
                void selectMoveDestination(destination, index);
                return;
              }
              setSelectedAreaId(areaId);
              setSelectedSlot({ index, positionId });
              setIsIngredientListOpen(!!layout?.positions.some(position => position.id === positionId && position.areaId === areaId));
            }}
            onScrollHintSeen={markScrollHintSeen} onPhaseChange={finishHomeFocus}
            onClose={closeFocusedArea} />
        ) : null}
      </View>
      {/* 열린 도면의 배경 위에서도 같은 하단 위치를 유지하고, 버튼 밖은 도면으로 터치를 전달한다. */}
      {legendButton ? (
        <SafeAreaView pointerEvents={isLegendOpen ? 'none' : 'box-none'} accessibilityElementsHidden={isLegendOpen}
          importantForAccessibility={isLegendOpen ? 'no-hide-descendants' : 'auto'}
          edges={{ top: false, bottom: true, left: true, right: true }} style={styles.legendOverlay}>
          <View pointerEvents="box-none" style={styles.legendAnchor}>{legendButton}</View>
        </SafeAreaView>
      ) : null}
      {ingredientMove ? (
        <SafeAreaView pointerEvents="box-none" edges={{ top: false, bottom: true, left: true, right: true }} style={styles.legendOverlay}>
          <View pointerEvents="box-none" style={styles.moveAnchor}>
            <View style={styles.moveBanner}>
              {ingredientMove.phase === 'saving' ? <ActivityIndicator color={colors.chilled} accessibilityLabel="재료 이동 중" /> : null}
              <Text style={styles.moveLabel} accessibilityLiveRegion="polite">
                {ingredientMove.phase === 'saving' ? `${ingredientMove.ingredient.name} 이동 중…`
                  : `${ingredientMove.ingredient.name} ${ingredientMove.ingredient.quantity}\n이동할 칸을 선택하세요.`}
              </Text>
              <FloatingIconButton label="이동 취소" icon="close" accessibilityLabel="재료 이동 취소" size="small"
                disabled={isMoveLocked} onPress={cancelIngredientMove} />
            </View>
          </View>
        </SafeAreaView>
      ) : null}
      {moveNotice ? (
        <SafeAreaView pointerEvents="none" edges={{ top: false, bottom: true, left: true, right: true }} style={styles.legendOverlay}>
          <View style={styles.noticeAnchor}>
            <View style={styles.moveNotice}>
              <MaterialDesignIcons name="check-circle-outline" size={20} color={colors.buttonText} accessible={false} />
              <Text style={styles.noticeLabel} accessibilityRole="alert" accessibilityLiveRegion="polite">{moveNotice.message}</Text>
            </View>
          </View>
        </SafeAreaView>
      ) : null}
      {isLegendOpen ? <FridgeIngredientLegend onClose={() => setIsLegendOpen(false)} /> : null}
      {isIngredientListOpen && focusPhase === 'open' && selectedPosition ? (
        <IngredientListSheet key={selectedPosition.id} position={selectedPosition}
          onSaved={ingredient => setIngredients(current => current.some(item => item.id === ingredient.id)
            ? current.map(item => item.id === ingredient.id ? ingredient : item) : [...current, ingredient])}
          onDeleted={ingredientId => setIngredients(current => current.filter(item => item.id !== ingredientId))}
          onMove={ingredient => {
            if (moveRequest.current) return;
            setMoveNotice(null);
            closeIngredientList();
            changeIngredientMove({ ingredient, phase: 'selecting' });
          }}
          onClose={closeIngredientList} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  headerIconButton: {
    width: FRIDGE_HEADER_BUTTON_SIZE,
    height: FRIDGE_HEADER_BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  legendOverlay: { ...StyleSheet.absoluteFill, zIndex: 30 },
  legendAnchor: { flex: 1, alignItems: 'flex-end', justifyContent: 'flex-end', paddingRight: spacing.lg, paddingBottom: spacing.sm },
  moveAnchor: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  moveBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  moveLabel: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 22 },
  noticeAnchor: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingBottom: spacing.lg * 3 },
  moveNotice: { maxWidth: '100%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 24, backgroundColor: colors.button },
  noticeLabel: { flexShrink: 1, color: colors.buttonText, fontSize: 15, lineHeight: 22 },
  diagram: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
});
