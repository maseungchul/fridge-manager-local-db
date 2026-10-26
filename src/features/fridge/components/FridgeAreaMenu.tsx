/**
 * @file
 * 등록 도면에서 선택한 문·본체 가까이에 구조 변경 메뉴를 표시한다.
 * 화면 여백에 따라 메뉴 위치를 조정하며, 초안 변경과 내부 설정 패널은 호출자가 관리한다.
 */
import { useRef, useState } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LayoutRectangle } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { SecondaryButton } from '@/components/SecondaryButton';
import { doorOpeningOptions, MAX_SLOTS } from '@/features/fridge/model/fridgeLayout';
import type { DoorOpening } from '@/features/fridge/model/fridgeLayout';
import { colors, spacing } from '@/theme/tokens';

interface FridgeAreaMenuProps {
  anchor: LayoutRectangle;
  title: string;
  openingDoors: { id: string; label: string; opening: DoorOpening }[];
  storageEnabled?: boolean;
  mergeDisabled?: boolean;
  onOpeningChange: (doorId: string, opening: DoorOpening) => void;
  onToggleStorage: () => void;
  onMerge?: () => void;
  onSplit?: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

const MENU_GAP = 8;
const HEADER_HEIGHT = 50;

/** 가로는 화면 중앙에 맞추고, 세로는 선택 영역의 위나 아래에 놓는다. */
function getMenuPlacement(anchor: LayoutRectangle, bounds: LayoutRectangle, desiredHeight: number) {
  const width = Math.min(280, bounds.width - MENU_GAP * 2);
  const y = anchor.y - bounds.y;
  const visibleTop = Math.max(MENU_GAP, y);
  const visibleBottom = Math.min(bounds.height - MENU_GAP, y + anchor.height);
  const above = Math.max(0, visibleTop - MENU_GAP * 2);
  const below = Math.max(0, bounds.height - visibleBottom - MENU_GAP * 2);
  const maxHeight = Math.min(bounds.height - MENU_GAP * 2, Math.max(132, above, below));
  const height = Math.min(desiredHeight, maxHeight);
  const top = below >= height || below >= above ? visibleBottom + MENU_GAP : visibleTop - height - MENU_GAP;
  return {
    width, maxHeight,
    left: (bounds.width - width) / 2,
    top: Math.max(MENU_GAP, Math.min(top, bounds.height - height - MENU_GAP)),
  };
}

/** 구조 변경 중에도 배경을 어둡게 하지 않아 전체 도면에서 변경 결과를 확인하게 한다. */
export function FridgeAreaMenu({ anchor, title, openingDoors, storageEnabled, mergeDisabled = false,
  onOpeningChange, onToggleStorage, onMerge, onSplit, onOpenSettings, onClose }: FridgeAreaMenuProps) {
  const host = useRef<View>(null);
  const [bounds, setBounds] = useState<LayoutRectangle | null>(null);
  const [showOpenings, setShowOpenings] = useState(false);
  const [contentHeight, setContentHeight] = useState(204);
  const placement = bounds ? getMenuPlacement(anchor, bounds, HEADER_HEIGHT + contentHeight + 2) : null;

  return (
    <View ref={host} collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="box-none"
      onLayout={() => host.current?.measureInWindow((x, y, width, height) => setBounds({ x, y, width, height }))}>
      <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={onClose} />
      {placement ? (
        <View style={[styles.menuShadow, placement]}>
          <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={styles.menu}>
            <View style={styles.header}>
              {showOpenings ? <SecondaryButton label="뒤로" icon="chevron-left" onPress={() => setShowOpenings(false)} />
                : <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{title}</Text>}
              <SecondaryButton label="닫기" icon="close" accessibilityLabel="구조 변경 메뉴 닫기" onPress={onClose} />
            </View>
            <ScrollView style={{ maxHeight: placement.maxHeight - HEADER_HEIGHT - 2 }} keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.content} onContentSizeChange={(_, height) => setContentHeight(height)}>
              {showOpenings ? openingDoors.map(door => (
                <View key={door.id} style={styles.openingGroup}>
                  <Text style={styles.description}>{openingDoors.length > 1 ? `${door.label.replace(/^\d+단\s*/, '')} · ` : ''}여는 방식</Text>
                  <View accessibilityRole="radiogroup" accessibilityLabel={`${door.label} 여는 방식`} style={styles.openingChoices}>
                    {doorOpeningOptions.map(option => (
                      <FeedbackPressable key={option.value} accessibilityRole="radio"
                        accessibilityLabel={`${door.label} ${option.label}`} accessibilityState={{ checked: door.opening === option.value }}
                        onPress={() => onOpeningChange(door.id, option.value)}
                        style={[styles.openingChoice, door.opening === option.value && styles.selected]}>
                        <Text style={styles.choiceLabel}>{door.opening === option.value ? '✓ ' : ''}{option.label}</Text>
                      </FeedbackPressable>
                    ))}
                  </View>
                </View>
              )) : (
                <>
                  <FeedbackPressable accessibilityRole="button" onPress={() => setShowOpenings(true)} style={styles.action}>
                    <Text style={styles.label}>여는 방식</Text>
                    <MaterialDesignIcons name="chevron-right" size={18} color={colors.textMuted} accessible={false} />
                  </FeedbackPressable>
                  {storageEnabled !== undefined ? (
                    <FeedbackPressable accessibilityRole="switch" accessibilityLabel="문 수납 사용"
                      accessibilityState={{ checked: storageEnabled }} onPress={onToggleStorage} style={styles.action}>
                      <Text style={styles.label}>문 수납</Text><Text style={styles.description}>{storageEnabled ? '사용 중' : '사용 안 함'}</Text>
                    </FeedbackPressable>
                  ) : null}
                  {onMerge ? (
                    <FeedbackPressable accessibilityRole="button" disabled={mergeDisabled} onPress={onMerge} style={styles.action}>
                      <Text style={styles.label}>오른쪽 본체와 합치기</Text>
                    </FeedbackPressable>
                  ) : null}
                  {mergeDisabled ? <Text style={styles.description}>합친 칸이 {MAX_SLOTS}개를 넘어서 연결할 수 없어요.</Text> : null}
                  {onSplit ? (
                    <FeedbackPressable accessibilityRole="button" onPress={onSplit} style={styles.action}>
                      <Text style={styles.label}>문별로 본체 분리</Text>
                    </FeedbackPressable>
                  ) : null}
                  <View style={styles.settingsAction}>
                    <FeedbackPressable accessibilityRole="button" onPress={onOpenSettings} style={styles.action}>
                      <Text style={styles.label}>내부 설정</Text>
                      <MaterialDesignIcons name="chevron-right" size={18} color={colors.textMuted} accessible={false} />
                    </FeedbackPressable>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // 콘텐츠의 둥근 모서리 클리핑이 바깥 그림자를 자르지 않도록 분리한다.
  menuShadow: {
    position: 'absolute',
    borderRadius: 12,
    boxShadow: '0 4px 12px rgba(34, 35, 31, 0.14)',
  },
  menu: {
    borderWidth: 1,
    borderColor: '#B0ACA3',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    padding: spacing.xs,
    gap: 4,
  },
  action: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
  label: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  description: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  settingsAction: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 4,
  },
  openingGroup: {
    gap: spacing.xs,
    padding: spacing.xs,
  },
  openingChoices: {
    flexDirection: 'row',
    gap: 4,
  },
  openingChoice: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceLabel: {
    color: colors.text,
    fontSize: 12,
    textAlign: 'center',
  },
  selected: {
    borderColor: colors.button,
    backgroundColor: colors.sageLight,
  },
});
