/**
 * @file
 * 등록 화면의 단별 문 개수와 미등록 홈의 안내 그림을 닫힌 냉장고 도식으로 표시한다.
 * 내부 설정·보관 모드와 분리된 고정 도식이며, 단 식별자와 문 개수만 전달받는다.
 */
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors } from '@/theme/tokens';

// 기본정보 도식의 비율은 내부 설정 도면과 별도로 관리한다.
export const STRUCTURE_PREVIEW_ASPECT_RATIO = 1 / 2;

interface FridgeStructurePreviewProps {
  rows: { id: string; doorCount: number }[];
  style?: StyleProp<ViewStyle>;
}

/** 기본 외곽 비율로 표시하되 호출자가 배치 공간을 조정할 수 있고, 문 경계는 한쪽에서만 그린다. */
export function FridgeStructurePreview({ rows, style }: FridgeStructurePreviewProps) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.preview, style]}>
      {rows.map((row, rowIndex) => (
        <View key={row.id} style={[styles.row, rowIndex > 0 && styles.rowBorder]}>
          {Array.from({ length: row.doorCount }, (_, index) => (
            <View key={index} style={[styles.door, index > 0 && styles.doorBorder]}>
              <View style={[styles.handle, index === 0 ? styles.handleRight : styles.handleLeft]} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: 144,
    aspectRatio: STRUCTURE_PREVIEW_ASPECT_RATIO,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  door: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  handle: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 4,
    height: 44,
    borderRadius: 2,
    backgroundColor: '#B1B1B1',
  },
  handleRight: {
    right: 8,
  },
  handleLeft: {
    left: 8,
  },
  doorBorder: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
});
