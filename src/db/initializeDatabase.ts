/**
 * @file
 * DB 버전을 확인하고 필요한 테이블과 제약을 초기화한다.
 * 테이블 생성·구조 변경과 버전 기록은 한 트랜잭션으로 처리해 실패 시 함께 취소한다.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 2;

/** 연결마다 외래 키 검사를 켜고 현재 버전에 필요한 초기화를 실행한다. */
export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;'
  );
  const version = row?.user_version ?? 0;

  if (version > DATABASE_VERSION) {
    throw new Error('현재 앱에서 지원하지 않는 DB 버전입니다.');
  }

  if (version === DATABASE_VERSION) return;

  await db.withTransactionAsync(async () => {
    // 버전이 기록되지 않은 기존 스키마도 같은 전환 절차로 처리한다.
    const legacyTable = version === 0 ? await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'refrigerator_areas';"
    ) : null;
    if (version === 1 || legacyTable) await migrateVersion1(db);
    await createTables(db);
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
}

/** 문 배치 정보가 없는 버전 1의 개발용 데이터와 테이블을 새 구조로 교체한다. */
async function migrateVersion1(db: SQLiteDatabase) {
  await db.execAsync(`
    DROP TABLE refrigerator_slots;
    DROP TABLE refrigerator_areas;
    DROP TABLE refrigerator_compartments;
    DROP TABLE refrigerators;
  `);
}

/** 냉장고·단·본체·문·칸의 테이블과 연결 제약을 생성한다. */
async function createTables(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS refrigerators (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uk_refrigerators_single
      ON refrigerators ((1));

    CREATE TABLE IF NOT EXISTS refrigerator_rows (
      id TEXT PRIMARY KEY NOT NULL,
      refrigerator_id TEXT NOT NULL REFERENCES refrigerators (id),
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      UNIQUE (refrigerator_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS refrigerator_compartments (
      id TEXT PRIMARY KEY NOT NULL,
      row_id TEXT NOT NULL REFERENCES refrigerator_rows (id),
      storage_mode TEXT NOT NULL CHECK (storage_mode IN ('CHILLED', 'FROZEN')),
      kind TEXT NOT NULL CHECK (kind IN ('HINGED', 'DRAWER')),
      side TEXT CHECK (side IN ('LEFT_DOOR', 'RIGHT_DOOR')),
      CHECK (kind = 'HINGED' OR side IS NULL),
      UNIQUE (id, row_id)
    );

    CREATE TABLE IF NOT EXISTS refrigerator_doors (
      id TEXT PRIMARY KEY NOT NULL,
      row_id TEXT NOT NULL REFERENCES refrigerator_rows (id),
      compartment_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      storage_enabled INTEGER NOT NULL CHECK (storage_enabled IN (0, 1)),
      UNIQUE (row_id, sort_order),
      FOREIGN KEY (compartment_id, row_id) REFERENCES refrigerator_compartments (id, row_id)
    );

    CREATE TABLE IF NOT EXISTS refrigerator_slots (
      id TEXT PRIMARY KEY NOT NULL,
      compartment_id TEXT REFERENCES refrigerator_compartments (id),
      door_id TEXT REFERENCES refrigerator_doors (id),
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      drawer_count INTEGER NOT NULL DEFAULT 0 CHECK (drawer_count IN (0, 1, 2)),
      UNIQUE (compartment_id, sort_order),
      UNIQUE (door_id, sort_order),
      CHECK (
        (compartment_id IS NOT NULL AND door_id IS NULL)
        OR (compartment_id IS NULL AND door_id IS NOT NULL)
      ),
      CHECK (door_id IS NULL OR drawer_count = 0)
    );
  `);
}
