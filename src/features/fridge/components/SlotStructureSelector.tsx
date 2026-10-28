/**
 * @file
 * 본체 칸의 가로 분할을 선택하는 공통 입력으로 최초 등록과 기존 칸 설정에서 사용한다.
 * 선택값·저장 중 입력 제한은 부모가 관리하며, 이 컴포넌트는 선택 결과만 부모에게 전달한다.
 * 입력 상태 갱신과 칸의 자동 위치 안내는 호출자가 담당한다.
 */
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { StyleSheet, Text, View } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { SelectionCheck } from '@/components/SelectionCheck';
import { colors, spacing } from '@/theme/tokens';
import type { DrawerCount } from '../model/fridgeLayout';

const structureOptions = [
  { value: 0, label: '분할 없음', icon: 'rectangle-outline' },
  { value: 2, label: '좌우 2칸', icon: 'view-split-vertical' },
] as const;

// 선택값과 변경 처리는 부모에게서 받고, 화면 제목과 선택 버튼의 접근성 이름을 분리한다.
interface SlotStructureSelectorProps {
  label: string;
  // 표시 라벨이 반복되어도 선택 버튼을 구분하도록 칸 번호·경로를 받는다.
  accessibilityLabel?: string;
  value: DrawerCount;
  disabled?: boolean;
  onChange: (value: DrawerCount) => void;
}

/**
 * 본체 칸의 가로 분할 선택을 표시하고 변경값을 부모에게 전달한다.
 * @param props 표시 문구·선택 상태·입력 제한과 변경 콜백.
 * @param props.label 화면에 표시할 항목 제목.
 * @param props.accessibilityLabel 선택 버튼을 구분할 칸 번호·경로. 생략하면 label을 사용한다.
 * @param props.value 기존 값 0·1은 분할 없음, 2는 좌우 2칸으로 표시한다.
 * @param props.disabled 저장 중 선택 변경을 막을지 여부.
 * @param props.onChange 선택한 분할을 부모의 입력 상태에 반영할 콜백.
 * @returns 가로 분할 구조 선택 버튼.
 */
export function SlotStructureSelector({ label, accessibilityLabel = label, value, disabled, onChange }: SlotStructureSelectorProps) {
  const selectedValue = value === 2 ? 2 : 0;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {/* 칸별로 같은 선택지가 반복되므로 접근성 이름에는 부모가 전달한 칸 번호·경로를 함께 넣는다. */}
      <View style={styles.options}>
        {structureOptions.map(option => (
          <FeedbackPressable key={option.value} accessibilityRole="radio" accessibilityLabel={`${accessibilityLabel} ${option.label}`}
            accessibilityState={{ checked: selectedValue === option.value, disabled: !!disabled }} disabled={disabled}
            onPress={() => onChange(option.value)} style={[styles.option, selectedValue === option.value && styles.selected]}>
            <MaterialDesignIcons name={option.icon} size={18} color={colors.text} accessible={false} />
            <Text numberOfLines={1} style={[styles.label, styles.optionLabel]}>{option.label}</Text>
            <SelectionCheck selected={selectedValue === option.value} />
          </FeedbackPressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  options: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  option: {
    minWidth: 0,
    minHeight: 44,
    padding: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  selected: {
    borderColor: colors.button,
    backgroundColor: colors.sageLight,
  },
  label: {
    color: colors.text,
    fontSize: 12,
  },
  optionLabel: {
    flexShrink: 0,
    textAlign: 'center',
  },
});
