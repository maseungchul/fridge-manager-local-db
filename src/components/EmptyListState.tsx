/**
 * @file
 * 빈 목록의 아이콘과 문구를 일관되게 표시한다.
 */
import { StyleSheet, Text, View } from 'react-native';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

interface EmptyListStateProps {
  message: string;
}

export function EmptyListState({ message }: EmptyListStateProps) {
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  return <View style={styles.container}>
    <View style={styles.characterContainer} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={styles.character}>
      <View style={styles.feet}><View style={styles.foot} /><View style={styles.foot} /></View>
      <View style={styles.fridge}>
        <View style={styles.divider} />
        <View style={[styles.handle, styles.upperHandle]} />
        <View style={[styles.handle, styles.lowerHandle]} />
        <View style={styles.eyes}><View style={styles.eye} /><View style={styles.eye} /></View>
      </View>
      </View>
    </View>
    <Text style={styles.message}>{message}</Text>
  </View>;
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  container: { alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  characterContainer: { width: 63, height: 91, alignItems: 'center', justifyContent: 'center' },
  character: { width: 70, height: 101, transform: [{ scale: 0.9 }] },
  feet: { position: 'absolute', bottom: 0, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between' },
  foot: { width: 10, height: 9, borderWidth: 1.7, borderColor: colors.chilled, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  fridge: { position: 'absolute', top: 0, width: 70, height: 94, borderWidth: 1.7, borderColor: colors.chilled, borderRadius: 15, backgroundColor: colors.chilledBackground, overflow: 'hidden' },
  divider: { position: 'absolute', top: 43, left: 0, right: 0, height: 1.7, backgroundColor: colors.chilled },
  handle: { position: 'absolute', left: 6, width: 6, height: 13, borderWidth: 1.4, borderColor: colors.chilled, borderRadius: 4 },
  upperHandle: { top: 24 },
  lowerHandle: { top: 51 },
  eyes: { position: 'absolute', top: 19, left: 19, right: 14, flexDirection: 'row', justifyContent: 'space-between' },
  eye: { width: 5.5, height: 5.5, borderRadius: 3, backgroundColor: colors.chilled },
  message: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
}));
