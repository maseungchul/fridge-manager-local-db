/**
 * @file
 * 저장된 냉장고를 공통 도면으로 표시하며, 홈에서는 영역 대신 개별 수납 칸을 선택한다.
 * 선택한 칸은 재료 목록 패널로 연결하고, 미등록 상태에서는 안내·등록 버튼을 표시한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeBottomTabScreenProps } from '@react-navigation/bottom-tabs/unstable';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { ActivityIndicator, AppState, BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { colors, fridgeDoorColors, spacing } from '@/theme/tokens';
import { SafeAreaView } from 'react-native-screens/experimental';
import { PrimaryButton } from '@/components/PrimaryButton';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { FloatingIconButton } from '@/components/FloatingIconButton';
import { getRefrigerator } from '@/db/refrigeratorRepository';
import { getIngredients } from '@/db/ingredientRepository';
import { FridgeStructurePreview } from '@/features/fridge/components/FridgeStructurePreview';
import { FridgeIngredientLegend } from '@/features/fridge/components/FridgeIngredientLegend';
import { FridgeFocusView, FridgeInteriorMap, useFridgeFocus } from '@/features/fridge/components/FridgeInteriorMap';
import type { FridgeFocusPhase } from '@/features/fridge/components/FridgeInteriorMap';
import { getDraftLayout } from '@/features/fridge/model/fridgeLayout';
import type { Refrigerator } from '@/features/fridge/model/fridgeLayout';
import { IngredientListSheet } from '@/features/ingredient/components/IngredientListSheet';
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import type { MainTabParamList } from '@/navigation/MainTabNavigator';
import { FRIDGE_HEADER_BUTTON_SIZE } from '@/features/fridge/components/fridgeDiagramLayout';

type HomeScreenProps = CompositeScreenProps<
  NativeBottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
> & { onIngredientListVisibilityChange?: (visible: boolean) => void };

const EMPTY_PREVIEW_ROWS = [{ id: 'top', doorCount: 1 }, { id: 'bottom', doorCount: 1 }];

export function HomeScreen({ navigation, onIngredientListVisibilityChange }: HomeScreenProps) {
  const db = useSQLiteContext();
  const [refrigerator, setRefrigerator] = useState<Refrigerator | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ index: number; positionId?: string } | null>(null);
  const [isIngredientListOpen, setIsIngredientListOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [badgeDate, setBadgeDate] = useState(() => new Date());
  const loadRequest = useRef(0);
  const {
    selectedAreaId, setSelectedAreaId, focusPhase, focusBounds, focusViewport, activeFocus,
    hasSeenScrollHint, markScrollHintSeen, finishFocusTransition, resetFocus,
    layoutFocusViewport, openFocusedArea, closeFocusedArea, diagramSizes,
  } = useFridgeFocus();
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
  }, [db, resetFocus]);

  useFocusEffect(useCallback(() => {
    void loadRefrigerator();
    return () => { loadRequest.current++; resetFocus(); setSelectedSlot(null); setIsIngredientListOpen(false); setIsLegendOpen(false); };
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

  // 시스템 시트의 배경이 닫기를 처리하지 않으므로 하단 탭 선택도 함께 막는다.
  useEffect(() => {
    onIngredientListVisibilityChange?.(isIngredientListOpen);
    return () => onIngredientListVisibilityChange?.(false);
  }, [isIngredientListOpen, onIngredientListVisibilityChange]);

  useEffect(() => {
    if (!activeFocus) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isLegendOpen) setIsLegendOpen(false);
      else if (isIngredientListOpen) closeIngredientList();
      else closeFocusedArea();
      return true;
    });
    return () => subscription.remove();
  }, [activeFocus, closeFocusedArea, closeIngredientList, isIngredientListOpen, isLegendOpen]);

  const layout = refrigerator ? getDraftLayout(refrigerator) : null;
  const selectedPosition = layout?.positions.find(position => position.id === selectedSlot?.positionId
    && position.areaId === selectedAreaId);
  const legendButton = refrigerator && !isLoading && !error && !isIngredientListOpen ? (
    <FloatingIconButton label="범례" icon="information-outline" accessibilityLabel="재료 배지 범례" size="small"
      accessibilityHint="재료 배지의 색상과 의미를 확인합니다." expanded={isLegendOpen}
      disabled={focusPhase === 'opening' || focusPhase === 'closing'}
      onPress={() => setIsLegendOpen(true)} />
  ) : null;

  return (
    <View style={styles.container}>
      <SafeAreaView style={[styles.container, (isLoading || error !== null) && styles.feedback]}
        edges={{ top: true, bottom: true, left: true, right: true }}
        pointerEvents={activeFocus || isLegendOpen ? 'none' : 'auto'} accessibilityElementsHidden={!!activeFocus || isLegendOpen}
        importantForAccessibility={activeFocus || isLegendOpen ? 'no-hide-descendants' : 'auto'}>
        {isLoading ? <ActivityIndicator color={colors.text} accessibilityLabel="냉장고 정보 불러오는 중" />
          : error ? <>
            <Text accessibilityRole="alert">{error}</Text>
            <PrimaryButton label="다시 불러오기" onPress={loadRefrigerator} />
          </> : refrigerator ? <>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>{refrigerator.name}</Text>
              <FeedbackPressable accessibilityRole="button" accessibilityLabel="냉장고 편집" style={styles.headerIconButton}
                onPress={() => navigation.navigate('RefrigeratorRegistration', { refrigeratorId: refrigerator.id })}>
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
      <View ref={focusViewport} collapsable={false} pointerEvents={isIngredientListOpen || isLegendOpen ? 'none' : 'box-none'}
        accessibilityElementsHidden={isIngredientListOpen || isLegendOpen} importantForAccessibility={isIngredientListOpen || isLegendOpen ? 'no-hide-descendants' : 'auto'}
        style={StyleSheet.absoluteFill} onLayout={layoutFocusViewport}>
        {refrigerator && activeFocus && focusBounds ? (
          <FridgeFocusView draft={refrigerator} ingredients={ingredients} now={badgeDate} target={activeFocus} viewport={focusBounds} phase={focusPhase}
            sizeViewport={diagramSizes.opened}
            selectedAreaId={selectedAreaId ?? undefined} scrollHintEnabled={!hasSeenScrollHint}
            selectedSlotIndex={selectedSlot?.index}
            selectedPositionId={selectedSlot?.positionId}
            scrollHintBlocked={isIngredientListOpen || isLegendOpen}
            onSelectSlot={(areaId, index, positionId) => {
              if (focusPhase !== 'open') return;
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
      {isLegendOpen ? <FridgeIngredientLegend onClose={() => setIsLegendOpen(false)} /> : null}
      {isIngredientListOpen && focusPhase === 'open' && selectedPosition ? (
        <IngredientListSheet key={selectedPosition.id} position={selectedPosition}
          onRegistered={ingredient => setIngredients(current => [...current, ingredient])}
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
  diagram: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
});
