/**
 * @file
 * 닫힌 도면의 문·본체 정렬과 합치기·분리 시 기본 칸 초기화·자동 위치명을 검사한다.
 * 화면·DB를 거치지 않고 실제 초안 변경 함수의 동작을 확인한다.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  changeDraftDoorCount, createRefrigeratorDraft, getAdjacentCompartment, getDraftLayout, getDraftRowGeometry, getPositionName, getPositionPath,
  mergeDraftCompartments, setDraftDoorOpening, splitDraftCompartment,
} = require('../src/features/fridge/model/fridgeLayout.ts');

/** 문 생성 제한과 독립된 기존 초안으로 이전 3문 배치의 합치기·분리도 검사한다. */
function createDraftWithSlots(counts) {
  const draft = createRefrigeratorDraft();
  const rowId = draft.rows[0].id;
  return { ...draft, rows: draft.rows.map(row => row.id !== rowId ? row : {
    // 여닫이·서랍형을 섞어도 본체 연결과 기본 칸 초기화가 같게 동작하는지 확인한다.
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
    assert.equal(draft.rows[0].compartments[0].slots.length, 1);
    draft = splitDraftCompartment(draft, rowId, bodyId);
    assert.deepEqual(draft.rows[0].compartments.map(body => body.slots.length), [1, 1]);
  }
});

test('여러 본체의 칸을 기본값으로 초기화하고 문 설정·식별자·보관 모드를 보존한다', () => {
  for (const counts of [[2, 2], [1, 1, 1], [2, 1, 1]]) {
    const original = createDraftWithSlots(counts);
    const snapshot = structuredClone(original);
    const rowId = original.rows[0].id;
    const bodyId = original.rows[0].compartments[0].id;
    const expectedDoorIds = original.rows[0].doors.map(door => door.id);
    let draft = original;
    for (let cycle = 0; cycle < 10; cycle++) {
      for (let remaining = counts.length; remaining > 1; remaining--) {
        draft = mergeDraftCompartments(draft, rowId, bodyId);
        assert.equal(draft.rows[0].compartments.length, remaining - 1);
      }
      assert.deepEqual(draft.rows[0].compartments[0].slots, [{ name: '위에서 1번째 칸', drawerCount: 0 }]);
      draft = splitDraftCompartment(draft, rowId, bodyId);
      const bodies = draft.rows[0].compartments;
      assert.equal(bodies.length, counts.length);
      assert(bodies.every(body => body.slots.length === 1 && body.slots[0].drawerCount === 0));
      assert.deepEqual(bodies.flatMap(body => body.doorIds), expectedDoorIds);
      assert(bodies.every(body => body.slots.length >= 1 && body.storageMode === 'FROZEN'));
      assert.equal(bodies[0].id, bodyId);
      assert.equal(new Set(bodies.map(body => body.id)).size, bodies.length);
      draft.rows[0].doors.forEach((door, index) => {
        assert.equal(door.id, original.rows[0].doors[index].id);
        assert.equal(door.storageEnabled, original.rows[0].doors[index].storageEnabled);
        assert.deepEqual(door.slots, original.rows[0].doors[index].slots);
      });
      assert.strictEqual(draft.rows[1], original.rows[1]);
    }
    assert.deepEqual(original, snapshot);
  }
});

test('본체 합치기는 양쪽 칸 수와 관계없이 기본 1칸·분할 없음으로 초기화한다', () => {
  for (const counts of [[1, 1], [1, 3], [2, 2], [3, 1], [1, 4], [2, 3], [3, 2], [4, 1], [4, 4]]) {
    const draft = createDraftWithSlots(counts);
    const snapshot = structuredClone(draft);
    const row = draft.rows[0];
    for (const body of row.compartments) {
      const merged = mergeDraftCompartments(draft, row.id, body.id);
      assert.equal(merged.rows[0].compartments.length, 1);
      assert.equal(merged.rows[0].compartments[0].id, body.id);
      assert.deepEqual(merged.rows[0].compartments[0].slots, [{ name: '위에서 1번째 칸', drawerCount: 0 }]);
      assert.deepEqual(merged.rows[0].doors.map(door => door.slots), row.doors.map(door => door.slots));
    }
    assert.deepEqual(draft, snapshot);
  }
});

test('공용 본체의 칸 수·분할과 관계없이 분리한 본체마다 기본 한 칸으로 초기화한다', () => {
  for (const doorCount of [2, 3]) {
    for (const slotCount of [1, 2, 3, 4]) {
      let draft = createDraftWithSlots(Array(doorCount).fill(4));
      const rowId = draft.rows[0].id;
      const bodyId = draft.rows[0].compartments[0].id;
      while (draft.rows[0].compartments.length > 1) draft = mergeDraftCompartments(draft, rowId, bodyId);
      draft.rows[0].compartments[0].slots = Array.from({ length: slotCount }, (_, index) => ({ name: '기존 칸 ' + index, drawerCount: 2 }));
      const snapshot = structuredClone(draft);
      for (const [index, door] of draft.rows[0].doors.entries()) {
        const split = splitDraftCompartment(draft, rowId, bodyId, door.id);
        assert.equal(split.rows[0].compartments.length, doorCount);
        assert.equal(split.rows[0].compartments[index].id, bodyId);
        assert.equal(new Set(split.rows[0].compartments.map(body => body.id)).size, doorCount);
        for (const body of split.rows[0].compartments) {
          assert.deepEqual(body.slots, [{ name: '위에서 1번째 칸', drawerCount: 0 }]);
          assert.equal(body.storageMode, 'FROZEN');
        }
        assert.deepEqual(split.rows[0].doors, draft.rows[0].doors);
      }
      assert.deepEqual(draft, snapshot);
    }
  }
});

test('기존 여는 방식과 관계없이 오른쪽 본체와 합치면 문을 본체 양쪽에 배치한다', () => {
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
    const snapshot = structuredClone(draft);
    assert.equal(getAdjacentCompartment(draft.rows[0], leftBody.id)?.id, rightBody.id);
    const merged = mergeDraftCompartments(draft, rowId, leftBody.id);
    assert.equal(merged.rows[0].compartments.length, 1);
    assert.deepEqual(merged.rows[0].doors, [
      { ...draft.rows[0].doors[0], kind: 'HINGED', side: 'LEFT_DOOR' },
      { ...draft.rows[0].doors[1], kind: 'HINGED', side: 'RIGHT_DOOR' },
    ]);
    assert.strictEqual(merged.rows[1], draft.rows[1]);
    assert.deepEqual(draft, snapshot);
    const split = splitDraftCompartment(merged, rowId, leftBody.id);
    assert.deepEqual(split.rows[0].doors, merged.rows[0].doors);
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
  assert.equal(getAdjacentCompartment(draft.rows[0], bodyId)?.id, draft.rows[0].compartments[1].id);
  const merged = mergeDraftCompartments(draft, rowId, bodyId);
  assert.equal(merged.rows[0].compartments.length, 1);
  assert.equal(merged.rows[0].doors[1].storageEnabled, false);
  assert.deepEqual(merged.rows[0].doors[1].slots, draft.rows[0].doors[1].slots);
});

test('이웃은 오른쪽을 우선하고 오른쪽이 없으면 왼쪽을 찾으며 없는 본체는 변경하지 않는다', () => {
  let draft = createDraftWithSlots([1, 1, 1]);
  const rowId = draft.rows[0].id;
  const bodyId = draft.rows[0].compartments[0].id;
  const middleDoorId = draft.rows[0].doors[1].id;
  draft = setDraftDoorOpening(draft, rowId, middleDoorId, 'RIGHT_DOOR');
  draft = mergeDraftCompartments(draft, rowId, bodyId);
  assert.equal(draft.rows[0].compartments.length, 2);
  assert.equal(getAdjacentCompartment(draft.rows[0], bodyId)?.id, draft.rows[0].compartments[1].id);
  assert.equal(getAdjacentCompartment(draft.rows[0], draft.rows[0].compartments[1].id)?.id, bodyId);
  assert.equal(getAdjacentCompartment(draft.rows[0], 'missing'), undefined);
  assert.deepEqual(mergeDraftCompartments(draft, rowId, 'missing'), draft);
  assert.equal(mergeDraftCompartments(draft, rowId, bodyId).rows[0].compartments.length, 1);

  let rightShared = createDraftWithSlots([1, 1, 1]);
  const rightRowId = rightShared.rows[0].id;
  const firstBodyId = rightShared.rows[0].compartments[0].id;
  const secondBodyId = rightShared.rows[0].compartments[1].id;
  rightShared = setDraftDoorOpening(rightShared, rightRowId, rightShared.rows[0].doors[1].id, 'LEFT_DOOR');
  rightShared = mergeDraftCompartments(rightShared, rightRowId, secondBodyId);
  assert.equal(rightShared.rows[0].compartments.length, 2);
  assert.equal(getAdjacentCompartment(rightShared.rows[0], firstBodyId)?.id, secondBodyId);
  assert.equal(mergeDraftCompartments(rightShared, rightRowId, firstBodyId).rows[0].compartments.length, 1);
});

test('양쪽 본체에서 합쳐도 선택한 식별자·문 순서·보관 모드 정책을 유지한다', () => {
  for (const selectedIndex of [0, 1]) {
    for (const sameMode of [true, false]) {
      const draft = createDraftWithSlots([2, 2]);
      const row = draft.rows[0];
      if (!sameMode) row.compartments[1].storageMode = 'CHILLED';
      const snapshot = structuredClone(draft);
      const selected = row.compartments[selectedIndex];
      const merged = mergeDraftCompartments(draft, row.id, selected.id);
      const body = merged.rows[0].compartments[0];
      assert.equal(merged.rows[0].compartments.length, 1);
      assert.equal(body.id, selected.id);
      assert.deepEqual(body.slots, [{ name: '위에서 1번째 칸', drawerCount: 0 }]);
      assert.deepEqual(body.doorIds, row.doors.map(door => door.id));
      assert.equal(body.storageMode, sameMode ? 'FROZEN' : null);
      assert.deepEqual(merged.rows[0].doors.map(door => door.side), ['LEFT_DOOR', 'RIGHT_DOOR']);
      assert.equal(getAdjacentCompartment(merged.rows[0], body.id), undefined);
      assert.deepEqual(mergeDraftCompartments(merged, row.id, body.id), merged);
      assert.strictEqual(merged.rows[1], draft.rows[1]);
      const split = splitDraftCompartment(merged, row.id, body.id, row.doors[selectedIndex].id);
      assert.equal(split.rows[0].compartments[selectedIndex].id, selected.id);
      assert(split.rows[0].compartments.every(body => body.slots.length === 1 && body.slots[0].drawerCount === 0));
      assert.deepEqual(draft, snapshot);
    }
  }
});

test('오른쪽에서 합친 본체를 분리해도 기본 칸을 만들고 복귀 식별자를 유지한다', () => {
  let draft = createDraftWithSlots([1, 1]);
  const row = draft.rows[0];
  const selected = row.compartments[1];
  draft = mergeDraftCompartments(draft, row.id, selected.id);
  const retainedSlot = { name: '유지할 칸', drawerCount: 2 };
  draft.rows[0].compartments[0].slots = [retainedSlot];
  const split = splitDraftCompartment(draft, row.id, selected.id, row.doors[1].id);
  assert.deepEqual(split.rows[0].compartments[0].slots, [{ name: '위에서 1번째 칸', drawerCount: 0 }]);
  assert.equal(split.rows[0].compartments[1].id, selected.id);
  assert.deepEqual(split.rows[0].compartments[1].slots, [{ name: '위에서 1번째 칸', drawerCount: 0 }]);
  assert.equal(new Set(split.rows[0].compartments.map(body => body.id)).size, 2);
});

test('기존 칸 이름과 관계없이 위에서부터 위치명을 만들고 좌우 선택 위치를 구분한다', () => {
  const draft = createDraftWithSlots([2, 1]);
  const row = draft.rows[0];
  row.compartments[0].slots[0].drawerCount = 2;
  row.doors[0].slots = ['위칸', '아래칸', '3번째 칸'].map(name => ({ name, drawerCount: 0 }));
  const snapshot = structuredClone(draft);
  const layout = getDraftLayout(draft);
  const bodyPositions = layout.positions.filter(position => position.areaId === row.compartments[0].id);
  const pocketPositions = layout.positions.filter(position => position.areaId === row.doors[0].id);
  assert.deepEqual(bodyPositions.map(getPositionName), [
    '위에서 1번째 칸 · 왼쪽', '위에서 1번째 칸 · 오른쪽', '위에서 2번째 칸',
  ]);
  assert.deepEqual(pocketPositions.map(position => position.name), ['위에서 1번째 칸', '위에서 2번째 칸', '위에서 3번째 칸']);
  assert.equal(bodyPositions[0].slotId, bodyPositions[1].slotId);
  assert.notEqual(bodyPositions[0].id, bodyPositions[1].id);
  const pocket = layout.areas.find(area => area.id === row.doors[0].id);
  assert.equal(getPositionPath(pocket, pocketPositions[1]), '1단 1번째 → 왼쪽 문 도어포켓 → 위에서 2번째 칸');
  assert.deepEqual(draft, snapshot);
});

test('어느 본체에서 합치고 분리해도 자동 위치명을 현재 영역의 순서로 다시 지정한다', () => {
  for (const selectedIndex of [0, 1]) {
    const draft = createDraftWithSlots([2, 2]);
    const row = draft.rows[0];
    const selected = row.compartments[selectedIndex];
    const merged = mergeDraftCompartments(draft, row.id, selected.id);
    assert.deepEqual(merged.rows[0].compartments[0].slots.map(slot => slot.name), [
      '위에서 1번째 칸',
    ]);
    const split = splitDraftCompartment(merged, row.id, selected.id, row.doors[selectedIndex].id);
    for (const body of split.rows[0].compartments) {
      assert.deepEqual(body.slots.map(slot => slot.name), ['위에서 1번째 칸']);
    }
  }
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
