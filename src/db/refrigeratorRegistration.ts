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
import { AppError } from '@/i18n/errors';

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

/** 등록·전체 수정·이름 변경에서 같은 이름 규칙과 공백 제거를 적용한다. */
export function normalizeRefrigeratorName(name: string): string {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 50) throw new AppError('errors.fridgeName');
  return normalizedName;
}

/** 초안을 검증하고, 편집 시 남아 있는 구조의 ID는 유지하며 새 위치에만 UUID를 발급한다. */
export function prepareRefrigeratorRegistration(
  draft: RefrigeratorDraft,
  createId: () => string,
  existing?: Refrigerator,
): RefrigeratorRegistrationData {
  const name = normalizeRefrigeratorName(draft.name);
  if (draft.rows.length < 1 || draft.rows.length > MAX_ROWS) {
    throw new AppError('errors.rowCount', { max: MAX_ROWS });
  }

  const inputIds = new Set<string>();
  const data: RefrigeratorRegistrationData = {
    refrigerator: { id: existing?.id ?? createId(), name }, rows: [], compartments: [], doors: [], slots: [],
  };

  for (const [rowIndex, row] of draft.rows.entries()) {
    if (row.doors.length < 1 || row.doors.length > MAX_DOORS_PER_ROW) {
      throw new AppError('errors.doorCount', { row: rowIndex + 1, max: MAX_DOORS_PER_ROW });
    }
    if (row.compartments.length < 1 || row.compartments.length > row.doors.length) {
      throw new AppError('errors.bodyConnection', { row: rowIndex + 1 });
    }
    for (const area of [row, ...row.doors, ...row.compartments]) {
      if (!area.id.trim() || inputIds.has(area.id)) throw new AppError('errors.areaId');
      inputIds.add(area.id);
    }
    for (const door of row.doors) {
      if ((door.kind !== 'HINGED' && door.kind !== 'DRAWER')
        || (door.side !== 'LEFT_DOOR' && door.side !== 'RIGHT_DOOR')) {
        throw new AppError('errors.opening', { row: rowIndex + 1 });
      }
      if (typeof door.storageEnabled !== 'boolean') throw new AppError('errors.doorStorage');
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
        throw new AppError('errors.connectionOrder', { row: rowIndex + 1 });
      }
      const storageMode = body.storageMode;
      if (storageMode !== 'CHILLED' && storageMode !== 'FROZEN') {
        throw new AppError('errors.storageMode', { row: rowIndex + 1 });
      }
      const isShared = connectedDoors.length > 1;
      if (isShared && connectedDoors.some((door, index) => door.kind !== 'HINGED'
        || door.side !== (index === 0 ? 'LEFT_DOOR' : 'RIGHT_DOOR'))) {
        throw new AppError('errors.sharedDoors');
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
    if (doorIndex !== row.doors.length) throw new AppError('errors.unconnectedDoor', { row: rowIndex + 1 });
  }
  return data;
}

function validateSlots(slots: SlotConfiguration[], maxCount: number, allowSplit: boolean, inputIds: Set<string>) {
  if (slots.length < 1 || slots.length > maxCount) throw new AppError('errors.slotCount', { max: maxCount });
  if (slots.some(slot => slot.drawerCount !== 0 && slot.drawerCount !== 1 && slot.drawerCount !== 2)) {
    throw new AppError('errors.slotSplit');
  }
  if (!allowSplit && slots.some(slot => slot.drawerCount === 2)) {
    throw new AppError('errors.unsupportedSplit');
  }
  for (const slot of slots) {
    if (slot.id === undefined) continue;
    if (!slot.id.trim() || inputIds.has(slot.id)) throw new AppError('errors.slotId');
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
