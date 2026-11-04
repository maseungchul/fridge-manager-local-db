/**
 * @file
 * 재료의 기본 정보·보관 위치 타입과 유통기한 표시 규칙을 정의한다.
 * 도면용 위치 ID 대신 칸 UUID와 좌우 번호를 사용하며, 화면 입력과 DB 처리는 호출자가 관리한다.
 */
export interface Ingredient {
  id: string;
  name: string;
  quantity: string;
  // 날짜는 시간대 변환 없이 YYYY-MM-DD로 저장하고, 미입력은 null로 구분한다.
  expirationDate: string | null;
  slotId: string;
  // 분할 없음·도어포켓은 0, 좌우 2칸은 왼쪽 1·오른쪽 2를 사용한다.
  drawerNumber: 0 | 1 | 2;
}

/** 시각·일광 절약 시간과 무관하게 현지 달력 날짜로 남은 일수를 계산한다. */
export function getIngredientExpirationStatus(expirationDate: string | null, now = new Date()) {
  if (expirationDate === null) return { label: '유통기한 미입력', isUrgent: false };
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((Date.parse(`${expirationDate}T00:00:00Z`) - today) / 86_400_000);
  return {
    label: days > 0 ? `D-${days}` : days === 0 ? 'D-DAY' : `D+${-days}`,
    isUrgent: days <= 2,
  };
}
