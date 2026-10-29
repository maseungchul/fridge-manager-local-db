/**
 * @file
 * 홈 화면의 냉장고 배치도에서 영역·칸과 칸별 재료 수를 표시한다.
 * 칸을 누르면 식별자를 부모에 전달하고, 홈은 개별 칸·등록 미리보기는 영역 전체를 강조한다.
 * 홈과 최초 등록 미리보기에서 공유하며 선택 상태와 데이터 변경은 호출자가 관리한다.
 */
import type { ReactNode } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { colors, fridgeDoorColors, fridgeSurfaces, getFridgeSurfaceStyle, spacing } from '@/theme/tokens';
import { getPositionPath, getSlotName, getStorageModeName } from '../model/fridgeLayout';
import type { StyleProp, ViewStyle } from 'react-native';
import type { FridgeIngredient, StorageArea, SlotPosition, StorageMode } from '../model/fridgeLayout';

const BODY_SHELF_HEIGHT = 4;
const BODY_SHELF_SIDE_INSET = 3;

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
  // 배경과 선택 테두리·본체 접근성 라벨에 보관 모드를 반영한다.
  storageMode?: StorageMode | null;
  // 닫힌 도면에서 정한 본체·문 모서리를 열린 내부 프레임에도 유지한다.
  cornerStyle?: ViewStyle;
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
  // 등록 툴바에서 칸 구성을 펼친 동안에는 좌우 분할을 한 칸으로 묶어 선택한다.
  selectedSlotIndex?: number;
  onSelectSlot?: (index: number) => void;
}

/** 일반 문은 세로 막대, 서랍은 상단에 파인 사다리꼴 홈으로 표시하고 축소 도면에서는 홈 높이를 줄인다. */
export function DoorHandle({ horizontal = false, miniature = false, storageMode, style }: {
  horizontal?: boolean; miniature?: boolean; storageMode?: StorageMode | null; style?: StyleProp<ViewStyle>;
}) {
  const palette = storageMode ? fridgeDoorColors[storageMode] : null;
  const depth = miniature ? 7 : 12;
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

/** 문 앞면의 중앙 그림·공간 이름을 공유하고, 축소 도면에서는 이름을 숨긴다. */
export function DoorModeArt({ storageMode, size, miniature = false, drawer = false, style }: {
  storageMode: StorageMode | null; size: number; miniature?: boolean; drawer?: boolean; style?: StyleProp<ViewStyle>;
}) {
  if (!storageMode) return null;
  const frozen = storageMode === 'FROZEN';
  const palette = fridgeDoorColors[storageMode];
  const color = palette.motif;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.modeArt, miniature && styles.miniatureModeArt, drawer && !miniature && styles.drawerModeArt, style]}>
      <View style={[styles.modePrint, miniature && styles.miniatureModePrint]}>
        <MaterialDesignIcons name={frozen ? 'snowflake' : 'weather-windy'} size={size} color={color} accessible={false} />
        {!miniature ? <Text numberOfLines={1} style={[styles.modeName, { color: palette.ink, fontSize: size < 24 ? 10 : 12 }]}>
          {getStorageModeName(storageMode)}
        </Text> : null}
      </View>
    </View>
  );
}

/** 윗면이 열린 U자형 포켓을 표시하며, 내용과 터치는 부모 칸이 관리한다. */
function DoorPocketBin({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.pocketBin}>
      <View style={[styles.pocketBinFront, style]} />
    </View>
  );
}

/** 칸·좌우 분할의 전체 경로와 선택 상태를 접근성 정보로 함께 제공한다. */
export function FridgeMap({
  areas, positions, ingredients, selectedPositionId, selectedAreaId, storageMode, cornerStyle, showIngredientCounts = true,
  showAreaLabels = true, minAreaHeight = 240, fitHeight = false, compact = false, preview = false, style, areaHeader, disabled = false, onSelectPosition, onSelectArea,
  selectedSlotIndex, onSelectSlot,
}: FridgeMapProps) {
  const groupInteraction = !!onSelectArea && !preview;
  const slotInteraction = !!onSelectSlot && !preview;
  const Slot = slotInteraction ? Pressable : View;
  const Area = groupInteraction ? Pressable : View;
  const Position = preview || groupInteraction ? View : FeedbackPressable;
  const palette = storageMode ? fridgeDoorColors[storageMode] : null;
  const selectionColor = palette?.ink ?? fridgeSurfaces.handle;
  const materialShadow = palette ? fridgeSurfaces.shelfShadow.map(shadow => ({ ...shadow, color: `${palette.motif}22` })) : fridgeSurfaces.shelfShadow;
  const shelfTheme = palette && { backgroundColor: palette.shelf, boxShadow: materialShadow };
  const pocketTheme = palette && {
    backgroundColor: palette.pocket, borderColor: palette.shelf,
  };
  // 홈의 개별 위치 테두리는 안쪽으로 그려 선택해도 칸 크기와 배경이 바뀌지 않게 한다.
  const positionSelection: ViewStyle = { boxShadow: [
    { inset: true, offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 2, color: selectionColor },
  ] };
  const slotSelection: ViewStyle = { backgroundColor: `${selectionColor}33` };
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
              <View style={[styles.areaContent, { backgroundColor: palette?.frame ?? fridgeSurfaces.frame }]}>
                {/* 영역에 연결된 칸만 전달받은 순서대로 세로로 나열한다. */}
                {positions.filter(position => position.areaId === area.id)
                  .filter((position, index, all) => all.findIndex(candidate => candidate.slotId === position.slotId) === index).map((firstPosition, slotIndex) => {
                  // 위→아래 칸 순서를 유지하고 같은 칸의 좌우 분할만 한 행에 묶는다.
                  const slotPositions = positions.filter(position => position.slotId === firstPosition.slotId);
                  return (
                    <Slot key={firstPosition.slotId} accessibilityRole={slotInteraction ? 'button' : undefined}
                      accessibilityLabel={slotInteraction ? `${area.compartment} → ${area.name} → ${getSlotName(slotIndex)}` : undefined}
                      accessibilityState={slotInteraction ? { selected: selectedSlotIndex === slotIndex, disabled } : undefined}
                      disabled={disabled} onPress={slotInteraction ? event => { event.stopPropagation(); onSelectSlot?.(slotIndex); } : undefined}
                      style={[styles.slot, area.isBody && slotIndex > 0 && styles.slotSeparator]}>
                      {slotInteraction && selectedSlotIndex === slotIndex ? (
                        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                          style={[styles.slotHighlight, { top: (area.isBody && slotIndex > 0 ? BODY_SHELF_HEIGHT : 0) + 4 }, slotSelection]} />
                      ) : null}
                      <View style={styles.slotRow}>
                        {slotPositions.map((position, positionIndex) => {
                          const selected = selectedAreaId ? areaSelected : selectedPositionId === position.id;
                          return (
                            <Position key={position.id} accessible={groupInteraction ? false : undefined}
                              accessibilityRole={preview ? 'image' : groupInteraction ? undefined : 'button'} accessibilityLabel={getPositionPath(area, position)}
                              accessibilityHint={position.drawerCount === 2 ? '좌우로 나뉜 칸' : undefined}
                              accessibilityState={{ selected, disabled }} disabled={disabled} onPress={preview || groupInteraction ? undefined : () => onSelectPosition?.(position.id)}
                              style={[styles.position, positionIndex > 0 && styles.positionSeparator,
                                positionIndex > 0 && palette && { borderLeftColor: palette.border },
                                (compact || preview) && styles.compactPosition, (preview || fitHeight) && styles.fittedPosition, preview && styles.previewPosition, !area.isBody && styles.pocketPosition, selected && !groupInteraction && !selectedAreaId && positionSelection, groupInteraction && styles.groupPosition]}>
                              {!area.isBody ? <DoorPocketBin style={pocketTheme} /> : null}
                              {/* 좌우 분할은 서로 다른 선택 ID로 재료 수를 집계한다. */}
                              {showIngredientCounts ? <Text style={styles.positionCount}>{ingredients.filter(ingredient => ingredient.positionId === position.id).length}개</Text> : null}
                            </Position>
                          );
                        })}
                      </View>
                      {area.isBody && slotIndex > 0 ? (
                        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.bodyShelf, shelfTheme]} />
                      ) : null}
                    </Slot>
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
  modeArt: {
    ...StyleSheet.absoluteFill,
    borderRadius: fridgeSurfaces.radius,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modePrint: {
    alignItems: 'center',
    gap: 6,
  },
  miniatureModeArt: {
    borderRadius: 0,
  },
  // 서랍형 손잡이는 위쪽에 있어 인쇄를 아래로 옮겨 작은 문에서도 겹치지 않게 한다.
  drawerModeArt: {
    paddingTop: 18,
  },
  miniatureModePrint: {
    gap: 0,
  },
  modeName: {
    fontWeight: '600',
    letterSpacing: 0.6,
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
    boxShadow: fridgeSurfaces.recessedShadow,
  },
  areaContent: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: fridgeSurfaces.bodySideWidth - fridgeSurfaces.frameWidth,
    marginBottom: fridgeSurfaces.bodySideWidth - fridgeSurfaces.frameWidth,
    paddingHorizontal: 5,
    paddingBottom: 5,
    borderRadius: fridgeSurfaces.cavityRadius,
    overflow: 'hidden',
  },
  slot: {
    flex: 1,
  },
  // 선반과 같은 좌우 경계를 사용하고, 위쪽 선반 아래에서만 선택 배경을 칠한다.
  slotHighlight: {
    position: 'absolute',
    left: BODY_SHELF_SIDE_INSET,
    right: BODY_SHELF_SIDE_INSET,
    bottom: 0,
    overflow: 'hidden',
  },
  // 기존 경계 공간을 유지하고 선은 별도 장식으로 그려 칸 높이가 바뀌지 않게 한다.
  slotSeparator: {
    borderTopWidth: 1,
    borderTopColor: 'transparent',
  },
  bodyShelf: {
    position: 'absolute',
    left: BODY_SHELF_SIDE_INSET,
    right: BODY_SHELF_SIDE_INSET,
    top: 0,
    height: BODY_SHELF_HEIGHT,
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
    borderWidth: 3,
    borderColor: fridgeSurfaces.shelf,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
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
  // 등록 도면의 칸은 부모 영역의 배경을 그대로 사용한다.
  groupPosition: {
    backgroundColor: 'transparent',
  },
  doorHandle: {
    position: 'absolute',
    width: 8,
    height: fridgeSurfaces.handleLength,
    borderRadius: 4,
    boxShadow: fridgeSurfaces.hardwareShadow,
  },
  horizontalHandle: {
    left: 0,
    right: 0,
    width: '100%',
    alignItems: 'center',
    borderRadius: 0,
    boxShadow: [],
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
  previewPosition: {
    paddingHorizontal: 4,
  },
  positionCount: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
