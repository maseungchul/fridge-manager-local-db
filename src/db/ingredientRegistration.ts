/**
 * @file
 * 재료 등록 입력을 검증하고 SQLite에 저장할 재료 모델로 정규화한다.
 * UUID 발급은 호출자가 제공하며, 실제 위치의 사용 가능 여부는 DB 제약으로 검사한다.
 */
import type { Ingredient } from '@/features/ingredient/model/ingredient';

/** 이름·수량·메모의 공백을 정리하고 유통기한은 시간대 변환 없이 날짜로 검증한다. */
export function prepareIngredientRegistration(input: Omit<Ingredient, 'id'>, createId: () => string): Ingredient {
  const name = input.name.trim();
  const quantity = input.quantity.trim();
  const memo = input.memo?.trim() || null;
  const expirationDate = input.expirationDate?.trim() || null;
  if (!name || name.length > 50) throw new Error('재료명은 1~50자로 입력해 주세요.');
  if (!quantity || quantity.length > 50) throw new Error('수량은 1~50자로 입력해 주세요.');
  if (!input.slotId.trim() || ![0, 1, 2].includes(input.drawerNumber)) {
    throw new Error('재료를 보관할 위치를 선택해 주세요.');
  }
  if (expirationDate !== null) {
    const timestamp = Date.parse(`${expirationDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate) || !Number.isFinite(timestamp)
      || new Date(timestamp).toISOString().slice(0, 10) !== expirationDate) {
      throw new Error('유통기한은 실제 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
    }
  }
  return { ...input, id: createId(), name, quantity, memo, expirationDate };
}
