/**
 * @file
 * 원래 위치를 잃은 소비 완료 재료의 복구 목적지를 공통 냉장고 도면에서 선택한다.
 * 복구를 확정하기 전까지 완료 기록을 유지하고, 취소·조회·저장 실패로 재료를 변경하지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Alert, BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getConsumedIngredient, getIngredients, restoreConsumedIngredient } from '@/db/ingredientRepository';
import { getRefrigerator } from '@/db/refrigeratorRepository';
import { FridgeFocusView, FridgeInteriorMap, useFridgeFocus } from '@/features/fridge/components/FridgeInteriorMap';
import type { FridgeFocusPhase } from '@/features/fridge/components/FridgeInteriorMap';
import { getDraftLayout, getPositionName } from '@/features/fridge/model/fridgeLayout';
import type { Refrigerator } from '@/features/fridge/model/fridgeLayout';
import type { ConsumedIngredient, Ingredient } from '@/features/ingredient/model/ingredient';
import { useTranslation } from '@/i18n/LanguageProvider';
import { AppError, getErrorMessage } from '@/i18n/errors';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { HEADER_CONTENT_HEIGHT, HEADER_ICON_SIZE, getHeaderStyles } from '@/theme/headerStyles';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

type IngredientRestoreScreenProps = NativeStackScreenProps<RootStackParamList, 'IngredientRestore'>;
type RestoreResult = { refrigerator: Refrigerator | null; record: ConsumedIngredient; ingredients: Ingredient[] } | { error: unknown };

export function IngredientRestoreScreen({ navigation, route }: IngredientRestoreScreenProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const { id, consumedAt } = route.params;
  const [result, setResult] = useState<RestoreResult | null>(null);
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
  const finishRestoreFocus = useCallback((phase: FridgeFocusPhase) => {
    finishFocusTransition(phase);
    if (phase === 'closed') setSelectedSlot(null);
  }, [finishFocusTransition]);

  const loadRestore = useCallback(async () => {
    const request = ++loadRequest.current;
    setResult(null);
    resetFocus();
    setSelectedSlot(null);
    closedScrollY.current = 0;
    try {
      const record = await getConsumedIngredient(db, { id, consumedAt });
      if (!record) throw new AppError('errors.consumedIngredientMissing');
      const refrigerator = await getRefrigerator(db);
      const ingredients = refrigerator ? await getIngredients(db) : [];
      if (request === loadRequest.current) setResult({ refrigerator, record, ingredients });
    } catch (error) {
      if (request === loadRequest.current) setResult({ error });
    }
  }, [db, id, consumedAt, resetFocus]);
  useFocusEffect(useCallback(() => {
    void loadRestore();
    return () => { loadRequest.current++; };
  }, [loadRestore]));

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

  function goBack() {
    if (!saving.current) navigation.goBack();
  }

  async function restore() {
    if (!loaded || !position || saving.current || focusPhase !== 'open') return;
    saving.current = true;
    setIsSaving(true);
    try {
      await restoreConsumedIngredient(db, loaded.record, { slotId: position.slotId, drawerNumber: position.drawerNumber ?? 0 });
    } catch (error) {
      saving.current = false;
      setIsSaving(false);
      Alert.alert(t('common.error'), getErrorMessage(error, t, t('consumed.restoreError')), [{ text: t('common.ok') }]);
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
        <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('consumed.back')}
          disabled={isSaving} accessibilityState={{ disabled: isSaving }} onPress={goBack} style={styles.backButton}>
          <MaterialDesignIcons name="arrow-left" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
        </FeedbackPressable>
        <Text accessibilityRole="header" style={styles.title}>{t('consumed.selectPosition')}</Text>
      </View>
      {!result ? <View style={styles.feedback}><ActivityIndicator color={colors.text} accessibilityLabel={t('home.loading')} /></View>
        : 'error' in result ? <View style={styles.feedback}>
          <Text accessibilityRole="alert" style={styles.error}>{getErrorMessage(result.error, t, t('consumed.loadError'))}</Text>
          <PrimaryButton label={t('common.retry')} variant="secondary" onPress={loadRestore} style={styles.retry} />
        </View> : !result.refrigerator ? <View style={styles.feedback}>
          <Text style={styles.emptyTitle}>{t('consumed.noFridge')}</Text>
          <Text style={styles.description}>{t('consumed.noFridgeDescription')}</Text>
        </View> : <>
          <Text style={styles.guide}>{t('consumed.selectDescription', { name: result.record.name })}</Text>
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
                onPhaseChange={finishRestoreFocus} onClose={closeFocusedArea}
                onSelectSlot={(areaId, index, positionId) => {
                  if (focusPhase !== 'open' || saving.current) return;
                  setSelectedAreaId(areaId);
                  setSelectedSlot({ index, positionId });
                }} /> : null}
            </View>
          </View>
          <View style={styles.footer}>
            {position && area ? <Text style={styles.description}>{`${area.compartment} · ${area.name} · ${getPositionName(position, t)}`}</Text> : null}
            <PrimaryButton label={t('consumed.restoreHere')} icon="restore" disabled={!position || focusPhase !== 'open'} loading={isSaving} onPress={restore} />
          </View>
        </>}
    </SafeAreaView>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  ...getHeaderStyles(mode),
  title: { ...getHeaderStyles(mode).title, flexShrink: 1 },
  backButton: { width: HEADER_CONTENT_HEIGHT, height: HEADER_CONTENT_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  scene: { flex: 1, minHeight: 0, overflow: 'hidden' },
  guide: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  footer: { padding: spacing.md, gap: spacing.sm },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  feedback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  error: { color: colors.error, fontSize: 16, textAlign: 'center' },
  retry: { alignSelf: 'stretch' },
}));
