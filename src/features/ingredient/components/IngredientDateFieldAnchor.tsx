/**
 * @file
 * 재료 날짜 입력 영역의 화면 좌표를 측정해 달력 팝업에 전달한다.
 * 네이티브 시트의 별도 좌표계는 플랫폼별 구현에서 처리한다.
 */
import { type ComponentRef, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutRectangle } from 'react-native';

export interface IngredientDateFieldAnchorProps {
  onMeasure: (frame: LayoutRectangle) => void;
}

export function IngredientDateFieldAnchor({ onMeasure }: IngredientDateFieldAnchorProps) {
  const anchor = useRef<ComponentRef<typeof View>>(null);

  return <View ref={anchor} collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}
    onLayout={() => anchor.current?.measureInWindow((x, y, width, height) => onMeasure({ x, y, width, height }))} />;
}
