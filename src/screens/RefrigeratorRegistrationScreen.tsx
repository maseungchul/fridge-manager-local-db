/**
 * @file
 * 냉장고 등록·편집을 기본 정보·구조 선택과 내부 설정의 두 단계로 나눈다.
 * 단별 문 개수로 배치를 만들고 문 수납·본체 연결·내부 칸 설정을 제공한다.
 * 여는 방식·보관 모드·칸·본체 연결을 하단 카테고리에서 편집하고 초안에 즉시 반영한다.
 * 단계 이동·등록은 상단 헤더에, 편집 툴바는 화면 하단에 고정한다.
 * 편집은 저장된 구성을 불러오며, 전체 저장 실패 시 입력을 유지하고 성공 안내를 표시하고 홈으로 돌아간다.
 * 편집 화면의 이름 변경은 구조 초안을 유지한 채 별도로 저장한다.
 * 재료의 보관 위치를 없애거나 숨기는 변경은 초안에 반영하기 전에 안내한다.
 * 내부 설정의 홈 아이콘은 상단 뒤로가기 오른쪽에 배치하고 저장하지 않은 초안을 종료한다.
 */
import { usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { ActivityIndicator, Alert, Animated, Keyboard, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/ToastProvider';
import { PrimaryButton } from '@/components/PrimaryButton';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { FormTextInput } from '@/components/FormTextInput';
import { QuantityStepper, QUANTITY_STEPPER_WIDTH } from '@/components/QuantityStepper';
import { alertTitles } from '@/constants/alertTitles';
import { getIngredients } from '@/db/ingredientRepository';
import { getRefrigerator, registerRefrigerator, updateRefrigerator, updateRefrigeratorName } from '@/db/refrigeratorRepository';
import { FridgeStructurePreview, STRUCTURE_PREVIEW_ASPECT_RATIO } from '@/features/fridge/components/FridgeStructurePreview';
import { FridgeFocusView, FridgeInteriorMap, useFridgeFocus } from '@/features/fridge/components/FridgeInteriorMap';
import type { FridgeFocusTarget } from '@/features/fridge/components/FridgeInteriorMap';
import { FridgeAreaMenu, FRIDGE_MENU_RESERVED_SPACE } from '@/features/fridge/components/FridgeAreaMenu';
import type { FridgeMenuCategory } from '@/features/fridge/components/FridgeAreaMenu';
import { fridgeMessages } from '@/features/fridge/constants/messages';
import {
  addDraftRow, areaNames, changeDraftDoorCount, createRefrigeratorDraft,
  getAdjacentCompartment, getDraftAreaLocation, getDraftLayout, getSlotName, MAX_DOOR_SLOTS, MAX_DOORS_PER_ROW, MAX_ROWS, MAX_SLOTS, mergeDraftCompartments,
  removeDraftRow, setDraftDoorOpening, splitDraftCompartment,
} from '@/features/fridge/model/fridgeLayout';
import type { DoorOpening, RefrigeratorDraft, SlotConfiguration, StorageMode } from '@/features/fridge/model/fridgeLayout';
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { HEADER_ICON_SIZE, getHeaderStyles } from '@/theme/headerStyles';
import { FRIDGE_HEADER_BUTTON_SIZE, FRIDGE_STEP_BADGE_SIZE } from '@/features/fridge/components/fridgeDiagramLayout';
import { useTranslation } from '@/i18n/LanguageProvider';
import { AppError, getErrorMessage } from '@/i18n/errors';

type RefrigeratorRegistrationScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'RefrigeratorRegistration'
>;

type RegistrationStep = 'basic' | 'configuration';

const STRUCTURE_CONTROL_WIDTH = QUANTITY_STEPPER_WIDTH + 8 + 32;
const STRUCTURE_PREVIEW_MAX_WIDTH = 144;

export function RefrigeratorRegistrationScreen({
  navigation,
  route,
}: RefrigeratorRegistrationScreenProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const showToast = useToast();
  const refrigeratorId = route?.params?.refrigeratorId;
  const isEditing = refrigeratorId !== undefined;
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [draft, setDraft] = useState(() => createRefrigeratorDraft(undefined, t));
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [savedName, setSavedName] = useState('');
  const [isLoading, setIsLoading] = useState(isEditing);
  const [loadError, setLoadError] = useState<{ cause: unknown } | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const loadedRefrigeratorId = useRef<string | null>(null);
  const isUnavailable = isLoading || loadError !== null;
  const [step, setStep] = useState<RegistrationStep>('basic');
  const [menuCategory, setMenuCategory] = useState<FridgeMenuCategory | null>(null);
  const [slotIndex, setSlotIndex] = useState(0);
  const [selectedPositionId, setSelectedPositionId] = useState<string | undefined>(undefined);
  const [isStepChanging, setIsStepChanging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [stepWidth, setStepWidth] = useState(windowWidth);
  const structurePreviewWidth = Math.max(1, Math.min(STRUCTURE_PREVIEW_MAX_WIDTH,
    stepWidth - spacing.lg * 2 - STRUCTURE_CONTROL_WIDTH - spacing.xs));
  const [stepHeight, setStepHeight] = useState(0);
  const leaveRequested = useRef(false);
  const saving = useRef(false);
  const stepAnimation = useRef(new Animated.Value(0)).current;
  const stepChanging = useRef(false);
  const stepScrolls = {
    basic: useRef<ComponentRef<typeof ScrollView>>(null),
    configuration: useRef<ComponentRef<typeof ScrollView>>(null),
  };
  const isFocusBlocked = useCallback(() => saving.current || stepChanging.current, []);
  const {
    selectedAreaId, setSelectedAreaId, setFocusTarget, focusPhase, focusBounds, focusViewport,
    activeFocus, isFocusMoving, hasSeenScrollHint, markScrollHintSeen, finishFocusTransition,
    resetFocus, layoutFocusViewport, openFocusedArea: openFocus, closeFocusedArea, diagramSizes,
  } = useFridgeFocus(FRIDGE_MENU_RESERVED_SPACE, isFocusBlocked);
  const selectedRow = draft.rows.find(row => [...row.doors, ...row.compartments].some(area => area.id === selectedAreaId)) ?? draft.rows[0];
  const selectedDoor = selectedRow.doors.find(door => door.id === selectedAreaId && door.kind !== 'DRAWER');
  const selectedBody = selectedRow.compartments.find(body => body.id === selectedAreaId
    || body.doorIds.some(id => id === selectedAreaId)) ?? selectedRow.compartments[0];
  const openingDoors = selectedRow.doors.filter(door => selectedBody.doorIds.includes(door.id));
  const isMergedBody = selectedBody.doorIds.length > 1;
  const isDrawerBody = !selectedDoor && openingDoors.some(door => door.kind === 'DRAWER');
  const canEditSlotStructure = !selectedDoor && !isDrawerBody;
  const selectedArea = selectedDoor ?? selectedBody;
  const maxSlotCount = selectedDoor ? MAX_DOOR_SLOTS : MAX_SLOTS;
  const selectedType = selectedDoor?.side ?? 'BODY';
  const location = getDraftAreaLocation(selectedRow, draft.rows.indexOf(selectedRow), selectedArea.id, t);
  const adjacentBody = getAdjacentCompartment(selectedRow, selectedBody.id);
  const mergeIncludesDrawer = isDrawerBody || selectedRow.doors.some(door => door.kind === 'DRAWER' && adjacentBody?.doorIds.includes(door.id));
  const storageEnabled = !selectedDoor || selectedDoor.storageEnabled;
  const selectedSlotIndex = Math.min(slotIndex, selectedArea.slots.length - 1);
  // 선택 대상에서 사용할 수 없는 하위 설정은 감추고, 해당 대상으로 돌아오면 다시 표시한다.
  const activeMenuCategory = menuCategory === 'mode' && selectedDoor
    || menuCategory === 'opening' && (selectedDoor || isMergedBody)
    || menuCategory === 'slots' && (isDrawerBody || !storageEnabled)
    ? null : menuCategory;
  useEffect(() => () => {
    stepChanging.current = false;
    stepAnimation.stopAnimation();
  }, [stepAnimation]);

  // 불러온 구성은 편집 초안으로 복사하고, 화면을 떠난 뒤 끝난 조회는 반영하지 않는다.
  useEffect(() => {
    if (refrigeratorId === undefined) return;
    let mounted = true;
    loadedRefrigeratorId.current = null;
    Promise.all([getRefrigerator(db), getIngredients(db)]).then(([refrigerator, storedIngredients]) => {
      if (!mounted) return;
      if (!refrigerator || refrigerator.id !== refrigeratorId) throw new AppError('errors.fridgeMissing');
      setDraft(createRefrigeratorDraft(refrigerator));
      setIngredients(storedIngredients);
      setSavedName(refrigerator.name);
      loadedRefrigeratorId.current = refrigerator.id;
    }).catch(error => {
      if (mounted) setLoadError({ cause: error });
    }).finally(() => {
      if (mounted) setIsLoading(false);
    });
    return () => { mounted = false; };
  }, [db, refrigeratorId, loadAttempt]);

  // 기기 뒤로가기는 하위 설정·중앙 보기·이전 단계 순서로 닫는다.
  usePreventRemove(step === 'configuration' || isStepChanging || isSaving, ({ data }) => {
    if (leaveRequested.current) {
      leaveRequested.current = false;
      navigation.dispatch(data.action);
    } else if (saving.current || stepChanging.current || isFocusMoving) {
      return;
    } else if (activeMenuCategory) {
      setMenuCategory(null);
    } else if (activeFocus) {
      closeFocusedArea();
    } else {
      changeStep('basic');
    }
  });

  function cancelRegistration() {
    if (saving.current || stepChanging.current || isFocusMoving) return;
    Keyboard.dismiss();
    stepChanging.current = false;
    stepAnimation.stopAnimation();
    stepAnimation.setValue(step === 'basic' ? 0 : 1);
    setIsStepChanging(false);
    leaveRequested.current = true;
    navigation.goBack();
  }

  // 전체 저장과 같은 잠금을 사용하되, 이름만 저장하고 구조 초안과 현재 화면을 유지한다.
  async function saveRefrigeratorName() {
    if (saving.current || stepChanging.current || isUnavailable || refrigeratorId === undefined
      || loadedRefrigeratorId.current !== refrigeratorId || !draft.name.trim() || draft.name.trim() === savedName) return;
    Keyboard.dismiss();
    saving.current = true;
    setIsSaving(true);
    try {
      const name = await updateRefrigeratorName(db, refrigeratorId, draft.name);
      setDraft(current => ({ ...current, name }));
      setSavedName(name);
      showToast(t(fridgeMessages.nameChangeSuccess));
    } catch (error) {
      Alert.alert(t(alertTitles.error),
        getErrorMessage(error, t, t(fridgeMessages.nameChangeFailure)), [{ text: t('common.ok') }]);
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  // 상태가 다시 렌더링되기 전의 연속 탭도 막고, 실패한 초안은 그대로 재시도한다.
  async function saveRegistration() {
    if (saving.current || stepChanging.current || isFocusMoving || isUnavailable
      || isEditing && loadedRefrigeratorId.current !== refrigeratorId) return;
    Keyboard.dismiss();
    saving.current = true;
    setIsSaving(true);
    try {
      if (refrigeratorId !== undefined) await updateRefrigerator(db, refrigeratorId, draft);
      else await registerRefrigerator(db, draft);
    } catch (error) {
      saving.current = false;
      setIsSaving(false);
      Alert.alert(t(alertTitles.error),
        getErrorMessage(error, t, t(fridgeMessages.saveFailure)), [{ text: t('common.ok') }]);
      return;
    }
    leaveRequested.current = true;
    navigation.goBack();
    showToast(t(isEditing ? fridgeMessages.updateSuccess : fridgeMessages.registrationSuccess));
  }

  // 두 단계의 초안을 공유하며, 들어올 단계의 스크롤만 초기화하고 본문을 좌우로 이동한다.
  function changeStep(nextStep: RegistrationStep) {
    if (saving.current || stepChanging.current || isUnavailable || nextStep === step) return;
    Keyboard.dismiss();
    setMenuCategory(null);
    setSlotIndex(0);
    setSelectedPositionId(undefined);
    resetFocus();
    stepScrolls[nextStep].current?.scrollTo({ y: 0, animated: false });
    stepChanging.current = true;
    setIsStepChanging(true);
    Animated.timing(stepAnimation, {
      toValue: nextStep === 'basic' ? 0 : 1,
      duration: 240,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!stepChanging.current) return;
      if (finished) setStep(nextStep);
      else stepAnimation.setValue(step === 'basic' ? 0 : 1);
      stepChanging.current = false;
      setIsStepChanging(false);
    });
  }

  function selectArea(id: string) {
    if (saving.current) return;
    Keyboard.dismiss();
    if (id !== selectedAreaId) {
      setSlotIndex(0);
      setSelectedPositionId(undefined);
    }
    setSelectedAreaId(id);
  }

  function openFocusedArea(target: FridgeFocusTarget) {
    if (saving.current || activeFocus || stepChanging.current) return;
    openFocus(target);
    setSlotIndex(0);
    setSelectedPositionId(undefined);
  }

  // 홈과 같은 위치 계산으로 재료가 사라지는 변경만 막고, 거부 시 기존 초안과 선택을 유지한다.
  function updateStructure(nextDraft: RefrigeratorDraft) {
    if (saving.current || isUnavailable) return false;
    if (getDraftLayout(nextDraft, ingredients).ingredients.length !== ingredients.length) {
      Alert.alert(t(alertTitles.info), t(fridgeMessages.ingredientLocationChangeBlocked), [{ text: t('common.ok') }]);
      return false;
    }
    setDraft(nextDraft);
    return true;
  }

  // 문 수납을 꺼도 문 식별자·방향·칸 입력은 유지해 다시 켤 수 있다.
  function updateDoorStorage(storageEnabled: boolean) {
    if (saving.current || !selectedDoor) return;
    Keyboard.dismiss();
    updateStructure({ ...draft, rows: draft.rows.map(row => row.id !== selectedRow.id ? row : {
      ...row, doors: row.doors.map(door => door.id === selectedDoor.id ? { ...door, storageEnabled } : door),
    }) });
  }

  // 선택한 본체를 유지하되, 서랍형으로 초기화하면 편집 칸 선택도 처음으로 돌린다.
  function selectDoorOpening(doorId: string, opening: DoorOpening) {
    if (saving.current || isMergedBody) return;
    Keyboard.dismiss();
    if (!updateStructure(setDraftDoorOpening(draft, selectedRow.id, doorId, opening))) return;
    if (opening === 'DRAWER') {
      setSlotIndex(0);
      setSelectedPositionId(undefined);
    }
  }

  function updateSlots(update: (slots: SlotConfiguration[]) => SlotConfiguration[]) {
    if (saving.current || !storageEnabled || isDrawerBody) return false;
    return updateStructure({ ...draft, rows: draft.rows.map(row => row.id !== selectedRow.id ? row : {
      ...row,
      doors: row.doors.map(door => door.id === selectedArea.id ? { ...door, slots: update(door.slots) } : door),
      compartments: row.compartments.map(body => body.id === selectedArea.id ? { ...body, slots: update(body.slots) } : body),
    }) });
  }

  // 마지막 칸부터 추가·제거해 남은 칸과 다른 문·본체의 입력을 유지한다.
  function changeSlotCount(delta: -1 | 1) {
    Keyboard.dismiss();
    if (!updateSlots(slots => {
      const nextCount = slots.length + delta;
      if (nextCount < 1 || nextCount > maxSlotCount) return slots;
      return delta === 1 ? [...slots, { name: getSlotName(nextCount - 1), drawerCount: 0 }] : slots.slice(0, -1);
    })) return;
    if (delta === -1) setSlotIndex(index => Math.max(0, Math.min(index, selectedArea.slots.length - 2)));
    if (delta === -1 && slotIndex >= selectedArea.slots.length - 1) setSelectedPositionId(undefined);
  }

  function updateSlot(index: number, changes: Partial<SlotConfiguration>) {
    if (saving.current || selectedDoor && changes.drawerCount !== undefined) return;
    if (!updateSlots(slots => slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...changes } : slot))) return;
    if (changes.drawerCount !== undefined && changes.drawerCount !== selectedArea.slots[index]?.drawerCount) {
      setSelectedPositionId(undefined);
    }
  }

  // 보관 모드는 본체를 선택한 경우에만 기록한다.
  function selectStorageMode(storageMode: StorageMode) {
    if (saving.current || selectedDoor) return;
    Keyboard.dismiss();
    setDraft(current => ({ ...current, rows: current.rows.map(row => row.id !== selectedRow.id ? row : {
      ...row, compartments: row.compartments.map(body => body.id === selectedBody.id ? { ...body, storageMode } : body),
    }) }));
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      {/* 상단 아이콘은 왼쪽 이전 이동·홈, 오른쪽 다음 이동·등록으로 고정한다. */}
      <View style={[styles.header, activeFocus && styles.focusHeader]}>
        {/* 큰 도면이 헤더에 닿아도 제목·여백은 바깥 닫기로 처리하고 기존 버튼은 위에 유지한다. */}
        {activeFocus ? <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button"
          accessibilityLabel={t('fridge.closeByTitle')} onPress={closeFocusedArea}
          disabled={isSaving || focusPhase !== 'open'} accessibilityState={{ disabled: isSaving || focusPhase !== 'open' }}
          pointerEvents={!isSaving && focusPhase === 'open' ? 'auto' : 'none'} accessibilityElementsHidden={isSaving || focusPhase !== 'open'}
          importantForAccessibility={!isSaving && focusPhase === 'open' ? 'auto' : 'no-hide-descendants'} /> : null}
        <View style={[styles.headerNavigation, step === 'configuration' && styles.headerHomeNavigation]}>
          <FeedbackPressable tooltip accessibilityRole="button"
            accessibilityLabel={step === 'basic' ? (isEditing ? t('fridge.cancelEdit') : t('fridge.cancelRegistration')) : t('fridge.backToBasic')}
            accessibilityState={{ disabled: isSaving || isStepChanging || isFocusMoving }} style={styles.headerIconButton}
            disabled={isSaving || isStepChanging || isFocusMoving}
            onPress={step === 'basic' ? cancelRegistration : () => changeStep('basic')}>
            <MaterialDesignIcons name={step === 'basic' && isEditing ? 'close' : 'arrow-left'} size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
          </FeedbackPressable>
          {step === 'configuration' ? (
            <FeedbackPressable tooltip accessibilityRole="button" accessibilityLabel={t('fridge.goHome')}
              accessibilityHint={t('fridge.goHomeHint')}
              accessibilityState={{ disabled: isSaving || isStepChanging || isFocusMoving }} style={styles.headerIconButton}
              disabled={isSaving || isStepChanging || isFocusMoving} onPress={cancelRegistration}>
              <MaterialDesignIcons name="home-outline" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
            </FeedbackPressable>
          ) : null}
        </View>
        <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
          pointerEvents={activeFocus ? 'none' : 'auto'}
          style={styles.title}>{isEditing ? t('fridge.edit') : t('fridge.register')}</Text>
        <View style={[styles.headerNavigation, step === 'configuration' && styles.headerHomeNavigation, styles.headerNextNavigation]}>
          {step === 'basic' ? (
            <FeedbackPressable tooltip accessibilityRole="button" accessibilityLabel={t('fridge.goConfiguration')}
              accessibilityState={{ disabled: !draft.name.trim() || isSaving || isStepChanging || isUnavailable }} style={styles.headerIconButton}
              disabled={!draft.name.trim() || isSaving || isUnavailable} interactionBlocked={isStepChanging} onPress={() => changeStep('configuration')}>
              <MaterialDesignIcons name="arrow-right" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
            </FeedbackPressable>
          ) : (
            <FeedbackPressable tooltip accessibilityRole="button" accessibilityLabel={isEditing ? t('fridge.saveEdit') : t('fridge.register')}
              accessibilityState={{ disabled: isSaving || isStepChanging || isFocusMoving, busy: isSaving }}
              disabled={isSaving} interactionBlocked={isStepChanging || isFocusMoving} onPress={saveRegistration} style={styles.headerIconButton}>
              {isSaving ? <ActivityIndicator color={colors.text} accessibilityLabel={t('fridge.saving')} />
                : <MaterialDesignIcons name={isEditing ? 'checkbox-marked-circle-outline' : 'checkbox-marked-circle-plus-outline'} size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />}
            </FeedbackPressable>
          )}
        </View>
      </View>
      {isUnavailable ? (
        <View style={styles.feedback}>
          {isLoading ? <ActivityIndicator color={colors.text} accessibilityLabel={t('home.loading')} /> : <>
              <Text accessibilityRole="alert">{getErrorMessage(loadError?.cause, t, t('home.loadError'))}</Text>
            <PrimaryButton label={t('common.retry')} onPress={() => {
              setIsLoading(true);
              setLoadError(null);
              setLoadAttempt(attempt => attempt + 1);
            }} />
          </>}
        </View>
      ) : <>
      {/* 단계별 스크롤·하단 도구를 함께 이동하며, 비활성 단계의 터치·접근성 탐색은 막는다. */}
      <View style={[styles.stepViewport, activeFocus && styles.focusStepViewport]} pointerEvents={isStepChanging || isSaving ? 'none' : 'auto'}
        accessibilityElementsHidden={isSaving} importantForAccessibility={isSaving ? 'no-hide-descendants' : 'auto'}
        onLayout={({ nativeEvent }) => {
          setStepWidth(nativeEvent.layout.width);
          setStepHeight(nativeEvent.layout.height);
        }}>
        <Animated.View style={[styles.stepTrack, { width: stepWidth * 2, transform: [{
          translateX: stepAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, -stepWidth] }),
        }] }]}>
          {(['basic', 'configuration'] as const).map(pageStep => (
            <View key={pageStep} style={[styles.stepPage, { width: stepWidth }, activeFocus && pageStep !== step && { opacity: 0 }]}
              pointerEvents={pageStep === step && !isStepChanging ? 'auto' : 'none'}
              accessibilityElementsHidden={pageStep !== step || isStepChanging}
              importantForAccessibility={pageStep === step && !isStepChanging ? 'auto' : 'no-hide-descendants'}>
              {/* 배경 도면은 툴바가 생겨도 같은 높이를 유지해 아래쪽 문이 잘리지 않게 한다. */}
              <View style={StyleSheet.absoluteFill}>
                <ScrollView
                  ref={stepScrolls[pageStep]}
                  scrollEnabled={pageStep === 'basic' && !isStepChanging && pageStep === step && !activeFocus}
                  pointerEvents={pageStep === 'configuration' && activeFocus ? 'none' : 'auto'}
                  accessibilityElementsHidden={pageStep === 'configuration' && !!activeFocus}
                  importantForAccessibility={pageStep === 'configuration' && activeFocus ? 'no-hide-descendants' : 'auto'}
                  style={styles.scroll}
                  contentContainerStyle={[styles.content, pageStep === 'configuration' && styles.configurationContent]}
                  keyboardShouldPersistTaps="handled"
                  bounces={false}
                  overScrollMode="never"
                  showsVerticalScrollIndicator={pageStep === 'basic'}
                >
                  <View>
                    <View
                      accessible
                      accessibilityLiveRegion="polite"
                      accessibilityLabel={pageStep === 'basic' ? t('fridge.basicStep') : t('fridge.configurationStep')}
                      style={styles.stepIndicator}
                    >
                      <View style={styles.stepItem}>
                        <View style={[styles.stepBadge, pageStep === 'basic' ? styles.stepBadgeActive : styles.stepBadgeCompleted]}>
                          <Text style={[styles.stepNumber, pageStep === 'basic' ? styles.stepNumberActive : styles.stepNumberCompleted]}>
                            {pageStep === 'basic' ? '1' : '✓'}
                          </Text>
                        </View>
                        <Text style={[styles.stepLabel, pageStep === 'basic' ? styles.stepLabelActive : styles.stepLabelCompleted]}>{t('fridge.basic')}</Text>
                      </View>
                      <View style={[styles.stepConnector, pageStep === 'configuration' && styles.stepConnectorCompleted]} />
                      <View style={styles.stepItem}>
                        <View style={[styles.stepBadge, pageStep === 'configuration' && styles.stepBadgeActive]}>
                          <Text style={[styles.stepNumber, pageStep === 'configuration' && styles.stepNumberActive]}>2</Text>
                        </View>
                        <Text style={[styles.stepLabel, pageStep === 'configuration' && styles.stepLabelActive]}>{t('fridge.configuration')}</Text>
                      </View>
                    </View>
                  </View>
                  {pageStep === 'basic' ? (
                    <View style={styles.sections}>
                      <FormTextInput label={t('fridge.name')} accessibilityLabel={t('fridge.name')} value={draft.name} required
                        onChangeText={name => { if (!saving.current) setDraft(current => ({ ...current, name })); }}
                        editable={!isSaving} maxLength={50} containerStyle={styles.nameField}
                        trailingElement={isEditing ? <PrimaryButton label={t('common.change')} onPress={saveRefrigeratorName}
                          disabled={!draft.name.trim() || draft.name.trim() === savedName || isUnavailable}
                          interactionBlocked={isStepChanging} loading={isSaving} style={styles.nameSaveButton} /> : undefined} />
                      <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                          <Text style={styles.label}>{t('fridge.structure')}</Text>
                          <Text style={styles.description}>{t('fridge.structureHint')}</Text>
                        </View>
                        <View style={styles.structureDiagram}>
                          {/* 도면 테두리 안쪽과 같은 높이를 나눠 조절 버튼을 각 단의 중앙에 맞춘다. */}
                          <View style={[styles.structureEditor, { height: structurePreviewWidth / STRUCTURE_PREVIEW_ASPECT_RATIO }]}>
                            <FridgeStructurePreview rows={draft.rows.map(row => ({ id: row.id, doorCount: row.doors.length }))}
                              style={{ width: structurePreviewWidth }} />
                            <View style={styles.structureControls}>
                              {draft.rows.map((row, index) => (
                                <View key={row.id} style={styles.structureRow}>
                                  <QuantityStepper value={row.doors.length} maximum={MAX_DOORS_PER_ROW} unit={t('fridge.doorUnit')}
                                    accessibilityLabel={t('fridge.rowDoor', { row: index + 1 })}
                                    onChange={delta => { Keyboard.dismiss(); updateStructure(changeDraftDoorCount(draft, row.id, delta)); }} />
                                  <FeedbackPressable tooltip feedback="danger" accessibilityRole="button" accessibilityLabel={t('fridge.removeRow', { row: index + 1 })} disabled={draft.rows.length <= 1}
                                    onPress={() => { Keyboard.dismiss(); updateStructure(removeDraftRow(draft, row.id)); }}
                                    style={styles.deleteRowButton}>
                                    <MaterialDesignIcons name="trash-can-outline" size={18} color={colors.error} accessible={false} style={styles.controlIcon} />
                                  </FeedbackPressable>
                                </View>
                              ))}
                            </View>
                          </View>
                          <View style={styles.structureEditor}>
                            <PrimaryButton label={t('fridge.addRow')} icon="plus" iconColor={colors.chilled} variant="secondary"
                              style={[styles.addRowButton, { width: structurePreviewWidth }]}
                              labelStyle={styles.addRowLabel}
                              disabled={draft.rows.length >= MAX_ROWS}
                              onPress={() => { Keyboard.dismiss(); updateStructure(addDraftRow(draft)); }} />
                            <View style={styles.structureControls} />
                          </View>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.sections, styles.configurationMap]}>
                      <View style={[styles.section, styles.configurationMap]}>
                        <FridgeInteriorMap draft={draft} selectedAreaId={selectedAreaId ?? undefined}
                          onSelectArea={selectArea} focus={activeFocus} onFocus={openFocusedArea} fitHeight layoutSize={diagramSizes.closed} />
                      </View>
                    </View>
                  )}
                </ScrollView>
              </View>
              {/* 툴바 공간은 중앙 보기에서만 확보하고 배경 스크롤 영역과 분리한다. */}
              <View ref={pageStep === 'configuration' ? focusViewport : undefined} collapsable={false} pointerEvents="box-none"
                style={styles.scroll} onLayout={pageStep === 'configuration' ? layoutFocusViewport : undefined}>
                {pageStep === 'configuration' && activeFocus && focusBounds ? (
                  <FridgeFocusView draft={draft} target={activeFocus} viewport={focusBounds} overlayHeight={stepHeight} phase={focusPhase}
                    sizeViewport={diagramSizes.opened}
                    selectedAreaId={selectedAreaId ?? undefined}
                    scrollHintEnabled={!hasSeenScrollHint} onScrollHintSeen={markScrollHintSeen}
                    scrollHintBlocked={activeMenuCategory !== null}
                    selectedSlotIndex={activeMenuCategory === 'slots' && canEditSlotStructure ? selectedSlotIndex : undefined}
                    selectedPositionId={selectedPositionId}
                    onSelectSlot={(areaId, index, positionId) => { selectArea(areaId); setSlotIndex(index); setSelectedPositionId(positionId); }}
                    onPhaseChange={finishFocusTransition} onClose={closeFocusedArea} onSelectArea={selectArea} />
                ) : null}
              </View>
              {pageStep === 'configuration' && activeFocus ? (
                <View pointerEvents={focusPhase === 'open' ? 'auto' : 'none'} accessibilityElementsHidden={focusPhase !== 'open'}
                  importantForAccessibility={focusPhase === 'open' ? 'auto' : 'no-hide-descendants'}
                  style={[styles.configurationToolbar, { paddingBottom: insets.bottom, opacity: focusPhase === 'open' ? 1 : 0 }]}>
                  <FridgeAreaMenu disabled={!selectedAreaId || isSaving || isStepChanging || isFocusMoving}
                    activeCategory={activeMenuCategory} onCategoryChange={setMenuCategory}
                    showOpeningAction={!selectedDoor}
                    openingDisabled={isMergedBody}
                    openingDoors={openingDoors.map(door => ({ id: door.id,
                      label: t('fridge.doorLabel', { location: getDraftAreaLocation(selectedRow, draft.rows.indexOf(selectedRow), door.id, t) }),
                      opening: door.kind === 'DRAWER' ? 'DRAWER' : door.side }))}
                    storageEnabled={selectedAreaId ? selectedDoor?.storageEnabled : false}
                    onStorageChange={updateDoorStorage} storageMode={selectedBody.storageMode}
                    onStorageModeChange={selectStorageMode} showSlots={!isDrawerBody}
                    slots={selectedArea.slots} maxSlotCount={maxSlotCount} selectedSlotIndex={selectedSlotIndex}
                    location={`${location} ${t(areaNames[selectedType])}`}
                    onSlotCountChange={changeSlotCount}
                    onSlotStructureChange={drawerCount => updateSlot(selectedSlotIndex, { drawerCount })}
                    onOpeningChange={selectDoorOpening}
                    onMerge={selectedAreaId && !selectedDoor && !isMergedBody && !mergeIncludesDrawer
                      ? () => {
                        if (!updateStructure(mergeDraftCompartments(draft, selectedRow.id, selectedBody.id))) return;
                        setSlotIndex(0);
                        setSelectedPositionId(undefined);
                        setFocusTarget(current => current ? { ...current, returnAreaId: selectedBody.doorIds[0] } : current);
                      } : undefined}
                    mergeDisabled={!adjacentBody}
                    onSplit={selectedAreaId && !selectedDoor && isMergedBody
                      ? () => {
                        if (!updateStructure(splitDraftCompartment(draft, selectedRow.id, selectedBody.id, activeFocus.returnAreaId))) return;
                        setSlotIndex(0);
                        setSelectedPositionId(undefined);
                      } : undefined}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </Animated.View>
      </View>
      </>}
    </SafeAreaView>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  feedback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  stepViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  // 회전 원근으로 커지는 문 끝은 자르지 않고, 옆 단계는 별도로 숨긴다.
  focusStepViewport: {
    overflow: 'visible',
  },
  stepTrack: {
    flex: 1,
    flexDirection: 'row',
  },
  stepPage: {
    height: '100%',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  // 내부 설정은 스크롤 없이 단계 표시 아래의 남은 높이에 도면을 맞춘다.
  configurationContent: {
    height: '100%',
  },
  configurationMap: {
    flex: 1,
    minHeight: 0,
  },
  configurationToolbar: {
    flexShrink: 0,
    backgroundColor: colors.toolbar,
    zIndex: 30,
  },
  header: {
    ...getHeaderStyles(mode).header,
  },
  headerNavigation: {
    width: FRIDGE_HEADER_BUTTON_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // 홈 아이콘이 있어도 제목이 중앙에 오도록 좌우 버튼 영역의 너비를 맞춘다.
  headerHomeNavigation: {
    width: FRIDGE_HEADER_BUTTON_SIZE * 2,
  },
  headerNextNavigation: {
    justifyContent: 'flex-end',
  },
  headerIconButton: {
    width: FRIDGE_HEADER_BUTTON_SIZE,
    height: FRIDGE_HEADER_BUTTON_SIZE,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusHeader: {
    zIndex: 40,
    backgroundColor: colors.background,
  },
  title: {
    ...getHeaderStyles(mode).title,
    flex: 1,
    textAlign: 'center',
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  stepBadge: {
    width: FRIDGE_STEP_BADGE_SIZE,
    height: FRIDGE_STEP_BADGE_SIZE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeActive: {
    backgroundColor: colors.button,
    borderColor: colors.button,
  },
  stepBadgeCompleted: {
    backgroundColor: colors.sageLight,
    borderColor: colors.sageLight,
  },
  stepNumber: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  stepNumberActive: {
    color: colors.buttonText,
  },
  stepNumberCompleted: {
    color: colors.chilled,
  },
  stepLabel: {
    flexShrink: 1,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  stepLabelActive: {
    color: colors.button,
    fontWeight: '700',
  },
  stepLabelCompleted: {
    color: colors.chilled,
  },
  stepConnector: {
    flex: 1,
    minWidth: spacing.sm,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  stepConnectorCompleted: {
    backgroundColor: colors.sage,
  },
  description: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  sections: {
    gap: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  nameField: {
    marginBottom: 0,
  },
  nameSaveButton: {
    height: 44,
    minWidth: 64,
    flexShrink: 0,
    paddingHorizontal: spacing.sm,
  },
  sectionHeader: {
    gap: spacing.xs,
  },
  structureDiagram: {
    gap: spacing.xs,
  },
  structureEditor: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  structureControls: {
    width: STRUCTURE_CONTROL_WIDTH,
    paddingVertical: 1,
  },
  structureRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // 기존 프로젝트와 같은 줄 높이·폰트 여백 설정으로 아이콘의 중앙을 맞춘다.
  controlIcon: {
    width: 22,
    height: 22,
    lineHeight: 22,
    textAlign: 'center',
    includeFontPadding: false,
  },
  deleteRowButton: {
    width: 32,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  addRowLabel: {
    color: colors.chilled,
    fontSize: 14,
    fontWeight: '600',
  },
  addRowButton: {
    height: 44,
    borderRadius: 12,
    borderWidth: 0,
    backgroundColor: colors.chilledBackground,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
}));
