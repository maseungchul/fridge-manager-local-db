/**
 * @file
 * 최초 등록에서 사용자가 정한 단별 문 개수를 닫힌 냉장고 도식으로 표시한다.
 * 실제 비율·내부 수납을 추측하지 않고 문 배치만 보여주며 입력은 호출자가 관리한다.
 */
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { RefrigeratorDraft } from '@/features/fridge/model/fridgeLayout';
import { FRIDGE_ASPECT_RATIO } from '@/features/fridge/model/fridgeLayout';
import { DoorHandle } from '@/features/fridge/components/FridgeMap';
import { fridgeSurfaces } from '@/theme/tokens';

interface FridgeStructurePreviewProps {
  rows: RefrigeratorDraft['rows'];
  style?: StyleProp<ViewStyle>;
}

/** 기본 외곽 비율로 표시하되 호출자가 배치 공간을 조정할 수 있고, 문 경계는 한쪽에서만 그린다. */
export function FridgeStructurePreview({ rows, style }: FridgeStructurePreviewProps) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.preview, style]}>
      {rows.map((row, rowIndex) => (
        <View key={row.id} style={[styles.row, rowIndex > 0 && styles.rowBorder]}>
          {row.doors.map((door, index) => (
            <View key={door.id} style={[styles.door, index > 0 && styles.doorBorder]}>
              <DoorHandle horizontal={door.kind === 'DRAWER'} style={[styles.handle,
                door.kind === 'DRAWER' ? styles.drawerHandle : door.side === 'LEFT_DOOR' ? { right: 6 } : { left: 6 }]} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: 144,
    aspectRatio: FRIDGE_ASPECT_RATIO,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: fridgeSurfaces.border,
    borderRadius: fridgeSurfaces.radius,
    overflow: 'hidden',
    backgroundColor: fridgeSurfaces.frame,
    boxShadow: fridgeSurfaces.raisedShadow,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: fridgeSurfaces.border,
  },
  door: {
    flex: 1,
    backgroundColor: fridgeSurfaces.exterior,
    boxShadow: fridgeSurfaces.raisedShadow,
  },
  handle: {
    top: '50%',
    marginTop: -20,
    transform: [{ scale: 0.55 }],
  },
  drawerHandle: {
    top: 10,
    left: '50%',
    marginTop: 0,
    marginLeft: -20,
  },
  doorBorder: {
    borderLeftWidth: 1,
    borderLeftColor: fridgeSurfaces.border,
  },
});
