/**
 * @file
 * 냉장고 등록·편집 초안의 값·본체 연결을 검증하고 DB 저장용 레코드로 변환한다.
 * UUID 발급은 호출자가 제공하며, 실제 DB 저장과 화면 입력은 호출자가 관리한다.
 */
import {
  MAX_DOOR_SLOTS, MAX_DOORS_PER_ROW, MAX_ROWS, MAX_SLOTS,
} from '@/features/fridge/model/fridgeLayout';
import type {
  DraftDoor, DrawerCount, Refrigerator, RefrigeratorDraft, SlotConfiguration, StorageMode,
} from '@/features/fridge/model/fridgeLayout';

export interface RefrigeratorRegistrationData {
  refrigerator: { id: string; name: string };
  rows: { id: string; refrigerator_id: string; sort_order: number }[];
  compartments: {
    id: string;
    row_id: string;
    storage_mode: StorageMode;
    kind: DraftDoor['kind'];
    side: DraftDoor['side'] | null;
  }[];
  doors: {
    id: string;
    row_id: string;
    compartment_id: string;
    sort_order: number;
    storage_enabled: 0 | 1;
  }[];
  slots: {
    id: string;
    compartment_id: string | null;
    door_id: string | null;
    sort_order: number;
    drawer_count: DrawerCount;
  }[];
}

/** 초안을 검증하고, 편집 시 남아 있는 구조의 ID는 유지하며 새 위치에만 UUID를 발급한다. */
export function prepareRefrigeratorRegistration(
  draft: RefrigeratorDraft,
  createId: () => string,
  existing?: Refrigerator,
): RefrigeratorRegistrationData {
  const name = draft.name.trim();
  if (!name || name.length > 50) throw new Error('냉장고 이름은 1~50자로 입력해 주세요.');
  if (draft.rows.length < 1 || draft.rows.length > MAX_ROWS) {
    throw new Error(`냉장고는 1~${MAX_ROWS}단으로 구성해 주세요.`);
  }

  const inputIds = new Set<string>();
  const data: RefrigeratorRegistrationData = {
    refrigerator: { id: existing?.id ?? createId(), name }, rows: [], compartments: [], doors: [], slots: [],
  };

  for (const [rowIndex, row] of draft.rows.entries()) {
    if (row.doors.length < 1 || row.doors.length > MAX_DOORS_PER_ROW) {
      throw new Error(`${rowIndex + 1}단의 문은 1~${MAX_DOORS_PER_ROW}개로 구성해 주세요.`);
    }
    if (row.compartments.length < 1 || row.compartments.length > row.doors.length) {
      throw new Error(`${rowIndex + 1}단의 본체 연결을 확인해 주세요.`);
    }
    for (const area of [row, ...row.doors, ...row.compartments]) {
      if (!area.id.trim() || inputIds.has(area.id)) throw new Error('단·문·본체의 식별자가 올바르지 않습니다.');
      inputIds.add(area.id);
    }
    for (const door of row.doors) {
      if ((door.kind !== 'HINGED' && door.kind !== 'DRAWER')
        || (door.side !== 'LEFT_DOOR' && door.side !== 'RIGHT_DOOR')) {
        throw new Error(`${rowIndex + 1}단의 여는 방식을 확인해 주세요.`);
      }
      if (typeof door.storageEnabled !== 'boolean') throw new Error('문 수납 사용 여부를 확인해 주세요.');
      validateSlots(door.slots, MAX_DOOR_SLOTS, false, inputIds);
    }

    const storedRow = existing?.rows.find(candidate => candidate.id === row.id);
    const rowId = storedRow?.id ?? createId();
    data.rows.push({ id: rowId, refrigerator_id: data.refrigerator.id, sort_order: rowIndex });
    let doorIndex = 0;
    for (const body of row.compartments) {
      // 본체·문은 초안의 왼쪽→오른쪽 순서로 빠짐없이 연결되어야 한다.
      const connectedDoors = row.doors.slice(doorIndex, doorIndex + body.doorIds.length);
      if (body.doorIds.length < 1 || connectedDoors.length !== body.doorIds.length
        || connectedDoors.some((door, index) => door.id !== body.doorIds[index])) {
        throw new Error(`${rowIndex + 1}단의 본체와 문 연결 순서를 확인해 주세요.`);
      }
      const storageMode = body.storageMode;
      if (storageMode !== 'CHILLED' && storageMode !== 'FROZEN') {
        throw new Error(`${rowIndex + 1}단의 모든 본체에 냉장·냉동을 선택해 주세요.`);
      }
      const isShared = connectedDoors.length > 1;
      if (isShared && connectedDoors.some((door, index) => door.kind !== 'HINGED'
        || door.side !== (index === 0 ? 'LEFT_DOOR' : 'RIGHT_DOOR'))) {
        throw new Error('공용 본체는 왼쪽·오른쪽으로 열리는 여닫이 문이어야 합니다.');
      }
      const kind = connectedDoors[0].kind;
      validateSlots(body.slots, kind === 'DRAWER' ? 1 : MAX_SLOTS, kind !== 'DRAWER', inputIds);
      const storedBody = storedRow?.compartments.find(candidate => candidate.id === body.id);
      const bodyId = storedBody?.id ?? createId();
      data.compartments.push({
        id: bodyId, row_id: rowId, storage_mode: storageMode, kind,
        side: kind === 'DRAWER' || isShared ? null : connectedDoors[0].side,
      });
      data.slots.push(...createSlotRecords(body.slots, createId, bodyId, null, storedBody?.slots));

      for (const door of connectedDoors) {
        const storedDoor = storedRow?.doors.find(candidate => candidate.id === door.id);
        const doorId = storedDoor?.id ?? createId();
        data.doors.push({
          id: doorId, row_id: rowId, compartment_id: bodyId, sort_order: doorIndex++,
          storage_enabled: door.storageEnabled ? 1 : 0,
        });
        // 수납을 끄거나 서랍형으로 숨긴 포켓의 입력도 다시 사용할 수 있게 보존한다.
        data.slots.push(...createSlotRecords(door.slots, createId, null, doorId, storedDoor?.slots));
      }
    }
    if (doorIndex !== row.doors.length) throw new Error(`${rowIndex + 1}단에 본체와 연결되지 않은 문이 있습니다.`);
  }
  return data;
}

function validateSlots(slots: SlotConfiguration[], maxCount: number, allowSplit: boolean, inputIds: Set<string>) {
  if (slots.length < 1 || slots.length > maxCount) throw new Error(`칸은 1~${maxCount}개로 구성해 주세요.`);
  if (slots.some(slot => slot.drawerCount !== 0 && slot.drawerCount !== 1 && slot.drawerCount !== 2)) {
    throw new Error('칸의 좌우 분할 설정을 확인해 주세요.');
  }
  if (!allowSplit && slots.some(slot => slot.drawerCount === 2)) {
    throw new Error('도어포켓과 서랍형 본체는 좌우로 분할할 수 없습니다.');
  }
  for (const slot of slots) {
    if (slot.id === undefined) continue;
    if (!slot.id.trim() || inputIds.has(slot.id)) throw new Error('칸의 식별자가 올바르지 않습니다.');
    inputIds.add(slot.id);
  }
}

function createSlotRecords(
  slots: SlotConfiguration[], createId: () => string, compartmentId: string | null, doorId: string | null,
  existingSlots: SlotConfiguration[] = [],
): RefrigeratorRegistrationData['slots'] {
  return slots.map((slot, index) => ({
    id: existingSlots.find(existing => existing.id === slot.id)?.id ?? createId(),
    compartment_id: compartmentId, door_id: doorId, sort_order: index,
    // 기존 값 1도 분할 없음이므로 신규 저장값은 0으로 통일한다.
    drawer_count: slot.drawerCount === 2 ? 2 : 0,
  }));
}
