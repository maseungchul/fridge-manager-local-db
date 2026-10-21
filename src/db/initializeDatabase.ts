/**
 * @file
 * DB 버전을 확인하고 필요한 테이블과 제약을 초기화한다.
 * 테이블 생성과 버전 기록은 한 트랜잭션으로 처리해 실패 시 함께 취소한다.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 1;

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
    await createTables(db);
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
}

/** 최초 생성과 버전이 기록되지 않은 기존 DB에 동일한 테이블 구성을 적용한다. */
async function createTables(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS refrigerators (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uk_refrigerators_single
      ON refrigerators ((1));

    CREATE TABLE IF NOT EXISTS refrigerator_compartments (
      id TEXT PRIMARY KEY NOT NULL,
      refrigerator_id TEXT NOT NULL REFERENCES refrigerators (id),
      position TEXT NOT NULL,
      storage_mode TEXT NOT NULL CHECK (storage_mode IN ('CHILLED', 'FROZEN')),
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      UNIQUE (refrigerator_id, position)
    );

    CREATE TABLE IF NOT EXISTS refrigerator_areas (
      id TEXT PRIMARY KEY NOT NULL,
      compartment_id TEXT NOT NULL REFERENCES refrigerator_compartments (id),
      type TEXT NOT NULL CHECK (type IN ('LEFT_DOOR', 'BODY', 'RIGHT_DOOR')),
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      UNIQUE (compartment_id, type)
    );

    CREATE TABLE IF NOT EXISTS refrigerator_slots (
      id TEXT PRIMARY KEY NOT NULL,
      area_id TEXT NOT NULL REFERENCES refrigerator_areas (id),
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 24),
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      drawer_count INTEGER NOT NULL DEFAULT 0 CHECK (drawer_count IN (0, 1, 2)),
      UNIQUE (area_id, sort_order)
    );
  `);
}
