/**
 * @file
 * 구조 선택 카드에서 JSON의 본체 배치를 작은 도식으로 표시한다.
 * 같은 실 ID가 차지하는 셀을 하나로 합치며, 내부 칸 편집과 선택 상태는 호출자가 관리한다.
 */
import { StyleSheet, Text, View } from 'react-native';
import type fridgeLayoutPresets from '@/features/fridge/model/fridgeLayoutPresets.json';
import { colors } from '@/theme/tokens';

interface FridgeStructurePreviewProps {
  preset: (typeof fridgeLayoutPresets)[number];
}

const BORDER_WIDTH = 2;

/** 격자의 행·열을 상대 위치로 바꿔 공용 본체에 분리선이 생기지 않도록 한다. */
export function FridgeStructurePreview({ preset }: FridgeStructurePreviewProps) {
  const rowCount = preset.layout.length;
  const columnCount = preset.layout[0].length;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.preview}
    >
      {preset.compartments.map(compartment => {
        const cells = preset.layout.flatMap((row, rowIndex) => (
          row.flatMap((id, columnIndex) => id === compartment.id ? [{ rowIndex, columnIndex }] : [])
        ));
        const firstRow = Math.min(...cells.map(cell => cell.rowIndex));
        const lastRow = Math.max(...cells.map(cell => cell.rowIndex));
        const firstColumn = Math.min(...cells.map(cell => cell.columnIndex));
        const lastColumn = Math.max(...cells.map(cell => cell.columnIndex));

        return (
          <View
            key={compartment.id}
            style={[
              styles.compartment,
              {
                top: `${firstRow / rowCount * 100}%`,
                left: `${firstColumn / columnCount * 100}%`,
                width: `${(lastColumn - firstColumn + 1) / columnCount * 100}%`,
                height: `${(lastRow - firstRow + 1) / rowCount * 100}%`,
                // 공유 경계는 아래·오른쪽 본체에서만 그려 선 두께를 일정하게 유지한다.
                borderTopWidth: firstRow > 0 ? BORDER_WIDTH : 0,
                borderLeftWidth: firstColumn > 0 ? BORDER_WIDTH : 0,
              },
            ]}
          >
            <View style={styles.body}>
              <Text style={styles.name}>{compartment.name}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: 108,
    height: 144,
    borderWidth: BORDER_WIDTH,
    borderColor: colors.border,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  compartment: {
    position: 'absolute',
    borderColor: colors.border,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
    backgroundColor: colors.surface,
  },
  name: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
  },
});
