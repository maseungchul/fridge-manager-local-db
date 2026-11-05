/**
 * @file
 * 홈과 열린 도면의 재료 배지 세 가지를 화면 중앙의 범례 팝업으로 설명한다.
 * 표시 상태는 홈에서 관리하며, 팝업 바깥 터치·뒤로가기·접근성 닫기를 함께 처리한다.
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INGREDIENT_BADGE_SIZE, IngredientCountBadge } from '@/features/ingredient/components/IngredientCountBadges';
import { colors, spacing } from '@/theme/tokens';

const legendItems = [
  { kind: 'total', title: '재료 있음', description: '등록된 전체 재료 수' },
  { kind: 'warning', title: '유통기한 주의', description: '기한이 2일 이내로 남은 재료 수 (당일 포함)' },
  { kind: 'expired', title: '경과', description: '기한이 지난 재료 수' },
] as const;

export function FridgeIngredientLegend({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible animationType="fade" presentationStyle="overFullScreen"
      statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg,
        paddingLeft: insets.left + spacing.lg, paddingRight: insets.right + spacing.lg }]}
        accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="재료 배지 범례 닫기" onPress={onClose} />
        <View style={styles.popup} onStartShouldSetResponder={() => true}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false}>
            <Text accessibilityRole="header" style={styles.title}>재료 배지 범례</Text>
            {legendItems.map(item => (
              <View key={item.kind} style={styles.item} accessible accessibilityLabel={`${item.title}, ${item.description}`}>
                <View style={styles.itemHeader}>
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <IngredientCountBadge kind={item.kind} />
                  </View>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                </View>
                <Text style={styles.itemDescription}>{item.description}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  popup: { width: '100%', maxWidth: 360, maxHeight: '100%', borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden' },
  scroll: { flexGrow: 0 },
  content: { padding: spacing.lg, gap: spacing.lg },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  item: { gap: 4 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  itemDescription: { marginLeft: INGREDIENT_BADGE_SIZE + spacing.md, color: colors.textMuted, fontSize: 14, lineHeight: 21 },
});
