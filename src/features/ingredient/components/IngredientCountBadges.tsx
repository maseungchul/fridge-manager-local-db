/**
 * @file
 * 도면·칸의 일반·기한주의·경과 재료 건수를 호출자가 정한 위치에 묶어 표시한다.
 * 집계는 호출자가 전달하며, 범례는 숫자 없이 같은 색상 막대만 사용한다.
 */
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { IngredientCounts } from '@/features/ingredient/model/ingredient';
import { ingredientBadgeColors, ingredientLabelColors } from '@/theme/tokens';

export const INGREDIENT_BADGE_SIZE = 28;
const BADGE_ROW_HEIGHT = 16;
const BADGE_PADDING = 2;
const badgeKinds = ['normal', 'warning', 'expired'] as const;

/** 세로 배지가 포켓 전면 안에서 잘리지 않도록 표시할 행의 높이를 공유한다. */
export function getIngredientBadgeHeight(counts: IngredientCounts) {
  const rows = badgeKinds.filter(kind => counts[kind] > 0).length;
  return rows > 0 ? rows * BADGE_ROW_HEIGHT + BADGE_PADDING * 2 : 0;
}

/** 색을 구별하지 못하는 경우에도 실제 건수와 기한 상태를 함께 안내한다. */
export function getIngredientCountLabel(counts: IngredientCounts) {
  return `재료 ${counts.total}건${counts.normal > 0 ? `, 일반 ${counts.normal}건` : ''}${counts.warning > 0 ? `, 유통기한 주의 ${counts.warning}건` : ''}${counts.expired > 0 ? `, 경과 ${counts.expired}건` : ''}`;
}

export function IngredientCountBadge({ count, kind }: { count?: number; kind: typeof badgeKinds[number] }) {
  const color = ingredientBadgeColors[kind];
  return (
    <View style={[styles.badge, count === undefined && styles.legendBadge]}>
      <View style={[styles.colorMark, { backgroundColor: color }]} />
      {count !== undefined ? (
        <Text style={[styles.count, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.2}>{count > 99 ? '99+' : count}</Text>
      ) : null}
    </View>
  );
}

export function IngredientCountBadges({ counts, placement = 'center', style }: {
  counts: IngredientCounts;
  placement?: 'center' | 'top-left' | 'top-right';
  style?: StyleProp<ViewStyle>;
}) {
  if (counts.total === 0) return null;
  const upper = placement !== 'center';
  const alignment = placement === 'top-right' ? 'flex-end' : 'flex-start';
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.center, upper && { alignItems: alignment, justifyContent: 'flex-start' }, style]}>
      <View style={styles.badges}>
        {badgeKinds.filter(kind => counts[kind] > 0).map(kind => (
          <IngredientCountBadge key={kind} count={counts[kind]} kind={kind} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  badges: {
    maxWidth: '100%', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start',
    paddingHorizontal: BADGE_PADDING, paddingVertical: BADGE_PADDING, borderRadius: 4,
    backgroundColor: ingredientLabelColors.background,
  },
  // 홈·내부 칸 모두 같은 간격으로 막대와 숫자의 왼쪽을 맞춘다.
  badge: { minWidth: 0, minHeight: BADGE_ROW_HEIGHT, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 3 },
  legendBadge: {
    width: INGREDIENT_BADGE_SIZE, height: 26, borderRadius: 4, justifyContent: 'center',
    backgroundColor: ingredientLabelColors.background,
  },
  colorMark: { width: 3, height: 12, borderRadius: 1.5, flexShrink: 0 },
  count: { flexShrink: 1, fontSize: 11, lineHeight: 14, fontWeight: '700', fontVariant: ['tabular-nums'], includeFontPadding: false },
});
