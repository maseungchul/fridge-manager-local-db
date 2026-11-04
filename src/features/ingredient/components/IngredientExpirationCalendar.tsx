/**
 * @file
 * 재료 유통기한을 기존 네이티브 달력으로 선택하고 날짜 변경을 즉시 전달한다.
 * Android의 초기값 알림은 제외하며, 달력 접기와 선택값 저장은 호출자가 관리한다.
 */
import { useState } from 'react';
import { Platform } from 'react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { colors } from '@/theme/tokens';

interface IngredientExpirationCalendarProps {
  value: string | null;
  disabled?: boolean;
  onSelect: (date: string) => void;
}

/** 현지 날짜를 유지해 UTC 변환으로 유통기한이 앞뒤로 바뀌지 않게 한다. */
function formatCalendarDate(date: Date) {
  return [String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function IngredientExpirationCalendar({ value, disabled = false, onSelect }: IngredientExpirationCalendarProps) {
  const [initialDate] = useState(() => value ? new Date(`${value}T12:00:00`) : new Date());

  return (
    <DateTimePicker value={initialDate} mode="date" display="inline" presentation="inline"
      locale="ko_KR" themeVariant="light" accentColor={colors.chilled} disabled={disabled}
      onValueChange={(_, date) => {
        if (disabled) return;
        const selectedDate = formatCalendarDate(date);
        // Material 달력은 열릴 때도 현재 선택값을 전달하므로 사용자 변경과 구분한다.
        if (Platform.OS === 'android' && selectedDate === formatCalendarDate(initialDate)) return;
        onSelect(selectedDate);
      }} />
  );
}
