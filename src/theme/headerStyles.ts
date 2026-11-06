/**
 * @file
 * 화면과 재료 시트의 상단 헤더 간격·제목 스타일·기본 높이를 공유한다.
 * 시스템 안전 영역과 시트 손잡이는 각 화면에서 별도로 관리한다.
 */
import { StyleSheet } from 'react-native';
import { colors, spacing } from '@/theme/tokens';

export const HEADER_CONTENT_HEIGHT = 48;
export const HEADER_HEIGHT = HEADER_CONTENT_HEIGHT + spacing.xs * 2 + StyleSheet.hairlineWidth;
export const HEADER_ICON_SIZE = 28;

export const headerStyles = StyleSheet.create({
  header: {
    minHeight: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: '700', includeFontPadding: false },
});
