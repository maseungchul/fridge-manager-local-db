/**
 * @file
 * 간격을 지정할 수 있는 24시간제 순환 휠을 표시하고 선택한 시각을 자정 기준 분으로 반환한다.
 */
import { useState } from 'react';
import { usePickerAutoSave } from '@/hooks/usePickerAutoSave';
import { StyleSheet, View } from 'react-native';
import { createWheel, PickerWheel, PickerWheelTrack, PICKER_ROW_HEIGHT, PICKER_ROW_BOTTOM } from '@/components/PickerWheel';
import { CenteredPickerPopup } from '@/components/CenteredPickerPopup';
import { useTranslation } from '@/i18n/LanguageProvider';
import { useAppTheme } from '@/theme/ThemeProvider';
import { createThemedStyles } from '@/theme/tokens';

interface TimePickerProps {
  minutes: number;
  minuteInterval?: 1 | 5 | 10;
  saving: boolean;
  onSave: (minutes: number) => Promise<void>;
  onDismiss: () => void;
}

const HOUR_WHEEL = createWheel(24);
const MINUTE_WHEELS = { 1: createWheel(60), 5: createWheel(12), 10: createWheel(6) };

export function TimePicker({ minutes, minuteInterval = 1, saving, onSave, onDismiss }: TimePickerProps) {
  const { t } = useTranslation();
  const { mode } = useAppTheme();
  const styles = getStyles(mode);
  const [hour, setHour] = useState(() => Math.floor(minutes / 60));
  const [minute, setMinute] = useState(() => minutes % 60);
  const [hourMoving, setHourMoving] = useState(false);
  const [minuteMoving, setMinuteMoving] = useState(false);
  const minuteIndex = Math.floor(minute / minuteInterval);
  const selected = hour * 60 + minuteIndex * minuteInterval;
  const { markEdited, dismiss } = usePickerAutoSave(selected, minutes, saving, onSave, onDismiss, hourMoving || minuteMoving);

  return (
    <CenteredPickerPopup dismissLabel={t('timePicker.close')} dismissDisabled={saving} edgeToEdge onDismiss={() => void dismiss()}>
      <PickerWheelTrack>
        <PickerWheel side="left" label={t('timePicker.hour')} value={hour} wheel={HOUR_WHEEL} disabled={saving} onMovingChange={setHourMoving}
          onChange={value => { if (value !== hour) markEdited(); setHour(value); }} />
        <PickerWheel key={minuteInterval} side="right" label={t('timePicker.minute')} value={minuteIndex} wheel={MINUTE_WHEELS[minuteInterval]}
          step={minuteInterval} disabled={saving} onMovingChange={setMinuteMoving}
          onChange={index => { if (index !== minuteIndex) markEdited(); setMinute(index * minuteInterval); }} />
        <View pointerEvents="none" style={styles.separator} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.separatorDot} />
          <View style={styles.separatorDot} />
        </View>
      </PickerWheelTrack>
    </CenteredPickerPopup>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  separator: { position: 'absolute', left: 0, right: 0, bottom: PICKER_ROW_BOTTOM, height: PICKER_ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 7.5 },
  separatorDot: { width: 2.75, height: 2.75, borderRadius: 1.375, backgroundColor: mode === 'dark' ? colors.text : '#000000' },
}));
