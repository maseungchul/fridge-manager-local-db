# 냉장고 배치 카탈로그

## 조사 범위와 현재 상태

2026-10-22 기준 제조사 제품 페이지·구매 안내·설명서·사양서에서 확인한 가정용 대표 구조를 정리했다.
전 세계 모든 모델을 망라한 목록은 아니다. 확인한 구조와 추가 확인할 구조를 구분하고 새로운 사례를 계속 추가한다.
단종 제품도 현재 사용 중일 수 있으므로 구조 사례로 유지한다. 판매 여부·가격·용량은 이 카탈로그의 관리 대상이 아니다.

- 데이터: `src/features/fridge/model/fridgeLayoutCatalog.json`
- 검사: `node scripts/validate-fridge-layout-catalog.cjs`
- 조사 JSON은 화면에 직접 연결하지 않는다. 등록 화면은 아래 간소화 데이터로 문 개수와 구조를 선택하며 실제 구성 생성·저장은 아직 연결하지 않았다.
- 일반 냉장고, 냉동고, 김치냉장고, 가정용 하부장 서랍형을 조사했다. 와인·음료 전용 온도 구역과 업소용·차량용·캠핑용·연구용 기기는 이번 범위에서 제외했다.

## 앱용 간소화 데이터

`src/features/fridge/model/fridgeLayoutPresets.json`은 구조 선택에 사용할 별도 데이터이다. 조사 JSON은 원본 그대로 유지한다.
조사한 21종 중 보관 용도만 다르고 물리적 배치·문 연결이 같은 항목을 합쳐 15종으로 정리했다.

- `id`, `name`, `doorCount`: 유형 식별자, 표시 이름, 외부 문·서랍·뚜껑의 개수.
- `view`, `layout`: 도식을 볼 방향과 본체 배치. 같은 실 ID가 반복되면 하나의 공용 본체이다.
- `compartments`: 본체별 ID와 위치 이름. 모든 본체는 기본 포함한다.
- `openings`: 외부 문의 ID·형태·연결할 본체 ID. 형태는 조사 자료와 같은 `HINGED`·`DRAWER`·`LID`를 사용한다.

냉장·냉동 모드, 문 수납 사용 여부, 선반·내부 서랍 수는 이후 세부 설정에서 정한다.
출처·제품 사례·미확인 유형은 조사 JSON에서 관리한다. 일반형과 김치냉장고의 같은 구조를 합친 것은 보관 모드까지 같다는 뜻이 아니다.
등록 화면에서 JSON의 문 개수를 자동으로 표시하고 해당 구조의 본체 배치를 카드로 보여준다.
선택값은 화면 상태로 보관하며 문 개수가 바뀌면 이전 구조 선택을 초기화한다. 같은 문 개수를 다시 누르거나 이름을 수정해도 구조 선택은 유지한다.
현재 단계는 구조 선택까지이며 실제 기본 구성 생성과 DB 저장은 아직 연결하지 않았다.

## 확인한 구조

문 개수는 외부 주 문·서랍·뚜껑 수이다. 내부 선반·서랍·냉동칸 덮개·홈바 보조 패널은 포함하지 않는다.
공간 수는 식재료의 위치를 나눌 본체 수이며, 독립 온도 제어 수와 같다는 뜻은 아니다.

| ID | 구조 | 외부 문 | 본체 공간 |
| --- | --- | ---: | ---: |
| `single-chilled` | 냉장 전용 | 1 | 1 |
| `single-frozen` | 냉동 전용 | 1 | 1 |
| `single-internal-freezer` | 외부 문 하나 안의 냉장·냉동칸 | 1 | 2 |
| `top-freezer` | 위 냉동·아래 냉장 | 2 | 2 |
| `bottom-freezer-hinged` | 위 냉장·아래 냉동, 여닫이 | 2 | 2 |
| `bottom-freezer-drawer` | 위 냉장·아래 냉동, 외부 서랍 | 2 | 2 |
| `side-by-side` | 좌우 분리 | 2 | 2 |
| `french-three` | 상단 공용·하단 서랍 | 3 | 2 |
| `french-four-split-lower` | 상단 공용·하단 좌우 | 4 | 3 |
| `french-four-convert-drawer` | 상단 공용·중간 전환 서랍·하단 | 4 | 3 |
| `french-four-two-freezer-drawers` | 상단 공용·아래 냉동 서랍 2단 | 4 | 3 |
| `french-five` | 상단 공용·중간 좌우 서랍·하단 | 5 | 4 |
| `vertical-three` | 냉장·채소·냉동 세로 배치 | 3 | 3 |
| `multi-drawer-six` | 상단 공용·제빙·특수 냉동·냉동·채소 | 6 | 5 |
| `kimchi-three` | 김치 상·중·하칸 | 3 | 3 |
| `kimchi-four-divided` | 김치 상단 좌우 분리·중·하칸 | 4 | 4 |
| `kimchi-four-open` | 김치 상단 공용·중·하칸 | 4 | 3 |
| `kimchi-two-lids` | 김치 좌우 뚜껑형 | 2 | 2 |
| `chest-freezer` | 냉동고 상부 뚜껑형 | 1 | 1 |
| `undercounter-double-chilled` | 하부장 냉장 서랍 2단 | 2 | 2 |
| `undercounter-chilled-frozen` | 하부장 위 냉장·아래 냉동 서랍 | 2 | 2 |

5도어 일본형과 3도어 양문형은 제품의 존재를 확인했지만 내부 배치와 문 연결을 추가로 확인해야 한다.
뚜껑 하나 아래 복수 공간, 상하좌우 네 공간이 모두 독립된 구조도 `coverage.pendingCases`에 남겼다.
출처가 없는 추가 조사 항목은 실제 제품의 존재까지 확인했다는 뜻이 아니다.

## 데이터 읽는 방법

`templates`는 물리적 배치, `sources`는 제조사 근거, `variations`는 배치를 새로 만들지 않고 처리할 변형이다.
`schemaVersion`은 데이터 형식, `catalogRevision`은 전체 자료의 개정 번호, 각 `revision`은 개별 유형의 개정 번호이다.

- `layout`: 행마다 열 수가 같은 격자. 현재 유형은 2열을 사용하며 새 배치에 맞춰 열 수를 늘릴 수 있다. 같은 실 ID가 두 셀에 있으면 하나의 넓은 본체이다. 행·열은 위치만 나타내며 실제 크기 비율이 아니다.
- `view`: `FRONT`는 정면, `TOP`은 위에서 본 배치이다.
- `compartments`: 물리적 보관 공간. 각 공간에는 본체를 기본 포함하고 내부 선반·서랍은 사용자가 구성한다.
- `openings`: 외부 여닫이 문(`HINGED`), 서랍(`DRAWER`), 뚜껑(`LID`). `compartmentIds`로 연결할 본체를 지정한다.
- `doorBins`: `CONFIGURABLE`이면 문 수납 영역의 사용 여부를 선택할 수 있다. 실제 수납칸 존재를 보장하지 않는다. `NONE`이면 문 수납 영역을 만들지 않는다.
- `referenceRole`: 대표 모델에서 확인한 용도. 물리적 위치 ID나 사용자가 선택한 현재 모드로 사용하지 않는다.
- `modeOptions`: 대표 모델에서 확인한 보관 모드의 앱 분류. `null`은 미확인이며 빈 배열로 대체하지 않는다. 배열에도 제조사의 익힘·음료·육류 등 모든 세부 모드를 나열하지는 않았다.
- `sourceIds`: 해당 유형의 근거. 각 출처의 `checkedOn`과 `evidence`에 확인 날짜와 확인 내용을 남긴다.

예를 들어 상단 공용·하단 좌우형의 `layout`은 다음과 같다.

```json
[
  ["upper", "upper"],
  ["lower-left", "lower-right"]
]
```

상단 왼쪽 문과 오른쪽 문은 모두 `upper`에 연결된다. 본체를 두 개 만들지 않는다.
하단 좌우는 다른 ID를 사용하므로 보관 모드가 같아져도 같은 실로 합쳐지지 않는다.
반대로 외부 1도어 내부 냉동칸형은 문 하나가 냉장·냉동 두 공간에 연결된다.

## 모델별 차이와 앱 연결 시 지킬 경계

이 자료는 브랜드나 제품명으로 모든 사양을 자동 확정하는 제품 DB가 아니다.
같은 외형이어도 전환 가능한 실·문 수납·선반 수가 다를 수 있다.
예를 들어 Samsung RF23DG9600SRAC의 하단 오른쪽 전환 기능을 모든 4도어 냉장고의 규칙으로 적용하면 안 된다.
출처의 확인된 모드는 대표 모델 안내에 사용하고, 구조만 고른 사용자의 다른 모델에 그대로 제한을 걸지 않는다.

현재 앱의 `CompartmentPosition`은 `UPPER | LOWER`이고 SQLite는 `CHILLED | FROZEN`만 저장한다.
카탈로그의 김치·특수 냉동 모드나 다단·좌우 배치가 이미 저장·표시된다는 뜻이 아니다.
제빙 서랍은 위치 자료에 포함하지만 일반 재료를 등록할 수 있는지는 별도로 결정해야 한다.

다음 구현은 선택한 간소화 구조로 기존 입력 초안을 만들고 문 수납·내부 칸 설정에 연결하는 단계이다.
카탈로그와 실제 등록값은 분리한다. 저장된 냉장고의 UUID·구조·입력값을 유지해 카탈로그 추가·수정이 기존 냉장고를 바꾸지 않도록 한다.
문 수납 선택, 내부 칸 편집, 저장 기능은 기존 공통 컴포넌트와 `Refrigerator → Compartment → Area → Slot` 구조를 우선 재사용한다.

## 새로운 사례 추가 절차

1. 제조사 설명서·실제 내부 사진·제품 사양에서 외부 문과 내부 본체의 대응 관계를 확인한다.
2. 기존 구조와 같으면 `examples`, `sourceIds`, 필요한 `notes`를 보강한다. 경첩 방향·색상·용량·내부 선반 수만 다르면 새 유형을 만들지 않는다.
3. 구조가 다르면 변경되지 않을 새 `id`로 유형을 추가한다. 모드는 실제로 확인한 범위만 기록하고 미확인은 `null`로 남긴다.
4. `sources`에 링크·제조사·확인 날짜·확인 내용을 추가한다. 내부 구획을 확정하지 못하면 `pendingCases`에 추가한다.
5. 해당 유형의 `revision`, 전체 `catalogRevision`, `researchedOn`을 갱신하고 이 문서의 구조 표를 맞춘다. 기존 ID를 다른 구조에 재사용하지 않는다.
6. 카탈로그 검사, lint, TypeScript 검사를 실행하고 출처를 다시 대조한다.

```bash
node scripts/validate-fridge-layout-catalog.cjs
npm run lint
node node_modules/typescript/bin/tsc --noEmit
```

검사 스크립트는 ID 중복, 잘못된 출처·모드·문 연결, 도식에서 누락된 실, 끊어지거나 직사각형이 아닌 본체를 검사한다.
제품 구조의 사실 여부와 실제 기기 화면은 자동 검사의 대상이 아니다.
자료는 저장소에서 수동으로 추가하고 앱 업데이트에 포함한다. 자동 수집·원격 배포·정기 조사 기능은 구현하지 않았다.

## 주요 제조사 근거

- [Samsung 구조별 구매 안내](https://www.samsung.com/africa_en/home-appliances/buying-guide/what-is-the-best-type-of-fridge-freezer/)
- [Samsung RF23DG9600SRAC의 3개 공간·하단 전환 기능](https://www.samsung.com/ca/refrigerators/french-door/counter-depth-4-door-flex-refrigerator-with-beverage-center-23-cu-ft-stainless-steel-rf23dg9600srac/)
- [LG 김치냉장고 분리벽형·오픈형 FAQ](https://www.lge.co.kr/story/faq/refrigerators-faq)
- [Mitsubishi Electric 6도어 내부 공간 안내](https://www.mitsubishielectric.com.au/product/700l-multi-drawer-white-fridge/)

전체 출처와 모델별 확인 내용은 JSON의 `sources`에 기록했다.
