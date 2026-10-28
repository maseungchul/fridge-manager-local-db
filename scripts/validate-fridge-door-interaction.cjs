/**
 * @file
 * 실제 등록 도면 컴포넌트의 문 전환 상태·선택 대상·접근성 경계를 검사한다.
 * 훅과 애니메이션 완료 신호만 대체하며, 네이티브 화면의 움직임·터치 감각은 별도 확인한다.
 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const model = require('../src/features/fridge/model/fridgeLayout.ts');
const tokens = require('../src/theme/tokens.ts');

let current;
const animations = [];
const hooks = {
  useState(initial) {
    const index = current.cursor++;
    const slot = current.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
  },
  useRef(initial) { return hooks.useState(() => ({ current: initial }))[0]; },
  useCallback(callback, dependencies) {
    const index = current.cursor++;
    const previous = current.slots[index];
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
      current.slots[index] = { value: callback, dependencies };
    }
    return current.slots[index].value;
  },
  useEffect(effect, dependencies) {
    const instance = current;
    const index = instance.cursor++;
    const previous = instance.slots[index];
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
      instance.pending.push(() => {
        previous?.cleanup?.();
        instance.slots[index] = { dependencies, cleanup: effect() };
      });
    }
  },
};

/** 재렌더링과 effect 정리만 재현하고, 상태 변경은 실제 컴포넌트의 이벤트로 실행한다. */
function mount(Component, props) {
  const instance = {
    slots: [], cursor: 0, pending: [], tree: null, props,
    render() {
      current = instance;
      instance.cursor = 0;
      instance.tree = Component(instance.props);
      current = undefined;
      instance.pending.splice(0).forEach(effect => effect());
      return instance.tree;
    },
    unmount() { instance.slots.forEach(slot => slot.cleanup?.()); },
  };
  instance.render();
  return instance;
}

class AnimatedValue {
  constructor(value) { this.value = value; }
  interpolate(config) { return { value: this, ...config }; }
  setValue(value) { this.value = value; }
  stopAnimation() {}
}
const native = {
  View: 'View', Pressable: 'Pressable', Text: 'Text', ScrollView: 'ScrollView', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView',
  Keyboard: { dismiss() {} }, Platform: { OS: 'ios' },
  useWindowDimensions: () => ({ width: 375, height: 844 }),
  StyleSheet: { create: value => value, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } },
  useAnimatedValue: initial => hooks.useState(() => new AnimatedValue(initial))[0],
  Easing: { cubic: value => value ** 3, inOut: easing => easing },
  Animated: {
    Value: AnimatedValue,
    View: 'Animated.View',
    timing(value, config) {
      const animation = {
        value, config,
        start(callback) { this.callback = callback; },
        stop() { this.callback?.({ finished: false }); },
        finish(finished = true) {
          if (finished) value.value = config.toValue;
          this.callback?.({ finished });
        },
      };
      animations.push(animation);
      return animation;
    },
  },
};
let mapModule;
let interiorModule;
function loadComponent(path) {
  const source = readFileSync(resolve(__dirname, '..', path), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  const dependencies = {
    react: hooks, 'react-native': native,
    '@react-native-vector-icons/material-design-icons': { MaterialDesignIcons: 'Icon' },
    '@/components/SecondaryButton': { SecondaryButton: 'SecondaryButton' },
    '@/components/PrimaryButton': { PrimaryButton: 'PrimaryButton' },
    '@/components/SelectionCheck': { SelectionCheck: 'SelectionCheck' },
    '@/components/FormTextInput': { FormTextInput: 'FormTextInput' },
    '@/components/FeedbackPressable': { FeedbackPressable: 'FeedbackPressable' },
    '@/features/fridge/model/fridgeLayout': model, '../model/fridgeLayout': model,
    '@/features/fridge/components/FridgeMap': mapModule, '@/theme/tokens': tokens,
    '@/features/fridge/components/FridgeInteriorMap': interiorModule,
    '@/features/fridge/components/FridgeAreaMenu': { FridgeAreaMenu: 'FridgeAreaMenu' },
    '@/features/fridge/components/FridgeStructurePreview': { FridgeStructurePreview: 'FridgeStructurePreview' },
    '@/features/fridge/components/SlotStructureSelector': { SlotStructureSelector: 'SlotStructureSelector' },
    '@react-navigation/native': { usePreventRemove() {} },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }) },
  };
  new Function('require', 'module', 'exports', output)(name => name in dependencies ? dependencies[name] : require(name), module, module.exports);
  return module.exports;
}
mapModule = loadComponent('src/features/fridge/components/FridgeMap.tsx');
interiorModule = loadComponent('src/features/fridge/components/FridgeInteriorMap.tsx');
const { FridgeInteriorMap, FridgeFocusView, getFridgeFocusGeometry } = interiorModule;
const { RefrigeratorRegistrationScreen } = loadComponent('src/screens/RefrigeratorRegistrationScreen.tsx');
const { FridgeAreaMenu } = loadComponent('src/features/fridge/components/FridgeAreaMenu.tsx');
const children = node => [node?.props?.children].flat(Infinity).filter(child => child?.type);
const flattenStyle = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of children(node)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}
const named = name => node => node?.type?.name === name;
const doors = instance => children(instance.tree).filter(named('FridgeDoor'));
const interior = instance => find(instance.tree, named('InteriorArea'));
function fixture(draft = model.createRefrigeratorDraft(), groupIndex = 0, scrollY = 0) {
  const selected = [];
  const requests = [];
  let compartment;
  const props = { draft, onSelectArea(id) {
    selected.push(id);
    compartment.props = { ...compartment.props, selectedAreaId: id };
  }, onFocus(target) {
    requests.push(target);
    props.onSelectArea(target.areaId);
    compartment.props = { ...compartment.props, focus: target };
  } };
  const map = mount(FridgeInteriorMap, props);
  map.tree.props.onLayout({ nativeEvent: { layout: { width: 327 } } });
  map.render();
  const groups = children(children(map.tree)[0]).filter(named('FridgeCompartment'));
  const element = groups[groupIndex];
  compartment = mount(element.type, element.props);
  compartment.tree.props.ref.current = { measureInWindow(callback) {
    const { group, top, width, height } = compartment.props;
    callback(24 + (327 - width) / 2 + group.left * width, 210 - scrollY + top, group.width * width, height);
  } };
  return { draft, selected, requests, map, compartment };
}
function findAll(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...children(node).flatMap(child => findAll(child, predicate))];
}
function selectDoor(instance, index = 0) {
  doors(instance)[index].props.onSelect();
  instance.render();
}
function focusedFixture(draft, target, viewport = { x: 0, y: 120, width: 375, height: 600 }) {
  const phases = [];
  const selected = [];
  let focus;
  const props = { draft, target, viewport, phase: 'opening', selectedAreaId: target.areaId,
    onSelectArea(id) { selected.push(id); focus.props = { ...focus.props, selectedAreaId: id }; },
    onPhaseChange(phase) { phases.push(phase); focus.props = { ...focus.props, phase }; },
    onClose() { if (focus.props.phase === 'open') focus.props = { ...focus.props, phase: 'closing' }; },
  };
  focus = mount(FridgeFocusView, props);
  return { focus, phases, selected };
}
function registrationFixture(doorCount = 1, rowCount = 2) {
  const screen = mount(RefrigeratorRegistrationScreen, { navigation: { goBack() {}, dispatch() {} } });
  if (rowCount === 1) {
    find(screen.tree, node => node.props.accessibilityLabel === '2단 삭제').props.onPress();
    screen.render();
  }
  if (doorCount === 2) {
    find(screen.tree, node => node.props.accessibilityLabel === '1단 문 늘리기').props.onPress();
    screen.render();
  }
  find(screen.tree, node => node.type === 'PrimaryButton' && node.props.label === '다음').props.onPress();
  animations.at(-1).finish();
  screen.render();
  const viewport = find(screen.tree, node => node.type === 'View' && node.props.ref && node.props.onLayout);
  const map = find(screen.tree, named('FridgeInteriorMap'));
  const row = map.props.draft.rows[0];
  const target = { areaId: row.compartments[0].id, returnAreaId: row.doors[0].id,
    canvas: { x: 24, y: 210, width: 327, height: 540 } };
  return { screen, viewport, map, row, target };
}
const moving = focus => find(focus.tree, node => typeof node.props?.onStartShouldSetResponder === 'function');
const movingDoors = focus => findAll(moving(focus), named('FridgeDoor'));
const interiorAreas = focus => findAll(moving(focus), named('InteriorArea'));
function assertFocusAccess(focus, phase) {
  const backdrop = children(focus.tree)[0];
  assert.equal(backdrop.props.pointerEvents, phase === 'open' ? 'auto' : 'none');
  assert.equal(backdrop.props.accessibilityElementsHidden, phase !== 'open');
  const outside = find(backdrop, node => node.type === 'Pressable');
  assert.equal(outside.props.disabled, phase !== 'open');
  assert.equal(outside.props.accessibilityState.disabled, phase !== 'open');
  const horizontalScroll = find(focus.tree, node => node.type === 'ScrollView' && node.props.horizontal);
  assert.equal(moving(focus).props.onStartShouldSetResponder(), !horizontalScroll);
  if (phase !== 'open') assert.equal(horizontalScroll, undefined);
  const hinges = find(moving(focus), node => children(node).some(named('DoorHinges')));
  if (hinges) {
    assert.equal(flattenStyle(hinges.props.style).opacity, phase === 'open' ? 1 : 0);
    assert.equal(hinges.props.pointerEvents, 'none');
    assert.equal(hinges.props.importantForAccessibility, 'no-hide-descendants');
  }
  const layers = findAll(moving(focus), node => ['View', 'Animated.View'].includes(node.type) && children(node).some(named('InteriorArea')));
  assert(layers.length >= 1);
  const bodyContent = layers.find(layer => children(layer).some(node => named('InteriorArea')(node) && node.props.area.isBody));
  const bodyPanel = find(moving(focus), node => children(node).includes(bodyContent));
  const bodyFrame = children(bodyPanel)[0];
  assert.notStrictEqual(bodyFrame, bodyContent);
  assert.equal(flattenStyle(bodyFrame.props.style).borderWidth, tokens.fridgeSurfaces.frameWidth);
  assert.equal(flattenStyle(bodyFrame.props.style).borderColor, '#FFFFFF');
  assert(flattenStyle(bodyFrame.props.style).backgroundColor);
  const frameMode = focus.props.draft.rows.flatMap(row => row.compartments)
    .find(body => body.id === focus.props.target.areaId)?.storageMode;
  assert.equal(flattenStyle(bodyFrame.props.style).backgroundColor, '#FFFFFF');
  assert.equal(flattenStyle(children(bodyFrame)[0].props.style).backgroundColor,
    frameMode ? tokens.fridgeDoorColors[frameMode].frame : tokens.fridgeSurfaces.frame);
  if (frameMode) assert.equal(flattenStyle(bodyFrame.props.style).boxShadow[0].color, tokens.fridgeDoorColors[frameMode].motif + '14');
  assert.equal(flattenStyle(bodyFrame.props.style).opacity ?? 1, 1);
  assert.equal(flattenStyle(bodyPanel.props.style).opacity ?? 1, 1);
  assert.equal(bodyFrame.props.pointerEvents, 'none');
  assert.equal(bodyFrame.props.importantForAccessibility, 'no-hide-descendants');
  for (const layer of layers) {
    assert.equal(flattenStyle(layer.props.style).opacity, phase === 'open' ? 1 : 0);
    assert.equal(layer.props.pointerEvents, phase === 'open' ? 'auto' : 'none');
    assert.equal(layer.props.accessibilityElementsHidden, phase !== 'open');
    assert.equal(layer.props.importantForAccessibility, phase === 'open' ? 'auto' : 'no-hide-descendants');
  }
  for (const door of movingDoors(focus)) {
    assert.equal(door.props.phase, phase);
    const faces = children(door.type(door.props));
    assert.equal(faces[0].props.pointerEvents, phase === 'closed' ? 'auto' : 'none');
    if (faces[1]) {
      assert.equal(faces[1].props.pointerEvents, phase === 'open' ? 'auto' : 'none');
      assert.equal(faces[1].props.accessibilityElementsHidden, phase !== 'open');
      const content = find(faces[1], node => children(node).some(named('InteriorArea')));
      assert.equal(flattenStyle(content.props.style).opacity, phase === 'open' ? 1 : 0);
      assert.equal(content.props.pointerEvents, phase === 'open' ? 'auto' : 'none');
      assert.equal(content.props.accessibilityElementsHidden, phase !== 'open');
    }
  }
}
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-8, `${actual} !== ${expected}`);
const dimensionAt = (value, progress, parentSize = 0) => {
  if (value?.outputRange) return value.outputRange[0] + (value.outputRange[1] - value.outputRange[0]) * progress;
  return typeof value === 'string' && value.endsWith('%') ? parseFloat(value) / 100 * parentSize : value;
};

test('닫힌 도면은 단 사이에 4px 여백을 두고 모든 문과 외곽을 직각으로 표시한다', () => {
  for (const count of [1, 2, 3, 4]) {
    let draft = model.createRefrigeratorDraft();
    while (draft.rows.length > count) draft = model.removeDraftRow(draft, draft.rows.at(-1).id);
    while (draft.rows.length < count) draft = model.addDraftRow(draft);
    for (const [index, row] of draft.rows.entries()) {
      if (index % 2 === 0) draft = model.changeDraftDoorCount(draft, row.id, 1);
    }
    const { map } = fixture(draft);
    const canvas = children(map.tree)[0];
    const canvasStyle = flattenStyle(canvas.props.style);
    assert.equal(canvasStyle.borderRadius, 0);
    assert.equal(canvasStyle.overflow, 'hidden');
    assert.equal(canvasStyle.borderWidth, undefined);
    assert.equal(canvasStyle.boxShadow, undefined);
    assert(children(canvas).every(named('FridgeCompartment')));
    const groups = children(canvas).filter(named('FridgeCompartment'));
    const rowHeight = (canvasStyle.height - 4 * (count - 1)) / count;
    for (let rowIndex = 0; rowIndex < count; rowIndex++) {
      let end = 0;
      for (const group of groups.filter(node => node.props.rowIndex === rowIndex)) {
        const component = mount(group.type, group.props);
        near(flattenStyle(component.tree.props.style).top, rowIndex * (rowHeight + 4));
        near(flattenStyle(component.tree.props.style).height, rowHeight);
        for (const door of doors(component)) {
          const tree = door.type(door.props);
          const face = flattenStyle(children(tree)[0].props.style);
          const surface = flattenStyle(find(tree, node => node.type === 'Pressable').props.style);
          assert.equal(face.top, 0);
          assert.equal(face.bottom, 0);
          assert.equal(surface.borderRadius, 0);
          assert.equal(surface.borderWidth, 1);
          const start = group.props.group.left * canvasStyle.width + door.props.style.left;
          near(start, end);
          assert.equal(surface.borderLeftWidth, start > 0 ? 0 : 1);
          end = start + door.props.style.width;
          assert.equal(surface.borderTopLeftRadius, 0);
          assert.equal(surface.borderTopRightRadius, 0);
          assert.equal(surface.borderBottomLeftRadius, 0);
          assert.equal(surface.borderBottomRightRadius, 0);
          const selection = find(door.type({ ...door.props, selected: true }), named('SelectionFrame'));
          const selectedStyle = flattenStyle(selection.type(selection.props).props.style);
          assert.equal(selectedStyle.borderTopLeftRadius, surface.borderTopLeftRadius);
          assert.equal(selectedStyle.borderBottomRightRadius, surface.borderBottomRightRadius);
        }
        const geometry = getFridgeFocusGeometry(draft, { areaId: group.props.group.body.id,
          returnAreaId: group.props.group.body.doorIds[0], canvas: { x: 10, y: 20, width: canvasStyle.width, height: canvasStyle.height } },
          { x: 0, y: 0, width: 375, height: 600 });
        near(geometry.source.y, 20 + rowIndex * (rowHeight + 4));
        near(geometry.source.height, rowHeight);
        near(geometry.source.width, group.props.group.width * canvasStyle.width);
        component.unmount();
      }
      near(end, canvasStyle.width);
    }
  }
});

test('문을 누르면 보기 버튼 없이 연결된 본체 전체의 화면 좌표를 전달한다', () => {
  const { draft, selected, requests, compartment } = fixture();
  const snapshot = structuredClone(draft);
  const door = doors(compartment)[0];
  const tree = door.type(door.props);
  assert.equal(find(tree, node => node.type === 'FeedbackPressable'), undefined);
  selectDoor(compartment);
  assert.deepEqual(requests[0], { areaId: draft.rows[0].compartments[0].id,
    returnAreaId: draft.rows[0].doors[0].id, canvas: { x: 52.5, y: 210, width: 270, height: 540 } });
  assert.equal(flattenStyle(compartment.tree.props.style).opacity, 0);
  assert.deepEqual(selected, [draft.rows[0].doors[0].id, draft.rows[0].compartments[0].id]);
  assert.deepEqual(draft, snapshot);
});

test('합친 본체는 어느 문을 눌러도 양쪽 외관을 선택 표시하고 내부 포켓은 개별 선택한다', () => {
  for (const clickedIndex of [0, 1]) {
    let draft = model.createRefrigeratorDraft();
    const rowId = draft.rows[0].id;
    draft = model.changeDraftDoorCount(draft, rowId, 1);
    draft = model.mergeDraftCompartments(draft, rowId, draft.rows[0].compartments[0].id);
    const { compartment, requests } = fixture(draft);
    const measure = compartment.tree.props.ref.current.measureInWindow;
    let finishMeasurement;
    compartment.tree.props.ref.current.measureInWindow = callback => { finishMeasurement = () => measure(callback); };
    selectDoor(compartment, clickedIndex);
    assert(doors(compartment).every(door => door.props.selected));
    finishMeasurement();
    const target = requests[0];
    assert.equal(target.returnAreaId, draft.rows[0].doors[clickedIndex].id);
    const { focus } = focusedFixture(draft, target);
    assert(movingDoors(focus).every(door => door.props.selected));
    animations.at(-1).finish();
    focus.render();
    const pocket = interiorAreas(focus).find(area => area.props.area.id === target.returnAreaId);
    pocket.props.onSelectArea(target.returnAreaId);
    focus.render();
    assert.deepEqual(interiorAreas(focus).filter(area => area.props.selected).map(area => area.props.area.id), [target.returnAreaId]);
    focus.props.onClose();
    focus.render();
    assert(movingDoors(focus).every(door => door.props.selected));
    animations.at(-1).finish();
    focus.render();
    compartment.props = { ...compartment.props, focus: null, selectedAreaId: target.returnAreaId };
    compartment.render();
    assert(doors(compartment).every(door => door.props.selected));
    const split = model.splitDraftCompartment(draft, rowId, target.areaId, target.returnAreaId);
    const groups = model.getDraftRowGeometry(split.rows[0]).groups;
    for (const group of groups) {
      compartment.props = { ...compartment.props, row: split.rows[0], group };
      compartment.render();
      assert.equal(doors(compartment)[0].props.selected, group.body.doorIds.includes(target.returnAreaId));
    }
    focus.unmount();
  }
});

test('본체와 포켓이 한 애니메이션으로 함께 펼쳐지고 완료 후 각각 조작할 수 있다', () => {
  const { draft, requests, compartment } = fixture();
  selectDoor(compartment);
  const before = animations.length;
  const { focus, phases } = focusedFixture(draft, requests[0]);
  assert.equal(animations.length, before + 1);
  const opening = animations.at(-1);
  assertFocusAccess(focus, 'opening');
  assert.equal(interiorAreas(focus).length, 2);
  const style = flattenStyle(moving(focus).props.style);
  const progress = style.transform[0].translateX.value;
  assert.equal(movingDoors(focus)[0].props.progress, progress);
  assert(style.transform.every(transform => Object.values(transform)[0].value === progress));
  opening.finish();
  focus.render();
  assertFocusAccess(focus, 'open');
  const close = find(children(focus.tree)[0], node => node.type === 'Pressable');
  assert.equal(close.props.accessibilityLabel, '냉장고 도면 바깥 영역 눌러 닫기');
  close.props.onPress();
  focus.render();
  assertFocusAccess(focus, 'closing');
  animations.at(-1).finish();
  focus.render();
  assert.deepEqual(phases, ['open', 'closed']);
  assertFocusAccess(focus, 'closed');
  focus.unmount();
});

test('중단된 전환은 완료로 처리하지 않고 본체·포켓 입력 차단을 유지한다', () => {
  const { draft, requests, compartment } = fixture();
  selectDoor(compartment);
  const { focus, phases } = focusedFixture(draft, requests[0]);
  animations.at(-1).finish(false);
  focus.render();
  assertFocusAccess(focus, 'opening');
  assert.deepEqual(phases, []);
  focus.unmount();
});

test('어느 문을 열어도 앞면·뒷면·본체·포켓·선택선이 직각 모서리를 유지한다', () => {
  const corners = style => {
    const value = flattenStyle(style);
    return ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']
      .map(key => value[key] ?? value.borderRadius ?? 0);
  };
  const mirrored = value => [value[1], value[0], value[3], value[2]];
  for (const count of [1, 2, 3, 4]) {
    for (const merged of [false, true]) {
      let draft = model.createRefrigeratorDraft();
      while (draft.rows.length > count) draft = model.removeDraftRow(draft, draft.rows.at(-1).id);
      while (draft.rows.length < count) draft = model.addDraftRow(draft);
      for (const [index, row] of [...draft.rows].entries()) {
        draft = model.changeDraftDoorCount(draft, row.id, 1);
        const current = draft.rows[index];
        current.compartments.forEach(body => { body.storageMode = index % 2 === 0 ? 'CHILLED' : 'FROZEN'; });
        current.doors[0].storageEnabled = index % 2 === 0;
        if (index % 2 === 1) draft = model.setDraftDoorOpening(draft, row.id, current.doors[1].id, 'DRAWER');
        if (merged) draft = model.mergeDraftCompartments(draft, row.id, current.compartments[0].id);
      }
      const groupCount = draft.rows.reduce((total, row) => total + row.compartments.length, 0);
      for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
        const doorCount = fixture(draft, groupIndex).compartment.props.group.doors.length;
        for (let clicked = 0; clicked < doorCount; clicked++) {
          const { compartment, requests } = fixture(draft, groupIndex);
          const original = new Map(doors(compartment).map(door => [door.props.door.id,
            corners(find(door.type(door.props), node => node.type === 'Pressable').props.style)]));
          const values = [...original.values()];
          const bodyCorners = [values[0][0], values.at(-1)[1], values[0][2], values.at(-1)[3]];
          selectDoor(compartment, clicked);
          const { focus } = focusedFixture(draft, requests[0]);
          const check = phase => {
            assertFocusAccess(focus, phase);
            for (const door of movingDoors(focus)) {
              const [front, back] = children(door.type(door.props));
              const expected = original.get(door.props.door.id);
              assert.equal(flattenStyle(front.props.style).overflow, 'hidden');
              assert.deepEqual(corners(front.props.style), expected);
              assert.deepEqual(corners(find(front, node => node.type === 'Pressable').props.style), expected);
              const selection = find(front, named('SelectionFrame'));
              const selectedStyle = flattenStyle(selection.type(selection.props).props.style);
              assert.deepEqual(corners(selectedStyle), expected);
              assert.equal(selectedStyle.borderWidth, 2);
              assert.deepEqual(selectedStyle.boxShadow, []);
              if (back) {
                assert.equal(flattenStyle(back.props.style).overflow, 'hidden');
                assert.deepEqual(corners(back.props.style), mirrored(expected));
                const backSurface = flattenStyle(children(back)[0].props.style);
                assert.deepEqual(corners(backSurface), mirrored(expected));
                assert.deepEqual(backSurface.boxShadow, []);
              }
            }
            const areas = interiorAreas(focus);
            const bodyArea = areas.find(area => area.props.area.isBody);
            const layer = find(focus.tree, node => children(node).includes(bodyArea));
            const panel = find(focus.tree, node => children(node).includes(layer));
            assert.deepEqual(corners(children(panel)[0].props.style), bodyCorners);
            for (const area of areas) {
              const expected = area.props.area.isBody ? bodyCorners : mirrored(original.get(area.props.area.id));
              const tree = area.type({ ...area.props, selected: true });
              const map = find(tree, node => node.type === mapModule.FridgeMap);
              if (map) {
                const frame = find(mapModule.FridgeMap(map.props), node => children(node).includes(map.props.areaHeader));
                assert.deepEqual(corners(frame.props.style), expected);
              } else {
                const empty = find(tree, named('DoorWithoutStorage'));
                const mounted = mount(empty.type, empty.props);
                assert.deepEqual(corners(mounted.tree.props.style), expected);
                mounted.unmount();
              }
              const selection = find(tree, named('SelectionFrame'));
              const selectedStyle = flattenStyle(selection.type(selection.props).props.style);
              assert.deepEqual(corners(selectedStyle), expected);
              assert(selectedStyle.boxShadow.length > 0, '열린 내부 선택 영역의 음영은 유지해야 한다');
            }
          };
          check('opening');
          animations.at(-1).finish();
          focus.render();
          check('open');
          focus.props.onClose();
          focus.render();
          check('closing');
          focus.unmount();
        }
      }
    }
  }
});

test('문을 열고 닫는 동안 닫힌 본체·문의 크기를 유지하고 내부 글자·배지를 확대하지 않는다', () => {
  for (const rows of [1, 4]) {
    for (const doorCount of [1, 2]) {
      for (const merged of doorCount === 2 ? [false, true] : [false]) {
        let draft = model.createRefrigeratorDraft();
        while (draft.rows.length > rows) draft = model.removeDraftRow(draft, draft.rows.at(-1).id);
        while (draft.rows.length < rows) draft = model.addDraftRow(draft);
        const rowId = draft.rows[0].id;
        if (doorCount === 2) draft = model.changeDraftDoorCount(draft, rowId, 1);
        if (merged) draft = model.mergeDraftCompartments(draft, rowId, draft.rows[0].compartments[0].id);
        const { compartment, requests } = fixture(draft);
        selectDoor(compartment);
        const viewport = { x: 0, y: 120, width: 375, height: 360 };
        const { focus } = focusedFixture(draft, requests[0], viewport);
        const geometry = getFridgeFocusGeometry(draft, requests[0], viewport);
        const panel = find(moving(focus), node => node.type === 'Animated.View' && flattenStyle(node.props.style).width?.outputRange);
        assert(panel, '본체 프레임의 실제 너비를 변경해야 한다');
        const panelStyle = flattenStyle(panel.props.style);
        const origin = flattenStyle(moving(focus).props.style);
        assert.equal(animations.at(-1).config.useNativeDriver, false);
        for (const node of findAll(moving(focus), node => ['View', 'Animated.View'].includes(node.type))) {
          assert(!(flattenStyle(node.props.style).transform ?? []).some(transform => 'scaleX' in transform || 'scaleY' in transform));
        }
        for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
          const width = dimensionAt(panelStyle.width, progress);
          const height = dimensionAt(panelStyle.height, progress);
          near(width, geometry.source.width + (geometry.body.width - geometry.source.width) * progress);
          near(height, geometry.source.height + (geometry.body.height - geometry.source.height) * progress);
          near(width, geometry.source.width);
          near(height, geometry.source.height);
          near(width / height, geometry.source.width / geometry.source.height);
          const centerX = origin.left + dimensionAt(origin.transform[0].translateX, progress)
            + dimensionAt(panelStyle.left, progress) + dimensionAt(panelStyle.transform[0].translateX, progress) + width / 2;
          const centerY = origin.top + dimensionAt(origin.transform[1].translateY, progress)
            + dimensionAt(panelStyle.top, progress) + dimensionAt(panelStyle.transform[1].translateY, progress) + height / 2;
          near(centerX, geometry.source.x - viewport.x + geometry.source.width / 2
            + (geometry.translateX + geometry.body.left + geometry.body.width / 2 - geometry.width / 2) * progress);
          near(centerY, geometry.source.y - viewport.y + geometry.source.height / 2 + geometry.translateY * progress);
          for (const door of movingDoors(focus)) {
            const doorStyle = flattenStyle(door.type(door.props).props.style);
            near(dimensionAt(doorStyle.width, progress, width), width / geometry.group.doors.length);
            near(dimensionAt(doorStyle.height, progress, height), height);
          }
        }
        for (const area of interiorAreas(focus)) {
          const style = flattenStyle(area.type(area.props).props.style);
          assert.equal(style.left, 0);
          assert.equal(style.right, 0);
          assert.equal(style.top, 0);
          assert.equal(style.bottom, 0);
        }
        animations.at(-1).finish();
        focus.render();
        focus.props.onClose();
        focus.render();
        assert.equal(animations.at(-1).config.toValue, 0);
        assertFocusAccess(focus, 'closing');
        focus.unmount();
      }
    }
  }
});

test('이동 중 표시 영역 높이가 바뀌어도 이전 이동값이 최종 중앙 위치를 밀지 않는다', () => {
  const { draft, requests, compartment } = fixture();
  selectDoor(compartment);
  const { focus } = focusedFixture(draft, requests[0]);
  const animation = animations.at(-1);
  const before = flattenStyle(moving(focus).props.style);
  const oldTranslateY = before.transform.find(transform => transform.translateY).translateY;
  assert.equal(oldTranslateY.outputRange[1], 0);
  focus.props = { ...focus.props, viewport: { ...focus.props.viewport, height: 520 } };
  focus.render();
  assert.equal(animations.at(-1), animation);
  const after = flattenStyle(moving(focus).props.style);
  near(after.top + after.height / 2 + oldTranslateY.outputRange[1], 260);
  assert.equal(after.transform.find(transform => transform.translateY).translateY.outputRange[1], 0);
  animation.finish();
  focus.render();
  const completed = flattenStyle(moving(focus).props.style);
  const scroller = find(focus.tree, node => node.type === 'ScrollView' && node.props.horizontal);
  const parentTop = scroller ? flattenStyle(scroller.props.style).top : 0;
  near(parentTop + completed.top + completed.height / 2, 260);
  focus.unmount();
});

test('합친 본체의 포켓을 기존 여는 방식과 관계없이 양쪽에 같은 크기로 배치하고 경첩으로 연결한다', () => {
  const openings = ['LEFT_DOOR', 'RIGHT_DOOR', 'DRAWER'];
  for (const pair of openings.flatMap(left => openings.map(right => [left, right]))) {
    let draft = model.createRefrigeratorDraft();
    const rowId = draft.rows[0].id;
    draft = model.changeDraftDoorCount(draft, rowId, 1);
    draft.rows[0].doors.forEach((door, index) => { draft = model.setDraftDoorOpening(draft, rowId, door.id, pair[index]); });
    draft = model.mergeDraftCompartments(draft, rowId, draft.rows[0].compartments[0].id);
    const { requests, compartment } = fixture(draft);
    selectDoor(compartment, 1);
    const viewport = { x: 0, y: 120, width: 375, height: 600 };
    const geometry = getFridgeFocusGeometry(draft, requests[0], viewport);
    assert.equal(geometry.pockets.length, 2);
    const { body } = geometry;
    for (const { door, frame } of geometry.pockets) {
      near(frame.width * geometry.group.doors.length, body.width);
      near(frame.height, body.height);
      if (door.side === 'LEFT_DOOR') assert(frame.left + frame.width < body.left);
      else assert(frame.left > body.left + body.width);
    }
    const [first, second] = geometry.pockets;
    assert.equal(first.door.id, draft.rows[0].doors[0].id);
    assert.equal(second.door.id, draft.rows[0].doors[1].id);
    near(first.frame.left + first.frame.width + 14, body.left);
    near(second.frame.left, body.left + body.width + 14);
    const { focus } = focusedFixture(draft, requests[0]);
    assert.equal(interiorAreas(focus).length, 3);
    assert.equal(movingDoors(focus).length, 2);
    const hinges = findAll(moving(focus), named('DoorHinges'));
    assert.equal(hinges.length, 2);
    for (const hinge of hinges) {
      const bars = findAll(hinge.type(hinge.props), named('DoorHinge')).map(pin => pin.type(pin.props));
      assert(bars.length >= 2);
      assert(bars.every(bar => flattenStyle(children(bar)[0].props.style).width <= 8));
    }
    focus.unmount();
  }
});

test('본체·포켓을 누르면 해당 영역의 선택 상태와 편집 대상을 전환한다', () => {
  const { draft, requests, compartment } = fixture();
  selectDoor(compartment);
  const { focus, selected } = focusedFixture(draft, requests[0]);
  animations.at(-1).finish();
  focus.render();
  let pocket = interiorAreas(focus).find(node => !node.props.area.isBody);
  const pocketMap = find(pocket.type(pocket.props), node => node.type === mapModule.FridgeMap);
  pocketMap.props.onSelectArea();
  focus.render();
  assert.equal(focus.props.selectedAreaId, draft.rows[0].doors[0].id);
  assert.equal(interiorAreas(focus).find(node => !node.props.area.isBody).props.selected, true);
  assert.equal(interiorAreas(focus).find(node => node.props.area.isBody).props.selected, false);
  const body = interiorAreas(focus).find(node => node.props.area.isBody);
  find(body.type(body.props), node => node.type === mapModule.FridgeMap).props.onSelectArea();
  focus.render();
  assert.equal(focus.props.selectedAreaId, draft.rows[0].compartments[0].id);
  assert.deepEqual(selected, [draft.rows[0].doors[0].id, draft.rows[0].compartments[0].id]);
  focus.unmount();
});

test('수납을 끈 문은 선택 가능한 포켓 자리로 남기고 서랍형은 포켓을 만들지 않는다', () => {
  let draft = model.createRefrigeratorDraft();
  const rowId = draft.rows[0].id;
  draft.rows[0].doors[0].storageEnabled = false;
  const off = fixture(draft);
  selectDoor(off.compartment);
  const { focus } = focusedFixture(draft, off.requests[0]);
  const pocket = interiorAreas(focus).find(node => !node.props.area.isBody);
  const placeholder = find(pocket.type(pocket.props), named('DoorWithoutStorage'));
  assert(placeholder);
  placeholder.props.onPress();
  focus.render();
  assert.equal(focus.props.selectedAreaId, draft.rows[0].doors[0].id);
  focus.unmount();
  draft = model.setDraftDoorOpening(draft, rowId, draft.rows[0].doors[0].id, 'DRAWER');
  const drawer = fixture(draft);
  selectDoor(drawer.compartment);
  const drawerView = focusedFixture(draft, drawer.requests[0]).focus;
  assert.equal(interiorAreas(drawerView).length, 1);
  assert(interiorAreas(drawerView)[0].props.area.isBody);
  drawerView.unmount();
});

test('모든 단의 연결 도면을 화면 중앙에 맞추고 본체의 원래 크기·위치로 복귀할 수 있다', () => {
  let cases = 0;
  let draft = model.createRefrigeratorDraft();
  for (let rows = 1; rows <= 4; rows++) {
    if (rows === 1) draft = model.removeDraftRow(draft, draft.rows[1].id);
    else draft = model.addDraftRow(draft);
    for (const row of [...draft.rows]) draft = model.changeDraftDoorCount(draft, row.id, 1);
    for (const row of draft.rows) {
      for (const body of row.compartments) {
        const target = { areaId: body.id, returnAreaId: body.doorIds[0],
          canvas: { x: 24, y: -170, width: 327, height: 540 } };
        const viewport = { x: 0, y: 110, width: 375, height: 360 };
        const geometry = getFridgeFocusGeometry(draft, target, viewport);
        near(geometry.left + geometry.translateX, geometry.focusedLeft);
        if (!geometry.scrollable) near(geometry.focusedLeft + geometry.width / 2, viewport.width / 2);
        near(geometry.top + geometry.height / 2 + geometry.translateY, viewport.height / 2);
        near(geometry.height, geometry.source.height);
        if (!geometry.scrollable) assert(geometry.width <= viewport.width - 48 + 1e-8);
        near(geometry.body.fromWidth, geometry.source.width);
        near(geometry.body.fromHeight, geometry.source.height);
        near(geometry.left + geometry.body.left + geometry.body.width / 2 + geometry.body.fromTranslateX,
          geometry.source.x - viewport.x + geometry.source.width / 2);
        near(geometry.top + geometry.body.top + geometry.body.height / 2 + geometry.body.fromTranslateY,
          geometry.source.y - viewport.y + geometry.source.height / 2);
        cases++;
      }
    }
  }
  assert.equal(cases, 20);
});

test('중앙 보기에서 합치기·분리하면 본체와 연결된 포켓 수·복귀 위치를 다시 계산한다', () => {
  let draft = model.createRefrigeratorDraft();
  const rowId = draft.rows[0].id;
  draft = model.changeDraftDoorCount(draft, rowId, 1);
  const target = { areaId: draft.rows[0].compartments[0].id, returnAreaId: draft.rows[0].doors[0].id,
    canvas: { x: 24, y: 210, width: 327, height: 540 } };
  const viewport = { x: 0, y: 120, width: 375, height: 600 };
  assert.equal(getFridgeFocusGeometry(draft, target, viewport).pockets.length, 1);
  draft = model.mergeDraftCompartments(draft, rowId, target.areaId);
  const merged = getFridgeFocusGeometry(draft, target, viewport);
  near(merged.source.width, 327);
  assert.equal(merged.pockets.length, 2);
  draft = model.splitDraftCompartment(draft, rowId, target.areaId);
  const split = getFridgeFocusGeometry(draft, target, viewport);
  near(split.source.width, 327 / 2);
  near(split.source.x, 24);
  near(split.source.y, 210);
  assert.equal(split.pockets.length, 1);
});

test('양쪽 본체의 툴바에서 합치고 분리해도 선택·중앙 보기·원래 문으로 복귀를 유지한다', () => {
  for (const selectedIndex of [0, 1]) {
    const { screen, viewport, map, row, target } = registrationFixture(2);
    const bodyId = row.compartments[selectedIndex].id;
    const doorId = row.doors[selectedIndex].id;
    const focusTarget = { ...target, areaId: bodyId, returnAreaId: doorId };
    viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
    map.props.onFocus(focusTarget);
    screen.render();
    const focus = () => find(screen.tree, named('FridgeFocusView'));
    const menu = () => find(screen.tree, node => node.type === 'FridgeAreaMenu');
    focus().props.onPhaseChange('open');
    screen.render();
    const original = focus().props;
    const before = getFridgeFocusGeometry(original.draft, original.target, original.viewport);
    assert.equal(menu().props.mergeDisabled, false);
    const toolbar = mount(FridgeAreaMenu, menu().props);
    const mergeButton = find(toolbar.tree, node => node.props.accessibilityLabel === '이웃 본체와 합치기');
    assert.equal(mergeButton.props.disabled, false);
    mergeButton.props.onPress();
    screen.render();
    assert.equal(focus().props.selectedAreaId, bodyId);
    assert.equal(focus().props.target.areaId, bodyId);
    assert.equal(focus().props.target.returnAreaId, doorId);
    assert.equal(focus().props.phase, 'open');
    assert.strictEqual(focus().props.viewport, original.viewport);
    const merged = getFridgeFocusGeometry(focus().props.draft, focus().props.target, original.viewport);
    assert.equal(merged.group.body.id, bodyId);
    assert.equal(merged.pockets.length, 2);
    near(merged.source.width, 327);
    assert.equal(menu().props.onMerge, undefined);
    assert.equal(menu().props.openingDisabled, true);
    menu().props.onSplit();
    screen.render();
    const split = getFridgeFocusGeometry(focus().props.draft, focus().props.target, original.viewport);
    assert.equal(focus().props.selectedAreaId, bodyId);
    assert.deepEqual(split.group.body.doorIds, [doorId]);
    near(split.source.x, before.source.x);
    near(split.source.width, before.source.width);
    assert.equal(menu().props.mergeDisabled, false);
    assert.equal(menu().props.openingDisabled, false);
    focus().props.onClose();
    screen.render();
    assert.equal(focus().props.phase, 'closing');
    focus().props.onPhaseChange('closed');
    screen.render();
    assert.equal(focus(), undefined);
    assert.equal(find(screen.tree, named('FridgeInteriorMap')).props.selectedAreaId, doorId);
    toolbar.unmount();
    screen.unmount();
  }
});

test('합산 4칸을 넘으면 합치기만 비활성화하고 안내 문구로 툴바 높이를 늘리지 않는다', () => {
  const single = registrationFixture();
  single.viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  single.map.props.onFocus(single.target);
  single.screen.render();
  find(single.screen.tree, named('FridgeFocusView')).props.onPhaseChange('open');
  single.screen.render();
  assert.equal(find(single.screen.tree, node => node.type === 'FridgeAreaMenu').props.mergeDisabled, true);
  single.screen.unmount();
  for (const selectedIndex of [0, 1]) {
    const { screen, viewport, map, row, target } = registrationFixture(2);
    viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
    map.props.onFocus({ ...target, areaId: row.compartments[selectedIndex].id, returnAreaId: row.doors[selectedIndex].id });
    screen.render();
    find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('open');
    screen.render();
    const menu = () => find(screen.tree, node => node.type === 'FridgeAreaMenu');
    const toolbar = mount(FridgeAreaMenu, menu().props);
    const flowLayout = tree => children(tree).filter(node => flattenStyle(node.props.style).position !== 'absolute')
      .map(node => ({ type: node.type, style: flattenStyle(node.props.style) }));
    const beforeLayout = flowLayout(toolbar.tree);
    menu().props.onOpenSettings();
    screen.render();
    for (let count = 1; count < model.MAX_SLOTS; count++) {
      find(screen.tree, node => node.props.accessibilityLabel?.endsWith('칸 늘리기')).props.onPress();
      screen.render();
    }
    assert.equal(menu().props.mergeDisabled, true);
    assert.equal(menu().props.mergeLimitExceeded, true);
    toolbar.props = menu().props;
    toolbar.render();
    assert.deepEqual(flowLayout(toolbar.tree), beforeLayout, '합산 제한 안내가 도면의 표시 영역을 줄이면 안 된다');
    const merge = find(toolbar.tree, node => node.props.accessibilityLabel === '이웃 본체와 합치기');
    assert.equal(merge.props.disabled, true);
    assert.match(merge.props.accessibilityHint, /합계 4개 이하/);
    toolbar.unmount();
    screen.unmount();
  }
});

test('포켓이 4칸이어도 닫힌 본체·문 크기를 그대로 유지한다', () => {
  let draft = model.createRefrigeratorDraft();
  draft = model.addDraftRow(model.addDraftRow(draft));
  const rowId = draft.rows[0].id;
  draft = model.changeDraftDoorCount(draft, rowId, 1);
  for (const door of [...draft.rows[0].doors]) draft = model.setDraftDoorOpening(draft, rowId, door.id, 'LEFT_DOOR');
  draft.rows[0].doors.forEach(door => { door.slots = Array.from({ length: model.MAX_SLOTS }, (_, index) => ({ name: `${index + 1}칸`, drawerCount: 0 })); });
  draft = model.mergeDraftCompartments(draft, rowId, draft.rows[0].compartments[0].id);
  const target = { areaId: draft.rows[0].compartments[0].id, returnAreaId: draft.rows[0].doors[0].id,
    canvas: { x: 24, y: 210, width: 327, height: 540 } };
  const geometry = getFridgeFocusGeometry(draft, target, { x: 0, y: 120, width: 375, height: 600 });
  near(geometry.body.width, geometry.source.width);
  near(geometry.height, geometry.source.height);
  assert.equal(geometry.scrollable, true);
  near(geometry.body.width / geometry.body.height, geometry.source.width / geometry.source.height);
  assert(geometry.pockets.every(({ frame }) => frame.height === geometry.body.height));
  near(geometry.body.fromHeight, 132);
});

test('4단·4칸은 문 개수·여는 방식과 관계없이 닫힌 도면의 너비·높이를 그대로 유지한다', () => {
  for (const opening of ['LEFT_DOOR', 'RIGHT_DOOR', 'DRAWER']) {
    for (const doorCount of [1, 2]) {
      for (const merged of doorCount === 2 ? [false, true] : [false]) {
        let draft = model.addDraftRow(model.addDraftRow(model.createRefrigeratorDraft()));
        const rowId = draft.rows[0].id;
        if (doorCount === 2) draft = model.changeDraftDoorCount(draft, rowId, 1);
        const bodyId = draft.rows[0].compartments[0].id;
        for (const door of draft.rows[0].doors) draft = model.setDraftDoorOpening(draft, rowId, door.id, opening);
        if (merged) draft = model.mergeDraftCompartments(draft, rowId, bodyId);
        draft.rows[0].compartments[0].slots = Array.from({ length: 4 }, (_, index) => ({ name: `${index + 1}칸`, drawerCount: 2 }));
        draft.rows[0].doors.forEach(door => { door.slots = Array.from({ length: 4 }, (_, index) => ({ name: `${index + 1}칸`, drawerCount: 0 })); });
        const { compartment, requests } = fixture(draft);
        selectDoor(compartment);
        const geometry = getFridgeFocusGeometry(draft, requests[0], { x: 0, y: 100, width: 375, height: 500 });
        near(geometry.height, geometry.source.height);
        near(geometry.body.width, geometry.source.width);
        near(geometry.body.width / geometry.body.height, geometry.source.width / geometry.source.height);
        if (geometry.scrollable) {
          const bodyLeft = geometry.focusedLeft + geometry.body.left;
          if (geometry.pockets.every(({ door }) => door.side === 'LEFT_DOOR')) near(bodyLeft + geometry.body.width, 375 - 24);
          else if (geometry.pockets.every(({ door }) => door.side === 'RIGHT_DOOR')) near(bodyLeft, 24);
          else near(bodyLeft + geometry.body.width / 2, 375 / 2);
          assert(geometry.initialScrollX >= 0);
          assert(geometry.initialScrollX <= geometry.contentWidth - 375);
        }
        if (!geometry.scrollable) assert(geometry.width <= 375 - 48 + 1e-8);
      }
    }
  }
});

test('가로로 긴 단은 크기를 유지하고 왼쪽 열림은 본체를 오른쪽 끝에, 오른쪽 열림은 왼쪽 끝에 둔다', () => {
  const draft = model.addDraftRow(model.addDraftRow(model.createRefrigeratorDraft()));
  const row = draft.rows[0];
  row.compartments[0].slots = Array.from({ length: 4 }, (_, index) => ({ name: `${index + 1}칸`, drawerCount: 0 }));
  row.doors[0].slots = Array.from({ length: 4 }, (_, index) => ({ name: `${index + 1}칸`, drawerCount: 0 }));
  const snapshot = structuredClone(draft);
  for (const viewportWidth of [320, 375, 480]) {
    const geometries = ['LEFT_DOOR', 'RIGHT_DOOR'].map(opening => {
      const current = model.setDraftDoorOpening(draft, row.id, row.doors[0].id, opening);
      const { compartment, requests } = fixture(current);
      selectDoor(compartment);
      const viewport = { x: 0, y: 100, width: viewportWidth, height: 600 };
      const geometry = getFridgeFocusGeometry(current, requests[0], viewport);
      assert.equal(geometry.scrollable, true);
      near(geometry.height, geometry.source.height);
      near(geometry.body.width, geometry.source.width);
      const bodyLeft = geometry.focusedLeft + geometry.body.left;
      if (opening === 'LEFT_DOOR') {
        near(bodyLeft + geometry.body.width, viewportWidth - 24);
        near(geometry.initialScrollX, geometry.contentWidth - viewportWidth);
        near(geometry.pockets[0].frame.left + geometry.pockets[0].frame.width + 14, geometry.body.left);
      } else {
        near(bodyLeft, 24);
        near(geometry.initialScrollX, 0);
        near(geometry.pockets[0].frame.left, geometry.body.left + geometry.body.width + 14);
      }
      const { focus } = focusedFixture(current, requests[0], viewport);
      near(flattenStyle(moving(focus).props.style).top + geometry.height / 2, viewport.height / 2);
      focus.unmount();
      return geometry;
    });
    near(geometries[0].body.width, geometries[1].body.width);
    near(geometries[0].body.height, geometries[1].body.height);
  }
  assert.deepEqual(draft, snapshot);
});

test('넘친 도면은 열린 뒤 좌우 이동·포켓 선택이 가능하고 이동한 위치에서 원래 자리로 닫힌다', () => {
  for (const merged of [false, true]) {
    for (const opening of ['LEFT_DOOR', 'RIGHT_DOOR']) {
      let draft = model.addDraftRow(model.addDraftRow(model.createRefrigeratorDraft()));
      const rowId = draft.rows[0].id;
      if (merged) draft = model.changeDraftDoorCount(draft, rowId, 1);
      draft = model.setDraftDoorOpening(draft, rowId, draft.rows[0].doors[0].id, opening);
      if (merged) draft = model.mergeDraftCompartments(draft, rowId, draft.rows[0].compartments[0].id);
      draft.rows[0].doors.forEach(door => { door.slots = Array.from({ length: 4 }, (_, index) => ({ name: `${index + 1}칸`, drawerCount: 0 })); });
      const { compartment, requests } = fixture(draft);
      selectDoor(compartment);
      const target = requests[0];
      const { focus } = focusedFixture(draft, target);
      const geometry = getFridgeFocusGeometry(draft, target, focus.props.viewport);
      const scroller = () => find(focus.tree, node => node.type === 'ScrollView' && node.props.horizontal);
      assertFocusAccess(focus, 'opening');
      assert.equal(scroller(), undefined);
      animations.at(-1).finish();
      focus.render();
      assertFocusAccess(focus, 'open');
      assert.equal(scroller().props.scrollEnabled, true);
      assert.equal(scroller().props.bounces, false);
      assert.equal(scroller().props.removeClippedSubviews, false);
      assert.equal(scroller().props.contentOffset.x, geometry.initialScrollX);
      const scrollFrame = flattenStyle(scroller().props.style);
      const contentFrame = flattenStyle(children(scroller())[0].props.style);
      const sceneFrame = flattenStyle(moving(focus).props.style);
      assert(scrollFrame.height > sceneFrame.top + sceneFrame.height, '표시줄 공간은 도면 테두리 아래에 있어야 한다');
      assert(contentFrame.height >= scrollFrame.height);
      const resets = [];
      scroller().props.ref.current = { scrollTo: args => resets.push(args) };
      let lastX = 0;
      for (const x of [0, geometry.contentWidth - focus.props.viewport.width]) {
        lastX = x;
        scroller().props.onScroll({ nativeEvent: { contentOffset: { x, y: 0 } } });
        focus.render();
        const sceneLeft = flattenStyle(moving(focus).props.style).left - x;
        const edgePocket = x === 0 ? geometry.pockets[0] : geometry.pockets.at(-1);
        if (geometry.pockets.length > 1 || (x === 0) === (edgePocket.door.side === 'LEFT_DOOR')) {
          assert(sceneLeft + edgePocket.frame.left >= -1e-8);
          assert(sceneLeft + edgePocket.frame.left + edgePocket.frame.width <= focus.props.viewport.width + 1e-8);
        }
      }
      const pocketId = geometry.pockets.at(-1).door.id;
      interiorAreas(focus).find(area => area.props.area.id === pocketId).props.onSelectArea(pocketId);
      focus.render();
      assert.equal(focus.props.selectedAreaId, pocketId);
      assert.equal(resets.length, 0, '스크롤·선택 변경으로 처음 위치에 되돌리지 않아야 한다');
      focus.props.onClose();
      focus.render();
      assertFocusAccess(focus, 'closing');
      const style = flattenStyle(moving(focus).props.style);
      const translation = style.transform[0].translateX.outputRange;
      near(style.left + translation[1], geometry.scrollPaddingLeft - lastX);
      near(style.left + translation[0], geometry.left);
      animations.at(-1).finish();
      focus.render();
      assertFocusAccess(focus, 'closed');
      focus.unmount();
    }
  }
});

test('좌우 이동 중 화면 너비나 연결 구조가 바뀌면 본체의 초기 정렬에 맞춰 이동 범위를 다시 잡는다', () => {
  let draft = model.addDraftRow(model.addDraftRow(model.createRefrigeratorDraft()));
  const rowId = draft.rows[0].id;
  draft = model.changeDraftDoorCount(draft, rowId, 1);
  draft = model.mergeDraftCompartments(draft, rowId, draft.rows[0].compartments[0].id);
  draft.rows[0].doors.forEach(door => { door.slots = Array.from({ length: 4 }, (_, index) => ({ name: `${index + 1}칸`, drawerCount: 0 })); });
  const { compartment, requests } = fixture(draft);
  selectDoor(compartment);
  const { focus } = focusedFixture(draft, requests[0]);
  animations.at(-1).finish();
  focus.render();
  const scroller = () => find(focus.tree, node => node.type === 'ScrollView' && node.props.horizontal);
  const resets = [];
  scroller().props.ref.current = { scrollTo: args => resets.push(args) };
  scroller().props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 } } });
  focus.render();
  focus.props = { ...focus.props, viewport: { ...focus.props.viewport, width: 320 } };
  focus.render();
  const resized = getFridgeFocusGeometry(draft, focus.props.target, focus.props.viewport);
  assert.deepEqual(resets, [{ x: resized.initialScrollX, animated: false }]);
  focus.props = { ...focus.props, draft: model.splitDraftCompartment(draft, rowId, requests[0].areaId, requests[0].returnAreaId) };
  focus.render();
  const split = getFridgeFocusGeometry(focus.props.draft, focus.props.target, focus.props.viewport);
  assert.equal(Boolean(scroller()), split.scrollable);
  if (split.scrollable) assert.deepEqual(resets.at(-1), { x: split.initialScrollX, animated: false });
  focus.props = { ...focus.props, viewport: { ...focus.props.viewport, width: 375 } };
  focus.render();
  assert.equal(scroller(), undefined);
  const fitted = getFridgeFocusGeometry(focus.props.draft, focus.props.target, focus.props.viewport);
  near(flattenStyle(moving(focus).props.style).left, fitted.focusedLeft);
  assert.equal(focus.props.selectedAreaId, requests[0].areaId);
  focus.unmount();
});

test('안내는 열린 스크롤 도면의 표시 영역 중앙에 나타나고 노출 기록 후에도 약 2초를 유지한다', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let draft = model.createRefrigeratorDraft();
  const rowId = draft.rows[0].id;
  draft = model.changeDraftDoorCount(draft, rowId, 1);
  const { compartment, requests } = fixture(draft);
  selectDoor(compartment);
  const { focus } = focusedFixture(draft, requests[0]);
  let seen = 0;
  focus.props = { ...focus.props, scrollHintEnabled: true, onScrollHintSeen: () => seen++, overlayHeight: 800 };
  const hintElement = () => find(focus.tree, named('FridgeScrollHint'));
  focus.render();
  assert.equal(hintElement(), undefined);
  animations.at(-1).finish();
  focus.render();
  assert.equal(hintElement(), undefined, '좌우 이동이 필요 없을 때는 안내를 소비하지 않아야 한다');
  focus.props = { ...focus.props, draft: model.mergeDraftCompartments(draft, rowId, draft.rows[0].compartments[0].id), scrollHintBlocked: true };
  focus.render();
  assert.equal(hintElement(), undefined);
  assert.equal(seen, 0);
  focus.props = { ...focus.props, scrollHintBlocked: false };
  focus.render();
  const hint = mount(hintElement().type, hintElement().props);
  assert.equal(seen, 1);
  assert.equal(hint.tree.props.pointerEvents, 'none');
  const frame = flattenStyle(hint.tree.props.style);
  assert.equal(frame.width, focus.props.viewport.width);
  assert.equal(frame.height, focus.props.viewport.height);
  assert.equal(frame.alignItems, 'center');
  assert.equal(frame.justifyContent, 'center');
  const fadeIn = animations.at(-1);
  assert.equal(fadeIn.config.toValue, 1);
  fadeIn.finish();
  hint.props = { ...hint.props, enabled: false };
  hint.render();
  assert(hint.tree, '표시 이력을 기록해도 현재 안내는 즉시 사라지지 않아야 한다');
  t.mock.timers.tick(1799);
  assert.equal(animations.at(-1), fadeIn);
  t.mock.timers.tick(1);
  const fadeOut = animations.at(-1);
  assert.equal(fadeOut.config.toValue, 0);
  assert.equal(fadeOut.config.duration, 200);
  fadeOut.finish();
  hint.render();
  assert.equal(hint.tree, null);
  assert.equal(seen, 1);
  hint.unmount();
  focus.unmount();
});

test('안내는 자동 위치 정렬·영역 선택에는 유지되고 사용자 드래그에는 즉시 사라진다', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { draft, compartment, requests } = fixture();
  selectDoor(compartment);
  const { focus } = focusedFixture(draft, requests[0]);
  focus.props = { ...focus.props, scrollHintEnabled: true };
  animations.at(-1).finish();
  focus.render();
  const hintElement = () => find(focus.tree, named('FridgeScrollHint'));
  const scroller = () => find(focus.tree, node => node.type === 'ScrollView' && node.props.horizontal);
  const hint = mount(hintElement().type, hintElement().props);
  const animationCount = animations.length;
  scroller().props.onScroll({ nativeEvent: { contentOffset: scroller().props.contentOffset } });
  focus.props.onSelectArea(draft.rows[0].doors[0].id);
  focus.render();
  hint.props = hintElement().props;
  hint.render();
  assert(hint.tree);
  scroller().props.onScrollBeginDrag();
  focus.render();
  hint.props = hintElement().props;
  hint.render();
  assert.equal(hint.tree, null);
  assert.equal(focus.props.phase, 'open');
  t.mock.timers.tick(5000);
  assert.equal(animations.length, animationCount);
  hint.unmount();
  focus.unmount();
});

test('안내 이력은 같은 등록 화면에서 문을 다시 열어도 유지하고 설정·여는 방식 패널 중에는 표시를 막는다', () => {
  const { screen, viewport, map, target } = registrationFixture();
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  map.props.onFocus(target);
  screen.render();
  const focus = () => find(screen.tree, named('FridgeFocusView'));
  const menu = () => find(screen.tree, node => node.type === 'FridgeAreaMenu');
  focus().props.onPhaseChange('open');
  screen.render();
  assert.equal(focus().props.scrollHintEnabled, true);
  assert.equal(focus().props.scrollHintBlocked, false);
  menu().props.onOpeningsChange(true);
  screen.render();
  assert.equal(focus().props.scrollHintBlocked, true);
  menu().props.onOpeningsChange(false);
  menu().props.onOpenSettings();
  screen.render();
  assert.equal(focus().props.scrollHintBlocked, true);
  find(screen.tree, node => node.type === 'Modal').props.onRequestClose();
  animations.at(-1).finish();
  screen.render();
  assert.equal(focus().props.scrollHintBlocked, false);
  focus().props.onScrollHintSeen();
  screen.render();
  assert.equal(focus().props.scrollHintEnabled, false);
  focus().props.onClose();
  screen.render();
  focus().props.onPhaseChange('closed');
  screen.render();
  find(screen.tree, named('FridgeInteriorMap')).props.onFocus(target);
  screen.render();
  focus().props.onPhaseChange('open');
  screen.render();
  assert.equal(focus().props.scrollHintEnabled, false);
  screen.unmount();
  const next = registrationFixture();
  next.viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  next.map.props.onFocus(next.target);
  next.screen.render();
  assert.equal(find(next.screen.tree, named('FridgeFocusView')).props.scrollHintEnabled, true);
  next.screen.unmount();
});

test('열린 본체·포켓은 내부 상단에 공간 이름을 표시하고 바깥 영역에서 닫는다', () => {
  const { draft, requests, compartment, map } = fixture();
  selectDoor(compartment);
  const { focus } = focusedFixture(draft, requests[0]);
  const labels = interiorAreas(focus).map(area => {
    const tree = area.type(area.props);
    const map = find(tree, node => node.type === mapModule.FridgeMap);
    const header = map.props.areaHeader;
    const name = find(header, node => node.type === 'Text');
    assert.equal(flattenStyle(name.props.style).position, undefined);
    assert.equal(flattenStyle(name.props.style).borderWidth, undefined);
    assert.equal(header.props.pointerEvents, 'none');
    const frame = find(mapModule.FridgeMap(map.props), node => children(node).includes(header));
    assert.equal(flattenStyle(frame.props.style).overflow, 'hidden');
    return name.props.children;
  });
  assert.deepEqual(labels, ['냉장실', '도어포켓']);
  assert.equal(findAll(focus.tree, node => node.type === 'SecondaryButton').length, 0);
  const outside = find(children(focus.tree)[0], node => node.type === 'Pressable');
  assert.equal(outside.props.accessibilityRole, 'button');
  assert.equal(children(outside).length, 0);
  map.props = { ...map.props, focus: requests[0] };
  map.render();
  assert(children(children(map.tree)[0]).every(node => named('FridgeCompartment')(node) || node.props.pointerEvents === 'none'));
  assert.equal(flattenStyle(compartment.tree.props.style).opacity, 0);
  focus.unmount();
});

test('문 뒷면은 앞면과 반대로 회전하고 포켓 내용은 열림 완료 전까지 숨긴다', () => {
  function rotationAt(face, progress) {
    const rotation = flattenStyle(face.props.style).transform.find(transform => transform.rotateY).rotateY;
    return parseFloat(rotation.outputRange[0]) + (parseFloat(rotation.outputRange[1]) - parseFloat(rotation.outputRange[0])) * progress;
  }
  for (const opening of ['LEFT_DOOR', 'RIGHT_DOOR']) {
    let draft = model.createRefrigeratorDraft();
    const rowId = draft.rows[0].id;
    draft = model.setDraftDoorOpening(draft, rowId, draft.rows[0].doors[0].id, opening);
    const { compartment, requests } = fixture(draft);
    selectDoor(compartment);
    const { focus } = focusedFixture(draft, requests[0]);
    const door = movingDoors(focus)[0];
    const [front, back] = children(door.type(door.props));
    assert.equal(flattenStyle(front.props.style).backfaceVisibility, 'hidden');
    assert.equal(flattenStyle(back.props.style).backfaceVisibility, 'hidden');
    assert.equal(flattenStyle(back.props.style).opacity, undefined);
    const content = find(back, node => children(node).some(named('InteriorArea')));
    assert.equal(flattenStyle(content.props.style).opacity, 0);
    const artwork = find(front, named('DoorModeArt'));
    assert.equal(artwork.props.storageMode, draft.rows[0].compartments[0].storageMode);
    for (const progress of [0, 0.25, 0.75, 1]) {
      const frontVisible = Math.cos(rotationAt(front, progress) * Math.PI / 180) > 0;
      const backVisible = Math.cos(rotationAt(back, progress) * Math.PI / 180) > 0;
      assert.equal(frontVisible, progress < 0.5);
      assert.equal(backVisible, progress > 0.5);
      near(Math.abs(rotationAt(front, progress) - rotationAt(back, progress)), 180);
    }
    const geometry = getFridgeFocusGeometry(draft, requests[0], focus.props.viewport);
    const leaf = geometry.doors[0];
    const backStyle = flattenStyle(back.props.style);
    const shift = backStyle.transform.find(transform => transform.translateX).translateX.outputRange[1];
    near(geometry.body.left + leaf.frame.left + dimensionAt(backStyle.left, 1, leaf.frame.width) + shift,
      leaf.pocket.frame.left + (opening === 'LEFT_DOOR' ? leaf.frame.paddingRight : leaf.frame.paddingLeft));
    near(geometry.body.width, dimensionAt(backStyle.width, 1, leaf.frame.width));
    focus.unmount();
  }
});

test('도면 화면은 고정하고 기본 정보·하단 칸 편집 패널만 스크롤을 허용한다', () => {
  const screen = mount(RefrigeratorRegistrationScreen, { navigation: { goBack() {}, dispatch() {} } });
  const pageScrolls = () => findAll(screen.tree, node => node.type === 'ScrollView' && node.props.ref);
  assert.deepEqual(pageScrolls().map(node => node.props.scrollEnabled), [true, false]);
  find(screen.tree, node => node.type === 'PrimaryButton' && node.props.label === '다음').props.onPress();
  animations.at(-1).finish();
  screen.render();
  assert.deepEqual(pageScrolls().map(node => node.props.scrollEnabled), [false, false]);
  const configuration = pageScrolls()[1];
  assert.equal(configuration.props.bounces, false);
  assert.equal(configuration.props.overScrollMode, 'never');
  assert.equal(configuration.props.showsVerticalScrollIndicator, false);
  assert.equal(flattenStyle(configuration.props.contentContainerStyle).height, '100%');
  assert.equal(find(screen.tree, named('FridgeInteriorMap')).props.fitHeight, true);
  const panel = find(screen.tree, node => node.type === 'Modal');
  assert.notEqual(find(panel, node => node.type === 'ScrollView').props.scrollEnabled, false);
  screen.unmount();
});

test('1단·여러 단 모두 크기를 유지한 중앙 보기를 제목 영역에서도 닫을 수 있고 전환 중에는 닫지 않는다', () => {
  for (const rowCount of [1, 2]) {
    const { screen, viewport, map } = registrationFixture(1, rowCount);
    const focus = () => find(screen.tree, named('FridgeFocusView'));
    const headerClose = () => find(screen.tree, node => node.props.accessibilityLabel === '제목 영역 눌러 냉장고 도면 닫기');
    const originalDraft = structuredClone(map.props.draft);
    assert.equal(headerClose(), undefined);
    const closed = fixture(map.props.draft);
    selectDoor(closed.compartment);
    const target = closed.requests[0];
    viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 420) };
    map.props.onFocus(target);
    screen.render();
    const header = find(screen.tree, node => children(node).includes(headerClose()));
    const title = find(header, node => node.type === 'Text' && node.props.children === '냉장고 등록');
    assert.equal(title.props.pointerEvents, 'none');
    const overlay = mount(FridgeFocusView, focus().props);
    assert(flattenStyle(header.props.style).zIndex > flattenStyle(overlay.tree.props.style).zIndex);
    overlay.unmount();
    assert.equal(headerClose().props.disabled, true);
    assert.equal(headerClose().props.pointerEvents, 'none');
    headerClose().props.onPress();
    screen.render();
    assert.equal(focus().props.phase, 'opening');
    focus().props.onPhaseChange('open');
    screen.render();
    assert.equal(headerClose().props.disabled, false);
    assert.equal(headerClose().props.pointerEvents, 'auto');
    const geometry = getFridgeFocusGeometry(focus().props.draft, target, focus().props.viewport);
    near(geometry.body.width, geometry.source.width);
    near(geometry.body.height, geometry.source.height);
    find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onOpeningsChange(true);
    screen.render();
    assert.equal(focus().props.phase, 'open');
    headerClose().props.onPress();
    screen.render();
    assert.equal(focus().props.phase, 'closing');
    assert.equal(headerClose().props.disabled, true);
    focus().props.onPhaseChange('closed');
    screen.render();
    assert.equal(focus(), undefined);
    assert.equal(headerClose(), undefined);
    const restored = find(screen.tree, named('FridgeInteriorMap'));
    assert.equal(restored.props.selectedAreaId, target.returnAreaId);
    assert.deepEqual(restored.props.draft, originalDraft);
    screen.unmount();
  }
});

test('기본정보 도면은 단 개수·화면 너비가 바뀌어도 같은 세로 비율과 단별 조절 위치를 유지한다', () => {
  const screen = mount(RefrigeratorRegistrationScreen, { navigation: { goBack() {}, dispatch() {} } });
  const { FridgeStructurePreview } = loadComponent('src/features/fridge/components/FridgeStructurePreview.tsx');
  for (const rowCount of [2, 4]) {
    while (find(screen.tree, node => node.type === 'FridgeStructurePreview').props.rows.length < rowCount) {
      find(screen.tree, node => node.type === 'PrimaryButton' && node.props.label === '단 추가').props.onPress();
      screen.render();
    }
    for (const availableWidth of [320, 375, 768]) {
      const viewport = find(screen.tree, node => node.props.onLayout && children(node).some(child =>
        child.type === 'Animated.View' && flattenStyle(child.props.style).flexDirection === 'row'));
      viewport.props.onLayout({ nativeEvent: { layout: { width: availableWidth, height: 600 } } });
      screen.render();
      const preview = find(screen.tree, node => node.type === 'FridgeStructurePreview');
      const frame = flattenStyle(FridgeStructurePreview(preview.props).props.style);
      const editor = find(screen.tree, node => children(node).includes(preview));
      const height = flattenStyle(editor.props.style).height;
      near(frame.width / height, model.FRIDGE_ASPECT_RATIO);
      assert.equal(frame.aspectRatio, model.FRIDGE_ASPECT_RATIO);
      const controls = children(editor).at(-1);
      assert.equal(children(controls).length, rowCount);
      const reservedWidth = children(editor).filter(child => child !== preview)
        .reduce((sum, child) => sum + flattenStyle(child.props.style).width, 0);
      assert(frame.width + reservedWidth + tokens.spacing.xs * 2 <= availableWidth - tokens.spacing.lg * 2);
      if (availableWidth === 375) assert(height > 240);
    }
  }
  screen.unmount();
});

test('작은 화면에서도 모든 단이 남은 높이 안에 들어가고 실제 높이로 문을 열고 복귀한다', () => {
  for (const rowCount of [1, 2, 3, 4]) {
    let draft = model.createRefrigeratorDraft();
    while (draft.rows.length > rowCount) draft = model.removeDraftRow(draft, draft.rows.at(-1).id);
    while (draft.rows.length < rowCount) draft = model.addDraftRow(draft);
    for (const [availableWidth, availableHeight] of [[327, 240], [327, 460], [327, 700], [200, 700], [700, 240]]) {
      const targets = [];
      const map = mount(FridgeInteriorMap, { draft, fitHeight: true, onSelectArea() {}, onFocus: target => targets.push(target) });
      map.tree.props.onLayout({ nativeEvent: { layout: { width: availableWidth, height: availableHeight } } });
      map.render();
      const canvas = children(map.tree)[0];
      const { width, height } = flattenStyle(canvas.props.style);
      near(width / height, model.FRIDGE_ASPECT_RATIO);
      assert(width <= availableWidth);
      assert(height <= Math.min(540, availableHeight - 20));
      const groups = children(canvas).filter(named('FridgeCompartment'));
      assert.equal(groups.length, rowCount);
      near(groups.at(-1).props.top + groups.at(-1).props.height, height);
      const last = mount(groups.at(-1).type, groups.at(-1).props);
      last.tree.props.ref.current = { measureInWindow(callback) {
        callback(24 + (availableWidth - width) / 2, 200 + last.props.top, width, last.props.height);
      } };
      selectDoor(last);
      near(targets[0].canvas.height, height);
      near(targets[0].canvas.width, width);
      near(targets[0].canvas.x, 24 + (availableWidth - width) / 2);
      near(targets[0].canvas.y, 200);
      const geometry = getFridgeFocusGeometry(draft, targets[0], { x: 0, y: 110, width: 375, height: 500 });
      near(geometry.body.fromHeight, (height - 4 * (rowCount - 1)) / rowCount);
      near(geometry.body.width / geometry.body.height, geometry.source.width / geometry.source.height);
      last.unmount();
      map.unmount();
    }
  }
});

test('배경 도면 높이는 툴바와 분리해 유지하고 문이 완전히 열린 동안만 선택한 영역의 도구를 표시한다', () => {
  const { screen, viewport, map, row, target } = registrationFixture();
  function assertBackgroundLayout(focused) {
    const scroll = find(screen.tree, node => node.type === 'ScrollView' && find(node, named('FridgeInteriorMap')));
    const background = find(screen.tree, node => children(node).includes(scroll));
    const page = find(screen.tree, node => children(node).includes(background));
    const foreground = find(screen.tree, node => node.props.ref === viewport.props.ref);
    assert(children(page).includes(foreground));
    assert.notStrictEqual(background, foreground);
    assert.equal(flattenStyle(page.props.style).height, '100%');
    const style = flattenStyle(background.props.style);
    assert.equal(style.position, 'absolute');
    for (const edge of ['top', 'bottom', 'left', 'right']) assert.equal(style[edge], 0);
    assert.equal(foreground.props.pointerEvents, 'box-none');
    assert.equal(scroll.props.scrollEnabled, false);
    assert.equal(scroll.props.pointerEvents, focused ? 'none' : 'auto');
  }
  assertBackgroundLayout(false);
  assert.equal(find(screen.tree, node => node.type === 'FridgeAreaMenu'), undefined);
  viewport.props.ref.current = { measureInWindow(callback) { callback(0, 110, 375, 600); } };
  map.props.onFocus(target);
  screen.render();
  assertBackgroundLayout(true);
  function toolbarContainer() {
    const menu = find(screen.tree, node => node.type === 'FridgeAreaMenu');
    return { menu, container: find(screen.tree, node => children(node).includes(menu)) };
  }
  assert.equal(flattenStyle(toolbarContainer().container.props.style).opacity, 0);
  assert.equal(toolbarContainer().container.props.pointerEvents, 'none');
  find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('open');
  screen.render();
  assertBackgroundLayout(true);
  assert.equal(flattenStyle(toolbarContainer().container.props.style).opacity, 1);
  assert.equal(toolbarContainer().menu.props.showOpeningAction, true);
  find(screen.tree, named('FridgeFocusView')).props.onSelectArea(row.doors[0].id);
  screen.render();
  assert.equal(toolbarContainer().menu.props.showOpeningAction, false);
  assert.equal(toolbarContainer().menu.props.storageEnabled, true);
  find(screen.tree, named('FridgeFocusView')).props.onClose();
  screen.render();
  assertBackgroundLayout(true);
  assert.equal(flattenStyle(toolbarContainer().container.props.style).opacity, 0);
  assert.equal(toolbarContainer().container.props.accessibilityElementsHidden, true);
  find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('closed');
  screen.render();
  assertBackgroundLayout(false);
  assert.equal(find(screen.tree, node => node.type === 'FridgeAreaMenu'), undefined);
  screen.unmount();
});

test('중앙 보기에서는 회전 문의 끝을 자르지 않고 다른 단계만 숨기며 닫힌 뒤 단계 잘림을 복원한다', () => {
  const { screen, viewport, map, target } = registrationFixture();
  const stepViewport = () => find(screen.tree, node => node.type === 'View' && node.props.onLayout
    && children(node).some(child => child.type === 'Animated.View' && flattenStyle(child.props.style).width === 750));
  assert.equal(flattenStyle(stepViewport().props.style).overflow, 'hidden');
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  map.props.onFocus(target);
  screen.render();
  for (const phase of ['opening', 'open', 'closing']) {
    if (phase !== 'opening') {
      find(screen.tree, named('FridgeFocusView')).props.onPhaseChange(phase);
      screen.render();
    }
    assert.equal(flattenStyle(stepViewport().props.style).overflow, 'visible');
    const pages = children(children(stepViewport())[0]);
    assert.equal(pages.length, 2);
    assert.equal(flattenStyle(pages[0].props.style).opacity, 0);
    assert.equal(pages[0].props.pointerEvents, 'none');
    assert.equal(pages[0].props.accessibilityElementsHidden, true);
    assert.equal(flattenStyle(pages[1].props.style).opacity ?? 1, 1);
  }
  find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('closed');
  screen.render();
  assert.equal(flattenStyle(stepViewport().props.style).overflow, 'hidden');
  assert.equal(find(screen.tree, named('FridgeFocusView')), undefined);
  screen.unmount();
});

test('경첩은 본체·포켓 사이의 중앙에 놓이고 양쪽 선택 테두리와 간격을 유지한다', () => {
  for (const opening of ['LEFT_DOOR', 'RIGHT_DOOR']) {
    for (const groupIndex of [0, 1]) {
      let draft = model.createRefrigeratorDraft();
      const rowId = draft.rows[0].id;
      draft = model.changeDraftDoorCount(draft, rowId, 1);
      for (const door of [...draft.rows[0].doors]) draft = model.setDraftDoorOpening(draft, rowId, door.id, opening);
      const { compartment, requests } = fixture(draft, groupIndex);
      selectDoor(compartment);
      const { focus } = focusedFixture(draft, requests[0]);
      const geometry = getFridgeFocusGeometry(draft, requests[0], focus.props.viewport);
      const hinge = find(moving(focus), named('DoorHinges'));
      const hingeTree = hinge.type(hinge.props);
      const hingeStyle = flattenStyle(hingeTree.props.style);
      const bars = findAll(hingeTree, named('DoorHinge')).map(pin => pin.type(pin.props));
      const leaf = geometry.doors[0];
      const back = children(movingDoors(focus)[0].type(movingDoors(focus)[0].props))[1];
      const backStyle = flattenStyle(back.props.style);
      const shift = backStyle.transform.find(transform => transform.translateX).translateX.outputRange[1];
      const pocketLeft = geometry.body.left + leaf.frame.left + dimensionAt(backStyle.left, 1, leaf.frame.width) + shift;
      const bodyEdge = opening === 'LEFT_DOOR' ? geometry.body.left : geometry.body.left + geometry.body.width;
      const pocketEdge = opening === 'LEFT_DOOR' ? pocketLeft + dimensionAt(backStyle.width, 1, leaf.frame.width) : pocketLeft;
      near(Math.abs(bodyEdge - pocketEdge), 14);
      for (const bar of bars) {
        const style = flattenStyle(bar.props.style);
        near(hingeStyle.left + style.left, Math.min(bodyEdge, pocketEdge));
        near(hingeStyle.left + style.left + style.width, Math.max(bodyEdge, pocketEdge));
        const pin = flattenStyle(children(bar)[0].props.style);
        const pinLeft = hingeStyle.left + style.left + style.width / 2 + pin.marginLeft;
        assert(pinLeft - Math.min(bodyEdge, pocketEdge) >= 3);
        assert(Math.max(bodyEdge, pocketEdge) - pinLeft - pin.width >= 3);
      }
      assert.equal(leaf.frame.paddingLeft, 0);
      assert.equal(leaf.frame.paddingRight, 0);
      near(backStyle.top, 0);
      near(backStyle.bottom, 0);
      focus.unmount();
    }
  }
});

test('배경 덮개는 전체 높이를 채우고 중앙 위치는 툴바를 제외한 확정 높이로 유지한다', () => {
  for (const measureFirst of [true, false]) {
    const { screen, viewport, map, target } = registrationFixture();
    let reply;
    let measurements = 0;
    const pageViewport = find(screen.tree, node => node.type === 'View' && node.props.onLayout && !node.props.ref);
    pageViewport.props.onLayout({ nativeEvent: { layout: { width: 375, height: 600 } } });
    viewport.props.ref.current = { measureInWindow(callback) { measurements++; reply = callback; } };
    viewport.props.onLayout({ nativeEvent: { layout: { width: 375, height: 600 } } });
    map.props.onFocus(target);
    if (measureFirst) {
      reply(0, 110, 375, 600);
      screen.render();
    }
    viewport.props.onLayout({ nativeEvent: { layout: { width: 375, height: 520 } } });
    if (!measureFirst) reply(0, 110, 375, 600);
    screen.render();
    let focus = find(screen.tree, named('FridgeFocusView'));
    assert.equal(focus.props.viewport.height, 520);
    assert.equal(focus.props.overlayHeight, 600);
    const overlay = mount(FridgeFocusView, focus.props);
    const overlayStyle = flattenStyle(overlay.tree.props.style);
    assert.equal(overlayStyle.height, 600);
    assert.equal(overlayStyle.bottom, undefined);
    const backdropStyle = flattenStyle(children(overlay.tree)[0].props.style);
    assert.equal(backdropStyle.top, 0);
    assert.equal(backdropStyle.bottom, 0);
    const centered = flattenStyle(moving(overlay).props.style);
    near(centered.top + centered.height / 2, 260);
    overlay.unmount();
    focus.props.onPhaseChange('open');
    screen.render();
    focus = find(screen.tree, named('FridgeFocusView'));
    const beforeBounds = focus.props.viewport;
    const before = getFridgeFocusGeometry(focus.props.draft, target, beforeBounds);
    const menuProps = () => find(screen.tree, node => node.type === 'FridgeAreaMenu').props;
    const menu = mount(FridgeAreaMenu, menuProps());
    const flowChildren = tree => children(tree).filter(node => flattenStyle(node.props.style).position !== 'absolute');
    const beforeFlow = flowChildren(menu.tree).map(node => flattenStyle(node.props.style));
    for (const expanded of [true, false, true]) {
      const openingButton = find(menu.tree, node => node.type === 'FeedbackPressable'
        && find(node, child => child.type === 'Text' && child.props.children === '여는 방식'));
      openingButton.props.onPress();
      screen.render();
      menu.props = menuProps();
      menu.render();
      assert.equal(menu.props.openingsOpen, expanded);
      assert.deepEqual(flowChildren(menu.tree).map(node => flattenStyle(node.props.style)), beforeFlow);
      const panel = find(menu.tree, node => !!node.props.onAccessibilityEscape);
      if (expanded) {
        const style = flattenStyle(panel.props.style);
        assert.equal(style.position, 'absolute');
        assert.equal(style.bottom, '100%');
        assert.equal(style.left, 0);
        assert.equal(style.right, 0);
      } else assert.equal(panel, undefined);
      focus = find(screen.tree, named('FridgeFocusView'));
      assert.strictEqual(focus.props.viewport, beforeBounds);
      assert.equal(focus.props.overlayHeight, 600);
      near(getFridgeFocusGeometry(focus.props.draft, target, focus.props.viewport).translateY, before.translateY);
    }
    const toolbar = find(screen.tree, node => children(node).some(child => child.type === 'FridgeAreaMenu'));
    assert(flattenStyle(toolbar.props.style).zIndex > (flattenStyle(viewport.props.style).zIndex ?? 0));
    find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onOpenSettings();
    screen.render();
    assert.equal(find(screen.tree, node => node.type === 'Modal').props.visible, true);
    viewport.props.onLayout({ nativeEvent: { layout: { width: 375, height: 520 } } });
    screen.render();
    focus = find(screen.tree, named('FridgeFocusView'));
    assert.strictEqual(focus.props.viewport, beforeBounds);
    near(getFridgeFocusGeometry(focus.props.draft, target, focus.props.viewport).translateY, before.translateY);
    assert.equal(measurements, 1);
    menu.unmount();
    screen.unmount();
  }
});

test('도면의 칸명은 숨기고 자동 위치 안내·선택·재료 집계는 유지한다', () => {
  const layout = model.getDraftLayout(model.createRefrigeratorDraft());
  const selected = [];
  const props = { ...layout, showAreaLabels: false, showIngredientCounts: false,
    selectedPositionId: layout.positions[1].id, onSelectPosition: id => selected.push(id) };
  const map = mapModule.FridgeMap(props);
  assert.equal(findAll(map, node => node.type === 'Text').length, 0);
  const positions = findAll(map, node => node.type === 'FeedbackPressable');
  assert.equal(positions.length, layout.positions.length);
  assert(positions.every(position => position.props.accessibilityLabel.includes('위에서')));
  assert.equal(positions[1].props.accessibilityState.selected, true);
  positions[1].props.onPress();
  assert.deepEqual(selected, [layout.positions[1].id]);
  const withIngredients = mapModule.FridgeMap({ ...props, showIngredientCounts: true,
    ingredients: [{ id: 'ingredient-1', positionId: layout.positions[1].id }] });
  const counts = findAll(withIngredients, node => node.type === 'Text');
  assert.equal(counts.length, layout.positions.length);
  assert.equal(counts[1].props.children.join(''), '1개');
});

test('이름 입력 없이 본체 칸의 분할을 편집하고 포켓은 개수 조절만 표시한다', () => {
  const { screen, viewport, map, target, row } = registrationFixture();
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  map.props.onFocus(target);
  screen.render();
  const focus = () => find(screen.tree, named('FridgeFocusView'));
  focus().props.onPhaseChange('open');
  screen.render();
  for (const [areaId, isBody] of [[row.compartments[0].id, true], [row.doors[0].id, false]]) {
    focus().props.onSelectArea(areaId);
    screen.render();
    find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onOpenSettings();
    screen.render();
    const panel = () => find(screen.tree, node => node.props.accessibilityViewIsModal);
    assert.equal(findAll(panel(), node => node.type === 'FormTextInput').length, 0);
    const preview = find(panel(), named('FridgeMap'));
    assert.equal(findAll(preview.type(preview.props), node => node.type === 'Text').length, 0);
    const increase = find(panel(), node => node.props.accessibilityLabel?.endsWith('칸 늘리기'));
    increase.props.onPress();
    screen.render();
    const selectors = findAll(panel(), node => node.type === 'SlotStructureSelector');
    if (isBody) {
      assert.equal(selectors.length, 2);
      assert.equal(selectors[1].props.accessibilityLabel, '1단 본체 위에서 2번째 칸');
      selectors[1].props.onChange(2);
      screen.render();
      const draft = find(screen.tree, named('FridgeInteriorMap')).props.draft;
      assert.deepEqual(draft.rows[0].compartments[0].slots, [
        { name: '위에서 1번째 칸', drawerCount: 0 }, { name: '위에서 2번째 칸', drawerCount: 2 },
      ]);
      assert(find(panel(), node => node.type === 'ScrollView'));
      assert.equal(flattenStyle(panel().props.style).height, 844 * 0.75);
    } else {
      assert.equal(selectors.length, 0);
      assert.equal(find(panel(), node => node.type === 'ScrollView'), undefined);
      assert.equal(find(panel(), node => node.type === 'Text' && node.props.accessibilityRole === 'header'
        && typeof node.props.children === 'string' && node.props.children.includes('번째 칸')), undefined);
      assert.equal(flattenStyle(panel().props.style).height, undefined);
      assert.equal(flattenStyle(panel().props.style).paddingBottom, 34);
    }
  }
  screen.unmount();
});

test('포켓은 3칸·본체는 4칸까지만 추가하고 최소 한 칸과 기존 입력을 유지한다', () => {
  const { screen, viewport, map, target, row } = registrationFixture();
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  map.props.onFocus(target);
  screen.render();
  find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('open');
  screen.render();
  const getDraft = () => find(screen.tree, named('FridgeInteriorMap')).props.draft;
  const original = structuredClone(getDraft());
  for (const [areaId, limit] of [[row.doors[0].id, 3], [row.compartments[0].id, 4]]) {
    find(screen.tree, named('FridgeFocusView')).props.onSelectArea(areaId);
    screen.render();
    find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onOpenSettings();
    screen.render();
    const area = () => [...getDraft().rows[0].doors, ...getDraft().rows[0].compartments].find(area => area.id === areaId);
    const counter = action => find(screen.tree, node => node.type === 'FeedbackPressable'
      && node.props.accessibilityLabel?.endsWith(`칸 ${action}`));
    const beforeSlots = structuredClone(area().slots);
    while (area().slots.length < limit) {
      assert.equal(counter('늘리기').props.disabled, false);
      counter('늘리기').props.onPress();
      screen.render();
    }
    assert.equal(counter('늘리기').props.disabled, true);
    assert(find(screen.tree, node => node.type === 'Text' && node.props.children === `칸은 1~${limit}개까지 등록할 수 있어요.`));
    counter('늘리기').props.onPress();
    screen.render();
    assert.equal(area().slots.length, limit);
    assert.deepEqual(area().slots.slice(0, beforeSlots.length), beforeSlots);
    while (area().slots.length > 1) {
      counter('줄이기').props.onPress();
      screen.render();
    }
    assert.equal(counter('줄이기').props.disabled, true);
    counter('줄이기').props.onPress();
    screen.render();
    assert.deepEqual(area().slots, beforeSlots.slice(0, 1));
  }
  assert.deepEqual(getDraft().rows[1], original.rows[1]);
  screen.unmount();
});

test('열린 도면은 흰 프레임·모드별 내부 배경·밝은 포켓을 사용하고 X선까지 모드 색을 맞춘다', () => {
  for (const mode of ['CHILLED', 'FROZEN']) {
    const draft = model.createRefrigeratorDraft();
    draft.rows[0].compartments[0].storageMode = mode;
    draft.rows[0].compartments[0].slots = [
      { name: model.getSlotName(0), drawerCount: 2 }, { name: model.getSlotName(1), drawerCount: 0 },
    ];
    const { compartment, requests } = fixture(draft);
    selectDoor(compartment);
    const { focus } = focusedFixture(draft, requests[0]);
    const palette = tokens.fridgeDoorColors[mode];
    for (const area of interiorAreas(focus)) {
      const map = find(area.type(area.props), node => node.type === mapModule.FridgeMap);
      const tree = mapModule.FridgeMap(map.props);
      const frame = find(tree, node => children(node).includes(map.props.areaHeader));
      assert.equal(flattenStyle(frame.props.style).borderColor, '#FFFFFF');
      assert.equal(flattenStyle(frame.props.style).backgroundColor, area.props.area.isBody ? '#FFFFFF' : palette.frame);
      const content = children(frame).at(-1);
      assert.equal(flattenStyle(content.props.style).backgroundColor, area.props.area.isBody ? palette.frame : undefined);
      assert.equal(flattenStyle(frame.props.style).boxShadow[0].color, palette.motif + '14');
      assert.equal(flattenStyle(find(map.props.areaHeader, node => node.type === 'Text').props.style).color, palette.ink);
      if (area.props.area.isBody) {
        assert.equal(flattenStyle(content.props.style).borderRadius, tokens.fridgeSurfaces.cavityRadius);
        const shelf = find(tree, node => flattenStyle(node.props.style).height === 4);
        assert.equal(flattenStyle(shelf.props.style).backgroundColor, palette.shelf);
        const divider = find(tree, node => node.props.accessibilityLabel?.includes('오른쪽'));
        assert.equal(flattenStyle(divider.props.style).borderLeftColor, palette.border);
      } else {
        for (const bin of findAll(tree, named('DoorPocketBin'))) {
          const front = flattenStyle(children(bin.type(bin.props))[0].props.style);
          assert.equal(front.backgroundColor, palette.pocket);
          assert.equal(front.borderColor, palette.pocketBorder);
          assert.equal(front.borderTopColor, palette.shelf);
          assert.equal(front.borderTopWidth, 10);
          assert.equal(front.borderTopLeftRadius, 0);
          assert.equal(front.borderTopRightRadius, 0);
          assert.equal(front.borderBottomColor, palette.shelf);
          assert.equal(front.boxShadow[0].color, palette.motif + '22');
        }
      }
    }
    const empty = mount(interiorModule.DoorWithoutStorage, { label: '수납 없음', selected: false, storageMode: mode });
    empty.tree.props.onLayout({ nativeEvent: { layout: { width: 100, height: 180 } } });
    empty.render();
    const lines = findAll(empty.tree, node => flattenStyle(node.props.style).height === 2);
    assert.equal(lines.length, 2);
    assert(lines.every(line => flattenStyle(line.props.style).backgroundColor === palette.motif + '66'));
    assert.equal(flattenStyle(empty.tree.props.style).borderColor, '#FFFFFF');
    assert.equal(flattenStyle(empty.tree.props.style).backgroundColor, palette.frame);
    assert.equal(flattenStyle(empty.tree.props.style).boxShadow[0].color, palette.motif + '14');
    empty.unmount();
    focus.unmount();
  }
});

test('문의 크기와 관계없이 중앙 모드 그림만 표시하고 축소 도면에서는 이름을 숨긴다', () => {
  for (const mode of ['CHILLED', 'FROZEN']) {
    for (const size of [16, 56]) {
      for (const miniature of [false, true]) {
        const tree = mapModule.DoorModeArt({ storageMode: mode, size, miniature });
        const icons = findAll(tree, node => node.type === 'Icon');
        assert.equal(icons.length, 1);
        assert.equal(icons[0].props.name, mode === 'CHILLED' ? 'weather-windy' : 'snowflake');
        assert.equal(findAll(tree, node => node.type === 'Text').length, miniature ? 0 : 1);
      }
    }
  }
});

test('열린 수납은 모드 배경과 연한 테마 손잡이·경첩을 유지하고 선택 시 테두리만 바꾼다', () => {
  for (const mode of ['CHILLED', 'FROZEN']) {
    for (const enabled of [true, false]) {
      const draft = model.createRefrigeratorDraft();
      draft.rows[0].compartments[0].storageMode = mode;
      draft.rows[0].doors[0].storageEnabled = enabled;
      const { compartment, requests } = fixture(draft);
      selectDoor(compartment);
      const { focus } = focusedFixture(draft, requests[0]);
      animations.at(-1).finish();
      focus.render();
      for (const area of interiorAreas(focus)) {
        for (const selected of [false, true]) {
          const tree = area.type({ ...area.props, selected });
          const map = find(tree, node => node.type === mapModule.FridgeMap);
          let background;
          if (map) {
            const mapTree = mapModule.FridgeMap(map.props);
            const frame = find(mapTree, node => children(node).includes(map.props.areaHeader));
            assert.equal(flattenStyle(frame.props.style).backgroundColor,
              area.props.area.isBody ? '#FFFFFF' : tokens.fridgeDoorColors[mode].frame);
            background = flattenStyle(area.props.area.isBody ? children(frame).at(-1).props.style : frame.props.style).backgroundColor;
            const positions = findAll(mapTree, node => node.props.accessibilityLabel?.includes('위에서'));
            assert(positions.every(position => flattenStyle(position.props.style).backgroundColor === 'transparent'));
          } else {
            const empty = find(tree, named('DoorWithoutStorage'));
            const mounted = mount(empty.type, empty.props);
            background = flattenStyle(mounted.tree.props.style).backgroundColor;
            mounted.unmount();
          }
          assert.equal(background, tokens.fridgeDoorColors[mode].frame);
          const selection = find(tree, named('SelectionFrame'));
          if (selected) {
            const style = flattenStyle(selection.type(selection.props).props.style);
            assert.equal(style.borderColor, tokens.fridgeDoorColors[mode].ink);
            assert.equal(style.backgroundColor, undefined);
          } else assert.equal(selection, undefined);
        }
      }
      const handle = mapModule.DoorHandle({ storageMode: mode });
      assert.equal(flattenStyle(children(handle)[0].props.style).backgroundColor, tokens.fridgeDoorColors[mode].handle);
      assert.deepEqual(flattenStyle(handle.props.style).boxShadow, tokens.fridgeSurfaces.hardwareShadow);
      const hinges = find(focus.tree, named('DoorHinges'));
      const hinge = find(hinges.type(hinges.props), named('DoorHinge'));
      const pin = children(hinge.type(hinge.props))[0];
      assert.equal(flattenStyle(pin.props.style).backgroundColor, tokens.fridgeDoorColors[mode].handle);
      assert.deepEqual(flattenStyle(pin.props.style).boxShadow, tokens.fridgeSurfaces.hardwareShadow);
      const layout = model.getDraftLayout(draft);
      const individual = mapModule.FridgeMap({ ...layout, storageMode: mode,
        selectedPositionId: layout.positions[0].id, onSelectPosition() {} });
      const selectedSlot = find(individual, node => node.type === 'FeedbackPressable' && node.props.accessibilityState.selected);
      const slotStyle = flattenStyle(selectedSlot.props.style);
      assert.equal(slotStyle.backgroundColor, 'transparent');
      assert.equal(slotStyle.boxShadow[0].color, tokens.fridgeDoorColors[mode].ink);
      focus.unmount();
    }
  }
});

test('닫힌 문의 모드 색과 인쇄는 선택·수납 여부와 관계없이 표시하고 문 앞면과 함께 회전한다', () => {
  for (const mode of ['CHILLED', 'FROZEN']) {
    for (const enabled of [true, false]) {
      for (const merged of [false, true]) {
        let draft = model.createRefrigeratorDraft();
        const rowId = draft.rows[0].id;
        if (merged) {
          draft = model.changeDraftDoorCount(draft, rowId, 1);
          draft = model.mergeDraftCompartments(draft, rowId, draft.rows[0].compartments[0].id);
        }
        draft.rows[0].compartments[0].storageMode = mode;
        draft.rows[0].doors.forEach(door => { door.storageEnabled = enabled; });
        const { compartment, requests } = fixture(draft);
        for (const door of doors(compartment)) {
          const tree = door.type(door.props);
          const face = find(tree, node => node.type === 'Pressable');
          const art = find(children(tree)[0], named('DoorModeArt'));
          const printed = mapModule.DoorModeArt(art.props);
          assert.equal(flattenStyle(face.props.style).backgroundColor, tokens.fridgeDoorColors[mode].background);
          assert(face.props.accessibilityLabel.includes(mode === 'CHILLED' ? '냉장실' : '냉동실'));
          assert.equal(printed.props.pointerEvents, 'none');
          assert.equal(printed.props.importantForAccessibility, 'no-hide-descendants');
          assert(find(printed, node => node.type === 'Icon' && node.props.name === (mode === 'CHILLED' ? 'weather-windy' : 'snowflake')));
          assert.equal(find(printed, node => node.type === 'Text').props.children, mode === 'CHILLED' ? '냉장실' : '냉동실');
          const selected = door.type({ ...door.props, selected: true });
          assert.equal(flattenStyle(find(selected, node => node.type === 'Pressable').props.style).backgroundColor,
            flattenStyle(face.props.style).backgroundColor);
        }
        selectDoor(compartment);
        const { focus } = focusedFixture(draft, requests[0]);
        assertFocusAccess(focus, 'opening');
        for (const door of movingDoors(focus)) {
          assert.equal(find(children(door.type(door.props))[0], named('DoorModeArt')).props.storageMode, mode);
        }
        for (const area of interiorAreas(focus)) {
          const tree = area.type(area.props);
          const map = find(tree, node => node.type === mapModule.FridgeMap);
          const header = map ? map.props.areaHeader : tree;
          const label = find(header, node => node.type === 'Text');
          assert.equal(label.props.children, area.props.area.isBody ? mode === 'CHILLED' ? '냉장실' : '냉동실' : '도어포켓');
          assert.equal(find(header, node => node.type === 'Icon'), undefined);
        }
        animations.at(-1).finish();
        focus.render();
        assertFocusAccess(focus, 'open');
        focus.props.onClose();
        focus.render();
        assertFocusAccess(focus, 'closing');
        for (const door of movingDoors(focus)) {
          assert.equal(find(children(door.type(door.props))[0], named('DoorModeArt')).props.storageMode, mode);
        }
        focus.unmount();
      }
    }
  }
});

test('설정 패널에서 냉장·냉동을 변경하면 닫힌 문의 색과 인쇄 모드가 함께 갱신된다', () => {
  const { screen, viewport, map, target } = registrationFixture();
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  map.props.onFocus(target);
  screen.render();
  find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('open');
  screen.render();
  find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onOpenSettings();
  screen.render();
  for (const [mode, label] of [['FROZEN', '냉동'], ['CHILLED', '냉장']]) {
    find(screen.tree, node => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === '1단 ' + label).props.onPress();
    screen.render();
    const draft = find(screen.tree, named('FridgeInteriorMap')).props.draft;
    assert.equal(draft.rows[0].compartments[0].storageMode, mode);
    const { compartment } = fixture(draft);
    const door = doors(compartment)[0];
    const tree = door.type(door.props);
    assert.equal(find(tree, named('DoorModeArt')).props.storageMode, mode);
    assert.equal(flattenStyle(find(tree, node => node.type === 'Pressable').props.style).backgroundColor, tokens.fridgeDoorColors[mode].background);
  }
  screen.unmount();
});

test('축소 도면도 각 문에 연결된 본체의 모드를 따라 색과 그림을 갱신한다', () => {
  const { FridgeStructurePreview } = loadComponent('src/features/fridge/components/FridgeStructurePreview.tsx');
  let draft = model.createRefrigeratorDraft();
  draft = model.changeDraftDoorCount(draft, draft.rows[0].id, 1);
  draft.rows[0].compartments[0].storageMode = 'FROZEN';
  const getArt = () => findAll(FridgeStructurePreview({ rows: draft.rows }), named('DoorModeArt'));
  assert.deepEqual(getArt().map(art => art.props.storageMode), ['FROZEN', 'CHILLED', 'CHILLED']);
  const faces = findAll(FridgeStructurePreview({ rows: draft.rows }), node => children(node).some(named('DoorModeArt')));
  assert.deepEqual(faces.map(face => flattenStyle(face.props.style).backgroundColor), [
    tokens.fridgeDoorColors.FROZEN.background, tokens.fridgeDoorColors.CHILLED.background, tokens.fridgeDoorColors.CHILLED.background,
  ]);
  for (const art of getArt()) {
    const tree = art.type(art.props);
    assert.equal(tree.props.pointerEvents, 'none');
    assert.equal(find(tree, node => node.type === 'Text'), undefined);
    assert(find(tree, node => node.type === 'Icon'));
  }
  draft.rows[0].compartments[0].storageMode = 'CHILLED';
  assert.equal(getArt()[0].props.storageMode, 'CHILLED');
});

test('서로 다른 모드의 본체를 합쳐 미설정이 되면 모든 문에서 이전 색과 인쇄를 제거한다', () => {
  let draft = model.createRefrigeratorDraft();
  const rowId = draft.rows[0].id;
  draft = model.changeDraftDoorCount(draft, rowId, 1);
  draft.rows[0].compartments[1].storageMode = 'FROZEN';
  draft = model.mergeDraftCompartments(draft, rowId, draft.rows[0].compartments[0].id);
  assert.equal(draft.rows[0].compartments[0].storageMode, null);
  const { compartment } = fixture(draft);
  for (const door of doors(compartment)) {
    const tree = door.type(door.props);
    const art = find(tree, named('DoorModeArt'));
    assert.equal(mapModule.DoorModeArt(art.props), null);
    const face = find(tree, node => node.type === 'Pressable');
    assert.equal(flattenStyle(face.props.style).backgroundColor, tokens.fridgeSurfaces.exterior);
    assert(face.props.accessibilityLabel.includes('보관 모드 미설정'));
  }
});
