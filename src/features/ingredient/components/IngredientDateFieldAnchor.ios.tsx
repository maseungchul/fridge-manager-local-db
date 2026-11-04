/**
 * @file
 * SwiftUI에서 날짜 입력 영역의 실제 화면 위치와 폭을 측정한다.
 * 시트 내부를 원점으로 삼는 React Native 측정값을 전체 화면 팝업에 사용하지 않는다.
 */
import { Host, Spacer } from '@expo/ui/swift-ui';
import { accessibilityHidden, frame, onGeometryChange } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';
import type { IngredientDateFieldAnchorProps } from './IngredientDateFieldAnchor';

export function IngredientDateFieldAnchor({ onMeasure }: IngredientDateFieldAnchorProps) {
  return (
    <Host style={StyleSheet.absoluteFill} pointerEvents="none" ignoreSafeArea="all">
      <Spacer minLength={0} modifiers={[
        frame({ maxWidth: Infinity, maxHeight: Infinity }), accessibilityHidden(true), onGeometryChange(onMeasure),
      ]} />
    </Host>
  );
}
