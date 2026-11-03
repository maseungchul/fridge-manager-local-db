/**
 * @file
 * iOS의 홈 이동 버튼을 SwiftUI 시스템 버튼과 Material 홈 아이콘으로 표시한다.
 * 위치·비활성화 상태·화면 종료 처리는 호출하는 화면에서 관리한다.
 */
import { Button, Host, Label, RNHostView } from '@expo/ui/swift-ui';
import {
  accessibilityHint, accessibilityLabel, buttonBorderShape, buttonStyle, controlSize, disabled as disabledModifier,
} from '@expo/ui/swift-ui/modifiers';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { Platform, StyleSheet } from 'react-native';
import { colors } from '@/theme/tokens';
import type { FridgeHomeButtonProps } from './FridgeHomeButton';

export function FridgeHomeButton({ disabled, onPress, style }: FridgeHomeButtonProps) {
  return (
    <Host matchContents alignment="bottomLeading" ignoreSafeArea="all" style={style}>
      <Button onPress={onPress} modifiers={[
        buttonStyle(parseInt(String(Platform.Version), 10) >= 26 ? 'glass' : 'bordered'),
        buttonBorderShape('capsule'), controlSize('large'), disabledModifier(disabled),
        accessibilityLabel('홈으로 이동'), accessibilityHint('저장하지 않은 편집을 종료하고 홈으로 이동합니다.'),
      ]}>
        <Label title="홈" icon={
          <RNHostView matchContents>
            <MaterialDesignIcons name="home" size={20} color={colors.text} accessible={false}
              pointerEvents="none" style={styles.icon} />
          </RNHostView>
        } />
      </Button>
    </Host>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 20,
    height: 20,
    lineHeight: 20,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
