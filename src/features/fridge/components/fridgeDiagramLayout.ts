/**
 * @file
 * 등록·편집 화면의 헤더·단계 표시·툴바 치수로 도면의 공통 크기 기준을 계산한다.
 * 홈도 같은 기준을 사용하며, 실제 표시 위치와 스크롤 영역은 각 화면이 관리한다.
 */
import { StyleSheet } from 'react-native';
import { spacing } from '@/theme/tokens';

export interface FridgeDiagramSize {
  width: number;
  height: number;
}

export const FRIDGE_HEADER_BUTTON_SIZE = 48;
export const FRIDGE_STEP_BADGE_SIZE = 28;
export const FRIDGE_TOOLBAR_ACTION_HEIGHT = 56;
export const FRIDGE_SUBMENU_HEIGHT = 82;
export const FRIDGE_SUBMENU_BOTTOM_SPACE = 20;
export const FRIDGE_MENU_RESERVED_SPACE = FRIDGE_SUBMENU_HEIGHT + FRIDGE_SUBMENU_BOTTOM_SPACE + spacing.sm;

/** 화면별 남는 공간이 아니라 등록·편집의 같은 레이아웃을 기준으로 닫힘·열림 크기를 정한다. */
export function getFridgeDiagramSizes(window: FridgeDiagramSize, insets: { top: number; bottom: number; left: number; right: number }) {
  const width = Math.max(1, window.width - insets.left - insets.right);
  const headerHeight = FRIDGE_HEADER_BUTTON_SIZE + spacing.md + spacing.xs + StyleSheet.hairlineWidth;
  const stageHeight = window.height - insets.top - headerHeight;
  const stepHeight = FRIDGE_STEP_BADGE_SIZE + spacing.sm * 2;
  const toolbarHeight = FRIDGE_TOOLBAR_ACTION_HEIGHT + spacing.xs * 2 + StyleSheet.hairlineWidth;
  return {
    closed: {
      width: Math.max(1, width - spacing.lg * 2),
      height: Math.max(1, stageHeight - spacing.sm - spacing.lg - stepHeight - spacing.lg),
    },
    opened: {
      width,
      height: Math.max(1, stageHeight - toolbarHeight - insets.bottom - FRIDGE_MENU_RESERVED_SPACE),
    },
  };
}
