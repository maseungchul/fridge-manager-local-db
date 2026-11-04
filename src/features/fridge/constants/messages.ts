/**
 * @file
 * 냉장고 이름 변경·등록·수정 알림의 기본 본문을 정의한다.
 * 알림 제목과 표시·오류 메시지 선택은 호출하는 화면에서 관리한다.
 */
export const fridgeMessages = {
  nameChangeSuccess: '냉장고 이름을 변경했습니다.',
  nameChangeFailure: '냉장고 이름을 저장하지 못했습니다. 다시 시도해 주세요.',
  saveFailure: '냉장고를 저장하지 못했습니다. 다시 시도해 주세요.',
} as const;
