/**
 * @file
 * 도면·칸의 기한 상태별 재료 건수를 호출자가 정한 위치에 묶어 표시한다.
 * 홈은 세로·내부는 가로로 상태색을 연결하고, 범례는 숫자 없이 큰 상태 아이콘을 사용한다.
 */
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import type { IngredientCounts } from '@/features/ingredient/model/ingredient';
import { useAppTheme } from '@/theme/ThemeProvider';
import { defaultTranslate } from '@/i18n/translations';
import type { Translator } from '@/i18n/translations';

export const INGREDIENT_BADGE_SIZE = 28;
const BADGE_ROW_HEIGHT = 20;
const badgeKinds = ['normal', 'warning', 'expired', 'unknown'] as const;
const badgeIcons = { normal: 'circle-slice-1', warning: 'circle-slice-6', expired: 'circle-slice-8', unknown: 'help-circle-outline' } as const;

/** 색을 구별하지 못하는 경우에도 실제 건수와 기한 상태를 함께 안내한다. */
export function getIngredientCountLabel(counts: IngredientCounts, t: Translator = defaultTranslate) {
  return [t('counts.total', { count: counts.total }),
    ...(counts.normal > 0 ? [t('counts.normal', { count: counts.normal })] : []),
    ...(counts.warning > 0 ? [t('counts.warning', { count: counts.warning })] : []),
    ...(counts.expired > 0 ? [t('counts.expired', { count: counts.expired })] : []),
    ...(counts.unknown > 0 ? [t('counts.unknown', { count: counts.unknown })] : []),
  ].join(', ');
}

export function IngredientCountBadge({ count, kind, compact = false, style }: {
  count?: number; kind: typeof badgeKinds[number]; compact?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { colors, ingredientBadgeColors } = useAppTheme();
  const backgroundColor = ingredientBadgeColors[kind];
  const color = colors.badgeText;
  const iconSize = count === undefined ? 22 : compact ? 9 : 14;
  return (
    <View style={[styles.badge, styles.countBadge, count === undefined && styles.legendBadge, { backgroundColor }, style]}>
      <MaterialDesignIcons name={badgeIcons[kind]} size={iconSize} color={color}
        style={[styles.icon, { width: iconSize, height: iconSize, lineHeight: iconSize }]} accessible={false} />
      {count !== undefined ? (
        <Text style={[styles.count, compact && styles.compactCount, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.2}>{count > 99 ? '99+' : count}</Text>
      ) : null}
    </View>
  );
}

export function IngredientCountBadges({ counts, placement = 'center', direction = 'vertical', style }: {
  counts: IngredientCounts;
  placement?: 'center' | 'top-left' | 'top-right';
  direction?: 'vertical' | 'horizontal';
  style?: StyleProp<ViewStyle>;
}) {
  if (counts.total === 0) return null;
  const upper = placement !== 'center';
  const alignment = placement === 'top-right' ? 'flex-end' : 'flex-start';
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.center, upper && { alignItems: alignment, justifyContent: 'flex-start' }, style]}>
      {/* 바깥 묶음만 둥글게 잘라 0건 상태가 빠져도 양 끝 모양을 유지한다. */}
      <View style={[styles.badges, direction === 'horizontal' && styles.horizontalBadges]}>
        {badgeKinds.filter(kind => counts[kind] > 0).map(kind => (
          <IngredientCountBadge key={kind} count={counts[kind]} kind={kind} compact={direction === 'horizontal'}
            style={[styles.mergedBadge, direction === 'horizontal' && styles.horizontalBadge]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  badges: {
    maxWidth: '100%', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start',
    borderRadius: BADGE_ROW_HEIGHT / 2, overflow: 'hidden', gap: 1,
  },
  // 좁은 수납칸에서는 배지를 두 줄로 배치해 본체 너비에 영향을 주지 않는다.
  horizontalBadges: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', borderRadius: 0 },
  mergedBadge: { borderRadius: 0 },
  horizontalBadge: { width: 34, maxWidth: '48%', minHeight: 14, paddingHorizontal: 1, paddingVertical: 0, gap: 1, borderRadius: 3 },
  compactCount: { fontSize: 10 },
  // 홈·내부 칸 모두 같은 간격으로 아이콘과 숫자의 왼쪽을 맞춘다.
  badge: { minWidth: 0, minHeight: BADGE_ROW_HEIGHT, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 3 },
  countBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: BADGE_ROW_HEIGHT / 2 },
  legendBadge: {
    width: INGREDIENT_BADGE_SIZE, height: INGREDIENT_BADGE_SIZE, borderRadius: INGREDIENT_BADGE_SIZE / 2,
    paddingHorizontal: 2, justifyContent: 'center',
  },
  icon: { includeFontPadding: false, flexShrink: 0 },
  count: { flexShrink: 1, fontSize: 11, textAlignVertical: 'center', fontWeight: '700', fontVariant: ['tabular-nums'], includeFontPadding: false },
});
