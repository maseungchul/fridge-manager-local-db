/**
 * @file
 * 등록 도면의 하단 카테고리와 해당 카테고리의 하위 설정을 표시한다.
 * 하위 설정은 도면과 분리된 표시 공간에 펼치며, 초안과 선택 상태는 호출자가 관리한다.
 */
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { getIconChipTabStyles } from '@/components/IconChipTabs';
import { QuantityStepper } from '@/components/QuantityStepper';
import { SlotStructureSelector } from '@/features/fridge/components/SlotStructureSelector';
import { doorOpeningOptions, getSlotName, storageModeOptions } from '@/features/fridge/model/fridgeLayout';
import type { DoorOpening, DrawerCount, SlotConfiguration, StorageMode } from '@/features/fridge/model/fridgeLayout';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { FRIDGE_SUBMENU_HEIGHT } from '@/features/fridge/components/fridgeDiagramLayout';
import { getFridgeToolbarStyles } from '@/features/fridge/components/fridgeToolbarStyles';
import { useTranslation } from '@/i18n/LanguageProvider';

export type FridgeMenuCategory = 'mode' | 'opening' | 'slots';

// 메뉴를 접어도 도면의 계산 영역은 같은 크기로 유지하고, 실제 툴바에는 빈 공간을 만들지 않는다.
export { FRIDGE_MENU_RESERVED_SPACE } from '@/features/fridge/components/fridgeDiagramLayout';

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
  onOpeningChange: (doorId: string, opening: DoorOpening) => void;
  onStorageChange: (enabled: boolean) => void;
  onStorageModeChange: (mode: StorageMode) => void;
  onSlotCountChange: (delta: -1 | 1) => void;
  onSlotStructureChange: (value: DrawerCount) => void;
  onMerge?: () => void;
  onSplit?: () => void;
}

const openingIcons = { LEFT_DOOR: 'dock-left', RIGHT_DOOR: 'dock-right', DRAWER: 'window-open' } as const;
const submenuFade = FadeIn.duration(120).reduceMotion(ReduceMotion.System);
const categoryOptions = [
  { id: 'mode', label: 'fridge.storageMode', icon: 'thermometer-low' },
  { id: 'opening', label: 'fridge.opening', icon: 'door-open' },
  { id: 'slots', label: 'fridge.slots', icon: 'view-agenda-outline' },
] as const;

/** 선택한 카테고리의 하위 설정을 툴바 위에 표시하고, 같은 버튼을 다시 누르면 접는다. */
export function FridgeAreaMenu({ disabled, activeCategory, onCategoryChange, showOpeningAction, openingDisabled = false,
  openingDoors, storageEnabled, storageMode, showSlots, slots, maxSlotCount, selectedSlotIndex, location,
  mergeDisabled = false, onOpeningChange, onStorageChange, onStorageModeChange,
  onSlotCountChange, onSlotStructureChange, onMerge, onSplit }: FridgeAreaMenuProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const categories = categoryOptions.map(category => ({ ...category, label: t(category.label) })).filter(category => {
    switch (category.id) {
      case 'mode': return showOpeningAction;
      case 'opening': return showOpeningAction && openingDoors.length > 0;
      case 'slots': return showSlots;
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
          <View accessibilityLabel={t('fridge.submenu', { label: current.label })} style={styles.submenu}>
            <Animated.View key={current.id} entering={submenuFade} style={styles.submenuContent}>
              {current.id === 'mode' ? (
                <ScrollView horizontal nestedScrollEnabled directionalLockEnabled bounces={false} overScrollMode="never"
                  accessibilityRole="radiogroup" accessibilityLabel={t('fridge.modeLabel', { location })} style={styles.choicesViewport} contentContainerStyle={styles.choices}>
                  <View style={styles.segments}>{storageModeOptions.map(mode => (
                    <FeedbackPressable key={mode.value} accessibilityRole="radio" accessibilityLabel={`${location} ${t(mode.label)}`}
                      disabled={disabled} accessibilityState={{ checked: storageMode === mode.value, disabled }}
                      hitSlop={2} feedback="chip" onPress={() => onStorageModeChange(mode.value)} style={[styles.choice, storageMode === mode.value && styles.selected]}>
                      <MaterialDesignIcons name={mode.value === 'CHILLED' ? 'weather-windy' : 'snowflake'} size={16}
                        color={storageMode === mode.value ? colors.chilled : colors.textMuted} accessible={false} />
                      <Text numberOfLines={1} style={[styles.choiceLabel, storageMode === mode.value && styles.selectedChoiceLabel]}>{t(mode.label)}</Text>
                    </FeedbackPressable>
                  ))}</View>
                </ScrollView>
              ) : null}
            {current.id === 'opening' ? openingDoors.map(door => (
              <ScrollView key={door.id} horizontal nestedScrollEnabled directionalLockEnabled bounces={false} overScrollMode="never"
                accessibilityRole="radiogroup" accessibilityLabel={t('fridge.openingLabel', { label: door.label })} style={styles.choicesViewport} contentContainerStyle={styles.choices}>
                <View style={styles.segments}>{doorOpeningOptions.map(option => (
                  <FeedbackPressable key={option.value} accessibilityRole="radio" disabled={disabled}
                    accessibilityLabel={`${door.label} ${t(option.label)}`}
                    accessibilityState={{ checked: door.opening === option.value, disabled }}
                    hitSlop={2} feedback="chip" onPress={() => onOpeningChange(door.id, option.value)} style={[styles.choice, door.opening === option.value && styles.selected]}>
                    <MaterialDesignIcons name={openingIcons[option.value]} size={16} color={door.opening === option.value ? colors.chilled : colors.textMuted} accessible={false} />
                    <Text numberOfLines={1} style={[styles.choiceLabel, door.opening === option.value && styles.selectedChoiceLabel]}>{t(option.label)}</Text>
                  </FeedbackPressable>
                ))}</View>
              </ScrollView>
            )) : null}
            {current.id === 'slots' ? (
              <ScrollView horizontal nestedScrollEnabled directionalLockEnabled bounces={false} overScrollMode="never"
                accessibilityLabel={t('fridge.slotControls')} style={styles.choicesViewport} contentContainerStyle={styles.choices}>
                <QuantityStepper value={slots.length} maximum={maxSlotCount} unit={t('fridge.slotUnit')}
                  accessibilityLabel={t('fridge.slotLabel', { location })} disabled={disabled} onChange={onSlotCountChange} />
                {showOpeningAction && slot ? (
                  <SlotStructureSelector label={t('fridge.splitLabel', { slot: getSlotName(selectedSlotIndex, t) })} accessibilityLabel={`${location} ${getSlotName(selectedSlotIndex, t)}`}
                    value={slot.drawerCount} disabled={disabled} inline onChange={onSlotStructureChange} />
                ) : null}
              </ScrollView>
            ) : null}
          </Animated.View>
        </View>
        </View>
      ) : null}
      <View style={styles.actions}>
        {categories.map(category => {
          const expanded = current?.id === category.id;
          const unavailable = categoryDisabled(category.id);
          return (
            <FeedbackPressable key={category.id} accessibilityRole="button" accessibilityLabel={category.label}
              accessibilityHint={t('fridge.submenuHint')}
              accessibilityState={{ disabled: unavailable, expanded }} disabled={unavailable}
              onPress={() => onCategoryChange(expanded ? null : category.id)} feedback="none" style={styles.action}>
              {({ pressed }) => {
                const color = expanded ? colors.chilled : pressed ? colors.iconPressed : colors.text;
                return <>
                  <MaterialDesignIcons name={category.icon} size={24} color={color} accessible={false} />
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.label, { color }]}>{category.label}</Text>
                </>;
              }}
            </FeedbackPressable>
          );
        })}
        {storageEnabled !== undefined ? (
          <FeedbackPressable accessibilityRole="switch" accessibilityLabel={t('fridge.useDoorStorage')}
            accessibilityState={{ checked: storageEnabled, disabled }} disabled={disabled}
            onPress={() => onStorageChange(!storageEnabled)} feedback="none" style={styles.action}>
            {({ pressed }) => {
              const color = pressed ? colors.iconPressed : storageEnabled ? colors.chilled : colors.textMuted;
              return <>
                <MaterialDesignIcons name={storageEnabled ? 'tray-full' : 'tray-remove'} size={24} color={color} accessible={false} />
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.label, { color }]}>
                  {t(storageEnabled ? 'fridge.doorStorage' : 'fridge.noDoorStorage')}
                </Text>
              </>;
            }}
          </FeedbackPressable>
        ) : null}
        {onMerge || onSplit ? (
          <FeedbackPressable accessibilityRole="button" accessibilityLabel={onSplit ? t('fridge.splitBodies') : t('fridge.mergeBodies')}
            accessibilityHint={onSplit ? t('fridge.splitHint') : t('fridge.mergeHint')}
            accessibilityState={{ disabled: disabled || (!onSplit && mergeDisabled) }} disabled={disabled || (!onSplit && mergeDisabled)}
            onPress={onSplit ?? onMerge} feedback="none" style={styles.action}>
            {({ pressed }) => {
              const color = pressed ? colors.iconPressed : colors.text;
              return <>
                <MaterialDesignIcons name={onSplit ? 'arrow-expand-horizontal' : 'arrow-collapse-horizontal'} size={24} color={color} accessible={false} />
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.label, { color }]}>{onSplit ? t('fridge.split') : t('fridge.merge')}</Text>
              </>;
            }}
          </FeedbackPressable>
        ) : null}
      </View>
    </View>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  ...getFridgeToolbarStyles(mode),
  toolbar: { ...getFridgeToolbarStyles(mode).toolbar, height: 50, paddingVertical: 0 },
  // 툴바의 배치 높이를 바꾸지 않고, 도면 계산에서 별도로 제외한 공간에 하위 설정을 펼친다.
  submenuSlot: {
    position: 'absolute',
    bottom: '100%',
    left: -spacing.md,
    right: -spacing.md,
    height: FRIDGE_SUBMENU_HEIGHT,
  },
  submenu: {
    height: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.toolbar,
  },
  submenuContent: {
    flex: 1,
    justifyContent: 'center',
  },
  action: { ...getFridgeToolbarStyles(mode).action, maxWidth: undefined, minHeight: 0, height: 50 - StyleSheet.hairlineWidth,
    justifyContent: 'flex-start', paddingTop: spacing.xs, paddingBottom: 0, gap: 0, borderWidth: 0, backgroundColor: 'transparent' },
  choices: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  choicesViewport: {
    flexGrow: 0,
  },
  segments: {
    flexDirection: 'row',
    flexShrink: 0,
    padding: 4,
    gap: 4,
    borderRadius: 26,
    backgroundColor: mode === 'light' ? colors.navigationBackground : colors.background,
  },
  choice: {
    ...getIconChipTabStyles(mode).chip,
    flexShrink: 0,
    maxWidth: undefined,
  },
  choiceLabel: {
    ...getIconChipTabStyles(mode).label,
    fontSize: 12,
    flexShrink: 0,
  },
  selected: getIconChipTabStyles(mode).selectedChip,
  selectedChoiceLabel: getIconChipTabStyles(mode).selectedLabel,
}));
