/**
 * @file
 * 사용자가 구성한 모든 단의 문·본체를 펼쳐 표시하고 영역 제목은 맨 위에 한 번만 표시한다.
 * 수납 없는 문은 전체 X 표시로 남기며, 칸과 선택 강조는 기존 FridgeMap을 재사용한다.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { FridgeMap } from '@/features/fridge/components/FridgeMap';
import { areaNames, getDraftLayout } from '@/features/fridge/model/fridgeLayout';
import type { AreaType, RefrigeratorDraft } from '@/features/fridge/model/fridgeLayout';
import { colors, spacing } from '@/theme/tokens';

interface FridgeInteriorMapProps {
  draft: RefrigeratorDraft;
  selectedAreaId?: string;
  onSelectArea: (id: string) => void;
}

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

/** 본체마다 연결된 여닫이 문을 좌우에 붙이고, 각 단은 다른 단과 관계없이 전체 폭을 쓴다. */
export function FridgeInteriorMap({ draft, selectedAreaId, onSelectArea }: FridgeInteriorMapProps) {
  const preview = getDraftLayout(draft);
  const columnTypes: AreaType[] = [
    ...(draft.rows.some(row => row.doors.some(door => door.kind !== 'DRAWER' && door.side === 'LEFT_DOOR')) ? ['LEFT_DOOR' as const] : []),
    'BODY',
    ...(draft.rows.some(row => row.doors.some(door => door.kind !== 'DRAWER' && door.side === 'RIGHT_DOOR')) ? ['RIGHT_DOOR' as const] : []),
  ];
  // 칸의 최소 터치 높이 72와 칸 사이 간격·프레임 여백을 확보한다.
  const rowHeights = draft.rows.map(row => Math.max(180, ...[
    ...row.compartments, ...row.doors.filter(door => door.kind !== 'DRAWER' && door.storageEnabled),
  ].map(area => area.slots.length * 76 + 20)));

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        {columnTypes.map(type => (
          <Text key={type} style={[styles.columnLabel, { flex: type === 'BODY' ? Math.max(1, columnTypes.length - 1) : 1 }]}>{areaNames[type]}</Text>
        ))}
      </View>
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
            return [...leftDoors, body, ...rightDoors].map(configuration => {
              const isDoor = 'side' in configuration;
              const column = nextColumn;
              const columnSpan = isDoor ? 1 : body.doorIds.length;
              nextColumn += columnSpan;
              const compact = columnSpan / totalColumns <= 1 / 6;
              const area = preview.areas.find(candidate => candidate.id === configuration.id)!;
              return (
                <View key={area.id} style={[styles.area, {
                  top: rowHeights.slice(0, rowIndex).reduce((sum, height) => sum + height, 0),
                  left: `${column / totalColumns * 100}%`,
                  width: `${columnSpan / totalColumns * 100}%`,
                  height: rowHeights[rowIndex],
                }]}>
                  {isDoor && !configuration.storageEnabled ? (
                    <DoorWithoutStorage label={`${area.name} → ${area.compartment}`} selected={area.id === selectedAreaId}
                      onPress={() => onSelectArea(area.id)} />
                  ) : (
                    <FridgeMap areas={[area]} positions={preview.positions.filter(position => position.areaId === area.id)}
                      ingredients={preview.ingredients} selectedAreaId={selectedAreaId} showIngredientCounts={false}
                      showAreaLabels={false} minAreaHeight={0} compact={compact} style={styles.areaMap} onSelectPosition={() => onSelectArea(area.id)} />
                  )}
                </View>
              );
            });
          });
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  heading: {
    flexDirection: 'row',
  },
  columnLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  area: {
    position: 'absolute',
    padding: 3,
  },
  areaMap: {
    flex: 1,
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
