/**
 * @file
 * 냉장고 이름 변경·등록·수정과 재료 위치 보호 알림의 기본 본문을 정의한다.
 * 알림 제목과 표시·오류 메시지 선택은 호출하는 화면에서 관리한다.
 */
export const fridgeMessages = {
  nameChangeSuccess: '냉장고 이름을 변경했습니다.',
  nameChangeFailure: '냉장고 이름을 저장하지 못했습니다. 다시 시도해 주세요.',
  registrationSuccess: '냉장고를 등록했습니다.',
  updateSuccess: '냉장고를 수정했습니다.',
  saveFailure: '냉장고를 저장하지 못했습니다. 다시 시도해 주세요.',
  ingredientLocationChangeBlocked: '재료가 있는 위치는 삭제하거나 구조를 변경할 수 없습니다. 홈에서 해당 재료를 먼저 이동하거나 삭제해 주세요.',
} as const;
