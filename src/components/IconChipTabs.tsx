/**
 * @file
 * IconChipTabs는 아이콘과 문구를 함께 표시하는 탭 전환 UI다.
 * 활성 탭과 전환 동작은 사용하는 화면에서 관리한다.
 */
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { useAppTheme } from '@/theme/ThemeProvider';
import { createThemedStyles, spacing } from '@/theme/tokens';

interface IconChipTabsProps<TabId extends string> {
  tabs: readonly { id: TabId; label: string; icon: ComponentProps<typeof MaterialDesignIcons>['name'] }[];
  activeTab: TabId;
  onChange: (tab: TabId) => void;
  interactionBlocked?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconChipTabs<TabId extends string>({ tabs, activeTab, onChange, interactionBlocked = false, style }: IconChipTabsProps<TabId>) {
  const { mode, colors } = useAppTheme();
  const styles = getIconChipTabStyles(mode);

  return (
    <View accessibilityRole="tablist" style={[styles.tabs, style]}>
      {tabs.map(({ id, label, icon }) => {
        const selected = id === activeTab;
        return (
          <FeedbackPressable key={id} accessibilityRole="tab" accessibilityLabel={label}
            accessibilityState={{ selected, disabled: interactionBlocked }} interactionBlocked={interactionBlocked}
            hitSlop={2} feedback="chip" onPress={() => onChange(id)} style={[styles.chip, selected && styles.selectedChip]}>
            <MaterialDesignIcons name={icon} size={16} color={selected ? colors.chilled : colors.textMuted} accessible={false}
              style={styles.icon} />
            <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
          </FeedbackPressable>
        );
      })}
    </View>
  );
}

// 탭과 설정 선택지가 같은 캡슐 모양과 선택 색을 사용한다.
export const getIconChipTabStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, maxWidth: '100%',
    minHeight: 42, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderWidth: 1, borderRadius: 26, borderColor: 'transparent',
  },
  selectedChip: { backgroundColor: colors.chipSelected, borderColor: 'transparent' },
  icon: { flexShrink: 0 },
  label: { flexShrink: 1, color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  selectedLabel: { color: colors.chilled },
}));
