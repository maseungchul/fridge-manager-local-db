/**
 * @file
 * 홈 화면의 냉장고 배치도에서 영역·칸과 칸별 재료 수를 표시한다.
 * 홈은 본체의 칸·좌우 위치와 포켓의 수납함 전면을 선택하고, 등록 미리보기는 영역 전체를 강조한다.
 * 홈과 최초 등록 미리보기에서 공유하며 선택 상태와 데이터 변경은 호출자가 관리한다.
 */
import type { ReactNode } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { IngredientCountBadges, getIngredientBadgeHeight, getIngredientCountLabel } from '@/features/ingredient/components/IngredientCountBadges';
import { getIngredientCounts } from '@/features/ingredient/model/ingredient';
import { colors, fridgeDoorColors, fridgeSurfaces, getFridgeSurfaceStyle, spacing } from '@/theme/tokens';
import { getPositionPath, getSlotName } from '../model/fridgeLayout';
import type { StyleProp, ViewStyle } from 'react-native';
import type { FridgeIngredient, StorageArea, SlotConfiguration, SlotPosition, StorageMode } from '../model/fridgeLayout';

const BODY_SHELF_HEIGHT = 4;
const CELL_SEPARATOR_INSET = 4;
const BODY_CELL_GAP = BODY_SHELF_HEIGHT + CELL_SEPARATOR_INSET * 2;
const BODY_EDGE_INSET = BODY_CELL_GAP / 2;
const BODY_CELL_RADIUS = 6;
const AREA_CONTENT_PADDING = 5;
const POSITION_SEPARATOR_WIDTH = 1;
const MIN_EDIT_CELL_SIZE = 72;
const POCKET_BORDER_WIDTH = 3;
const POCKET_BOTTOM_RADIUS = 12;
const INGREDIENT_BADGE_INSET = 4;
export const DOOR_MODE_ART_INSET = 8;

/** 프레임·이름·구분선과 여백을 더해 실제 수납 칸마다 최소 편집 크기를 확보한다. */
export function getFridgeAreaEditSize(slots: readonly SlotConfiguration[], isBody: boolean) {
  const slotCount = Math.max(1, slots.length);
  const columns = Math.max(1, ...slots.map(slot => slot.drawerCount === 2 ? 2 : 1));
  const innerMargin = fridgeSurfaces.bodySideWidth - fridgeSurfaces.frameWidth;
  const horizontalPadding = isBody ? BODY_EDGE_INSET : AREA_CONTENT_PADDING;
  return {
    width: fridgeSurfaces.frameWidth * 2 + innerMargin * 2 + horizontalPadding * 2
      + columns * MIN_EDIT_CELL_SIZE + (columns - 1) * (isBody ? BODY_CELL_GAP : POSITION_SEPARATOR_WIDTH),
    height: fridgeSurfaces.frameWidth * 2 + fridgeSurfaces.headerHeight + innerMargin
      + (isBody ? BODY_EDGE_INSET * 2 : AREA_CONTENT_PADDING) + slotCount * MIN_EDIT_CELL_SIZE
      + (isBody ? (slotCount - 1) * BODY_CELL_GAP : 0),
  };
}

interface FridgeMapProps {
  // 호출자가 현재 실에 맞게 추린 표시 대상 영역이며 전달 순서대로 배치한다.
  areas: StorageArea[];
  // 칸·개별 서랍의 선택 위치를 받고 영역과 원래 칸 ID로 묶어서 표시한다.
  positions: SlotPosition[];
  // 칸별 일반·기한주의·경과 재료 배지에 사용한다. 등록 미리보기에서는 빈 목록이다.
  ingredients: FridgeIngredient[];
  now?: Date;
  // 부모가 관리하는 선택 상태다. 이 컴포넌트 내부에 별도 선택 상태를 만들지 않는다.
  selectedPositionId?: string;
  // 등록 미리보기에서 사용한다. 지정하면 개별 칸 대신 해당 영역의 모든 칸을 선택 표시한다.
  selectedAreaId?: string;
  // 배경과 선택 테두리·본체 접근성 라벨에 보관 모드를 반영한다.
  storageMode?: StorageMode | null;
  // 닫힌 도면에서 정한 본체·문 모서리를 열린 내부 프레임에도 유지한다.
  cornerStyle?: ViewStyle;
  // 최초 등록에는 재료 정보가 없으므로 개수 표시를 숨길 수 있다. 홈은 기본값을 사용한다.
  showIngredientCounts?: boolean;
  // 연결 관계를 도식으로 표시하는 등록 도면에서는 영역 제목을 숨긴다.
  showAreaLabels?: boolean;
  // 전체 도면의 행 높이에 맞춰 표시하며, 단독 사용 시 기존 최소 높이를 유지한다.
  minAreaHeight?: number;
  // 고정 높이의 등록 도면에서는 칸을 균등 분배하고 최소 높이를 적용하지 않는다.
  fitHeight?: boolean;
  // 문이 많은 등록 도면의 좁은 영역은 여백을 줄인다.
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  // 도면 내부 상단의 구분 배지를 칸 선택 영역과 분리해 표시한다.
  areaHeader?: ReactNode;
  // 구조 저장 중에는 다른 칸을 선택하지 못하도록 터치와 접근성 상태를 함께 제한한다.
  disabled?: boolean;
  // 개별 위치 선택 모드에서는 칸·좌우 분할의 선택 위치를 변경한다.
  onSelectPosition?: (id: string) => void;
  // 등록 도면은 칸 대신 문·본체 전체에서 터치와 눌림 효과를 처리한다.
  onSelectArea?: (id: string) => void;
  // 칸 구성은 행 번호를 유지하고 좌우 분할의 개별 선택 ID를 함께 전달한다.
  selectedSlotIndex?: number;
  onSelectSlot?: (index: number, positionId?: string) => void;
}

/** 일반 문은 세로 막대, 서랍은 상단에 파인 사다리꼴 홈으로 표시한다. */
export function DoorHandle({ horizontal = false, storageMode, style }: {
  horizontal?: boolean; storageMode?: StorageMode | null; style?: StyleProp<ViewStyle>;
}) {
  const palette = storageMode ? fridgeDoorColors[storageMode] : null;
  const depth = 6;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.doorHandle, horizontal && [styles.horizontalHandle, { height: depth }], style]}>
      {horizontal ? (
        <View style={[styles.drawerPull, { height: depth }]}>
          <View style={[styles.drawerTrapezoid, {
            borderTopWidth: depth, borderLeftWidth: depth / 2, borderRightWidth: depth / 2,
            borderTopColor: palette?.handle ?? fridgeSurfaces.handle,
          }]} />
        </View>
      ) : <View style={[styles.handleGrip, palette && { backgroundColor: palette.handle }]} />}
    </View>
  );
}

/** 문 손잡이 반대편 상단에 작은 냉장·냉동 아이콘만 표시한다. */
export function DoorModeArt({ storageMode, size, handleOnLeft = false, style }: {
  storageMode: StorageMode | null; size: number; handleOnLeft?: boolean; style?: StyleProp<ViewStyle>;
}) {
  if (!storageMode) return null;
  const frozen = storageMode === 'FROZEN';
  const palette = fridgeDoorColors[storageMode];
  const color = palette.motif;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.modeArt, handleOnLeft ? styles.modeArtRight : styles.modeArtLeft, style]}>
      <MaterialDesignIcons name={frozen ? 'snowflake' : 'weather-windy'} size={size} color={color} accessible={false} />
    </View>
  );
}

/** U자형 포켓의 전면 안에서만 선택을 처리해 위쪽 빈 공간은 터치 대상에서 제외한다. */
function DoorPocketBin({ style, selectionStyle, selected = false, disabled = false, label, onSelect, children, minimumHeight }: {
  style?: StyleProp<ViewStyle>; selectionStyle?: StyleProp<ViewStyle>; selected?: boolean;
  disabled?: boolean; label?: string; onSelect?: () => void; children?: ReactNode; minimumHeight?: number;
}) {
  const Bin = onSelect ? Pressable : View;
  return (
    <View pointerEvents={onSelect ? 'box-none' : 'none'} accessibilityElementsHidden={onSelect ? undefined : true}
      importantForAccessibility={onSelect ? undefined : 'no-hide-descendants'} style={styles.pocketBin}>
      <Bin accessibilityRole={onSelect ? 'button' : undefined} accessibilityLabel={label}
        accessibilityState={onSelect ? { selected, disabled } : undefined} disabled={disabled}
        onPress={onSelect ? event => { event.stopPropagation(); onSelect(); } : undefined}
        style={[styles.pocketBinFront, style, selected && selectionStyle, minimumHeight !== undefined && { minHeight: minimumHeight }]}>{children}</Bin>
    </View>
  );
}

/** 칸·좌우 분할의 전체 경로와 선택 상태를 접근성 정보로 함께 제공한다. */
export function FridgeMap({
  areas, positions, ingredients, now, selectedPositionId, selectedAreaId, storageMode, cornerStyle, showIngredientCounts = true,
  showAreaLabels = true, minAreaHeight = 240, fitHeight = false, compact = false, style, areaHeader, disabled = false, onSelectPosition, onSelectArea,
  selectedSlotIndex, onSelectSlot,
}: FridgeMapProps) {
  const groupInteraction = !!onSelectArea;
  const slotInteraction = !!onSelectSlot;
  const positionInteraction = !groupInteraction && !slotInteraction;
  const Area = groupInteraction ? Pressable : View;
  const palette = storageMode ? fridgeDoorColors[storageMode] : null;
  const selectionColor = palette?.ink ?? fridgeSurfaces.handle;
  const shelfTheme = palette && { backgroundColor: palette.shelf };
  const pocketTheme = palette && {
    backgroundColor: palette.pocket, borderColor: palette.shelf,
  };
  // 개별 위치 테두리는 안쪽으로 그려 선택해도 칸 크기와 배경이 바뀌지 않게 한다.
  const positionSelection: ViewStyle = { ...StyleSheet.absoluteFill, borderWidth: 2, borderColor: selectionColor };
  const slotSelection: ViewStyle = { backgroundColor: palette?.selection ?? fridgeSurfaces.selection };
  // 본체는 1, 문 전체의 합도 1로 배분한다. 문 2개는 각각 0.5, 문 1개는 1이다.
  const doorCount = areas.filter(area => !area.isBody).length;
  const doorFlex = doorCount > 0 ? 1 / doorCount : 1;
  return (
    // 등록 가능한 최대 세 영역을 부모 너비 안에서 배분해 내용 길이가 전체 폭을 바꾸지 않게 한다.
    <View style={[styles.map, style]}>
      {areas.map(area => {
        const areaSelected = selectedAreaId === area.id;
        const rowInteraction = slotInteraction && area.isBody;
        const Position = rowInteraction ? Pressable : positionInteraction ? FeedbackPressable : View;
        return (
          <View key={area.id} style={[styles.area, { flex: area.isBody ? 1 : doorFlex }]}>
            {/* 홈은 칸별로, 등록 도면은 문·본체 전체를 한 번에 눌러 선택한다. */}
            {showAreaLabels ? <Text style={styles.areaLabel}>{area.name}</Text> : null}
            <Area accessible={slotInteraction ? false : undefined} accessibilityRole={groupInteraction ? 'button' : undefined}
              accessibilityLabel={groupInteraction ? `${area.compartment} → ${area.name}${area.isBody && storageMode
                ? `, ${storageMode === 'CHILLED' ? '냉장' : '냉동'}` : ''}` : undefined}
              accessibilityState={groupInteraction ? { selected: areaSelected, disabled } : undefined}
              disabled={disabled} onPress={groupInteraction ? () => onSelectArea?.(area.id) : undefined}
              style={[styles.areaInterior, { minHeight: minAreaHeight },
                getFridgeSurfaceStyle(storageMode),
                cornerStyle,
                areaSelected && !groupInteraction && { borderColor: selectionColor }]}>
              {areaHeader}
              <View style={[styles.areaContent, area.isBody && styles.bodyContent, { backgroundColor: palette?.frame ?? fridgeSurfaces.frame }]}>
                {/* 영역에 연결된 칸만 전달받은 순서대로 세로로 나열한다. */}
                {positions.filter(position => position.areaId === area.id)
                  .filter((position, index, all) => all.findIndex(candidate => candidate.slotId === position.slotId) === index).map((firstPosition, slotIndex) => {
                  // 위→아래 칸 순서를 유지하고 같은 칸의 좌우 분할만 한 행에 묶는다.
                  const slotPositions = positions.filter(position => position.slotId === firstPosition.slotId);
                  const slotLabel = `${area.compartment} → ${area.name} → ${getSlotName(slotIndex)}`;
                  // 칸 삭제·분할 변경으로 선택 ID가 사라지면 해당 행의 첫 위치를 선택한다.
                  const selectedSlotPositionId = slotPositions.some(position => position.id === selectedPositionId)
                    ? selectedPositionId : firstPosition.id;
                  return (
                    <View key={firstPosition.slotId}
                      style={[styles.slot, area.isBody && slotIndex > 0 && styles.slotSeparator]}>
                      <View style={styles.slotRow}>
                        {slotPositions.map((position, positionIndex) => {
                          const selected = rowInteraction
                            ? selectedSlotIndex === slotIndex && selectedSlotPositionId === position.id
                            : selectedAreaId ? areaSelected : selectedPositionId === position.id;
                          // 좌우 분할은 위치별로 집계하고, 수량 문자열과 관계없이 등록 한 건을 하나로 센다.
                          const counts = getIngredientCounts(showIngredientCounts ? ingredients.filter(ingredient => ingredient.positionId === position.id) : [], now);
                          const countLabel = showIngredientCounts ? `, ${getIngredientCountLabel(counts)}` : '';
                          const badges = counts.total > 0 ? (
                            <IngredientCountBadges counts={counts} placement="top-left" style={styles.ingredientBadges} />
                          ) : null;
                          return (
                            <Position key={position.id} accessible={rowInteraction || positionInteraction ? undefined : false}
                              accessibilityRole={rowInteraction || positionInteraction ? 'button' : undefined} accessibilityLabel={`${getPositionPath(area, position)}${countLabel}`}
                              accessibilityHint={position.drawerCount === 2 ? '좌우로 나뉜 칸' : undefined}
                              accessibilityState={{ selected, disabled }} disabled={disabled}
                              onPress={rowInteraction ? event => { event.stopPropagation(); onSelectSlot?.(slotIndex, position.id); }
                                : positionInteraction ? () => onSelectPosition?.(position.id) : undefined}
                              style={[styles.position, positionIndex > 0 && (area.isBody ? styles.bodyPositionSeparator : styles.positionSeparator),
                                compact && styles.compactPosition, fitHeight && styles.fittedPosition, !area.isBody && styles.pocketPosition, groupInteraction && styles.groupPosition]}>
                              {rowInteraction && selected ? (
                                <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                                  style={[styles.bodyCellHighlight, slotSelection]} />
                              ) : null}
                              {positionIndex > 0 ? (
                                <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                                  style={[styles.positionDivider, area.isBody && styles.bodyPositionDivider, shelfTheme]} />
                              ) : null}
                              {area.isBody ? badges : <DoorPocketBin style={pocketTheme} selectionStyle={slotSelection}
                                minimumHeight={counts.total > 0 ? getIngredientBadgeHeight(counts) + INGREDIENT_BADGE_INSET * 2 + POCKET_BORDER_WIDTH : undefined}
                                selected={slotInteraction && selectedSlotIndex === slotIndex} disabled={disabled}
                                label={slotInteraction ? `${slotLabel}${countLabel}` : undefined}
                                onSelect={slotInteraction ? () => onSelectSlot?.(slotIndex, firstPosition.id) : undefined}>{badges}</DoorPocketBin>}
                              {selected && positionInteraction && !selectedAreaId ? (
                                <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                                  style={positionSelection} />
                              ) : null}
                            </Position>
                          );
                        })}
                      </View>
                      {area.isBody && slotIndex > 0 ? (
                        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.bodyShelf, shelfTheme]} />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </Area>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  ingredientBadges: { top: INGREDIENT_BADGE_INSET, left: INGREDIENT_BADGE_INSET, right: INGREDIENT_BADGE_INSET, bottom: INGREDIENT_BADGE_INSET },
  modeArt: {
    position: 'absolute',
    top: DOOR_MODE_ART_INSET,
  },
  modeArtLeft: {
    left: DOOR_MODE_ART_INSET,
  },
  modeArtRight: {
    right: DOOR_MODE_ART_INSET,
  },
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
  // 본체·포켓은 이름과 좌우·하단 여백을 흰 바탕으로 두고 수납 영역에만 색을 적용한다.
  areaInterior: {
    flex: 1,
    minHeight: 240,
    borderWidth: fridgeSurfaces.frameWidth,
    borderColor: fridgeSurfaces.interior,
    borderRadius: fridgeSurfaces.radius,
    overflow: 'hidden',
    backgroundColor: fridgeSurfaces.interior,
  },
  areaContent: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: fridgeSurfaces.bodySideWidth - fridgeSurfaces.frameWidth,
    marginBottom: fridgeSurfaces.bodySideWidth - fridgeSurfaces.frameWidth,
    paddingHorizontal: AREA_CONTENT_PADDING,
    paddingBottom: AREA_CONTENT_PADDING,
    borderRadius: fridgeSurfaces.cavityRadius,
    overflow: 'hidden',
  },
  // 구분선 중심까지의 반간격을 바깥에도 적용하고 선택 배경과 외곽 모서리의 중심을 맞춘다.
  bodyContent: {
    paddingHorizontal: BODY_EDGE_INSET,
    paddingTop: BODY_EDGE_INSET,
    paddingBottom: BODY_EDGE_INSET,
    borderRadius: BODY_EDGE_INSET + BODY_CELL_RADIUS,
  },
  slot: {
    flex: 1,
  },
  // 좌우 분할도 선택한 위치의 내부 면만 칠하고 구분선 주변은 비워 둔다.
  bodyCellHighlight: {
    ...StyleSheet.absoluteFill,
    borderRadius: BODY_CELL_RADIUS,
    overflow: 'hidden',
  },
  // 선반과 양옆 여백을 칸 바깥에 확보해 선택 배경과 선반이 겹치지 않게 한다.
  slotSeparator: {
    marginTop: BODY_CELL_GAP,
  },
  bodyShelf: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -(BODY_CELL_GAP + BODY_SHELF_HEIGHT) / 2,
    height: BODY_SHELF_HEIGHT,
    borderRadius: 0,
    backgroundColor: fridgeSurfaces.shelf,
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
    borderWidth: POCKET_BORDER_WIDTH,
    borderColor: fridgeSurfaces.shelf,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: POCKET_BOTTOM_RADIUS,
    borderBottomRightRadius: POCKET_BOTTOM_RADIUS,
    backgroundColor: fridgeSurfaces.pocket,
    overflow: 'hidden',
  },
  slotRow: {
    flex: 1,
    flexDirection: 'row',
  },
  // 각 칸은 영역 안의 남는 세로 공간을 나눠 가지며 최소 터치 높이를 유지한다.
  position: {
    flex: 1,
    minHeight: MIN_EDIT_CELL_SIZE,
    minWidth: 0,
    padding: 8,
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'transparent',
  },
  positionSeparator: {
    borderLeftWidth: POSITION_SEPARATOR_WIDTH,
    borderLeftColor: 'transparent',
  },
  bodyPositionSeparator: {
    marginLeft: BODY_CELL_GAP,
  },
  // 구분선은 터치와 접근성 탐색을 가로채지 않는 별도 장식으로 표시한다.
  positionDivider: {
    position: 'absolute',
    left: -(BODY_SHELF_HEIGHT + POSITION_SEPARATOR_WIDTH) / 2,
    top: CELL_SEPARATOR_INSET,
    bottom: CELL_SEPARATOR_INSET,
    width: BODY_SHELF_HEIGHT,
    borderRadius: 0,
    backgroundColor: fridgeSurfaces.shelf,
  },
  // 좌우 칸 사이의 중앙에 놓고 모든 행에서 선택 배경과 같은 높이로 끝낸다.
  bodyPositionDivider: {
    left: -(BODY_CELL_GAP + BODY_SHELF_HEIGHT) / 2,
    top: 0,
    bottom: 0,
  },
  // 포켓의 둥근 바닥과 칸 아래 여백을 같은 위치에 맞춘다.
  pocketPosition: {
    paddingBottom: 4,
  },
  // 등록 도면의 칸은 부모 영역의 배경을 그대로 사용한다.
  groupPosition: {
    backgroundColor: 'transparent',
  },
  doorHandle: {
    position: 'absolute',
    width: 8,
    height: fridgeSurfaces.handleLength,
    borderRadius: 4,
  },
  horizontalHandle: {
    left: 0,
    right: 0,
    width: '100%',
    alignItems: 'center',
    borderRadius: 0,
  },
  drawerPull: {
    width: '50%',
    maxWidth: 128,
  },
  drawerTrapezoid: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  handleGrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 8,
    height: fridgeSurfaces.handleLength,
    borderRadius: 4,
    backgroundColor: fridgeSurfaces.handle,
  },
  compactPosition: {
    padding: 2,
  },
  fittedPosition: {
    minHeight: 0,
    paddingVertical: 2,
    gap: 0,
  },
});
