/**
 * @file
 * 냉장고 구성을 SQLite에 등록·수정하고 단·문·본체·칸을 조회해 복원한다.
 * 냉장고·단·본체·문·칸은 하나의 트랜잭션으로 처리하고 화면 상태는 호출자가 관리한다.
 */
import { uuid } from 'expo';
import type { SQLiteDatabase } from 'expo-sqlite';
import { normalizeRefrigeratorName, prepareRefrigeratorRegistration } from '@/db/refrigeratorRegistration';
import type { RefrigeratorRegistrationData } from '@/db/refrigeratorRegistration';
import { getSlotName } from '@/features/fridge/model/fridgeLayout';
import type { Refrigerator, RefrigeratorDraft, SlotConfiguration } from '@/features/fridge/model/fridgeLayout';
import { AppError } from '@/i18n/errors';

/** 홈이 표시될 때 등록 여부와 냉장고 이름을 확인한다. */
export function getRefrigeratorSummary(db: SQLiteDatabase) {
  return db.getFirstAsync<{ id: string; name: string }>('SELECT id, name FROM refrigerators LIMIT 1;');
}

/** 같은 읽기 트랜잭션에서 전체 구성을 가져오고 기존 도면 모델로 복원한다. */
export async function getRefrigerator(db: SQLiteDatabase): Promise<Refrigerator | null> {
  let result: Refrigerator | null = null;
  await db.withExclusiveTransactionAsync(async transaction => {
    result = await readRefrigerator(transaction);
  });
  return result;
}

/** 수정 트랜잭션에서도 같은 조회·복원 로직을 사용해 다른 연결을 중첩해서 열지 않는다. */
async function readRefrigerator(db: SQLiteDatabase): Promise<Refrigerator | null> {
  const refrigerator = await getRefrigeratorSummary(db);
  if (!refrigerator) return null;
  const rows = await db.getAllAsync<RefrigeratorRegistrationData['rows'][number]>(
    'SELECT * FROM refrigerator_rows WHERE refrigerator_id = ? ORDER BY sort_order;', refrigerator.id,
  );
  const bodies = await db.getAllAsync<RefrigeratorRegistrationData['compartments'][number]>(`
    SELECT body.* FROM refrigerator_compartments AS body
    JOIN refrigerator_rows AS row ON row.id = body.row_id WHERE row.refrigerator_id = ?;
  `, refrigerator.id);
  const doors = await db.getAllAsync<RefrigeratorRegistrationData['doors'][number]>(`
    SELECT door.* FROM refrigerator_doors AS door
    JOIN refrigerator_rows AS row ON row.id = door.row_id
    WHERE row.refrigerator_id = ? ORDER BY row.sort_order, door.sort_order;
  `, refrigerator.id);
  const slots = await db.getAllAsync<RefrigeratorRegistrationData['slots'][number]>(`
    SELECT slot.* FROM refrigerator_slots AS slot
    LEFT JOIN refrigerator_compartments AS body ON body.id = slot.compartment_id
    LEFT JOIN refrigerator_doors AS door ON door.id = slot.door_id
    JOIN refrigerator_rows AS row ON row.id = COALESCE(body.row_id, door.row_id)
    WHERE row.refrigerator_id = ? ORDER BY slot.sort_order;
  `, refrigerator.id);

  function restoreSlots(compartmentId: string | null, doorId: string | null): SlotConfiguration[] {
    const ownedSlots = slots.filter(slot => slot.compartment_id === compartmentId && slot.door_id === doorId);
    if (!ownedSlots.length || ownedSlots.some((slot, index) => slot.sort_order !== index)) {
      throw new AppError('errors.storedSlots');
    }
    return ownedSlots.map(slot => ({ id: slot.id, name: getSlotName(slot.sort_order), drawerCount: slot.drawer_count }));
  }

  if (!rows.length || rows.some((row, index) => row.sort_order !== index)) {
    throw new AppError('errors.storedRows');
  }
  return {
    ...refrigerator,
    rows: rows.map(row => {
      const rowDoors = doors.filter(door => door.row_id === row.id);
      const rowBodies = bodies.filter(body => body.row_id === row.id);
      const bodyIds = [...new Set(rowDoors.map(door => door.compartment_id))];
      if (!rowDoors.length || rowDoors.some((door, index) => door.sort_order !== index)
        || bodyIds.length !== rowBodies.length || bodyIds.some(id => !rowBodies.some(body => body.id === id))) {
        throw new AppError('errors.storedConnections');
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
            throw new AppError('errors.storedOpening');
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
}

/** 등록 초안을 검증·저장하고 커밋이 완료된 냉장고의 ID를 반환한다. */
export async function registerRefrigerator(db: SQLiteDatabase, draft: RefrigeratorDraft): Promise<string> {
  const data = prepareRefrigeratorRegistration(draft, uuid.v4);

  await db.withExclusiveTransactionAsync(async transaction => {
    const existing = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM refrigerators LIMIT 1;');
    if (existing) throw new AppError('errors.fridgeExists');

    await transaction.runAsync(
      'INSERT INTO refrigerators (id, name) VALUES (?, ?);',
      data.refrigerator.id, data.refrigerator.name,
    );
    await writeStructure(transaction, data);
    await checkForeignKeys(transaction);
  });

  return data.refrigerator.id;
}

/** 구조와 위치 ID를 유지한 채 이름만 변경하고, 저장된 이름을 반환한다. */
export async function updateRefrigeratorName(db: SQLiteDatabase, refrigeratorId: string, name: string): Promise<string> {
  const normalizedName = normalizeRefrigeratorName(name);
  const result = await db.runAsync('UPDATE refrigerators SET name = ? WHERE id = ?;', normalizedName, refrigeratorId);
  if (result.changes !== 1) throw new AppError('errors.fridgeMissing');
  return normalizedName;
}

/** 기존 ID를 유지해 구성을 수정하고, 사라진 위치만 자식부터 정리한다. */
export async function updateRefrigerator(db: SQLiteDatabase, refrigeratorId: string, draft: RefrigeratorDraft): Promise<string> {
  await db.withExclusiveTransactionAsync(async transaction => {
    const existing = await readRefrigerator(transaction);
    if (!existing || existing.id !== refrigeratorId) throw new AppError('errors.fridgeMissing');
    const data = prepareRefrigeratorRegistration(draft, uuid.v4, existing);
    const oldBodies = existing.rows.flatMap(row => row.compartments);
    const oldDoors = existing.rows.flatMap(row => row.doors);
    const oldSlots = [...oldBodies, ...oldDoors].flatMap(area => area.slots);
    await transaction.runAsync('UPDATE refrigerators SET name = ? WHERE id = ?;', data.refrigerator.name, refrigeratorId);

    // 삭제·재배치 전의 순서와 새 순서가 UNIQUE 제약에서 충돌하지 않도록 임시로 뒤로 옮긴다.
    await transaction.runAsync(
      'UPDATE refrigerator_rows SET sort_order = sort_order + ? WHERE refrigerator_id = ?;',
      existing.rows.length + data.rows.length, refrigeratorId,
    );
    await transaction.runAsync(`
      UPDATE refrigerator_doors SET sort_order = sort_order + ?
      WHERE row_id IN (SELECT id FROM refrigerator_rows WHERE refrigerator_id = ?);
    `, oldDoors.length + data.doors.length, refrigeratorId);
    await transaction.runAsync(`
      UPDATE refrigerator_slots SET sort_order = sort_order + ?
      WHERE compartment_id IN (
        SELECT body.id FROM refrigerator_compartments AS body
        JOIN refrigerator_rows AS row ON row.id = body.row_id WHERE row.refrigerator_id = ?
      ) OR door_id IN (
        SELECT door.id FROM refrigerator_doors AS door
        JOIN refrigerator_rows AS row ON row.id = door.row_id WHERE row.refrigerator_id = ?
      );
    `, oldSlots.length + data.slots.length, refrigeratorId, refrigeratorId);
    await writeStructure(transaction, data);
    await deleteRemovedRecords(transaction, 'refrigerator_slots', oldSlots.map(slot => slot.id!), data.slots.map(slot => slot.id));
    await deleteRemovedRecords(transaction, 'refrigerator_doors', oldDoors.map(door => door.id), data.doors.map(door => door.id));
    await deleteRemovedRecords(transaction, 'refrigerator_compartments', oldBodies.map(body => body.id), data.compartments.map(body => body.id));
    await deleteRemovedRecords(transaction, 'refrigerator_rows', existing.rows.map(row => row.id), data.rows.map(row => row.id));
    await checkForeignKeys(transaction);
  });
  return refrigeratorId;
}

/** 등록·수정에서 같은 순서로 부모부터 기록하며 기존 위치는 삭제하지 않고 갱신한다. */
async function writeStructure(transaction: SQLiteDatabase, data: RefrigeratorRegistrationData) {
  for (const row of data.rows) {
    await transaction.runAsync(
      `INSERT INTO refrigerator_rows (id, refrigerator_id, sort_order) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET refrigerator_id = excluded.refrigerator_id, sort_order = excluded.sort_order;`,
      row.id, row.refrigerator_id, row.sort_order,
    );
  }
  for (const body of data.compartments) {
    await transaction.runAsync(
      `INSERT INTO refrigerator_compartments (id, row_id, storage_mode, kind, side) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET row_id = excluded.row_id, storage_mode = excluded.storage_mode,
        kind = excluded.kind, side = excluded.side;`,
      body.id, body.row_id, body.storage_mode, body.kind, body.side,
    );
  }
  for (const door of data.doors) {
    await transaction.runAsync(
      `INSERT INTO refrigerator_doors (id, row_id, compartment_id, sort_order, storage_enabled) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET row_id = excluded.row_id, compartment_id = excluded.compartment_id,
        sort_order = excluded.sort_order, storage_enabled = excluded.storage_enabled;`,
      door.id, door.row_id, door.compartment_id, door.sort_order, door.storage_enabled,
    );
  }
  for (const slot of data.slots) {
    await transaction.runAsync(
      `INSERT INTO refrigerator_slots (id, compartment_id, door_id, sort_order, drawer_count) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET compartment_id = excluded.compartment_id, door_id = excluded.door_id,
        sort_order = excluded.sort_order, drawer_count = excluded.drawer_count;`,
      slot.id, slot.compartment_id, slot.door_id, slot.sort_order, slot.drawer_count,
    );
  }
}

async function deleteRemovedRecords(
  transaction: SQLiteDatabase,
  table: 'refrigerator_slots' | 'refrigerator_doors' | 'refrigerator_compartments' | 'refrigerator_rows',
  previousIds: string[], nextIds: string[],
) {
  const retained = new Set(nextIds);
  for (const id of previousIds) {
    if (!retained.has(id)) await transaction.runAsync(`DELETE FROM ${table} WHERE id = ?;`, id);
  }
}

/** 전용 연결에는 초기화 연결의 외래 키 설정이 공유되지 않아 커밋 전에 직접 검사한다. */
async function checkForeignKeys(transaction: SQLiteDatabase) {
  const violation = await transaction.getFirstAsync('PRAGMA foreign_key_check;');
  if (violation) throw new AppError('errors.fridgeConnections');
}
