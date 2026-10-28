# 로컬 DB 설계

## refrigerators

냉장고의 기본 정보를 저장한다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | `TEXT` | O | UUID 기본 키 |
| `name` | `TEXT` | O | 냉장고 이름. 예: 우리 집 냉장고 |

- 기기 내 냉장고는 1대만 등록한다.
- 이름은 앞뒤 공백 제거 후 1~50자로 저장한다.
- 하위 실은 `refrigerator_compartments.refrigerator_id`로 참조한다.
- `family_group_id`는 사용하지 않으며, P2P 충돌 판정용 변경 정보는 공유 정책 확정 시 설계한다.

## refrigerator_compartments

냉장고의 물리적 실(냉장실·냉동실)과 보관 모드(냉장·냉동)를 저장한다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | `TEXT` | O | UUID 기본 키 |
| `refrigerator_id` | `TEXT` | O | `refrigerators.id` 참조 |
| `position` | `TEXT` | O | 물리적 위치. 왼쪽 위·오른쪽 아래 등 |
| `storage_mode` | `TEXT` | O | 냉장 `CHILLED` 또는 냉동 `FROZEN` |
| `sort_order` | `INTEGER` | O | 0부터 시작하는 표시 순서 |

- 같은 냉장고에서 `position`은 중복 불가, `storage_mode`는 중복 가능하다.
- 모드 변경 시 실 ID와 하위 연결을 유지한다. 하위 영역은 `refrigerator_areas.compartment_id`로 참조한다.
- 별도 `name` 없이 위치와 모드로 표시 이름을 구성한다.
- 최초 등록은 문 개수·구조를 선택하면 해당 JSON의 실 ID와 표시 이름으로 입력 초안을 만든다. 각 실에 본체와 기본 칸 하나를 포함하며, 외부 문 연결은 문 수납 영역과 구분한다.
- 입력 초안의 보관 모드는 선택 전까지 `null`이다. 화면 상태의 미선택 값이며, DB의 `storage_mode`에는 저장할 수 없다.

## refrigerator_areas

실 내부의 보관 구역(본체·왼쪽 문·오른쪽 문)을 저장한다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | `TEXT` | O | UUID 기본 키 |
| `compartment_id` | `TEXT` | O | `refrigerator_compartments.id` 참조 |
| `type` | `TEXT` | O | `LEFT_DOOR`, `BODY`, `RIGHT_DOOR` |
| `sort_order` | `INTEGER` | O | 0부터 시작하는 표시 순서 |

- 같은 실에서 동일한 `type`은 중복 등록할 수 없다.
- 본체(`BODY`)는 필수이며, 왼쪽 문·오른쪽 문은 선택한다.
- 하위 칸은 `refrigerator_slots.area_id`로 참조한다.

## refrigerator_slots

보관 구역에 속한 칸과 서랍 구성을 저장한다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | `TEXT` | O | UUID 기본 키 |
| `area_id` | `TEXT` | O | `refrigerator_areas.id` 참조 |
| `name` | `TEXT` | O | 자동 위치명. 예: 위에서 1번째 칸 |
| `sort_order` | `INTEGER` | O | 위에서 아래로 0부터 시작하는 순서 |
| `drawer_count` | `INTEGER` | O | 일반 칸 `0`, 단일 서랍 `1`, 좌우 서랍 `2` |

- 같은 보관 구역에서 `sort_order`는 중복 등록할 수 없다.
- 이름은 직접 입력받지 않고 현재 영역의 위→아래 순서로 생성한 1~24자의 자동 위치명을 저장한다.
- 서랍은 본체(`BODY`)에만 설정하며, 좌우 서랍 2개도 하나의 칸으로 저장한다.
- 재료가 있는 위치의 삭제·구조 변경은 재료를 먼저 이동·삭제한 후 처리한다.
