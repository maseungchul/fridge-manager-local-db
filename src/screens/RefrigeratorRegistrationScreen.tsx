/**
 * @file
 * 냉장고 최초 등록을 기본 정보·구조 선택과 내부 설정의 두 단계로 나눈다.
 * 단별 문 개수로 배치를 만들고 문 수납·본체 연결·내부 칸 설정을 제공한다.
 * 내부 도면에서 선택한 영역의 설정은 하단 패널에서 편집하고 초안에 즉시 반영한다.
 * 단계 이동 시 입력을 유지하고 취소 시 홈으로 돌아가며, DB 저장은 별도로 연결한다.
 */
import { usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { Animated, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { FormTextInput } from '@/components/FormTextInput';
import { FridgeStructurePreview } from '@/features/fridge/components/FridgeStructurePreview';
import { DoorWithoutStorage, FridgeInteriorMap } from '@/features/fridge/components/FridgeInteriorMap';
import { FridgeMap } from '@/features/fridge/components/FridgeMap';
import { SlotStructureSelector } from '@/features/fridge/components/SlotStructureSelector';
import {
  addDraftRow, areaNames, changeDraftDoorCount, createRefrigeratorDraft, doorOpeningOptions,
  getDraftAreaLocation, getDraftLayout, MAX_DOORS_PER_ROW, MAX_ROWS, MAX_SLOTS, mergeDraftCompartments,
  removeDraftRow, setDraftDoorOpening, splitDraftCompartment, storageModeOptions,
} from '@/features/fridge/model/fridgeLayout';
import type { DoorOpening, SlotConfiguration, StorageMode } from '@/features/fridge/model/fridgeLayout';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors, spacing } from '@/theme/tokens';

type RefrigeratorRegistrationScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'RefrigeratorRegistration'
>;

type RegistrationStep = 'basic' | 'configuration';

export function RefrigeratorRegistrationScreen({
  navigation,
}: RefrigeratorRegistrationScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [draft, setDraft] = useState(createRefrigeratorDraft);
  const [step, setStep] = useState<RegistrationStep>('basic');
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStepChanging, setIsStepChanging] = useState(false);
  const [stepWidth, setStepWidth] = useState(windowWidth);
  const cancelRequested = useRef(false);
  const settingsAnimation = useRef(new Animated.Value(0)).current;
  const stepAnimation = useRef(new Animated.Value(0)).current;
  const stepChanging = useRef(false);
  const stepScrolls = useRef<Partial<Record<RegistrationStep, ScrollView | null>>>({});
  const selectedRow = draft.rows.find(row => [...row.doors, ...row.compartments].some(area => area.id === selectedAreaId)) ?? draft.rows[0];
  const selectedDoor = selectedRow.doors.find(door => door.id === selectedAreaId && door.kind !== 'DRAWER');
  const selectedBody = selectedRow.compartments.find(body => body.id === selectedAreaId
    || body.doorIds.some(id => id === selectedAreaId)) ?? selectedRow.compartments[0];
  const openingDoors = selectedDoor ? [selectedDoor] : selectedRow.doors.filter(door => selectedBody.doorIds.includes(door.id));
  const selectedArea = selectedDoor ?? selectedBody;
  const selectedType = selectedDoor?.side ?? 'BODY';
  const location = getDraftAreaLocation(selectedRow, draft.rows.indexOf(selectedRow), selectedArea.id);
  const bodyLocation = getDraftAreaLocation(selectedRow, draft.rows.indexOf(selectedRow), selectedBody.id);
  const rightBody = selectedRow.compartments[selectedRow.compartments.indexOf(selectedBody) + 1];
  const storageEnabled = !selectedDoor || selectedDoor.storageEnabled;
  const preview = getDraftLayout(draft);
  const previewArea = preview.areas.find(area => area.id === selectedArea.id)!;
  const panelHeight = windowHeight * 0.75;

  useEffect(() => () => {
    stepChanging.current = false;
    stepAnimation.stopAnimation();
    settingsAnimation.stopAnimation();
  }, [settingsAnimation, stepAnimation]);

  // 기기 뒤로가기는 패널·이전 단계 순서로 닫고, 명시적인 취소는 등록을 종료한다.
  usePreventRemove(step === 'configuration' || isStepChanging, ({ data }) => {
    if (cancelRequested.current) {
      cancelRequested.current = false;
      navigation.dispatch(data.action);
    } else if (stepChanging.current) {
      return;
    } else if (isSettingsOpen) {
      closeAreaSettings();
    } else {
      changeStep('basic');
    }
  });

  function cancelRegistration() {
    Keyboard.dismiss();
    stepChanging.current = false;
    stepAnimation.stopAnimation();
    stepAnimation.setValue(step === 'basic' ? 0 : 1);
    setIsStepChanging(false);
    cancelRequested.current = true;
    navigation.goBack();
  }

  // 두 단계의 초안을 공유하며, 들어올 단계의 스크롤만 초기화하고 본문을 좌우로 이동한다.
  function changeStep(nextStep: RegistrationStep) {
    if (stepChanging.current || nextStep === step) return;
    Keyboard.dismiss();
    settingsAnimation.stopAnimation();
    settingsAnimation.setValue(0);
    setIsSettingsOpen(false);
    stepScrolls.current[nextStep]?.scrollTo({ y: 0, animated: false });
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

  function openAreaSettings(id: string) {
    Keyboard.dismiss();
    settingsAnimation.stopAnimation();
    settingsAnimation.setValue(0);
    setSelectedAreaId(id);
    setIsSettingsOpen(true);
  }

  // 패널 닫기는 편집 초안을 유지하며 등록 화면의 취소와 구분한다.
  function closeAreaSettings() {
    Keyboard.dismiss();
    Animated.timing(settingsAnimation, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setIsSettingsOpen(false);
    });
  }

  // Modal 자체는 움직이지 않고 배경의 투명도와 패널의 위치만 각각 바꾼다.
  function showAreaSettings() {
    Animated.timing(settingsAnimation, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }

  // 문 수납을 꺼도 문 식별자·방향·칸 입력은 유지해 다시 켤 수 있다.
  function updateDoorStorage(storageEnabled: boolean) {
    if (!selectedDoor) return;
    Keyboard.dismiss();
    setDraft(current => ({ ...current, rows: current.rows.map(row => row.id !== selectedRow.id ? row : {
      ...row, doors: row.doors.map(door => door.id === selectedDoor.id ? { ...door, storageEnabled } : door),
    }) }));
  }

  // 서랍형으로 바꾸면 숨겨진 문 대신 연결된 본체를 선택해 여는 방식을 다시 바꿀 수 있게 한다.
  function selectDoorOpening(doorId: string, opening: DoorOpening) {
    Keyboard.dismiss();
    setDraft(current => setDraftDoorOpening(current, selectedRow.id, doorId, opening));
    if (opening === 'DRAWER' && selectedDoor?.id === doorId) setSelectedAreaId(selectedBody.id);
  }

  function updateSlots(update: (slots: SlotConfiguration[]) => SlotConfiguration[]) {
    if (!storageEnabled) return;
    setDraft(current => ({ ...current, rows: current.rows.map(row => row.id !== selectedRow.id ? row : {
      ...row,
      doors: row.doors.map(door => door.id === selectedArea.id ? { ...door, slots: update(door.slots) } : door),
      compartments: row.compartments.map(body => body.id === selectedArea.id ? { ...body, slots: update(body.slots) } : body),
    }) }));
  }

  // 마지막 칸부터 추가·제거해 남은 칸과 다른 문·본체의 입력을 유지한다.
  function changeSlotCount(delta: -1 | 1) {
    Keyboard.dismiss();
    updateSlots(slots => {
      const nextCount = slots.length + delta;
      if (nextCount < 1 || nextCount > MAX_SLOTS) return slots;
      return delta === 1 ? [...slots, { name: `${nextCount}번째 칸`, drawerCount: 0 }] : slots.slice(0, -1);
    });
  }

  function updateSlot(index: number, changes: Partial<SlotConfiguration>) {
    if (selectedDoor && changes.drawerCount !== undefined) return;
    updateSlots(slots => slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...changes } : slot));
  }

  // 문의 수납을 선택 중이어도 보관 모드는 연결된 본체에만 기록한다.
  function selectStorageMode(storageMode: StorageMode) {
    Keyboard.dismiss();
    setDraft(current => ({ ...current, rows: current.rows.map(row => row.id !== selectedRow.id ? row : {
      ...row, compartments: row.compartments.map(body => body.id === selectedBody.id ? { ...body, storageMode } : body),
    }) }));
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      {/* 제목·취소는 스크롤 바깥에 두어 두 단계 모두 같은 위치에서 닫을 수 있게 한다. */}
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>냉장고 최초 등록</Text>
        <SecondaryButton label="취소" icon="close" accessibilityLabel="냉장고 등록 취소" onPress={cancelRegistration} />
      </View>
      {/* 제목·하단 버튼은 고정하고, 비활성 단계의 터치·접근성 탐색은 막는다. */}
      <View style={styles.stepViewport} pointerEvents={isStepChanging ? 'none' : 'auto'}
        onLayout={({ nativeEvent }) => setStepWidth(nativeEvent.layout.width)}>
        <Animated.View style={[styles.stepTrack, { width: stepWidth * 2, transform: [{
          translateX: stepAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, -stepWidth] }),
        }] }]}>
          {(['basic', 'configuration'] as const).map(pageStep => (
            <View key={pageStep} style={[styles.stepPage, { width: stepWidth }]}
              pointerEvents={pageStep === step && !isStepChanging ? 'auto' : 'none'}
              accessibilityElementsHidden={pageStep !== step || isStepChanging}
              importantForAccessibility={pageStep === step && !isStepChanging ? 'auto' : 'no-hide-descendants'}>
              <ScrollView
                ref={node => { stepScrolls.current[pageStep] = node; }}
                scrollEnabled={!isStepChanging && pageStep === step}
                style={styles.scroll}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                bounces={pageStep !== 'basic'}
                overScrollMode={pageStep === 'basic' ? 'never' : 'auto'}
              >
                <View style={styles.stepHeader}>
                  <View
                    accessible
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={pageStep === 'basic' ? '전체 2단계 중 1단계, 기본 정보 입력 중' : '기본 정보 완료, 전체 2단계 중 2단계, 내부 설정 중'}
                    style={styles.stepIndicator}
                  >
                    <View style={styles.stepItem}>
                      <View style={[styles.stepBadge, pageStep === 'basic' ? styles.stepBadgeActive : styles.stepBadgeCompleted]}>
                        <Text style={[styles.stepNumber, pageStep === 'basic' ? styles.stepNumberActive : styles.stepNumberCompleted]}>
                          {pageStep === 'basic' ? '1' : '✓'}
                        </Text>
                      </View>
                      <Text style={[styles.stepLabel, pageStep === 'basic' ? styles.stepLabelActive : styles.stepLabelCompleted]}>기본 정보</Text>
                    </View>
                    <View style={[styles.stepConnector, pageStep === 'configuration' && styles.stepConnectorCompleted]} />
                    <View style={styles.stepItem}>
                      <View style={[styles.stepBadge, pageStep === 'configuration' && styles.stepBadgeActive]}>
                        <Text style={[styles.stepNumber, pageStep === 'configuration' && styles.stepNumberActive]}>2</Text>
                      </View>
                      <Text style={[styles.stepLabel, pageStep === 'configuration' && styles.stepLabelActive]}>내부 설정</Text>
                    </View>
                  </View>
                </View>
                {pageStep === 'basic' ? (
                  <View style={styles.sections}>
                    <FormTextInput label="냉장고 이름" accessibilityLabel="냉장고 이름" value={draft.name}
                      onChangeText={name => setDraft(current => ({ ...current, name }))} maxLength={50} containerStyle={styles.nameField} />
                    <View style={styles.section}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.label}>냉장고 구조</Text>
                        <Text style={styles.description}>위에서 아래 순서로 단을 추가하고, 각 단에 나란히 있는 문 개수를 정해 주세요.</Text>
                      </View>
                      <View style={styles.structureDiagram}>
                        {/* 도면 테두리 안쪽과 같은 높이를 나눠 단 이름·조절 버튼을 각 단의 중앙에 맞춘다. */}
                        <View style={[styles.structureEditor, { height: Math.max(240, draft.rows.length * 44 + 2) }]}>
                          <View style={styles.structureLabels}>
                            {draft.rows.map((row, index) => (
                              <View key={row.id} style={styles.structureLabelRow}>
                                <Text style={styles.label}>{index + 1}단</Text>
                              </View>
                            ))}
                          </View>
                          <FridgeStructurePreview rows={draft.rows} style={styles.structurePreview} />
                          <View style={styles.structureControls}>
                            {draft.rows.map((row, index) => (
                              <View key={row.id} style={styles.structureRow}>
                                <View style={styles.counterGroup}>
                                  <FeedbackPressable accessibilityRole="button" accessibilityLabel={`${index + 1}단 문 줄이기`} disabled={row.doors.length <= 1}
                                    onPress={() => { Keyboard.dismiss(); setDraft(current => changeDraftDoorCount(current, row.id, -1)); }}
                                    style={styles.counterButton}>
                                    <MaterialDesignIcons name="minus" size={20} color={colors.button} accessible={false} style={styles.controlIcon} />
                                  </FeedbackPressable>
                                  <Text accessibilityLiveRegion="polite" style={styles.structureCount}>문 {row.doors.length}개</Text>
                                  <FeedbackPressable accessibilityRole="button" accessibilityLabel={`${index + 1}단 문 늘리기`} disabled={row.doors.length >= MAX_DOORS_PER_ROW}
                                    onPress={() => { Keyboard.dismiss(); setDraft(current => changeDraftDoorCount(current, row.id, 1)); }}
                                    style={styles.counterButton}>
                                    <MaterialDesignIcons name="plus" size={20} color={colors.button} accessible={false} style={styles.controlIcon} />
                                  </FeedbackPressable>
                                </View>
                                <FeedbackPressable feedback="danger" accessibilityRole="button" accessibilityLabel={`${index + 1}단 삭제`} disabled={draft.rows.length <= 1}
                                  onPress={() => { Keyboard.dismiss(); setDraft(current => removeDraftRow(current, row.id)); }}
                                  style={styles.deleteRowButton}>
                                  <MaterialDesignIcons name="trash-can-outline" size={18} color={colors.error} accessible={false} style={styles.controlIcon} />
                                </FeedbackPressable>
                              </View>
                            ))}
                          </View>
                        </View>
                        <View style={styles.structureEditor}>
                          <View style={styles.structureLabels} />
                          <PrimaryButton label="단 추가" icon="plus" variant="secondary" style={styles.addRowButton}
                            labelStyle={styles.addRowLabel}
                            disabled={draft.rows.length >= MAX_ROWS}
                            onPress={() => { Keyboard.dismiss(); setDraft(addDraftRow); }} />
                          <View style={styles.structureControls} />
                        </View>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.sections}>
                    <View style={styles.section}>
                      <Text style={styles.description}>도면을 누르면 아래에서 설정 패널이 열려요.</Text>
                      <FridgeInteriorMap draft={draft} selectedAreaId={selectedAreaId ?? undefined}
                        onSelectArea={openAreaSettings} />
                    </View>
                  </View>
                )}
              </ScrollView>
            </View>
          ))}
        </Animated.View>
      </View>
      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {step === 'basic' ? (
          <PrimaryButton
            label="다음"
            disabled={!draft.name.trim()}
            interactionBlocked={isStepChanging}
            onPress={() => changeStep('configuration')}
            style={styles.actionButton}
          />
        ) : (
          <PrimaryButton label="이전" interactionBlocked={isStepChanging} onPress={() => changeStep('basic')} style={styles.actionButton} />
        )}
      </View>
      {/* 설정값은 화면의 draft에 반영하므로 패널을 닫아도 입력은 유지한다. */}
      <Modal visible={step === 'configuration' && isSettingsOpen} transparent animationType="none"
        onShow={showAreaSettings} onRequestClose={closeAreaSettings}>
        <View style={styles.settingsOverlay}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.settingsBackdrop, { opacity: settingsAnimation }]}>
            <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={closeAreaSettings} />
          </Animated.View>
          <KeyboardAvoidingView style={styles.settingsKeyboard} pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Animated.View style={[styles.settingsPanel, { height: panelHeight, transform: [{
              translateY: settingsAnimation.interpolate({ inputRange: [0, 1], outputRange: [panelHeight, 0] }),
            }] }]} accessibilityViewIsModal onAccessibilityEscape={closeAreaSettings}>
              <View style={styles.settingsHeader}>
                <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.settingsTitle}>
                  {areaNames[selectedType]} → {location}
                </Text>
                <SecondaryButton label="닫기" icon="close" accessibilityLabel="내부 설정 패널 닫기" onPress={closeAreaSettings} />
              </View>
              {/* 미리보기는 설정 스크롤 밖에서 같은 초안을 읽어 변경을 즉시 보여준다. */}
              <View style={[styles.settingsPreview, { height: Math.min(168, windowHeight * 0.22) }]}>
                <View style={styles.settingsPreviewMap}>
                  {selectedDoor && !storageEnabled ? (
                    <DoorWithoutStorage label={`${areaNames[selectedType]} → ${location}`} selected readOnly />
                  ) : (
                    <FridgeMap areas={[previewArea]} positions={preview.positions.filter(position => position.areaId === selectedArea.id)}
                      ingredients={preview.ingredients} selectedAreaId={selectedArea.id} showIngredientCounts={false}
                      showAreaLabels={false} minAreaHeight={0} compact preview style={styles.scroll} onSelectPosition={openAreaSettings} />
                  )}
                </View>
              </View>
              <ScrollView key={selectedArea.id} style={styles.scroll}
                contentContainerStyle={[styles.settingsContent, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
                keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                <Text style={styles.description}>{storageEnabled ? `위에서 아래 순서로 표시됩니다. 칸은 1~${MAX_SLOTS}개까지 등록할 수 있어요.` : '이 문에는 수납칸이 없습니다. 수납 사용을 켜면 다시 구성할 수 있어요.'}</Text>
                {!selectedDoor ? <View style={styles.sectionHeader}>
                  <Text style={styles.label}>여는 방식</Text>
                  {openingDoors.map(door => {
                    const doorLocation = getDraftAreaLocation(selectedRow, draft.rows.indexOf(selectedRow), door.id);
                    const currentOpening = door.kind === 'DRAWER' ? 'DRAWER' : door.side;
                    return (
                      <View key={door.id} style={styles.sectionHeader}>
                        {openingDoors.length > 1 ? <Text style={styles.description}>{doorLocation} 문</Text> : null}
                        <View accessibilityRole="radiogroup" accessibilityLabel={`${doorLocation} 여는 방식`} style={styles.row}>
                          {doorOpeningOptions.map(option => (
                            <FeedbackPressable key={option.value} accessibilityRole="radio" accessibilityLabel={`${doorLocation} ${option.label}`}
                              accessibilityState={{ checked: currentOpening === option.value }} onPress={() => selectDoorOpening(door.id, option.value)}
                              style={[styles.choice, currentOpening === option.value && styles.selected]}>
                              <Text style={styles.label}>{currentOpening === option.value ? '✓ ' : ''}{option.label}</Text>
                            </FeedbackPressable>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View> : null}
                {selectedDoor ? (
                  <FeedbackPressable accessibilityRole="switch" accessibilityLabel={`${location} 문 수납 사용`}
                    accessibilityState={{ checked: selectedDoor.storageEnabled }} onPress={() => updateDoorStorage(!selectedDoor.storageEnabled)}
                    style={[styles.choice, selectedDoor.storageEnabled && styles.selected]}>
                    <Text style={styles.label}>{selectedDoor.storageEnabled ? '✓ 수납 사용' : '수납 없음'}</Text>
                  </FeedbackPressable>
                ) : selectedRow.doors.length > 1 ? (
                  <View style={styles.sectionHeader}>
                    <Text style={styles.label}>본체 연결</Text>
                    <View style={styles.row}>
                      {rightBody ? (
                        <FeedbackPressable accessibilityRole="button" accessibilityLabel="오른쪽 본체와 합치기"
                          disabled={selectedBody.slots.length + rightBody.slots.length > MAX_SLOTS}
                          onPress={() => { Keyboard.dismiss(); setDraft(current => mergeDraftCompartments(current, selectedRow.id, selectedBody.id)); }}
                          style={styles.choice}>
                          <Text style={styles.label}>오른쪽 본체와 합치기</Text>
                        </FeedbackPressable>
                      ) : null}
                      {selectedBody.doorIds.length > 1 ? (
                        <FeedbackPressable accessibilityRole="button" accessibilityLabel="문별로 본체 분리"
                          onPress={() => { Keyboard.dismiss(); setDraft(current => splitDraftCompartment(current, selectedRow.id, selectedBody.id)); }} style={styles.choice}>
                          <Text style={styles.label}>문별로 본체 분리</Text>
                        </FeedbackPressable>
                      ) : null}
                    </View>
                    <Text style={styles.description}>{selectedBody.doorIds.length > 1
                      ? '분리하면 기존 칸은 첫 번째 본체에 남습니다.'
                      : rightBody ? '합치면 두 본체의 칸을 이어 붙입니다. 보관 모드가 다르면 다시 선택해 주세요.' : '왼쪽 본체를 선택하면 이 본체와 합칠 수 있어요.'}</Text>
                    {rightBody && selectedBody.slots.length + rightBody.slots.length > MAX_SLOTS ? (
                      <Text style={styles.description}>합친 칸이 {MAX_SLOTS}개를 넘습니다. 칸 수를 줄인 뒤 합쳐 주세요.</Text>
                    ) : null}
                  </View>
                ) : null}
                {storageEnabled ? (
                  <>
                    <View style={styles.row}>
                      <FeedbackPressable accessibilityRole="button" accessibilityLabel={`${location} ${areaNames[selectedType]} 칸 줄이기`}
                        disabled={selectedArea.slots.length <= 1} onPress={() => changeSlotCount(-1)}
                        style={styles.choice}>
                        <Text style={styles.label}>−</Text>
                      </FeedbackPressable>
                      <Text accessibilityLiveRegion="polite" style={styles.count}>칸 {selectedArea.slots.length}개</Text>
                      <FeedbackPressable accessibilityRole="button" accessibilityLabel={`${location} ${areaNames[selectedType]} 칸 늘리기`}
                        disabled={selectedArea.slots.length >= MAX_SLOTS} onPress={() => changeSlotCount(1)}
                        style={styles.choice}>
                        <Text style={styles.label}>＋</Text>
                      </FeedbackPressable>
                    </View>
                    <View>
                      {selectedArea.slots.map((slot, index) => (
                        <View key={index} style={[styles.slotForm, index < selectedArea.slots.length - 1 && styles.slotSeparator]}>
                          <Text accessibilityRole="header" style={styles.slotTitle}>{index + 1}번째 칸</Text>
                          <FormTextInput label="칸 이름" labelStyle={styles.slotLabel} accessibilityLabel={`${location} ${areaNames[selectedType]} ${index + 1}번째 칸 이름`}
                            containerStyle={styles.slotNameField} value={slot.name} maxLength={24} onChangeText={name => updateSlot(index, { name })} />
                          {!selectedDoor ? <SlotStructureSelector label="칸 구조" accessibilityLabel={`${location} 본체 ${index + 1}번째 칸`}
                            value={slot.drawerCount} onChange={drawerCount => updateSlot(index, { drawerCount })} /> : null}
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
                <View style={styles.sectionHeader}>
                  <Text style={styles.label}>보관 모드{selectedDoor ? ` · 본체 ${bodyLocation}` : ''}</Text>
                  <View accessibilityRole="radiogroup" accessibilityLabel={`${bodyLocation} 보관 모드`} style={styles.row}>
                    {storageModeOptions.map(mode => (
                      <FeedbackPressable key={mode.value} accessibilityRole="radio" accessibilityLabel={`${bodyLocation} ${mode.label}`}
                        accessibilityState={{ checked: selectedBody.storageMode === mode.value }} onPress={() => selectStorageMode(mode.value)}
                        style={[styles.choice, selectedBody.storageMode === mode.value && styles.selected]}>
                        <Text style={styles.label}>{selectedBody.storageMode === mode.value ? '✓ ' : ''}{mode.label}</Text>
                      </FeedbackPressable>
                    ))}
                  </View>
                </View>
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  stepViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  stepTrack: {
    flex: 1,
    flexDirection: 'row',
  },
  stepPage: {
    height: '100%',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  stepHeader: {
    marginBottom: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
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
    width: 28,
    height: 28,
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  section: {
    gap: spacing.md,
  },
  nameField: {
    marginBottom: 0,
  },
  sectionHeader: {
    gap: spacing.xs,
  },
  settingsOverlay: {
    flex: 1,
  },
  settingsBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  settingsKeyboard: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  settingsPanel: {
    flexShrink: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  settingsTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  settingsContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  settingsPreview: {
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  settingsPreviewMap: {
    flex: 1,
    width: 120,
    maxWidth: '100%',
    alignSelf: 'center',
  },
  slotForm: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  slotTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  slotLabel: {
    fontSize: 12,
    fontWeight: '400',
  },
  slotNameField: {
    marginBottom: 0,
  },
  slotSeparator: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  count: {
    color: colors.text,
    fontSize: 14,
    minWidth: 60,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  choice: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.sm,
  },
  selected: {
    backgroundColor: colors.sageLight,
    borderColor: colors.button,
  },
  structureDiagram: {
    gap: spacing.xs,
  },
  structureEditor: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  structureLabels: {
    width: 24,
    paddingVertical: 1,
  },
  structureLabelRow: {
    flex: 1,
    justifyContent: 'center',
  },
  structurePreview: {
    flex: 1,
    width: undefined,
    maxWidth: 144,
    aspectRatio: undefined,
    alignSelf: 'stretch',
  },
  structureControls: {
    width: 148,
    paddingVertical: 1,
  },
  structureRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counterGroup: {
    width: 108,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    overflow: 'hidden',
  },
  structureCount: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  counterButton: {
    width: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 14,
  },
  addRowButton: {
    flex: 1,
    maxWidth: 144,
    height: 50,
    borderRadius: 16,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
});
