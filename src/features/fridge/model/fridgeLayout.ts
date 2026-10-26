/**
 * @file
 * 냉장고 등록·편집과 배치도에서 사용하는 타입·표시 이름·기본값·변환 함수를 정의한다.
 * 사용자가 구성한 문 배치·본체 연결과 보관 모드를 분리하고, DB 저장은 호출자가 관리한다.
 */
export type StorageMode = 'CHILLED' | 'FROZEN';
export type AreaType = 'LEFT_DOOR' | 'BODY' | 'RIGHT_DOOR';
export type DoorOpening = Exclude<AreaType, 'BODY'> | 'DRAWER';
export type DrawerCount = 0 | 1 | 2;

export const storageModeOptions: { value: StorageMode; label: string }[] = [
  { value: 'CHILLED', label: '냉장' },
  { value: 'FROZEN', label: '냉동' },
];

export const doorOpeningOptions: { value: DoorOpening; label: string }[] = [
  { value: 'LEFT_DOOR', label: '왼쪽 열림' },
  { value: 'RIGHT_DOOR', label: '오른쪽 열림' },
  { value: 'DRAWER', label: '서랍형' },
];

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

/** 여는 방식과 문 수납을 분리하며, 서랍형으로 바꿔도 여닫이 문의 기존 수납 입력은 보관한다. */
export interface DraftDoor {
  id: string;
  kind: 'HINGED' | 'DRAWER';
  side: Exclude<AreaType, 'BODY'>;
  storageEnabled: boolean;
  slots: SlotConfiguration[];
}

/** 나란한 문 여러 개가 본체 하나를 공유할 수 있으며 세로 연결은 지원하지 않는다. */
export interface DraftCompartment {
  id: string;
  doorIds: string[];
  storageMode: StorageMode | null;
  slots: SlotConfiguration[];
}

export interface DraftRow {
  id: string;
  doors: DraftDoor[];
  compartments: DraftCompartment[];
}

/** 화면 입력용 초안이다. 증가하는 식별자로 단 삭제·재추가 시 남은 위치와 새 위치를 구분한다. */
export interface RefrigeratorDraft {
  name: string;
  nextId: number;
  rows: DraftRow[];
}

export const MAX_ROWS = 3;
export const MAX_DOORS_PER_ROW = 3;
export const MAX_SLOTS = 5;

function createDraftDoor(id: number, side: DraftDoor['side'] = 'LEFT_DOOR'): DraftDoor {
  return {
    id: `door-${id}`, kind: 'HINGED', side, storageEnabled: true,
    slots: ['위칸', '아래칸'].map(name => ({ name, drawerCount: 0 })),
  };
}

function createDraftCompartment(id: number, doorIds: string[]): DraftCompartment {
  return { id: `body-${id}`, doorIds, storageMode: 'CHILLED', slots: [{ name: '1번째 칸', drawerCount: 0 }] };
}

/** 2단에 각각 문·본체 하나로 시작하고, 유형 JSON 대신 단별 문 개수로 배치를 구성한다. */
export function createRefrigeratorDraft(): RefrigeratorDraft {
  const draft = addDraftRow({ name: '우리 집 냉장고', nextId: 1, rows: [] });
  return addDraftRow(draft);
}

export function addDraftRow(draft: RefrigeratorDraft): RefrigeratorDraft {
  if (draft.rows.length >= MAX_ROWS) return draft;
  const door = createDraftDoor(draft.nextId + 1);
  return { ...draft, nextId: draft.nextId + 3, rows: [...draft.rows, {
    id: `row-${draft.nextId}`, doors: [door],
    compartments: [createDraftCompartment(draft.nextId + 2, [door.id])],
  }] };
}

export function removeDraftRow(draft: RefrigeratorDraft, rowId: string): RefrigeratorDraft {
  if (draft.rows.length <= 1) return draft;
  return { ...draft, rows: draft.rows.filter(row => row.id !== rowId) };
}

/** 마지막 문만 추가·제거해 나머지 문의 방향·수납과 본체의 기존 입력을 유지한다. */
export function changeDraftDoorCount(draft: RefrigeratorDraft, rowId: string, delta: -1 | 1): RefrigeratorDraft {
  const row = draft.rows.find(candidate => candidate.id === rowId);
  if (!row || row.doors.length + delta < 1 || row.doors.length + delta > MAX_DOORS_PER_ROW) return draft;
  const door = createDraftDoor(draft.nextId, row.doors.length % 2 === 0 ? 'LEFT_DOOR' : 'RIGHT_DOOR');
  const removedId = row.doors[row.doors.length - 1].id;
  const nextRow: DraftRow = delta === 1 ? {
    ...row, doors: [...row.doors, door],
    compartments: [...row.compartments, createDraftCompartment(draft.nextId + 1, [door.id])],
  } : {
    ...row, doors: row.doors.slice(0, -1),
    compartments: row.compartments.flatMap(compartment => {
      if (!compartment.doorIds.includes(removedId)) return [compartment];
      const doorIds = compartment.doorIds.filter(id => id !== removedId);
      return doorIds.length ? [{ ...compartment, doorIds }] : [];
    }),
  };
  return { ...draft, nextId: draft.nextId + (delta === 1 ? 2 : 0),
    rows: draft.rows.map(candidate => candidate.id === rowId ? nextRow : candidate) };
}

/** 여는 방식만 바꾸고 문·본체 연결과 칸 입력·수납 여부는 유지한다. */
export function setDraftDoorOpening(draft: RefrigeratorDraft, rowId: string, doorId: string, opening: DoorOpening): RefrigeratorDraft {
  return { ...draft, rows: draft.rows.map(row => row.id !== rowId ? row : {
    ...row, doors: row.doors.map(door => door.id !== doorId ? door : {
      ...door, kind: opening === 'DRAWER' ? 'DRAWER' : 'HINGED',
      side: opening === 'DRAWER' ? door.side : opening,
    }),
  }) };
}

/** 오른쪽 이웃과 본체만 합친다. 문은 유지하고 칸은 왼쪽부터 이어 붙이며 모드가 다르면 재선택한다. */
export function mergeDraftCompartments(draft: RefrigeratorDraft, rowId: string, bodyId: string): RefrigeratorDraft {
  return { ...draft, rows: draft.rows.map(row => {
    if (row.id !== rowId) return row;
    const index = row.compartments.findIndex(body => body.id === bodyId);
    const left = row.compartments[index], right = row.compartments[index + 1];
    if (!left || !right || left.slots.length + right.slots.length > MAX_SLOTS) return row;
    const merged = { ...left, doorIds: [...left.doorIds, ...right.doorIds], slots: [...left.slots, ...right.slots],
      storageMode: left.storageMode === right.storageMode ? left.storageMode : null };
    return { ...row, compartments: [...row.compartments.slice(0, index), merged, ...row.compartments.slice(index + 2)] };
  }) };
}

/** 문별 본체로 분리할 때 기존 칸은 첫 본체에 남겨 입력을 복제하거나 버리지 않는다. */
export function splitDraftCompartment(draft: RefrigeratorDraft, rowId: string, bodyId: string): RefrigeratorDraft {
  let nextId = draft.nextId;
  const rows = draft.rows.map(row => row.id !== rowId ? row : { ...row,
    compartments: row.compartments.flatMap(body => body.id !== bodyId || body.doorIds.length === 1 ? [body]
      : body.doorIds.map((doorId, index) => index === 0 ? { ...body, doorIds: [doorId] }
        : { ...createDraftCompartment(nextId++, [doorId]), storageMode: body.storageMode })),
  });
  return { ...draft, nextId, rows };
}

/** 화면의 단·좌우 위치 이름은 현재 순서에서 구하고 식별자는 배치 변경에도 유지한다. */
export function getDraftAreaLocation(row: DraftRow, rowIndex: number, areaId: string) {
  const body = row.compartments.find(candidate => candidate.id === areaId);
  const doorIds = body ? body.doorIds : [areaId];
  const first = row.doors.findIndex(door => door.id === doorIds[0]) + 1;
  const last = row.doors.findIndex(door => door.id === doorIds[doorIds.length - 1]) + 1;
  return `${rowIndex + 1}단${row.doors.length === 1 ? '' : ` ${first === last ? first : `${first}~${last}`}번째`}`;
}

/** 현재 입력을 배치도로 변환한다. 위치와 영역 종류로 만든 임시 식별자는 DB에 저장하지 않는다. */
export function getDraftLayout(draft: RefrigeratorDraft): FridgeLayout {
  const areas: StorageArea[] = [];
  const positions: SlotPosition[] = [];

  for (const [rowIndex, row] of draft.rows.entries()) {
    for (const area of [...row.compartments, ...row.doors.filter(door => door.kind !== 'DRAWER')]) {
      const isDoor = 'side' in area;
      areas.push({ id: area.id, compartment: getDraftAreaLocation(row, rowIndex, area.id),
        name: isDoor ? areaNames[area.side] : areaNames.BODY, isBody: !isDoor });
      if (!isDoor || area.storageEnabled) {
        area.slots.forEach((slot, index) => positions.push(...getSlotPositions(
          `${area.id}-${index}`, area.id, slot.name || `${index + 1}번째 칸`, slot.drawerCount,
        )));
      }
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
