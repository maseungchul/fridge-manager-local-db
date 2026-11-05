/**
 * @file
 * 도면·칸·범례에서 재료 전체·기한주의·경과 건수를 같은 원형 배지로 표시한다.
 * 집계는 호출자가 전달하며, 본체는 줄을 나누고 포켓은 전면 폭에 맞춰 배지 크기를 조절한다.
 */
import { StyleSheet, Text, View } from 'react-native';
import type { IngredientCounts } from '@/features/ingredient/model/ingredient';
import { colors, ingredientBadgeColors } from '@/theme/tokens';

export const INGREDIENT_BADGE_SIZE = 28;

/** 색을 구별하지 못하는 경우에도 실제 건수와 기한 상태를 함께 안내한다. */
export function getIngredientCountLabel(counts: IngredientCounts) {
  return `재료 ${counts.total}건${counts.warning > 0 ? `, 기한주의 ${counts.warning}건` : ''}${counts.expired > 0 ? `, 경과 ${counts.expired}건` : ''}`;
}

export function IngredientCountBadge({ count, kind, compact = false }: { count?: number; kind: keyof IngredientCounts; compact?: boolean }) {
  return (
    <View style={[styles.badge, compact && styles.compactBadge, { backgroundColor: ingredientBadgeColors[kind] }]}>
      {count !== undefined ? (
        <Text style={styles.count} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.2}>{count > 99 ? '99+' : count}</Text>
      ) : null}
    </View>
  );
}

export function IngredientCountBadges({ counts, compact = false }: { counts: IngredientCounts; compact?: boolean }) {
  if (counts.total === 0) return null;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.center}>
      <View style={[styles.badges, compact && styles.compactBadges]}>
        {(['total', 'warning', 'expired'] as const).filter(kind => counts[kind] > 0).map(kind => (
          <IngredientCountBadge key={kind} count={counts[kind]} kind={kind} compact={compact} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  badges: { maxWidth: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 },
  compactBadges: { flexWrap: 'nowrap' },
  badge: { width: INGREDIENT_BADGE_SIZE, height: INGREDIENT_BADGE_SIZE, borderRadius: INGREDIENT_BADGE_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  compactBadge: { height: 'auto', aspectRatio: 1, flexShrink: 1 },
  count: { color: colors.buttonText, fontSize: 11, lineHeight: 16, fontWeight: '700', fontVariant: ['tabular-nums'], includeFontPadding: false },
});
