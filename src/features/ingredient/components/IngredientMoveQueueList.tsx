/**
 * @file
 * 임시이동목록의 재료를 출발 위치별로 묶어 수량·유통기한과 함께 표시한다.
 * 선택한 항목은 임시이동목록에서만 제거한다.
 */
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { BottomSheetSectionList } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { EmptyListState } from '@/components/EmptyListState';
import { getPositionName } from '@/features/fridge/model/fridgeLayout';
import type { FridgeLayout } from '@/features/fridge/model/fridgeLayout';
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import { getIngredientExpirationStatus } from '@/features/ingredient/model/ingredient';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useTranslation } from '@/i18n/LanguageProvider';
import { formatDate } from '@/i18n/translations';
import { COMPACT_HEADER_ICON_INSET, COMPACT_HEADER_ICON_SIZE, getCompactHeaderStyles } from '@/theme/headerStyles';

export function useMoveQueueSelection() {
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  return { selectedIds, setSelectedIds };
}

type QueueSelection = ReturnType<typeof useMoveQueueSelection>;

export function IngredientMoveQueueHeader({ ingredients, selection, disabled, onBack }: {
  ingredients: Ingredient[];
  selection: QueueSelection;
  disabled: boolean;
  onBack?: () => void;
}) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const { selectedIds, setSelectedIds } = selection;
  const allSelected = ingredients.length > 0 && ingredients.every(item => selectedIds?.includes(item.id));

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {onBack ? (
          <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t('ingredient.back')}
            disabled={disabled} onPress={onBack} style={styles.headerButton}>
            <MaterialDesignIcons name="arrow-left" size={COMPACT_HEADER_ICON_SIZE} color={colors.text} accessible={false} />
          </FeedbackPressable>
        ) : null}
        <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t(selectedIds ? 'ingredient.selectAll' : 'ingredient.select')}
          accessibilityState={{ disabled: disabled || ingredients.length === 0, ...(selectedIds ? { selected: allSelected } : {}) }}
          disabled={disabled || ingredients.length === 0} style={styles.headerButton}
          onPress={() => setSelectedIds(selectedIds && !allSelected ? ingredients.map(item => item.id) : [])}>
          <MaterialDesignIcons name={selectedIds ? 'check-all' : 'check'} size={COMPACT_HEADER_ICON_SIZE}
            color={allSelected ? colors.chilled : colors.text} accessible={false} />
        </FeedbackPressable>
      </View>
      <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
        style={styles.title}>{t('queue.title', { count: ingredients.length })}</Text>
      <View style={styles.headerRight}>
        {selectedIds ? (
          <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t('ingredient.cancelSelection')}
            disabled={disabled} onPress={() => setSelectedIds(null)} style={styles.headerButton}>
            <MaterialDesignIcons name="close" size={COMPACT_HEADER_ICON_SIZE} color={colors.text} accessible={false} />
          </FeedbackPressable>
        ) : null}
      </View>
    </View>
  );
}

interface IngredientMoveQueueListProps {
  ingredients: Ingredient[];
  layout: FridgeLayout;
  disabled: boolean;
  selection: QueueSelection;
  onRemove: (id: string) => void;
}

export function IngredientMoveQueueList({ ingredients, layout, disabled, selection, onRemove }: IngredientMoveQueueListProps) {
  const { mode, colors, ingredientBadgeColors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const removalPending = useRef(false);
  const { selectedIds, setSelectedIds } = selection;
  const targets = ingredients.filter(item => selectedIds?.includes(item.id));

  function requestRemoval() {
    if (disabled || targets.length === 0 || removalPending.current) return;
    removalPending.current = true;
    Alert.alert(t('common.warning'), t('queue.deleteSelectedConfirm', { count: targets.length }), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => { removalPending.current = false; } },
      { text: t('common.delete'), style: 'destructive', onPress: () => {
        if (!removalPending.current) return;
        removalPending.current = false;
        for (const item of targets) onRemove(item.id);
        setSelectedIds(null);
      } },
    ], { cancelable: false });
  }
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
    <>
      <BottomSheetSectionList sections={sections} extraData={selectedIds} keyExtractor={item => item.id} stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator indicatorStyle={mode === 'dark' ? 'white' : 'black'} automaticallyAdjustsScrollIndicatorInsets={false}
        scrollIndicatorInsets={{ top: 0, bottom: spacing.md + (selectedIds ? 0 : insets.bottom), left: 0, right: spacing.xs }}
        style={styles.list} contentContainerStyle={[ingredients.length === 0 ? styles.empty : undefined, { paddingBottom: selectedIds ? 0 : insets.bottom }]}
        ListEmptyComponent={<EmptyListState message={t('queue.emptyTitle')} description={t('queue.emptyGuide')} />}
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
          const checked = selectedIds?.includes(item.id) ?? false;
          const details = (
            <View style={styles.labels}>
              <Text style={styles.name}>{item.name}<Text style={styles.quantity}>  {item.quantity}</Text></Text>
              {item.memo ? <Text style={styles.detail}>{item.memo}</Text> : null}
              <Text style={[styles.detail, item.expirationDate !== null && {
                color: ingredientBadgeColors[expiration.isExpired ? 'expired' : expiration.isUrgent ? 'warning' : 'normal'],
              }]}>{item.expirationDate ? t('ingredient.expirationLabel', { date: formatDate(item.expirationDate, t) }) : t('ingredient.noExpiration')}</Text>
            </View>
          );
          return selectedIds ? (
            <FeedbackPressable accessibilityRole="checkbox" accessibilityLabel={t('ingredient.selectItem', { name: item.name })}
              accessibilityHint={section.title} accessibilityValue={{ text: `${item.quantity}, ${expiration.label}` }}
              accessibilityState={{ checked, disabled }} disabled={disabled} feedback="none"
              onPress={() => setSelectedIds(current => current && (current.includes(item.id)
                ? current.filter(id => id !== item.id) : [...current, item.id]))}
              style={[styles.item, checked && styles.selectedItem]}>
              <View style={styles.selectionCircleContainer}>
                {checked ? <MaterialDesignIcons name="checkbox-marked-circle" size={24} color={colors.chilled} accessible={false} />
                  : <View style={styles.selectionCircle} />}
              </View>
              {details}
            </FeedbackPressable>
          ) : <View style={styles.item}>{details}</View>;
        }} />
      {selectedIds ? (
        <View style={[styles.selectionToolbar, { height: 50 + insets.bottom, paddingBottom: insets.bottom }]}>
          <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('queue.deleteSelected')} feedback="none"
            disabled={disabled || targets.length === 0} accessibilityState={{ disabled: disabled || targets.length === 0 }}
            onPress={requestRemoval} style={styles.selectionAction}>
            {({ pressed }) => <>
              <MaterialDesignIcons name="trash-can-outline" size={24} color={pressed ? colors.errorPressed : colors.error} accessible={false} />
              <Text style={[styles.deleteLabel, pressed && { color: colors.errorPressed }]}>{t('common.delete')}</Text>
            </>}
          </FeedbackPressable>
        </View>
      ) : null}
    </>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  header: { ...getCompactHeaderStyles(mode).header, gap: 0 },
  title: { ...getCompactHeaderStyles(mode).title, flex: 1, textAlign: 'center' },
  headerLeft: { flexDirection: 'row', marginLeft: -COMPACT_HEADER_ICON_INSET },
  headerRight: { width: 48, marginRight: -COMPACT_HEADER_ICON_INSET },
  headerButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
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
  selectedItem: { backgroundColor: colors.chilledBackground },
  selectionCircleContainer: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  selectionCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.textMuted },
  selectionToolbar: { flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  selectionAction: { flex: 1, minHeight: 48, paddingTop: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  deleteLabel: { color: colors.error, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  empty: { flexGrow: 1, justifyContent: 'center' },
}));
