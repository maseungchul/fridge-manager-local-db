/**
 * @file
 * 홈 화면의 냉장고 배치도에서 영역·칸과 칸별 재료 수를 표시한다.
 * 칸을 누르면 식별자를 부모에 전달하고, 홈은 개별 칸·등록 미리보기는 영역 전체를 강조한다.
 * 홈과 최초 등록 미리보기에서 공유하며 선택 상태와 데이터 변경은 호출자가 관리한다.
 */
import { StyleSheet, Text, View } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { colors, spacing } from '@/theme/tokens';
import { getPositionName, getPositionPath } from '../model/fridgeLayout';
import type { StyleProp, ViewStyle } from 'react-native';
import type { FridgeIngredient, StorageArea, SlotPosition } from '../model/fridgeLayout';

interface FridgeMapProps {
  // 호출자가 현재 실에 맞게 추린 표시 대상 영역이며 전달 순서대로 배치한다.
  areas: StorageArea[];
  // 칸·개별 서랍의 선택 위치를 받고 영역과 원래 칸 ID로 묶어서 표시한다.
  positions: SlotPosition[];
  // 칸별 재료 개수 표시에 사용한다. 등록 미리보기에서는 빈 목록이다.
  ingredients: FridgeIngredient[];
  // 부모가 관리하는 선택 상태다. 이 컴포넌트 내부에 별도 선택 상태를 만들지 않는다.
  selectedPositionId?: string;
  // 등록 미리보기에서 사용한다. 지정하면 개별 칸 대신 해당 영역의 모든 칸을 선택 표시한다.
  selectedAreaId?: string;
  // 최초 등록에는 재료 정보가 없으므로 개수 표시를 숨길 수 있다. 홈은 기본값을 사용한다.
  showIngredientCounts?: boolean;
  // 전체 도면에서 영역 제목을 맨 위에 한 번만 표시할 때 개별 제목은 숨긴다.
  showAreaLabels?: boolean;
  // 전체 도면의 행 높이에 맞춰 표시하며, 단독 사용 시 기존 최소 높이를 유지한다.
  minAreaHeight?: number;
  // 문이 많은 등록 도면의 좁은 영역은 여백을 줄이고 이름을 두 줄까지 표시한다.
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  // 구조 저장 중에는 다른 칸을 선택하지 못하도록 터치와 접근성 상태를 함께 제한한다.
  disabled?: boolean;
  // 홈은 선택 칸을 변경하고, 등록 미리보기는 해당 칸이 속한 영역의 구성 폼을 선택한다.
  onSelectPosition: (id: string) => void;
}

/** 칸·개별 서랍의 전체 경로와 선택 상태를 접근성 정보로 함께 제공한다. */
export function FridgeMap({
  areas, positions, ingredients, selectedPositionId, selectedAreaId, showIngredientCounts = true,
  showAreaLabels = true, minAreaHeight = 240, compact = false, style, disabled = false, onSelectPosition,
}: FridgeMapProps) {
  // 본체는 1, 문 전체의 합도 1로 배분한다. 문 2개는 각각 0.5, 문 1개는 1이다.
  const doorCount = areas.filter(area => !area.isBody).length;
  const doorFlex = doorCount > 0 ? 1 / doorCount : 1;
  return (
    // 등록 가능한 최대 세 영역을 부모 너비 안에서 배분해 내용 길이가 전체 폭을 바꾸지 않게 한다.
    <View style={[styles.map, style]}>
      {areas.map(area => {
        const areaSelected = selectedAreaId === area.id;
        return (
          <View key={area.id} style={[styles.area, { flex: area.isBody ? 1 : doorFlex }]}>
            {/* 터치는 칸에서 받고 등록 미리보기에서는 해당 영역의 프레임·칸 전체를 강조한다. */}
            {showAreaLabels ? <Text style={styles.areaLabel}>{area.name}</Text> : null}
            <View style={[styles.areaInterior, { minHeight: minAreaHeight }, compact && styles.compactAreaInterior, areaSelected && styles.areaSelected]}>
              {/* 영역에 연결된 칸만 전달받은 순서대로 세로로 나열한다. */}
              {positions.filter(position => position.areaId === area.id)
                .filter((position, index, all) => all.findIndex(candidate => candidate.slotId === position.slotId) === index).map(firstPosition => {
                // 위→아래 칸 순서를 유지하고 같은 칸의 좌우 서랍만 한 행에 묶는다.
                const slotPositions = positions.filter(position => position.slotId === firstPosition.slotId);
                return (
                  <View key={firstPosition.slotId} style={styles.slot}>
                    <View style={[styles.slotRow, compact && styles.compactSlotRow]}>
                      {slotPositions.map(position => {
                        const selected = selectedAreaId ? areaSelected : selectedPositionId === position.id;
                        return (
                          <FeedbackPressable key={position.id} accessibilityRole="button" accessibilityLabel={getPositionPath(area, position)}
                            accessibilityHint={position.drawerCount > 0 ? '서랍' : undefined}
                            accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => onSelectPosition(position.id)}
                            style={[styles.position, compact && styles.compactPosition, selected && styles.positionSelected]}>
                            <Text numberOfLines={compact ? 2 : undefined} style={[styles.positionLabel, compact && styles.compactPositionLabel]}>{getPositionName(position)}</Text>
                            {/* 좌우 서랍은 서로 다른 선택 ID로 재료 수를 집계한다. */}
                            {showIngredientCounts ? <Text style={styles.positionCount}>{ingredients.filter(ingredient => ingredient.positionId === position.id).length}개</Text> : null}
                            {/* 자체 서랍은 손잡이로 표시해 일반 칸과 구분한다. */}
                            {position.drawerCount > 0 ? <View pointerEvents="none" style={styles.drawerHandle} /> : null}
                          </FeedbackPressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // 실 전환이나 칸 이름 길이와 관계없이 부모의 전체 너비를 사용한다.
  map: {
    width: '100%',
    flexDirection: 'row',
    gap: 6,
  },
  // 본체·문 비율은 현재 실의 문 개수로 계산한다. 긴 이름은 영역 안에서 줄바꿈한다.
  area: {
    minWidth: 0,
    gap: spacing.xs,
  },
  areaLabel: {
    minHeight: 22,
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  // 탭과 같은 프레임 여백을 사용하며 칸 수·내용에 따라 높이가 커질 수 있다.
  areaInterior: {
    flex: 1,
    minHeight: 240,
    gap: 4,
    padding: 4,
    backgroundColor: colors.border,
  },
  // 등록 미리보기에서는 칸 사이 간격까지 같은 배경으로 연결해 영역 전체의 선택을 나타낸다.
  areaSelected: {
    backgroundColor: colors.sageLight,
  },
  slot: {
    flex: 1,
  },
  slotRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  // 각 칸은 영역 안의 남는 세로 공간을 나눠 가지며 최소 터치 높이를 유지한다.
  position: {
    flex: 1,
    minHeight: 72,
    minWidth: 0,
    padding: 8,
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
  },
  // 선택한 칸은 테두리와 배경색을 함께 바꿔 일시적인 호버·누름 상태와 구분한다.
  positionSelected: {
    borderColor: colors.button,
    backgroundColor: colors.sageLight,
  },
  drawerHandle: {
    position: 'absolute',
    top: 5,
    alignSelf: 'center',
    width: '95%',
    height: 1,
    borderRadius: 1,
    backgroundColor: colors.textMuted,
  },
  positionLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  compactAreaInterior: {
    padding: 2,
    gap: 2,
  },
  compactSlotRow: {
    gap: 2,
  },
  compactPosition: {
    padding: 2,
  },
  compactPositionLabel: {
    fontSize: 11,
  },
  positionCount: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
