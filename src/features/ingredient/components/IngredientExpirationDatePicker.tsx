/**
 * @file
 * 재료 유통기한의 네이티브 날짜 선택과 크기 설정을 연결한다.
 * iOS의 고유 크기 측정은 플랫폼별 구현에서 처리한다.
 */
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { colors } from '@/theme/tokens';

export interface IngredientExpirationDatePickerProps {
  value: Date;
  width: number;
  disabled: boolean;
  layoutFrozen?: boolean;
  onChange: (date: Date) => void;
  onContentHeight?: (height: number) => void;
}

export function IngredientExpirationDatePicker({ value, width, disabled, onChange }: IngredientExpirationDatePickerProps) {
  return (
    <DateTimePicker value={value} mode="date" display="inline" presentation="inline" style={{ width }}
      locale="ko_KR" themeVariant="light" accentColor={colors.chilled} disabled={disabled}
      onValueChange={(_, date) => onChange(date)} />
  );
}
