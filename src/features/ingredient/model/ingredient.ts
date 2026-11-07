/**
 * @file
 * 재료의 기본 정보·보관 위치 타입과 유통기한 표시 규칙을 정의한다.
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

export interface IngredientCounts {
  total: number;
  normal: number;
  warning: number;
  expired: number;
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

/** 일반·기한주의·경과를 중복 없이 집계하고, 날짜 미입력은 일반 건수에 포함한다. */
export function getIngredientCounts(ingredients: readonly Pick<Ingredient, 'expirationDate'>[], now = new Date()): IngredientCounts {
  const counts = { total: ingredients.length, normal: 0, warning: 0, expired: 0 };
  for (const ingredient of ingredients) {
    const status = getIngredientExpirationStatus(ingredient.expirationDate, now);
    if (status.isExpired) counts.expired++;
    else if (status.isUrgent) counts.warning++;
    else counts.normal++;
  }
  return counts;
}
