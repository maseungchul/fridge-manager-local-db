/**
 * @file
 * 앱에서 사용할 로컬 DB 테이블과 제약을 초기화한다.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

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
