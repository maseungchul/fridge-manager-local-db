/**
 * @file
 * tokens는 화면과 공통 컴포넌트에서 재사용하는 색상·간격·도면 음영을 정의한다.
 * 스타일에서 공통 토큰을 참조해 앱 전체의 디자인 기준을 맞춘다.
 * as const는 속성을 타입상 readonly로 만들고 각 값의 리터럴 타입을 유지한다.
 * 실제 객체를 런타임에 동결하는 기능은 아니다.
 */

// 화면 배경, 글자, 버튼, 오류 표시 등에 사용할 공통 색상이다.
export const colors = {
  // background는 화면 전체 배경, surface는 폼 카드 등 콘텐츠 영역의 배경이다.
  background: '#F4F0E8',
  surface: '#FFFCF7',
  // 하단 편집 도구와 안전 영역을 같은 배경으로 연결한다.
  toolbar: '#F9F6F0',
  // text는 기본 글자, textMuted는 보조 설명과 입력 안내 문구에 사용한다.
  text: '#22231F',
  textMuted: '#77776F',
  // 냉장고 경로의 실 이름과 아이콘을 등록·편집·홈에서 같은 색상으로 구분한다.
  chilled: '#487044',
  frozen: '#2F6C9D',
  // 등록 도면의 보관 모드 배지와 선택 영역에 사용하는 옅은 배경색이다.
  chilledBackground: '#E4EDDE',
  frozenBackground: '#E0EDF6',
  // 입력 필드 등의 테두리에 사용한다.
  border: '#D9D5CC',
  // 인증 시작 화면의 브랜드 장식에 사용하는 색상이다.
  sage: '#A8B7A1',
  // 냉장고 위치와 하단 메뉴의 선택 상태를 표시하는 옅은 배경색이다.
  sageLight: '#DCE5D4',
  cream: '#E8D8BC',
  rose: '#D4B3AD',
  blue: '#ACC2CC',
  // 버튼의 기본 배경, 누르는 동안의 배경, 글자·로딩 표시 색상을 구분한다.
  button: '#29322A',
  buttonPressed: '#1F261F',
  buttonText: '#FFFFFF',
  // 오류 문구와 입력 오류가 있는 필드의 테두리에 사용한다.
  error: '#A6413B',
} as const;

// 도면은 왼쪽 위의 빛과 오른쪽 아래의 음영을 공유해 면·선반·금속 부품의 깊이를 맞춘다.
export const fridgeSurfaces = {
  border: '#A8B2A6',
  raisedShadow: [
    { offsetX: 0, offsetY: 2, blurRadius: 4, color: '#29322A18' },
    { inset: true, offsetX: 1, offsetY: 1, blurRadius: 1, color: '#FFFFFFE0' },
    { inset: true, offsetX: -2, offsetY: -2, blurRadius: 3, color: '#29322A14' },
  ],
  recessedShadow: [
    { offsetX: 0, offsetY: 2, blurRadius: 4, color: '#29322A14' },
    { inset: true, offsetX: 2, offsetY: 2, blurRadius: 4, color: '#29322A18' },
  ],
  shelfShadow: [
    { inset: true, offsetX: 0, offsetY: -3, blurRadius: 2, color: '#29322A12' },
  ],
} as const;

// padding, margin, gap에 사용하는 공통 간격이다. xs부터 xxl까지 크기가 커진다.
// React Native 스타일의 숫자 값은 화면 밀도에 독립적인 논리 단위로 사용된다.
export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// 플로팅 탭과 선반의 외곽 반경이다. 안쪽 반경은 각 화면의 여백을 빼서 계산한다.
export const radii = {
  container: 22,
  shelf: 14,
} as const;
