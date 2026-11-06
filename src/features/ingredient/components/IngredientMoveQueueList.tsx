/**
 * @file
 * 임시이동목록의 재료를 출발 위치별로 묶어 수량·유통기한과 함께 표시한다.
 * 목록 해제는 호출자에게 전달하고, 재료 정보나 실제 보관 위치는 변경하지 않는다.
 */
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { getPositionName } from '@/features/fridge/model/fridgeLayout';
import type { FridgeLayout } from '@/features/fridge/model/fridgeLayout';
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import { colors, spacing } from '@/theme/tokens';

interface IngredientMoveQueueListProps {
  ingredients: Ingredient[];
  layout: FridgeLayout;
  disabled: boolean;
  onRemove: (id: string) => void;
}

export function IngredientMoveQueueList({ ingredients, layout, disabled, onRemove }: IngredientMoveQueueListProps) {
  const sections: { key: string; title: string; data: Ingredient[] }[] = [];
  for (const ingredient of ingredients) {
    const position = layout.positions.find(candidate => candidate.slotId === ingredient.slotId
      && (candidate.drawerNumber ?? 0) === ingredient.drawerNumber);
    const area = layout.areas.find(candidate => candidate.id === position?.areaId);
    const key = `${ingredient.slotId}:${ingredient.drawerNumber}`;
    let section = sections.find(candidate => candidate.key === key);
    if (!section) {
      // 문의 이름은 여는 방향이므로 실제 출발 위치는 단·영역 순서로 구분한다.
      const title = position && area
        ? `${area.compartment} → ${area.isBody ? '본체' : '도어포켓'} → ${getPositionName(position)}`
        : '보관 위치를 확인해 주세요.';
      section = { key, title, data: [] };
      sections.push(section);
    }
    section.data.push(ingredient);
  }

  return (
    <SectionList sections={sections} keyExtractor={item => item.id} stickySectionHeadersEnabled={false}
      style={styles.list} contentContainerStyle={ingredients.length === 0 ? styles.empty : undefined}
      ListHeaderComponent={ingredients.length > 0 ? <Text style={styles.guide}>출발 위치별 목록입니다. 단·칸은 위에서부터, 같은 단의 영역은 왼쪽부터 셉니다.</Text> : undefined}
      ListEmptyComponent={<View style={styles.emptyContent}>
        <MaterialDesignIcons name="clipboard-outline" size={40} color={colors.textMuted} accessible={false} />
        <Text style={styles.emptyTitle}>이동 대기 중인 재료가 없어요</Text>
        <Text style={styles.guide}>재료 목록에서 왼쪽으로 밀어 담을 수 있어요.</Text>
      </View>}
      renderSectionHeader={({ section }) => <Text accessibilityRole="header" style={styles.location}>{section.title}</Text>}
      renderItem={({ item, section }) => (
        <View style={styles.item}>
          <View style={styles.labels}>
            <Text style={styles.name}>{item.name}<Text style={styles.quantity}>  {item.quantity}</Text></Text>
            <Text style={styles.detail}>{item.expirationDate ? `유통기한 ${item.expirationDate}` : '유통기한 미입력'}</Text>
            {item.memo ? <Text style={styles.detail}>{item.memo}</Text> : null}
          </View>
          <FeedbackPressable accessibilityRole="button" accessibilityLabel={`${item.name} 이동 대기 해제`}
            accessibilityHint={`${section.title}, ${item.quantity}, ${item.expirationDate ?? '유통기한 미입력'}`}
            disabled={disabled} accessibilityState={{ disabled }} onPress={() => { if (!disabled) onRemove(item.id); }} style={styles.remove}>
            <MaterialDesignIcons name="close" size={22} color={colors.textMuted} accessible={false} />
          </FeedbackPressable>
        </View>
      )} />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  guide: { color: colors.textMuted, fontSize: 13, lineHeight: 20, padding: spacing.md },
  location: { color: colors.chilled, fontSize: 14, lineHeight: 21, fontWeight: '600',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.chilledBackground },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  labels: { flex: 1, gap: spacing.xs },
  name: { color: colors.text, fontSize: 17, fontWeight: '600' },
  quantity: { fontWeight: '400' },
  detail: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
  remove: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  empty: { flexGrow: 1, justifyContent: 'center' },
  emptyContent: { alignItems: 'center', padding: spacing.lg },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center', marginTop: spacing.sm },
});
