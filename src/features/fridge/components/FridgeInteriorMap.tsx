/**
 * @file
 * 사용자가 구성한 모든 단의 문·본체를 펼쳐 표시하고 연결 관계는 경첩으로 나타낸다.
 * 수납 없는 문은 전체 X 표시로 남기며, 칸과 선택 강조는 기존 FridgeMap을 재사용한다.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { FridgeMap } from '@/features/fridge/components/FridgeMap';
import { getDraftLayout } from '@/features/fridge/model/fridgeLayout';
import type { RefrigeratorDraft } from '@/features/fridge/model/fridgeLayout';
import { colors, spacing } from '@/theme/tokens';

interface FridgeInteriorMapProps {
  draft: RefrigeratorDraft;
  selectedAreaId?: string;
  onSelectArea: (id: string) => void;
}

// 그룹 내부는 경첩 길이에 맞추고, 그룹 바깥은 기존 간격을 유지한다.
const HINGE_LENGTH = 3;
const HINGE_HEIGHT = 15;
const GROUP_GAP = 6;

/** 실제 프레임 크기로 두 대각선을 계산해 가로·세로 비율과 관계없이 문 전체를 가린다. */
export function DoorWithoutStorage({ label, selected, readOnly = false, onPress }: {
  label: string; selected: boolean; readOnly?: boolean; onPress?: () => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const length = Math.hypot(size.width, size.height);
  const angle = Math.atan2(size.height, size.width) * 180 / Math.PI;
  return (
    <FeedbackPressable accessibilityRole={readOnly ? 'image' : 'button'} accessibilityLabel={`${label}, 수납 없음`} accessibilityState={{ selected }}
      pointerEvents={readOnly ? 'none' : 'auto'} onPress={readOnly ? undefined : onPress} onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setSize(current => current.width === width && current.height === height ? current : { width, height });
      }} style={[styles.noStorage, selected && styles.selected]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {[angle, -angle].map((rotation, index) => (
          <View key={index} style={[styles.cross, {
            width: length, left: (size.width - length) / 2, top: (size.height - 2) / 2,
            transform: [{ rotate: `${rotation}deg` }],
          }]} />
        ))}
      </View>
      <Text style={styles.noStorageLabel}>수납 없음</Text>
    </FeedbackPressable>
  );
}

/** 문·본체 경계에 경첩을 그리며, 사이에 다른 문이 있으면 단의 바깥 여백으로 연결한다. */
function DoorHinges({ fromColumn, toColumn, totalColumns, top, height }: {
  fromColumn: number; toColumn: number; totalColumns: number; top: number; height: number;
}) {
  const adjacent = fromColumn === toColumn;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.hinges, {
        left: `${Math.min(fromColumn, toColumn) / totalColumns * 100}%`,
        width: `${Math.abs(fromColumn - toColumn) / totalColumns * 100}%`, top, height,
      }]}>
      {[0.22, 0.78].map((ratio, index) => adjacent ? (
        <View key={index} style={[styles.hinge, { left: -HINGE_LENGTH / 2, width: HINGE_LENGTH, top: height * ratio - HINGE_HEIGHT / 2 }]} />
      ) : (
        <View key={index} style={StyleSheet.absoluteFill}>
          <View style={[styles.hingeConnection, index === 0 ? styles.hingeConnectionTop : styles.hingeConnectionBottom, {
            top: index === 0 ? 1 : height * ratio, height: height * 0.22 - 1,
          }]} />
          <View style={[styles.hinge, { left: -HINGE_LENGTH / 2, width: HINGE_LENGTH / 2, top: height * ratio - HINGE_HEIGHT / 2 }]} />
          <View style={[styles.hinge, { right: -HINGE_LENGTH / 2, width: HINGE_LENGTH / 2, top: height * ratio - HINGE_HEIGHT / 2 }]} />
        </View>
      ))}
    </View>
  );
}

/** 본체마다 연결된 여닫이 문을 좌우에 붙이고, 각 단은 다른 단과 관계없이 전체 폭을 쓴다. */
export function FridgeInteriorMap({ draft, selectedAreaId, onSelectArea }: FridgeInteriorMapProps) {
  const preview = getDraftLayout(draft);
  // 칸의 최소 터치 높이 72와 칸 사이 간격·프레임 여백을 확보한다.
  const rowHeights = draft.rows.map(row => Math.max(180, ...[
    ...row.compartments, ...row.doors.filter(door => door.kind !== 'DRAWER' && door.storageEnabled),
  ].map(area => area.slots.length * 76 + 20)));

  return (
    <View>
      <View style={{ height: rowHeights.reduce((sum, height) => sum + height, 0) }}>
        {draft.rows.flatMap((row, rowIndex) => {
          const hingedDoors = row.doors.filter(door => door.kind !== 'DRAWER');
          const totalColumns = row.doors.length + hingedDoors.length;
          let nextColumn = 0;
          // 같은 방향의 문을 단 전체에서 모으지 않고, 연결된 본체와 한 묶음으로 배치한다.
          return row.compartments.flatMap(body => {
            const bodyDoors = hingedDoors.filter(door => body.doorIds.includes(door.id));
            const leftDoors = bodyDoors.filter(door => door.side === 'LEFT_DOOR');
            const rightDoors = bodyDoors.filter(door => door.side === 'RIGHT_DOOR');
            const groupStart = nextColumn;
            const bodyColumn = groupStart + leftDoors.length;
            const rowTop = rowHeights.slice(0, rowIndex).reduce((sum, height) => sum + height, 0);
            const configurations = [...leftDoors, body, ...rightDoors];
            const areas = configurations.map((configuration, index) => {
              const isDoor = 'side' in configuration;
              const hasDrawer = !isDoor && row.doors.some(door => door.kind === 'DRAWER' && body.doorIds.includes(door.id));
              const paddingLeft = (index === 0 ? GROUP_GAP : HINGE_LENGTH) / 2;
              const paddingRight = (index === configurations.length - 1 ? GROUP_GAP : HINGE_LENGTH) / 2;
              const column = nextColumn;
              const columnSpan = isDoor ? 1 : body.doorIds.length;
              nextColumn += columnSpan;
              const compact = columnSpan / totalColumns <= 1 / 6;
              const area = preview.areas.find(candidate => candidate.id === configuration.id)!;
              return (
                <View key={area.id} style={[styles.area, {
                  top: rowTop,
                  left: `${column / totalColumns * 100}%`,
                  width: `${columnSpan / totalColumns * 100}%`,
                  height: rowHeights[rowIndex],
                  paddingLeft,
                  paddingRight,
                }]}>
                  {isDoor && !configuration.storageEnabled ? (
                    <DoorWithoutStorage label={`${area.name} → ${area.compartment}`} selected={area.id === selectedAreaId}
                      onPress={() => onSelectArea(area.id)} />
                  ) : (
                    <FridgeMap areas={[area]} positions={preview.positions.filter(position => position.areaId === area.id)}
                      ingredients={preview.ingredients} selectedAreaId={selectedAreaId} showIngredientCounts={false}
                      showAreaLabels={false} minAreaHeight={0} compact={compact} style={styles.areaMap} onSelectArea={onSelectArea} />
                  )}
                  {/* 내부 칸의 서랍과 구분되도록 본체 상단 전체 폭에 파인 손잡이를 표시한다. */}
                  {hasDrawer && (
                    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                      style={[styles.drawerHandle, { left: paddingLeft + 2, right: paddingRight + 2 }]} />
                  )}
                </View>
              );
            });
            const hinges = bodyDoors.map(door => {
              const isLeft = door.side === 'LEFT_DOOR';
              const doorBoundary = isLeft
                ? groupStart + leftDoors.indexOf(door) + 1
                : bodyColumn + body.doorIds.length + rightDoors.indexOf(door);
              const bodyBoundary = bodyColumn + (isLeft ? 0 : body.doorIds.length);
              return <DoorHinges key={`hinges-${door.id}`} fromColumn={doorBoundary} toColumn={bodyBoundary}
                totalColumns={totalColumns} top={rowTop} height={rowHeights[rowIndex]} />;
            });
            return [...areas, ...hinges];
          });
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hinges: {
    position: 'absolute',
  },
  hinge: {
    position: 'absolute',
    height: HINGE_HEIGHT,
    borderRadius: 1,
    borderWidth: 1,
    borderColor: '#B0ACA3',
    backgroundColor: '#FFFFFF',
  },
  hingeConnection: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  hingeConnectionTop: {
    borderTopWidth: 1,
  },
  hingeConnectionBottom: {
    borderBottomWidth: 1,
  },
  area: {
    position: 'absolute',
    paddingVertical: 3,
  },
  areaMap: {
    flex: 1,
  },
  drawerHandle: {
    position: 'absolute',
    top: 5,
    height: 5,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderWidth: 1,
    borderColor: '#B0ACA3',
  },
  noStorage: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  selected: {
    borderColor: colors.button,
    backgroundColor: colors.sageLight,
  },
  cross: {
    position: 'absolute',
    height: 2,
    backgroundColor: colors.textMuted,
  },
  noStorageLabel: {
    padding: spacing.xs,
    color: colors.textMuted,
    fontSize: 11,
    backgroundColor: colors.surface,
    textAlign: 'center',
  },
});
