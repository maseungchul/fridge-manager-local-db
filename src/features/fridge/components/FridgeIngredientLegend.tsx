/**
 * @file
 * 홈과 열린 도면의 재료 배지·냉장·냉동 아이콘을 화면 중앙의 범례 팝업으로 설명한다.
 * 냉장·냉동을 먼저 표시하고, 제목 아래의 제한된 영역에서 설명을 스크롤한다.
 * 표시 상태는 홈에서 관리하며, 팝업 바깥 터치·뒤로가기·접근성 닫기를 함께 처리한다.
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INGREDIENT_BADGE_SIZE, IngredientCountBadge } from '@/features/ingredient/components/IngredientCountBadges';
import { DoorModeArt } from '@/features/fridge/components/FridgeMap';
import { colors, spacing } from '@/theme/tokens';

const legendItems = [
  { storageMode: 'CHILLED', title: '냉장' },
  { storageMode: 'FROZEN', title: '냉동' },
  { kind: 'normal', title: '일반', description: '주의·경과를 제외한 재료 수 (유통기한 미입력 포함)' },
  { kind: 'warning', title: '주의', description: '유통기한이 2일 이내로 남은 재료 수 (당일 포함)' },
  { kind: 'expired', title: '경과', description: '유통기한이 지난 재료 수' },
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
        {/* 바깥 닫기는 뒤쪽 형제 레이어에 맡기고, 팝업은 목록의 스크롤 제스처를 가로채지 않는다. */}
        <View style={styles.popup}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>배지 범례</Text>
          </View>
          {/* 밝은 팝업에서 표시줄이 보이도록 검은색을 지정하고, 자체 여백으로 둥근 모서리에서 떨어뜨린다. */}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false} showsVerticalScrollIndicator
            indicatorStyle="black" automaticallyAdjustsScrollIndicatorInsets={false}
            scrollIndicatorInsets={{ top: 0, bottom: spacing.md, left: 0, right: spacing.xs }}>
            {legendItems.map(item => (
              <View key={item.title} style={styles.item} accessible
                accessibilityLabel={'description' in item ? `${item.title}, ${item.description}` : item.title}>
                <View style={styles.itemHeader}>
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    {'kind' in item ? <IngredientCountBadge kind={item.kind} />
                      : <DoorModeArt storageMode={item.storageMode} size={22} style={styles.modeIcon} />}
                  </View>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                </View>
                {'description' in item ? <Text style={styles.itemDescription}>{item.description}</Text> : null}
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
  popup: { width: '100%', maxWidth: 360, height: 340, maxHeight: '100%', borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden' },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs * 3 },
  scroll: { flex: 1, minHeight: 0 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.lg },
  title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  item: { gap: 4 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  modeIcon: { position: 'relative', top: 0, left: 0, width: INGREDIENT_BADGE_SIZE, height: INGREDIENT_BADGE_SIZE,
    alignItems: 'center', justifyContent: 'center' },
  itemTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  itemDescription: { marginLeft: INGREDIENT_BADGE_SIZE + spacing.md, color: colors.textMuted, fontSize: 14, lineHeight: 21 },
});
