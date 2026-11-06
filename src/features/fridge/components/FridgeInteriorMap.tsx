/**
 * @file
 * 등록·홈 도면의 문을 누르면 본체와 연결된 도어 포켓을 함께 열어 화면 중앙에서 보여준다.
 * 문 수납·칸 편집은 호출자가 관리하며, 내부 표시와 선택 효과는 FridgeMap을 재사용한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { Animated, Easing, Keyboard, Pressable, ScrollView, StyleSheet, Text, View, useAnimatedValue, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LayoutChangeEvent, LayoutRectangle, StyleProp, ViewStyle } from 'react-native';
import { Toast } from '@/components/Toast';
import { DOOR_MODE_ART_INSET, DoorHandle, DoorModeArt, FridgeMap, getFridgeAreaEditSize } from '@/features/fridge/components/FridgeMap';
import { areaNames, FRIDGE_ASPECT_RATIO, getDraftAreaLocation, getDraftLayout, getDraftRowGeometry, getStorageModeName } from '@/features/fridge/model/fridgeLayout';
import type { DraftDoor, FridgeLayout, RefrigeratorDraft, StorageArea, StorageMode } from '@/features/fridge/model/fridgeLayout';
import { IngredientCountBadges, getIngredientCountLabel } from '@/features/ingredient/components/IngredientCountBadges';
import { getIngredientCounts } from '@/features/ingredient/model/ingredient';
import type { Ingredient, IngredientCounts } from '@/features/ingredient/model/ingredient';
import { colors, fridgeDoorColors, fridgeSurfaces, getFridgeSurfaceStyle, spacing } from '@/theme/tokens';
import { getFridgeDiagramSizes } from '@/features/fridge/components/fridgeDiagramLayout';
import type { FridgeDiagramSize } from '@/features/fridge/components/fridgeDiagramLayout';

interface FridgeInteriorMapProps {
  draft: Pick<RefrigeratorDraft, 'rows'>;
  selectedAreaId?: string;
  onSelectArea: (id: string) => void;
  focus?: FridgeFocusTarget | null;
  onFocus: (target: FridgeFocusTarget) => void;
  fitHeight?: boolean;
  layoutSize?: FridgeDiagramSize;
  scrollVertically?: boolean;
  onCanvasOffsetChange?: (y: number) => void;
  ingredients?: Ingredient[];
  now?: Date;
}

/** 스크롤 위치를 포함한 원래 도면 좌표를 보관해 중앙 보기와 복귀에 함께 사용한다. */
export interface FridgeFocusTarget {
  areaId: string;
  returnAreaId: string;
  canvas: LayoutRectangle;
}

type BodyGeometry = ReturnType<typeof getDraftRowGeometry>['groups'][number];
type AreaFrame = ViewStyle & { height: number; paddingLeft: number; paddingRight: number };
type GridEdges = { top: boolean; left: boolean; bottom: boolean; right: boolean };
export type FridgeFocusPhase = 'closed' | 'opening' | 'open' | 'closing';

/** 등록·홈의 크기 기준과 보기 상태를 공유하며, 위치 계산용 예약 공간은 호출자가 정한다. */
export function useFridgeFocus(reservedBottom = 0, isBlocked?: () => boolean) {
  const diagramSizes = getFridgeDiagramSizes(useWindowDimensions(), useSafeAreaInsets());
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<FridgeFocusTarget | null>(null);
  const [focusPhase, setFocusPhase] = useState<FridgeFocusPhase>('closed');
  const [focusBounds, setFocusBounds] = useState<LayoutRectangle | null>(null);
  const [hasSeenScrollHint, setHasSeenScrollHint] = useState(false);
  const focusViewport = useRef<ComponentRef<typeof View>>(null);
  const viewportSize = useRef<{ width: number; height: number } | null>(null);
  const openRequest = useRef(0);
  const activeFocus = focusPhase === 'closed' ? null : focusTarget;
  const isFocusMoving = focusPhase === 'opening' || focusPhase === 'closing';
  const finishFocusTransition = useCallback((phase: FridgeFocusPhase) => {
    setFocusPhase(phase);
    if (phase === 'closed' && focusTarget) setSelectedAreaId(focusTarget.returnAreaId);
  }, [focusTarget]);
  const markScrollHintSeen = useCallback(() => setHasSeenScrollHint(true), []);
  const resetFocus = useCallback(() => {
    openRequest.current++;
    setFocusPhase('closed');
    setFocusTarget(null);
    setSelectedAreaId(null);
  }, []);

  useEffect(() => () => { openRequest.current++; }, []);

  function layoutFocusViewport({ nativeEvent }: LayoutChangeEvent) {
    const { width, height } = nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    const size = { width, height: Math.max(1, height - reservedBottom) };
    viewportSize.current = size;
    setFocusBounds(current => !current || (current.width === size.width && current.height === size.height)
      ? current : { ...current, ...size });
  }

  function openFocusedArea(target: FridgeFocusTarget) {
    if (isBlocked?.() || activeFocus) return;
    Keyboard.dismiss();
    const request = ++openRequest.current;
    focusViewport.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0 || isBlocked?.() || request !== openRequest.current) return;
      setFocusBounds({ x, y, ...(viewportSize.current ?? { width, height: Math.max(1, height - reservedBottom) }) });
      setFocusTarget(target);
      setSelectedAreaId(target.areaId);
      setFocusPhase('opening');
    });
  }

  const closeFocusedArea = useCallback(() => {
    if (isBlocked?.() || !activeFocus || focusPhase !== 'open') return;
    setFocusPhase('closing');
  }, [activeFocus, focusPhase, isBlocked]);

  return {
    selectedAreaId, setSelectedAreaId, focusTarget, setFocusTarget, focusPhase, focusBounds, focusViewport,
    activeFocus, isFocusMoving, hasSeenScrollHint, markScrollHintSeen, finishFocusTransition,
    resetFocus, layoutFocusViewport, openFocusedArea, closeFocusedArea, diagramSizes,
  };
}

/** 냉장고 전체 배치에서 본체·문에 인접한 단과 문이 있는지 같은 기준으로 구한다. */
function getGridEdges(row: RefrigeratorDraft['rows'][number], rowIndex: number, rowCount: number, doorIds: string[]): GridEdges {
  return {
    top: rowIndex > 0, bottom: rowIndex < rowCount - 1,
    left: row.doors[0].id !== doorIds[0], right: row.doors[row.doors.length - 1].id !== doorIds[doorIds.length - 1],
  };
}

/** 문 앞·뒷면과 선택 테두리의 모서리 값을 같은 기준으로 맞춘다. */
function getGridCorners(edges: GridEdges, mirrored = false): ViewStyle {
  const left = mirrored ? edges.right : edges.left;
  const right = mirrored ? edges.left : edges.right;
  return {
    borderRadius: 0,
    borderTopLeftRadius: !edges.top && !left ? fridgeSurfaces.radius : 0,
    borderTopRightRadius: !edges.top && !right ? fridgeSurfaces.radius : 0,
    borderBottomLeftRadius: !edges.bottom && !left ? fridgeSurfaces.radius : 0,
    borderBottomRightRadius: !edges.bottom && !right ? fridgeSurfaces.radius : 0,
  };
}

const HINGE_LENGTH = 14;
const HINGE_HEIGHT = 18;
const MAP_HEIGHT = 540;
const MAP_PADDING = 10;
const FOCUS_PADDING = 24;
const SCROLL_INDICATOR_SPACE = 16;

/** 같은 본체와 연결 포켓을 한 번씩 포함해 닫힌 도면의 재료 합계를 구한다. */
function getAreaIngredientCounts(layout: FridgeLayout, areaIds: readonly string[], now?: Date) {
  const positionIds = new Set(layout.positions.filter(position => areaIds.includes(position.areaId)).map(position => position.id));
  return getIngredientCounts(layout.ingredients.filter(ingredient => positionIds.has(ingredient.positionId)), now);
}

/** 전체 높이를 단별로 균등하게 나눈 문 크기와 좌표를 닫힌 도면·중앙 보기에서 공유한다. */
function getRowBounds(canvasHeight: number, count: number, index: number) {
  const height = Math.max(1, canvasHeight / count);
  return { top: index * height, height };
}

/** 실측 크기로 수납 없음의 X선을 그리고, 선택 콜백이 없는 홈에서는 읽기 전용으로 둔다. */
export function DoorWithoutStorage({ label, selected, storageMode, cornerStyle, areaHeader, onPress }: {
  label: string; selected: boolean; onPress?: () => void;
  storageMode?: StorageMode | null;
  cornerStyle?: ViewStyle;
  areaHeader?: ReactNode;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const length = Math.hypot(width, height);
  const angle = Math.atan2(height, width) * 180 / Math.PI;
  const Container = onPress ? Pressable : View;
  return (
    <Container accessible={onPress ? undefined : true} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}, 수납 없음`} accessibilityState={onPress ? { selected } : undefined}
      onPress={onPress}
      style={[styles.noStorage, getFridgeSurfaceStyle(storageMode), cornerStyle]}>
      {areaHeader}
      <View pointerEvents="none" style={[styles.pocketCavity,
        { backgroundColor: storageMode ? fridgeDoorColors[storageMode].frame : fridgeSurfaces.frame }]}
        onLayout={({ nativeEvent }) => {
          const { width, height } = nativeEvent.layout;
          setSize(current => current.width === width && current.height === height ? current : { width, height });
        }}>
        {[angle, -angle].map((rotation, index) => (
          <View key={index} style={[styles.cross, {
            backgroundColor: storageMode ? `${fridgeDoorColors[storageMode].motif}66` : fridgeSurfaces.border,
            width: length, left: (width - length) / 2, top: (height - 2) / 2,
            transform: [{ rotate: `${rotation}deg` }],
          }]} />
        ))}
      </View>
    </Container>
  );
}

/** 도면 크기를 바꾸지 않고 선택 테두리로 현재 영역을 표시한다. */
function SelectionFrame({ storageMode, style }: { storageMode: StorageMode | null; style?: StyleProp<ViewStyle> }) {
  const color = storageMode ? fridgeDoorColors[storageMode].ink : fridgeSurfaces.handle;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.selectionFrame, {
        borderColor: color,
      }, style]} />
  );
}

/** 열린 본체에는 보관 모드의 공간 이름을, 문 수납에는 도어포켓 이름만 표시한다. */
function InteriorArea({ area, layout, now, compact, selected, storageMode, cornerStyle, onSelectArea, selectedSlotIndex, selectedPositionId, onSelectSlot, disabled = false }: {
  area: StorageArea; layout: FridgeLayout; compact: boolean; selected: boolean;
  now?: Date;
  storageMode: StorageMode | null; onSelectArea?: FridgeInteriorMapProps['onSelectArea'];
  cornerStyle?: ViewStyle;
  selectedSlotIndex?: number;
  selectedPositionId?: string;
  onSelectSlot?: (index: number, positionId?: string) => void;
  disabled?: boolean;
}) {
  const positions = layout.positions.filter(position => position.areaId === area.id);
  const header = (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.interiorHeader}>
      <Text numberOfLines={1} style={[styles.areaName, storageMode && { color: fridgeDoorColors[storageMode].ink }]}>
        {area.isBody ? storageMode ? getStorageModeName(storageMode) : '본체' : '도어포켓'}
      </Text>
    </View>
  );
  return (
    <View style={styles.area}>
      {!area.isBody && positions.length === 0 ? (
        <DoorWithoutStorage label={`${area.compartment} ${area.name}`} selected={selected} storageMode={storageMode}
          cornerStyle={cornerStyle} areaHeader={header} onPress={onSelectArea ? () => onSelectArea(area.id) : undefined} />
      ) : <FridgeMap areas={[area]} positions={positions}
        ingredients={layout.ingredients} now={now} selectedAreaId={onSelectArea && selected ? area.id : undefined} showIngredientCounts={!onSelectArea}
        showAreaLabels={false} minAreaHeight={0} fitHeight storageMode={storageMode} cornerStyle={cornerStyle}
        compact={compact} style={styles.areaMap} areaHeader={header}
        selectedSlotIndex={selectedSlotIndex} selectedPositionId={selectedPositionId} onSelectSlot={onSelectSlot}
        disabled={disabled}
        onSelectArea={onSelectArea ? () => onSelectArea(area.id) : undefined} />}
      {selected && onSelectArea ? <SelectionFrame storageMode={storageMode} style={[StyleSheet.absoluteFill, cornerStyle]} /> : null}
    </View>
  );
}

/** 문 앞·뒷면을 같은 경첩으로 회전하고, 포켓 내부는 전환 중에도 유지하되 조작은 열림 완료 후 허용한다. */
function FridgeDoor({ door, label, phase, progress, selected, storageMode, style, onSelect, unfoldOffset = 0, bodyWidth, sourceSize, gridEdges, ingredientCounts, modeArt, children }: {
  door: DraftDoor; label: string; phase: FridgeFocusPhase; progress: Animated.Value; selected: boolean; storageMode: StorageMode | null;
  style: AreaFrame; onSelect: () => void; unfoldOffset?: number; children?: ReactNode;
  bodyWidth?: number;
  sourceSize?: { width: number; height: number };
  gridEdges?: GridEdges;
  ingredientCounts?: IngredientCounts;
  // 합친 본체는 첫 문에만 왼쪽 아이콘을 두고, 지정하지 않으면 손잡이 위치를 따른다.
  modeArt?: 'left' | 'hidden';
}) {
  const drawer = door.kind === 'DRAWER';
  const closed = phase === 'closed';
  const leftHinge = door.side === 'LEFT_DOOR';
  const leafWidth = Number(style.width) - style.paddingLeft - style.paddingRight;
  const verticalPadding = typeof style.paddingVertical === 'number' ? style.paddingVertical : 0;
  const faceHeight = style.height - verticalPadding * 2;
  // 중앙 보기로 옮길 때도 앞면 인쇄는 닫힌 문의 크기를 기준으로 유지한다.
  const artSize = Math.max(12, Math.min(22, (sourceSize?.width ?? leafWidth) * 0.16, (sourceSize?.height ?? faceHeight) * 0.18));
  const handleOnLeft = !drawer && !leftHinge;
  const modeStyle = getFridgeSurfaceStyle(storageMode, 'exterior');
  const contactColor = '#c0c9cf';
  const gridCorners = gridEdges ? getGridCorners(gridEdges) : undefined;
  const backCorners = gridEdges ? getGridCorners(gridEdges, true) : undefined;
  const gridStyle: ViewStyle | undefined = gridEdges ? {
    ...gridCorners, borderWidth: 0,
    ...(gridEdges.right && { borderRightWidth: 4, borderRightColor: contactColor }),
    ...(gridEdges.bottom && { borderBottomWidth: 4, borderBottomColor: contactColor }),
  } : undefined;

  return (
    <View pointerEvents="box-none" style={[styles.door, style, bodyWidth !== undefined && {
      left: `${Number(style.left) / bodyWidth * 100}%`, width: `${Number(style.width) / bodyWidth * 100}%`, height: '100%',
    }, drawer && styles.drawerClip]}>
      <Animated.View pointerEvents={closed ? 'auto' : 'none'} accessibilityElementsHidden={!closed}
        importantForAccessibility={closed ? 'auto' : 'no-hide-descendants'}
        style={[styles.doorFace, gridCorners, {
          left: style.paddingLeft, right: style.paddingRight, top: verticalPadding, bottom: verticalPadding,
          transformOrigin: drawer ? 'center center' : door.side === 'LEFT_DOOR' ? 'left center' : 'right center',
          transform: drawer ? [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, style.height] }) }]
            : [{ perspective: 1200 }, { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, unfoldOffset] }) },
              { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', leftHinge ? '-180deg' : '180deg'] }) }],
        }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${storageMode ? getStorageModeName(storageMode) : '보관 모드 미설정'} 열기`}
          accessibilityState={{ expanded: !closed, selected }} disabled={!closed} onPress={onSelect}
          style={[styles.exteriorFace, modeStyle, gridStyle]}>
          {modeArt !== 'hidden' ? (
            <DoorModeArt storageMode={storageMode} size={artSize} handleOnLeft={modeArt === 'left' ? false : handleOnLeft}
              style={gridCorners} />
          ) : null}
          {ingredientCounts && ingredientCounts.total > 0 ? (
            <IngredientCountBadges counts={ingredientCounts} placement={handleOnLeft ? 'top-right' : 'top-left'}
              style={{ top: DOOR_MODE_ART_INSET + artSize + 6, bottom: 4,
                // 세로 손잡이 쪽은 여백을 남기고, 서랍형은 가로 손잡이 아래 폭을 사용한다.
                left: handleOnLeft ? 30 : DOOR_MODE_ART_INSET,
                right: !drawer && !handleOnLeft ? 30 : DOOR_MODE_ART_INSET }} />
          ) : null}
          <DoorHandle horizontal={drawer} storageMode={storageMode} style={drawer ? styles.drawerHandle
            : [styles.doorHandle, door.side === 'LEFT_DOOR' ? styles.handleRight : styles.handleLeft]} />
        </Pressable>
      </Animated.View>
      {!drawer && children ? (
        <Animated.View pointerEvents={phase === 'open' ? 'auto' : 'none'} accessibilityElementsHidden={phase !== 'open'}
          importantForAccessibility={phase === 'open' ? 'auto' : 'no-hide-descendants'}
          style={[styles.doorBack, backCorners, { width: bodyWidth !== undefined ? '100%' : leafWidth, top: verticalPadding, bottom: verticalPadding,
            left: bodyWidth !== undefined ? (leftHinge ? '-100%' : '100%')
              : leftHinge ? style.paddingLeft - leafWidth : Number(style.width) - style.paddingRight,
            transformOrigin: leftHinge ? 'right center' : 'left center',
            transform: [{ perspective: 1200 }, { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, unfoldOffset] }) },
              { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: [leftHinge ? '180deg' : '-180deg', '0deg'] }) }],
          }]}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.exteriorFace, modeStyle, backCorners]} />
          <View pointerEvents={phase === 'open' ? 'auto' : 'none'} accessibilityElementsHidden={phase !== 'open'}
            importantForAccessibility={phase === 'open' ? 'auto' : 'no-hide-descendants'}
            style={StyleSheet.absoluteFill}>{children}</View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** 같은 본체의 닫힌 문을 함께 선택 표시하고, 본체 전체의 화면 좌표를 측정해 중앙 보기를 연다. */
function FridgeCompartment({ group, row, rowIndex, rowCount, layout, now, selectedAreaId, focus, width, top, height, canvasHeight, onSelectArea, onFocus }: {
  group: BodyGeometry; row: RefrigeratorDraft['rows'][number]; rowIndex: number; rowCount: number;
  layout?: FridgeLayout; now?: Date;
  selectedAreaId?: string; width: number; top: number; height: number; canvasHeight: number;
  onSelectArea: FridgeInteriorMapProps['onSelectArea'];
  focus: FridgeInteriorMapProps['focus']; onFocus: FridgeInteriorMapProps['onFocus'];
}) {
  const frameRef = useRef<ComponentRef<typeof View>>(null);
  const progress = useAnimatedValue(0);
  const { body } = group;
  const selectedBody = selectedAreaId === body.id;
  const selectedDoor = body.doorIds.includes(selectedAreaId ?? '');
  const counts = layout ? getAreaIngredientCounts(layout, [body.id, ...body.doorIds], now) : undefined;
  const countLabel = counts ? `, ${getIngredientCountLabel(counts)}` : '';

  function showArea(door: DraftDoor) {
    if (focus) return;
    frameRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      if (measuredWidth <= 0 || measuredHeight <= 0) return;
      onFocus({ areaId: body.id, returnAreaId: door.kind === 'DRAWER' ? body.id : door.id,
        canvas: { x: x - group.left * width, y: y - top, width, height: canvasHeight } });
    });
  }

  return (
    <View ref={frameRef} collapsable={false} style={[styles.compartment, { left: group.left * width, top,
      width: group.width * width, height, opacity: focus?.areaId === body.id ? 0 : 1 }, (selectedBody || selectedDoor) && styles.selectedArea]}>
      {group.doors.map(({ door, left, width: doorWidth }) => (
        <FridgeDoor key={door.id} door={door} phase="closed" progress={progress} selected={selectedBody || selectedDoor}
          storageMode={body.storageMode}
          modeArt={body.doorIds.length > 1 ? door.id === group.doors[0].door.id ? 'left' : 'hidden' : undefined}
          ingredientCounts={door.id === group.doors[0].door.id ? counts : undefined}
          gridEdges={getGridEdges(row, rowIndex, rowCount, [door.id])}
          label={`${getDraftAreaLocation(row, rowIndex, door.id)} ${door.kind === 'DRAWER' ? '서랍' : areaNames[door.side]}${countLabel}`}
          onSelect={() => { onSelectArea(door.kind === 'DRAWER' ? body.id : door.id); showArea(door); }}
          style={{ left: (left - group.left) * width, width: doorWidth * width, height,
            paddingLeft: 0, paddingRight: 0 }} />
      ))}
    </View>
  );
}

/** 공통 기준으로 크기를 정하고, 중앙 배치와 스크롤은 실제 표시 영역에 맞춘다. */
export function getFridgeFocusGeometry(draft: FridgeInteriorMapProps['draft'], focus: FridgeFocusTarget,
  viewport: LayoutRectangle, sizeViewport: FridgeDiagramSize = viewport, flushVerticalEdges = false) {
  const rowIndex = draft.rows.findIndex(row => row.compartments.some(body => body.id === focus.areaId));
  if (rowIndex < 0) return null;
  const row = draft.rows[rowIndex];
  const groups = getDraftRowGeometry(row).groups;
  const group = groups.find(group => group.body.id === focus.areaId)!;
  // 닫힌 문의 크기와 위치를 열기·닫기의 시작점으로 사용한다.
  const rowBounds = getRowBounds(focus.canvas.height, draft.rows.length, rowIndex);
  const source = { x: focus.canvas.x + group.left * focus.canvas.width,
    y: focus.canvas.y + rowBounds.top,
    width: Math.max(1, group.width * focus.canvas.width),
    height: rowBounds.height };
  const leftDoors = group.doors.filter(({ door }) => door.kind === 'HINGED' && door.side === 'LEFT_DOOR');
  const rightDoors = group.doors.filter(({ door }) => door.kind === 'HINGED' && door.side === 'RIGHT_DOOR');
  const pocketCount = leftDoors.length + rightDoors.length;
  const availableWidth = Math.max(1, viewport.width - FOCUS_PADDING * 2);
  const availableHeight = Math.max(1, viewport.height - (flushVerticalEdges ? 0 : FOCUS_PADDING * 2));
  const sizingWidth = Math.max(1, sizeViewport.width - FOCUS_PADDING * 2);
  const sizingHeight = Math.max(1, sizeViewport.height - FOCUS_PADDING * 2);
  const bodyMinimum = getFridgeAreaEditSize(group.body.slots, true);
  const pocketMinimums = [...leftDoors, ...rightDoors].map(({ door }) =>
    getFridgeAreaEditSize(door.storageEnabled ? door.slots : [], false));
  const minimumWidth = Math.max(bodyMinimum.width, ...pocketMinimums.map(size => size.width * group.doors.length));
  const minimumHeight = Math.max(bodyMinimum.height, ...pocketMinimums.map(size => size.height));
  function fitSize(indicatorHeight: number) {
    const availableBodyHeight = Math.max(1, sizingHeight - indicatorHeight);
    // 가용 공간에 먼저 맞추고 부족한 축만 보정해, 최소 너비 때문에 세로 길이까지 커지지 않게 한다.
    const ratio = Math.min(sizingWidth / source.width, availableBodyHeight / source.height);
    return { width: Math.max(minimumWidth, source.width * ratio), height: Math.max(minimumHeight, source.height * ratio) };
  }
  function unfoldedWidth(bodyWidth: number) {
    return bodyWidth / group.doors.length * (group.doors.length + pocketCount) + pocketCount * HINGE_LENGTH;
  }
  let size = fitSize(0);
  // 너비 보정으로 새로 좌우 이동이 필요해지는 경우도 표시줄 높이를 확보한다.
  if (unfoldedWidth(size.width) > sizingWidth + 0.01) size = fitSize(SCROLL_INDICATOR_SPACE);
  const unitWidth = size.width / group.doors.length;
  const height = size.height;
  const fitRatio = height / source.height;
  const width = unitWidth * (group.doors.length + pocketCount) + pocketCount * HINGE_LENGTH;

  function place(frame: { left: number; top: number; width: number; height: number }, original: LayoutRectangle) {
    return { ...frame,
      fromTranslateX: original.x + original.width / 2 - (source.x + source.width / 2)
        - (frame.left + frame.width / 2 - width / 2),
      fromTranslateY: original.y + original.height / 2 - (source.y + source.height / 2)
        - (frame.top + frame.height / 2 - height / 2),
      fromWidth: original.width, fromHeight: original.height };
  }

  const body = place({ left: leftDoors.length * (unitWidth + HINGE_LENGTH), top: 0,
    width: group.doors.length * unitWidth, height }, source);
  const pockets = [leftDoors, rightDoors].flatMap((placements, sideIndex) => placements.map(({ door }, index) => ({
    door, frame: { left: sideIndex === 0 ? index * (unitWidth + HINGE_LENGTH)
      : body.left + body.width + HINGE_LENGTH + index * (unitWidth + HINGE_LENGTH), top: 0, width: unitWidth, height },
  })));
  const doors = group.doors.map(({ door, left, width }) => {
    const frame = { left: (left - group.left) / group.width * body.width, width: width / group.width * body.width,
      paddingLeft: 0, paddingRight: 0 };
    const pocket = pockets.find(candidate => candidate.door.id === door.id);
    const leafWidth = frame.width - frame.paddingLeft - frame.paddingRight;
    const leftHinge = door.side === 'LEFT_DOOR';
    const unfoldedLeft = body.left + frame.left + (leftHinge ? frame.paddingLeft - leafWidth : frame.width - frame.paddingRight);
    const unfoldOffset = pocket ? pocket.frame.left + (leftHinge ? frame.paddingRight : frame.paddingLeft) - unfoldedLeft : 0;
    return { door, frame, pocket, unfoldOffset };
  });
  const scrollable = width > availableWidth + 0.01;
  // 홈의 끝 여백은 스크롤 내용에 넣어 평소 표시 영역을 미리 차감하지 않는다.
  const contentHeight = height + (scrollable ? SCROLL_INDICATOR_SPACE : 0) + (flushVerticalEdges ? spacing.sm : 0);
  // 최소 편집 높이가 들어오지 않으면 칸을 줄이지 않고 내부 도면만 상하 이동한다.
  const verticalScrollable = contentHeight > availableHeight + 0.01;
  const scrollViewportHeight = verticalScrollable ? availableHeight : contentHeight;
  const focusedTop = verticalScrollable ? Math.max(0, (viewport.height - availableHeight) / 2)
    : Math.max(0, Math.min((viewport.height - height) / 2, viewport.height - contentHeight));
  // 한쪽 열림은 본체를 반대쪽 화면 끝에 맞추고, 양쪽 열림은 가운데에 둔다.
  const bodyLeft = leftDoors.length > 0 && rightDoors.length === 0
    ? viewport.width - FOCUS_PADDING - body.width
    : rightDoors.length > 0 && leftDoors.length === 0 ? FOCUS_PADDING : (viewport.width - body.width) / 2;
  // 양끝 여백을 고정해 본체 끝 정렬 위치보다 더 멀리 스크롤되지 않게 한다.
  const scrollPaddingLeft = FOCUS_PADDING;
  const contentWidth = Math.max(viewport.width, width + FOCUS_PADDING * 2);
  const initialScrollX = scrollable ? Math.max(0, Math.min(contentWidth - viewport.width,
    scrollPaddingLeft + body.left - bodyLeft)) : 0;
  const focusedLeft = scrollable ? scrollPaddingLeft - initialScrollX : (viewport.width - width) / 2;
  const left = source.x - viewport.x + (source.width - width) / 2;
  const top = source.y - viewport.y + (source.height - height) / 2;
  return { row, rowIndex, group, source, body, pockets, doors, width, height,
    scrollable, verticalScrollable, scrollViewportHeight, fitRatio, contentHeight, contentWidth, initialScrollX, scrollPaddingLeft, focusedLeft, focusedTop,
    left,
    top,
    translateX: focusedLeft - left,
    translateY: focusedTop - top };
}

/** 연결 위치는 유지하고 손잡이와 같은 단색의 짧은 캡슐로 경첩을 표시한다. */
function DoorHinge({ storageMode, style }: { storageMode: StorageMode | null; style: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.hinge, style]}>
      <View style={[styles.hingePin, storageMode && { backgroundColor: fridgeDoorColors[storageMode].handle }]} />
    </View>
  );
}

/** 본체·포켓에 세로 경첩을 두 군데 표시하고, 먼 경계는 위아래 연결선으로 잇는다. */
function DoorHinges({ fromX, toX, height, storageMode }: { fromX: number; toX: number; height: number; storageMode: StorageMode | null }) {
  const adjacent = Math.abs(fromX - toX) < 0.01;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.hinges, { left: Math.min(fromX, toX), width: Math.abs(fromX - toX), height }]}>
      {[0.22, 0.78].map((ratio, index) => adjacent ? (
        <DoorHinge key={index} storageMode={storageMode} style={{ left: -HINGE_LENGTH / 2, width: HINGE_LENGTH,
          top: height * ratio - HINGE_HEIGHT / 2 }} />
      ) : (
        <View key={index} style={StyleSheet.absoluteFill}>
          <View style={[styles.hingeConnection, index === 0 ? styles.hingeConnectionTop : styles.hingeConnectionBottom,
            storageMode && { borderColor: `${fridgeDoorColors[storageMode].handle}99` },
            { top: index === 0 ? 1 : height * ratio, height: height * 0.22 - 1 }]} />
          <DoorHinge storageMode={storageMode} style={{ left: -HINGE_LENGTH / 2, width: HINGE_LENGTH / 2,
            top: height * ratio - HINGE_HEIGHT / 2 }} />
          <DoorHinge storageMode={storageMode} style={{ right: -HINGE_LENGTH / 2, width: HINGE_LENGTH / 2,
            top: height * ratio - HINGE_HEIGHT / 2 }} />
        </View>
      ))}
    </View>
  );
}

/** 처음 표시한 안내는 노출 이력·스크롤과 관계없이 유지하고, 공통 표시 시간이 끝나면 종료한다. */
function FridgeScrollHint({ enabled, viewport, onSeen }: {
  enabled: boolean; viewport: LayoutRectangle; onSeen?: () => void;
}) {
  const [visible, setVisible] = useState(enabled);

  useEffect(() => {
    if (!visible) return;
    onSeen?.();
  }, [visible, onSeen]);

  if (!visible) return null;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.scrollHintOverlay, { width: viewport.width, height: viewport.height }]}>
      <Toast message="좌우로 밀어 확인" icon="arrow-left-right" accessibilityHidden onDismiss={() => setVisible(false)} />
    </View>
  );
}

/** 연결된 문은 함께 펼치고, 홈은 칸 선택·등록과 편집은 영역 선택을 호출자에게 전달한다. */
export function FridgeFocusView({ draft, target, viewport, overlayHeight, phase, selectedAreaId,
  scrollHintEnabled = false, scrollHintBlocked = false, onScrollHintSeen, onPhaseChange, onClose, onSelectArea,
  selectedSlotIndex, selectedPositionId, onSelectSlot, sizeViewport, ingredients, now, flushVerticalEdges = false }: {
  draft: FridgeInteriorMapProps['draft']; target: FridgeFocusTarget; viewport: LayoutRectangle; phase: FridgeFocusPhase;
  ingredients?: Ingredient[];
  now?: Date;
  overlayHeight?: number;
  sizeViewport?: FridgeDiagramSize;
  flushVerticalEdges?: boolean;
  selectedAreaId?: string; onPhaseChange: (phase: FridgeFocusPhase) => void; onClose: () => void;
  scrollHintEnabled?: boolean; scrollHintBlocked?: boolean; onScrollHintSeen?: () => void;
  onSelectArea?: FridgeInteriorMapProps['onSelectArea'];
  selectedSlotIndex?: number;
  selectedPositionId?: string;
  onSelectSlot?: (areaId: string, index: number, positionId?: string) => void;
}) {
  const progress = useAnimatedValue(0);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const verticalScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [scrollPosition, setScrollPosition] = useState({ key: '', x: 0, y: 0 });
  const latestScrollPosition = useRef(scrollPosition);
  const previousVertical = useRef({ key: '', enabled: false });
  const geometry = getFridgeFocusGeometry(draft, target, viewport, sizeViewport, flushVerticalEdges);
  const layout = getDraftLayout(draft, ingredients);
  const open = phase === 'open';
  const scrollKey = `${target.areaId}:${geometry?.width}:${geometry?.height}:${viewport.width}`;
  const initialScrollX = geometry?.initialScrollX ?? 0;
  const scrollable = geometry?.scrollable ?? false;
  const verticalScrollable = geometry?.verticalScrollable ?? false;
  const maxScrollY = geometry ? Math.max(0, geometry.contentHeight - geometry.scrollViewportHeight) : 0;

  useEffect(() => {
    if (open && scrollable) scrollRef.current?.scrollTo({ x: initialScrollX, animated: false });
  }, [open, scrollable, scrollKey, initialScrollX]);

  // 툴바 높이만 달라지면 기존 스크롤을 보존하고, 새 표시 범위를 벗어난 값만 보정한다.
  useEffect(() => {
    const previous = previousVertical.current;
    const current = latestScrollPosition.current;
    const y = current.key === scrollKey ? Math.min(current.y, maxScrollY) : 0;
    const next = { key: scrollKey, x: current.key === scrollKey ? current.x : initialScrollX, y };
    if (open && verticalScrollable && (!previous.enabled || previous.key !== scrollKey || y !== current.y)) {
      verticalScrollRef.current?.scrollTo({ y, animated: false });
    }
    if (current.key === scrollKey && y !== current.y) {
      latestScrollPosition.current = next;
      setScrollPosition(next);
    }
    previousVertical.current = { key: scrollKey, enabled: open && verticalScrollable };
  }, [open, verticalScrollable, scrollKey, maxScrollY, initialScrollX]);

  useEffect(() => {
    if (phase !== 'opening' && phase !== 'closing') return;
    const opening = phase === 'opening';
    const animation = Animated.timing(progress, {
      toValue: opening ? 1 : 0, duration: opening ? 480 : 420,
      // 실제 너비·높이를 변경해 글자·배지까지 가로·세로 배율로 늘어나지 않게 한다.
      easing: Easing.inOut(Easing.cubic), useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) onPhaseChange(opening ? 'open' : 'closed');
    });
    return () => animation.stop();
  }, [phase, progress, onPhaseChange]);

  if (!geometry) return null;
  const { row, rowIndex, group, body, pockets, doors } = geometry;
  const bodyCorners = getGridCorners(getGridEdges(row, rowIndex, draft.rows.length, group.body.doorIds));
  const horizontalScrolling = open && geometry.scrollable;
  const verticalScrolling = open && geometry.verticalScrollable;
  const scrolling = horizontalScrolling || verticalScrolling;
  const scrollShift = scrollPosition.key === scrollKey ? scrollPosition.x - initialScrollX : 0;
  const scrollShiftY = scrollPosition.key === scrollKey ? Math.min(scrollPosition.y, maxScrollY) : 0;

  function updateScrollPosition(x?: number, y?: number) {
    const current = latestScrollPosition.current;
    const next = { key: scrollKey,
      x: x ?? (current.key === scrollKey ? current.x : initialScrollX),
      y: y ?? (current.key === scrollKey ? current.y : 0) };
    latestScrollPosition.current = next;
    setScrollPosition(next);
  }
  const area = layout.areas.find(candidate => candidate.id === group.body.id)!;
  const counts = ingredients ? getAreaIngredientCounts(layout, [area.id, ...group.body.doorIds], now) : undefined;
  function panelStyle(frame: typeof body) {
    return {
      left: progress.interpolate({ inputRange: [0, 1], outputRange: [frame.left + (frame.width - frame.fromWidth) / 2, frame.left] }),
      top: progress.interpolate({ inputRange: [0, 1], outputRange: [frame.top + (frame.height - frame.fromHeight) / 2, frame.top] }),
      width: progress.interpolate({ inputRange: [0, 1], outputRange: [frame.fromWidth, frame.width] }),
      height: progress.interpolate({ inputRange: [0, 1], outputRange: [frame.fromHeight, frame.height] }),
      transform: [
        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [frame.fromTranslateX, 0] }) },
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [frame.fromTranslateY, 0] }) },
      ] };
  }
  // 닫을 때는 스크롤 위치도 같은 진행값으로 원점에 돌려 시작 화면으로 튀지 않게 한다.
  const scene = (
    <Animated.View onStartShouldSetResponder={() => !scrolling} style={[styles.compartment, {
      left: horizontalScrolling ? geometry.scrollPaddingLeft : geometry.focusedLeft,
      top: scrolling ? 0 : geometry.focusedTop, width: geometry.width, height: geometry.height,
      transform: scrolling ? [] : [
        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-geometry.translateX, -scrollShift] }) },
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-geometry.translateY, -scrollShiftY] }) },
      ],
    }]}>
      {/* 경첩은 문 뒷면이 드러난 뒤 표시하고, 크기를 조절하는 동안에도 본체 중심과 높이를 따라간다. */}
      <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFill, {
          opacity: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' }),
          transformOrigin: [body.left + body.width / 2, body.height / 2, 0],
          transform: [...panelStyle(body).transform,
            { scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [body.fromWidth / body.width, 1] }) },
            { scaleY: progress.interpolate({ inputRange: [0, 1], outputRange: [body.fromHeight / body.height, 1] }) }],
          zIndex: 2,
        }]}>
        {pockets.map(({ door, frame }) => (
          <DoorHinges key={door.id} height={body.height} storageMode={group.body.storageMode}
            fromX={door.side === 'LEFT_DOOR' ? frame.left + frame.width + HINGE_LENGTH / 2 : frame.left - HINGE_LENGTH / 2}
            toX={door.side === 'LEFT_DOOR' ? body.left - HINGE_LENGTH / 2 : body.left + body.width + HINGE_LENGTH / 2} />
        ))}
      </Animated.View>
      <Animated.View style={[styles.compartment, panelStyle(body)]}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, styles.bodyFrame,
            getFridgeSurfaceStyle(group.body.storageMode), bodyCorners]}>
          <View style={[styles.bodyCavity, {
            backgroundColor: group.body.storageMode ? fridgeDoorColors[group.body.storageMode].frame : fridgeSurfaces.frame,
          }]} />
        </View>
        <View pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} style={StyleSheet.absoluteFill}>
          <InteriorArea area={area} layout={layout} now={now} selected={selectedAreaId === area.id} storageMode={group.body.storageMode}
            selectedPositionId={selectedAreaId === area.id ? selectedPositionId : undefined}
            selectedSlotIndex={selectedAreaId === area.id ? selectedSlotIndex : undefined} disabled={!onSelectArea && !open}
            onSelectSlot={onSelectSlot && (!onSelectArea || open && selectedSlotIndex !== undefined)
              ? (index, positionId) => { if (open) onSelectSlot(area.id, index, positionId); } : undefined}
            cornerStyle={bodyCorners} compact={body.width < 120} onSelectArea={onSelectArea} />
        </View>
        {doors.map(({ door, frame, pocket, unfoldOffset }) => {
          const gridEdges = getGridEdges(row, rowIndex, draft.rows.length, [door.id]);
          return (
            <FridgeDoor key={door.id} door={door} label={`${getDraftAreaLocation(row, rowIndex, door.id)} ${areaNames[door.side]}`}
              phase={phase} progress={progress} bodyWidth={body.width} gridEdges={gridEdges}
              sourceSize={{ width: body.fromWidth * frame.width / body.width, height: body.fromHeight }}
              selected={target.returnAreaId === group.body.id || group.body.doorIds.includes(target.returnAreaId)}
              storageMode={group.body.storageMode}
              modeArt={group.body.doorIds.length > 1 ? door.id === doors[0].door.id ? 'left' : 'hidden' : undefined}
              ingredientCounts={door.id === doors[0].door.id ? counts : undefined}
              unfoldOffset={unfoldOffset} onSelect={() => onSelectArea?.(area.id)}
              style={{ left: frame.left, width: frame.width, height: body.height,
                paddingLeft: frame.paddingLeft, paddingRight: frame.paddingRight, paddingVertical: 0 }}>
              {pocket ? <InteriorArea area={layout.areas.find(candidate => candidate.id === door.id)!} layout={layout} now={now}
                selected={selectedAreaId === door.id} storageMode={group.body.storageMode} compact={pocket.frame.width < 120}
                selectedSlotIndex={!onSelectArea && selectedAreaId === door.id ? selectedSlotIndex : undefined} disabled={!onSelectArea && !open}
                onSelectSlot={!onSelectArea && onSelectSlot ? (index, positionId) => { if (open) onSelectSlot(door.id, index, positionId); } : undefined}
                cornerStyle={getGridCorners(gridEdges, true)} onSelectArea={onSelectArea} /> : null}
            </FridgeDoor>
          );
        })}
      </Animated.View>
    </Animated.View>
  );
  // 각 수납 칸의 편집 크기를 유지하고, 넘치는 방향에만 도면 내부 스크롤을 허용한다.
  const horizontalScene = horizontalScrolling ? (
    <ScrollView ref={scrollRef} horizontal scrollEnabled nestedScrollEnabled directionalLockEnabled bounces={false} overScrollMode="never" removeClippedSubviews={false}
      accessibilityLabel="냉장고 내부 도면, 좌우로 이동" showsHorizontalScrollIndicator
      contentOffset={{ x: initialScrollX, y: 0 }} scrollEventThrottle={16}
      onScroll={({ nativeEvent }) => updateScrollPosition(nativeEvent.contentOffset.x)}
      style={[styles.compartment, { left: 0, top: verticalScrolling ? 0 : geometry.focusedTop,
        width: viewport.width, height: geometry.contentHeight }]}>
      {/* 네이티브 스크롤 표시줄이 칸 위에 겹치지 않도록 도면 아래 공간을 남긴다. */}
      <View style={{ width: geometry.contentWidth, height: geometry.contentHeight }}>
        <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={onClose} />
        {scene}
      </View>
    </ScrollView>
  ) : scene;
  const scrollScene = verticalScrolling ? (
    <ScrollView ref={verticalScrollRef} horizontal={false} scrollEnabled nestedScrollEnabled directionalLockEnabled bounces={false}
      overScrollMode="never" removeClippedSubviews={false} showsVerticalScrollIndicator scrollEventThrottle={16}
      accessibilityLabel="냉장고 내부 도면, 위아래로 이동"
      onScroll={({ nativeEvent }) => updateScrollPosition(undefined, nativeEvent.contentOffset.y)}
      style={[styles.compartment, { left: 0, top: geometry.focusedTop, width: viewport.width, height: geometry.scrollViewportHeight }]}>
      <View style={{ width: viewport.width, height: geometry.contentHeight }}>
        <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={onClose} />
        {horizontalScene}
      </View>
    </ScrollView>
  ) : horizontalScene;
  return (
    // 배경 덮개는 툴바 공간까지 채우고, 중앙 좌표는 툴바를 제외한 viewport로 계산한다.
    <View style={[styles.focusOverlay, { height: Math.max(viewport.height, overlayHeight ?? viewport.height), bottom: undefined }]}
      onAccessibilityEscape={onClose}>
      <Animated.View pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} style={[StyleSheet.absoluteFill, styles.focusBackdrop, {
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.78] }),
      }]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="냉장고 도면 바깥 영역 눌러 닫기"
          accessibilityState={{ disabled: !open }} disabled={!open} onPress={onClose} />
      </Animated.View>
      {scrollScene}
      {horizontalScrolling && !scrollHintBlocked ? <FridgeScrollHint enabled={scrollHintEnabled}
        viewport={viewport} onSeen={onScrollHintSeen} /> : null}
    </View>
  );
}

/** 닫힌 도면은 공통 크기 기준으로 배치하고, 중앙 보기로 이동한 영역은 원래 자리에서 숨긴다. */
export function FridgeInteriorMap({ draft, ingredients, now, selectedAreaId, onSelectArea, focus, onFocus, fitHeight = false, layoutSize,
  scrollVertically = false, onCanvasOffsetChange }: FridgeInteriorMapProps) {
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const size = layoutSize ?? viewportSize;
  const { width: viewportWidth } = size;
  const maxHeight = fitHeight ? Math.min(MAP_HEIGHT, Math.max(1, size.height - MAP_PADDING * 2)) : MAP_HEIGHT;
  const mapWidth = Math.min(viewportWidth, maxHeight * FRIDGE_ASPECT_RATIO);
  const mapHeight = mapWidth / FRIDGE_ASPECT_RATIO;
  const rowGeometries = draft.rows.map(getDraftRowGeometry);
  const layout = ingredients ? getDraftLayout(draft, ingredients) : undefined;
  const canvas = (
    <View style={[styles.canvas, { width: mapWidth, height: mapHeight }]}>
      {viewportWidth > 0 ? rowGeometries.flatMap((rowGeometry, rowIndex) => {
        const bounds = getRowBounds(mapHeight, draft.rows.length, rowIndex);
        return rowGeometry.groups.map(group => (
          <FridgeCompartment key={group.body.id} group={group} row={draft.rows[rowIndex]} rowIndex={rowIndex} rowCount={draft.rows.length} layout={layout} now={now}
            selectedAreaId={selectedAreaId} focus={focus} onFocus={onFocus} width={mapWidth} top={bounds.top} height={bounds.height} canvasHeight={mapHeight}
            onSelectArea={onSelectArea} />
        ));
      }) : null}
    </View>
  );

  return (
    <View style={[styles.viewport, fitHeight && styles.fittedViewport, scrollVertically && styles.flushViewport]} onLayout={({ nativeEvent }) => {
      const { width, height } = nativeEvent.layout;
      setViewportSize(current => current.width === width && current.height === height ? current : { width, height });
    }}>
      {scrollVertically ? <ScrollView accessibilityLabel="냉장고 전체 도면, 위아래로 이동" scrollEnabled={!focus}
        nestedScrollEnabled bounces={false} showsVerticalScrollIndicator removeClippedSubviews={false} scrollEventThrottle={16}
        contentContainerStyle={styles.mapScrollContent}
        onScroll={({ nativeEvent }) => onCanvasOffsetChange?.(nativeEvent.contentOffset.y)} style={styles.mapScroll}>
        {canvas}
      </ScrollView> : canvas}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    paddingVertical: MAP_PADDING,
  },
  fittedViewport: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-start',
  },
  mapScroll: { flex: 1 },
  flushViewport: { paddingVertical: 0 },
  // 상단 간격은 콘텐츠와 함께 스크롤하고, 하단은 끝까지 내렸을 때만 여유를 둔다.
  mapScrollContent: { paddingTop: spacing.sm, paddingBottom: spacing.sm },
  canvas: {
    height: MAP_HEIGHT,
    alignSelf: 'center',
    borderRadius: fridgeSurfaces.radius,
    overflow: 'hidden',
  },
  compartment: {
    position: 'absolute',
  },
  focusOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
  },
  focusBackdrop: {
    backgroundColor: colors.background,
  },
  scrollHintOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  area: {
    ...StyleSheet.absoluteFill,
  },
  areaMap: {
    flex: 1,
  },
  // 칸과 공간 이름을 숨겨도 문 뒤의 본체가 비어 보이지 않도록 프레임을 별도로 유지한다.
  bodyFrame: {
    borderWidth: fridgeSurfaces.frameWidth,
    borderColor: fridgeSurfaces.interior,
    borderRadius: fridgeSurfaces.radius,
    backgroundColor: fridgeSurfaces.interior,
  },
  // 여닫는 동안에도 이름 자리의 흰 바탕과 둥근 본체 안쪽 면을 같은 위치에 유지한다.
  bodyCavity: {
    ...StyleSheet.absoluteFill,
    top: fridgeSurfaces.headerHeight,
    left: fridgeSurfaces.bodySideWidth - fridgeSurfaces.frameWidth,
    right: fridgeSurfaces.bodySideWidth - fridgeSurfaces.frameWidth,
    bottom: fridgeSurfaces.bodySideWidth - fridgeSurfaces.frameWidth,
    borderRadius: fridgeSurfaces.cavityRadius,
    overflow: 'hidden',
  },
  pocketCavity: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: fridgeSurfaces.bodySideWidth - fridgeSurfaces.frameWidth,
    marginBottom: fridgeSurfaces.bodySideWidth - fridgeSurfaces.frameWidth,
    borderRadius: fridgeSurfaces.cavityRadius,
    overflow: 'hidden',
  },
  hinges: {
    position: 'absolute',
  },
  hinge: {
    position: 'absolute',
    height: HINGE_HEIGHT,
  },
  hingePin: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    marginLeft: -4,
    width: 8,
    borderRadius: 4,
    backgroundColor: fridgeSurfaces.handle,
  },
  hingeConnection: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: `${fridgeSurfaces.handle}66`,
  },
  hingeConnectionTop: {
    borderTopWidth: 1,
  },
  hingeConnectionBottom: {
    borderBottomWidth: 1,
  },
  interiorHeader: {
    minHeight: fridgeSurfaces.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 0,
  },
  areaName: {
    minWidth: 0,
    flexShrink: 1,
    paddingHorizontal: 4,
    color: fridgeSurfaces.ink,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  selectedArea: {
    zIndex: 1,
  },
  selectionFrame: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: fridgeSurfaces.radius,
    borderWidth: 2,
    zIndex: 1,
  },
  door: {
    position: 'absolute',
    top: 0,
  },
  drawerClip: {
    overflow: 'hidden',
  },
  doorFace: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: fridgeSurfaces.radius,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  },
  doorBack: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: fridgeSurfaces.radius,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  },
  exteriorFace: {
    flex: 1,
    borderWidth: 0,
    borderColor: fridgeSurfaces.border,
    borderRadius: fridgeSurfaces.radius,
    backgroundColor: fridgeSurfaces.exterior,
  },
  doorHandle: {
    top: '50%',
    marginTop: -fridgeSurfaces.handleLength / 2,
  },
  drawerHandle: {
    top: 0,
  },
  handleLeft: {
    left: 10,
  },
  handleRight: {
    right: 10,
  },
  noStorage: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    borderWidth: fridgeSurfaces.frameWidth,
    borderColor: fridgeSurfaces.interior,
    borderRadius: fridgeSurfaces.radius,
    backgroundColor: fridgeSurfaces.interior,
  },
  cross: {
    position: 'absolute',
    height: 2,
    backgroundColor: fridgeSurfaces.border,
  },
});
