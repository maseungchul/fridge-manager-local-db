/**
 * @file
 * 장보기 품목의 상태를 관리하고 구매 완료 품목을 냉장고 재료로 옮긴다.
 */
import { uuid } from 'expo';
import type { SQLiteDatabase } from 'expo-sqlite';
import { registerIngredient } from '@/db/ingredientRepository';
import type { Ingredient, IngredientDraft } from '@/features/ingredient/model/ingredient';
import { INGREDIENT_MEMO_MAX_LENGTH, INGREDIENT_NAME_MAX_LENGTH, INGREDIENT_QUANTITY_MAX_LENGTH } from '@/features/ingredient/model/ingredient';
import { AppError } from '@/i18n/errors';

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: string;
  memo: string | null;
}

export type PurchasedShoppingItem = ShoppingItem & { purchasedAt: string };

export interface PurchasedIngredientRegistration {
  item: Pick<PurchasedShoppingItem, 'id' | 'purchasedAt'>;
  draft: IngredientDraft;
}

/** 현재 구매 기록을 재료 입력으로 전달하며 유통기한은 비워 둔다. */
export function preparePurchasedIngredientRegistrations(items: readonly PurchasedShoppingItem[]): PurchasedIngredientRegistration[] {
  return items.map(({ id, purchasedAt, name, quantity, memo }) => ({
    item: { id, purchasedAt },
    draft: { name, quantity, memo, expirationDate: null },
  }));
}

function normalizeShoppingInput(input: Omit<ShoppingItem, 'id'>) {
  const name = input.name.trim();
  const quantity = input.quantity.trim();
  const memo = input.memo?.trim() || null;
  if (!name || !quantity || name.length > INGREDIENT_NAME_MAX_LENGTH || quantity.length > INGREDIENT_QUANTITY_MAX_LENGTH
    || (memo?.length ?? 0) > INGREDIENT_MEMO_MAX_LENGTH) {
    throw new AppError('shopping.invalidInput');
  }
  return { name, quantity, memo };
}

/** 구매 완료 품목은 완료 순으로, 구매 예정 품목은 추가 순으로 읽는다. */
export function getShoppingItems(db: SQLiteDatabase) {
  return db.getAllAsync<ShoppingItem & { purchasedAt: string | null }>(`
    SELECT id, name, quantity, memo, purchased_at AS purchasedAt
    FROM shopping_items ORDER BY purchased_at DESC, created_at DESC, rowid DESC;
  `);
}

/** 품목의 입력 내용과 추가 순서를 유지하며 구매 상태만 바꾼다. */
export async function setShoppingItemsPurchased(db: SQLiteDatabase, ids: string[], purchased: boolean) {
  const purchasedAt = purchased ? new Date().toISOString() : null;
  await db.withTransactionAsync(async () => {
    const expectedState = purchased ? 'IS NULL' : 'IS NOT NULL';
    for (const id of new Set(ids)) {
      const result = await db.runAsync(`
        UPDATE shopping_items SET purchased_at = ? WHERE id = ? AND purchased_at ${expectedState};
      `, purchasedAt, id);
      if (result.changes !== 1) throw new AppError('shopping.purchaseError');
    }
  });
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

/** 선택한 구매 기록과 새 재료를 함께 처리하고 한 건이라도 실패하면 전체를 되돌린다. */
export async function registerPurchasedIngredients(db: SQLiteDatabase, registrations: readonly PurchasedIngredientRegistration[],
  position: Pick<Ingredient, 'slotId' | 'drawerNumber'>): Promise<Ingredient[]> {
  const ingredients: Ingredient[] = [];
  if (registrations.length === 0) return ingredients;
  await db.withExclusiveTransactionAsync(async transaction => {
    for (const { item, draft } of registrations) {
      if ((draft.memo?.trim().length ?? 0) > INGREDIENT_MEMO_MAX_LENGTH) throw new AppError('shopping.importMemoLength');
      const result = await transaction.runAsync(
        'DELETE FROM shopping_items WHERE id = ? AND purchased_at = ?;', item.id, item.purchasedAt);
      if (result.changes !== 1) throw new AppError('shopping.importMissing');
      const ingredient = await registerIngredient(transaction, { ...draft, ...position });
      ingredients.push(ingredient);
    }
  });
  return ingredients;
}
