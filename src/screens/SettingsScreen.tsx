/**
 * @file
 * 앱의 표시 언어를 선택하고 저장 실패 시 현재 언어로 안내한다.
 * 언어 상태·영구 저장은 공통 Provider에서 관리한다.
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
import { colors, spacing } from '@/theme/tokens';
import { HEADER_CONTENT_HEIGHT, HEADER_ICON_SIZE, headerStyles } from '@/theme/headerStyles';

type SettingsScreenProps = NativeStackScreenProps<MoreStackParamList, 'Settings'>;

const languages = Object.keys(languageNames) as AppLanguage[];

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { t, language, changeLanguage, isChangingLanguage } = useTranslation();

  async function selectLanguage(next: AppLanguage) {
    try {
      await changeLanguage(next);
    } catch {
      Alert.alert(t('common.error'), t('settings.languageSaveError'), [{ text: t('common.ok') }]);
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('more.back')}
          onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialDesignIcons name="arrow-left" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
        </FeedbackPressable>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{t('settings.language')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} alwaysBounceVertical={false}>
        <View style={styles.section}>
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingBottom: spacing.lg,
  },
  ...headerStyles,
  title: { ...headerStyles.title, flexShrink: 1 },
  backButton: { width: HEADER_CONTENT_HEIGHT, height: HEADER_CONTENT_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  content: { padding: spacing.lg },
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
});
