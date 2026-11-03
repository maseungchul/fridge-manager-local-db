# 로컬 DB 테이블 구조 (적용 예정)

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
