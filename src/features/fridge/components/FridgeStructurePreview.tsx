/**
 * @file
 * 최초 등록에서 사용자가 정한 단별 문 개수를 닫힌 냉장고 도식으로 표시한다.
 * 실제 비율·내부 수납을 추측하지 않고 문 배치만 보여주며 입력은 호출자가 관리한다.
 */
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { RefrigeratorDraft } from '@/features/fridge/model/fridgeLayout';
import { colors, fridgeSurfaces } from '@/theme/tokens';

interface FridgeStructurePreviewProps {
  rows: RefrigeratorDraft['rows'];
  style?: StyleProp<ViewStyle>;
}

/** 기본 외곽 비율로 표시하되 호출자가 배치 공간을 조정할 수 있고, 문 경계는 한쪽에서만 그린다. */
export function FridgeStructurePreview({ rows, style }: FridgeStructurePreviewProps) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.preview, style]}>
      {rows.map((row, rowIndex) => (
        <View key={row.id} style={[styles.row, rowIndex > 0 && styles.rowBorder]}>
          {row.doors.map((door, index) => (
            <View key={door.id} style={[styles.door, index > 0 && styles.doorBorder]} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: 144,
    aspectRatio: 3 / 5,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: fridgeSurfaces.border,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    boxShadow: fridgeSurfaces.raisedShadow,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: fridgeSurfaces.border,
  },
  door: {
    flex: 1,
    boxShadow: fridgeSurfaces.raisedShadow,
  },
  doorBorder: {
    borderLeftWidth: 1,
    borderLeftColor: fridgeSurfaces.border,
  },
});
