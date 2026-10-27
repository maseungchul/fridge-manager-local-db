/**
 * @file
 * 닫힌 도면의 문·본체 정렬과 합치기·분리 시 칸 수·입력 보존을 검사한다.
 * 화면·DB를 거치지 않고 실제 초안 변경 함수의 동작을 확인한다.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  changeDraftDoorCount, createRefrigeratorDraft, getAdjacentRightCompartment, getDraftRowGeometry,
  mergeDraftCompartments, setDraftDoorOpening, splitDraftCompartment,
} = require('../src/features/fridge/model/fridgeLayout.ts');

/** 문 생성 제한과 독립된 기존 초안으로 이전 3문 배치의 합치기·분리도 검사한다. */
function createDraftWithSlots(counts) {
  const draft = createRefrigeratorDraft();
  const rowId = draft.rows[0].id;
  return { ...draft, rows: draft.rows.map(row => row.id !== rowId ? row : {
    // 여닫이·서랍형을 섞어도 본체 연결과 입력 보존이 같게 동작하는지 확인한다.
    ...row, doors: counts.map((_, index) => ({
      ...row.doors[0], id: `test-door-${index}`, kind: index > 0 && index < counts.length - 1 ? 'DRAWER' : 'HINGED',
      side: index === counts.length - 1 && index > 0 ? 'RIGHT_DOOR' : 'LEFT_DOOR',
    })),
    compartments: counts.map((_, bodyIndex) => ({
      ...row.compartments[0], id: `test-body-${bodyIndex}`, doorIds: [`test-door-${bodyIndex}`], storageMode: 'FROZEN',
      slots: Array.from({ length: counts[bodyIndex] }, (_, slotIndex) => ({
        name: `${bodyIndex + 1}번 본체 ${slotIndex + 1}번 칸`, drawerCount: (bodyIndex + slotIndex) % 3,
      })),
    })),
  }) };
}

test('각 단의 문은 1~2개만 설정할 수 있고 한도에서 초안을 변경하지 않는다', () => {
  const original = createRefrigeratorDraft();
  const rowId = original.rows[0].id;
  const twoDoors = changeDraftDoorCount(original, rowId, 1);
  assert.equal(twoDoors.rows[0].doors.length, 2);
  assert.equal(twoDoors.rows[0].compartments.length, 2);
  assert.strictEqual(changeDraftDoorCount(twoDoors, rowId, 1), twoDoors);
  const oneDoor = changeDraftDoorCount(twoDoors, rowId, -1);
  assert.equal(oneDoor.rows[0].doors.length, 1);
  assert.strictEqual(changeDraftDoorCount(oneDoor, rowId, -1), oneDoor);
  assert.strictEqual(twoDoors.rows[1], original.rows[1]);
});

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
  for (const counts of [[2, 2], [1, 1, 1], [2, 1, 1]]) {
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

test('본체 합치기는 합산 4칸까지 허용하고 5칸부터는 기존 입력을 유지한다', () => {
  for (const counts of [[1, 3], [2, 2], [3, 1], [1, 4], [2, 3], [3, 2], [4, 1]]) {
    const draft = createDraftWithSlots(counts);
    const snapshot = structuredClone(draft);
    const row = draft.rows[0];
    const merged = mergeDraftCompartments(draft, row.id, row.compartments[0].id);
    if (counts[0] + counts[1] === 4) {
      assert.equal(merged.rows[0].compartments.length, 1);
      assert.deepEqual(merged.rows[0].compartments[0].slots, row.compartments.flatMap(body => body.slots));
    } else assert.deepEqual(merged, snapshot);
    assert.deepEqual(draft, snapshot);
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

test('문 방향과 관계없이 오른쪽 이웃 본체와 맞닿는다', () => {
  const cases = [
    ['LEFT_DOOR', 'LEFT_DOOR'], ['LEFT_DOOR', 'RIGHT_DOOR'], ['LEFT_DOOR', 'DRAWER'],
    ['RIGHT_DOOR', 'LEFT_DOOR'], ['RIGHT_DOOR', 'RIGHT_DOOR'], ['RIGHT_DOOR', 'DRAWER'],
    ['DRAWER', 'LEFT_DOOR'], ['DRAWER', 'RIGHT_DOOR'], ['DRAWER', 'DRAWER'],
  ];
  for (const [leftOpening, rightOpening] of cases) {
    let draft = createDraftWithSlots([1, 1]);
    const rowId = draft.rows[0].id;
    const [leftDoor, rightDoor] = draft.rows[0].doors;
    const [leftBody, rightBody] = draft.rows[0].compartments;
    draft = setDraftDoorOpening(draft, rowId, leftDoor.id, leftOpening);
    draft = setDraftDoorOpening(draft, rowId, rightDoor.id, rightOpening);
    assert.equal(getAdjacentRightCompartment(draft.rows[0], leftBody.id)?.id, rightBody.id);
    const merged = mergeDraftCompartments(draft, rowId, leftBody.id);
    assert.equal(merged.rows[0].compartments.length, 1);
  }
});

test('문 수납 사용 여부는 본체 라인과 합치기에 영향을 주지 않는다', () => {
  let draft = createDraftWithSlots([1, 1]);
  const rowId = draft.rows[0].id;
  const bodyId = draft.rows[0].compartments[0].id;
  const doorId = draft.rows[0].doors[1].id;
  draft = setDraftDoorOpening(draft, rowId, doorId, 'LEFT_DOOR');
  draft = { ...draft, rows: draft.rows.map(row => row.id !== rowId ? row : {
    ...row, doors: row.doors.map(door => door.id === doorId ? { ...door, storageEnabled: false } : door),
  }) };
  assert.equal(getAdjacentRightCompartment(draft.rows[0], bodyId)?.id, draft.rows[0].compartments[1].id);
  assert.equal(mergeDraftCompartments(draft, rowId, bodyId).rows[0].compartments.length, 1);
});

test('공용 본체도 오른쪽 이웃만 합칠 수 있고 없는 본체는 변경하지 않는다', () => {
  let draft = createDraftWithSlots([1, 1, 1]);
  const rowId = draft.rows[0].id;
  const bodyId = draft.rows[0].compartments[0].id;
  const middleDoorId = draft.rows[0].doors[1].id;
  draft = setDraftDoorOpening(draft, rowId, middleDoorId, 'RIGHT_DOOR');
  draft = mergeDraftCompartments(draft, rowId, bodyId);
  assert.equal(draft.rows[0].compartments.length, 2);
  assert.equal(getAdjacentRightCompartment(draft.rows[0], bodyId)?.id, draft.rows[0].compartments[1].id);
  assert.equal(getAdjacentRightCompartment(draft.rows[0], draft.rows[0].compartments[1].id), undefined);
  assert.equal(getAdjacentRightCompartment(draft.rows[0], 'missing'), undefined);
  assert.deepEqual(mergeDraftCompartments(draft, rowId, 'missing'), draft);
  assert.equal(mergeDraftCompartments(draft, rowId, bodyId).rows[0].compartments.length, 1);

  let rightShared = createDraftWithSlots([1, 1, 1]);
  const rightRowId = rightShared.rows[0].id;
  const firstBodyId = rightShared.rows[0].compartments[0].id;
  const secondBodyId = rightShared.rows[0].compartments[1].id;
  rightShared = setDraftDoorOpening(rightShared, rightRowId, rightShared.rows[0].doors[1].id, 'LEFT_DOOR');
  rightShared = mergeDraftCompartments(rightShared, rightRowId, secondBodyId);
  assert.equal(rightShared.rows[0].compartments.length, 2);
  assert.equal(getAdjacentRightCompartment(rightShared.rows[0], firstBodyId)?.id, secondBodyId);
  assert.equal(mergeDraftCompartments(rightShared, rightRowId, firstBodyId).rows[0].compartments.length, 1);
});

test('여는 방식을 바꿔도 닫힌 문과 본체의 폭·위치를 유지한다', () => {
  let draft = createRefrigeratorDraft();
  const rowId = draft.rows[0].id;
  draft = changeDraftDoorCount(draft, rowId, 1);
  const geometry = getDraftRowGeometry(draft.rows[0]);
  assert.equal(geometry.width, 1);
  assert.deepEqual(geometry.groups.map(group => [group.left, group.width]), [[0, 0.5], [0.5, 0.5]]);
  assert.deepEqual(geometry.groups.flatMap(group => group.doors.map(door => [door.left, door.width])), [[0, 0.5], [0.5, 0.5]]);
  draft = setDraftDoorOpening(draft, rowId, draft.rows[0].doors[0].id, 'DRAWER');
  const changed = getDraftRowGeometry(draft.rows[0]);
  assert.deepEqual(changed.groups.map(group => [group.left, group.width]), geometry.groups.map(group => [group.left, group.width]));
  assert.equal(changed.groups[0].doors[0].door.kind, 'DRAWER');
  assert.equal(changed.groups[0].doors[0].left, 0);
  assert.equal(changed.groups[0].doors[0].width, 0.5);
});

test('129개 문 방향·본체 연결 조합에서 닫힌 문이 연결된 본체를 정확히 덮는다', () => {
  let cases = 0;
  const openings = ['LEFT_DOOR', 'RIGHT_DOOR', 'DRAWER'];
  const partitions = [[1], [1, 1], [2], [1, 1, 1], [1, 2], [2, 1], [3]];
  const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-8, `${actual} !== ${expected}`);
  for (const partition of partitions) {
    const count = partition.reduce((sum, value) => sum + value, 0);
    const seed = createDraftWithSlots(Array(count).fill(1)).rows[0];
    for (let code = 0; code < 3 ** count; code++) {
      const doors = seed.doors.map((door, index) => {
        const opening = openings[Math.floor(code / 3 ** index) % 3];
        return { ...door, kind: opening === 'DRAWER' ? 'DRAWER' : 'HINGED',
          side: opening === 'DRAWER' ? door.side : opening };
      });
      let offset = 0;
      const compartments = partition.map(size => {
        const body = { ...seed.compartments[offset], doorIds: doors.slice(offset, offset + size).map(door => door.id) };
        offset += size;
        return body;
      });
      const row = { ...seed, doors, compartments };
      const snapshot = structuredClone(row);
      const geometry = getDraftRowGeometry(row);
      assert.equal(geometry.width, 1);
      let bodyEnd = 0;
      for (const group of geometry.groups) {
        near(group.left, bodyEnd);
        near(group.width, group.body.doorIds.length / count);
        let doorEnd = group.left;
        for (const placement of group.doors) {
          near(placement.left, doorEnd);
          near(placement.width, 1 / count);
          assert(group.body.doorIds.includes(placement.door.id));
          doorEnd = placement.left + placement.width;
        }
        near(doorEnd, group.left + group.width);
        bodyEnd = group.left + group.width;
      }
      near(bodyEnd, 1);
      assert.deepEqual(row, snapshot);
      cases++;
    }
  }
  assert.equal(cases, 129);
});

test('2문 본체와 1문 본체의 양끝이 같은 라인에 정렬된다', () => {
  let draft = createRefrigeratorDraft();
  draft = changeDraftDoorCount(draft, draft.rows[0].id, 1);
  const rows = draft.rows.map(getDraftRowGeometry);
  for (const row of rows) {
    assert.equal(row.groups[0].left, 0);
    const last = row.groups[row.groups.length - 1];
    assert.equal(last.left + last.width, 1);
  }
  assert.deepEqual(rows[0].groups.map(group => group.left), [0, 0.5]);
  assert.deepEqual(rows[1].groups.map(group => group.left), [0]);
});
