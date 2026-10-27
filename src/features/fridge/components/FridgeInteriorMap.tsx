/**
 * @file
 * 등록 도면의 문을 누르면 본체와 연결된 도어 포켓을 함께 열어 화면 중앙에서 보여준다.
 * 문 수납은 기존 툴바·설정 패널에서 편집하며, 본체의 칸 표시와 선택 효과는 FridgeMap을 재사용한다.
 */
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useAnimatedValue } from 'react-native';
import type { LayoutRectangle, StyleProp, ViewStyle } from 'react-native';
import { DoorHandle, FridgeMap } from '@/features/fridge/components/FridgeMap';
import { areaNames, getDraftAreaLocation, getDraftLayout, getDraftRowGeometry } from '@/features/fridge/model/fridgeLayout';
import type { DraftDoor, FridgeLayout, RefrigeratorDraft, StorageArea, StorageMode } from '@/features/fridge/model/fridgeLayout';
import { colors, fridgeSurfaces } from '@/theme/tokens';

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
export type FridgeFocusPhase = 'closed' | 'opening' | 'open' | 'closing';

const HINGE_LENGTH = 3;
const HINGE_HEIGHT = 18;
const GROUP_GAP = 6;
const MAP_HEIGHT = 540;
const MAP_PADDING = 10;
const modeColors = {
  CHILLED: { color: colors.chilled, backgroundColor: colors.chilledBackground },
  FROZEN: { color: colors.frozen, backgroundColor: colors.frozenBackground },
};

/** 실제 프레임 크기로 두 대각선을 계산해 가로·세로 비율과 관계없이 문 전체를 가린다. */
export function DoorWithoutStorage({ label, selected, storageMode, readOnly = false, onPress }: {
  label: string; selected: boolean; readOnly?: boolean; onPress?: () => void;
  storageMode?: StorageMode | null;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const length = Math.hypot(size.width, size.height);
  const angle = Math.atan2(size.height, size.width) * 180 / Math.PI;
  return (
    <Pressable accessibilityRole={readOnly ? 'image' : 'button'} accessibilityLabel={`${label}, 수납 없음`} accessibilityState={{ selected }}
      pointerEvents={readOnly ? 'none' : 'auto'} onPress={readOnly ? undefined : onPress} onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setSize(current => current.width === width && current.height === height ? current : { width, height });
      }} style={[styles.noStorage, selected && storageMode && { backgroundColor: modeColors[storageMode].backgroundColor }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {[angle, -angle].map((rotation, index) => (
          <View key={index} style={[styles.cross, {
            width: length, left: (size.width - length) / 2, top: (size.height - 2) / 2,
            transform: [{ rotate: `${rotation}deg` }],
          }]} />
        ))}
      </View>
    </Pressable>
  );
}

/** 도면 크기를 바꾸지 않고 문·본체 위에 같은 선택 테두리와 퍼짐 효과를 표시한다. */
function SelectionFrame({ storageMode, style }: { storageMode: StorageMode | null; style?: StyleProp<ViewStyle> }) {
  const color = storageMode ? modeColors[storageMode].color : colors.button;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.selectionFrame, {
        borderColor: color,
        boxShadow: [
          { offsetX: 0, offsetY: 0, blurRadius: 4, spreadDistance: 1, color: `${color}66` },
          { offsetX: 0, offsetY: 0, blurRadius: 10, spreadDistance: 2, color: `${color}26` },
        ],
      }, style]} />
  );
}

/** 본체에서 설정한 보관 모드를 도면 내부의 같은 배지로 표시한다. */
function ModeBadge({ storageMode, style }: { storageMode: StorageMode | null; style: StyleProp<ViewStyle> }) {
  if (!storageMode) return null;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.modeBadge, { backgroundColor: modeColors[storageMode].backgroundColor,
        borderColor: modeColors[storageMode].color }, style]}>
      <MaterialDesignIcons name={storageMode === 'CHILLED' ? 'thermometer-low' : 'snowflake'} size={14}
        color={modeColors[storageMode].color} accessible={false} />
    </View>
  );
}

/** 구분 배지와 보관 모드는 열림 완료 후 표시하는 내부 도면의 상단에 둔다. */
function InteriorArea({ area, layout, compact, selected, storageMode, onSelectArea }: {
  area: StorageArea; layout: FridgeLayout; compact: boolean; selected: boolean;
  storageMode: StorageMode | null; onSelectArea: FridgeInteriorMapProps['onSelectArea'];
}) {
  const positions = layout.positions.filter(position => position.areaId === area.id);
  const header = (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.interiorHeader}>
      <View style={styles.areaBadge}>
        <Text numberOfLines={1} style={styles.areaBadgeLabel}>{area.isBody ? '본체' : '포켓'}</Text>
      </View>
      <ModeBadge storageMode={storageMode} style={styles.interiorModeBadge} />
    </View>
  );
  return (
    <View style={styles.area}>
      {!area.isBody && positions.length === 0 ? (
        <View style={[styles.areaMap, styles.placeholderFrame]}>
          <DoorWithoutStorage label={`${area.compartment} ${area.name}`} selected={selected} storageMode={storageMode}
            onPress={() => onSelectArea(area.id)} />
          <View pointerEvents="none" style={styles.placeholderHeader}>{header}</View>
        </View>
      ) : <FridgeMap areas={[area]} positions={positions}
        ingredients={layout.ingredients} selectedAreaId={selected ? area.id : undefined} showIngredientCounts={false}
        showAreaLabels={false} minAreaHeight={0} fitHeight storageMode={storageMode}
        compact={compact} style={styles.areaMap} areaHeader={header}
        onSelectArea={() => onSelectArea(area.id)} />}
      {selected ? <SelectionFrame storageMode={storageMode} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

/** 문 앞·뒷면을 같은 경첩으로 회전하고, 포켓 내용은 열림 완료 후 표시한다. */
function FridgeDoor({ door, label, phase, progress, selected, storageMode, style, onSelect, unfoldOffset = 0, bodyWidth, showModeBadge = true, children }: {
  door: DraftDoor; label: string; phase: FridgeFocusPhase; progress: Animated.Value; selected: boolean; storageMode: StorageMode | null;
  style: AreaFrame; onSelect: () => void; unfoldOffset?: number; children?: ReactNode;
  bodyWidth?: number;
  showModeBadge?: boolean;
}) {
  const drawer = door.kind === 'DRAWER';
  const closed = phase === 'closed';
  const leftHinge = door.side === 'LEFT_DOOR';
  const leafWidth = Number(style.width) - style.paddingLeft - style.paddingRight;
  const verticalPadding = typeof style.paddingVertical === 'number' ? style.paddingVertical : 3;

  return (
    <View pointerEvents="box-none" style={[styles.door, style, bodyWidth !== undefined && {
      left: `${Number(style.left) / bodyWidth * 100}%`, width: `${Number(style.width) / bodyWidth * 100}%`, height: '100%',
    }, drawer && styles.drawerClip]}>
      <Animated.View pointerEvents={closed ? 'auto' : 'none'} accessibilityElementsHidden={!closed}
        importantForAccessibility={closed ? 'auto' : 'no-hide-descendants'}
        style={[styles.doorFace, {
          left: style.paddingLeft, right: style.paddingRight, top: verticalPadding, bottom: verticalPadding,
          transformOrigin: drawer ? 'center center' : door.side === 'LEFT_DOOR' ? 'left center' : 'right center',
          transform: drawer ? [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, style.height] }) }]
            : [{ perspective: 1200 }, { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, unfoldOffset] }) },
              { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', leftHinge ? '-180deg' : '180deg'] }) }],
        }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} 열기`}
          accessibilityState={{ expanded: !closed, selected }} disabled={!closed} onPress={onSelect}
          style={[styles.exteriorFace, selected && storageMode && { backgroundColor: modeColors[storageMode].backgroundColor }]}>
          <DoorHandle horizontal={drawer} style={drawer ? styles.drawerHandle
            : [styles.doorHandle, door.side === 'LEFT_DOOR' ? styles.handleRight : styles.handleLeft]} />
          {showModeBadge ? <ModeBadge storageMode={storageMode} style={styles.exteriorModeBadge} /> : null}
        </Pressable>
        <Animated.View pointerEvents="none" style={[styles.doorShade, {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }),
        }]} />
        {selected ? <SelectionFrame storageMode={storageMode} style={StyleSheet.absoluteFill} /> : null}
      </Animated.View>
      {!drawer && children ? (
        <Animated.View pointerEvents={phase === 'open' ? 'auto' : 'none'} accessibilityElementsHidden={phase !== 'open'}
          importantForAccessibility={phase === 'open' ? 'auto' : 'no-hide-descendants'}
          style={[styles.doorBack, { width: bodyWidth !== undefined ? '100%' : leafWidth, top: verticalPadding, bottom: verticalPadding,
            left: bodyWidth !== undefined ? (leftHinge ? '-100%' : '100%')
              : leftHinge ? style.paddingLeft - leafWidth : Number(style.width) - style.paddingRight,
            transformOrigin: leftHinge ? 'right center' : 'left center',
            transform: [{ perspective: 1200 }, { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, unfoldOffset] }) },
              { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: [leftHinge ? '180deg' : '-180deg', '0deg'] }) }],
          }]}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.exteriorFace]} />
          <View pointerEvents={phase === 'open' ? 'auto' : 'none'} accessibilityElementsHidden={phase !== 'open'}
            importantForAccessibility={phase === 'open' ? 'auto' : 'no-hide-descendants'}
            style={[StyleSheet.absoluteFill, { opacity: phase === 'open' ? 1 : 0 }]}>{children}</View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** 닫힌 문을 누르면 연결된 본체 전체의 화면 좌표를 측정해 중앙 보기를 연다. */
function FridgeCompartment({ group, row, rowIndex, selectedAreaId, focus, width, height, canvasHeight, paddingLeft, paddingRight, onSelectArea, onFocus }: {
  group: BodyGeometry; row: RefrigeratorDraft['rows'][number]; rowIndex: number;
  selectedAreaId?: string; width: number; height: number; canvasHeight: number; paddingLeft: number; paddingRight: number;
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
        canvas: { x: x - group.left * width, y: y - rowIndex * height, width, height: canvasHeight } });
    });
  }

  return (
    <View ref={frameRef} collapsable={false} style={[styles.compartment, { left: group.left * width, top: rowIndex * height,
      width: group.width * width, height, opacity: focus?.areaId === body.id ? 0 : 1 }, (selectedBody || selectedDoor) && styles.selectedArea]}>
      {group.doors.map(({ door, left, width: doorWidth }, index) => (
        <FridgeDoor key={door.id} door={door} phase="closed" progress={progress} selected={selectedBody || selectedAreaId === door.id}
          storageMode={body.storageMode} showModeBadge={index === group.doors.length - 1}
          label={`${getDraftAreaLocation(row, rowIndex, door.id)} ${door.kind === 'DRAWER' ? '서랍' : areaNames[door.side]}`}
          onSelect={() => { onSelectArea(door.kind === 'DRAWER' ? body.id : door.id); showArea(door); }}
          style={{ left: (left - group.left) * width, width: doorWidth * width, height,
            paddingLeft: index === 0 ? paddingLeft : HINGE_LENGTH / 2,
            paddingRight: index === group.doors.length - 1 ? paddingRight : HINGE_LENGTH / 2 }} />
      ))}
    </View>
  );
}

/** 문 한 개의 본체와 포켓을 같은 비율로 배치하고, 실제 경첩 기준의 앞·뒷면 좌표를 계산한다. */
export function getFridgeFocusGeometry(draft: RefrigeratorDraft, focus: FridgeFocusTarget, viewport: LayoutRectangle) {
  const rowIndex = draft.rows.findIndex(row => row.compartments.some(body => body.id === focus.areaId));
  if (rowIndex < 0) return null;
  const row = draft.rows[rowIndex];
  const groups = getDraftRowGeometry(row).groups;
  const groupIndex = groups.findIndex(group => group.body.id === focus.areaId);
  const group = groups[groupIndex];
  // 기본 도면의 바깥 여백은 출발 좌표에만 반영하고, 열린 도면은 실제 테두리끼리 연결한다.
  const sourcePaddingLeft = groupIndex === 0 ? HINGE_LENGTH / 2 : GROUP_GAP / 2;
  const sourcePaddingRight = groupIndex === groups.length - 1 ? HINGE_LENGTH / 2 : GROUP_GAP / 2;
  const source = { x: focus.canvas.x + group.left * focus.canvas.width + sourcePaddingLeft,
    y: focus.canvas.y + rowIndex * focus.canvas.height / draft.rows.length + 3,
    width: group.width * focus.canvas.width - sourcePaddingLeft - sourcePaddingRight,
    height: focus.canvas.height / draft.rows.length - 6 };
  const width = Math.min(focus.canvas.width, Math.max(1, viewport.width - 48));
  const leftDoors = group.doors.filter(({ door }) => door.kind === 'HINGED' && door.side === 'LEFT_DOOR');
  const rightDoors = group.doors.filter(({ door }) => door.kind === 'HINGED' && door.side === 'RIGHT_DOOR');
  const minimumHeight = Math.max(group.body.slots.length, ...[...leftDoors, ...rightDoors].map(({ door }) => door.slots.length)) * 24 + 34;
  const height = Math.min(Math.max(source.height, minimumHeight), Math.max(1, viewport.height - 128));
  const pocketCount = leftDoors.length + rightDoors.length;
  const unitWidth = (width - pocketCount * HINGE_LENGTH) / (group.doors.length + pocketCount);

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
  return { row, rowIndex, group, source, body, pockets, doors, width, height,
    left: source.x - viewport.x + (source.width - width) / 2,
    top: source.y - viewport.y + (source.height - height) / 2,
    translateX: viewport.x + viewport.width / 2 - (source.x + source.width / 2),
    translateY: viewport.y + viewport.height / 2 - (source.y + source.height / 2) };
}

/** 연결판을 양쪽 면에 걸치고 회전축에 마디를 표시해 손잡이와 구분한다. */
function DoorHinge({ style }: { style: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.hinge, style]}>
      <View style={[styles.hingePlate, { left: -5 }]} />
      <View style={[styles.hingePlate, { right: -5 }]} />
      {[5, 11].map(top => <View key={top} style={[styles.hingeSeam, { top }]} />)}
    </View>
  );
}

/** 본체·포켓에 세로 경첩을 두 군데 표시하고, 먼 경계는 위아래 연결선으로 잇는다. */
function DoorHinges({ fromX, toX, height }: { fromX: number; toX: number; height: number }) {
  const adjacent = Math.abs(fromX - toX) < 0.01;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.hinges, { left: Math.min(fromX, toX), width: Math.abs(fromX - toX), height }]}>
      {[0.22, 0.78].map((ratio, index) => adjacent ? (
        <DoorHinge key={index} style={{ left: -HINGE_LENGTH / 2, width: HINGE_LENGTH,
          top: height * ratio - HINGE_HEIGHT / 2 }} />
      ) : (
        <View key={index} style={StyleSheet.absoluteFill}>
          <View style={[styles.hingeConnection, index === 0 ? styles.hingeConnectionTop : styles.hingeConnectionBottom,
            { top: index === 0 ? 1 : height * ratio, height: height * 0.22 - 1 }]} />
          <DoorHinge style={{ left: -HINGE_LENGTH / 2, width: HINGE_LENGTH / 2,
            top: height * ratio - HINGE_HEIGHT / 2 }} />
          <DoorHinge style={{ right: -HINGE_LENGTH / 2, width: HINGE_LENGTH / 2,
            top: height * ratio - HINGE_HEIGHT / 2 }} />
        </View>
      ))}
    </View>
  );
}

/** 한 번의 열림·이동으로 본체와 포켓을 함께 펼치고, 각 도면 선택은 기존 툴바에 전달한다. */
export function FridgeFocusView({ draft, target, viewport, overlayHeight, phase, selectedAreaId, onPhaseChange, onClose, onSelectArea }: {
  draft: RefrigeratorDraft; target: FridgeFocusTarget; viewport: LayoutRectangle; phase: FridgeFocusPhase;
  overlayHeight?: number;
  selectedAreaId?: string; onPhaseChange: (phase: FridgeFocusPhase) => void; onClose: () => void;
  onSelectArea: FridgeInteriorMapProps['onSelectArea'];
}) {
  const progress = useAnimatedValue(0);
  const geometry = getFridgeFocusGeometry(draft, target, viewport);
  const layout = getDraftLayout(draft);
  const open = phase === 'open';

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
      {/* 도착 좌표를 고정하고 이동값은 0으로 끝낸다. 도면 안의 빈 공간도 터치를 받아 바깥 닫기를 막는다. */}
      <Animated.View onStartShouldSetResponder={() => true} style={[styles.compartment, { left: (viewport.width - geometry.width) / 2,
        top: (viewport.height - geometry.height) / 2, width: geometry.width, height: geometry.height,
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-geometry.translateX, 0] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-geometry.translateY, 0] }) },
        ],
      }]}>
        {/* 본체 프레임은 문 뒤에 유지하고, 칸·내부 배지와 경첩만 열림 완료 후 표시한다. */}
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, { opacity: open ? 1 : 0, zIndex: 2 }]}>
          {pockets.map(({ door, frame }) => (
            <DoorHinges key={door.id} height={body.height}
              fromX={door.side === 'LEFT_DOOR' ? frame.left + frame.width + HINGE_LENGTH / 2 : frame.left - HINGE_LENGTH / 2}
              toX={door.side === 'LEFT_DOOR' ? body.left - HINGE_LENGTH / 2 : body.left + body.width + HINGE_LENGTH / 2} />
          ))}
        </View>
        <Animated.View style={[styles.compartment, panelStyle(body)]}>
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={[StyleSheet.absoluteFill, styles.bodyFrame,
              selectedAreaId === area.id && group.body.storageMode && { backgroundColor: modeColors[group.body.storageMode].backgroundColor }]}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.interiorShade, {
              opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0] }),
            }]} />
          </View>
          <View pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open}
            importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} style={[StyleSheet.absoluteFill, { opacity: open ? 1 : 0 }]}>
            <InteriorArea area={area} layout={layout} selected={selectedAreaId === area.id} storageMode={group.body.storageMode}
              compact={body.width < 120} onSelectArea={onSelectArea} />
          </View>
          {doors.map(({ door, frame, pocket, unfoldOffset }, index) => (
            <FridgeDoor key={door.id} door={door} label={`${getDraftAreaLocation(row, rowIndex, door.id)} ${areaNames[door.side]}`}
              phase={phase} progress={progress} bodyWidth={body.width} selected={target.returnAreaId === door.id || target.returnAreaId === group.body.id}
              storageMode={group.body.storageMode} showModeBadge={index === doors.length - 1}
              unfoldOffset={unfoldOffset} onSelect={() => onSelectArea(area.id)}
              style={{ left: frame.left, width: frame.width, height: body.height,
                paddingLeft: frame.paddingLeft, paddingRight: frame.paddingRight, paddingVertical: 0 }}>
              {pocket ? <InteriorArea area={layout.areas.find(candidate => candidate.id === door.id)!} layout={layout}
                selected={selectedAreaId === door.id} storageMode={group.body.storageMode} compact={pocket.frame.width < 120}
                onSelectArea={onSelectArea} /> : null}
            </FridgeDoor>
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** 닫힌 도면은 최대 높이 안에서 화면에 맞추고, 중앙 보기로 이동한 영역은 원래 자리에서 숨긴다. */
export function FridgeInteriorMap({ draft, selectedAreaId, onSelectArea, focus, onFocus, fitHeight = false }: FridgeInteriorMapProps) {
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const { width: viewportWidth } = viewportSize;
  const mapHeight = fitHeight ? Math.min(MAP_HEIGHT, Math.max(1, viewportSize.height - MAP_PADDING * 2)) : MAP_HEIGHT;
  const rowGeometries = draft.rows.map(getDraftRowGeometry);
  const rowHeight = mapHeight / draft.rows.length;

  return (
    <View style={[styles.viewport, fitHeight && styles.fittedViewport]} onLayout={({ nativeEvent }) => {
      const { width, height } = nativeEvent.layout;
      setViewportSize(current => current.width === width && current.height === height ? current : { width, height });
    }}>
      <View style={[styles.canvas, { height: mapHeight }]}>
        {viewportWidth > 0 ? rowGeometries.flatMap((rowGeometry, rowIndex) => rowGeometry.groups.map((group, index) => (
          <FridgeCompartment key={group.body.id} group={group} row={draft.rows[rowIndex]} rowIndex={rowIndex}
            selectedAreaId={selectedAreaId} focus={focus} onFocus={onFocus} width={viewportWidth} height={rowHeight} canvasHeight={mapHeight}
            paddingLeft={index === 0 ? HINGE_LENGTH / 2 : GROUP_GAP / 2}
            paddingRight={index === rowGeometry.groups.length - 1 ? HINGE_LENGTH / 2 : GROUP_GAP / 2}
            onSelectArea={onSelectArea} />
        ))) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 선택 테두리의 퍼짐 효과가 잘리지 않도록 여백을 확보한다.
  viewport: {
    paddingVertical: MAP_PADDING,
  },
  fittedViewport: {
    flex: 1,
    minHeight: 0,
  },
  canvas: {
    height: MAP_HEIGHT,
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
  area: {
    ...StyleSheet.absoluteFill,
  },
  areaMap: {
    flex: 1,
  },
  // 칸과 배지를 숨겨도 문 뒤의 본체가 비어 보이지 않도록 프레임을 별도로 유지한다.
  bodyFrame: {
    borderWidth: 1,
    borderColor: fridgeSurfaces.border,
    borderRadius: 6,
    backgroundColor: colors.surface,
    boxShadow: fridgeSurfaces.recessedShadow,
  },
  hinges: {
    position: 'absolute',
  },
  hinge: {
    position: 'absolute',
    height: HINGE_HEIGHT,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#6B7B6F',
    backgroundColor: '#9BAA9E',
  },
  hingePlate: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    width: 5,
    borderWidth: 1,
    borderColor: '#95A397',
    borderRadius: 2,
    backgroundColor: '#DCE3DC',
    boxShadow: fridgeSurfaces.raisedShadow,
  },
  hingeSeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#607364',
  },
  hingeConnection: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#95A397',
  },
  hingeConnectionTop: {
    borderTopWidth: 1,
  },
  hingeConnectionBottom: {
    borderBottomWidth: 1,
  },
  interiorHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    paddingHorizontal: 6,
  },
  interiorModeBadge: {
    position: 'relative',
  },
  placeholderFrame: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  placeholderHeader: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
  },
  areaBadge: {
    minWidth: 0,
    flexShrink: 1,
    minHeight: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: fridgeSurfaces.border,
    borderRadius: 6,
    backgroundColor: colors.toolbar,
    boxShadow: fridgeSurfaces.raisedShadow,
    zIndex: 5,
  },
  areaBadgeLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  interiorShade: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 6,
    backgroundColor: colors.text,
  },
  selectedArea: {
    zIndex: 1,
  },
  selectionFrame: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 6,
    borderWidth: 1,
    zIndex: 1,
  },
  modeBadge: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: fridgeSurfaces.raisedShadow,
    zIndex: 5,
  },
  exteriorModeBadge: {
    top: 5,
    right: 6,
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
    backfaceVisibility: 'hidden',
  },
  doorBack: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    backfaceVisibility: 'hidden',
  },
  doorShade: {
    ...StyleSheet.absoluteFill,
    borderRadius: 6,
    backgroundColor: colors.text,
  },
  exteriorFace: {
    flex: 1,
    borderWidth: 1,
    borderColor: fridgeSurfaces.border,
    borderRadius: 6,
    backgroundColor: colors.surface,
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
    borderWidth: 1,
    borderColor: fridgeSurfaces.border,
    borderRadius: 6,
    backgroundColor: colors.surface,
    boxShadow: fridgeSurfaces.recessedShadow,
  },
  cross: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#B0ACA3',
  },
});
