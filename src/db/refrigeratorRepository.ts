/**
 * @file
 * 냉장고 등록 구성을 SQLite에 저장하고 홈에서 표시할 기본 정보를 조회한다.
 * 냉장고·단·본체·문·칸은 하나의 트랜잭션으로 처리하고 화면 상태는 호출자가 관리한다.
 */
import { uuid } from 'expo';
import type { SQLiteDatabase } from 'expo-sqlite';
import { prepareRefrigeratorRegistration } from '@/db/refrigeratorRegistration';
import type { RefrigeratorDraft } from '@/features/fridge/model/fridgeLayout';

/** 홈이 표시될 때 등록 여부와 냉장고 이름을 확인한다. */
export function getRefrigeratorSummary(db: SQLiteDatabase) {
  return db.getFirstAsync<{ id: string; name: string }>('SELECT id, name FROM refrigerators LIMIT 1;');
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
