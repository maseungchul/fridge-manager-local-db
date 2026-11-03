/**
 * @file
 * 실제 DB 초기화 함수를 메모리 SQLite에 실행해 테이블 제약과 버전 전환을 검사한다.
 * Expo 연결의 비동기 인터페이스만 대체하고 SQL과 트랜잭션은 SQLite에서 실행한다.
 */
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const { initializeDatabase } = require('../src/db/initializeDatabase.ts');

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

test('새 DB에 확정한 5개 테이블을 생성하고 버전·외래 키를 설정한다', async t => {
  const { db, adapter } = createDatabase(t);
  await initializeDatabase(adapter);
  const columns = {
    refrigerators: ['id', 'name'],
    refrigerator_rows: ['id', 'refrigerator_id', 'sort_order'],
    refrigerator_compartments: ['id', 'row_id', 'storage_mode', 'kind', 'side'],
    refrigerator_doors: ['id', 'row_id', 'compartment_id', 'sort_order', 'storage_enabled'],
    refrigerator_slots: ['id', 'compartment_id', 'door_id', 'sort_order', 'drawer_count'],
  };
  assert.deepEqual(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name),
    Object.keys(columns).sort(),
  );
  for (const [table, expected] of Object.entries(columns)) assert.deepEqual(getColumns(db, table), expected);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
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
    ["DELETE FROM refrigerators WHERE id = 'fridge'", /FOREIGN KEY constraint/],
  ];
  for (const [sql, expectedError] of invalidWrites) {
    assert.throws(() => db.exec(sql), expectedError, sql);
  }
});

for (const version of [0, 1]) {
  test(`기존 빈 DB를 버전 ${version}에서 2로 전환한다`, async t => {
    const { db, adapter } = createDatabase(t);
    createLegacyDatabase(db, version);
    await initializeDatabase(adapter);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
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
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
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
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
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
    if (/PRAGMA user_version = 2/.test(sql)) throw new Error('검증용 저장 실패');
  };
  await assert.rejects(initializeDatabase(adapter), /검증용 저장 실패/);
  assert.deepEqual(getSchema(db), schema);
  assert.deepEqual(db.prepare('SELECT * FROM refrigerator_slots').all(), before);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  adapter.execAsync = execAsync;
  await initializeDatabase(adapter);
  seedDatabase(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
});

test('지원 버전보다 높은 DB는 변경하지 않는다', async t => {
  const { db, adapter } = createDatabase(t);
  db.exec('PRAGMA user_version = 3');
  const schema = getSchema(db);
  await assert.rejects(initializeDatabase(adapter), /지원하지 않는 DB 버전/);
  assert.deepEqual(getSchema(db), schema);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
});
