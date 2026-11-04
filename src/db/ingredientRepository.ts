/**
 * @file
 * 홈 도면과 선택한 칸·좌우 위치의 재료를 SQLite에서 조회하고 수동 등록한다.
 * 저장 결과는 재료 모델로 반환하며, 화면의 선택·로딩·오류 상태는 호출자가 관리한다.
 */
import { uuid } from 'expo';
import type { SQLiteDatabase } from 'expo-sqlite';
import { prepareIngredientRegistration } from '@/db/ingredientRegistration';
import type { Ingredient } from '@/features/ingredient/model/ingredient';

/** 냉장고 한 대의 전체 재료를 조회해 홈 도면의 위치별 등록 건수를 복원한다. */
export function getIngredients(db: SQLiteDatabase) {
  return db.getAllAsync<Ingredient>(`
    SELECT id, name, quantity, expiration_date AS expirationDate,
      slot_id AS slotId, drawer_number AS drawerNumber
    FROM ingredients;
  `);
}

/** 유통기한이 빠른 재료부터 표시하고, 날짜가 없는 재료는 뒤에 둔다. */
export function getIngredientsByPosition(db: SQLiteDatabase, position: Pick<Ingredient, 'slotId' | 'drawerNumber'>) {
  return db.getAllAsync<Ingredient>(`
    SELECT id, name, quantity, expiration_date AS expirationDate,
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
    INSERT INTO ingredients (id, name, quantity, expiration_date, slot_id, drawer_number)
    VALUES (?, ?, ?, ?, ?, ?);
  `, ingredient.id, ingredient.name, ingredient.quantity, ingredient.expirationDate,
  ingredient.slotId, ingredient.drawerNumber);
  return ingredient;
}
