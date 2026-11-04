/**
 * @file
 * Compose에서 날짜 입력 영역의 실제 화면 위치와 폭을 측정한다.
 * 시트 내부 좌표 대신 네이티브 창의 좌표를 전체 화면 팝업에 전달한다.
 */
import { Box, Host } from '@expo/ui/jetpack-compose';
import { fillMaxSize, onGloballyPositioned } from '@expo/ui/jetpack-compose/modifiers';
import { StyleSheet } from 'react-native';
import type { IngredientDateFieldAnchorProps } from './IngredientDateFieldAnchor';

export function IngredientDateFieldAnchor({ onMeasure }: IngredientDateFieldAnchorProps) {
  return (
    <Host style={StyleSheet.absoluteFill} pointerEvents="none" ignoreSafeAreaKeyboardInsets>
      <Box modifiers={[fillMaxSize(), onGloballyPositioned(onMeasure)]} />
    </Host>
  );
}
