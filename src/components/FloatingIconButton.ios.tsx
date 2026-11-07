/**
 * @file
 * iOS의 도면 위 아이콘 버튼을 SwiftUI 시스템 버튼과 Material 아이콘으로 표시한다.
 * 위치·표시 문구·비활성화 상태·누름 동작은 호출하는 화면에서 관리한다.
 */
import { Button, Host, Label, RNHostView } from '@expo/ui/swift-ui';
import {
  accessibilityHint, accessibilityLabel, accessibilityValue, buttonBorderShape, buttonStyle, controlSize, disabled as disabledModifier,
} from '@expo/ui/swift-ui/modifiers';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { Platform, StyleSheet } from 'react-native';
import { colors } from '@/theme/tokens';
import type { FloatingIconButtonProps } from './FloatingIconButton';
import { useTranslation } from '@/i18n/LanguageProvider';

export function FloatingIconButton({ label, icon, accessibilityLabel: labelForAccessibility, accessibilityHint: hint, expanded, size = 'large', disabled, onPress, style }: FloatingIconButtonProps) {
  const { t } = useTranslation();
  return (
    <Host matchContents alignment="bottomLeading" ignoreSafeArea="all" style={style}>
      <Button onPress={onPress} modifiers={[
        buttonStyle(parseInt(String(Platform.Version), 10) >= 26 ? 'glass' : 'bordered'),
        buttonBorderShape('capsule'), controlSize(size), disabledModifier(disabled),
        accessibilityLabel(labelForAccessibility), ...(hint ? [accessibilityHint(hint)] : []),
        ...(expanded !== undefined ? [accessibilityValue(expanded ? t('common.expanded') : t('common.collapsed'))] : []),
      ]}>
        <Label title={label} icon={
          <RNHostView matchContents>
            <MaterialDesignIcons name={icon} size={size === 'small' ? 16 : 20} color={colors.text} accessible={false}
              pointerEvents="none" style={[styles.icon, size === 'small' && styles.smallIcon]} />
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
  smallIcon: { width: 16, height: 16, lineHeight: 16 },
});
