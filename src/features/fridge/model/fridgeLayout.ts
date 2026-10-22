/**
 * @file
 * 냉장고 등록·편집과 배치도에서 사용하는 타입·표시 이름·기본값·변환 함수를 정의한다.
 * 선택한 구조의 물리적 위치와 보관 모드를 분리하고, 화면 상태와 DB 저장은 호출자가 관리한다.
 */
import type fridgeLayoutPresets from './fridgeLayoutPresets.json';

export type RefrigeratorStructurePreset = (typeof fridgeLayoutPresets)[number];
export type StorageMode = 'CHILLED' | 'FROZEN';
export type AreaType = 'LEFT_DOOR' | 'BODY' | 'RIGHT_DOOR';
export type DrawerCount = 0 | 1 | 2;

export const areaNames: Record<AreaType, string> = {
  LEFT_DOOR: '왼쪽 문',
  BODY: '본체',
  RIGHT_DOOR: '오른쪽 문',
};

export interface SlotConfiguration {
  name: string;
  drawerCount: DrawerCount;
}

/** 배치도에서 각 실별로 표시하는 본체·문 영역이다. */
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

/** 구조 원본을 복사한 입력 초안이다. 보관 모드는 선택 전까지 비워 두며 DB 저장값과 구분한다. */
export interface RefrigeratorDraft {
  name: string;
  presetId: string | null;
  view: RefrigeratorStructurePreset['view'] | null;
  layout: string[][];
  openings: RefrigeratorStructurePreset['openings'];
  compartments: {
    position: string;
    name: string;
    storageMode: StorageMode | null;
    areas: { type: AreaType; enabled: boolean; slots: SlotConfiguration[] }[];
  }[];
}

/** 본체마다 기본 칸 하나를 만들고, 외부 문 연결은 문 수납 영역과 구분해 복사한다. */
export function createRefrigeratorDraft(preset?: RefrigeratorStructurePreset): RefrigeratorDraft {
  return {
    name: '우리 집 냉장고',
    presetId: preset?.id ?? null,
    view: preset?.view ?? null,
    layout: preset?.layout.map(row => [...row]) ?? [],
    openings: preset?.openings.map(opening => ({
      ...opening,
      compartmentIds: [...opening.compartmentIds],
    })) ?? [],
    compartments: preset?.compartments.map<RefrigeratorDraft['compartments'][number]>(compartment => ({
      position: compartment.id,
      name: compartment.name,
      storageMode: null,
      areas: [{
        type: 'BODY',
        enabled: true,
        slots: [{ name: '1번째 칸', drawerCount: 0 }],
      }],
    })) ?? [],
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
        compartment: room.name,
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

/** 배치도의 접근성 라벨에 사용할 실과 영역·칸 경로를 조합한다. */
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
