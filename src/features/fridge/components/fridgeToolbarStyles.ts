/**
 * @file
 * 홈·등록·편집 툴바의 바탕과 아이콘·문구 버튼 배치를 공유한다.
 * 툴바의 높이 전환과 표시 조건은 각 화면에서 관리한다.
 */
import { StyleSheet } from 'react-native';
import { colors, spacing } from '@/theme/tokens';
import { FRIDGE_TOOLBAR_ACTION_HEIGHT } from '@/features/fridge/components/fridgeDiagramLayout';

export const fridgeToolbarStyles = StyleSheet.create({
  toolbar: {
    flexShrink: 0, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.toolbar,
  },
  actions: { flexDirection: 'row', gap: spacing.xs },
  action: {
    flex: 1, maxWidth: 110, minWidth: 0, minHeight: FRIDGE_TOOLBAR_ACTION_HEIGHT,
    alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  label: { flexShrink: 1, color: colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
