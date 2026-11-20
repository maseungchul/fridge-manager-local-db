/**
 * @file
 * 재료 유통기한을 기준으로 알림을 받을 시점을 공통 선택 휠에서 고른다.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CenteredPickerPopup } from '@/components/CenteredPickerPopup';
import { createWheel, PickerWheel, PickerWheelTrack, PICKER_ROW_BOTTOM, PICKER_ROW_HEIGHT } from '@/components/PickerWheel';
import { formatReminderDaysBefore } from '@/features/ingredient/model/expirationReminder';
import { usePickerAutoSave } from '@/hooks/usePickerAutoSave';
import { useTranslation } from '@/i18n/LanguageProvider';
import { useAppTheme } from '@/theme/ThemeProvider';
import { createThemedStyles } from '@/theme/tokens';

interface ReminderLeadTimePickerProps {
  daysBefore: number;
  saving: boolean;
  onSave: (daysBefore: number) => Promise<void>;
  onDismiss: () => void;
}

const DAYS = Array.from({ length: 31 }, (_, day) => day);

export function ReminderLeadTimePicker({ daysBefore, saving, onSave, onDismiss }: ReminderLeadTimePickerProps) {
  const { t } = useTranslation();
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  // 이전 달력에서 30일을 넘겨 설정했다면 편집 중에도 그 값을 고를 수 있다.
  const [days] = useState(() => daysBefore >= DAYS.length ? [...DAYS, daysBefore] : DAYS);
  const [wheel] = useState(() => createWheel(days.length, false));
  const [index, setIndex] = useState(() => days.indexOf(daysBefore));
  const { markEdited, dismiss } = usePickerAutoSave(days[index], daysBefore, saving, onSave, onDismiss);
  const labelOffset = Math.max(30, String(days[days.length - 1]).length * 11 + 4);

  return (
    <CenteredPickerPopup dismissLabel={t('reminder.closeLeadTime')} dismissDisabled={saving} edgeToEdge onDismiss={() => void dismiss()}>
      <PickerWheelTrack>
        <PickerWheel label={t('reminder.leadTime')} value={index} wheel={wheel} disabled={saving}
          formatOption={option => days[option] === 0 ? t('reminder.sameDay') : String(days[option])}
          formatAccessibilityValue={option => formatReminderDaysBefore(days[option], t)}
          onChange={next => { if (next !== index) markEdited(); setIndex(next); }} />
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[styles.label, styles.prefix, { marginRight: labelOffset }]}>
          <Text style={styles.labelText} maxFontSizeMultiplier={1.4}>{t('ingredient.expiration')}</Text>
        </View>
        {days[index] > 0 && (
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={[styles.label, styles.suffix, { marginLeft: labelOffset }]}>
            <Text style={styles.labelText} maxFontSizeMultiplier={1.4}>{t('reminder.daysUnit')}</Text>
          </View>
        )}
      </PickerWheelTrack>
    </CenteredPickerPopup>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  label: { position: 'absolute', bottom: PICKER_ROW_BOTTOM, height: PICKER_ROW_HEIGHT, justifyContent: 'center' },
  prefix: { right: '50%' },
  suffix: { left: '50%' },
  labelText: { color: colors.textMuted, fontSize: 16, lineHeight: 23, includeFontPadding: false },
}));
