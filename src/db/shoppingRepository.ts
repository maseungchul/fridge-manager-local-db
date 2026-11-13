/**
 * @file
 * 구매 예정 항목을 냉장고 재료와 별도로 저장하고 조회한다.
 */
import { uuid } from 'expo';
import type { SQLiteDatabase } from 'expo-sqlite';
import { AppError } from '@/i18n/errors';

export const SHOPPING_INPUT_MAX_LENGTH = 50;

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: string;
}

/** 최근 추가한 항목부터 표시한다. */
export function getShoppingItems(db: SQLiteDatabase) {
  return db.getAllAsync<ShoppingItem>(`
    SELECT id, name, quantity FROM shopping_items ORDER BY created_at DESC, rowid DESC;
  `);
}

/** 수량의 단위를 그대로 보존하며 같은 이름도 별도 항목으로 등록한다. */
export async function addShoppingItem(db: SQLiteDatabase, input: Omit<ShoppingItem, 'id'>): Promise<ShoppingItem> {
  const name = input.name.trim();
  const quantity = input.quantity.trim();
  if (!name || !quantity || name.length > SHOPPING_INPUT_MAX_LENGTH || quantity.length > SHOPPING_INPUT_MAX_LENGTH) {
    throw new AppError('shopping.invalidInput');
  }

  const item = { id: uuid.v4(), name, quantity };
  await db.runAsync(`
    INSERT INTO shopping_items (id, name, quantity, created_at) VALUES (?, ?, ?, ?);
  `, item.id, item.name, item.quantity, new Date().toISOString());
  return item;
}
