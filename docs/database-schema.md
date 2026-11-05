# 로컬 DB 테이블 구조

## refrigerators

냉장고의 기본 정보를 저장한다.

| 컬럼 | 타입 | NULL | 키·제약 |
| --- | --- | --- | --- |
| `id` | `TEXT` | 불가 | PK, UUID |
| `name` | `TEXT` | 불가 | 길이 1~50 |

- 인덱스: `CREATE UNIQUE INDEX uk_refrigerators_single ON refrigerators ((1));`

## refrigerator_rows

냉장고의 단과 배치 순서를 저장한다.

| 컬럼 | 타입 | NULL | 키·제약 |
| --- | --- | --- | --- |
| `id` | `TEXT` | 불가 | PK, UUID |
| `refrigerator_id` | `TEXT` | 불가 | FK → `refrigerators.id` |
| `sort_order` | `INTEGER` | 불가 | `>= 0` |

- `UNIQUE (refrigerator_id, sort_order)`

## refrigerator_compartments

각 단의 본체와 보관 모드(냉장·냉동), 여는 방식을 저장한다.

| 컬럼 | 타입 | NULL | 키·제약 |
| --- | --- | --- | --- |
| `id` | `TEXT` | 불가 | PK, UUID |
| `row_id` | `TEXT` | 불가 | FK → `refrigerator_rows.id` |
| `storage_mode` | `TEXT` | 불가 | `CHILLED`, `FROZEN` |
| `kind` | `TEXT` | 불가 | `HINGED`, `DRAWER` |
| `side` | `TEXT` | 허용 | 단일 여닫이: `LEFT_DOOR`, `RIGHT_DOOR`. 서랍형·공용 본체: `NULL` |

- `UNIQUE (id, row_id)`

## refrigerator_doors

문·서랍의 배치, 문 수납 여부와 본체 연결을 저장한다.

| 컬럼 | 타입 | NULL | 키·제약 |
| --- | --- | --- | --- |
| `id` | `TEXT` | 불가 | PK, UUID |
| `row_id` | `TEXT` | 불가 | FK → `refrigerator_rows.id` |
| `compartment_id` | `TEXT` | 불가 | 아래 복합 FK |
| `sort_order` | `INTEGER` | 불가 | `>= 0` |
| `storage_enabled` | `INTEGER` | 불가 | `0`, `1` |

- `UNIQUE (row_id, sort_order)`
- `FOREIGN KEY (compartment_id, row_id) REFERENCES refrigerator_compartments (id, row_id)`

## refrigerator_slots

본체 또는 도어포켓에 속한 칸의 순서·좌우 분할을 저장한다.

| 컬럼 | 타입 | NULL | 키·제약 |
| --- | --- | --- | --- |
| `id` | `TEXT` | 불가 | PK, UUID |
| `compartment_id` | `TEXT` | 허용 | FK → `refrigerator_compartments.id` |
| `door_id` | `TEXT` | 허용 | FK → `refrigerator_doors.id` |
| `sort_order` | `INTEGER` | 불가 | `>= 0` |
| `drawer_count` | `INTEGER` | 불가 | DEFAULT `0`, 허용값 `0`, `1`, `2` |

- `UNIQUE (compartment_id, sort_order)`
- `UNIQUE (door_id, sort_order)`

```sql
CHECK (
  (compartment_id IS NOT NULL AND door_id IS NULL)
  OR (compartment_id IS NULL AND door_id IS NOT NULL)
)
CHECK (door_id IS NULL OR drawer_count = 0)
```

## ingredients

재료의 기본 정보와 보관 위치를 저장한다. 같은 이름의 재료도 구매·유통기한이 다르면 별도 행으로 등록한다.

| 컬럼 | 타입 | NULL | 키·제약 |
| --- | --- | --- | --- |
| `id` | `TEXT` | 불가 | PK, UUID |
| `name` | `TEXT` | 불가 | 길이 1~50, 공백만 있는 값 제외 |
| `quantity` | `TEXT` | 불가 | 길이 1~50, 공백만 있는 값 제외. 예: `2개`, `반 통`, `500g` |
| `expiration_date` | `TEXT` | 허용 | 실제 달력 날짜인 `YYYY-MM-DD`, 미입력은 `NULL` |
| `slot_id` | `TEXT` | 불가 | FK → `refrigerator_slots.id`, `ON DELETE RESTRICT` |
| `drawer_number` | `INTEGER` | 불가 | DEFAULT `0`, 분할 없음·도어포켓: `0`, 좌우 분할: 왼쪽 `1`·오른쪽 `2` |
| `memo` | `TEXT` | 허용 | 앞뒤 공백을 제거한 메모, 미입력·공백만 있는 값은 `NULL` |

- 위치별 조회 인덱스: `CREATE INDEX idx_ingredients_position ON ingredients (slot_id, drawer_number);`
- 위치는 별도 UUID를 발급하지 않고 기존 칸 UUID와 좌우 번호로 구분한다. 도면에서 사용하는 `slotId-left`·`slotId-right`는 저장하지 않으며, 단·칸 번호와 위치 이름은 현재 냉장고 구성에서 구한다.
- 수량은 단위를 포함한 문자열로 저장한다. 단위 변환·수량 합산 정책은 이번 범위에 포함하지 않는다.
- 유통기한은 시간·시간대 없이 날짜만 저장한다. 빈 문자열과 존재하지 않는 날짜는 허용하지 않는다.
- 등록·위치 변경 트리거는 칸의 분할 설정과 좌우 번호가 일치하는지 검사한다. 수납을 끈 문과 서랍형 문의 숨긴 포켓에는 재료를 등록할 수 없다.
- 재료가 있는 칸의 분할 변경과 도어포켓의 수납 끄기·서랍형 전환은 트리거로 차단한다. 해당 재료를 먼저 이동하거나 삭제해야 한다.

## 삭제 정책 및 DB 버전

- 스키마 버전은 `5`이다.
- 냉장고 → 단 → 본체·문 → 칸의 모든 외래 키에 `ON DELETE CASCADE`를 적용한다. 냉장고 삭제 시 해당 구조 데이터가 모두 삭제되며, 실행하는 DB 연결에서 `PRAGMA foreign_keys = ON`을 유지한다.
- 재료는 연쇄 삭제 대상에서 제외한다. 재료가 참조하는 칸과 상위 냉장고 구조는 `ON DELETE RESTRICT`로 삭제를 막으며, 재료를 먼저 이동하거나 삭제해야 한다. 별도 트랜잭션 연결에서도 기존 저장 함수의 커밋 전 외래 키 검사로 위치 삭제를 거부한다.
- 버전 2 → 3 전환은 냉장고와 기존 위치의 ID·이름·순서·설정을 보존하고 하위 테이블의 외래 키를 교체한다. 전환 중에만 외래 키 검사를 끄고, 커밋 전 연결을 검증하며 성공·실패 후 모두 검사를 다시 켠다. 실패하면 데이터와 버전을 함께 롤백한다.
- 버전 3 → 4 전환은 기존 냉장고 테이블을 재생성하지 않고 재료 테이블·인덱스·위치 보호 트리거만 추가한다. 기존 냉장고·위치 ID와 설정을 보존하며, 실패하면 추가한 구조와 버전을 함께 롤백한다.
- 버전 4 → 5 전환은 `ALTER TABLE`로 재료 테이블에 선택 입력인 `memo` 컬럼만 추가한다. 기존 재료·위치·제약을 보존하고 기존 재료의 메모는 `NULL`로 둔다. 실패하면 컬럼 추가와 버전 기록을 함께 롤백한다.
