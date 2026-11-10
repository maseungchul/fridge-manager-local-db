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
  background: '#F4F0E8',
  // 하단 탭 영역을 화면 배경과 구분한다.
  navigationBackground: '#EAE5DB',
  surface: '#FFFCF7',
  // 하단 편집 도구와 안전 영역을 같은 배경으로 연결한다.
  toolbar: '#F9F6F0',
  // text는 기본 글자, textMuted는 보조 설명과 입력 안내 문구에 사용한다.
  text: '#22231F',
  textMuted: '#77776F',
  // 냉장고 경로의 실 이름과 아이콘을 등록·편집·홈에서 같은 색상으로 구분한다.
  chilled: '#487044',
  chilledPressed: '#365735',
  frozen: '#2F6C9D',
  // 등록 도면의 보관 모드 배지와 선택 영역에 사용하는 옅은 배경색이다.
  chilledBackground: '#E4EDDE',
  // 입력 필드 등의 테두리에 사용한다.
  border: '#D9D5CC',
  // 인증 시작 화면의 브랜드 장식에 사용하는 색상이다.
  sage: '#A8B7A1',
  // 냉장고 위치와 하단 메뉴의 선택 상태를 표시하는 옅은 배경색이다.
  sageLight: '#DCE5D4',
  // 성공 안내와 툴팁의 배경·강조 색상이다.
  noticeBackground: '#173522',
  noticeForeground: '#45EF85',
  moveQueueBadge: '#19C17B',
  rose: '#D4B3AD',
  // 버튼의 기본 배경, 누르는 동안의 배경, 글자·로딩 표시 색상을 구분한다.
  button: '#29322A',
  buttonPressed: '#1F261F',
  buttonText: '#FFFFFF',
  // 오류 문구와 입력 오류가 있는 필드의 테두리에 사용한다.
  error: '#A6413B',
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
  border: '#BED6C9',
  exterior: '#D8E0DA',
  interior: '#FFFFFF',
  frame: '#D8E2DC',
  selection: '#D1DBD5',
  frameWidth: 6,
  bodySideWidth: 10,
  headerHeight: 28,
  cavityRadius: 10,
  shelf: '#9DBDAB',
  pocket: '#F2FAF5CC',
  handle: '#B3BDB8',
  handleLength: 80,
  ink: '#577062',
  radius: 0,
} as const;

// 문 앞면은 밝게, 열린 내부는 한 톤 진하게 구분하고 포켓 전면판은 밝은 반투명색을 사용한다.
// 선택 배경은 본체 바탕에 ink를 20% 합성한 고정색으로 두어 포켓에서도 같은 색을 표시한다.
export const fridgeDoorColors = {
  CHILLED: {
    background: '#D4E6DB', border: '#BED8CB', ink: '#416B57', motif: '#648F7A',
    frame: '#CEDFD5', shelf: '#92B5A2', pocket: '#F1FAF4CC', handle: '#B4CBC0',
    selection: '#B2C8BC',
  },
  FROZEN: {
    background: '#D3E4F1', border: '#BDD7E8', ink: '#396B90', motif: '#648FAF',
    frame: '#CEDFEC', shelf: '#94B8D2', pocket: '#F1F9FFCC', handle: '#B5CBD9',
    selection: '#B0C8DA',
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
