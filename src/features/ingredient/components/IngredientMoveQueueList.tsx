/**
 * @file
 * 임시이동목록의 재료를 출발 위치별로 묶어 수량·유통기한과 함께 표시한다.
 * 목록 해제는 호출자에게 전달하고, 재료 정보나 실제 보관 위치는 변경하지 않는다.
 */
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheetSectionList } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { getPositionName } from '@/features/fridge/model/fridgeLayout';
import type { FridgeLayout } from '@/features/fridge/model/fridgeLayout';
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import { getIngredientExpirationStatus } from '@/features/ingredient/model/ingredient';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useTranslation } from '@/i18n/LanguageProvider';
import { formatDate } from '@/i18n/translations';

interface IngredientMoveQueueListProps {
  ingredients: Ingredient[];
  layout: FridgeLayout;
  disabled: boolean;
  onRemove: (id: string) => void;
}

export function IngredientMoveQueueList({ ingredients, layout, disabled, onRemove }: IngredientMoveQueueListProps) {
  const { mode, colors, ingredientBadgeColors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sections: { key: string; title: string; path: string[]; data: Ingredient[] }[] = [];
  for (const ingredient of ingredients) {
    const position = layout.positions.find(candidate => candidate.slotId === ingredient.slotId
      && (candidate.drawerNumber ?? 0) === ingredient.drawerNumber);
    const area = layout.areas.find(candidate => candidate.id === position?.areaId);
    const key = `${ingredient.slotId}:${ingredient.drawerNumber}`;
    let section = sections.find(candidate => candidate.key === key);
    if (!section) {
      // 문의 이름은 여는 방향이므로 실제 출발 위치는 단·영역 순서로 구분한다.
      const slotIndex = layout.positions.filter(candidate => candidate.areaId === area?.id)
        .filter((candidate, index, positions) => positions.findIndex(other => other.slotId === candidate.slotId) === index)
        .findIndex(candidate => candidate.slotId === position?.slotId);
      const path = position && area
        ? [area.compartment, area.isBody ? t('fridge.body') : t('fridge.doorPocket'), getPositionName({ ...position, name: t('fridge.shortSlotName', { index: slotIndex + 1 }) }, t)]
        : [t('queue.locationMissing')];
      section = { key, title: path.join(' → '), path, data: [] };
      sections.push(section);
    }
    section.data.push(ingredient);
  }

  return (
    <BottomSheetSectionList sections={sections} keyExtractor={item => item.id} stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator indicatorStyle={mode === 'dark' ? 'white' : 'black'} automaticallyAdjustsScrollIndicatorInsets={false}
      scrollIndicatorInsets={{ top: 0, bottom: spacing.md + insets.bottom, left: 0, right: spacing.xs }}
      style={styles.list} contentContainerStyle={[ingredients.length === 0 ? styles.empty : undefined, { paddingBottom: insets.bottom }]}
      ListEmptyComponent={<View style={styles.emptyContent}>
        <MaterialDesignIcons name="clipboard-outline" size={40} color={colors.textMuted} accessible={false} />
        <Text style={styles.emptyTitle}>{t('queue.emptyTitle')}</Text>
        <Text style={styles.guide}>{t('queue.emptyDescription')}</Text>
      </View>}
      renderSectionHeader={({ section }) => (
        <View accessible accessibilityRole="header" accessibilityLabel={section.path.join(', ')} style={styles.location}>
          {section.path.map((part, index) => (
            <View key={index} style={styles.locationPart}>
              {index > 0 ? <MaterialDesignIcons name="menu-right" size={16} color={colors.chilled} accessible={false} /> : null}
              <Text style={styles.locationText}>{part}</Text>
            </View>
          ))}
        </View>
      )}
      renderItem={({ item, section }) => {
        const expiration = getIngredientExpirationStatus(item.expirationDate, undefined, t);
        return (
        <View style={styles.item}>
          <View style={styles.labels}>
            <Text style={styles.name}>{item.name}<Text style={styles.quantity}>  {item.quantity}</Text></Text>
            {item.memo ? <Text style={styles.detail}>{item.memo}</Text> : null}
            <Text style={[styles.detail, item.expirationDate !== null && {
              color: ingredientBadgeColors[expiration.isExpired ? 'expired' : expiration.isUrgent ? 'warning' : 'normal'],
            }]}>{item.expirationDate ? t('ingredient.expirationLabel', { date: formatDate(item.expirationDate, t) }) : t('ingredient.noExpiration')}</Text>
          </View>
          <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t('queue.remove', { name: item.name })}
            accessibilityHint={`${section.title}, ${item.quantity}, ${item.expirationDate ? formatDate(item.expirationDate, t) : t('ingredient.noExpiration')}`}
            disabled={disabled} accessibilityState={{ disabled }} onPress={() => { if (!disabled) onRemove(item.id); }} style={styles.remove}>
            <MaterialDesignIcons name="close" size={22} color={colors.textMuted} accessible={false} />
          </FeedbackPressable>
        </View>
        );
      }} />
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  list: { flex: 1 },
  guide: { color: colors.textMuted, fontSize: 13, lineHeight: 20, padding: spacing.md },
  location: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.chilledBackground },
  locationPart: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  locationText: { color: colors.chilled, fontSize: 14, lineHeight: 21, fontWeight: '600', flexShrink: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  labels: { flex: 1, gap: spacing.xs },
  name: { color: colors.text, fontSize: 17, fontWeight: '600' },
  quantity: { fontWeight: '400' },
  detail: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
  remove: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  empty: { flexGrow: 1, justifyContent: 'center' },
  emptyContent: { alignItems: 'center', padding: spacing.lg },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center', marginTop: spacing.sm },
}));
