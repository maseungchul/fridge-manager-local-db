/**
 * @file
 * 실제 DB 초기화 함수를 메모리 SQLite에 실행해 테이블 제약과 버전 전환을 검사한다.
 * Expo 연결의 비동기 인터페이스만 대체하고 SQL과 트랜잭션은 SQLite에서 실행한다.
 */
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const { loadSource } = require('./helpers/load-source.cjs');
const { initializeDatabase } = loadSource('src/db/initializeDatabase.ts');

function createDatabase(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('PRAGMA foreign_keys = OFF');
  const adapter = {
    async execAsync(sql) { db.exec(sql); },
    async getFirstAsync(sql) { return db.prepare(sql).get() ?? null; },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db, adapter };
}

// 변경 전 스키마를 고정해 신규 생성 SQL과 별개로 버전 1 전환을 검증한다.
function createLegacyDatabase(db, version = 1) {
  db.exec(`
    CREATE TABLE refrigerators (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50)
    );
    CREATE UNIQUE INDEX uk_refrigerators_single ON refrigerators ((1));
    CREATE TABLE refrigerator_compartments (
      id TEXT PRIMARY KEY NOT NULL,
      refrigerator_id TEXT NOT NULL REFERENCES refrigerators (id),
      position TEXT NOT NULL,
      storage_mode TEXT NOT NULL CHECK (storage_mode IN ('CHILLED', 'FROZEN')),
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      UNIQUE (refrigerator_id, position)
    );
    CREATE TABLE refrigerator_areas (
      id TEXT PRIMARY KEY NOT NULL,
      compartment_id TEXT NOT NULL REFERENCES refrigerator_compartments (id),
      type TEXT NOT NULL CHECK (type IN ('LEFT_DOOR', 'BODY', 'RIGHT_DOOR')),
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      UNIQUE (compartment_id, type)
    );
    CREATE TABLE refrigerator_slots (
      id TEXT PRIMARY KEY NOT NULL,
      area_id TEXT NOT NULL REFERENCES refrigerator_areas (id),
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 24),
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      drawer_count INTEGER NOT NULL DEFAULT 0 CHECK (drawer_count IN (0, 1, 2)),
      UNIQUE (area_id, sort_order)
    );
    PRAGMA user_version = ${version};
  `);
}

// 버전 2~4 스키마를 고정해 신규 생성 SQL과 별개로 데이터 보존을 검증한다.
function createPreviousDatabase(db, version = 2) {
  const onDelete = version >= 3 ? 'ON DELETE CASCADE' : '';
  db.exec(`
    CREATE TABLE IF NOT EXISTS refrigerators (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uk_refrigerators_single
      ON refrigerators ((1));

    CREATE TABLE IF NOT EXISTS refrigerator_rows (
      id TEXT PRIMARY KEY NOT NULL,
      refrigerator_id TEXT NOT NULL REFERENCES refrigerators (id) ${onDelete},
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      UNIQUE (refrigerator_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS refrigerator_compartments (
      id TEXT PRIMARY KEY NOT NULL,
      row_id TEXT NOT NULL REFERENCES refrigerator_rows (id) ${onDelete},
      storage_mode TEXT NOT NULL CHECK (storage_mode IN ('CHILLED', 'FROZEN')),
      kind TEXT NOT NULL CHECK (kind IN ('HINGED', 'DRAWER')),
      side TEXT CHECK (side IN ('LEFT_DOOR', 'RIGHT_DOOR')),
      CHECK (kind = 'HINGED' OR side IS NULL),
      UNIQUE (id, row_id)
    );

    CREATE TABLE IF NOT EXISTS refrigerator_doors (
      id TEXT PRIMARY KEY NOT NULL,
      row_id TEXT NOT NULL REFERENCES refrigerator_rows (id) ${onDelete},
      compartment_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      storage_enabled INTEGER NOT NULL CHECK (storage_enabled IN (0, 1)),
      UNIQUE (row_id, sort_order),
      FOREIGN KEY (compartment_id, row_id) REFERENCES refrigerator_compartments (id, row_id) ${onDelete}
    );

    CREATE TABLE IF NOT EXISTS refrigerator_slots (
      id TEXT PRIMARY KEY NOT NULL,
      compartment_id TEXT REFERENCES refrigerator_compartments (id) ${onDelete},
      door_id TEXT REFERENCES refrigerator_doors (id) ${onDelete},
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

    PRAGMA user_version = ${version};
  `);
  if (version === 4) db.exec(`
    CREATE TABLE ingredients (
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
      drawer_number INTEGER NOT NULL DEFAULT 0 CHECK (drawer_number IN (0, 1, 2))
    );
    CREATE INDEX idx_ingredients_position ON ingredients (slot_id, drawer_number);
    CREATE TRIGGER protect_ingredient_slot_split
    BEFORE UPDATE OF drawer_count ON refrigerator_slots
    WHEN (OLD.drawer_count = 2) != (NEW.drawer_count = 2)
      AND EXISTS (SELECT 1 FROM ingredients WHERE slot_id = OLD.id)
    BEGIN
      SELECT RAISE(ABORT, '재료를 먼저 이동하거나 삭제한 후 칸의 분할을 변경해 주세요.');
    END;
  `);
}

function getSchema(db) {
  return db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all();
}

function seedLegacyDatabase(db) {
  db.exec(`
    INSERT INTO refrigerators VALUES ('fridge', '기존 냉장고');
    INSERT INTO refrigerator_compartments VALUES ('body', 'fridge', 'upper', 'CHILLED', 0);
    INSERT INTO refrigerator_areas VALUES ('area', 'body', 'BODY', 0);
    INSERT INTO refrigerator_slots VALUES ('slot', 'area', '기존 칸 이름', 0, 2);
  `);
}

function getColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
}

function seedDatabase(db) {
  db.exec(`
    INSERT INTO refrigerators VALUES ('fridge', '우리 집 냉장고');
    INSERT INTO refrigerator_rows VALUES ('upper', 'fridge', 0), ('lower', 'fridge', 1);
    INSERT INTO refrigerator_compartments VALUES
      ('shared', 'upper', 'CHILLED', 'HINGED', NULL),
      ('drawer', 'lower', 'FROZEN', 'DRAWER', NULL);
    INSERT INTO refrigerator_doors VALUES
      ('left', 'upper', 'shared', 0, 1),
      ('right', 'upper', 'shared', 1, 0),
      ('drawer-door', 'lower', 'drawer', 0, 1);
    INSERT INTO refrigerator_slots (id, compartment_id, door_id, sort_order, drawer_count) VALUES
      ('body-split', 'shared', NULL, 0, 2),
      ('body-legacy', 'shared', NULL, 1, 1),
      ('drawer-slot', 'drawer', NULL, 0, 0);
    INSERT INTO refrigerator_slots (id, door_id, sort_order) VALUES
      ('left-pocket', 'left', 0),
      ('right-pocket', 'right', 0),
      ('hidden-pocket', 'drawer-door', 0);
  `);
}

test('새 DB에 냉장고·재료 테이블을 생성하고 버전·외래 키를 설정한다', async t => {
  const { db, adapter } = createDatabase(t);
  await initializeDatabase(adapter);
  const columns = {
    refrigerators: ['id', 'name'],
    refrigerator_rows: ['id', 'refrigerator_id', 'sort_order'],
    refrigerator_compartments: ['id', 'row_id', 'storage_mode', 'kind', 'side'],
    refrigerator_doors: ['id', 'row_id', 'compartment_id', 'sort_order', 'storage_enabled'],
    refrigerator_slots: ['id', 'compartment_id', 'door_id', 'sort_order', 'drawer_count'],
    ingredients: ['id', 'name', 'quantity', 'expiration_date', 'slot_id', 'drawer_number', 'memo'],
    consumed_ingredients: ['id', 'name', 'quantity', 'expiration_date', 'slot_id', 'drawer_number', 'memo', 'consumed_at'],
  };
  assert.deepEqual(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name),
    Object.keys(columns).sort(),
  );
  for (const [table, expected] of Object.entries(columns)) assert.deepEqual(getColumns(db, table), expected);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('공용 본체·서랍형·숨긴 포켓·좌우 분할을 저장하고 재초기화해도 유지한다', async t => {
  const { db, adapter } = createDatabase(t);
  await initializeDatabase(adapter);
  seedDatabase(db);
  const before = db.prepare('SELECT * FROM refrigerator_slots ORDER BY id').all();
  db.exec('PRAGMA foreign_keys = OFF');
  await initializeDatabase(adapter);
  assert.deepEqual(db.prepare('SELECT * FROM refrigerator_slots ORDER BY id').all(), before);
  assert.equal(db.prepare('SELECT count(*) AS count FROM refrigerator_doors').get().count, 3);
  assert.equal(db.prepare("SELECT drawer_count FROM refrigerator_slots WHERE id = 'hidden-pocket'").get().drawer_count, 0);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('잘못된 연결·분할·중복 순서·허용값을 DB 제약으로 차단한다', async t => {
  const { db, adapter } = createDatabase(t);
  await initializeDatabase(adapter);
  seedDatabase(db);
  const invalidWrites = [
    ["INSERT INTO refrigerators VALUES ('second', '두 번째')", /UNIQUE constraint/],
    ["UPDATE refrigerators SET name = ''", /CHECK constraint/],
    ["UPDATE refrigerators SET name = printf('%051d', 0)", /CHECK constraint/],
    ["INSERT INTO refrigerator_rows VALUES ('duplicate', 'fridge', 0)", /UNIQUE constraint/],
    ["UPDATE refrigerator_rows SET sort_order = -1 WHERE id = 'upper'", /CHECK constraint/],
    ["UPDATE refrigerator_compartments SET storage_mode = 'INVALID' WHERE id = 'shared'", /CHECK constraint/],
    ["UPDATE refrigerator_compartments SET kind = 'INVALID' WHERE id = 'shared'", /CHECK constraint/],
    ["UPDATE refrigerator_compartments SET side = 'INVALID' WHERE id = 'shared'", /CHECK constraint/],
    ["UPDATE refrigerator_compartments SET side = 'LEFT_DOOR' WHERE id = 'drawer'", /CHECK constraint/],
    ["INSERT INTO refrigerator_doors VALUES ('wrong-row', 'lower', 'shared', 1, 1)", /FOREIGN KEY constraint/],
    ["INSERT INTO refrigerator_doors VALUES ('duplicate', 'upper', 'shared', 0, 1)", /UNIQUE constraint/],
    ["UPDATE refrigerator_doors SET storage_enabled = 2 WHERE id = 'left'", /CHECK constraint/],
    ["INSERT INTO refrigerator_slots (id, sort_order) VALUES ('no-parent', 0)", /CHECK constraint/],
    ["INSERT INTO refrigerator_slots VALUES ('both', 'shared', 'left', 2, 0)", /CHECK constraint/],
    ["INSERT INTO refrigerator_slots VALUES ('missing', 'unknown', NULL, 0, 0)", /FOREIGN KEY constraint/],
    ["INSERT INTO refrigerator_slots VALUES ('duplicate', 'shared', NULL, 0, 0)", /UNIQUE constraint/],
    ["INSERT INTO refrigerator_slots VALUES ('duplicate', NULL, 'left', 0, 0)", /UNIQUE constraint/],
    ["UPDATE refrigerator_slots SET drawer_count = 2 WHERE id = 'left-pocket'", /CHECK constraint/],
    ["UPDATE refrigerator_slots SET drawer_count = 3 WHERE id = 'body-split'", /CHECK constraint/],
  ];
  for (const [sql, expectedError] of invalidWrites) {
    assert.throws(() => db.exec(sql), expectedError, sql);
  }
});

for (const version of [0, 1]) {
  test(`기존 빈 DB를 버전 ${version}에서 7로 전환한다`, async t => {
    const { db, adapter } = createDatabase(t);
    createLegacyDatabase(db, version);
    await initializeDatabase(adapter);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'refrigerator_areas'").get(), undefined);
    seedDatabase(db);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });

  test(`버전 ${version}의 기존 데이터를 지우고 새 구조로 초기화한다`, async t => {
    const { db, adapter } = createDatabase(t);
    createLegacyDatabase(db, version);
    seedLegacyDatabase(db);
    await initializeDatabase(adapter);
    for (const table of ['refrigerators', 'refrigerator_rows', 'refrigerator_compartments', 'refrigerator_doors', 'refrigerator_slots']) {
      assert.equal(db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count, 0);
    }
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'refrigerator_areas'").get(), undefined);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
    seedDatabase(db);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
}

test('부모가 없는 기존 칸도 제거하고 새 구조로 초기화한다', async t => {
  const { db, adapter } = createDatabase(t);
  createLegacyDatabase(db);
  db.exec("INSERT INTO refrigerator_slots VALUES ('orphan', 'missing-area', '기존 칸', 0, 0)");
  await initializeDatabase(adapter);
  assert.equal(db.prepare('SELECT count(*) AS count FROM refrigerator_slots').get().count, 0);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('버전 기록 후 실패해도 이전 테이블·버전으로 롤백하고 다시 시도할 수 있다', async t => {
  const { db, adapter } = createDatabase(t);
  createLegacyDatabase(db);
  seedLegacyDatabase(db);
  const schema = getSchema(db);
  const before = db.prepare('SELECT * FROM refrigerator_slots').all();
  const execAsync = adapter.execAsync;
  adapter.execAsync = async sql => {
    await execAsync(sql);
    if (/PRAGMA user_version = 7/.test(sql)) throw new Error('검증용 저장 실패');
  };
  await assert.rejects(initializeDatabase(adapter), /검증용 저장 실패/);
  assert.deepEqual(getSchema(db), schema);
  assert.deepEqual(db.prepare('SELECT * FROM refrigerator_slots').all(), before);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  adapter.execAsync = execAsync;
  await initializeDatabase(adapter);
  seedDatabase(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
});

test('지원 버전보다 높은 DB는 변경하지 않는다', async t => {
  const { db, adapter } = createDatabase(t);
  db.exec('PRAGMA user_version = 8');
  const schema = getSchema(db);
  await assert.rejects(initializeDatabase(adapter), /지원하지 않는 DB 버전/);
  assert.deepEqual(getSchema(db), schema);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8);
});

// 철회했던 코드가 앱 새로고침으로 적용된 상황을 당시 테이블·트리거 구조로 재현한다.
async function createTemporaryVersion6(t) {
  const { db, adapter } = createDatabase(t);
  await initializeDatabase(adapter);
  const schema = getSchema(db);
  for (const trigger of schema.filter(item => item.type === 'trigger')) db.exec(`DROP TRIGGER ${trigger.name}`);
  const table = schema.find(item => item.name === 'ingredients');
  db.exec('DROP TABLE consumed_ingredients');
  db.exec('DROP TABLE ingredients');
  db.exec(table.sql.replace('slot_id TEXT NOT NULL', 'slot_id TEXT')
    .replace('memo TEXT', 'memo TEXT, CHECK (slot_id IS NOT NULL OR drawer_number = 0)'));
  db.exec(schema.find(item => item.name === 'idx_ingredients_position').sql);
  for (const trigger of schema.filter(item => item.type === 'trigger')) {
    db.exec(trigger.sql.replace('WHEN NOT EXISTS (', 'WHEN NEW.slot_id IS NOT NULL AND NOT EXISTS ('));
  }
  seedDatabase(db);
  db.exec(`INSERT INTO ingredients VALUES ('item', '계란', '2개', '2026-11-30', 'body-split', 1, '개봉 후 밀폐');
    PRAGMA user_version = 6;`);
  return { db, adapter };
}

test('철회한 임시 버전 6은 위치 제약을 복구하고 구조·재료·메모를 보존해 버전 7로 전환한다', async t => {
  const { db, adapter } = await createTemporaryVersion6(t);
  const before = readStoredData(db);
  const ingredients = db.prepare('SELECT * FROM ingredients').all();
  await initializeDatabase(adapter);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
  assert.deepEqual(readStoredData(db), before);
  assert.deepEqual(db.prepare('SELECT * FROM ingredients').all(), ingredients);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare("PRAGMA table_info(ingredients)").all().find(column => column.name === 'slot_id').notnull, 1);
  assert.throws(() => db.exec("UPDATE ingredients SET slot_id = NULL, drawer_number = 0"), /보관할 수 없는 위치|NOT NULL/);
  assert.throws(() => db.exec("UPDATE refrigerator_slots SET drawer_count = 0 WHERE id = 'body-split'"), /재료를 먼저 이동/);
  const schema = getSchema(db);
  await initializeDatabase(adapter);
  assert.deepEqual(getSchema(db), schema);
});

test('임시 버전 6의 위치 없는 재료는 삭제하거나 임의 배치하지 않고 복구를 중단한다', async t => {
  const { db, adapter } = await createTemporaryVersion6(t);
  db.exec('UPDATE ingredients SET slot_id = NULL, drawer_number = 0');
  const schema = getSchema(db);
  const ingredients = db.prepare('SELECT * FROM ingredients').all();
  await assert.rejects(initializeDatabase(adapter), /보관 위치가 없는 재료/);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 6);
  assert.deepEqual(getSchema(db), schema);
  assert.deepEqual(db.prepare('SELECT * FROM ingredients').all(), ingredients);
});

test('임시 버전 6 복구 중 실패하면 테이블·재료·버전을 모두 보존하고 재시도한다', async t => {
  const { db, adapter } = await createTemporaryVersion6(t);
  const schema = getSchema(db);
  const ingredients = db.prepare('SELECT * FROM ingredients').all();
  const execAsync = adapter.execAsync;
  adapter.execAsync = async sql => {
    await execAsync(sql);
    if (/PRAGMA user_version = 7/.test(sql)) throw new Error('검증용 복구 실패');
  };
  await assert.rejects(initializeDatabase(adapter), /검증용 복구 실패/);
  assert.deepEqual(getSchema(db), schema);
  assert.deepEqual(db.prepare('SELECT * FROM ingredients').all(), ingredients);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 6);
  adapter.execAsync = execAsync;
  await initializeDatabase(adapter);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
});

const structureTables = ['refrigerators', 'refrigerator_rows', 'refrigerator_compartments', 'refrigerator_doors', 'refrigerator_slots'];

function readStoredData(db) {
  return Object.fromEntries(structureTables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
}

for (const migrated of [false, true]) {
  test(`${migrated ? '버전 2에서 전환한' : '새로 생성한'} DB에서 냉장고를 삭제하면 구조 전체를 삭제한다`, async t => {
    const { db, adapter } = createDatabase(t);
    if (migrated) { createPreviousDatabase(db); seedDatabase(db); }
    await initializeDatabase(adapter);
    if (!migrated) seedDatabase(db);
    db.exec("DELETE FROM refrigerators WHERE id = 'fridge'");
    for (const table of structureTables) {
      assert.equal(db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count, 0, table);
    }
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
}

test('버전 2의 이름·ID·순서·문 수납·좌우 분할을 유지하고 재초기화해도 보존한다', async t => {
  const { db, adapter } = createDatabase(t);
  createPreviousDatabase(db);
  seedDatabase(db);
  const before = readStoredData(db);
  await initializeDatabase(adapter);
  assert.deepEqual(readStoredData(db), before);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_temp_master WHERE type = 'table'").all(), []);
  await initializeDatabase(adapter);
  assert.deepEqual(readStoredData(db), before);
});

test('버전 2 전환 중 다른 테이블의 참조 데이터를 보존하고 냉장고 삭제 시에도 행을 유지한다', async t => {
  const { db, adapter } = createDatabase(t);
  createPreviousDatabase(db);
  seedDatabase(db);
  // 재료처럼 별도로 보존할 데이터는 테스트용 참조 테이블로 재현한다.
  db.exec(`
    CREATE TABLE retained_items (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      slot_id TEXT REFERENCES refrigerator_slots(id) ON DELETE SET NULL);
    INSERT INTO retained_items VALUES ('item', '보존할 재료', 'body-split');
  `);
  const before = db.prepare('SELECT * FROM retained_items').all();
  await initializeDatabase(adapter);
  assert.deepEqual(db.prepare('SELECT * FROM retained_items').all(), before);
  db.exec("DELETE FROM refrigerators WHERE id = 'fridge'");
  const retained = db.prepare('SELECT * FROM retained_items').get();
  assert.equal(retained.id, 'item');
  assert.equal(retained.name, '보존할 재료');
  assert.equal(retained.slot_id, null);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('버전 2 전환 실패 시 구조·데이터·버전을 롤백하고 외래 키 검사를 복구한다', async t => {
  const { db, adapter } = createDatabase(t);
  createPreviousDatabase(db);
  seedDatabase(db);
  const schema = getSchema(db);
  const before = readStoredData(db);
  const execAsync = adapter.execAsync;
  adapter.execAsync = async sql => {
    await execAsync(sql);
    if (/PRAGMA user_version = 7/.test(sql)) throw new Error('검증용 전환 실패');
  };
  await assert.rejects(initializeDatabase(adapter), /검증용 전환 실패/);
  assert.deepEqual(getSchema(db), schema);
  assert.deepEqual(readStoredData(db), before);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_temp_master WHERE type = 'table'").all(), []);
  adapter.execAsync = execAsync;
  await initializeDatabase(adapter);
  assert.deepEqual(readStoredData(db), before);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
});

test('부모가 없는 버전 2 데이터는 삭제하거나 버전을 올리지 않고 전환을 거부한다', async t => {
  const { db, adapter } = createDatabase(t);
  createPreviousDatabase(db);
  seedDatabase(db);
  db.exec("UPDATE refrigerator_slots SET compartment_id = 'missing' WHERE id = 'body-split'");
  const before = readStoredData(db);
  const schema = getSchema(db);
  await assert.rejects(initializeDatabase(adapter), /연결 정보/);
  assert.deepEqual(readStoredData(db), before);
  assert.deepEqual(getSchema(db), schema);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
});

test('버전 3의 구조·데이터를 유지하고 재료 저장 구조만 추가한다', async t => {
  const { db, adapter } = createDatabase(t);
  createPreviousDatabase(db, 3);
  seedDatabase(db);
  const before = readStoredData(db);
  const schema = getSchema(db);
  await initializeDatabase(adapter);
  assert.deepEqual(readStoredData(db), before);
  assert.deepEqual(getSchema(db).filter(item => schema.some(previous => previous.name === item.name)), schema);
  assert.equal(db.prepare('SELECT count(*) AS count FROM ingredients').get().count, 0);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('버전 3 전환 실패 시 추가한 테이블·트리거·버전을 롤백하고 재시도한다', async t => {
  const { db, adapter } = createDatabase(t);
  createPreviousDatabase(db, 3);
  seedDatabase(db);
  const schema = getSchema(db);
  const before = readStoredData(db);
  const execAsync = adapter.execAsync;
  adapter.execAsync = async sql => {
    await execAsync(sql);
    if (/PRAGMA user_version = 7/.test(sql)) throw new Error('검증용 재료 구조 추가 실패');
  };
  await assert.rejects(initializeDatabase(adapter), /검증용 재료 구조 추가 실패/);
  assert.deepEqual(getSchema(db), schema);
  assert.deepEqual(readStoredData(db), before);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  adapter.execAsync = execAsync;
  await initializeDatabase(adapter);
  assert.deepEqual(readStoredData(db), before);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
});

test('버전 4의 재료·위치·제약을 보존하고 메모를 추가해 재초기화해도 유지한다', async t => {
  const { db, adapter } = createDatabase(t);
  createPreviousDatabase(db, 4);
  seedDatabase(db);
  db.exec("INSERT INTO ingredients VALUES ('item', '계란', '2개', '2026-11-30', 'body-split', 1)");
  const structure = readStoredData(db);
  const ingredients = db.prepare('SELECT * FROM ingredients').all();
  const schema = getSchema(db).filter(item => item.name !== 'ingredients');
  await initializeDatabase(adapter);
  assert.deepEqual(readStoredData(db), structure);
  assert.deepEqual(db.prepare('SELECT * FROM ingredients').all().map(item => ({ ...item })), ingredients.map(item => ({ ...item, memo: null })));
  assert.deepEqual(getSchema(db).filter(item => schema.some(previous => previous.name === item.name)), schema);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
  assert.throws(() => db.exec("DELETE FROM refrigerator_slots WHERE id = 'body-split'"), /FOREIGN KEY constraint/);
  assert.throws(() => db.exec("UPDATE refrigerator_slots SET drawer_count = 0 WHERE id = 'body-split'"), /재료를 먼저 이동하거나 삭제/);
  assert.throws(() => db.exec("UPDATE ingredients SET expiration_date = '2026-02-29'"), /CHECK constraint/);
  db.prepare("UPDATE ingredients SET memo = ? WHERE id = 'item'").run('개봉 후 밀폐 보관');
  await initializeDatabase(adapter);
  assert.equal(db.prepare("SELECT memo FROM ingredients WHERE id = 'item'").get().memo, '개봉 후 밀폐 보관');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('버전 4 전환 실패 시 메모 컬럼·버전을 롤백하고 기존 재료를 보존해 재시도한다', async t => {
  const { db, adapter } = createDatabase(t);
  createPreviousDatabase(db, 4);
  seedDatabase(db);
  db.exec("INSERT INTO ingredients VALUES ('item', '계란', '2개', NULL, 'body-split', 1)");
  const schema = getSchema(db);
  const ingredients = db.prepare('SELECT * FROM ingredients').all();
  const execAsync = adapter.execAsync;
  adapter.execAsync = async sql => {
    await execAsync(sql);
    if (/PRAGMA user_version = 7/.test(sql)) throw new Error('검증용 메모 컬럼 추가 실패');
  };
  await assert.rejects(initializeDatabase(adapter), /검증용 메모 컬럼 추가 실패/);
  assert.deepEqual(getSchema(db), schema);
  assert.deepEqual(db.prepare('SELECT * FROM ingredients').all(), ingredients);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  adapter.execAsync = execAsync;
  await initializeDatabase(adapter);
  assert.deepEqual(db.prepare('SELECT * FROM ingredients').all().map(item => ({ ...item })), ingredients.map(item => ({ ...item, memo: null })));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
});

test('버전 5 전환은 기존 재료·메모·위치·제약을 보존하고 소비 완료 테이블을 추가한다', async t => {
  const { db, adapter } = createDatabase(t);
  createPreviousDatabase(db, 4);
  seedDatabase(db);
  db.exec(`ALTER TABLE ingredients ADD COLUMN memo TEXT;
    INSERT INTO ingredients VALUES ('item', '계란', '2개', '2026-11-30', 'body-split', 1, '개봉함');
    PRAGMA user_version = 5;`);
  const structure = readStoredData(db);
  const ingredients = db.prepare('SELECT * FROM ingredients').all();
  const schema = getSchema(db);
  await initializeDatabase(adapter);
  assert.deepEqual(readStoredData(db), structure);
  assert.deepEqual(db.prepare('SELECT * FROM ingredients').all(), ingredients);
  assert.deepEqual(getSchema(db).filter(item => schema.some(previous => previous.name === item.name)), schema);
  assert.deepEqual(db.prepare('SELECT * FROM consumed_ingredients').all(), []);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
  const migrated = getSchema(db);
  await initializeDatabase(adapter);
  assert.deepEqual(getSchema(db), migrated);
});

for (const failure of ['CREATE TABLE IF NOT EXISTS consumed_ingredients', 'PRAGMA user_version = 7']) {
  test(`버전 5의 소비 기록 구조 추가 실패를 롤백하고 기존 재료를 보존한다: ${failure}`, async t => {
    const { db, adapter } = createDatabase(t);
    createPreviousDatabase(db, 4);
    seedDatabase(db);
    db.exec(`ALTER TABLE ingredients ADD COLUMN memo TEXT;
      INSERT INTO ingredients VALUES ('item', '계란', '2개', NULL, 'body-split', 1, '개봉함');
      PRAGMA user_version = 5;`);
    const schema = getSchema(db);
    const ingredients = db.prepare('SELECT * FROM ingredients').all();
    const execAsync = adapter.execAsync;
    adapter.execAsync = async sql => {
      await execAsync(sql);
      if (sql.includes(failure)) throw new Error('소비 기록 구조 추가 실패');
    };
    await assert.rejects(initializeDatabase(adapter), /소비 기록 구조 추가 실패/);
    assert.deepEqual(getSchema(db), schema);
    assert.deepEqual(db.prepare('SELECT * FROM ingredients').all(), ingredients);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 5);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    adapter.execAsync = execAsync;
    await initializeDatabase(adapter);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
  });
}

test('분할 없음·좌우·포켓·서랍에 같은 이름의 재료를 저장하고 재초기화해도 보존한다', async t => {
  const { db, adapter } = createDatabase(t);
  await initializeDatabase(adapter);
  seedDatabase(db);
  const insert = db.prepare('INSERT INTO ingredients (id, name, quantity, expiration_date, slot_id, drawer_number) VALUES (?, ?, ?, ?, ?, ?)');
  for (const [id, slotId, drawerNumber, quantity, expirationDate] of [
    ['whole', 'body-legacy', 0, '2개', null],
    ['left', 'body-split', 1, '반 통', '2028-02-29'],
    ['right', 'body-split', 2, '500g', '2026-11-04'],
    ['pocket', 'left-pocket', 0, '1병', '2026-12-31'],
    ['drawer', 'drawer-slot', 0, '1봉', null],
  ]) insert.run(id, '같은 재료', quantity, expirationDate, slotId, drawerNumber);
  const before = db.prepare('SELECT * FROM ingredients ORDER BY id').all();
  await initializeDatabase(adapter);
  assert.deepEqual(db.prepare('SELECT * FROM ingredients ORDER BY id').all(), before);
  assert.deepEqual(db.prepare(`SELECT id FROM ingredients
    WHERE slot_id = 'body-split' AND drawer_number = 2`).all().map(row => row.id), ['right']);
});

test('빈 이름·수량과 잘못된 날짜·좌우 번호·숨긴 포켓을 등록·이동에서 차단한다', async t => {
  const { db, adapter } = createDatabase(t);
  await initializeDatabase(adapter);
  seedDatabase(db);
  const insert = db.prepare('INSERT INTO ingredients (id, name, quantity, expiration_date, slot_id, drawer_number) VALUES (?, ?, ?, ?, ?, ?)');
  for (const name of ['', '   ', '가'.repeat(51)]) {
    assert.throws(() => insert.run('invalid', name, '1개', null, 'body-legacy', 0), /CHECK constraint/);
  }
  for (const quantity of ['', '   ', '가'.repeat(51)]) {
    assert.throws(() => insert.run('invalid', '재료', quantity, null, 'body-legacy', 0), /CHECK constraint/);
  }
  for (const date of ['', '2026-2-03', '2026-02-29', '2026-04-31', '2026-00-01', '2026-01-00',
    '2026-13-01', '2026-11-04T00:00:00Z', '날짜 아님']) {
    assert.throws(() => insert.run('invalid', '재료', '1개', date, 'body-legacy', 0), /CHECK constraint/, date);
  }
  insert.run('valid', '재료', '1개', null, 'body-legacy', 0);
  const before = db.prepare('SELECT * FROM ingredients').get();
  const move = db.prepare("UPDATE ingredients SET slot_id = ?, drawer_number = ? WHERE id = 'valid'");
  for (const [slotId, drawerNumber] of [
    ['missing', 0], ['body-split', 0], ['body-legacy', 1], ['left-pocket', 2],
    ['body-split', 3], ['body-split', 1.5], ['right-pocket', 0], ['hidden-pocket', 0],
  ]) {
    assert.throws(() => insert.run('invalid', '재료', '1개', null, slotId, drawerNumber), /보관할 수 없는 위치|CHECK constraint/);
    assert.throws(() => move.run(slotId, drawerNumber), /보관할 수 없는 위치|CHECK constraint/);
    assert.deepEqual(db.prepare("SELECT * FROM ingredients WHERE id = 'valid'").get(), before);
  }
  move.run('body-split', 2);
  assert.equal(db.prepare("SELECT drawer_number FROM ingredients WHERE id = 'valid'").get().drawer_number, 2);
  assert.throws(() => db.exec("UPDATE ingredients SET expiration_date = '2026-02-29'"), /CHECK constraint/);
});

test('재료가 있는 칸과 상위 구조의 삭제는 재료와 구조를 모두 보존한다', async t => {
  const { db, adapter } = createDatabase(t);
  await initializeDatabase(adapter);
  seedDatabase(db);
  db.exec("INSERT INTO ingredients (id, name, quantity, expiration_date, slot_id, drawer_number) VALUES ('item', '재료', '1개', NULL, 'body-split', 1)");
  const before = readStoredData(db);
  const item = db.prepare('SELECT * FROM ingredients').get();
  for (const [table, id] of [
    ['refrigerator_slots', 'body-split'], ['refrigerator_compartments', 'shared'],
    ['refrigerator_rows', 'upper'], ['refrigerators', 'fridge'],
  ]) {
    assert.throws(() => db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id), /FOREIGN KEY constraint/);
    assert.deepEqual(readStoredData(db), before);
    assert.deepEqual(db.prepare('SELECT * FROM ingredients').get(), item);
  }
  db.exec('DELETE FROM ingredients; DELETE FROM refrigerators;');
  for (const table of structureTables) assert.equal(db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count, 0);
});

test('재료를 먼저 이동·삭제해야 분할 변경·문 수납 끄기·서랍형 전환을 허용한다', async t => {
  const { db, adapter } = createDatabase(t);
  await initializeDatabase(adapter);
  seedDatabase(db);
  db.exec(`
    INSERT INTO ingredients (id, name, quantity, expiration_date, slot_id, drawer_number) VALUES
      ('split', '왼쪽 재료', '1개', NULL, 'body-split', 1),
      ('whole', '분할 없는 재료', '1개', NULL, 'body-legacy', 0),
      ('pocket', '포켓 재료', '1병', NULL, 'left-pocket', 0);
  `);
  const before = readStoredData(db);
  for (const sql of [
    "UPDATE refrigerator_slots SET drawer_count = 0 WHERE id = 'body-split'",
    "UPDATE refrigerator_slots SET drawer_count = 2 WHERE id = 'body-legacy'",
    "UPDATE refrigerator_doors SET storage_enabled = 0 WHERE id = 'left'",
    "UPDATE refrigerator_doors SET compartment_id = 'drawer' WHERE id = 'left'",
    "UPDATE refrigerator_compartments SET kind = 'DRAWER' WHERE id = 'shared'",
  ]) {
    assert.throws(() => db.exec(sql), /재료를 먼저 이동하거나 삭제/);
    assert.deepEqual(readStoredData(db), before);
  }
  // 기존 값 1을 분할 없음 0으로 정규화하는 수정과 이름·보관 모드 변경은 허용한다.
  db.exec(`
    UPDATE refrigerator_slots SET drawer_count = 0 WHERE id = 'body-legacy';
    UPDATE refrigerators SET name = '수정한 냉장고';
    UPDATE refrigerator_compartments SET storage_mode = 'FROZEN' WHERE id = 'shared';
    UPDATE ingredients SET slot_id = 'drawer-slot', drawer_number = 0;
    UPDATE refrigerator_slots SET drawer_count = 0 WHERE id = 'body-split';
    UPDATE refrigerator_slots SET drawer_count = 2 WHERE id = 'body-legacy';
    UPDATE refrigerator_doors SET storage_enabled = 0 WHERE id = 'left';
    UPDATE refrigerator_compartments SET kind = 'DRAWER' WHERE id = 'shared';
  `);
  assert.equal(db.prepare('SELECT count(*) AS count FROM ingredients').get().count, 3);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
