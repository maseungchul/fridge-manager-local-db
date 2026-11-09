/**
 * @file
 * 재료의 기본 정보·보관 위치·소비 기록 타입과 유통기한 표시 규칙을 정의한다.
 * 도면용 위치 ID 대신 칸 UUID와 좌우 번호를 사용하며, 화면 입력과 DB 처리는 호출자가 관리한다.
 */
import { defaultTranslate } from '@/i18n/translations';
import type { Translator } from '@/i18n/translations';

export interface Ingredient {
  id: string;
  name: string;
  quantity: string;
  memo: string | null;
  // 날짜는 시간대 변환 없이 YYYY-MM-DD로 저장하고, 미입력은 null로 구분한다.
  expirationDate: string | null;
  slotId: string;
  // 분할 없음·도어포켓은 0, 좌우 2칸은 왼쪽 1·오른쪽 2를 사용한다.
  drawerNumber: 0 | 1 | 2;
}

export type IngredientDraft = Pick<Ingredient, 'name' | 'quantity' | 'memo' | 'expirationDate'>;

/** 소비 당시 정보와 원래 위치를 보존하며, 복구가 끝날 때까지 목록에 남긴다. */
export interface ConsumedIngredient extends Ingredient {
  consumedAt: string;
}

export interface IngredientCounts {
  total: number;
  normal: number;
  warning: number;
  expired: number;
  unknown: number;
}

/** 시각·일광 절약 시간과 무관하게 현지 달력 날짜로 남은 일수를 계산한다. */
export function getIngredientExpirationStatus(expirationDate: string | null, now = new Date(), t: Translator = defaultTranslate) {
  if (expirationDate == null) return { label: t('ingredient.noExpiration'), isUrgent: false, isExpired: false };
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((Date.parse(`${expirationDate}T00:00:00Z`) - today) / 86_400_000);
  return {
    label: days > 0 ? t('ingredient.remaining', { days }) : days === 0 ? t('ingredient.today') : t('ingredient.expiredDays', { days: -days }),
    isUrgent: days <= 2,
    isExpired: days < 0,
  };
}

/** 유통기한 상태와 미입력 재료를 중복 없이 집계한다. */
export function getIngredientCounts(ingredients: readonly Pick<Ingredient, 'expirationDate'>[], now = new Date()): IngredientCounts {
  const counts = { total: ingredients.length, normal: 0, warning: 0, expired: 0, unknown: 0 };
  for (const ingredient of ingredients) {
    if (ingredient.expirationDate === null) { counts.unknown++; continue; }
    const status = getIngredientExpirationStatus(ingredient.expirationDate, now);
    if (status.isExpired) counts.expired++;
    else if (status.isUrgent) counts.warning++;
    else counts.normal++;
  }
  return counts;
}
