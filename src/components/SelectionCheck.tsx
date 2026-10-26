/**
 * @file
 * SelectionCheck는 선택 버튼 문구 뒤에 표시하는 공통 체크 아이콘이다.
 * 미선택 상태에도 같은 너비를 확보하며, 선택 상태의 접근성 정보는 호출자가 관리한다.
 */
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { StyleSheet } from 'react-native';
import { colors } from '@/theme/tokens';

interface SelectionCheckProps {
  selected: boolean;
}

/** 체크의 표시 여부만 바꿔 선택 전후에도 버튼 내부 배치를 유지한다. */
export function SelectionCheck({ selected }: SelectionCheckProps) {
  return (
    <MaterialDesignIcons name="check" size={16} color={colors.text} accessible={false}
      style={[styles.icon, !selected && styles.hidden]} />
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 16,
    flexShrink: 0,
    lineHeight: 20,
    includeFontPadding: false,
  },
  hidden: {
    opacity: 0,
  },
});
