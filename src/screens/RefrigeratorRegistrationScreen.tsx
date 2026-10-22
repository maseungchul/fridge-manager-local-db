/**
 * @file
 * 냉장고 최초 등록에서 문 개수에 맞는 구조를 선택하고 본체·문 연결의 기본 구성을 만든다.
 * 간소화 JSON을 입력 초안으로 복사하고 본체별 보관 모드를 설정하며, 이름과 구성값은 화면 상태로만 관리한다.
 * 취소 시 이전 홈 화면으로 돌아가며 문 수납·내부 칸 편집과 저장은 별도로 연결한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { FormTextInput } from '@/components/FormTextInput';
import { FridgeStructurePreview } from '@/features/fridge/components/FridgeStructurePreview';
import { createRefrigeratorDraft, storageModeOptions } from '@/features/fridge/model/fridgeLayout';
import type { StorageMode } from '@/features/fridge/model/fridgeLayout';
import fridgeLayoutPresets from '@/features/fridge/model/fridgeLayoutPresets.json';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors, spacing } from '@/theme/tokens';

type RefrigeratorRegistrationScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'RefrigeratorRegistration'
>;

const doorCounts = [...new Set(fridgeLayoutPresets.map(preset => preset.doorCount))].sort((a, b) => a - b);

export function RefrigeratorRegistrationScreen({
  navigation,
}: RefrigeratorRegistrationScreenProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(createRefrigeratorDraft);
  const [doorCount, setDoorCount] = useState<number | null>(null);
  const selectedPresetId = draft.presetId;
  const visiblePresets = fridgeLayoutPresets.filter(preset => preset.doorCount === doorCount);
  const selectedPreset = visiblePresets.find(preset => preset.id === selectedPresetId);

  // 다른 문 개수를 고르면 기존 유형이 새 선택지에 남지 않도록 초기화한다.
  function selectDoorCount(count: number) {
    Keyboard.dismiss();
    if (doorCount === count) return;
    setDoorCount(count);
    setDraft(current => ({ ...createRefrigeratorDraft(), name: current.name }));
  }

  // 보관 모드가 같은 실이 여러 개여도 각 실의 위치와 기존 칸 구성은 유지한다.
  function selectStorageMode(position: string, storageMode: StorageMode) {
    Keyboard.dismiss();
    setDraft(current => ({
      ...current,
      compartments: current.compartments.map(compartment => (
        compartment.position === position ? { ...compartment, storageMode } : compartment
      )),
    }));
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      {/* 스크롤이 화면 하단까지 표시되도록 하단 안전 영역은 내용의 여백에만 적용한다. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <Text accessibilityRole="header" style={styles.title}>냉장고 최초 등록</Text>
        <View style={styles.sections}>
          <FormTextInput
            label="냉장고 이름"
            accessibilityLabel="냉장고 이름"
            value={draft.name}
            onChangeText={name => setDraft(current => ({ ...current, name }))}
            maxLength={50}
            containerStyle={styles.nameField}
          />
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.label}>문 개수</Text>
              <Text style={styles.description}>외부 서랍과 뚜껑도 문 개수에 포함해 주세요.</Text>
            </View>
            <View accessibilityRole="radiogroup" style={styles.row}>
              {doorCounts.map(count => (
                <Pressable
                  key={count}
                  accessibilityRole="radio"
                  accessibilityLabel={`${count}도어`}
                  accessibilityState={{ checked: doorCount === count }}
                  onPress={() => selectDoorCount(count)}
                  style={({ pressed }) => [styles.choice, doorCount === count && styles.selected, pressed && styles.pressed]}
                >
                  <Text style={styles.label}>{doorCount === count ? '✓ ' : ''}{count}도어</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {doorCount !== null ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.label}>냉장고 구조</Text>
                <Text style={styles.description}>본체와 문 배치를 보고 같은 구조를 선택해 주세요.</Text>
              </View>
              <View accessibilityRole="radiogroup" style={styles.structureList}>
                {visiblePresets.map(preset => (
                  <Pressable
                    key={preset.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`${preset.name}, 본체 ${preset.compartments.length}개, ${preset.view === 'TOP' ? '위에서 본 모습' : '정면'}`}
                    accessibilityState={{ checked: selectedPresetId === preset.id }}
                    onPress={() => {
                      Keyboard.dismiss();
                      // 같은 구조를 다시 누르면 입력을 유지하고, 다른 구조는 이름만 이어받는다.
                      setDraft(current => current.presetId === preset.id ? current : {
                        ...createRefrigeratorDraft(preset),
                        name: current.name,
                      });
                    }}
                    style={({ pressed }) => [styles.structure, selectedPresetId === preset.id && styles.selected, pressed && styles.pressed]}
                  >
                    <FridgeStructurePreview preset={preset} />
                    <View style={styles.structureInfo}>
                      <Text style={styles.label}>{selectedPresetId === preset.id ? '✓ ' : ''}{preset.name}</Text>
                      <Text style={styles.description}>본체 {preset.compartments.length}개 · {preset.view === 'TOP' ? '위에서 본 모습' : '정면'}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {selectedPreset ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text accessibilityLiveRegion="polite" style={styles.label}>기본 구성</Text>
                <Text style={styles.description}>본체 {draft.compartments.length}개 · 외부 문 {draft.openings.length}개</Text>
              </View>
              {draft.compartments.map(compartment => (
                <View key={compartment.position} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.label}>{compartment.name}</Text>
                    <Text style={styles.description}>
                      본체 기본 포함 · 외부 문 {draft.openings.filter(opening => opening.compartmentIds.includes(compartment.position)).length}개 연결
                    </Text>
                  </View>
                  <View accessibilityRole="radiogroup" accessibilityLabel={`${compartment.name} 보관 모드`} style={styles.row}>
                    {storageModeOptions.map(mode => (
                      <Pressable
                        key={mode.value}
                        accessibilityRole="radio"
                        accessibilityLabel={`${compartment.name} ${mode.label}`}
                        accessibilityState={{ checked: compartment.storageMode === mode.value }}
                        onPress={() => selectStorageMode(compartment.position, mode.value)}
                        style={({ pressed }) => [styles.choice, compartment.storageMode === mode.value && styles.selected, pressed && styles.pressed]}
                      >
                        <Text style={styles.label}>{compartment.storageMode === mode.value ? '✓ ' : ''}{mode.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <PrimaryButton label="취소" onPress={() => navigation.goBack()} />
      </ScrollView>
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
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    marginBottom: spacing.sm,
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
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
  sectionHeader: {
    gap: spacing.xs,
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
  structureList: {
    gap: spacing.sm,
  },
  structure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  structureInfo: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
});
