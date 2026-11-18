/**
 * @file
 * 구매 예정 항목을 냉장고 재료와 별도로 관리한다.
 */
import { uuid } from 'expo';
import type { SQLiteDatabase } from 'expo-sqlite';
import { AppError } from '@/i18n/errors';

export const SHOPPING_INPUT_MAX_LENGTH = 50;

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: string;
  memo: string | null;
}

function normalizeShoppingInput(input: Omit<ShoppingItem, 'id'>) {
  const name = input.name.trim();
  const quantity = input.quantity.trim();
  if (!name || !quantity || name.length > SHOPPING_INPUT_MAX_LENGTH || quantity.length > SHOPPING_INPUT_MAX_LENGTH) {
    throw new AppError('shopping.invalidInput');
  }
  return { name, quantity, memo: input.memo?.trim() || null };
}

/** 최근 추가한 항목부터 표시한다. */
export function getShoppingItems(db: SQLiteDatabase) {
  return db.getAllAsync<ShoppingItem>(`
    SELECT id, name, quantity, memo FROM shopping_items ORDER BY created_at DESC, rowid DESC;
  `);
}

/** 수량의 단위를 그대로 보존하며 같은 이름도 별도 항목으로 등록한다. */
export async function addShoppingItem(db: SQLiteDatabase, input: Omit<ShoppingItem, 'id'>): Promise<ShoppingItem> {
  const item = { ...normalizeShoppingInput(input), id: uuid.v4() };
  await db.runAsync(`
    INSERT INTO shopping_items (id, name, quantity, created_at, memo) VALUES (?, ?, ?, ?, ?);
  `, item.id, item.name, item.quantity, new Date().toISOString(), item.memo);
  return item;
}

/** 같은 이름의 품목과 추가 순서를 유지하고 선택한 품목만 수정한다. */
export async function updateShoppingItem(db: SQLiteDatabase, item: ShoppingItem) {
  const { name, quantity, memo } = normalizeShoppingInput(item);
  const result = await db.runAsync(`
    UPDATE shopping_items SET name = ?, quantity = ?, memo = ? WHERE id = ?;
  `, name, quantity, memo, item.id);
  if (result.changes !== 1) throw new AppError('shopping.updateMissing');
}

/** 선택한 품목을 한 번에 삭제한다. */
export async function deleteShoppingItems(db: SQLiteDatabase, ids: string[]) {
  await db.withTransactionAsync(async () => {
    for (const id of ids) await db.runAsync('DELETE FROM shopping_items WHERE id = ?;', id);
  });
}
