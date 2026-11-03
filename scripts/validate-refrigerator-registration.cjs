/**
 * @file
 * 등록 초안의 검증·DB 레코드 변환을 실제 배치 모델과 함께 검사한다.
 * 화면·DB 저장을 거치지 않고 연결·분할·숨긴 포켓 입력의 보존을 확인한다.
 */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const model = require('../src/features/fridge/model/fridgeLayout.ts');

// 기존 컴포넌트 검사와 같이 경로 별칭만 실제 모델 모듈로 연결한다.
const source = readFileSync(resolve(__dirname, '../src/db/refrigeratorRegistration.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const registrationModule = { exports: {} };
new Function('require', 'module', 'exports', output)(
  name => name === '@/features/fridge/model/fridgeLayout' ? model : require(name),
  registrationModule, registrationModule.exports,
);
const prepare = draft => registrationModule.exports.prepareRefrigeratorRegistration(draft, randomUUID);

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
