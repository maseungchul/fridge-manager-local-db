/**
 * @file
 * tokens는 화면과 공통 컴포넌트에서 재사용하는 색상·간격·도면 치수를 정의한다.
 * 스타일에서 공통 토큰을 참조해 앱 전체의 디자인 기준을 맞춘다.
 * as const는 속성을 타입상 readonly로 만들고 각 값의 리터럴 타입을 유지한다.
 * 실제 객체를 런타임에 동결하는 기능은 아니다.
 */

// 화면 배경, 글자, 버튼, 오류 표시 등에 사용할 공통 색상이다.
export const colors = {
  // background는 화면 전체 배경, surface는 폼 카드 등 콘텐츠 영역의 배경이다.
  background: '#F5F5F5',
  // 하단 탭 영역을 화면 배경과 구분한다.
  navigationBackground: '#EEEEEE',
  surface: '#FFFFFF',
  // 하단 편집 도구와 안전 영역을 같은 배경으로 연결한다.
  toolbar: '#FAFAFA',
  // text는 기본 글자, textMuted는 보조 설명과 입력 안내 문구에 사용한다.
  text: '#242424',
  textMuted: '#686868',
  // 냉장고 경로의 실 이름과 아이콘을 등록·편집·홈에서 같은 색상으로 구분한다.
  chilled: '#42654E',
  chilledPressed: '#324D3B',
  frozen: '#42677F',
  // 등록 도면의 보관 모드 배지와 선택 영역에 사용하는 옅은 배경색이다.
  chilledBackground: '#E8EEE9',
  // 입력 필드 등의 테두리에 사용한다.
  border: '#D6D6D6',
  // 선택 표시와 녹색 강조 컨트롤의 테두리에 사용한다.
  sage: '#A4B2A9',
  // 냉장고 위치와 하단 메뉴의 선택 상태를 표시하는 옅은 배경색이다.
  sageLight: '#DFE8E2',
  // 성공 안내에 사용하는 짙은 배경과 밝은 녹색 강조 색상이다.
  noticeBackground: '#29322A',
  noticeForeground: '#B8DBA8',
  toastBackground: 'rgba(36, 36, 36, 0.86)',
  moveQueueBadge: '#19C17B',
  rose: '#E5C9C9',
  // 버튼의 기본 배경, 누르는 동안의 배경, 글자·로딩 표시 색상을 구분한다.
  button: '#303432',
  buttonPressed: '#242725',
  buttonText: '#FFFFFF',
  // 오류 문구와 입력 오류가 있는 필드의 테두리에 사용한다.
  error: '#A33D43',
} as const;

// 냉장·냉동 배지와 D-day에서 재료의 기한 상태를 구분한다.
export const ingredientBadgeColors = {
  normal: '#597D68',
  warning: '#C5753C',
  expired: '#B15A5D',
  unknown: '#77776F',
} as const;

// 재료 라벨은 도면 바탕이 비치도록 배경과 테두리 없이 표시한다.
export const ingredientLabelColors = {
  background: 'transparent',
} as const;

// 냉장고 도면은 흰 프레임 안에 모드별 배경과 밝은 수납함을 배치한다.
export const fridgeSurfaces = {
  border: '#C8C8C8',
  exterior: '#E1E1E1',
  interior: colors.surface,
  frame: '#DBDBDB',
  selection: '#C4C4C4',
  frameWidth: 6,
  bodySideWidth: 10,
  headerHeight: 28,
  cavityRadius: 10,
  shelf: '#ADADAD',
  pocket: '#F7F7F7CC',
  handle: '#B1B1B1',
  handleLength: 80,
  ink: '#595959',
  radius: 0,
} as const;

// 문 앞면은 밝게, 열린 내부는 한 톤 진하게 구분하고 포켓 전면판은 밝은 반투명색을 사용한다.
// 선택 배경은 본체 바탕에 ink를 20% 합성한 고정색으로 두어 포켓에서도 같은 색을 표시한다.
export const fridgeDoorColors = {
  CHILLED: {
    background: '#DDE4E0', border: '#CBD5CF', ink: '#486052', motif: '#718B7C',
    frame: '#D5DFD9', shelf: '#A2B5AA', pocket: '#F6F9F7CC', handle: '#BAC8BF',
    selection: '#B9C6BE',
  },
  FROZEN: {
    background: '#DDE4E9', border: '#CBD4DC', ink: '#475F70', motif: '#738B9D',
    frame: '#D5DFE7', shelf: '#A3B5C4', pocket: '#F6F8FACC', handle: '#B9C7D1',
    selection: '#B9C5D0',
  },
} as const;

/** 문 앞면은 모드 색을 유지하고, 열린 프레임과 이름 영역은 흰 바탕을 공유한다. */
export function getFridgeSurfaceStyle(storageMode: keyof typeof fridgeDoorColors | null | undefined, side: 'interior' | 'exterior' = 'interior') {
  if (!storageMode) return undefined;
  const palette = fridgeDoorColors[storageMode];
  return {
    backgroundColor: side === 'interior' ? fridgeSurfaces.interior : palette.background,
    borderColor: side === 'interior' ? fridgeSurfaces.interior : palette.border,
  };
}

// padding, margin, gap에 사용하는 공통 간격이다. xs부터 lg까지 크기가 커진다.
// React Native 스타일의 숫자 값은 화면 밀도에 독립적인 논리 단위로 사용된다.
export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
} as const;
