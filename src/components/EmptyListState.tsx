/**
 * @file
 * 빈 목록 문구와 터치로 문을 열고 닫을 수 있는 냉장고 캐릭터를 표시한다.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { useTranslation } from '@/i18n/LanguageProvider';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

const CHARACTER_SCALE = 0.9;
const OPEN_DOOR_WIDTH = 44 * CHARACTER_SCALE;

interface EmptyListStateProps {
  message: string;
  description: string;
}

export function EmptyListState({ message, description }: EmptyListStateProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // 화면이 뒤에 남아 있어도 다시 돌아올 때는 닫힌 상태로 시작한다.
  useFocusEffect(useCallback(() => () => setIsOpen(false), []));

  return (
    <View style={styles.container}>
      <FeedbackPressable feedback="none" accessibilityRole="button" accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={t(isOpen ? 'fridge.characterClose' : 'fridge.characterOpen')}
        onPress={() => setIsOpen(open => !open)} style={[styles.characterContainer, isOpen && styles.openCharacter]}>
        {isOpen ? (
          <Image source={require('../../assets/fridge-character-open.svg')} style={styles.openImage} contentFit="fill"
            svgVariables={{ '--fridge-line': colors.chilled, '--fridge-fill': colors.chilledBackground }}
            accessible={false} pointerEvents="none" />
        ) : (
          <View style={styles.character} pointerEvents="none">
            <View style={styles.fridge}>
              <View style={styles.divider} />
              <View style={[styles.handle, styles.upperHandle]} />
              <View style={[styles.handle, styles.lowerHandle]} />
              <View style={styles.eyes}><View style={styles.eye} /><View style={styles.eye} /></View>
            </View>
          </View>
        )}
      </FeedbackPressable>
      <View style={styles.messageContainer}>
        <Text style={styles.message}>{message}</Text>
        {isOpen ? <Text style={styles.description}>{description}</Text> : null}
      </View>
    </View>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  container: { alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  characterContainer: { width: 63, height: 91, alignItems: 'center', justifyContent: 'center' },
  // 열린 문만 오른쪽으로 늘려 본체의 중심과 문구 위치를 유지한다.
  openCharacter: { width: 63 + OPEN_DOOR_WIDTH, transform: [{ translateX: OPEN_DOOR_WIDTH / 2 }] },
  openImage: { width: '100%', height: 101 * CHARACTER_SCALE },
  character: { width: 70, height: 101, transform: [{ scale: CHARACTER_SCALE }] },
  fridge: { position: 'absolute', top: 0, width: 70, height: 94, borderWidth: 1.7, borderColor: colors.chilled, borderRadius: 15, backgroundColor: colors.chilledBackground, overflow: 'hidden' },
  divider: { position: 'absolute', top: 43, left: 0, right: 0, height: 1.7, backgroundColor: colors.chilled },
  handle: { position: 'absolute', left: 6, width: 6, height: 13, borderWidth: 1.4, borderColor: colors.chilled, borderRadius: 4 },
  upperHandle: { top: 24 },
  lowerHandle: { top: 51 },
  eyes: { position: 'absolute', top: 19, left: 19, right: 14, flexDirection: 'row', justifyContent: 'space-between' },
  eye: { width: 5.5, height: 5.5, borderRadius: 3, backgroundColor: colors.chilled },
  message: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  messageContainer: { alignSelf: 'stretch' },
  description: { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: spacing.sm, color: colors.textMuted, fontSize: 14, textAlign: 'center' },
}));
