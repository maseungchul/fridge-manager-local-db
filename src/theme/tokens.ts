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

// 냉장고 도면은 흰 프레임 안에 모드별 배경과 밝은 수납함을 배치하고, 옅은 음영으로 두께를 표현한다.
export const fridgeSurfaces = {
  border: '#BED6C9',
  exterior: '#EAF3EC',
  interior: '#FFFFFF',
  frame: '#D8E2DC',
  frameWidth: 6,
  bodySideWidth: 10,
  headerHeight: 28,
  cavityRadius: 10,
  shelf: '#9DBDAB',
  pocket: '#F2FAF5CC',
  pocketBorder: '#ABC7B7',
  handle: '#B3BDB8',
  handleLength: 80,
  ink: '#577062',
  radius: 0,
  raisedShadow: [
    { offsetX: 0, offsetY: 3, blurRadius: 6, color: '#5C80651A' },
    { inset: true, offsetX: 0, offsetY: 1, blurRadius: 0, color: '#FFFFFFC0' },
  ],
  recessedShadow: [
    { offsetX: 0, offsetY: 2, blurRadius: 5, color: '#5C806514' },
  ],
  shelfShadow: [
    { offsetX: 0, offsetY: 2, blurRadius: 2, color: '#5C806522' },
  ],
  hardwareShadow: [
    { offsetX: 0, offsetY: 1, blurRadius: 2, color: '#40535D14' },
  ],
} as const;

// 문 앞면은 밝게, 열린 내부는 한 톤 진하게 구분하고 포켓 전면판은 밝은 반투명색을 사용한다.
export const fridgeDoorColors = {
  CHILLED: {
    background: '#EAF4EE', border: '#BED8CB', ink: '#416B57', motif: '#648F7A',
    frame: '#CEDFD5', shelf: '#92B5A2', pocket: '#F1FAF4CC', pocketBorder: '#A7C5B4', handle: '#B4CBC0',
  },
  FROZEN: {
    background: '#E8F3FB', border: '#BDD7E8', ink: '#396B90', motif: '#648FAF',
    frame: '#CEDFEC', shelf: '#94B8D2', pocket: '#F1F9FFCC', pocketBorder: '#A7C5DA', handle: '#B5CBD9',
  },
} as const;

/** 문 앞면은 모드 색을 유지하고, 열린 프레임과 이름 영역은 흰 바탕을 공유한다. */
export function getFridgeSurfaceStyle(storageMode: keyof typeof fridgeDoorColors | null | undefined, side: 'interior' | 'exterior' = 'interior') {
  if (!storageMode) return undefined;
  const palette = fridgeDoorColors[storageMode];
  return {
    backgroundColor: side === 'interior' ? fridgeSurfaces.interior : palette.background,
    borderColor: side === 'interior' ? fridgeSurfaces.interior : palette.border,
    boxShadow: side === 'interior' ? [
      { ...fridgeSurfaces.recessedShadow[0], color: `${palette.motif}14` },
    ] : [
      { ...fridgeSurfaces.raisedShadow[0], color: `${palette.motif}1A` },
      fridgeSurfaces.raisedShadow[1],
    ],
  };
}

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
