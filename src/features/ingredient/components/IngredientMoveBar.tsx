/**
 * @file
 * 네이티브 탭의 배치를 유지한 채 같은 하단 영역에 재료 이동 안내를 표시한다.
 * 도면의 크기·표시 영역과 분리해 하단 안내의 표시와 입력만 전환한다.
 */
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { colors, spacing } from '@/theme/tokens';

export interface IngredientMoveBarState {
  name: string;
  quantity: string;
  isSaving: boolean;
  onCancel: () => void;
}

export function IngredientMoveBar({ move }: { move: IngredientMoveBarState | null }) {
  const insets = useSafeAreaInsets();
  const content = (
    <View pointerEvents={move ? 'auto' : 'none'}
      accessibilityElementsHidden={!move} importantForAccessibility={move ? 'auto' : 'no-hide-descendants'}
      style={[styles.bar, { paddingBottom: insets.bottom + spacing.sm,
        paddingLeft: insets.left + spacing.md, paddingRight: insets.right + spacing.md }, !move && styles.hidden]}>
      <View style={styles.content}>
        <View style={styles.labels} accessibilityLiveRegion={move ? 'polite' : 'none'}>
          <Text style={styles.name} numberOfLines={1}>{move ? `${move.name} ${move.quantity}` : ' '}</Text>
          <Text style={styles.instruction}>이동할 칸을 선택하세요.</Text>
        </View>
        <FeedbackPressable accessibilityRole="button" accessibilityLabel="재료 이동 취소"
          accessibilityState={{ disabled: !move || move.isSaving }} disabled={!move || move.isSaving}
          onPress={() => { if (move && !move.isSaving) move.onCancel(); }} style={styles.cancel}>
          <View style={styles.icon}>
            <MaterialDesignIcons name="close" size={18} color={colors.text} accessible={false} style={move?.isSaving && styles.hidden} />
            <ActivityIndicator color={colors.chilled} animating={!!move?.isSaving} style={[StyleSheet.absoluteFill, !move?.isSaving && styles.hidden]}
              accessibilityElementsHidden={!move?.isSaving} importantForAccessibility={move?.isSaving ? 'auto' : 'no-hide-descendants'}
              accessibilityLabel="재료 이동 중" />
          </View>
          <Text style={styles.cancelLabel}>이동 취소</Text>
        </FeedbackPressable>
      </View>
    </View>
  );
  // iOS 탭은 화면 콘텐츠보다 위에 그려지므로 창 레이어에서 덮고, 도면 쪽 터치는 통과시킨다.
  return Platform.OS === 'ios'
    ? <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>{content}</FullWindowOverlay>
    : content;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 50,
    paddingTop: spacing.sm, backgroundColor: colors.background },
  content: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  labels: { flex: 1 },
  name: { color: colors.text, fontSize: 15, lineHeight: 22 },
  instruction: { color: colors.text, fontSize: 15, lineHeight: 22 },
  cancel: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: 22, backgroundColor: colors.background },
  cancelLabel: { color: colors.text, fontSize: 14, lineHeight: 20 },
  icon: { width: 18, height: 18 },
  hidden: { opacity: 0 },
});
