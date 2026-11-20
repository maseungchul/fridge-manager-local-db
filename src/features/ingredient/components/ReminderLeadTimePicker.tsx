/**
 * @file
 * 재료 유통기한을 기준으로 알림을 받을 시점을 공통 선택 휠에서 고른다.
 */
import { useState } from 'react';
import { CenteredPickerPopup } from '@/components/CenteredPickerPopup';
import { createWheel, PickerWheel, PickerWheelTrack } from '@/components/PickerWheel';
import { formatReminderDaysBefore } from '@/features/ingredient/model/expirationReminder';
import { usePickerAutoSave } from '@/hooks/usePickerAutoSave';
import { useTranslation } from '@/i18n/LanguageProvider';

interface ReminderLeadTimePickerProps {
  daysBefore: number;
  saving: boolean;
  onSave: (daysBefore: number) => Promise<void>;
  onDismiss: () => void;
}

const DAYS = Array.from({ length: 31 }, (_, day) => day);

export function ReminderLeadTimePicker({ daysBefore, saving, onSave, onDismiss }: ReminderLeadTimePickerProps) {
  const { t } = useTranslation();
  // 이전 달력에서 30일을 넘겨 설정했다면 편집 중에도 그 값을 고를 수 있다.
  const [days] = useState(() => daysBefore >= DAYS.length ? [...DAYS, daysBefore] : DAYS);
  const [wheel] = useState(() => createWheel(days.length, false));
  const [index, setIndex] = useState(() => days.indexOf(daysBefore));
  const { markEdited, dismiss } = usePickerAutoSave(days[index], daysBefore, saving, onSave, onDismiss);

  return (
    <CenteredPickerPopup dismissLabel={t('reminder.closeLeadTime')} dismissDisabled={saving} edgeToEdge onDismiss={() => void dismiss()}>
      <PickerWheelTrack>
        <PickerWheel label={t('reminder.leadTime')} value={index} wheel={wheel} disabled={saving}
          formatOption={option => formatReminderDaysBefore(days[option], t)}
          onChange={next => { if (next !== index) markEdited(); setIndex(next); }} />
      </PickerWheelTrack>
    </CenteredPickerPopup>
  );
}
