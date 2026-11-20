/**
 * @file
 * 날짜·시각 선택기를 안전 영역 안의 중앙 팝업으로 표시한다.
 * 팝업 바깥 터치와 시스템·접근성 닫기를 호출자가 전달한 동작으로 연결한다.
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/ThemeProvider';
import { createThemedStyles, spacing } from '@/theme/tokens';

interface CenteredPickerPopupProps {
  children: ReactNode;
  dismissLabel: string;
  dismissDisabled?: boolean;
  edgeToEdge?: boolean;
  onDismiss: () => void;
}

export function CenteredPickerPopup({ children, dismissLabel, dismissDisabled = false, edgeToEdge = false, onDismiss }: CenteredPickerPopupProps) {
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  const insets = useSafeAreaInsets();

  function dismiss() {
    if (!dismissDisabled) onDismiss();
  }

  return (
    <Modal transparent visible animationType="fade" presentationStyle="overFullScreen"
      statusBarTranslucent navigationBarTranslucent onRequestClose={dismiss}>
      <View style={[styles.overlay, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md,
        paddingLeft: insets.left + spacing.md, paddingRight: insets.right + spacing.md }]}
        accessibilityViewIsModal onAccessibilityEscape={dismiss}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={dismissLabel}
          accessibilityState={{ disabled: dismissDisabled }} disabled={dismissDisabled} onPress={dismiss} />
        <View style={styles.popup}>
          <ScrollView style={styles.scroll} contentContainerStyle={edgeToEdge ? undefined : styles.content} bounces={false}
            nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  popup: { width: '100%', maxWidth: 360, maxHeight: '100%', borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: spacing.md },
}));
