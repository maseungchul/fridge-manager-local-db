/**
 * @file
 * 냉장고 등록 구성을 SQLite에 저장하고 단·문·본체·칸을 조회해 복원한다.
 * 냉장고·단·본체·문·칸은 하나의 트랜잭션으로 처리하고 화면 상태는 호출자가 관리한다.
 */
import { uuid } from 'expo';
import type { SQLiteDatabase } from 'expo-sqlite';
import { prepareRefrigeratorRegistration } from '@/db/refrigeratorRegistration';
import type { RefrigeratorRegistrationData } from '@/db/refrigeratorRegistration';
import { getSlotName } from '@/features/fridge/model/fridgeLayout';
import type { Refrigerator, RefrigeratorDraft, SlotConfiguration } from '@/features/fridge/model/fridgeLayout';

/** 홈이 표시될 때 등록 여부와 냉장고 이름을 확인한다. */
export function getRefrigeratorSummary(db: SQLiteDatabase) {
  return db.getFirstAsync<{ id: string; name: string }>('SELECT id, name FROM refrigerators LIMIT 1;');
}

/** 같은 읽기 트랜잭션에서 전체 구성을 가져오고 기존 도면 모델로 복원한다. */
export async function getRefrigerator(db: SQLiteDatabase): Promise<Refrigerator | null> {
  let result: Refrigerator | null = null;
  await db.withExclusiveTransactionAsync(async transaction => {
    const refrigerator = await getRefrigeratorSummary(transaction);
    if (!refrigerator) return;
    const rows = await transaction.getAllAsync<RefrigeratorRegistrationData['rows'][number]>(
      'SELECT * FROM refrigerator_rows WHERE refrigerator_id = ? ORDER BY sort_order;', refrigerator.id,
    );
    const bodies = await transaction.getAllAsync<RefrigeratorRegistrationData['compartments'][number]>(`
      SELECT body.* FROM refrigerator_compartments AS body
      JOIN refrigerator_rows AS row ON row.id = body.row_id WHERE row.refrigerator_id = ?;
    `, refrigerator.id);
    const doors = await transaction.getAllAsync<RefrigeratorRegistrationData['doors'][number]>(`
      SELECT door.* FROM refrigerator_doors AS door
      JOIN refrigerator_rows AS row ON row.id = door.row_id
      WHERE row.refrigerator_id = ? ORDER BY row.sort_order, door.sort_order;
    `, refrigerator.id);
    const slots = await transaction.getAllAsync<RefrigeratorRegistrationData['slots'][number]>(`
      SELECT slot.* FROM refrigerator_slots AS slot
      LEFT JOIN refrigerator_compartments AS body ON body.id = slot.compartment_id
      LEFT JOIN refrigerator_doors AS door ON door.id = slot.door_id
      JOIN refrigerator_rows AS row ON row.id = COALESCE(body.row_id, door.row_id)
      WHERE row.refrigerator_id = ? ORDER BY slot.sort_order;
    `, refrigerator.id);

    function restoreSlots(compartmentId: string | null, doorId: string | null): SlotConfiguration[] {
      const ownedSlots = slots.filter(slot => slot.compartment_id === compartmentId && slot.door_id === doorId);
      if (!ownedSlots.length || ownedSlots.some((slot, index) => slot.sort_order !== index)) {
        throw new Error('저장된 냉장고의 칸 정보를 확인할 수 없습니다.');
      }
      return ownedSlots.map(slot => ({ id: slot.id, name: getSlotName(slot.sort_order), drawerCount: slot.drawer_count }));
    }

    if (!rows.length || rows.some((row, index) => row.sort_order !== index)) {
      throw new Error('저장된 냉장고의 단 정보를 확인할 수 없습니다.');
    }
    result = {
      ...refrigerator,
      rows: rows.map(row => {
        const rowDoors = doors.filter(door => door.row_id === row.id);
        const rowBodies = bodies.filter(body => body.row_id === row.id);
        const bodyIds = [...new Set(rowDoors.map(door => door.compartment_id))];
        if (!rowDoors.length || rowDoors.some((door, index) => door.sort_order !== index)
          || bodyIds.length !== rowBodies.length || bodyIds.some(id => !rowBodies.some(body => body.id === id))) {
          throw new Error('저장된 냉장고의 본체와 문 연결을 확인할 수 없습니다.');
        }
        return {
          id: row.id,
          // 본체에는 순서 컬럼이 없으므로 연결된 첫 문의 위치로 순서를 복원한다.
          compartments: bodyIds.map(id => {
            const body = rowBodies.find(body => body.id === id)!;
            return {
              id: body.id, storageMode: body.storage_mode,
              doorIds: rowDoors.filter(door => door.compartment_id === id).map(door => door.id),
              slots: restoreSlots(id, null),
            };
          }),
          doors: rowDoors.map(door => {
            const body = rowBodies.find(body => body.id === door.compartment_id)!;
            const connectedDoors = rowDoors.filter(candidate => candidate.compartment_id === body.id);
            if (body.kind === 'HINGED' && connectedDoors.length === 1 && body.side === null) {
              throw new Error('저장된 냉장고의 여는 방식을 확인할 수 없습니다.');
            }
            return {
              id: door.id, kind: body.kind, storageEnabled: door.storage_enabled === 1,
              // 공용 본체는 좌우 순서를 사용하고, 방향을 쓰지 않는 서랍형은 도면의 기본값으로 둔다.
              side: body.side ?? (connectedDoors[0].id === door.id ? 'LEFT_DOOR' as const : 'RIGHT_DOOR' as const),
              slots: restoreSlots(null, door.id),
            };
          }),
        };
      }),
    };
  });
  return result;
}

/** 등록 초안을 검증·저장하고 커밋이 완료된 냉장고의 ID를 반환한다. */
export async function registerRefrigerator(db: SQLiteDatabase, draft: RefrigeratorDraft): Promise<string> {
  const data = prepareRefrigeratorRegistration(draft, uuid.v4);

  await db.withExclusiveTransactionAsync(async transaction => {
    const existing = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM refrigerators LIMIT 1;');
    if (existing) throw new Error('이미 등록된 냉장고가 있습니다.');

    await transaction.runAsync(
      'INSERT INTO refrigerators (id, name) VALUES (?, ?);',
      data.refrigerator.id, data.refrigerator.name,
    );
    for (const row of data.rows) {
      await transaction.runAsync(
        'INSERT INTO refrigerator_rows (id, refrigerator_id, sort_order) VALUES (?, ?, ?);',
        row.id, row.refrigerator_id, row.sort_order,
      );
    }
    for (const body of data.compartments) {
      await transaction.runAsync(
        'INSERT INTO refrigerator_compartments (id, row_id, storage_mode, kind, side) VALUES (?, ?, ?, ?, ?);',
        body.id, body.row_id, body.storage_mode, body.kind, body.side,
      );
    }
    for (const door of data.doors) {
      await transaction.runAsync(
        'INSERT INTO refrigerator_doors (id, row_id, compartment_id, sort_order, storage_enabled) VALUES (?, ?, ?, ?, ?);',
        door.id, door.row_id, door.compartment_id, door.sort_order, door.storage_enabled,
      );
    }
    for (const slot of data.slots) {
      await transaction.runAsync(
        'INSERT INTO refrigerator_slots (id, compartment_id, door_id, sort_order, drawer_count) VALUES (?, ?, ?, ?, ?);',
        slot.id, slot.compartment_id, slot.door_id, slot.sort_order, slot.drawer_count,
      );
    }

    // 전용 연결에는 초기화 연결의 외래 키 설정이 공유되지 않아 커밋 전에 직접 검사한다.
    const violation = await transaction.getFirstAsync('PRAGMA foreign_key_check;');
    if (violation) throw new Error('냉장고 구성의 연결 정보가 올바르지 않습니다.');
  });

  return data.refrigerator.id;
}
