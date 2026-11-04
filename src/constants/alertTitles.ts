/**
 * @file
 * 앱 전반에서 사용하는 알림·경고·오류의 공통 제목을 정의한다.
 * 기능별 본문과 알림 표시는 호출하는 화면에서 관리한다.
 */
export const alertTitles = {
  info: '알림',
  warning: '경고',
  error: '오류',
} as const;
