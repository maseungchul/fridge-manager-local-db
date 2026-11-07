/**
 * @file
 * 냉장고 이름 변경·등록·수정과 재료 위치 보호 알림의 번역 키를 정의한다.
 * 알림 제목과 표시·오류 메시지 선택은 호출하는 화면에서 관리한다.
 */
export const fridgeMessages = {
  nameChangeSuccess: 'fridge.nameChangeSuccess',
  nameChangeFailure: 'fridge.nameChangeFailure',
  registrationSuccess: 'fridge.registrationSuccess',
  updateSuccess: 'fridge.updateSuccess',
  saveFailure: 'fridge.saveFailure',
  ingredientLocationChangeBlocked: 'fridge.ingredientLocationChangeBlocked',
} as const;
