/**
 * @file
 * 재료의 기본 정보와 SQLite에 저장하는 보관 위치 타입을 정의한다.
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
