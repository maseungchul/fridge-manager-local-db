/**
 * @file
 * iOS 유통기한 달력을 UIKit 날짜 선택기에 직접 연결한다.
 * 네이티브의 실제 크기를 입력 폭에 맞춰 표시하고 날짜 변경을 즉시 전달한다.
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '@/theme/tokens';
import type { IngredientExpirationDatePickerProps } from './IngredientExpirationDatePicker';

export function IngredientExpirationDatePicker({ value, width, disabled, layoutFrozen = false, onChange, onContentHeight }: IngredientExpirationDatePickerProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const selected = useRef(false);
  // Fabric의 날짜 선택기는 고유 크기를 사용하므로 비율을 유지해 입력 폭에 맞춘다.
  const scale = size.width > 0 ? width / size.width : 1;
  const contentHeight = size.height * scale;

  useEffect(() => {
    if (!layoutFrozen && !selected.current && contentHeight > 0) onContentHeight?.(contentHeight);
  }, [contentHeight, layoutFrozen, onContentHeight]);

  return (
    <View style={{ width, height: size.height > 0 ? contentHeight : undefined }}>
      <DateTimePicker value={value} mode="date" display="inline" locale="ko_KR"
        themeVariant="light" accentColor={colors.chilled} disabled={disabled}
        style={{ width, transform: [{ scale }], transformOrigin: 'top left' }}
        onLayout={({ nativeEvent: { layout } }) => {
          if (layoutFrozen || selected.current || layout.width <= 0 || layout.height <= 0) return;
          setSize(current => current.width === layout.width && current.height === layout.height
            ? current : { width: layout.width, height: layout.height });
        }}
        onValueChange={(_, date) => {
          if (disabled || layoutFrozen || selected.current) return;
          selected.current = true;
          onChange(date);
        }} />
    </View>
  );
}
