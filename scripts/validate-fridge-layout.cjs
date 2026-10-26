/**
 * @file
 * 도면에서 맞닿은 본체의 합치기와 분리 반복 시 칸 수·입력 보존을 검사한다.
 * 화면·DB를 거치지 않고 실제 초안 변경 함수의 동작을 확인한다.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  changeDraftDoorCount, createRefrigeratorDraft, getAdjacentRightCompartment,
  mergeDraftCompartments, setDraftDoorOpening, splitDraftCompartment,
} = require('../src/features/fridge/model/fridgeLayout.ts');

/** 각 본체의 칸 이름·서랍 구조를 다르게 만들어 입력 유실과 복제를 구분한다. */
function createDraftWithSlots(counts) {
  let draft = createRefrigeratorDraft();
  const rowId = draft.rows[0].id;
  for (let count = 1; count < counts.length; count++) {
    draft = changeDraftDoorCount(draft, rowId, 1);
  }
  return { ...draft, rows: draft.rows.map(row => row.id !== rowId ? row : {
    // 연속된 본체가 맞닿도록 여닫이 문은 양끝에 두고 중간 본체는 서랍형으로 구성한다.
    ...row, doors: row.doors.map((door, index) => ({
      ...door, kind: index > 0 && index < counts.length - 1 ? 'DRAWER' : 'HINGED',
      side: index === counts.length - 1 && index > 0 ? 'RIGHT_DOOR' : 'LEFT_DOOR',
    })),
    compartments: row.compartments.map((body, bodyIndex) => ({
      ...body, storageMode: 'FROZEN',
      slots: Array.from({ length: counts[bodyIndex] }, (_, slotIndex) => ({
        name: `${bodyIndex + 1}번 본체 ${slotIndex + 1}번 칸`, drawerCount: (bodyIndex + slotIndex) % 3,
      })),
    })),
  }) };
}

test('두 본체를 합치고 분리해도 두 칸이 반복해서 늘어나지 않는다', () => {
  let draft = createDraftWithSlots([1, 1]);
  const rowId = draft.rows[0].id;
  const bodyId = draft.rows[0].compartments[0].id;
  for (let cycle = 0; cycle < 20; cycle++) {
    draft = mergeDraftCompartments(draft, rowId, bodyId);
    assert.equal(draft.rows[0].compartments[0].slots.length, 2);
    draft = splitDraftCompartment(draft, rowId, bodyId);
    assert.deepEqual(draft.rows[0].compartments.map(body => body.slots.length), [1, 1]);
  }
});

test('여러 본체의 칸 수·순서·이름·서랍 구조·보관 모드를 보존한다', () => {
  for (const counts of [[2, 3], [1, 1, 1], [2, 2, 1]]) {
    const original = createDraftWithSlots(counts);
    const snapshot = structuredClone(original);
    const rowId = original.rows[0].id;
    const bodyId = original.rows[0].compartments[0].id;
    const expectedSlots = original.rows[0].compartments.flatMap(body => body.slots);
    const expectedDoorIds = original.rows[0].doors.map(door => door.id);
    let draft = original;
    for (let cycle = 0; cycle < 10; cycle++) {
      for (let remaining = counts.length; remaining > 1; remaining--) {
        draft = mergeDraftCompartments(draft, rowId, bodyId);
        assert.equal(draft.rows[0].compartments.length, remaining - 1);
      }
      assert.deepEqual(draft.rows[0].compartments[0].slots, expectedSlots);
      draft = splitDraftCompartment(draft, rowId, bodyId);
      const bodies = draft.rows[0].compartments;
      assert.equal(bodies.length, counts.length);
      assert.deepEqual(bodies.flatMap(body => body.slots), expectedSlots);
      assert.deepEqual(bodies.flatMap(body => body.doorIds), expectedDoorIds);
      assert(bodies.every(body => body.slots.length >= 1 && body.storageMode === 'FROZEN'));
      assert.equal(bodies[0].id, bodyId);
      assert.equal(new Set(bodies.map(body => body.id)).size, bodies.length);
      assert.deepEqual(draft.rows[0].doors, original.rows[0].doors);
      assert.strictEqual(draft.rows[1], original.rows[1]);
    }
    assert.deepEqual(original, snapshot);
  }
});

test('공용 칸을 줄인 뒤 분리해도 기존 입력과 본체별 최소 한 칸을 유지한다', () => {
  let draft = createDraftWithSlots([1, 1, 1]);
  const rowId = draft.rows[0].id;
  const bodyId = draft.rows[0].compartments[0].id;
  for (let remaining = 3; remaining > 1; remaining--) {
    draft = mergeDraftCompartments(draft, rowId, bodyId);
    assert.equal(draft.rows[0].compartments.length, remaining - 1);
  }
  const retainedSlot = { name: '유지할 칸', drawerCount: 2 };
  draft = { ...draft, rows: draft.rows.map(row => row.id !== rowId ? row : {
    ...row, compartments: [{ ...row.compartments[0], slots: [retainedSlot] }],
  }) };
  draft = splitDraftCompartment(draft, rowId, bodyId);
  assert.deepEqual(draft.rows[0].compartments.map(body => body.slots.length), [1, 1, 1]);
  assert.deepEqual(draft.rows[0].compartments[0].slots, [retainedSlot]);
  draft = mergeDraftCompartments(draft, rowId, bodyId);
  draft = mergeDraftCompartments(draft, rowId, bodyId);
  draft = splitDraftCompartment(draft, rowId, bodyId);
  assert.deepEqual(draft.rows[0].compartments.map(body => body.slots.length), [1, 1, 1]);
});

test('문 방향 조합에 따라 도면에서 맞닿은 본체만 합칠 수 있다', () => {
  const cases = [
    ['LEFT_DOOR', 'LEFT_DOOR', false], ['LEFT_DOOR', 'RIGHT_DOOR', true], ['LEFT_DOOR', 'DRAWER', true],
    ['RIGHT_DOOR', 'LEFT_DOOR', false], ['RIGHT_DOOR', 'RIGHT_DOOR', false], ['RIGHT_DOOR', 'DRAWER', false],
    ['DRAWER', 'LEFT_DOOR', false], ['DRAWER', 'RIGHT_DOOR', true], ['DRAWER', 'DRAWER', true],
  ];
  for (const [leftOpening, rightOpening, expected] of cases) {
    let draft = createDraftWithSlots([1, 1]);
    const rowId = draft.rows[0].id;
    const [leftDoor, rightDoor] = draft.rows[0].doors;
    const [leftBody, rightBody] = draft.rows[0].compartments;
    draft = setDraftDoorOpening(draft, rowId, leftDoor.id, leftOpening);
    draft = setDraftDoorOpening(draft, rowId, rightDoor.id, rightOpening);
    assert.equal(getAdjacentRightCompartment(draft.rows[0], leftBody.id)?.id, expected ? rightBody.id : undefined);
    const merged = mergeDraftCompartments(draft, rowId, leftBody.id);
    assert.equal(merged.rows[0].compartments.length, expected ? 1 : 2);
    if (!expected) assert.deepEqual(merged, draft);
  }
});

test('본체 사이의 문은 수납을 꺼도 합치기를 막는다', () => {
  let draft = createDraftWithSlots([1, 1]);
  const rowId = draft.rows[0].id;
  const bodyId = draft.rows[0].compartments[0].id;
  const doorId = draft.rows[0].doors[1].id;
  draft = setDraftDoorOpening(draft, rowId, doorId, 'LEFT_DOOR');
  draft = { ...draft, rows: draft.rows.map(row => row.id !== rowId ? row : {
    ...row, doors: row.doors.map(door => door.id === doorId ? { ...door, storageEnabled: false } : door),
  }) };
  assert.equal(getAdjacentRightCompartment(draft.rows[0], bodyId), undefined);
  assert.deepEqual(mergeDraftCompartments(draft, rowId, bodyId), draft);
});

test('공용 본체에 연결된 문도 이웃 본체와의 합치기 판정에 반영한다', () => {
  let draft = createDraftWithSlots([1, 1, 1]);
  const rowId = draft.rows[0].id;
  const bodyId = draft.rows[0].compartments[0].id;
  const middleDoorId = draft.rows[0].doors[1].id;
  draft = setDraftDoorOpening(draft, rowId, middleDoorId, 'RIGHT_DOOR');
  draft = mergeDraftCompartments(draft, rowId, bodyId);
  assert.equal(draft.rows[0].compartments.length, 2);
  assert.equal(getAdjacentRightCompartment(draft.rows[0], bodyId), undefined);
  assert.deepEqual(mergeDraftCompartments(draft, rowId, bodyId), draft);
  draft = setDraftDoorOpening(draft, rowId, middleDoorId, 'DRAWER');
  assert.equal(mergeDraftCompartments(draft, rowId, bodyId).rows[0].compartments.length, 1);

  let rightShared = createDraftWithSlots([1, 1, 1]);
  const rightRowId = rightShared.rows[0].id;
  const firstBodyId = rightShared.rows[0].compartments[0].id;
  const secondBodyId = rightShared.rows[0].compartments[1].id;
  rightShared = setDraftDoorOpening(rightShared, rightRowId, rightShared.rows[0].doors[1].id, 'LEFT_DOOR');
  rightShared = mergeDraftCompartments(rightShared, rightRowId, secondBodyId);
  assert.equal(rightShared.rows[0].compartments.length, 2);
  assert.equal(getAdjacentRightCompartment(rightShared.rows[0], firstBodyId), undefined);
  assert.deepEqual(mergeDraftCompartments(rightShared, rightRowId, firstBodyId), rightShared);
});
