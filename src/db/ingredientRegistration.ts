/**
 * @file
 * 재료 등록·수정 입력을 검증하고 SQLite에 저장할 재료 모델로 정규화한다.
 * UUID 발급은 호출자가 제공하며, 실제 위치의 사용 가능 여부는 DB 제약으로 검사한다.
 */
import type { Ingredient } from '@/features/ingredient/model/ingredient';
import { AppError } from '@/i18n/errors';

/** 이름·수량·메모의 공백을 정리하고 유통기한은 시간대 변환 없이 날짜로 검증한다. */
export function prepareIngredientRegistration(input: Omit<Ingredient, 'id'>, createId: () => string,
  existing?: Pick<Ingredient, 'name' | 'quantity'> | null): Ingredient {
  const name = input.name.trim();
  const quantity = input.quantity.trim();
  const memo = input.memo?.trim() || null;
  const expirationDate = input.expirationDate?.trim() || null;
  if (!name || (name.length > 20 && input.name !== existing?.name)) throw new AppError('errors.ingredientName');
  if (!quantity || (quantity.length > 10 && input.quantity !== existing?.quantity)) throw new AppError('errors.ingredientQuantity');
  if (!input.slotId.trim() || ![0, 1, 2].includes(input.drawerNumber)) {
    throw new AppError('errors.ingredientPosition');
  }
  if (expirationDate !== null) {
    const timestamp = Date.parse(`${expirationDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate) || !Number.isFinite(timestamp)
      || new Date(timestamp).toISOString().slice(0, 10) !== expirationDate) {
      throw new AppError('errors.expirationDate');
    }
  }
  return { ...input, id: createId(), name, quantity, memo, expirationDate };
}
