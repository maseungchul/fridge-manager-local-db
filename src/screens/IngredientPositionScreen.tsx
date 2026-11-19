/**
 * @file
 * 구매 완료 품목 등록과 소비 완료 재료 복구에 사용할 칸을 공통 냉장고 도면에서 선택한다.
 * 선택한 위치에 저장을 확정하기 전까지 구매·소비 기록을 유지한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Alert, Animated, BackHandler, StyleSheet, Text, View, useAnimatedValue } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useToast } from '@/components/ToastProvider';
import { getConsumedIngredient, getIngredients, restoreConsumedIngredient } from '@/db/ingredientRepository';
import { getRefrigerator } from '@/db/refrigeratorRepository';
import { preparePurchasedIngredientRegistrations, registerPurchasedIngredients } from '@/db/shoppingRepository';
import { FridgeFocusView, FridgeInteriorMap, useFridgeFocus } from '@/features/fridge/components/FridgeInteriorMap';
import type { FridgeFocusPhase } from '@/features/fridge/components/FridgeInteriorMap';
import { getDraftLayout, getPositionName } from '@/features/fridge/model/fridgeLayout';
import type { Refrigerator } from '@/features/fridge/model/fridgeLayout';
import type { ConsumedIngredient, Ingredient } from '@/features/ingredient/model/ingredient';
import { useTranslation } from '@/i18n/LanguageProvider';
import { AppError, getErrorMessage } from '@/i18n/errors';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { HEADER_CONTENT_HEIGHT, COMPACT_HEADER_ICON_SIZE, getCompactHeaderStyles } from '@/theme/headerStyles';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

type IngredientPositionScreenProps = NativeStackScreenProps<RootStackParamList, 'IngredientRestore' | 'ShoppingIngredientRegistration'>;
type PositionResult = { refrigerator: Refrigerator | null; record: ConsumedIngredient | null; ingredients: Ingredient[] } | { error: unknown };

export function IngredientPositionScreen({ navigation, route }: IngredientPositionScreenProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const showToast = useToast();
  const db = useSQLiteContext();
  const params = route.params;
  const purchasedItems = 'items' in params ? params.items : null;
  const [result, setResult] = useState<PositionResult | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ index: number; positionId?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const leaving = useRef(false);
  const closedScrollY = useRef(0);
  const loadRequest = useRef(0);
  const isFocusBlocked = useCallback(() => saving.current, []);
  const { selectedAreaId, setSelectedAreaId, setFocusTarget, focusPhase, focusBounds, focusViewport, activeFocus,
    hasSeenScrollHint, markScrollHintSeen, finishFocusTransition, resetFocus,
    layoutFocusViewport, openFocusedArea, closeFocusedArea, diagramSizes } = useFridgeFocus(0, isFocusBlocked);
  const finishPositionFocus = useCallback((phase: FridgeFocusPhase) => {
    finishFocusTransition(phase);
    if (phase === 'closed') setSelectedSlot(null);
  }, [finishFocusTransition]);

  const loadPosition = useCallback(async () => {
    const request = ++loadRequest.current;
    setResult(null);
    resetFocus();
    setSelectedSlot(null);
    closedScrollY.current = 0;
    try {
      const record = 'id' in params ? await getConsumedIngredient(db, params) : null;
      if ('id' in params && !record) throw new AppError('errors.consumedIngredientMissing');
      const refrigerator = await getRefrigerator(db);
      const ingredients = refrigerator ? await getIngredients(db) : [];
      if (request === loadRequest.current) setResult({ refrigerator, record, ingredients });
    } catch (error) {
      if (request === loadRequest.current) setResult({ error });
    }
  }, [db, params, resetFocus]);
  useFocusEffect(useCallback(() => {
    void loadPosition();
    return () => { loadRequest.current++; };
  }, [loadPosition]));

  usePreventRemove(isSaving, ({ data }) => {
    if (leaving.current) navigation.dispatch(data.action);
  });
  useEffect(() => {
    if (!activeFocus) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!saving.current) closeFocusedArea();
      return true;
    });
    return () => subscription.remove();
  }, [activeFocus, closeFocusedArea]);

  const loaded = result && !('error' in result) ? result : null;
  const layout = loaded?.refrigerator ? getDraftLayout(loaded.refrigerator, [], t) : null;
  const position = layout?.positions.find(candidate => candidate.id === selectedSlot?.positionId && candidate.areaId === selectedAreaId);
  const area = layout?.areas.find(candidate => candidate.id === position?.areaId);
  const canConfirm = !!position && focusPhase === 'open' && purchasedItems?.length !== 0;
  const showRegisterHighlight = !!purchasedItems && canConfirm;
  const registerOpacity = useAnimatedValue(1);

  useEffect(() => {
    if (!showRegisterHighlight) return;

    // 등록이 가능해진 순간에만 강조해 칸을 바꿀 때 효과가 반복되지 않게 한다.
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(registerOpacity, { toValue: 0.4, duration: 800, useNativeDriver: true, isInteraction: false }),
      Animated.timing(registerOpacity, { toValue: 1, duration: 800, useNativeDriver: true, isInteraction: false }),
    ]), { iterations: 3 });
    animation.start();
    return () => {
      animation.stop();
      registerOpacity.setValue(1);
    };
  }, [registerOpacity, showRegisterHighlight]);

  function goBack() {
    if (!saving.current) navigation.goBack();
  }

  async function confirmPosition() {
    if (!position || saving.current || focusPhase !== 'open' || (!purchasedItems?.length && !loaded?.record)) return;
    saving.current = true;
    setIsSaving(true);
    const destination: Pick<Ingredient, 'slotId' | 'drawerNumber'> = { slotId: position.slotId, drawerNumber: position.drawerNumber ?? 0 };
    try {
      if (purchasedItems) {
        await registerPurchasedIngredients(db, preparePurchasedIngredientRegistrations(purchasedItems), destination);
      } else if (loaded?.record) {
        await restoreConsumedIngredient(db, loaded.record, destination);
      }
    } catch (error) {
      saving.current = false;
      setIsSaving(false);
      Alert.alert(t('common.error'), getErrorMessage(error, t, t(purchasedItems ? 'ingredient.saveError' : 'consumed.restoreError')),
        [{ text: t('common.ok') }]);
      return;
    }
    if (purchasedItems) {
      leaving.current = true;
      navigation.goBack();
      showToast(t('shopping.importRegistered', { count: purchasedItems.length }));
      return;
    }
    Alert.alert(t('common.info'), t('consumed.restored'), [{ text: t('common.ok'), onPress: () => {
      if (leaving.current) return;
      leaving.current = true;
      navigation.goBack();
    } }], { cancelable: false });
  }

  function updateClosedScroll(y: number) {
    const shift = closedScrollY.current - y;
    closedScrollY.current = y;
    if (activeFocus && shift !== 0) setFocusTarget(current => current
      ? { ...current, canvas: { ...current.canvas, y: current.canvas.y + shift } } : current);
  }

  return (
    <SafeAreaView style={styles.container} onAccessibilityEscape={goBack}>
      <View style={styles.header}>
        <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t(purchasedItems ? 'shopping.backToPurchased' : 'consumed.back')}
          disabled={isSaving} accessibilityState={{ disabled: isSaving }} onPress={goBack} style={styles.backButton}>
          <MaterialDesignIcons name="arrow-left" size={COMPACT_HEADER_ICON_SIZE} color={colors.text} accessible={false} />
        </FeedbackPressable>
        <Text accessibilityRole="header" style={[styles.title, purchasedItems && styles.centeredTitle]}>
          {t(purchasedItems ? 'shopping.selectPosition' : 'consumed.selectPosition')}
        </Text>
        {purchasedItems ? (
          <Animated.View style={[styles.registerAction, { opacity: canConfirm && !isSaving ? registerOpacity : 1 }]}>
            <FeedbackPressable iconFeedback accessibilityRole="button"
              accessibilityLabel={t('shopping.registerHere', { count: purchasedItems.length })}
              disabled={!canConfirm || isSaving} accessibilityState={{ disabled: !canConfirm || isSaving, busy: isSaving }}
              onPress={confirmPosition} style={styles.registerButton}>
              {isSaving ? <ActivityIndicator color={colors.text} accessibilityLabel={t('ingredient.registering')} /> :
                <MaterialDesignIcons name="checkbox-marked-circle-plus-outline" size={COMPACT_HEADER_ICON_SIZE} color={colors.text} accessible={false} />}
            </FeedbackPressable>
          </Animated.View>
        ) : null}
      </View>
      {!result ? <View style={styles.feedback}><ActivityIndicator color={colors.text} accessibilityLabel={t('home.loading')} /></View>
        : 'error' in result ? <View style={styles.feedback}>
          <Text accessibilityRole="alert" style={styles.error}>{getErrorMessage(result.error, t, t(purchasedItems ? 'home.loadError' : 'consumed.loadError'))}</Text>
          <PrimaryButton label={t('common.retry')} variant="secondary" onPress={loadPosition} style={styles.retry} />
        </View> : !result.refrigerator ? <View style={styles.feedback}>
          <Text style={styles.emptyTitle}>{t(purchasedItems ? 'home.emptyTitle' : 'consumed.noFridge')}</Text>
          <Text style={styles.description}>{t(purchasedItems ? 'shopping.noFridgeDescription' : 'consumed.noFridgeDescription')}</Text>
        </View> : <>
          <Text style={styles.guide}>{result.record
            ? t('consumed.selectDescription', { name: result.record.name })
            : t('shopping.selectPositionGuide', { count: purchasedItems?.length ?? 0 })}</Text>
          <View style={styles.scene} pointerEvents={isSaving ? 'none' : 'auto'} accessibilityElementsHidden={isSaving}
            importantForAccessibility={isSaving ? 'no-hide-descendants' : 'auto'}>
            <View style={styles.scene} pointerEvents={activeFocus ? 'none' : 'auto'} accessibilityElementsHidden={!!activeFocus}
              importantForAccessibility={activeFocus ? 'no-hide-descendants' : 'auto'}>
              <FridgeInteriorMap draft={result.refrigerator} ingredients={result.ingredients} selectedAreaId={selectedAreaId ?? undefined}
                onSelectArea={setSelectedAreaId} focus={activeFocus} onFocus={openFocusedArea} fitHeight layoutSize={diagramSizes.closed}
                scrollVertically onCanvasOffsetChange={updateClosedScroll} />
            </View>
            <View ref={focusViewport} collapsable={false} pointerEvents="box-none" style={StyleSheet.absoluteFill} onLayout={layoutFocusViewport}>
              {activeFocus && focusBounds ? <FridgeFocusView draft={result.refrigerator} ingredients={result.ingredients}
                target={activeFocus} viewport={focusBounds} phase={focusPhase} sizeViewport={diagramSizes.opened} flushVerticalEdges
                selectedAreaId={selectedAreaId ?? undefined} selectedSlotIndex={selectedSlot?.index} selectedPositionId={selectedSlot?.positionId}
                scrollHintEnabled={!hasSeenScrollHint} onScrollHintSeen={markScrollHintSeen}
                onPhaseChange={finishPositionFocus} onClose={closeFocusedArea}
                onSelectSlot={(areaId, index, positionId) => {
                  if (focusPhase !== 'open' || saving.current) return;
                  setSelectedAreaId(areaId);
                  setSelectedSlot({ index, positionId });
                }} /> : null}
            </View>
          </View>
          {!purchasedItems ? (
            <View style={styles.footer}>
              {position && area ? (
                <Text style={styles.description}>{`${area.compartment} · ${area.name} · ${getPositionName(position, t)}`}</Text>
              ) : null}
              <PrimaryButton label={t('consumed.restoreHere')} icon="restore" disabled={!canConfirm} loading={isSaving} onPress={confirmPosition} />
            </View>
          ) : null}
        </>}
    </SafeAreaView>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  ...getCompactHeaderStyles(mode),
  header: { ...getCompactHeaderStyles(mode).header, gap: 0 },
  title: { ...getCompactHeaderStyles(mode).title, flexShrink: 1 },
  centeredTitle: { flex: 1, textAlign: 'center' },
  backButton: { width: HEADER_CONTENT_HEIGHT, height: HEADER_CONTENT_HEIGHT, marginLeft: -spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  registerAction: { marginRight: -spacing.sm },
  registerButton: { width: HEADER_CONTENT_HEIGHT, height: HEADER_CONTENT_HEIGHT,
    alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  scene: { flex: 1, minHeight: 0, overflow: 'hidden' },
  guide: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  footer: { padding: spacing.md, gap: spacing.sm },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  feedback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  error: { color: colors.error, fontSize: 16, textAlign: 'center' },
  retry: { alignSelf: 'stretch' },
}));
