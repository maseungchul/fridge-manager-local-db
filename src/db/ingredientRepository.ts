/**
 * @file
 * 홈 도면과 선택한 칸·좌우 위치의 재료를 SQLite에서 조회하고 등록·수정·삭제·이동한다.
 * 저장 결과는 재료 모델로 반환하며, 화면의 선택·로딩·오류 상태는 호출자가 관리한다.
 */
import { uuid } from 'expo';
import type { SQLiteDatabase } from 'expo-sqlite';
import { prepareIngredientRegistration } from '@/db/ingredientRegistration';
import type { Ingredient } from '@/features/ingredient/model/ingredient';

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
  if (result.changes !== 1) throw new Error('수정할 재료를 찾을 수 없습니다. 재료 목록을 다시 확인해 주세요.');
  return ingredient;
}

/** ID와 보관 위치가 일치하는 재료 한 건만 삭제하고, 달라진 대상은 목록에서 다시 확인한다. */
export async function deleteIngredient(db: SQLiteDatabase, ingredient: Pick<Ingredient, 'id' | 'slotId' | 'drawerNumber'>): Promise<void> {
  const result = await db.runAsync(`
    DELETE FROM ingredients WHERE id = ? AND slot_id = ? AND drawer_number = ?;
  `, ingredient.id, ingredient.slotId, ingredient.drawerNumber);
  if (result.changes !== 1) throw new Error('삭제할 재료를 찾을 수 없습니다. 재료 목록을 다시 확인해 주세요.');
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
      if (!stored) throw new Error('이동할 재료를 찾을 수 없습니다. 재료 목록을 다시 확인해 주세요.');
      if (stored.slotId === destination.slotId && stored.drawerNumber === destination.drawerNumber) continue;
      const result = await transaction.runAsync(`
        UPDATE ingredients SET slot_id = ?, drawer_number = ?
        WHERE id = ? AND slot_id = ? AND drawer_number = ?;
      `, destination.slotId, destination.drawerNumber, stored.id, stored.slotId, stored.drawerNumber);
      if (result.changes !== 1) throw new Error('이동할 재료를 찾을 수 없습니다. 재료 목록을 다시 확인해 주세요.');
      moved.push({ ...stored, ...destination });
    }
  });
  return moved;
}
