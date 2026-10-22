/**
 * @file
 * 냉장고 등록·편집과 배치도에서 사용하는 타입·표시 이름·기본값·변환 함수를 정의한다.
 * 상단·하단의 물리적 위치와 냉장·냉동 보관 모드를 분리하고, 화면 상태와 DB 저장은 호출자가 관리한다.
 */
export type CompartmentPosition = 'UPPER' | 'LOWER';
export type StorageMode = 'CHILLED' | 'FROZEN';
export type AreaType = 'LEFT_DOOR' | 'BODY' | 'RIGHT_DOOR';
export type DrawerCount = 0 | 1 | 2;

export const compartmentNames: Record<CompartmentPosition, string> = {
  UPPER: '냉장고 상단',
  LOWER: '냉장고 하단',
};

export const areaNames: Record<AreaType, string> = {
  LEFT_DOOR: '왼쪽 문',
  BODY: '본체',
  RIGHT_DOOR: '오른쪽 문',
};

export interface SlotConfiguration {
  name: string;
  drawerCount: DrawerCount;
}

/** 배치도에서 상단·하단별로 표시하는 본체·문 영역이다. */
export interface StorageArea {
  id: string;
  compartment: string;
  name: string;
  isBody: boolean;
}

/** 서랍 2개는 같은 slotId를 공유하고 개별 선택 위치와 서랍 번호로 구분한다. */
export interface SlotPosition {
  id: string;
  slotId: string;
  areaId: string;
  name: string;
  drawerCount: DrawerCount;
  drawerNumber?: 1 | 2;
}

/** 배치도의 개별 선택 위치에 연결한 재료 표시 정보다. 등록 미리보기에서는 빈 목록이다. */
export interface FridgeIngredient {
  id: string;
  name: string;
  quantity: string;
  positionId: string;
  expirationDate: string | null;
}

/** 등록 미리보기와 홈에서 공유하는 배치도 데이터다. DB 저장 구조와 구분한다. */
export interface FridgeLayout {
  areas: StorageArea[];
  positions: SlotPosition[];
  ingredients: FridgeIngredient[];
}

/** 제외한 문도 입력을 보관하고, 최종 저장할 때 enabled로 걸러 낸다. */
export interface RefrigeratorDraft {
  name: string;
  compartments: {
    position: CompartmentPosition;
    storageMode: StorageMode;
    areas: { type: AreaType; enabled: boolean; slots: SlotConfiguration[] }[];
  }[];
}

/** 기존 등록 폼의 이름·문·칸 기본값을 사용하고 본체는 항상 포함한다. */
export function createRefrigeratorDraft(): RefrigeratorDraft {
  return {
    name: '우리 집 냉장고',
    compartments: (['UPPER', 'LOWER'] as const).map(position => ({
      position,
      storageMode: position === 'UPPER' ? 'CHILLED' : 'FROZEN',
      areas: (['LEFT_DOOR', 'BODY', 'RIGHT_DOOR'] as const).map(type => ({
        type,
        enabled: true,
        slots: (type === 'BODY'
          ? (position === 'UPPER' ? ['위 선반', '가운데 선반', '채소 서랍'] : ['위 서랍', '아래 서랍'])
          : ['위칸', '아래칸']).map(name => ({
          name,
          drawerCount: type === 'BODY' && name.includes('서랍') ? 1 : 0,
        })),
      })),
    })),
  };
}

/** 현재 입력을 배치도로 변환한다. 위치와 영역 종류로 만든 임시 식별자는 DB에 저장하지 않는다. */
export function getDraftLayout(draft: RefrigeratorDraft): FridgeLayout {
  const areas: StorageArea[] = [];
  const positions: SlotPosition[] = [];

  for (const room of draft.compartments) {
    for (const area of room.areas.filter(candidate => candidate.enabled)) {
      const id = `${room.position}-${area.type}`;
      areas.push({
        id,
        compartment: compartmentNames[room.position],
        name: areaNames[area.type],
        isBody: area.type === 'BODY',
      });
      area.slots.forEach((slot, index) => positions.push(...getSlotPositions(
        `${id}-${index}`, id, slot.name || `${index + 1}번째 칸`, slot.drawerCount,
      )));
    }
  }

  return { areas, positions, ingredients: [] };
}

/** 배치도의 접근성 라벨에 사용할 상단·하단과 영역·칸 경로를 조합한다. */
export function getPositionPath(area: StorageArea, position: SlotPosition) {
  return `${area.compartment} → ${area.name} → ${getPositionName(position)}`;
}

/** 서랍 2개일 때만 표시 이름에 번호를 붙이고 입력한 원래 칸 이름은 유지한다. */
export function getPositionName(position: SlotPosition) {
  return position.drawerNumber ? `${position.name} ${position.drawerNumber}` : position.name;
}

/** 일반 칸·단일 서랍은 한 위치로, 좌우 서랍은 같은 칸에 속한 두 위치로 표시한다. */
function getSlotPositions(slotId: string, areaId: string, name: string, drawerCount: DrawerCount): SlotPosition[] {
  const slot = { slotId, areaId, name, drawerCount };
  return drawerCount === 2
    ? [{ ...slot, id: `${slotId}-left`, drawerNumber: 1 }, { ...slot, id: `${slotId}-right`, drawerNumber: 2 }]
    : [{ ...slot, id: slotId }];
}
