/**
 * @file
 * 등록 도면의 문을 누르면 본체와 연결된 도어 포켓을 함께 열어 화면 중앙에서 보여준다.
 * 문 수납은 기존 툴바·설정 패널에서 편집하며, 본체의 칸 표시와 선택 효과는 FridgeMap을 재사용한다.
 */
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useAnimatedValue } from 'react-native';
import type { LayoutRectangle, StyleProp, ViewStyle } from 'react-native';
import { DoorHandle, DoorModeArt, FridgeMap } from '@/features/fridge/components/FridgeMap';
import { areaNames, FRIDGE_ASPECT_RATIO, getDraftAreaLocation, getDraftLayout, getDraftRowGeometry, getStorageModeName } from '@/features/fridge/model/fridgeLayout';
import type { DraftDoor, FridgeLayout, RefrigeratorDraft, StorageArea, StorageMode } from '@/features/fridge/model/fridgeLayout';
import { colors, fridgeDoorColors, fridgeSurfaces, getFridgeSurfaceStyle } from '@/theme/tokens';

interface FridgeInteriorMapProps {
  draft: RefrigeratorDraft;
  selectedAreaId?: string;
  onSelectArea: (id: string) => void;
  focus?: FridgeFocusTarget | null;
  onFocus: (target: FridgeFocusTarget) => void;
  fitHeight?: boolean;
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
const ROW_GAP = 4;
const MAP_HEIGHT = 540;
const MAP_PADDING = 10;
const FOCUS_PADDING = 24;
const SCROLL_INDICATOR_SPACE = 16;

/** 단 사이 여백을 제외한 실제 문 크기와 좌표를 닫힌 도면·중앙 보기에서 공유한다. */
function getRowBounds(canvasHeight: number, count: number, index: number) {
  const height = Math.max(1, (canvasHeight - ROW_GAP * (count - 1)) / count);
  return { top: index * (height + ROW_GAP), height };
}

/** 흰 외곽을 제외한 내부 크기로 두 대각선을 계산해 비율과 관계없이 수납 영역을 가린다. */
export function DoorWithoutStorage({ label, selected, storageMode, cornerStyle, readOnly = false, onPress }: {
  label: string; selected: boolean; readOnly?: boolean; onPress?: () => void;
  storageMode?: StorageMode | null;
  cornerStyle?: ViewStyle;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const width = Math.max(0, size.width - fridgeSurfaces.frameWidth * 2);
  const height = Math.max(0, size.height - fridgeSurfaces.frameWidth * 2);
  const length = Math.hypot(width, height);
  const angle = Math.atan2(height, width) * 180 / Math.PI;
  return (
    <Pressable accessibilityRole={readOnly ? 'image' : 'button'} accessibilityLabel={`${label}, 수납 없음`} accessibilityState={{ selected }}
      pointerEvents={readOnly ? 'none' : 'auto'} onPress={readOnly ? undefined : onPress} onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setSize(current => current.width === width && current.height === height ? current : { width, height });
      }} style={[styles.noStorage, getFridgeSurfaceStyle(storageMode),
        { backgroundColor: storageMode ? fridgeDoorColors[storageMode].frame : fridgeSurfaces.frame }, cornerStyle]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {[angle, -angle].map((rotation, index) => (
          <View key={index} style={[styles.cross, {
            backgroundColor: storageMode ? `${fridgeDoorColors[storageMode].motif}66` : fridgeSurfaces.border,
            width: length, left: (width - length) / 2, top: (height - 2) / 2,
            transform: [{ rotate: `${rotation}deg` }],
          }]} />
        ))}
      </View>
    </Pressable>
  );
}

/** 도면 크기를 바꾸지 않고 선택 테두리와 옅은 그림자로 현재 영역을 표시한다. */
function SelectionFrame({ storageMode, style }: { storageMode: StorageMode | null; style?: StyleProp<ViewStyle> }) {
  const color = storageMode ? fridgeDoorColors[storageMode].ink : fridgeSurfaces.handle;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.selectionFrame, {
        borderColor: color,
        boxShadow: [
          { offsetX: 0, offsetY: 2, blurRadius: 6, color: `${color}20` },
        ],
      }, style]} />
  );
}

/** 열린 본체에는 보관 모드의 공간 이름을, 문 수납에는 도어포켓 이름만 표시한다. */
function InteriorArea({ area, layout, compact, selected, storageMode, cornerStyle, onSelectArea }: {
  area: StorageArea; layout: FridgeLayout; compact: boolean; selected: boolean;
  storageMode: StorageMode | null; onSelectArea: FridgeInteriorMapProps['onSelectArea'];
  cornerStyle?: ViewStyle;
}) {
  const positions = layout.positions.filter(position => position.areaId === area.id);
  const header = (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.interiorHeader, area.isBody && styles.bodyHeader]}>
      <Text numberOfLines={1} style={[styles.areaName, storageMode && { color: fridgeDoorColors[storageMode].ink }]}>
        {area.isBody ? storageMode ? getStorageModeName(storageMode) : '본체' : '도어포켓'}
      </Text>
    </View>
  );
  return (
    <View style={styles.area}>
      {!area.isBody && positions.length === 0 ? (
        <View style={[styles.areaMap, styles.placeholderFrame, cornerStyle]}>
          <DoorWithoutStorage label={`${area.compartment} ${area.name}`} selected={selected} storageMode={storageMode}
            cornerStyle={cornerStyle} onPress={() => onSelectArea(area.id)} />
          <View pointerEvents="none" style={styles.placeholderHeader}>{header}</View>
        </View>
      ) : <FridgeMap areas={[area]} positions={positions}
        ingredients={layout.ingredients} selectedAreaId={selected ? area.id : undefined} showIngredientCounts={false}
        showAreaLabels={false} minAreaHeight={0} fitHeight storageMode={storageMode} cornerStyle={cornerStyle}
        compact={compact} style={styles.areaMap} areaHeader={header}
        onSelectArea={() => onSelectArea(area.id)} />}
      {selected ? <SelectionFrame storageMode={storageMode} style={[StyleSheet.absoluteFill, cornerStyle]} /> : null}
    </View>
  );
}

/** 문 앞·뒷면을 같은 경첩으로 회전하고, 포켓 내용은 열림 완료 후 표시한다. */
function FridgeDoor({ door, label, phase, progress, selected, storageMode, style, onSelect, unfoldOffset = 0, bodyWidth, gridEdges, children }: {
  door: DraftDoor; label: string; phase: FridgeFocusPhase; progress: Animated.Value; selected: boolean; storageMode: StorageMode | null;
  style: AreaFrame; onSelect: () => void; unfoldOffset?: number; children?: ReactNode;
  bodyWidth?: number;
  gridEdges?: GridEdges;
}) {
  const drawer = door.kind === 'DRAWER';
  const closed = phase === 'closed';
  const leftHinge = door.side === 'LEFT_DOOR';
  const leafWidth = Number(style.width) - style.paddingLeft - style.paddingRight;
  const verticalPadding = typeof style.paddingVertical === 'number' ? style.paddingVertical : 0;
  const faceHeight = style.height - verticalPadding * 2;
  const artSize = Math.max(14, Math.min(56, leafWidth * 0.32, faceHeight * 0.28));
  const modeStyle = getFridgeSurfaceStyle(storageMode, 'exterior');
  const gridCorners = gridEdges ? getGridCorners(gridEdges) : undefined;
  const backCorners = gridEdges ? getGridCorners(gridEdges, true) : undefined;
  const gridStyle: ViewStyle | undefined = gridEdges ? {
    ...gridCorners, borderWidth: 1, borderLeftWidth: gridEdges.left ? 0 : 1, boxShadow: [],
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
          <DoorModeArt storageMode={storageMode} size={artSize} drawer={drawer}
            style={gridCorners} />
          <DoorHandle horizontal={drawer} storageMode={storageMode} style={drawer ? styles.drawerHandle
            : [styles.doorHandle, door.side === 'LEFT_DOOR' ? styles.handleRight : styles.handleLeft]} />
        </Pressable>
        <Animated.View pointerEvents="none" style={[styles.doorShade, gridCorners, {
          backgroundColor: storageMode ? fridgeDoorColors[storageMode].motif : fridgeSurfaces.ink,
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }),
        }]} />
        {selected ? <SelectionFrame storageMode={storageMode} style={[StyleSheet.absoluteFill, gridCorners, styles.doorFlatSurface]} /> : null}
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
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.exteriorFace, modeStyle, backCorners, styles.doorFlatSurface]} />
          <View pointerEvents={phase === 'open' ? 'auto' : 'none'} accessibilityElementsHidden={phase !== 'open'}
            importantForAccessibility={phase === 'open' ? 'auto' : 'no-hide-descendants'}
            style={[StyleSheet.absoluteFill, { opacity: phase === 'open' ? 1 : 0 }]}>{children}</View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** 같은 본체의 닫힌 문을 함께 선택 표시하고, 본체 전체의 화면 좌표를 측정해 중앙 보기를 연다. */
function FridgeCompartment({ group, row, rowIndex, rowCount, selectedAreaId, focus, width, top, height, canvasHeight, onSelectArea, onFocus }: {
  group: BodyGeometry; row: RefrigeratorDraft['rows'][number]; rowIndex: number; rowCount: number;
  selectedAreaId?: string; width: number; top: number; height: number; canvasHeight: number;
  onSelectArea: FridgeInteriorMapProps['onSelectArea'];
  focus: FridgeInteriorMapProps['focus']; onFocus: FridgeInteriorMapProps['onFocus'];
}) {
  const frameRef = useRef<View>(null);
  const progress = useAnimatedValue(0);
  const { body } = group;
  const selectedBody = selectedAreaId === body.id;
  const selectedDoor = body.doorIds.includes(selectedAreaId ?? '');

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
          gridEdges={getGridEdges(row, rowIndex, rowCount, [door.id])}
          label={`${getDraftAreaLocation(row, rowIndex, door.id)} ${door.kind === 'DRAWER' ? '서랍' : areaNames[door.side]}`}
          onSelect={() => { onSelectArea(door.kind === 'DRAWER' ? body.id : door.id); showArea(door); }}
          style={{ left: (left - group.left) * width, width: doorWidth * width, height,
            paddingLeft: 0, paddingRight: 0 }} />
      ))}
    </View>
  );
}

/** 닫힌 도면의 본체·문 크기를 유지하고, 펼친 위치와 실제 경첩 기준의 앞·뒷면 좌표만 계산한다. */
export function getFridgeFocusGeometry(draft: RefrigeratorDraft, focus: FridgeFocusTarget, viewport: LayoutRectangle) {
  const rowIndex = draft.rows.findIndex(row => row.compartments.some(body => body.id === focus.areaId));
  if (rowIndex < 0) return null;
  const row = draft.rows[rowIndex];
  const groups = getDraftRowGeometry(row).groups;
  const group = groups.find(group => group.body.id === focus.areaId)!;
  // 단 사이 여백을 제외한 닫힌 문의 크기와 위치를 열린 도면에서도 그대로 사용한다.
  const rowBounds = getRowBounds(focus.canvas.height, draft.rows.length, rowIndex);
  const source = { x: focus.canvas.x + group.left * focus.canvas.width,
    y: focus.canvas.y + rowBounds.top,
    width: Math.max(1, group.width * focus.canvas.width),
    height: rowBounds.height };
  const leftDoors = group.doors.filter(({ door }) => door.kind === 'HINGED' && door.side === 'LEFT_DOOR');
  const rightDoors = group.doors.filter(({ door }) => door.kind === 'HINGED' && door.side === 'RIGHT_DOOR');
  const pocketCount = leftDoors.length + rightDoors.length;
  const unitWidth = source.width / group.doors.length;
  const height = source.height;
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
  const scrollable = width > viewport.width - FOCUS_PADDING * 2 + 0.01;
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
  return { row, rowIndex, group, source, body, pockets, doors, width, height,
    scrollable, contentWidth, initialScrollX, scrollPaddingLeft, focusedLeft,
    left,
    top: source.y - viewport.y + (source.height - height) / 2,
    translateX: focusedLeft - left,
    translateY: viewport.y + viewport.height / 2 - (source.y + source.height / 2) };
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

/** 처음 표시한 안내는 노출 이력이 기록돼도 유지하고, 시간 경과·사용자 드래그로 종료한다. */
function FridgeScrollHint({ enabled, dismissed, viewport, onSeen }: {
  enabled: boolean; dismissed: boolean; viewport: LayoutRectangle; onSeen?: () => void;
}) {
  const [visible, setVisible] = useState(enabled);
  const opacity = useAnimatedValue(0);

  useEffect(() => {
    if (!visible || dismissed) return;
    onSeen?.();
    const fadeIn = Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true });
    fadeIn.start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    }, 1800);
    return () => {
      clearTimeout(timer);
      fadeIn.stop();
      opacity.stopAnimation();
    };
  }, [visible, dismissed, opacity, onSeen]);

  if (!visible || dismissed) return null;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.scrollHintOverlay, { width: viewport.width, height: viewport.height }]}>
      <Animated.View style={[styles.scrollHint, { opacity }]}>
        <MaterialDesignIcons name="arrow-left-right" size={20} color={colors.buttonText} accessible={false} />
        <Text style={styles.scrollHintLabel}>좌우로 밀어 확인</Text>
      </Animated.View>
    </View>
  );
}

/** 연결된 문은 함께 선택 표시해 펼치고, 열린 본체·포켓의 개별 선택은 기존 툴바에 전달한다. */
export function FridgeFocusView({ draft, target, viewport, overlayHeight, phase, selectedAreaId,
  scrollHintEnabled = false, scrollHintBlocked = false, onScrollHintSeen, onPhaseChange, onClose, onSelectArea }: {
  draft: RefrigeratorDraft; target: FridgeFocusTarget; viewport: LayoutRectangle; phase: FridgeFocusPhase;
  overlayHeight?: number;
  selectedAreaId?: string; onPhaseChange: (phase: FridgeFocusPhase) => void; onClose: () => void;
  scrollHintEnabled?: boolean; scrollHintBlocked?: boolean; onScrollHintSeen?: () => void;
  onSelectArea: FridgeInteriorMapProps['onSelectArea'];
}) {
  const progress = useAnimatedValue(0);
  const scrollRef = useRef<ScrollView>(null);
  const [scrollPosition, setScrollPosition] = useState({ key: '', x: 0 });
  const [hintDismissed, setHintDismissed] = useState(false);
  const geometry = getFridgeFocusGeometry(draft, target, viewport);
  const layout = getDraftLayout(draft);
  const open = phase === 'open';
  const scrollKey = `${target.areaId}:${geometry?.width}:${geometry?.height}:${viewport.width}`;
  const initialScrollX = geometry?.initialScrollX ?? 0;
  const scrollable = geometry?.scrollable ?? false;

  useEffect(() => {
    if (open && scrollable) scrollRef.current?.scrollTo({ x: initialScrollX, animated: false });
  }, [open, scrollable, scrollKey, initialScrollX]);

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
  const scrolling = open && geometry.scrollable;
  const scrollShift = scrollPosition.key === scrollKey ? scrollPosition.x - initialScrollX : 0;
  const area = layout.areas.find(candidate => candidate.id === group.body.id)!;
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
      left: scrolling ? geometry.scrollPaddingLeft : geometry.focusedLeft,
      top: scrolling ? 0 : (viewport.height - geometry.height) / 2, width: geometry.width, height: geometry.height,
      transform: scrolling ? [] : [
        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-geometry.translateX, -scrollShift] }) },
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-geometry.translateY, 0] }) },
      ],
    }]}>
      {/* 본체 프레임은 문 뒤에 유지하고, 칸·공간 이름과 경첩만 열림 완료 후 표시한다. */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFill, { opacity: open ? 1 : 0, zIndex: 2 }]}>
        {pockets.map(({ door, frame }) => (
          <DoorHinges key={door.id} height={body.height} storageMode={group.body.storageMode}
            fromX={door.side === 'LEFT_DOOR' ? frame.left + frame.width + HINGE_LENGTH / 2 : frame.left - HINGE_LENGTH / 2}
            toX={door.side === 'LEFT_DOOR' ? body.left - HINGE_LENGTH / 2 : body.left + body.width + HINGE_LENGTH / 2} />
        ))}
      </View>
      <Animated.View style={[styles.compartment, panelStyle(body)]}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, styles.bodyFrame,
            getFridgeSurfaceStyle(group.body.storageMode), bodyCorners]}>
          <View style={[styles.bodyCavity, {
            backgroundColor: group.body.storageMode ? fridgeDoorColors[group.body.storageMode].frame : fridgeSurfaces.frame,
          }]}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.interiorShade, {
              backgroundColor: group.body.storageMode ? fridgeDoorColors[group.body.storageMode].motif : fridgeSurfaces.ink,
              opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0] }),
            }]} />
          </View>
        </View>
        <View pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} style={[StyleSheet.absoluteFill, { opacity: open ? 1 : 0 }]}>
          <InteriorArea area={area} layout={layout} selected={selectedAreaId === area.id} storageMode={group.body.storageMode}
            cornerStyle={bodyCorners} compact={body.width < 120} onSelectArea={onSelectArea} />
        </View>
        {doors.map(({ door, frame, pocket, unfoldOffset }) => {
          const gridEdges = getGridEdges(row, rowIndex, draft.rows.length, [door.id]);
          return (
            <FridgeDoor key={door.id} door={door} label={`${getDraftAreaLocation(row, rowIndex, door.id)} ${areaNames[door.side]}`}
              phase={phase} progress={progress} bodyWidth={body.width} gridEdges={gridEdges}
              selected={target.returnAreaId === group.body.id || group.body.doorIds.includes(target.returnAreaId)}
              storageMode={group.body.storageMode}
              unfoldOffset={unfoldOffset} onSelect={() => onSelectArea(area.id)}
              style={{ left: frame.left, width: frame.width, height: body.height,
                paddingLeft: frame.paddingLeft, paddingRight: frame.paddingRight, paddingVertical: 0 }}>
              {pocket ? <InteriorArea area={layout.areas.find(candidate => candidate.id === door.id)!} layout={layout}
                selected={selectedAreaId === door.id} storageMode={group.body.storageMode} compact={pocket.frame.width < 120}
                cornerStyle={getGridCorners(gridEdges, true)} onSelectArea={onSelectArea} /> : null}
            </FridgeDoor>
          );
        })}
      </Animated.View>
    </Animated.View>
  );
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
      {scrolling ? (
        <ScrollView ref={scrollRef} horizontal scrollEnabled bounces={false} overScrollMode="never" removeClippedSubviews={false}
          accessibilityLabel="냉장고 내부 도면, 좌우로 이동" showsHorizontalScrollIndicator
          contentOffset={{ x: initialScrollX, y: 0 }} scrollEventThrottle={16}
          onScroll={({ nativeEvent }) => setScrollPosition({ key: scrollKey, x: nativeEvent.contentOffset.x })}
          onScrollBeginDrag={() => { setHintDismissed(true); onScrollHintSeen?.(); }}
          style={[styles.compartment, { left: 0, top: (viewport.height - geometry.height) / 2,
            width: viewport.width, height: geometry.height + SCROLL_INDICATOR_SPACE }]}>
          {/* 네이티브 스크롤 표시줄이 칸 위에 겹치지 않도록 도면 아래 공간을 남긴다. */}
          <View style={{ width: geometry.contentWidth, height: geometry.height + SCROLL_INDICATOR_SPACE }}>
            <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={onClose} />
            {scene}
          </View>
        </ScrollView>
      ) : scene}
      {scrolling && !scrollHintBlocked ? <FridgeScrollHint enabled={scrollHintEnabled} dismissed={hintDismissed}
        viewport={viewport} onSeen={onScrollHintSeen} /> : null}
    </View>
  );
}

/** 닫힌 도면은 단계 표시 아래에 비율을 유지해 배치하고, 중앙 보기로 이동한 영역은 원래 자리에서 숨긴다. */
export function FridgeInteriorMap({ draft, selectedAreaId, onSelectArea, focus, onFocus, fitHeight = false }: FridgeInteriorMapProps) {
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const { width: viewportWidth } = viewportSize;
  const maxHeight = fitHeight ? Math.min(MAP_HEIGHT, Math.max(1, viewportSize.height - MAP_PADDING * 2)) : MAP_HEIGHT;
  const mapWidth = Math.min(viewportWidth, maxHeight * FRIDGE_ASPECT_RATIO);
  const mapHeight = mapWidth / FRIDGE_ASPECT_RATIO;
  const rowGeometries = draft.rows.map(getDraftRowGeometry);

  return (
    <View style={[styles.viewport, fitHeight && styles.fittedViewport]} onLayout={({ nativeEvent }) => {
      const { width, height } = nativeEvent.layout;
      setViewportSize(current => current.width === width && current.height === height ? current : { width, height });
    }}>
      <View style={[styles.canvas, { width: mapWidth, height: mapHeight }]}>
        {viewportWidth > 0 ? rowGeometries.flatMap((rowGeometry, rowIndex) => {
          const bounds = getRowBounds(mapHeight, draft.rows.length, rowIndex);
          return rowGeometry.groups.map(group => (
            <FridgeCompartment key={group.body.id} group={group} row={draft.rows[rowIndex]} rowIndex={rowIndex} rowCount={draft.rows.length}
              selectedAreaId={selectedAreaId} focus={focus} onFocus={onFocus} width={mapWidth} top={bounds.top} height={bounds.height} canvasHeight={mapHeight}
              onSelectArea={onSelectArea} />
          ));
        }) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 도면 프레임과 선택 그림자가 잘리지 않도록 여백을 확보한다.
  viewport: {
    paddingVertical: MAP_PADDING,
  },
  fittedViewport: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-start',
  },
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
  scrollHint: {
    maxWidth: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 35, 31, 0.86)',
  },
  scrollHintLabel: {
    flexShrink: 1,
    color: colors.buttonText,
    fontSize: 13,
    lineHeight: 18,
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
    boxShadow: fridgeSurfaces.recessedShadow,
  },
  // 여닫는 동안에도 이름 자리의 흰 바탕과 둥근 본체 안쪽 면을 같은 위치에 유지한다.
  bodyCavity: {
    ...StyleSheet.absoluteFill,
    top: fridgeSurfaces.headerHeight,
    left: fridgeSurfaces.bodySideWidth - fridgeSurfaces.frameWidth,
    right: fridgeSurfaces.bodySideWidth - fridgeSurfaces.frameWidth,
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
    boxShadow: fridgeSurfaces.hardwareShadow,
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
    justifyContent: 'space-between',
    gap: 4,
    paddingHorizontal: 6,
  },
  bodyHeader: {
    paddingHorizontal: 0,
  },
  placeholderFrame: {
    borderRadius: fridgeSurfaces.radius,
    overflow: 'hidden',
  },
  placeholderHeader: {
    position: 'absolute',
    top: fridgeSurfaces.frameWidth,
    left: fridgeSurfaces.frameWidth,
    right: fridgeSurfaces.frameWidth,
  },
  areaName: {
    minWidth: 0,
    flexShrink: 1,
    paddingHorizontal: 4,
    color: fridgeSurfaces.ink,
    fontSize: 11,
    fontWeight: '600',
  },
  interiorShade: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: fridgeSurfaces.radius,
    backgroundColor: fridgeSurfaces.ink,
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
  // 회전하는 면의 그림자 마스크가 모서리에 남지 않게 하고, 열린 내부의 음영은 별도로 유지한다.
  doorFlatSurface: {
    boxShadow: [],
  },
  doorShade: {
    ...StyleSheet.absoluteFill,
    borderRadius: fridgeSurfaces.radius,
    backgroundColor: fridgeSurfaces.ink,
  },
  exteriorFace: {
    flex: 1,
    borderWidth: 1,
    borderColor: fridgeSurfaces.border,
    borderRadius: fridgeSurfaces.radius,
    backgroundColor: fridgeSurfaces.exterior,
    boxShadow: fridgeSurfaces.raisedShadow,
  },
  doorHandle: {
    top: '50%',
    marginTop: -20,
  },
  drawerHandle: {
    top: 12,
    left: '50%',
    marginLeft: -20,
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
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: fridgeSurfaces.frameWidth,
    borderColor: fridgeSurfaces.interior,
    borderRadius: fridgeSurfaces.radius,
    backgroundColor: fridgeSurfaces.frame,
    boxShadow: fridgeSurfaces.recessedShadow,
  },
  cross: {
    position: 'absolute',
    height: 2,
    backgroundColor: fridgeSurfaces.border,
  },
});
