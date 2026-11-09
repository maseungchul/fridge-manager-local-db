/**
 * @file
 * 홈 도면과 선택한 칸의 재료를 조회하고 등록·수정·삭제·이동·소비 완료·복구한다.
 * 저장 결과는 재료 모델로 반환하며, 화면의 선택·로딩·오류 상태는 호출자가 관리한다.
 */
import { uuid } from 'expo';
import type { SQLiteDatabase } from 'expo-sqlite';
import { prepareIngredientRegistration } from '@/db/ingredientRegistration';
import type { ConsumedIngredient, Ingredient } from '@/features/ingredient/model/ingredient';
import { AppError } from '@/i18n/errors';

/** 냉장고 한 대의 전체 재료를 조회해 홈 도면의 위치별 등록 건수를 복원한다. */
export function getIngredients(db: SQLiteDatabase) {
  return db.getAllAsync<Ingredient>(`
    SELECT id, name, quantity, memo, expiration_date AS expirationDate,
      slot_id AS slotId, drawer_number AS drawerNumber
    FROM ingredients;
  `);
}

/** 유통기한이 빠른 재료부터 표시하고, 날짜가 없는 재료는 뒤에 둔다. */
export function getIngredientsByPosition(db: SQLiteDatabase, position: Pick<Ingredient, 'slotId' | 'drawerNumber'>) {
  return db.getAllAsync<Ingredient>(`
    SELECT id, name, quantity, memo, expiration_date AS expirationDate,
      slot_id AS slotId, drawer_number AS drawerNumber
    FROM ingredients
    WHERE slot_id = ? AND drawer_number = ?
    ORDER BY expiration_date IS NULL, expiration_date, name, id;
  `, position.slotId, position.drawerNumber);
}

/** 한 번의 INSERT로 재료를 등록하고, 저장된 입력과 UUID를 반환한다. */
export async function registerIngredient(db: SQLiteDatabase, input: Omit<Ingredient, 'id'>): Promise<Ingredient> {
  const ingredient = prepareIngredientRegistration(input, uuid.v4);
  await db.runAsync(`
    INSERT INTO ingredients (id, name, quantity, memo, expiration_date, slot_id, drawer_number)
    VALUES (?, ?, ?, ?, ?, ?, ?);
  `, ingredient.id, ingredient.name, ingredient.quantity, ingredient.memo, ingredient.expirationDate,
  ingredient.slotId, ingredient.drawerNumber);
  return ingredient;
}

/** 등록과 같은 검증을 적용하고, 기존 ID·보관 위치가 일치하는 재료의 기본 정보만 수정한다. */
export async function updateIngredient(db: SQLiteDatabase, input: Ingredient): Promise<Ingredient> {
  const ingredient = prepareIngredientRegistration(input, () => input.id);
  const result = await db.runAsync(`
    UPDATE ingredients SET name = ?, quantity = ?, memo = ?, expiration_date = ?
    WHERE id = ? AND slot_id = ? AND drawer_number = ?;
  `, ingredient.name, ingredient.quantity, ingredient.memo, ingredient.expirationDate,
  ingredient.id, ingredient.slotId, ingredient.drawerNumber);
  if (result.changes !== 1) throw new AppError('errors.ingredientUpdateMissing');
  return ingredient;
}

/** ID와 보관 위치가 일치하는 재료 한 건만 삭제하고, 달라진 대상은 목록에서 다시 확인한다. */
export async function deleteIngredient(db: SQLiteDatabase, ingredient: Pick<Ingredient, 'id' | 'slotId' | 'drawerNumber'>): Promise<void> {
  const result = await db.runAsync(`
    DELETE FROM ingredients WHERE id = ? AND slot_id = ? AND drawer_number = ?;
  `, ingredient.id, ingredient.slotId, ingredient.drawerNumber);
  if (result.changes !== 1) throw new AppError('errors.ingredientDeleteMissing');
}

/** 최신 재료 정보를 완료 기록에 보관하고, 냉장고에서 제거하는 작업을 함께 확정한다. */
export async function consumeIngredient(db: SQLiteDatabase, ingredient: Pick<Ingredient, 'id' | 'slotId' | 'drawerNumber'>): Promise<void> {
  await consumeIngredients(db, [ingredient]);
}

/** 선택한 재료 중 한 건이라도 달라지거나 저장에 실패하면 전체 소비 완료를 취소한다. */
export async function consumeIngredients(db: SQLiteDatabase, ingredients: readonly Pick<Ingredient, 'id' | 'slotId' | 'drawerNumber'>[]): Promise<void> {
  if (ingredients.length === 0) return;
  const consumedAt = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async transaction => {
    for (const ingredient of new Map(ingredients.map(item => [item.id, item])).values()) {
      const result = await transaction.runAsync(`
        INSERT INTO consumed_ingredients (id, name, quantity, memo, expiration_date, slot_id, drawer_number, consumed_at)
        SELECT id, name, quantity, memo, expiration_date, slot_id, drawer_number, ? FROM ingredients
        WHERE id = ? AND slot_id = ? AND drawer_number = ?;
      `, consumedAt, ingredient.id, ingredient.slotId, ingredient.drawerNumber);
      if (result.changes !== 1) throw new AppError('errors.ingredientConsumeMissing');
      await deleteIngredient(transaction, ingredient);
    }
  });
}

/** 선택한 ID·출발 위치를 한 트랜잭션에서 삭제하고 일부만 삭제되는 상황을 막는다. */
export async function deleteIngredients(db: SQLiteDatabase, ingredients: readonly Pick<Ingredient, 'id' | 'slotId' | 'drawerNumber'>[]): Promise<void> {
  if (ingredients.length === 0) return;
  await db.withExclusiveTransactionAsync(async transaction => {
    for (const ingredient of new Map(ingredients.map(item => [item.id, item])).values()) {
      await deleteIngredient(transaction, ingredient);
    }
  });
}

/** 원래 위치가 사라져도 기록을 유지하고, 최근 소비한 재료부터 표시한다. */
export function getConsumedIngredients(db: SQLiteDatabase) {
  return db.getAllAsync<ConsumedIngredient>(`
    SELECT id, name, quantity, memo, expiration_date AS expirationDate,
      slot_id AS slotId, drawer_number AS drawerNumber, consumed_at AS consumedAt
    FROM consumed_ingredients ORDER BY consumed_at DESC, id;
  `);
}

export function getConsumedIngredient(db: SQLiteDatabase, record: Pick<ConsumedIngredient, 'id' | 'consumedAt'>) {
  return db.getFirstAsync<ConsumedIngredient>(`
    SELECT id, name, quantity, memo, expiration_date AS expirationDate,
      slot_id AS slotId, drawer_number AS drawerNumber, consumed_at AS consumedAt
    FROM consumed_ingredients WHERE id = ? AND consumed_at = ?;
  `, record.id, record.consumedAt);
}

/** 원래 위치가 유효하지 않으면 기록을 남기고 null을 반환해 새 위치 선택으로 연결한다. */
export async function restoreConsumedIngredient(db: SQLiteDatabase, record: Pick<ConsumedIngredient, 'id' | 'consumedAt'>,
  destination?: Pick<Ingredient, 'slotId' | 'drawerNumber'>): Promise<Ingredient | null> {
  let restored: Ingredient | null = null;
  await db.withExclusiveTransactionAsync(async transaction => {
    const stored = await getConsumedIngredient(transaction, record);
    if (!stored) throw new AppError('errors.consumedIngredientMissing');
    const position = destination ?? stored;
    const available = await transaction.getFirstAsync(`
      SELECT slot.id FROM refrigerator_slots AS slot
      LEFT JOIN refrigerator_doors AS door ON door.id = slot.door_id
      LEFT JOIN refrigerator_compartments AS body ON body.id = door.compartment_id
      WHERE slot.id = ? AND ((slot.drawer_count = 2 AND ? IN (1, 2)) OR (slot.drawer_count IN (0, 1) AND ? = 0))
        AND (slot.door_id IS NULL OR (door.storage_enabled = 1 AND body.kind = 'HINGED'));
    `, position.slotId, position.drawerNumber, position.drawerNumber);
    if (!available) {
      if (destination) throw new AppError('errors.invalidPosition');
      return;
    }
    const ingredient: Ingredient = { id: stored.id, name: stored.name, quantity: stored.quantity, memo: stored.memo,
      expirationDate: stored.expirationDate, slotId: position.slotId, drawerNumber: position.drawerNumber };
    await transaction.runAsync(`
      INSERT INTO ingredients (id, name, quantity, memo, expiration_date, slot_id, drawer_number)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `, ingredient.id, ingredient.name, ingredient.quantity, ingredient.memo, ingredient.expirationDate,
    ingredient.slotId, ingredient.drawerNumber);
    await deleteConsumedIngredient(transaction, record);
    restored = ingredient;
  });
  return restored;
}

/** 화면에서 확인한 완료 기록만 영구 삭제하고, 이미 처리된 기록의 중복 요청을 거부한다. */
export async function deleteConsumedIngredient(db: SQLiteDatabase, record: Pick<ConsumedIngredient, 'id' | 'consumedAt'>): Promise<void> {
  const result = await db.runAsync('DELETE FROM consumed_ingredients WHERE id = ? AND consumed_at = ?;', record.id, record.consumedAt);
  if (result.changes !== 1) throw new AppError('errors.consumedIngredientMissing');
}

/** 최신 재료와 출발 위치를 확인하고, 한 건이라도 달라졌으면 전체 이동을 취소한다. */
export async function moveIngredients(db: SQLiteDatabase, ingredients: readonly Ingredient[],
  destination: Pick<Ingredient, 'slotId' | 'drawerNumber'>): Promise<Ingredient[]> {
  const moved: Ingredient[] = [];
  if (ingredients.length === 0) return moved;
  await db.withExclusiveTransactionAsync(async transaction => {
    const seen = new Set<string>();
    for (const ingredient of ingredients) {
      if (seen.has(ingredient.id)) continue;
      seen.add(ingredient.id);
      const stored = await transaction.getFirstAsync<Ingredient>(`
        SELECT id, name, quantity, memo, expiration_date AS expirationDate,
          slot_id AS slotId, drawer_number AS drawerNumber
        FROM ingredients WHERE id = ? AND slot_id = ? AND drawer_number = ?;
      `, ingredient.id, ingredient.slotId, ingredient.drawerNumber);
      if (!stored) throw new AppError('errors.ingredientMoveMissing');
      if (stored.slotId === destination.slotId && stored.drawerNumber === destination.drawerNumber) continue;
      const result = await transaction.runAsync(`
        UPDATE ingredients SET slot_id = ?, drawer_number = ?
        WHERE id = ? AND slot_id = ? AND drawer_number = ?;
      `, destination.slotId, destination.drawerNumber, stored.id, stored.slotId, stored.drawerNumber);
      if (result.changes !== 1) throw new AppError('errors.ingredientMoveMissing');
      moved.push({ ...stored, ...destination });
    }
  });
  return moved;
}
