/**
 * @file
 * DB 버전을 확인하고 필요한 테이블과 제약을 초기화한다.
 * 테이블 생성·구조 변경과 버전 기록은 한 트랜잭션으로 처리해 실패 시 함께 취소한다.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { AppError } from '@/i18n/errors';

const DATABASE_VERSION = 8;

const INGREDIENT_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50 AND length(trim(name)) > 0),
  quantity TEXT NOT NULL CHECK (length(quantity) BETWEEN 1 AND 50 AND length(trim(quantity)) > 0),
  expiration_date TEXT CHECK (
    expiration_date IS NULL OR (
      expiration_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND date(expiration_date, '+0 days') IS expiration_date
    )
  ),
  slot_id TEXT NOT NULL REFERENCES refrigerator_slots (id) ON DELETE RESTRICT,
  drawer_number INTEGER NOT NULL DEFAULT 0 CHECK (drawer_number IN (0, 1, 2)),
  memo TEXT
)`;

/** 연결마다 외래 키 검사를 켜고 현재 버전에 필요한 초기화를 실행한다. */
export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;'
  );
  const version = row?.user_version ?? 0;

  if (version === 6) {
    await db.withTransactionAsync(() => recoverTemporaryVersion6(db));
    return;
  }

  if (version > DATABASE_VERSION) {
    throw new AppError('errors.databaseVersion');
  }

  if (version === DATABASE_VERSION) return;

  try {
    // 하위 테이블 재생성 중 참조 데이터가 연쇄 삭제되지 않게 한다.
    if (version === 2) await db.execAsync('PRAGMA foreign_keys = OFF;');
    await db.withTransactionAsync(async () => {
      if (version < 7) {
        // 버전이 기록되지 않은 기존 스키마도 같은 전환 절차로 처리한다.
        const legacyTable = version === 0 ? await db.getFirstAsync<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'refrigerator_areas';"
        ) : null;
        if (version === 1 || legacyTable) await migrateVersion1(db);
        // 기존 재료와 위치를 유지하고, 미입력 메모는 NULL로 남긴다.
        if (version === 4) await db.execAsync('ALTER TABLE ingredients ADD COLUMN memo TEXT;');
        else if (version === 2) await migrateVersion2(db);
        else await createTables(db);
        await createConsumedIngredientsTable(db);
      }
      await createShoppingItemsTable(db);
      const violation = await db.getFirstAsync('PRAGMA foreign_key_check;');
      if (violation) throw new AppError('errors.databaseConnections');
      await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

/** 철회한 임시 버전 6만 식별하고, 위치 제약을 복구한 뒤 현재 버전으로 전환한다. */
async function recoverTemporaryVersion6(db: SQLiteDatabase) {
  const table = await db.getFirstAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ingredients';",
  );
  const temporarySchema = INGREDIENT_TABLE_SQL
    .replace('slot_id TEXT NOT NULL', 'slot_id TEXT')
    .replace('memo TEXT', 'memo TEXT, CHECK (slot_id IS NOT NULL OR drawer_number = 0)');
  const normalize = (sql: string) => sql.replace('IF NOT EXISTS ', '').replace(/\s+/g, ' ').trim();
  if (!table || normalize(table.sql) !== normalize(temporarySchema)) {
    throw new AppError('errors.databaseVersion');
  }
  const unlocated = await db.getFirstAsync('SELECT id FROM ingredients WHERE slot_id IS NULL LIMIT 1;');
  if (unlocated) throw new AppError('errors.databaseRecovery');

  // 기존 테이블은 복사가 끝날 때까지 남기고, 제약 검사나 저장 실패 시 구조·데이터를 함께 되돌린다.
  await db.execAsync(`
    DROP TRIGGER IF EXISTS protect_ingredient_slot_split;
    DROP TRIGGER IF EXISTS protect_ingredient_door_storage;
    DROP TRIGGER IF EXISTS protect_ingredient_drawer_conversion;
    DROP TRIGGER IF EXISTS validate_ingredient_position_insert;
    DROP TRIGGER IF EXISTS validate_ingredient_position_update;
    DROP INDEX IF EXISTS idx_ingredients_position;
    ALTER TABLE ingredients RENAME TO recovery_v6_ingredients;
  `);
  await createTables(db);
  await createConsumedIngredientsTable(db);
  await createShoppingItemsTable(db);
  await db.execAsync(`
    INSERT INTO ingredients (id, name, quantity, expiration_date, slot_id, drawer_number, memo)
      SELECT id, name, quantity, expiration_date, slot_id, drawer_number, memo FROM recovery_v6_ingredients;
    DROP TABLE recovery_v6_ingredients;
  `);
  const violation = await db.getFirstAsync('PRAGMA foreign_key_check;');
  if (violation) throw new AppError('errors.databaseConnections');
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
}

/** 원래 칸이 삭제돼도 소비 기록이 남도록 위치 UUID는 외래 키 없이 보관한다. */
async function createConsumedIngredientsTable(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS consumed_ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50 AND length(trim(name)) > 0),
      quantity TEXT NOT NULL CHECK (length(quantity) BETWEEN 1 AND 50 AND length(trim(quantity)) > 0),
      expiration_date TEXT CHECK (
        expiration_date IS NULL OR (
          expiration_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND date(expiration_date, '+0 days') IS expiration_date
        )
      ),
      slot_id TEXT NOT NULL,
      drawer_number INTEGER NOT NULL CHECK (drawer_number IN (0, 1, 2)),
      memo TEXT,
      consumed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_consumed_ingredients_date ON consumed_ingredients (consumed_at DESC, id);
  `);
}

/** 보관 위치가 없어도 구매 예정 항목을 독립적으로 저장한다. */
async function createShoppingItemsTable(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS shopping_items (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50 AND length(trim(name)) > 0),
      quantity TEXT NOT NULL CHECK (length(quantity) BETWEEN 1 AND 50 AND length(trim(quantity)) > 0),
      created_at TEXT NOT NULL
    );
  `);
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

/** 버전 2의 ID·설정을 보존하고 하위 테이블에 연쇄 삭제 제약을 적용한다. */
async function migrateVersion2(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TEMP TABLE migration_v2_rows AS SELECT * FROM refrigerator_rows;
    CREATE TEMP TABLE migration_v2_compartments AS SELECT * FROM refrigerator_compartments;
    CREATE TEMP TABLE migration_v2_doors AS SELECT * FROM refrigerator_doors;
    CREATE TEMP TABLE migration_v2_slots AS SELECT * FROM refrigerator_slots;
    DROP TABLE refrigerator_slots;
    DROP TABLE refrigerator_doors;
    DROP TABLE refrigerator_compartments;
    DROP TABLE refrigerator_rows;
  `);
  await createTables(db);
  await db.execAsync(`
    INSERT INTO refrigerator_rows (id, refrigerator_id, sort_order)
      SELECT id, refrigerator_id, sort_order FROM migration_v2_rows;
    INSERT INTO refrigerator_compartments (id, row_id, storage_mode, kind, side)
      SELECT id, row_id, storage_mode, kind, side FROM migration_v2_compartments;
    INSERT INTO refrigerator_doors (id, row_id, compartment_id, sort_order, storage_enabled)
      SELECT id, row_id, compartment_id, sort_order, storage_enabled FROM migration_v2_doors;
    INSERT INTO refrigerator_slots (id, compartment_id, door_id, sort_order, drawer_count)
      SELECT id, compartment_id, door_id, sort_order, drawer_count FROM migration_v2_slots;
    DROP TABLE migration_v2_slots;
    DROP TABLE migration_v2_doors;
    DROP TABLE migration_v2_compartments;
    DROP TABLE migration_v2_rows;
  `);
}

/** 냉장고 구조·재료 테이블을 생성하고 재료가 참조하는 보관 위치를 보호한다. */
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
      refrigerator_id TEXT NOT NULL REFERENCES refrigerators (id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      UNIQUE (refrigerator_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS refrigerator_compartments (
      id TEXT PRIMARY KEY NOT NULL,
      row_id TEXT NOT NULL REFERENCES refrigerator_rows (id) ON DELETE CASCADE,
      storage_mode TEXT NOT NULL CHECK (storage_mode IN ('CHILLED', 'FROZEN')),
      kind TEXT NOT NULL CHECK (kind IN ('HINGED', 'DRAWER')),
      side TEXT CHECK (side IN ('LEFT_DOOR', 'RIGHT_DOOR')),
      CHECK (kind = 'HINGED' OR side IS NULL),
      UNIQUE (id, row_id)
    );

    CREATE TABLE IF NOT EXISTS refrigerator_doors (
      id TEXT PRIMARY KEY NOT NULL,
      row_id TEXT NOT NULL REFERENCES refrigerator_rows (id) ON DELETE CASCADE,
      compartment_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      storage_enabled INTEGER NOT NULL CHECK (storage_enabled IN (0, 1)),
      UNIQUE (row_id, sort_order),
      FOREIGN KEY (compartment_id, row_id) REFERENCES refrigerator_compartments (id, row_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS refrigerator_slots (
      id TEXT PRIMARY KEY NOT NULL,
      compartment_id TEXT REFERENCES refrigerator_compartments (id) ON DELETE CASCADE,
      door_id TEXT REFERENCES refrigerator_doors (id) ON DELETE CASCADE,
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

    ${INGREDIENT_TABLE_SQL};

    CREATE INDEX IF NOT EXISTS idx_ingredients_position ON ingredients (slot_id, drawer_number);

    CREATE TRIGGER IF NOT EXISTS protect_ingredient_slot_split
    BEFORE UPDATE OF drawer_count ON refrigerator_slots
    WHEN (OLD.drawer_count = 2) != (NEW.drawer_count = 2)
      AND EXISTS (SELECT 1 FROM ingredients WHERE slot_id = OLD.id)
    BEGIN
      SELECT RAISE(ABORT, '재료를 먼저 이동하거나 삭제한 후 칸의 분할을 변경해 주세요.');
    END;

    CREATE TRIGGER IF NOT EXISTS protect_ingredient_door_storage
    BEFORE UPDATE OF storage_enabled, compartment_id ON refrigerator_doors
    WHEN EXISTS (
      SELECT 1 FROM ingredients AS ingredient
      JOIN refrigerator_slots AS slot ON slot.id = ingredient.slot_id
      WHERE slot.door_id = OLD.id
    ) AND (
      NEW.storage_enabled = 0
      OR (SELECT kind FROM refrigerator_compartments WHERE id = NEW.compartment_id) = 'DRAWER'
    )
    BEGIN
      SELECT RAISE(ABORT, '도어포켓의 재료를 먼저 이동하거나 삭제해 주세요.');
    END;

    CREATE TRIGGER IF NOT EXISTS protect_ingredient_drawer_conversion
    BEFORE UPDATE OF kind ON refrigerator_compartments
    WHEN NEW.kind = 'DRAWER' AND EXISTS (
      SELECT 1 FROM ingredients AS ingredient
      JOIN refrigerator_slots AS slot ON slot.id = ingredient.slot_id
      JOIN refrigerator_doors AS door ON door.id = slot.door_id
      WHERE door.compartment_id = OLD.id
    )
    BEGIN
      SELECT RAISE(ABORT, '도어포켓의 재료를 먼저 이동하거나 삭제해 주세요.');
    END;
  `);

  // 등록·이동 시 분할 설정과 실제 사용할 수 있는 도어포켓에 맞는 위치만 허용한다.
  for (const [name, event] of [
    ['insert', 'INSERT'], ['update', 'UPDATE OF slot_id, drawer_number'],
  ]) {
    await db.execAsync(`
      CREATE TRIGGER IF NOT EXISTS validate_ingredient_position_${name}
      BEFORE ${event} ON ingredients
      WHEN NOT EXISTS (
        SELECT 1 FROM refrigerator_slots AS slot
        LEFT JOIN refrigerator_doors AS door ON door.id = slot.door_id
        LEFT JOIN refrigerator_compartments AS body ON body.id = door.compartment_id
        WHERE slot.id = NEW.slot_id
          AND ((slot.drawer_count = 2 AND NEW.drawer_number IN (1, 2))
            OR (slot.drawer_count IN (0, 1) AND NEW.drawer_number = 0))
          AND (slot.door_id IS NULL OR (door.storage_enabled = 1 AND body.kind = 'HINGED'))
      )
      BEGIN
        SELECT RAISE(ABORT, '재료를 보관할 수 없는 위치입니다.');
      END;
    `);
  }
}
