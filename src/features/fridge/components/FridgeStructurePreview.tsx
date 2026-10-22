/**
 * @file
 * 구조 선택과 내부 설정에서 JSON의 본체 배치와 공용 본체의 문 경계를 작은 도식으로 표시한다.
 * 같은 실 ID가 차지하는 셀을 하나로 합치며, 내부 칸 편집과 선택 상태는 호출자가 관리한다.
 */
import { StyleSheet, Text, View } from 'react-native';
import type fridgeLayoutPresets from '@/features/fridge/model/fridgeLayoutPresets.json';
import { colors } from '@/theme/tokens';

interface FridgeStructurePreviewProps {
  preset: (typeof fridgeLayoutPresets)[number];
  showLabels?: boolean;
}

const BORDER_WIDTH = 2;

/** 본체와 문 경계를 같은 도식 좌표로 계산해 맞닿는 선의 위치를 일치시킨다. */
export function FridgeStructurePreview({ preset, showLabels = true }: FridgeStructurePreviewProps) {
  const rowCount = preset.layout.length;
  const columnCount = preset.layout[0].length;
  const compartments = preset.compartments.map(compartment => {
    const cells = preset.layout.flatMap((row, rowIndex) => (
      row.flatMap((id, columnIndex) => id === compartment.id ? [{ rowIndex, columnIndex }] : [])
    ));

    return {
      ...compartment,
      firstRow: Math.min(...cells.map(cell => cell.rowIndex)),
      lastRow: Math.max(...cells.map(cell => cell.rowIndex)),
      firstColumn: Math.min(...cells.map(cell => cell.columnIndex)),
      lastColumn: Math.max(...cells.map(cell => cell.columnIndex)),
      doors: preset.openings.filter(opening => (
        opening.kind === 'HINGED' && opening.compartmentIds.includes(compartment.id)
      )),
    };
  });

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.preview}
    >
      {/* 안쪽 글자 여백의 영향을 받지 않도록 문 경계도 본체와 같은 부모에 배치한다. */}
      {compartments.flatMap(compartment => compartment.doors.slice(1).map((door, index) => (
        <View
          key={door.id}
          style={[
            styles.doorBoundary,
            {
              top: `${compartment.firstRow / rowCount * 100}%`,
              left: `${(compartment.firstColumn + (compartment.lastColumn - compartment.firstColumn + 1) * (index + 1) / compartment.doors.length) / columnCount * 100}%`,
              height: `${(compartment.lastRow - compartment.firstRow + 1) / rowCount * 100}%`,
            },
          ]}
        />
      )))}
      {compartments.map(compartment => (
        <View
          key={compartment.id}
          style={[
            styles.compartment,
            {
              top: `${compartment.firstRow / rowCount * 100}%`,
              left: `${compartment.firstColumn / columnCount * 100}%`,
              width: `${(compartment.lastColumn - compartment.firstColumn + 1) / columnCount * 100}%`,
              height: `${(compartment.lastRow - compartment.firstRow + 1) / rowCount * 100}%`,
              // 공유 경계는 아래·오른쪽 본체에서만 그려 선 두께를 일정하게 유지한다.
              borderTopWidth: compartment.firstRow > 0 ? BORDER_WIDTH : 0,
              borderLeftWidth: compartment.firstColumn > 0 ? BORDER_WIDTH : 0,
            },
          ]}
        >
          {showLabels ? (
            <View style={styles.body}>
              <Text style={[styles.name, compartment.doors.length > 1 && styles.sharedName]}>{compartment.name}</Text>
            </View>
          ) : null}
        </View>
      ))}
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
  },
  name: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
  },
  doorBoundary: {
    position: 'absolute',
    width: BORDER_WIDTH,
    backgroundColor: colors.border,
  },
  sharedName: {
    paddingHorizontal: 2,
    backgroundColor: colors.surface,
  },
});
