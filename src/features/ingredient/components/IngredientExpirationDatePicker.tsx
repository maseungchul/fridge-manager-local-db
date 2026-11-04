/**
 * @file
 * 재료 유통기한의 네이티브 날짜 선택과 크기 설정을 연결한다.
 * iOS의 레이아웃 제약과 내용 높이 측정은 플랫폼별 구현에서 처리한다.
 */
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { colors } from '@/theme/tokens';

export interface IngredientExpirationDatePickerProps {
  value: Date;
  width: number;
  height?: number;
  disabled: boolean;
  onChange: (date: Date) => void;
  onContentHeight?: (height: number) => void;
}

export function IngredientExpirationDatePicker({ value, width, height, disabled, onChange }: IngredientExpirationDatePickerProps) {
  return (
    <DateTimePicker value={value} mode="date" display="inline" presentation="inline" style={{ width, height }}
      locale="ko_KR" themeVariant="light" accentColor={colors.chilled} disabled={disabled}
      onValueChange={(_, date) => onChange(date)} />
  );
}
