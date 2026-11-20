/**
 * @file
 * 앱의 표시 언어·화면 테마·유통기한 알림을 설정하고 저장 실패를 안내한다.
 * 설정 상태와 영구 저장은 각 공통 Provider에서 관리한다.
 */
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SelectionCheck } from '@/components/SelectionCheck';
import { TimePicker } from '@/components/TimePicker';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { supportsExpirationReminders, useExpirationReminder } from '@/features/ingredient/ExpirationReminderProvider';
import { ReminderLeadTimePicker } from '@/features/ingredient/components/ReminderLeadTimePicker';
import { formatReminderDaysBefore } from '@/features/ingredient/model/expirationReminder';
import { useTranslation } from '@/i18n/LanguageProvider';
import { languageNames } from '@/i18n/translations';
import type { AppLanguage } from '@/i18n/translations';
import type { MoreStackParamList } from '@/navigation/MoreStackNavigator';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { ThemePreference } from '@/theme/ThemeProvider';
import { HEADER_CONTENT_HEIGHT, COMPACT_HEADER_ICON_SIZE, getCompactHeaderStyles } from '@/theme/headerStyles';

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
          <MaterialDesignIcons name="arrow-left" size={COMPACT_HEADER_ICON_SIZE} color={colors.text} accessible={false} />
        </FeedbackPressable>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{t(`settings.${section}`)}</Text>
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
        </View> : section === 'theme' ? <View style={styles.section}>
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
        </View> : supportsExpirationReminders && <ExpirationReminderSettings />}
      </ScrollView>
    </SafeAreaView>
  );
}

function ExpirationReminderSettings() {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { language, t } = useTranslation();
  const { settings, status, saving, saveSettings, refresh } = useExpirationReminder();
  const [picker, setPicker] = useState<'time' | 'leadTime' | null>(null);
  const locale = language === 'ko' ? 'ko-KR' : 'ja-JP';

  if (!settings) return <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />;
  const dateLabel = formatReminderDaysBefore(settings.daysBefore, t);
  const savedTime = new Date(2000, 0, 15, Math.floor(settings.minutes / 60), settings.minutes % 60);
  const timeLabel = savedTime.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const disabled = saving || picker !== null;

  function showError() {
    Alert.alert(t('common.error'), t('reminder.settingsError'), [{ text: t('common.ok') }]);
  }

  async function saveTime(minutes: number) {
    if (!settings || saving) return;
    try {
      if (minutes !== settings.minutes) await saveSettings({ ...settings, minutes });
    } catch {
      showError();
    }
  }

  async function saveLeadTime(daysBefore: number) {
    if (!settings || saving || daysBefore === settings.daysBefore) return;
    try {
      await saveSettings({ ...settings, daysBefore });
    } catch {
      showError();
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.description}>{t('reminder.description')}</Text>
      <View style={styles.options}>
        <View style={[styles.option, styles.switchOption]}>
          <Text accessible={false} style={styles.optionLabel}>{t('reminder.enabled')}</Text>
          <ToggleSwitch accessibilityLabel={t('reminder.enabled')} value={settings.enabled} disabled={disabled}
            onValueChange={enabled => void saveSettings({ ...settings, enabled }).catch(showError)} />
        </View>
        {settings.enabled && (
          <>
            <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('reminder.leadTime')}
              accessibilityValue={{ text: dateLabel }} accessibilityState={{ disabled }} disabled={disabled}
              style={styles.option} onPress={() => setPicker('leadTime')}>
              <Text style={styles.optionLabel}>{t('reminder.leadTime')}</Text>
              <Text style={styles.optionValue}>{dateLabel}</Text>
            </FeedbackPressable>
            <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('reminder.time')}
              accessibilityValue={{ text: timeLabel }} accessibilityState={{ disabled }} disabled={disabled}
              style={styles.option} onPress={() => setPicker('time')}>
              <Text style={styles.optionLabel}>{t('reminder.time')}</Text>
              <Text style={styles.optionValue}>{timeLabel}</Text>
            </FeedbackPressable>
          </>
        )}
      </View>
      {settings.enabled && picker === 'leadTime' && (
        <ReminderLeadTimePicker daysBefore={settings.daysBefore} saving={saving} onSave={saveLeadTime}
          onDismiss={() => setPicker(null)} />
      )}
      {settings.enabled && picker === 'time' && (
        <TimePicker minutes={settings.minutes} minuteInterval={5} saving={saving} onSave={saveTime}
          onDismiss={() => setPicker(null)} />
      )}
      {settings.enabled && status === 'permissionRequired' && (
        <>
          <Text accessibilityLiveRegion="polite" style={styles.description}>{t('reminder.permissionRequired')}</Text>
          <PrimaryButton variant="secondary" label={t('reminder.openSettings')}
            onPress={() => void Linking.openSettings().catch(showError)} />
        </>
      )}
      {status === 'scheduleError' && (
        <>
          <Text accessibilityLiveRegion="polite" style={styles.description}>{t('reminder.scheduleError')}</Text>
          <PrimaryButton variant="secondary" label={t('common.retry')} onPress={refresh} />
        </>
      )}
    </View>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingBottom: spacing.lg,
  },
  ...getCompactHeaderStyles(mode),
  header: { ...getCompactHeaderStyles(mode).header, gap: 0 },
  title: { ...getCompactHeaderStyles(mode).title, flexShrink: 1 },
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
  switchOption: { paddingVertical: spacing.xs },
  selected: { borderColor: colors.chilled, backgroundColor: colors.sageLight },
  optionLabel: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 24 },
  optionValue: { color: colors.textMuted, fontSize: 16, flexShrink: 1, textAlign: 'right' },
}));
