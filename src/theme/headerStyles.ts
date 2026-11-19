/**
 * @file
 * 화면과 재료 시트의 상단 헤더 간격·제목 스타일·기본 높이를 공유한다.
 * 시스템 안전 영역과 시트 손잡이는 각 화면에서 별도로 관리한다.
 */
import { StyleSheet } from 'react-native';
import { createThemedStyles, spacing } from '@/theme/tokens';

export const HEADER_CONTENT_HEIGHT = 48;
export const HEADER_HEIGHT = HEADER_CONTENT_HEIGHT + spacing.xs * 2 + StyleSheet.hairlineWidth;
export const HEADER_ICON_SIZE = 28;
export const HEADER_ICON_INSET = (HEADER_CONTENT_HEIGHT - HEADER_ICON_SIZE) / 2;
export const COMPACT_HEADER_ICON_SIZE = 24;
export const COMPACT_HEADER_ICON_INSET = (HEADER_CONTENT_HEIGHT - COMPACT_HEADER_ICON_SIZE) / 2;
export const COMPACT_HEADER_TITLE_SIZE = 18;
export const COMPACT_HEADER_TITLE_LINE_HEIGHT = 24;
const COMPACT_HEADER_TOP_PADDING = 4;
const COMPACT_HEADER_BOTTOM_PADDING = 0;

export const getHeaderStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  header: {
    minHeight: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: '700', includeFontPadding: false },
}));

/** 하위 화면과 시트의 헤더를 줄이면서 버튼 터치 영역은 유지한다. */
export const getCompactHeaderStyles = createThemedStyles((_, mode) => {
  const { header, title } = getHeaderStyles(mode);
  return StyleSheet.create({
    header: { ...header, minHeight: HEADER_CONTENT_HEIGHT + COMPACT_HEADER_TOP_PADDING + COMPACT_HEADER_BOTTOM_PADDING + StyleSheet.hairlineWidth,
      paddingTop: COMPACT_HEADER_TOP_PADDING, paddingBottom: COMPACT_HEADER_BOTTOM_PADDING },
    title: { ...title, fontSize: COMPACT_HEADER_TITLE_SIZE, lineHeight: COMPACT_HEADER_TITLE_LINE_HEIGHT },
  });
});
