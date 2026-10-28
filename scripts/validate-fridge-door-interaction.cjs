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
          this.callback({ finished });
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
    const { group, rowIndex, width, height } = compartment.props;
    callback(24 + (327 - width) / 2 + group.left * width, 210 - scrollY + rowIndex * height, group.width * width, height);
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
function registrationFixture(doorCount = 1) {
  const screen = mount(RefrigeratorRegistrationScreen, { navigation: { goBack() {}, dispatch() {} } });
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
  assert.equal(flattenStyle(bodyFrame.props.style).borderWidth, 1);
  assert(flattenStyle(bodyFrame.props.style).backgroundColor);
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
    near(first.frame.left + first.frame.width + 3, body.left);
    near(second.frame.left, body.left + body.width + 3);
    const { focus } = focusedFixture(draft, requests[0]);
    assert.equal(interiorAreas(focus).length, 3);
    assert.equal(movingDoors(focus).length, 2);
    const hinges = findAll(moving(focus), named('DoorHinges'));
    assert.equal(hinges.length, 2);
    for (const hinge of hinges) {
      const bars = findAll(hinge.type(hinge.props), named('DoorHinge')).map(pin => pin.type(pin.props));
      assert(bars.length >= 2);
      assert(bars.every(bar => flattenStyle(bar.props.style).width <= 3));
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
  near(merged.source.width, 324);
  assert.equal(merged.pockets.length, 2);
  draft = model.splitDraftCompartment(draft, rowId, target.areaId);
  const split = getFridgeFocusGeometry(draft, target, viewport);
  near(split.source.width, 327 / 2 - 4.5);
  near(split.source.x, 25.5);
  near(split.source.y, 213);
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
    near(merged.source.width, 324);
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

test('이웃이 없거나 합산 4칸을 넘으면 어느 본체에서도 합치기를 비활성화한다', () => {
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
    menu().props.onOpenSettings();
    screen.render();
    for (let count = 1; count < model.MAX_SLOTS; count++) {
      find(screen.tree, node => node.props.accessibilityLabel?.endsWith('칸 늘리기')).props.onPress();
      screen.render();
    }
    assert.equal(menu().props.mergeDisabled, true);
    assert.equal(menu().props.mergeLimitExceeded, true);
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
  near(geometry.body.fromHeight, 129);
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
        near(geometry.pockets[0].frame.left + geometry.pockets[0].frame.width + 3, geometry.body.left);
      } else {
        near(bodyLeft, 24);
        near(geometry.initialScrollX, 0);
        near(geometry.pockets[0].frame.left, geometry.body.left + geometry.body.width + 3);
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
      const hint = find(focus.tree, node => node.type === 'Text' && node.props.children === '좌우로 밀어 확인');
      assert(flattenStyle(hint.props.style).top >= scrollFrame.top + scrollFrame.height);
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

test('본체·포켓 배지는 내부 상단에 표시하고 별도 닫기 버튼 없이 바깥 영역에서 닫는다', () => {
  const { draft, requests, compartment, map } = fixture();
  selectDoor(compartment);
  const { focus } = focusedFixture(draft, requests[0]);
  const labels = interiorAreas(focus).map(area => {
    const tree = area.type(area.props);
    const map = find(tree, node => node.type === mapModule.FridgeMap);
    const header = map.props.areaHeader;
    const badge = find(header, node => children(node).some(child => child.type === 'Text' && ['본체', '도어포켓'].includes(child.props.children)));
    assert.equal(flattenStyle(badge.props.style).position, undefined);
    assert.equal(header.props.pointerEvents, 'none');
    const frame = find(mapModule.FridgeMap(map.props), node => children(node).includes(header));
    assert.equal(flattenStyle(frame.props.style).overflow, 'hidden');
    return children(badge)[0].props.children;
  });
  assert.deepEqual(labels, ['본체', '도어포켓']);
  assert.equal(findAll(focus.tree, node => node.type === 'SecondaryButton').length, 0);
  const outside = find(children(focus.tree)[0], node => node.type === 'Pressable');
  assert.equal(outside.props.accessibilityRole, 'button');
  assert.equal(children(outside).length, 0);
  map.props = { ...map.props, focus: requests[0] };
  map.render();
  assert(children(children(map.tree)[0]).every(named('FridgeCompartment')));
  assert.equal(flattenStyle(compartment.tree.props.style).opacity, 0);
  const modeBadges = interiorAreas(focus).flatMap(area => findAll(area.type(area.props), node => node.type === mapModule.FridgeMap)
    .flatMap(map => findAll(map.props.areaHeader, named('ModeBadge'))));
  assert.equal(modeBadges.length, 2);
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
    const badge = find(front, named('ModeBadge'));
    assert.equal(badge.props.storageMode, draft.rows[0].compartments[0].storageMode);
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
      near(groups.at(-1).props.rowIndex * groups.at(-1).props.height + groups.at(-1).props.height, height);
      const last = mount(groups.at(-1).type, groups.at(-1).props);
      last.tree.props.ref.current = { measureInWindow(callback) {
        callback(24 + (availableWidth - width) / 2, 200 + last.props.rowIndex * last.props.height, width, last.props.height);
      } };
      selectDoor(last);
      near(targets[0].canvas.height, height);
      near(targets[0].canvas.width, width);
      near(targets[0].canvas.x, 24 + (availableWidth - width) / 2);
      near(targets[0].canvas.y, 200);
      const geometry = getFridgeFocusGeometry(draft, targets[0], { x: 0, y: 110, width: 375, height: 500 });
      near(geometry.body.fromHeight, height / rowCount - 6);
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

test('경첩 양쪽 끝이 실제 본체·포켓 테두리에 맞닿는다', () => {
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
      near(Math.abs(bodyEdge - pocketEdge), 3);
      for (const bar of bars) {
        const style = flattenStyle(bar.props.style);
        near(hingeStyle.left + style.left, Math.min(bodyEdge, pocketEdge));
        near(hingeStyle.left + style.left + style.width, Math.max(bodyEdge, pocketEdge));
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

test('포켓·본체 모두 4칸까지만 추가하고 최소 한 칸과 기존 입력을 유지한다', () => {
  const { screen, viewport, map, target, row } = registrationFixture();
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  map.props.onFocus(target);
  screen.render();
  find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('open');
  screen.render();
  const getDraft = () => find(screen.tree, named('FridgeInteriorMap')).props.draft;
  const original = structuredClone(getDraft());
  for (const [areaId, limit] of [[row.doors[0].id, 4], [row.compartments[0].id, 4]]) {
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

test('냉장·냉동 배지는 움직이는 문 앞면에 유지하고 수납 여부와 관계없이 포켓도 본체 모드를 따른다', () => {
  for (const mode of ['CHILLED', 'FROZEN']) {
    for (const enabled of [true, false]) {
      const draft = model.createRefrigeratorDraft();
      draft.rows[0].compartments[0].storageMode = mode;
      draft.rows[0].doors[0].storageEnabled = enabled;
      const { compartment, requests } = fixture(draft);
      const closedDoor = doors(compartment).at(-1);
      const badge = find(closedDoor.type(closedDoor.props), named('ModeBadge'));
      const badgeStyle = flattenStyle(badge.type(badge.props).props.style);
      const card = flattenStyle(closedDoor.props.style);
      assert(badgeStyle.top >= 3);
      assert(badgeStyle.top + badgeStyle.height <= card.height - 3);
      assert(badgeStyle.right >= 0 && badgeStyle.right + badgeStyle.width <= card.width);
      selectDoor(compartment);
      const { focus } = focusedFixture(draft, requests[0]);
      const movingDoor = movingDoors(focus).at(-1);
      const movingBadge = find(children(movingDoor.type(movingDoor.props))[0], named('ModeBadge'));
      assert.equal(movingBadge.props.storageMode, mode);
      assert.deepEqual(flattenStyle(movingBadge.props.style), flattenStyle(badge.props.style));
      assertFocusAccess(focus, 'opening');
      for (const area of interiorAreas(focus)) {
        const tree = area.type(area.props);
        const map = find(tree, node => node.type === mapModule.FridgeMap);
        const modeBadge = find(map ? map.props.areaHeader : tree, named('ModeBadge'));
        assert.equal(modeBadge.props.storageMode, mode);
        const icon = find(modeBadge.type(modeBadge.props), node => node.type === 'Icon');
        assert.equal(icon.props.name, mode === 'CHILLED' ? 'thermometer-low' : 'snowflake');
      }
      animations.at(-1).finish();
      focus.render();
      assertFocusAccess(focus, 'open');
      focus.props.onClose();
      focus.render();
      assertFocusAccess(focus, 'closing');
      const closingDoor = movingDoors(focus).at(-1);
      assert.equal(find(children(closingDoor.type(closingDoor.props))[0], named('ModeBadge')).props.storageMode, mode);
      focus.unmount();
    }
  }
});
