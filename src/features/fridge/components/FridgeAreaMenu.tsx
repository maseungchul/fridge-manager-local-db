/**
 * @file
 * 등록 도면에서 선택한 문·본체의 구조 변경 도구를 하단에 고정 표시한다.
 * 본체의 여는 방식은 툴바 위에 펼치며, 선택 상태·초안 변경과 내부 설정 패널은 호출자가 관리한다.
 */
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SelectionCheck } from '@/components/SelectionCheck';
import { doorOpeningOptions, MAX_SLOTS } from '@/features/fridge/model/fridgeLayout';
import type { DoorOpening } from '@/features/fridge/model/fridgeLayout';
import { colors, spacing } from '@/theme/tokens';

interface FridgeAreaMenuProps {
  disabled: boolean;
  openingsOpen: boolean;
  showOpeningAction: boolean;
  openingDisabled?: boolean;
  openingDoors: { id: string; label: string; opening: DoorOpening }[];
  storageEnabled?: boolean;
  mergeDisabled?: boolean;
  mergeLimitExceeded?: boolean;
  onOpeningChange: (doorId: string, opening: DoorOpening) => void;
  onOpeningsChange: (open: boolean) => void;
  onToggleStorage: () => void;
  onMerge?: () => void;
  onSplit?: () => void;
  onOpenSettings: () => void;
}

const openingIcons = {
  LEFT_DOOR: 'dock-left',
  RIGHT_DOOR: 'dock-right',
  DRAWER: 'window-open',
} as const;

/** 도면의 스크롤·영역 선택을 막지 않고, 세부 선택지만 높이를 제한해 펼친다. */
export function FridgeAreaMenu({ disabled, openingsOpen, showOpeningAction, openingDisabled = false, openingDoors, storageEnabled, mergeDisabled = false,
  mergeLimitExceeded = false,
  onOpeningChange, onOpeningsChange, onToggleStorage, onMerge, onSplit, onOpenSettings }: FridgeAreaMenuProps) {
  const { height } = useWindowDimensions();
  const settingsDisabled = disabled || storageEnabled === false;
  const openingsDisabled = disabled || openingDisabled;
  const showOpenings = showOpeningAction && !openingDisabled && openingsOpen && openingDoors.length > 0;

  return (
    <View style={styles.toolbar}>
      {showOpenings ? (
        <View onAccessibilityEscape={() => onOpeningsChange(false)}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>여는 방식</Text>
            <SecondaryButton label="닫기" icon="close" accessibilityLabel="여는 방식 선택 닫기"
              onPress={() => onOpeningsChange(false)} />
          </View>
          <ScrollView style={[styles.openingsScroll, { maxHeight: Math.min(220, height * 0.28) }]}
            bounces={false} overScrollMode="never"
            keyboardShouldPersistTaps="handled" contentContainerStyle={styles.openingsContent}>
            {openingDoors.map(door => (
              <View key={door.id} style={styles.openingGroup}>
                <View accessibilityRole="radiogroup" accessibilityLabel={`${door.label} 여는 방식`} style={styles.openingChoices}>
                  {doorOpeningOptions.map(option => (
                    <FeedbackPressable key={option.value} accessibilityRole="radio" disabled={openingsDisabled}
                      accessibilityLabel={`${door.label} ${option.label}`}
                      accessibilityState={{ checked: door.opening === option.value, disabled: openingsDisabled }}
                      onPress={() => onOpeningChange(door.id, option.value)}
                      style={[styles.openingChoice, door.opening === option.value && styles.selected]}>
                      <MaterialDesignIcons name={openingIcons[option.value]} size={18} color={colors.text}
                        accessible={false} style={styles.actionIcon} />
                      <Text numberOfLines={1} style={styles.choiceLabel}>{option.label}</Text>
                      <SelectionCheck selected={door.opening === option.value} />
                    </FeedbackPressable>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {onMerge && mergeLimitExceeded ? <Text style={styles.description}>합친 칸이 {MAX_SLOTS}개를 넘어서 연결할 수 없어요.</Text> : null}
      <View style={styles.actions}>
        {showOpeningAction && openingDoors.length > 0 ? (
          <FeedbackPressable accessibilityRole="button" accessibilityState={{ disabled: openingsDisabled, expanded: showOpenings }}
            disabled={openingsDisabled} onPress={() => onOpeningsChange(!openingsOpen)}
            style={[styles.action, showOpenings && styles.selected]}>
            <MaterialDesignIcons name="door-open" size={16} color={colors.text} accessible={false} style={styles.actionIcon} />
            <Text style={styles.label}>여는 방식</Text>
          </FeedbackPressable>
        ) : null}
        {storageEnabled !== undefined ? (
          <View style={[styles.action, styles.storageAction, disabled && styles.disabled]}>
            <View style={styles.actionContent}>
              <MaterialDesignIcons name="tray-full" size={16} color={colors.text} accessible={false} style={styles.actionIcon} />
              <Text accessible={false} style={styles.label}>문 수납</Text>
            </View>
            <Switch accessibilityLabel="문 수납 사용" value={storageEnabled} disabled={disabled}
              onValueChange={onToggleStorage} trackColor={{ false: colors.border, true: colors.chilled }}
              thumbColor={colors.surface} ios_backgroundColor={colors.border} hitSlop={6}
              style={styles.storageSwitch} />
          </View>
        ) : null}
        {onMerge ? (
          <FeedbackPressable accessibilityRole="button" accessibilityLabel="오른쪽 본체와 합치기"
            accessibilityState={{ disabled: disabled || mergeDisabled }} disabled={disabled || mergeDisabled}
            onPress={onMerge} style={styles.action}>
            <MaterialDesignIcons name="arrow-collapse-horizontal" size={16} color={colors.text} accessible={false} style={styles.actionIcon} />
            <Text style={styles.label}>합치기</Text>
          </FeedbackPressable>
        ) : null}
        {onSplit ? (
          <FeedbackPressable accessibilityRole="button" accessibilityLabel="문별로 본체 분리"
            accessibilityState={{ disabled }} disabled={disabled}
            onPress={onSplit} style={styles.action}>
            <MaterialDesignIcons name="arrow-expand-horizontal" size={16} color={colors.text} accessible={false} style={styles.actionIcon} />
            <Text style={styles.label}>분리</Text>
          </FeedbackPressable>
        ) : null}
        <FeedbackPressable accessibilityRole="button" accessibilityState={{ disabled: settingsDisabled }} disabled={settingsDisabled}
          onPress={onOpenSettings} style={styles.action}>
          <MaterialDesignIcons name="tune-variant" size={16} color={colors.text} accessible={false} style={styles.actionIcon} />
          <Text style={styles.label}>내부 설정</Text>
        </FeedbackPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexShrink: 0,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.toolbar,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  openingsScroll: {
    flexGrow: 0,
  },
  openingsContent: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: spacing.xs,
  },
  action: {
    flexShrink: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionContent: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIcon: {
    lineHeight: 20,
    includeFontPadding: false,
  },
  label: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  storageAction: {
    justifyContent: 'space-between',
    gap: spacing.xs,
    minWidth: 120,
  },
  // iOS 기본 alignSelf를 덮어써 스위치를 버튼의 세로 중앙에 맞춘다.
  storageSwitch: {
    alignSelf: 'center',
    transform: [{ scale: 0.8 }],
  },
  disabled: {
    opacity: 0.42,
  },
  description: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  openingGroup: {
    gap: spacing.xs,
  },
  openingChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  openingChoice: {
    flexGrow: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceLabel: {
    flexShrink: 0,
    color: colors.text,
    fontSize: 12,
    textAlign: 'center',
  },
  selected: {
    borderColor: colors.button,
    backgroundColor: colors.sageLight,
  },
});
