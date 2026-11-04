/**
 * @file
 * iOS 유통기한 달력을 일정한 레이아웃 제약으로 배치하고 내용 높이를 전달한다.
 * 고정 프레임의 정렬 여백을 제외하며 날짜 선택은 SwiftUI DatePicker가 처리한다.
 */
import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle, disabled as disabledModifier, environment, frame, onGeometryChange, tint } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { colors } from '@/theme/tokens';
import type { IngredientExpirationDatePickerProps } from './IngredientExpirationDatePicker';

export function IngredientExpirationDatePicker({ value, width, height, disabled, onChange, onContentHeight }: IngredientExpirationDatePickerProps) {
  const [contentHeight, setContentHeight] = useState(0);

  return (
    <Host matchContents={false} style={{ width, height: Math.max(height ?? 0, contentHeight) }}
      alignment="topLeading" colorScheme="light" ignoreSafeArea="all">
      <DatePicker selection={value} displayedComponents={['date']} onDateChange={onChange}
        modifiers={[
          datePickerStyle('graphical'),
          // 프레임 여백을 제외해 측정하고, 부모의 표시 배율은 너비 비율로 보정한다.
          onGeometryChange(bounds => {
            if (bounds.width <= 0 || bounds.height <= 0) return;
            const measuredHeight = Math.round(bounds.height * width / bounds.width * 100) / 100;
            setContentHeight(measuredHeight);
            onContentHeight?.(measuredHeight);
          }),
          frame({ width, height, alignment: 'topLeading' }), disabledModifier(disabled),
          environment('locale', 'ko_KR'), tint(colors.chilled),
        ]} />
    </Host>
  );
}
