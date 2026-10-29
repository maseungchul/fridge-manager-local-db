/**
 * @file
 * 등록 도면의 하단 카테고리와 해당 카테고리의 하위 설정을 표시한다.
 * 하위 설정은 도면과 분리된 표시 공간에 펼치며, 초안과 선택 상태는 호출자가 관리한다.
 */
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { SelectionCheck } from '@/components/SelectionCheck';
import { SlotStructureSelector } from '@/features/fridge/components/SlotStructureSelector';
import { doorOpeningOptions, getSlotName, MAX_SLOTS, storageModeOptions } from '@/features/fridge/model/fridgeLayout';
import type { DoorOpening, DrawerCount, SlotConfiguration, StorageMode } from '@/features/fridge/model/fridgeLayout';
import { colors, spacing } from '@/theme/tokens';

export type FridgeMenuCategory = 'mode' | 'opening' | 'slots' | 'storage';

const SUBMENU_HEIGHT = 82;
const SUBMENU_BOTTOM_SPACE = 20;
// 메뉴를 접어도 도면의 계산 영역은 같은 크기로 유지하고, 실제 툴바에는 빈 공간을 만들지 않는다.
export const FRIDGE_MENU_RESERVED_SPACE = SUBMENU_HEIGHT + SUBMENU_BOTTOM_SPACE + spacing.sm;

interface FridgeAreaMenuProps {
  disabled: boolean;
  activeCategory: FridgeMenuCategory | null;
  onCategoryChange: (category: FridgeMenuCategory | null) => void;
  showOpeningAction: boolean;
  openingDisabled?: boolean;
  openingDoors: { id: string; label: string; opening: DoorOpening }[];
  storageEnabled?: boolean;
  storageMode: StorageMode | null;
  showSlots: boolean;
  slots: SlotConfiguration[];
  maxSlotCount: number;
  selectedSlotIndex: number;
  location: string;
  mergeDisabled?: boolean;
  mergeLimitExceeded?: boolean;
  onOpeningChange: (doorId: string, opening: DoorOpening) => void;
  onStorageChange: (enabled: boolean) => void;
  onStorageModeChange: (mode: StorageMode) => void;
  onSlotCountChange: (delta: -1 | 1) => void;
  onSlotStructureChange: (value: DrawerCount) => void;
  onMerge?: () => void;
  onSplit?: () => void;
}

const openingIcons = { LEFT_DOOR: 'dock-left', RIGHT_DOOR: 'dock-right', DRAWER: 'window-open' } as const;
const categoryOptions = [
  { id: 'mode', label: '보관 모드', icon: 'thermometer-low' },
  { id: 'opening', label: '여는 방식', icon: 'door-open' },
  { id: 'slots', label: '칸 구성', icon: 'view-agenda-outline' },
  { id: 'storage', label: '문 수납', icon: 'tray-full' },
] as const;

/** 하위 설정과 카테고리 사이의 화살표로 관계를 표시하고, 같은 버튼을 다시 누르면 접는다. */
export function FridgeAreaMenu({ disabled, activeCategory, onCategoryChange, showOpeningAction, openingDisabled = false,
  openingDoors, storageEnabled, storageMode, showSlots, slots, maxSlotCount, selectedSlotIndex, location,
  mergeDisabled = false, mergeLimitExceeded = false, onOpeningChange, onStorageChange, onStorageModeChange,
  onSlotCountChange, onSlotStructureChange, onMerge, onSplit }: FridgeAreaMenuProps) {
  const categories = categoryOptions.filter(category => {
    switch (category.id) {
      case 'mode': return showOpeningAction;
      case 'opening': return showOpeningAction && openingDoors.length > 0;
      case 'slots': return showSlots;
      case 'storage': return storageEnabled !== undefined;
    }
  });
  const categoryDisabled = (category: FridgeMenuCategory) => disabled
    || (category === 'opening' && openingDisabled) || (category === 'slots' && storageEnabled === false);
  const current = categories.find(category => category.id === activeCategory && !categoryDisabled(category.id));
  const slot = slots[selectedSlotIndex];

  return (
    <View style={styles.toolbar} onAccessibilityEscape={() => onCategoryChange(null)}>
      {current ? (
        <View style={styles.submenuSlot}>
          <View accessibilityLabel={`${current.label} 하위 설정`} style={styles.submenu}>
            <View style={styles.submenuContent}>
              {current.id === 'mode' ? (
                <ScrollView horizontal nestedScrollEnabled directionalLockEnabled bounces={false} overScrollMode="never"
                  accessibilityRole="radiogroup" accessibilityLabel={`${location} 보관 모드`} style={styles.choicesViewport} contentContainerStyle={styles.choices}>
                  {storageModeOptions.map(mode => (
                    <FeedbackPressable key={mode.value} accessibilityRole="radio" accessibilityLabel={`${location} ${mode.label}`}
                      disabled={disabled} accessibilityState={{ checked: storageMode === mode.value, disabled }}
                      onPress={() => onStorageModeChange(mode.value)} style={[styles.choice, storageMode === mode.value && styles.selected]}>
                      <MaterialDesignIcons name={mode.value === 'CHILLED' ? 'weather-windy' : 'snowflake'} size={18}
                        color={mode.value === 'CHILLED' ? colors.chilled : colors.frozen} accessible={false} />
                      <Text numberOfLines={1} style={[styles.label, styles.choiceLabel]}>{mode.label}</Text><SelectionCheck selected={storageMode === mode.value} />
                    </FeedbackPressable>
                  ))}
                </ScrollView>
              ) : null}
            {current.id === 'opening' ? openingDoors.map(door => (
              <ScrollView key={door.id} horizontal nestedScrollEnabled directionalLockEnabled bounces={false} overScrollMode="never"
                accessibilityRole="radiogroup" accessibilityLabel={`${door.label} 여는 방식`} style={styles.choicesViewport} contentContainerStyle={styles.choices}>
                {doorOpeningOptions.map(option => (
                  <FeedbackPressable key={option.value} accessibilityRole="radio" disabled={disabled}
                    accessibilityLabel={`${door.label} ${option.label}`}
                    accessibilityState={{ checked: door.opening === option.value, disabled }}
                    onPress={() => onOpeningChange(door.id, option.value)} style={[styles.choice, door.opening === option.value && styles.selected]}>
                    <MaterialDesignIcons name={openingIcons[option.value]} size={18} color={colors.text} accessible={false} />
                    <Text numberOfLines={1} style={[styles.label, styles.choiceLabel]}>{option.label}</Text><SelectionCheck selected={door.opening === option.value} />
                  </FeedbackPressable>
                ))}
              </ScrollView>
            )) : null}
            {current.id === 'slots' ? (
              <ScrollView horizontal nestedScrollEnabled directionalLockEnabled bounces={false} overScrollMode="never"
                accessibilityLabel="칸 개수와 선택한 칸의 분할" style={styles.choicesViewport} contentContainerStyle={styles.choices}>
                <View style={styles.counter}>
                  <FeedbackPressable accessibilityRole="button" accessibilityLabel={`${location} 칸 줄이기`}
                    disabled={disabled || slots.length <= 1} onPress={() => onSlotCountChange(-1)} style={styles.counterButton}>
                    <MaterialDesignIcons name="minus" size={20} color={colors.text} accessible={false} />
                  </FeedbackPressable>
                  <Text numberOfLines={1} accessibilityLiveRegion="polite" style={styles.count}>칸 {slots.length}개</Text>
                  <FeedbackPressable accessibilityRole="button" accessibilityLabel={`${location} 칸 늘리기`}
                    disabled={disabled || slots.length >= maxSlotCount} onPress={() => onSlotCountChange(1)} style={styles.counterButton}>
                    <MaterialDesignIcons name="plus" size={20} color={colors.text} accessible={false} />
                  </FeedbackPressable>
                </View>
                {showOpeningAction && slot ? (
                  <SlotStructureSelector label={`${getSlotName(selectedSlotIndex)} 분할`} accessibilityLabel={`${location} ${getSlotName(selectedSlotIndex)}`}
                    value={slot.drawerCount} disabled={disabled} inline onChange={onSlotStructureChange} />
                ) : null}
              </ScrollView>
            ) : null}
            {current.id === 'storage' ? (
              <ScrollView horizontal nestedScrollEnabled directionalLockEnabled bounces={false} overScrollMode="never"
                accessibilityRole="radiogroup" accessibilityLabel="문 수납 사용" style={styles.choicesViewport} contentContainerStyle={styles.choices}>
                {[{ value: true, label: '사용' }, { value: false, label: '사용 안 함' }].map(option => (
                  <FeedbackPressable key={option.label} accessibilityRole="radio" accessibilityLabel={`문 수납 ${option.label}`}
                    disabled={disabled} accessibilityState={{ checked: storageEnabled === option.value, disabled }}
                    onPress={() => onStorageChange(option.value)} style={[styles.choice, storageEnabled === option.value && styles.selected]}>
                    <Text numberOfLines={1} style={[styles.label, styles.choiceLabel]}>{option.label}</Text><SelectionCheck selected={storageEnabled === option.value} />
                  </FeedbackPressable>
                ))}
              </ScrollView>
            ) : null}
          </View>
        </View>
        </View>
      ) : null}
      <View style={styles.actions}>
        {categories.map(category => {
          const expanded = current?.id === category.id;
          const unavailable = categoryDisabled(category.id);
          return (
            <FeedbackPressable key={category.id} accessibilityRole="button" accessibilityLabel={category.label}
              accessibilityHint="누르면 위에 하위 설정을 펼치거나 접습니다."
              accessibilityState={{ disabled: unavailable, expanded }} disabled={unavailable}
              onPress={() => onCategoryChange(expanded ? null : category.id)}
              style={[styles.action, expanded && styles.activeCategory]}>
              {expanded ? <View pointerEvents="none" style={styles.submenuArrow} /> : null}
              <MaterialDesignIcons name={category.icon} size={18} color={expanded ? colors.chilled : colors.text} accessible={false} />
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.label}>{category.label}</Text>
            </FeedbackPressable>
          );
        })}
        {onMerge || onSplit ? (
          <FeedbackPressable accessibilityRole="button" accessibilityLabel={onSplit ? '문별로 본체 분리' : '이웃 본체와 합치기'}
            accessibilityHint={!onSplit && mergeLimitExceeded ? `합치기는 두 본체의 칸이 합계 ${MAX_SLOTS}개 이하일 때 가능해요.` : undefined}
            accessibilityState={{ disabled: disabled || (!onSplit && mergeDisabled) }} disabled={disabled || (!onSplit && mergeDisabled)}
            onPress={onSplit ?? onMerge} style={styles.action}>
            <MaterialDesignIcons name={onSplit ? 'arrow-expand-horizontal' : 'arrow-collapse-horizontal'} size={18} color={colors.text} accessible={false} />
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.label}>{onSplit ? '분리' : '합치기'}</Text>
          </FeedbackPressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.toolbar,
  },
  // 툴바의 배치 높이를 바꾸지 않고, 도면 계산에서 별도로 제외한 공간에 하위 설정을 펼친다.
  submenuSlot: {
    position: 'absolute',
    bottom: '100%',
    left: spacing.lg,
    right: spacing.lg,
    height: SUBMENU_HEIGHT,
    marginBottom: SUBMENU_BOTTOM_SPACE,
  },
  submenu: {
    height: '100%',
    borderWidth: 1,
    borderColor: colors.chilled,
    borderRadius: 10,
    backgroundColor: colors.toolbar,
  },
  submenuContent: {
    padding: spacing.sm,
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  action: {
    flex: 1,
    maxWidth: 110,
    minWidth: 0,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  activeCategory: {
    borderColor: colors.chilled,
    backgroundColor: colors.sageLight,
  },
  submenuArrow: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 14,
    left: '50%',
    marginLeft: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#000000',
  },
  choices: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  choicesViewport: {
    flexGrow: 0,
  },
  choice: {
    flexGrow: 1,
    flexShrink: 0,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  label: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  choiceLabel: {
    flexShrink: 0,
  },
  selected: {
    borderColor: colors.chilled,
    backgroundColor: colors.sageLight,
  },
  counter: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  counterButton: {
    flexShrink: 0,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  count: {
    minWidth: 72,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
