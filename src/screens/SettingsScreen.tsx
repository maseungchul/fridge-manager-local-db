/**
 * @file
 * 앱의 표시 언어와 화면 테마를 선택하고 저장 실패를 안내한다.
 * 설정 상태와 영구 저장은 각 공통 Provider에서 관리한다.
 */
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { SelectionCheck } from '@/components/SelectionCheck';
import { useTranslation } from '@/i18n/LanguageProvider';
import { languageNames } from '@/i18n/translations';
import type { AppLanguage } from '@/i18n/translations';
import type { MoreStackParamList } from '@/navigation/MoreStackNavigator';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { ThemePreference } from '@/theme/ThemeProvider';
import { HEADER_CONTENT_HEIGHT, HEADER_ICON_SIZE, getHeaderStyles } from '@/theme/headerStyles';

type SettingsScreenProps = NativeStackScreenProps<MoreStackParamList, 'Settings'>;

const languages = Object.keys(languageNames) as AppLanguage[];
const themes = { system: 'settings.themeSystem', light: 'settings.themeLight', dark: 'settings.themeDark' } as const;
const themeModes = Object.keys(themes) as ThemePreference[];

export function SettingsScreen({ navigation, route }: SettingsScreenProps) {
  const { mode, preference, colors, changeTheme, isChangingTheme } = useAppTheme();
  const styles = getStyles(mode);
  const { t, language, changeLanguage, isChangingLanguage } = useTranslation();
  const section = route?.params?.section ?? 'language';

  async function selectLanguage(next: AppLanguage) {
    try {
      await changeLanguage(next);
    } catch {
      Alert.alert(t('common.error'), t('settings.languageSaveError'), [{ text: t('common.ok') }]);
    }
  }

  async function selectTheme(next: ThemePreference) {
    try {
      await changeTheme(next);
    } catch {
      Alert.alert(t('common.error'), t('settings.themeSaveError'), [{ text: t('common.ok') }]);
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t('more.back')}
          onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialDesignIcons name="arrow-left" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
        </FeedbackPressable>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{t(section === 'language' ? 'settings.language' : 'settings.theme')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} alwaysBounceVertical={false}>
        {section === 'language' ? <View style={styles.section}>
          <Text style={styles.description}>{t('settings.languageDescription')}</Text>
          <View style={styles.options}>
            {languages.map(option => (
              <FeedbackPressable key={option} accessibilityRole="radio" accessibilityLabel={languageNames[option]}
                accessibilityLanguage={option === 'ko' ? 'ko-KR' : 'ja-JP'}
                accessibilityState={{ checked: language === option, disabled: isChangingLanguage }} disabled={isChangingLanguage}
                onPress={() => selectLanguage(option)} style={[styles.option, language === option && styles.selected]}>
                <Text style={styles.optionLabel}>{languageNames[option]}</Text>
                <SelectionCheck selected={language === option} />
              </FeedbackPressable>
            ))}
          </View>
        </View> : <View style={styles.section}>
          <View style={styles.options}>
            {themeModes.map(option => (
              <FeedbackPressable key={option} accessibilityRole="radio" accessibilityLabel={t(themes[option])}
                accessibilityState={{ checked: preference === option, disabled: isChangingTheme }} disabled={isChangingTheme}
                onPress={() => selectTheme(option)} style={[styles.option, preference === option && styles.selected]}>
                <Text style={styles.optionLabel}>{t(themes[option])}</Text>
                <SelectionCheck selected={preference === option} />
              </FeedbackPressable>
            ))}
          </View>
        </View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingBottom: spacing.lg,
  },
  ...getHeaderStyles(mode),
  header: { ...getHeaderStyles(mode).header, gap: 0 },
  title: { ...getHeaderStyles(mode).title, flexShrink: 1 },
  backButton: { width: HEADER_CONTENT_HEIGHT, height: HEADER_CONTENT_HEIGHT, marginLeft: -spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  content: { paddingHorizontal: spacing.md, paddingVertical: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  options: { gap: spacing.sm, marginTop: spacing.xs },
  option: {
    minHeight: 52,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.chilled, backgroundColor: colors.sageLight },
  optionLabel: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 24 },
}));
