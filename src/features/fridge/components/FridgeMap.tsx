/**
 * @file
 * 홈 화면의 냉장고 배치도에서 영역·칸과 칸별 재료 수를 표시한다.
 * 칸을 누르면 식별자를 부모에 전달하고, 홈은 개별 칸·등록 미리보기는 영역 전체를 강조한다.
 * 홈과 최초 등록 미리보기에서 공유하며 선택 상태와 데이터 변경은 호출자가 관리한다.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { colors, fridgeSurfaces, spacing } from '@/theme/tokens';
import { getPositionPath } from '../model/fridgeLayout';
import type { StyleProp, ViewStyle } from 'react-native';
import type { FridgeIngredient, StorageArea, SlotPosition, StorageMode } from '../model/fridgeLayout';

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
  // 등록 도면의 선택 배경과 본체 접근성 라벨에 보관 모드를 반영한다.
  storageMode?: StorageMode | null;
  // 최초 등록에는 재료 정보가 없으므로 개수 표시를 숨길 수 있다. 홈은 기본값을 사용한다.
  showIngredientCounts?: boolean;
  // 연결 관계를 도식으로 표시하는 전체 도면이나 축소 미리보기에서는 영역 제목을 숨긴다.
  showAreaLabels?: boolean;
  // 전체 도면의 행 높이에 맞춰 표시하며, 단독 사용 시 기존 최소 높이를 유지한다.
  minAreaHeight?: number;
  // 고정 높이의 등록 도면에서는 칸을 균등 분배하고 최소 높이를 적용하지 않는다.
  fitHeight?: boolean;
  // 문이 많은 등록 도면의 좁은 영역은 여백을 줄인다.
  compact?: boolean;
  // 패널의 읽기 전용 축소 미리보기에서는 칸의 최소 터치 높이를 적용하지 않는다.
  preview?: boolean;
  style?: StyleProp<ViewStyle>;
  // 도면 내부 상단의 구분 배지를 칸 선택 영역과 분리해 표시한다.
  areaHeader?: ReactNode;
  // 구조 저장 중에는 다른 칸을 선택하지 못하도록 터치와 접근성 상태를 함께 제한한다.
  disabled?: boolean;
  // 홈에서는 개별 칸·좌우 분할의 선택 위치를 변경한다.
  onSelectPosition?: (id: string) => void;
  // 등록 도면은 칸 대신 문·본체 전체에서 터치와 눌림 효과를 처리한다.
  onSelectArea?: (id: string) => void;
}

/** 문과 서랍은 같은 손잡이를 공유하고, 서랍에서는 전체 모양을 가로로 회전한다. */
export function DoorHandle({ horizontal = false, style }: { horizontal?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.doorHandle, horizontal && styles.horizontalHandle, style]}>
      <View style={[styles.handleGrip, horizontal && styles.horizontalGrip]}>
        <View style={styles.handleHighlight} />
      </View>
    </View>
  );
}

/** 투명 포켓의 높은 전면판을 표시하며, 내용과 터치는 부모 칸이 관리한다. */
function DoorPocketBin() {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.pocketBin}>
      <View style={styles.pocketBinFront} />
    </View>
  );
}

/** 칸·좌우 분할의 전체 경로와 선택 상태를 접근성 정보로 함께 제공한다. */
export function FridgeMap({
  areas, positions, ingredients, selectedPositionId, selectedAreaId, storageMode, showIngredientCounts = true,
  showAreaLabels = true, minAreaHeight = 240, fitHeight = false, compact = false, preview = false, style, areaHeader, disabled = false, onSelectPosition, onSelectArea,
}: FridgeMapProps) {
  const groupInteraction = !!onSelectArea && !preview;
  const Area = groupInteraction ? Pressable : View;
  const Position = preview || groupInteraction ? View : FeedbackPressable;
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
            {/* 홈은 칸별로, 등록 도면은 문·본체 전체를 한 번에 눌러 선택한다. */}
            {showAreaLabels ? <Text style={styles.areaLabel}>{area.name}</Text> : null}
            <View style={[styles.areaInterior, { minHeight: minAreaHeight },
                areaSelected && groupInteraction && storageMode && {
                  backgroundColor: storageMode === 'CHILLED' ? colors.chilledBackground : colors.frozenBackground,
                },
                areaSelected && !groupInteraction && styles.areaSelected]}>
              {areaHeader}
              <Area accessibilityRole={groupInteraction ? 'button' : undefined}
                accessibilityLabel={groupInteraction ? `${area.compartment} → ${area.name}${area.isBody && storageMode
                  ? `, ${storageMode === 'CHILLED' ? '냉장' : '냉동'}` : ''}` : undefined}
                accessibilityState={groupInteraction ? { selected: areaSelected, disabled } : undefined}
                disabled={disabled} onPress={groupInteraction ? () => onSelectArea?.(area.id) : undefined}
                style={styles.areaContent}>
                {/* 영역에 연결된 칸만 전달받은 순서대로 세로로 나열한다. */}
                {positions.filter(position => position.areaId === area.id)
                  .filter((position, index, all) => all.findIndex(candidate => candidate.slotId === position.slotId) === index).map((firstPosition, slotIndex) => {
                  // 위→아래 칸 순서를 유지하고 같은 칸의 좌우 분할만 한 행에 묶는다.
                  const slotPositions = positions.filter(position => position.slotId === firstPosition.slotId);
                  return (
                    <View key={firstPosition.slotId} style={[styles.slot, area.isBody && slotIndex > 0 && styles.slotSeparator]}>
                      <View style={styles.slotRow}>
                        {slotPositions.map((position, positionIndex) => {
                          const selected = selectedAreaId ? areaSelected : selectedPositionId === position.id;
                          return (
                            <Position key={position.id} accessible={groupInteraction ? false : undefined}
                              accessibilityRole={preview ? 'image' : groupInteraction ? undefined : 'button'} accessibilityLabel={getPositionPath(area, position)}
                              accessibilityHint={position.drawerCount === 2 ? '좌우로 나뉜 칸' : undefined}
                              accessibilityState={{ selected, disabled }} disabled={disabled} onPress={preview || groupInteraction ? undefined : () => onSelectPosition?.(position.id)}
                              style={[styles.position, positionIndex > 0 && styles.positionSeparator, (compact || preview) && styles.compactPosition, (preview || fitHeight) && styles.fittedPosition, preview && styles.previewPosition, !area.isBody && styles.pocketPosition, selected && styles.positionSelected, groupInteraction && styles.groupPosition]}>
                              {!area.isBody ? <DoorPocketBin /> : null}
                              {/* 좌우 분할은 서로 다른 선택 ID로 재료 수를 집계한다. */}
                              {showIngredientCounts ? <Text style={styles.positionCount}>{ingredients.filter(ingredient => ingredient.positionId === position.id).length}개</Text> : null}
                            </Position>
                          );
                        })}
                      </View>
                      {area.isBody && slotIndex > 0 ? (
                        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.bodyShelf} />
                      ) : null}
                    </View>
                  );
                })}
              </Area>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // 실 전환과 관계없이 부모의 전체 너비를 사용한다.
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
  // 둥근 민트 프레임과 밝은 내부 면을 공유하고, 내부 경계는 한쪽에서만 그린다.
  areaInterior: {
    flex: 1,
    minHeight: 240,
    borderWidth: 1,
    borderColor: fridgeSurfaces.border,
    borderRadius: fridgeSurfaces.radius,
    overflow: 'hidden',
    backgroundColor: fridgeSurfaces.interior,
    boxShadow: fridgeSurfaces.recessedShadow,
  },
  areaSelected: {
    borderColor: colors.button,
    backgroundColor: colors.sageLight,
  },
  areaContent: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 5,
    paddingBottom: 5,
  },
  slot: {
    flex: 1,
  },
  // 기존 경계 공간을 유지하고 선은 별도 장식으로 그려 칸 높이가 바뀌지 않게 한다.
  slotSeparator: {
    borderTopWidth: 1,
    borderTopColor: 'transparent',
  },
  bodyShelf: {
    position: 'absolute',
    left: 3,
    right: 3,
    top: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: fridgeSurfaces.shelf,
    boxShadow: fridgeSurfaces.shelfShadow,
  },
  pocketBin: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 3,
    bottom: 2,
  },
  pocketBinFront: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
    borderWidth: 1,
    borderColor: fridgeSurfaces.pocketBorder,
    borderTopWidth: 3,
    borderBottomWidth: 2,
    borderBottomColor: fridgeSurfaces.shelf,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: fridgeSurfaces.pocket,
    overflow: 'hidden',
    boxShadow: fridgeSurfaces.shelfShadow,
  },
  slotRow: {
    flex: 1,
    flexDirection: 'row',
  },
  // 각 칸은 영역 안의 남는 세로 공간을 나눠 가지며 최소 터치 높이를 유지한다.
  position: {
    flex: 1,
    minHeight: 72,
    minWidth: 0,
    padding: 8,
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'transparent',
  },
  positionSeparator: {
    borderLeftWidth: 1,
    borderLeftColor: fridgeSurfaces.border,
  },
  // 포켓의 둥근 바닥과 칸 아래 여백을 같은 위치에 맞춘다.
  pocketPosition: {
    paddingBottom: 4,
  },
  // 개별 칸의 선택 배경은 입력을 마친 뒤에도 유지하며, 외곽선은 영역에서 한 번만 그린다.
  positionSelected: {
    backgroundColor: colors.sageLight,
  },
  // 등록 도면의 칸은 부모 영역의 배경을 그대로 사용한다.
  groupPosition: {
    backgroundColor: 'transparent',
  },
  doorHandle: {
    position: 'absolute',
    width: 8,
    height: 40,
    borderRadius: 4,
    boxShadow: fridgeSurfaces.shelfShadow,
  },
  horizontalHandle: {
    width: 40,
    height: 8,
  },
  handleGrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 8,
    height: 40,
    borderRadius: 4,
    backgroundColor: fridgeSurfaces.handle,
  },
  horizontalGrip: {
    left: 16,
    top: -16,
    transform: [{ rotate: '90deg' }],
  },
  handleHighlight: {
    position: 'absolute',
    left: 2,
    top: 7,
    bottom: 7,
    width: 2,
    borderRadius: 1,
    backgroundColor: fridgeSurfaces.handleHighlight,
  },
  compactPosition: {
    padding: 2,
  },
  fittedPosition: {
    minHeight: 0,
    paddingVertical: 2,
    gap: 0,
  },
  previewPosition: {
    paddingHorizontal: 4,
  },
  positionCount: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
