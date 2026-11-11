/**
 * @file
 * 홈·등록·편집의 아이콘·문구 버튼과 등록·편집 툴바 배치를 정의한다.
 * 툴바의 표시 방식과 조건은 각 화면에서 관리한다.
 */
import { StyleSheet } from 'react-native';
import { createThemedStyles, spacing } from '@/theme/tokens';
import { FRIDGE_TOOLBAR_ACTION_HEIGHT } from '@/features/fridge/components/fridgeDiagramLayout';

export const getFridgeToolbarStyles = createThemedStyles(({ colors }) => StyleSheet.create({
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
}));
