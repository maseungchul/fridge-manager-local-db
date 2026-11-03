/**
 * @file
 * 등록·편집 초안의 검증·변환과 SQLite 저장을 실제 배치 모델과 함께 검사한다.
 * 네이티브 UUID·연결 인터페이스만 대체하고 SQL과 트랜잭션은 SQLite에서 실행한다.
 */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const ts = require('typescript');
const model = require('../src/features/fridge/model/fridgeLayout.ts');
const { initializeDatabase } = require('../src/db/initializeDatabase.ts');

// 기존 컴포넌트 검사와 같이 경로 별칭만 실제 모델 모듈로 연결한다.
function loadModule(path, dependencies) {
  const source = readFileSync(resolve(__dirname, '..', path), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    name => name in dependencies ? dependencies[name] : require(name), module, module.exports,
  );
  return module.exports;
}
const registration = loadModule('src/db/refrigeratorRegistration.ts', {
  '@/features/fridge/model/fridgeLayout': model,
});
const { registerRefrigerator, updateRefrigerator, getRefrigeratorSummary, getRefrigerator } = loadModule('src/db/refrigeratorRepository.ts', {
  expo: { uuid: { v4: randomUUID } }, '@/db/refrigeratorRegistration': registration,
  '@/features/fridge/model/fridgeLayout': model,
});
const prepare = draft => registration.prepareRefrigeratorRegistration(draft, randomUUID);

function createConnectionAdapter(db) {
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 0;');
  return {
    async execAsync(sql) { db.exec(sql); },
    async getFirstAsync(sql, ...params) { return db.prepare(sql).get(...params) ?? null; },
    async getAllAsync(sql, ...params) { return db.prepare(sql).all(...params); },
    async runAsync(sql, ...params) { return db.prepare(sql).run(...params); },
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
}

async function createRepositoryDatabase(t, foreignKeys = false) {
  const databasePath = join(tmpdir(), `fridge-registration-${randomUUID()}.db`);
  const db = new DatabaseSync(databasePath);
  t.after(() => {
    db.close();
    for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(databasePath + suffix, { force: true });
  });
  const adapter = createConnectionAdapter(db);
  // Expo와 같이 별도 연결을 열어 초기화 연결의 외래 키 설정이 공유되지 않는 상태를 재현한다.
  adapter.withExclusiveTransactionAsync = async task => {
    const connection = new DatabaseSync(databasePath);
    try {
      const transaction = createConnectionAdapter(connection);
      if (foreignKeys) connection.exec('PRAGMA foreign_keys = ON;');
      await transaction.withTransactionAsync(() => task(transaction));
    } finally {
      connection.close();
    }
  };
  await initializeDatabase(adapter);
  return { db, adapter, databasePath };
}

function readStoredData(db) {
  return Object.fromEntries([
    'refrigerators', 'refrigerator_rows', 'refrigerator_compartments', 'refrigerator_doors', 'refrigerator_slots',
  ].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
}

function createTwoDoorDraft() {
  const draft = model.createRefrigeratorDraft();
  return model.changeDraftDoorCount(draft, draft.rows[0].id, 1);
}

function createSlots(count, drawerCount = 0) {
  return Array.from({ length: count }, (_, index) => ({ name: model.getSlotName(index), drawerCount }));
}

test('이름 공백을 제거하고 임시 ID를 UUID로 바꾸며 입력 초안을 유지한다', () => {
  const draft = model.createRefrigeratorDraft();
  draft.name = '  우리 집 냉장고  ';
  const before = structuredClone(draft);
  const data = prepare(draft);
  assert.equal(data.refrigerator.name, '우리 집 냉장고');
  assert.deepEqual(data.rows.map(row => row.sort_order), [0, 1]);
  assert.equal(data.compartments.length, 2);
  assert.equal(data.doors.length, 2);
  assert.equal(data.slots.length, 6);
  for (const row of data.rows) assert.equal(row.refrigerator_id, data.refrigerator.id);
  for (const body of data.compartments) assert(data.rows.some(row => row.id === body.row_id));
  for (const door of data.doors) {
    assert(data.compartments.some(body => body.id === door.compartment_id && body.row_id === door.row_id));
    assert.equal('kind' in door || 'side' in door, false);
  }
  for (const slot of data.slots) {
    assert.notEqual(slot.compartment_id === null, slot.door_id === null);
    assert.equal('name' in slot || 'area_id' in slot, false);
    if (slot.compartment_id !== null) assert(data.compartments.some(body => body.id === slot.compartment_id));
    if (slot.door_id !== null) assert(data.doors.some(door => door.id === slot.door_id));
  }
  const ids = [data.refrigerator, ...data.rows, ...data.compartments, ...data.doors, ...data.slots].map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal('nextId' in data, false);
  assert.deepEqual(draft, before);
});

test('단일 문의 열림 방향을 배치 순서와 별개로 본체에 기록한다', () => {
  const draft = createTwoDoorDraft();
  draft.rows[0].doors[0].side = 'RIGHT_DOOR';
  draft.rows[0].doors[1].side = 'LEFT_DOOR';
  draft.rows[0].compartments[1].storageMode = 'FROZEN';
  const data = prepare(draft);
  assert.deepEqual(data.compartments.slice(0, 2).map(body => [body.kind, body.side, body.storage_mode]), [
    ['HINGED', 'RIGHT_DOOR', 'CHILLED'], ['HINGED', 'LEFT_DOOR', 'FROZEN'],
  ]);
  assert.deepEqual(data.doors.slice(0, 2).map(door => door.sort_order), [0, 1]);
  assert.notEqual(data.doors[0].compartment_id, data.doors[1].compartment_id);
});

test('공용 본체의 방향은 NULL로 변환하고 좌우 분할과 수납을 끈 문의 칸을 보존한다', () => {
  let draft = createTwoDoorDraft();
  draft.rows[0].doors[1].storageEnabled = false;
  draft.rows[0].doors[1].slots = createSlots(3);
  draft = model.mergeDraftCompartments(draft, draft.rows[0].id, draft.rows[0].compartments[1].id);
  draft.rows[0].compartments[0].slots = createSlots(4, 2);
  const before = structuredClone(draft);
  const data = prepare(draft);
  const body = data.compartments[0];
  assert.equal(body.kind, 'HINGED');
  assert.equal(body.side, null);
  assert.equal(data.doors[0].compartment_id, body.id);
  assert.equal(data.doors[1].compartment_id, body.id);
  assert.deepEqual(data.slots.filter(slot => slot.compartment_id === body.id).map(slot => [slot.sort_order, slot.drawer_count]), [
    [0, 2], [1, 2], [2, 2], [3, 2],
  ]);
  assert.equal(data.doors[1].storage_enabled, 0);
  assert.equal(data.slots.filter(slot => slot.door_id === data.doors[1].id).length, 3);
  assert.deepEqual(draft, before);
});

test('서랍형은 본체에 기록하고 문 방향을 NULL로 바꾸면서 숨긴 포켓 입력을 보존한다', () => {
  const original = model.createRefrigeratorDraft();
  original.rows[0].doors[0].side = 'RIGHT_DOOR';
  const draft = model.setDraftDoorOpening(original, original.rows[0].id, original.rows[0].doors[0].id, 'DRAWER');
  const before = structuredClone(draft);
  const data = prepare(draft);
  assert.equal(data.compartments[0].kind, 'DRAWER');
  assert.equal(data.compartments[0].side, null);
  assert.equal(data.doors[0].storage_enabled, 1);
  assert.equal(data.slots.filter(slot => slot.door_id === data.doors[0].id).length, 2);
  assert.deepEqual(data.slots.filter(slot => slot.compartment_id === data.compartments[0].id).map(slot => slot.drawer_count), [0]);
  assert.deepEqual(draft, before);
});

test('기존 분할 없음 값 1은 0으로 통일하고 칸 이름은 저장 데이터에서 제외한다', () => {
  const draft = model.createRefrigeratorDraft();
  draft.rows[0].compartments[0].slots[0] = { name: '저장하지 않는 이름', drawerCount: 1 };
  draft.rows[0].doors[0].slots[0].drawerCount = 1;
  const data = prepare(draft);
  assert(data.slots.every(slot => slot.drawer_count === 0 && !('name' in slot)));
  assert.equal(draft.rows[0].compartments[0].slots[0].drawerCount, 1);
  assert.equal(draft.rows[0].doors[0].slots[0].drawerCount, 1);
});

test('최대 4단·단별 2문·본체 4칸·포켓 3칸을 빠짐없이 변환한다', () => {
  let draft = model.addDraftRow(model.addDraftRow(model.createRefrigeratorDraft()));
  for (const row of draft.rows) draft = model.changeDraftDoorCount(draft, row.id, 1);
  for (const row of draft.rows) {
    for (const body of row.compartments) body.slots = createSlots(4, 2);
    for (const door of row.doors) door.slots = createSlots(3);
  }
  const data = prepare(draft);
  assert.equal(data.rows.length, 4);
  assert.equal(data.compartments.length, 8);
  assert.equal(data.doors.length, 8);
  assert.equal(data.slots.length, 56);
  for (const row of data.rows) {
    assert.deepEqual(data.doors.filter(door => door.row_id === row.id).map(door => door.sort_order), [0, 1]);
  }
});

test('잘못된 이름·개수·설정·식별자를 거부하고 초안을 변경하지 않는다', () => {
  const cases = [
    ['빈 이름', draft => { draft.name = '  '; }, /이름/],
    ['긴 이름', draft => { draft.name = '가'.repeat(51); }, /이름/],
    ['단 없음', draft => { draft.rows = []; }, /단으로/],
    ['단 초과', draft => { draft.rows = Array(5).fill(draft.rows[0]); }, /단으로/],
    ['문 없음', draft => { draft.rows[0].doors = []; }, /문은/],
    ['문 초과', draft => { draft.rows[0].doors.push(draft.rows[0].doors[0]); }, /문은/],
    ['본체 없음', draft => { draft.rows[0].compartments = []; }, /본체 연결/],
    ['본체 초과', draft => { draft.rows[0].compartments.push(draft.rows[0].compartments[0]); }, /본체 연결/],
    ['본체 칸 없음', draft => { draft.rows[0].compartments[0].slots = []; }, /칸은/],
    ['본체 칸 초과', draft => { draft.rows[0].compartments[0].slots = createSlots(5); }, /칸은/],
    ['포켓 칸 없음', draft => { draft.rows[0].doors[0].slots = []; }, /칸은/],
    ['포켓 칸 초과', draft => { draft.rows[0].doors[0].slots = createSlots(4); }, /칸은/],
    ['보관 모드 미선택', draft => { draft.rows[0].compartments[0].storageMode = null; }, /냉장·냉동/],
    ['잘못된 보관 모드', draft => { draft.rows[0].compartments[0].storageMode = 'INVALID'; }, /냉장·냉동/],
    ['잘못된 문 형태', draft => { draft.rows[0].doors[0].kind = 'INVALID'; }, /여는 방식/],
    ['잘못된 문 방향', draft => { draft.rows[0].doors[0].side = 'INVALID'; }, /여는 방식/],
    ['잘못된 문 수납 값', draft => { draft.rows[0].doors[0].storageEnabled = 1; }, /수납 사용/],
    ['잘못된 분할 값', draft => { draft.rows[0].compartments[0].slots[0].drawerCount = 3; }, /좌우 분할/],
    ['포켓 좌우 분할', draft => { draft.rows[0].doors[0].slots[0].drawerCount = 2; }, /분할할 수 없/],
    ['숨긴 포켓 좌우 분할', draft => {
      draft.rows[0].doors[0].storageEnabled = false;
      draft.rows[0].doors[0].slots[0].drawerCount = 2;
    }, /분할할 수 없/],
    ['빈 식별자', draft => { draft.rows[0].id = ''; }, /식별자/],
    ['중복 식별자', draft => { draft.rows[0].compartments[0].id = draft.rows[0].doors[0].id; }, /식별자/],
    ['다른 단과 식별자 중복', draft => { draft.rows[1].doors[0].id = draft.rows[0].doors[0].id; }, /식별자/],
  ];
  for (const [label, mutate, message] of cases) {
    const draft = createTwoDoorDraft();
    mutate(draft);
    const before = structuredClone(draft);
    assert.throws(() => prepare(draft), message, label);
    assert.deepEqual(draft, before, label);
  }
});

test('중복·누락·다른 단 참조·순서 불일치가 있는 본체 연결을 거부한다', () => {
  const cases = [
    draft => { draft.rows[0].compartments[0].doorIds = []; },
    draft => { draft.rows[0].compartments[0].doorIds = ['unknown']; },
    draft => { draft.rows[0].compartments[1].doorIds = [...draft.rows[0].compartments[0].doorIds]; },
    draft => { draft.rows[0].compartments.pop(); },
    draft => { draft.rows[0].compartments[0].doorIds = [draft.rows[1].doors[0].id]; },
    draft => { draft.rows[0].compartments.reverse(); },
  ];
  for (const mutate of cases) {
    const draft = createTwoDoorDraft();
    mutate(draft);
    assert.throws(() => prepare(draft), /본체/);
  }
});

test('공용 본체의 잘못된 문 형태·방향과 서로 다른 보관 모드의 합치기를 거부한다', () => {
  for (const mutate of [
    draft => { draft.rows[0].doors[0].kind = 'DRAWER'; },
    draft => { draft.rows[0].doors[1].side = 'LEFT_DOOR'; },
    draft => { draft.rows[0].compartments[0].doorIds.reverse(); },
  ]) {
    let draft = createTwoDoorDraft();
    draft = model.mergeDraftCompartments(draft, draft.rows[0].id, draft.rows[0].compartments[0].id);
    mutate(draft);
    assert.throws(() => prepare(draft), /공용 본체|연결 순서/);
  }
  let draft = createTwoDoorDraft();
  draft.rows[0].compartments[1].storageMode = 'FROZEN';
  draft = model.mergeDraftCompartments(draft, draft.rows[0].id, draft.rows[0].compartments[0].id);
  assert.throws(() => prepare(draft), /냉장·냉동/);
});

test('서랍형 본체의 다중 칸과 좌우 분할을 거부한다', () => {
  for (const slots of [createSlots(2), createSlots(1, 2)]) {
    const original = model.createRefrigeratorDraft();
    const draft = model.setDraftDoorOpening(original, original.rows[0].id, original.rows[0].doors[0].id, 'DRAWER');
    draft.rows[0].compartments[0].slots = slots;
    assert.throws(() => prepare(draft), /칸은|분할할 수 없/);
  }
});

test('등록 구성을 파일 DB에 저장하고 커밋된 냉장고 ID를 반환한다', async t => {
  const { db, adapter, databasePath } = await createRepositoryDatabase(t);
  assert.equal(await getRefrigeratorSummary(adapter), null);
  const draft = model.createRefrigeratorDraft();
  draft.name = "  우리 집 '냉장고'; DROP TABLE refrigerators; --  ";
  const before = structuredClone(draft);
  const id = await registerRefrigerator(adapter, draft);
  assert.deepEqual({ ...await getRefrigeratorSummary(adapter) }, { id, name: draft.name.trim() });
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(db.prepare('SELECT name FROM refrigerators WHERE id = ?').get(id).name, draft.name.trim());
  assert.equal(db.prepare('SELECT count(*) AS count FROM refrigerator_rows').get().count, 2);
  assert.equal(db.prepare('SELECT count(*) AS count FROM refrigerator_compartments').get().count, 2);
  assert.equal(db.prepare('SELECT count(*) AS count FROM refrigerator_doors').get().count, 2);
  assert.equal(db.prepare('SELECT count(*) AS count FROM refrigerator_slots').get().count, 6);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.deepEqual(draft, before);
  const reopened = new DatabaseSync(databasePath);
  try {
    assert.equal(reopened.prepare('SELECT id FROM refrigerators').get().id, id);
    assert.equal(reopened.prepare('SELECT count(*) AS count FROM refrigerator_slots').get().count, 6);
  } finally {
    reopened.close();
  }
});

test('공용 본체·서랍형·좌우 분할과 숨긴 포켓 칸을 연결된 상태로 저장한다', async t => {
  const { db, adapter } = await createRepositoryDatabase(t);
  let draft = createTwoDoorDraft();
  draft.rows[0].doors[1].storageEnabled = false;
  draft.rows[0].doors[1].slots = createSlots(3);
  draft = model.mergeDraftCompartments(draft, draft.rows[0].id, draft.rows[0].compartments[0].id);
  draft.rows[0].compartments[0].slots = createSlots(4, 2);
  draft = model.setDraftDoorOpening(draft, draft.rows[1].id, draft.rows[1].doors[0].id, 'DRAWER');
  draft.rows[1].compartments[0].storageMode = 'FROZEN';
  await registerRefrigerator(adapter, draft);
  const bodies = db.prepare(`
    SELECT body.* FROM refrigerator_compartments AS body
    JOIN refrigerator_rows AS row ON row.id = body.row_id ORDER BY row.sort_order
  `).all();
  assert.equal(bodies[0].kind, 'HINGED');
  assert.equal(bodies[0].side, null);
  assert.equal(bodies[1].kind, 'DRAWER');
  assert.equal(bodies[1].side, null);
  assert.equal(bodies[1].storage_mode, 'FROZEN');
  const doors = db.prepare('SELECT * FROM refrigerator_doors WHERE compartment_id = ? ORDER BY sort_order').all(bodies[0].id);
  assert.deepEqual(doors.map(door => door.sort_order), [0, 1]);
  assert.equal(doors[1].storage_enabled, 0);
  assert.equal(db.prepare('SELECT count(*) AS count FROM refrigerator_slots WHERE door_id = ?').get(doors[1].id).count, 3);
  assert.deepEqual(
    db.prepare('SELECT drawer_count FROM refrigerator_slots WHERE compartment_id = ? ORDER BY sort_order').all(bodies[0].id)
      .map(slot => slot.drawer_count),
    [2, 2, 2, 2],
  );
  assert.equal(db.prepare(`
    SELECT count(*) AS count FROM refrigerator_slots AS slot
    JOIN refrigerator_doors AS door ON door.id = slot.door_id WHERE door.compartment_id = ?
  `).get(bodies[1].id).count, 2);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('등록된 냉장고가 있으면 기존 구성을 변경하지 않고 중복 등록을 거부한다', async t => {
  const { db, adapter } = await createRepositoryDatabase(t);
  const id = await registerRefrigerator(adapter, model.createRefrigeratorDraft());
  const before = readStoredData(db);
  const draft = createTwoDoorDraft();
  draft.name = '새 냉장고';
  await assert.rejects(registerRefrigerator(adapter, draft), /이미 등록된 냉장고/);
  assert.deepEqual(readStoredData(db), before);
  assert.equal(db.prepare('SELECT id FROM refrigerators').get().id, id);
});

test('초안 검증 실패 시 DB에 일부 데이터를 남기지 않는다', async t => {
  const { db, adapter } = await createRepositoryDatabase(t);
  const before = readStoredData(db);
  const draft = model.createRefrigeratorDraft();
  draft.rows[1].compartments[0].storageMode = null;
  await assert.rejects(registerRefrigerator(adapter, draft), /냉장·냉동/);
  assert.deepEqual(readStoredData(db), before);
});

for (const table of ['refrigerator_rows', 'refrigerator_compartments', 'refrigerator_doors', 'refrigerator_slots']) {
  test(`${table} 저장 도중 실패하면 전체 등록을 롤백하고 다시 시도할 수 있다`, async t => {
    const { db, adapter } = await createRepositoryDatabase(t);
    const before = readStoredData(db);
    db.exec(`
      CREATE TRIGGER fail_registration BEFORE INSERT ON ${table}
      WHEN (SELECT count(*) FROM ${table}) >= 1
      BEGIN SELECT RAISE(ABORT, '검증용 저장 실패'); END;
    `);
    await assert.rejects(registerRefrigerator(adapter, model.createRefrigeratorDraft()), /검증용 저장 실패/);
    assert.deepEqual(readStoredData(db), before);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
    db.exec('DROP TRIGGER fail_registration');
    const id = await registerRefrigerator(adapter, model.createRefrigeratorDraft());
    assert.equal(db.prepare('SELECT id FROM refrigerators').get().id, id);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
}

test('전용 연결의 외래 키 검사가 꺼져 있어도 잘못된 연결은 커밋 전에 차단한다', async t => {
  const { db, adapter } = await createRepositoryDatabase(t);
  const before = readStoredData(db);
  db.exec(`
    CREATE TRIGGER break_slot_parent AFTER INSERT ON refrigerator_slots
    WHEN NEW.compartment_id IS NOT NULL
    BEGIN UPDATE refrigerator_slots SET compartment_id = 'missing-body-' || NEW.id WHERE id = NEW.id; END;
  `);
  await assert.rejects(registerRefrigerator(adapter, model.createRefrigeratorDraft()), /연결 정보가 올바르지/);
  assert.deepEqual(readStoredData(db), before);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('동시에 등록을 요청해도 냉장고 한 대와 완전한 구성만 저장된다', async t => {
  const { db, adapter } = await createRepositoryDatabase(t);
  const results = await Promise.allSettled([
    registerRefrigerator(adapter, model.createRefrigeratorDraft()),
    registerRefrigerator(adapter, createTwoDoorDraft()),
  ]);
  const successes = results.filter(result => result.status === 'fulfilled');
  const failures = results.filter(result => result.status === 'rejected');
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  assert.match(failures[0].reason.message, /locked|busy|이미 등록/);
  assert.equal(db.prepare('SELECT id FROM refrigerators').get().id, successes[0].value);
  assert.equal(db.prepare('SELECT count(*) AS count FROM refrigerator_rows').get().count, 2);
  const doorCount = db.prepare('SELECT count(*) AS count FROM refrigerator_doors').get().count;
  assert(doorCount === 2 || doorCount === 3);
  assert.equal(db.prepare('SELECT count(*) AS count FROM refrigerator_compartments').get().count, doorCount);
  assert.equal(db.prepare('SELECT count(*) AS count FROM refrigerator_slots').get().count, doorCount * 3);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('미등록·다른 냉장고 ID의 수정은 신규 데이터를 만들거나 기존 구성을 바꾸지 않는다', async t => {
  const { db, adapter } = await createRepositoryDatabase(t);
  await assert.rejects(updateRefrigerator(adapter, 'missing', model.createRefrigeratorDraft()), /찾을 수 없/);
  assert.equal(await getRefrigerator(adapter), null);
  await registerRefrigerator(adapter, model.createRefrigeratorDraft());
  const before = readStoredData(db);
  await assert.rejects(updateRefrigerator(adapter, 'another-fridge', model.createRefrigeratorDraft()), /찾을 수 없/);
  assert.deepEqual(readStoredData(db), before);
});

test('이름·모드·문 수납·좌우 분할을 수정해도 기존 ID와 위치 참조를 유지한다', async t => {
  for (const foreignKeys of [false, true]) await t.test(`foreign_keys=${foreignKeys}`, async t => {
    const { db, adapter, databasePath } = await createRepositoryDatabase(t, foreignKeys);
    const id = await registerRefrigerator(adapter, createTwoDoorDraft());
    const loaded = await getRefrigerator(adapter);
    const before = readStoredData(db);
    const draft = model.createRefrigeratorDraft(loaded);
    draft.name = "  수정한 '냉장고'  ";
    draft.rows[0].compartments[0].storageMode = 'FROZEN';
    draft.rows[0].compartments[0].slots[0].drawerCount = 2;
    draft.rows[0].doors[1].storageEnabled = false;
    assert.notEqual(draft.rows[0].compartments[0].storageMode, loaded.rows[0].compartments[0].storageMode);
    const slotId = loaded.rows[0].compartments[0].slots[0].id;
    db.exec('CREATE TABLE position_refs (slot_id TEXT REFERENCES refrigerator_slots(id) ON DELETE CASCADE);');
    db.prepare('INSERT INTO position_refs (slot_id) VALUES (?)').run(slotId);
    const draftBeforeSave = structuredClone(draft);
    assert.equal(await updateRefrigerator(adapter, id, draft), id);
    assert.deepEqual(draft, draftBeforeSave);
    const after = readStoredData(db);
    for (const table of Object.keys(before)) assert.deepEqual(after[table].map(row => row.id), before[table].map(row => row.id));
    assert.equal(db.prepare('SELECT slot_id FROM position_refs').get().slot_id, slotId);
    const saved = await getRefrigerator(adapter);
    assert.equal(saved.name, "수정한 '냉장고'");
    assert.equal(saved.rows[0].compartments[0].storageMode, 'FROZEN');
    assert.equal(saved.rows[0].compartments[0].slots[0].drawerCount, 2);
    assert.equal(saved.rows[0].doors[1].storageEnabled, false);
    assert.deepEqual(saved.rows[0].doors[1].slots, loaded.rows[0].doors[1].slots);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    const reopened = new DatabaseSync(databasePath);
    try {
      assert.equal(reopened.prepare('SELECT name FROM refrigerators WHERE id = ?').get(id).name, saved.name);
      assert.equal(reopened.prepare('SELECT drawer_count FROM refrigerator_slots WHERE id = ?').get(slotId).drawer_count, 2);
    } finally { reopened.close(); }
  });
});

test('본체 합치기·분리와 단·문·칸의 추가·삭제를 반복해도 연결과 순서를 유지한다', async t => {
  for (const foreignKeys of [false, true]) await t.test(`foreign_keys=${foreignKeys}`, async t => {
    const { db, adapter } = await createRepositoryDatabase(t, foreignKeys);
    const id = await registerRefrigerator(adapter, createTwoDoorDraft());
    const original = await getRefrigerator(adapter);
    const upper = original.rows[0];
    const retainedBodyId = upper.compartments[1].id;
    let draft = model.mergeDraftCompartments(model.createRefrigeratorDraft(original), upper.id, retainedBodyId);
    draft.rows[0].compartments[0].slots = createSlots(4, 2);
    draft.rows[0].doors[1].storageEnabled = false;
    draft.rows[0].doors[1].slots.push({ name: model.getSlotName(2), drawerCount: 0 });
    draft = model.setDraftDoorOpening(draft, draft.rows[1].id, draft.rows[1].doors[0].id, 'DRAWER');
    draft = model.addDraftRow(draft);
    await updateRefrigerator(adapter, id, draft);
    let saved = await getRefrigerator(adapter);
    assert.equal(saved.rows[0].compartments[0].id, retainedBodyId);
    assert.deepEqual(saved.rows[0].doors.map(door => door.id), upper.doors.map(door => door.id));
    assert.equal(saved.rows[0].doors[1].storageEnabled, false);
    assert.deepEqual(saved.rows[0].doors[1].slots.slice(0, 2), upper.doors[1].slots);
    assert.equal(saved.rows[0].compartments[0].slots.length, 4);
    assert.equal(saved.rows[1].doors[0].kind, 'DRAWER');
    assert.equal(saved.rows[1].compartments[0].slots.length, 1);
    assert.match(saved.rows[2].id, /^[0-9a-f-]{36}$/);
    assert.equal(db.prepare('SELECT id FROM refrigerator_compartments WHERE id = ?').get(upper.compartments[0].id), undefined);

    draft = model.splitDraftCompartment(model.createRefrigeratorDraft(saved), upper.id, retainedBodyId, upper.doors[1].id);
    await updateRefrigerator(adapter, id, draft);
    saved = await getRefrigerator(adapter);
    assert.equal(saved.rows[0].compartments[1].id, retainedBodyId);
    assert.notEqual(saved.rows[0].compartments[0].id, upper.compartments[0].id);
    assert.deepEqual(saved.rows[0].compartments.map(body => body.slots.length), [1, 1]);
    draft = model.changeDraftDoorCount(model.createRefrigeratorDraft(saved), upper.id, -1);
    await updateRefrigerator(adapter, id, draft);
    saved = await getRefrigerator(adapter);
    assert.equal(saved.rows[0].doors.length, 1);
    assert.equal(db.prepare('SELECT id FROM refrigerator_doors WHERE id = ?').get(upper.doors[1].id), undefined);

    const nextFirstRow = saved.rows[1];
    draft = model.removeDraftRow(model.createRefrigeratorDraft(saved), upper.id);
    draft = model.addDraftRow(draft);
    await updateRefrigerator(adapter, id, draft);
    saved = await getRefrigerator(adapter);
    assert.equal(saved.rows[0].id, nextFirstRow.id);
    assert.equal(saved.rows.length, 3);
    assert.equal(db.prepare('SELECT id FROM refrigerator_rows WHERE id = ?').get(upper.id), undefined);
    assert.deepEqual(db.prepare('SELECT sort_order FROM refrigerator_rows ORDER BY sort_order').all().map(row => row.sort_order), [0, 1, 2]);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('SELECT count(*) AS count FROM refrigerators').get().count, 1);
  });
});

test('수정 초안이 잘못되면 이름과 구성·순서를 모두 보존한다', async t => {
  const { db, adapter } = await createRepositoryDatabase(t);
  const id = await registerRefrigerator(adapter, model.createRefrigeratorDraft());
  const loaded = await getRefrigerator(adapter);
  const before = readStoredData(db);
  for (const mutate of [
    draft => { draft.name = ' '; },
    draft => { draft.rows[0].compartments[0].storageMode = null; },
    draft => { draft.rows[0].compartments[0].doorIds = []; },
    draft => { draft.rows[0].doors[0].slots[1].id = draft.rows[0].doors[0].slots[0].id; },
  ]) {
    const draft = model.createRefrigeratorDraft(loaded);
    mutate(draft);
    await assert.rejects(updateRefrigerator(adapter, id, draft));
    assert.deepEqual(readStoredData(db), before);
  }
});

test('수정 기록·삭제 도중 실패하면 전체를 롤백하고 같은 초안으로 재시도할 수 있다', async t => {
  for (const phase of ['write', 'delete']) await t.test(phase, async t => {
    const { db, adapter } = await createRepositoryDatabase(t);
    const id = await registerRefrigerator(adapter, createTwoDoorDraft());
    const loaded = await getRefrigerator(adapter);
    const before = readStoredData(db);
    let draft = model.createRefrigeratorDraft(loaded);
    draft.name = '실패하면 바뀌지 않을 이름';
    draft = model.mergeDraftCompartments(draft, draft.rows[0].id, draft.rows[0].compartments[0].id);
    if (phase === 'write') db.exec(`
      CREATE TRIGGER fail_edit BEFORE UPDATE ON refrigerator_slots WHEN NEW.sort_order < OLD.sort_order
      BEGIN SELECT RAISE(ABORT, '검증용 수정 실패'); END;
    `);
    else db.exec(`
      CREATE TRIGGER fail_edit BEFORE DELETE ON refrigerator_compartments
      BEGIN SELECT RAISE(ABORT, '검증용 수정 실패'); END;
    `);
    await assert.rejects(updateRefrigerator(adapter, id, draft), /검증용 수정 실패/);
    assert.deepEqual(readStoredData(db), before);
    db.exec('DROP TRIGGER fail_edit;');
    await updateRefrigerator(adapter, id, draft);
    assert.equal((await getRefrigerator(adapter)).name, draft.name);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
});

test('참조 중인 칸을 없애는 수정은 전용 연결의 외래 키 설정과 관계없이 롤백한다', async t => {
  for (const foreignKeys of [false, true]) await t.test(`foreign_keys=${foreignKeys}`, async t => {
    const { db, adapter } = await createRepositoryDatabase(t, foreignKeys);
    const id = await registerRefrigerator(adapter, model.createRefrigeratorDraft());
    const loaded = await getRefrigerator(adapter);
    const before = readStoredData(db);
    db.exec('CREATE TABLE position_refs (slot_id TEXT REFERENCES refrigerator_slots(id));');
    const slotId = loaded.rows[0].compartments[0].slots[0].id;
    db.prepare('INSERT INTO position_refs (slot_id) VALUES (?)').run(slotId);
    let draft = model.createRefrigeratorDraft(loaded);
    draft = model.removeDraftRow(draft, loaded.rows[0].id);
    await assert.rejects(updateRefrigerator(adapter, id, draft), /연결 정보|FOREIGN KEY/);
    assert.deepEqual(readStoredData(db), before);
    assert.equal(db.prepare('SELECT slot_id FROM position_refs').get().slot_id, slotId);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
});

test('미등록 DB의 전체 조회는 null을 반환하고 데이터를 만들지 않는다', async t => {
  const { db, adapter } = await createRepositoryDatabase(t);
  const before = readStoredData(db);
  assert.equal(await getRefrigerator(adapter), null);
  assert.deepEqual(readStoredData(db), before);
});

test('전체 조회는 본체·문·숨긴 포켓 입력과 UUID를 유지하고 칸 이름을 생성한다', async t => {
  const { db, adapter, databasePath } = await createRepositoryDatabase(t);
  let draft = createTwoDoorDraft();
  draft.name = '복원할 냉장고';
  draft.rows[0].doors[1].storageEnabled = false;
  draft.rows[0].doors[1].slots = createSlots(3);
  draft = model.mergeDraftCompartments(draft, draft.rows[0].id, draft.rows[0].compartments[1].id);
  draft.rows[0].compartments[0].slots = createSlots(4, 2);
  draft = model.setDraftDoorOpening(draft, draft.rows[1].id, draft.rows[1].doors[0].id, 'DRAWER');
  draft.rows[1].compartments[0].storageMode = 'FROZEN';
  const id = await registerRefrigerator(adapter, draft);
  const before = readStoredData(db);
  const loaded = await getRefrigerator(adapter);
  assert.equal(loaded.id, id);
  assert.equal(loaded.name, draft.name);
  assert.equal('nextId' in loaded, false);
  assert.equal(loaded.rows.length, 2);
  const upper = loaded.rows[0];
  const lower = loaded.rows[1];
  assert.deepEqual(upper.compartments[0].doorIds, upper.doors.map(door => door.id));
  assert.deepEqual(upper.doors.map(door => door.side), ['LEFT_DOOR', 'RIGHT_DOOR']);
  assert.equal(upper.doors[1].storageEnabled, false);
  assert.equal(upper.doors[1].slots.length, 3);
  assert.deepEqual(upper.compartments[0].slots.map(slot => slot.drawerCount), [2, 2, 2, 2]);
  assert.equal(lower.doors[0].kind, 'DRAWER');
  assert.equal(lower.doors[0].slots.length, 2);
  assert.equal(lower.compartments[0].storageMode, 'FROZEN');
  const ids = [loaded.id];
  for (const row of loaded.rows) {
    ids.push(row.id);
    for (const area of [...row.compartments, ...row.doors]) {
      ids.push(area.id);
      assert.deepEqual(area.slots.map(slot => slot.name), area.slots.map((_, index) => model.getSlotName(index)));
      ids.push(...area.slots.map(slot => slot.id));
    }
  }
  assert.deepEqual(ids.sort(), Object.values(before).flat().map(row => row.id).sort());
  const layout = model.getDraftLayout(loaded);
  assert.equal(layout.positions.length, 11);
  assert(layout.positions.every(position => position.areaId !== upper.doors[1].id && position.areaId !== lower.doors[0].id));
  assert.deepEqual(
    layout.positions.filter(position => position.slotId === upper.compartments[0].slots[0].id).map(position => position.id),
    [`${upper.compartments[0].slots[0].id}-left`, `${upper.compartments[0].slots[0].id}-right`],
  );
  assert.deepEqual(readStoredData(db), before);

  const reopened = new DatabaseSync(databasePath);
  try {
    const reopenedAdapter = createConnectionAdapter(reopened);
    reopenedAdapter.withExclusiveTransactionAsync = adapter.withExclusiveTransactionAsync;
    assert.deepEqual(await getRefrigerator(reopenedAdapter), loaded);
  } finally {
    reopened.close();
  }
});

test('물리적 삽입 순서가 달라도 단·문·본체·칸은 저장된 배치 순서로 복원한다', async t => {
  const { db, adapter } = await createRepositoryDatabase(t);
  const draft = createTwoDoorDraft();
  draft.rows[0].doors[0].side = 'RIGHT_DOOR';
  draft.rows[0].doors[1].side = 'LEFT_DOOR';
  draft.rows[0].compartments[0].slots = createSlots(4);
  await registerRefrigerator(adapter, draft);
  const expected = await getRefrigerator(adapter);
  db.exec('BEGIN; PRAGMA defer_foreign_keys = ON;');
  for (const table of Object.keys(readStoredData(db))) {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY rowid DESC`).all();
    db.exec(`DELETE FROM ${table}`);
    for (const row of rows) {
      db.prepare(`INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`)
        .run(...Object.values(row));
    }
  }
  db.exec('COMMIT;');
  assert.deepEqual(await getRefrigerator(adapter), expected);
  assert.deepEqual(expected.rows[0].doors.map(door => door.side), ['RIGHT_DOOR', 'LEFT_DOOR']);
  assert.deepEqual(expected.rows[0].compartments.map(body => body.doorIds), expected.rows[0].doors.map(door => [door.id]));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('기존 칸 분할 값 1도 한 위치로 읽고 조회 과정에서는 DB 값을 바꾸지 않는다', async t => {
  const { db, adapter } = await createRepositoryDatabase(t);
  await registerRefrigerator(adapter, model.createRefrigeratorDraft());
  db.exec('UPDATE refrigerator_slots SET drawer_count = 1 WHERE compartment_id IS NOT NULL');
  const before = readStoredData(db);
  const loaded = await getRefrigerator(adapter);
  const layout = model.getDraftLayout(loaded);
  for (const row of loaded.rows) {
    const slot = row.compartments[0].slots[0];
    assert.equal(slot.drawerCount, 1);
    assert.deepEqual(layout.positions.filter(position => position.slotId === slot.id).map(position => position.id), [slot.id]);
  }
  assert.deepEqual(readStoredData(db), before);
});

test('누락된 구성은 미등록으로 오인하거나 임의로 채우지 않고 조회 오류로 알린다', async t => {
  const cases = [
    ['단 없음', db => { db.exec('DELETE FROM refrigerator_slots; DELETE FROM refrigerator_doors; DELETE FROM refrigerator_compartments; DELETE FROM refrigerator_rows;'); }],
    ['문 없는 본체', db => {
      const row = db.prepare('SELECT id FROM refrigerator_rows ORDER BY sort_order LIMIT 1').get();
      db.prepare("INSERT INTO refrigerator_compartments VALUES ('orphan-body', ?, 'CHILLED', 'HINGED', 'LEFT_DOOR')").run(row.id);
    }],
    ['칸 순서 누락', db => { db.exec('DELETE FROM refrigerator_slots WHERE door_id IS NOT NULL AND sort_order = 0'); }],
    ['단일 문의 방향 누락', db => { db.exec('UPDATE refrigerator_compartments SET side = NULL'); }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async t => {
      const { db, adapter } = await createRepositoryDatabase(t);
      await registerRefrigerator(adapter, model.createRefrigeratorDraft());
      mutate(db);
      const before = readStoredData(db);
      await assert.rejects(getRefrigerator(adapter), /저장된 냉장고/);
      assert.deepEqual(readStoredData(db), before);
    });
  }
});
