/**
 * @file
 * 실제 등록·홈 도면의 문 전환·선택·접근성 경계와 기본 탭 구성을 검사한다.
 * 훅과 애니메이션 완료 신호만 대체하며, 네이티브 화면의 움직임·터치 감각은 별도 확인한다.
 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const model = require('../src/features/fridge/model/fridgeLayout.ts');
const ingredientModel = require('../src/features/ingredient/model/ingredient.ts');
const tokens = require('../src/theme/tokens.ts');
const { alertTitles } = require('../src/constants/alertTitles.ts');
const { fridgeMessages } = require('../src/features/fridge/constants/messages.ts');
const database = {};
const alerts = [];
const backHandlers = new Set();
const repository = {
  async registerRefrigerator() { throw new Error('저장 동작을 지정하지 않았습니다.'); },
  async updateRefrigerator() { throw new Error('수정 동작을 지정하지 않았습니다.'); },
  async updateRefrigeratorName() { throw new Error('이름 변경 동작을 지정하지 않았습니다.'); },
  async getRefrigerator() { return null; },
};
const ingredientRepository = {
  async getIngredients() { return []; },
  async getIngredientsByPosition() { return []; },
  async registerIngredient() { throw new Error('재료 등록 동작을 지정하지 않았습니다.'); },
};

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
  View: 'View', Pressable: 'Pressable', Text: 'Text', ScrollView: 'ScrollView', FlatList: 'FlatList', Switch: 'Switch', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView',
  Keyboard: { dismiss() {}, isVisible() { return false; }, addListener() { return { remove() {} }; } }, Platform: { OS: 'ios', Version: '26.1' },
  ActivityIndicator: 'ActivityIndicator', Alert: { alert(...args) { alerts.push(args); } },
  BackHandler: { addEventListener(event, handler) {
    assert.equal(event, 'hardwareBackPress');
    backHandlers.add(handler);
    return { remove() { backHandlers.delete(handler); } };
  } },
  useWindowDimensions: () => ({ width: 375, height: 844 }),
  StyleSheet: { create: value => value, hairlineWidth: 1, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } },
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
let structureModule;
let menuModule;
let quantityStepperModule;
let diagramLayoutModule;
let iosHomeButtonModule;
let defaultHomeButtonModule;
const swiftUIModifiers = Object.fromEntries([
  'accessibilityHidden', 'accessibilityHint', 'accessibilityLabel', 'buttonBorderShape', 'buttonStyle', 'controlSize', 'datePickerStyle',
  'disabled', 'environment', 'frame', 'onGeometryChange', 'tint',
].map(name => [name, value => ({ type: name, value })]));
function loadComponent(path, overrides = {}) {
  const source = readFileSync(resolve(__dirname, '..', path), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  const dependencies = {
    react: hooks, 'react-native': native,
    '@react-native-vector-icons/material-design-icons': { MaterialDesignIcons: 'Icon' },
    '@/components/PrimaryButton': { PrimaryButton: 'PrimaryButton' },
    '@/components/SelectionCheck': { SelectionCheck: 'SelectionCheck' },
    '@/components/FormTextInput': { FormTextInput: 'FormTextInput' },
    '@/components/FeedbackPressable': { FeedbackPressable: 'FeedbackPressable' },
    '@/components/QuantityStepper': quantityStepperModule,
    '@/constants/alertTitles': { alertTitles },
    '@/features/fridge/constants/messages': { fridgeMessages },
    '@expo/ui/swift-ui': { Button: 'SwiftUIButton', DatePicker: 'SwiftUIDatePicker', Host: 'SwiftUIHost', Label: 'SwiftUILabel', RNHostView: 'RNHostView', Spacer: 'SwiftUISpacer' },
    '@expo/ui/swift-ui/modifiers': swiftUIModifiers,
    '@expo/ui/jetpack-compose': { Box: 'ComposeBox', Host: 'ComposeHost' },
    '@expo/ui/jetpack-compose/modifiers': {
      fillMaxSize: () => ({ type: 'fillMaxSize' }),
      onGloballyPositioned: callback => ({ type: 'onGloballyPositioned', value: callback }),
    },
    '@expo/ui/community/bottom-sheet': { BottomSheet: 'BottomSheet' },
    '@/features/ingredient/model/ingredient': ingredientModel,
    '@expo/ui/community/datetime-picker': { DateTimePicker: 'DateTimePicker' },
    '@react-native-community/datetimepicker': { __esModule: true, default: 'UIKitDateTimePicker' },
    '@/features/ingredient/components/IngredientExpirationCalendar': { IngredientExpirationCalendar: 'IngredientExpirationCalendar' },
    '@/features/ingredient/components/IngredientDateFieldAnchor': { IngredientDateFieldAnchor: 'IngredientDateFieldAnchor' },
    '@/features/ingredient/components/IngredientExpirationDatePicker': { IngredientExpirationDatePicker: 'IngredientExpirationDatePicker' },
    '@/features/fridge/components/FridgeHomeButton': { FridgeHomeButton(props) {
      return (native.Platform.OS === 'ios' ? iosHomeButtonModule : defaultHomeButtonModule).FridgeHomeButton(props);
    } },
    'expo-sqlite': { useSQLiteContext: () => database },
    '@/db/refrigeratorRepository': repository,
    '@/db/ingredientRepository': ingredientRepository,
    '@/features/ingredient/components/IngredientListSheet': { IngredientListSheet: 'IngredientListSheet' },
    '@/features/fridge/model/fridgeLayout': model, '../model/fridgeLayout': model,
    '@/features/fridge/components/FridgeMap': mapModule, '@/theme/tokens': tokens,
    '@/features/fridge/components/FridgeInteriorMap': interiorModule,
    '@/features/fridge/components/fridgeDiagramLayout': diagramLayoutModule,
    '@/features/fridge/components/FridgeAreaMenu': { ...menuModule, FridgeAreaMenu: 'FridgeAreaMenu' },
    '@/features/fridge/components/FridgeStructurePreview': {
      FridgeStructurePreview: 'FridgeStructurePreview',
      STRUCTURE_PREVIEW_ASPECT_RATIO: structureModule?.STRUCTURE_PREVIEW_ASPECT_RATIO,
    },
    '@/features/fridge/components/SlotStructureSelector': { SlotStructureSelector: 'SlotStructureSelector' },
    '@react-navigation/native': {
      usePreventRemove(enabled, onRemove) { current.preventRemove = { enabled, onRemove }; },
      useFocusEffect(effect) {
        const instance = current;
        hooks.useEffect(() => {
          instance.focus = () => {
            instance.focusCleanup?.();
            instance.focusCleanup = effect();
          };
          instance.focus();
          return () => instance.focusCleanup?.();
        }, [effect]);
      },
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }) },
    'react-native-screens/experimental': { SafeAreaView: 'SafeAreaView' },
    ...overrides,
  };
  new Function('require', 'module', 'exports', output)(name => name in dependencies ? dependencies[name] : require(name), module, module.exports);
  return module.exports;
}
quantityStepperModule = loadComponent('src/components/QuantityStepper.tsx');
iosHomeButtonModule = loadComponent('src/features/fridge/components/FridgeHomeButton.ios.tsx');
defaultHomeButtonModule = loadComponent('src/features/fridge/components/FridgeHomeButton.tsx');
mapModule = loadComponent('src/features/fridge/components/FridgeMap.tsx');
diagramLayoutModule = loadComponent('src/features/fridge/components/fridgeDiagramLayout.ts');
interiorModule = loadComponent('src/features/fridge/components/FridgeInteriorMap.tsx');
structureModule = loadComponent('src/features/fridge/components/FridgeStructurePreview.tsx');
const { FridgeInteriorMap, FridgeFocusView, getFridgeFocusGeometry } = interiorModule;
menuModule = loadComponent('src/features/fridge/components/FridgeAreaMenu.tsx');
const { FridgeAreaMenu, FRIDGE_MENU_RESERVED_SPACE } = menuModule;
const { RefrigeratorRegistrationScreen } = loadComponent('src/screens/RefrigeratorRegistrationScreen.tsx');
const { HomeScreen } = loadComponent('src/screens/HomeScreen.tsx');
const { IngredientListSheet } = loadComponent('src/features/ingredient/components/IngredientListSheet.tsx');
const { IngredientExpirationCalendar } = loadComponent('src/features/ingredient/components/IngredientExpirationCalendar.tsx');
const children = node => node?.type === quantityStepperModule.QuantityStepper || node?.type?.name === 'FridgeHomeButton'
  ? [node.type(node.props)] : [node?.props?.children].flat(Infinity).filter(child => child?.type);
const flattenStyle = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of children(node)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}
const named = name => node => node?.type?.name === name;
const homeButton = screen => find(screen.tree, node => node.props.accessibilityLabel === '홈으로 이동'
  || node.type === 'SwiftUIButton' && node.props.modifiers.some(modifier => modifier.type === 'accessibilityLabel' && modifier.value === '홈으로 이동'));
const homeButtonDisabled = button => button.props.disabled
  ?? button.props.modifiers.find(modifier => modifier.type === 'disabled').value;
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
function registrationFixture(doorCount = 1, rowCount = 2, navigation = { goBack() {}, dispatch() {} }) {
  const screen = mount(RefrigeratorRegistrationScreen, { navigation });
  if (rowCount === 1) {
    find(screen.tree, node => node.props.accessibilityLabel === '2단 삭제').props.onPress();
    screen.render();
  }
  if (doorCount === 2) {
    find(screen.tree, node => node.props.accessibilityLabel === '1단 문 늘리기').props.onPress();
    screen.render();
  }
  find(screen.tree, node => node.props.accessibilityLabel === '내부 설정으로 이동').props.onPress();
  animations.at(-1).finish();
  screen.render();
  const viewport = find(screen.tree, node => node.type === 'View' && node.props.ref && node.props.onLayout);
  const map = find(screen.tree, named('FridgeInteriorMap'));
  const row = map.props.draft.rows[0];
  const target = { areaId: row.compartments[0].id, returnAreaId: row.doors[0].id,
    canvas: { x: 24, y: 210, width: 327, height: 540 } };
  return { screen, viewport, map, row, target };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function savedRefrigerator(name) {
  const draft = model.createRefrigeratorDraft();
  for (const row of draft.rows) {
    for (const area of [...row.compartments, ...row.doors]) {
      area.slots = area.slots.map((slot, index) => ({ ...slot, id: `${area.id}-slot-${index}` }));
    }
  }
  return { id: 'saved', name, rows: draft.rows };
}

/** 목록의 추가 버튼을 눌러 등록 폼을 열고, 실제 필드·저장 이벤트로 검사한다. */
async function ingredientFormFixture(t, onClose = () => {}) {
  const sheet = mount(IngredientListSheet, {
    position: { id: 'slot-left', slotId: 'slot', drawerNumber: 1 },
    onClose,
  });
  t.after(() => sheet.unmount());
  await new Promise(setImmediate);
  sheet.render();
  find(sheet.tree, node => node.props.accessibilityLabel === '재료 추가').props.onPress();
  animations.at(-1).finish();
  sheet.render();
  const input = label => find(sheet.tree, node => node.props.accessibilityLabel === label);
  return {
    sheet,
    input,
    save: () => find(sheet.tree, node => node.props.accessibilityLabel === '재료 등록'),
    openCalendar() {
      input('유통기한 날짜 선택').props.onPress();
      sheet.render();
      find(sheet.tree, node => node.type === 'IngredientDateFieldAnchor').props.onMeasure({ x: 24, y: 360, width: 327, height: 52 });
      sheet.render();
    },
  };
}
const moving = focus => find(focus.tree, node => typeof node.props?.onStartShouldSetResponder === 'function');
const toolbarTree = screen => FridgeAreaMenu(find(screen.tree, node => node.type === 'FridgeAreaMenu').props);
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
  const verticalScroll = find(focus.tree, node => node.type === 'ScrollView' && node.props.horizontal === false);
  assert.equal(moving(focus).props.onStartShouldSetResponder(), !horizontalScroll && !verticalScroll);
  if (phase !== 'open') {
    assert.equal(horizontalScroll, undefined);
    assert.equal(verticalScroll, undefined);
  }
  const hinges = find(moving(focus), node => children(node).some(named('DoorHinges')));
  if (hinges) {
    const opacity = flattenStyle(hinges.props.style).opacity;
    assert.deepEqual(opacity.inputRange, [0, 0.5, 1]);
    assert.deepEqual(opacity.outputRange, [0, 0, 1]);
    assert.equal(opacity.extrapolate, 'clamp');
    assert.strictEqual(opacity.value, movingDoors(focus)[0].props.progress);
    assert.equal(hinges.props.pointerEvents, 'none');
    assert.equal(hinges.props.importantForAccessibility, 'no-hide-descendants');
  }
  const layers = findAll(moving(focus), node => ['View', 'Animated.View'].includes(node.type) && children(node).some(named('InteriorArea')));
  assert(layers.length >= 1);
  const bodyContent = layers.find(layer => children(layer).some(node => named('InteriorArea')(node) && node.props.area.isBody));
  const bodyPanel = find(moving(focus), node => children(node).includes(bodyContent));
  if (hinges) {
    const hingeMovement = flattenStyle(hinges.props.style).transform;
    const bodyMovement = flattenStyle(bodyPanel.props.style).transform;
    for (const axis of ['translateX', 'translateY']) {
      const hingeValue = hingeMovement.find(transform => transform[axis])[axis];
      const bodyValue = bodyMovement.find(transform => transform[axis])[axis];
      assert.strictEqual(hingeValue.value, bodyValue.value);
      assert.deepEqual(hingeValue.outputRange, bodyValue.outputRange);
    }
  }
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
  assert.equal(flattenStyle(bodyFrame.props.style).boxShadow, undefined);
  assert.equal(children(children(bodyFrame)[0]).length, 0);
  assert.equal(flattenStyle(bodyFrame.props.style).opacity ?? 1, 1);
  assert.equal(flattenStyle(bodyPanel.props.style).opacity ?? 1, 1);
  assert.equal(bodyFrame.props.pointerEvents, 'none');
  assert.equal(bodyFrame.props.importantForAccessibility, 'no-hide-descendants');
  for (const layer of layers) {
    assert.equal(flattenStyle(layer.props.style).opacity ?? 1, 1);
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
      assert.equal(flattenStyle(content.props.style).opacity ?? 1, 1);
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

test('닫힌 도면은 단을 여백 없이 붙이고 문에 선택 테두리를 표시하지 않는다', () => {
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
    const rowHeight = canvasStyle.height / count;
    for (let rowIndex = 0; rowIndex < count; rowIndex++) {
      let end = 0;
      for (const group of groups.filter(node => node.props.rowIndex === rowIndex)) {
        const component = mount(group.type, group.props);
        near(flattenStyle(component.tree.props.style).top, rowIndex * rowHeight);
        near(flattenStyle(component.tree.props.style).height, rowHeight);
        for (const door of doors(component)) {
          const tree = door.type(door.props);
          const face = flattenStyle(children(tree)[0].props.style);
          const surface = flattenStyle(find(tree, node => node.type === 'Pressable').props.style);
          assert.equal(face.top, 0);
          assert.equal(face.bottom, 0);
          assert.equal(surface.borderRadius, 0);
          assert.equal(surface.borderWidth, 0);
          assert.equal(surface.borderTopWidth ?? surface.borderWidth, 0);
          const start = group.props.group.left * canvasStyle.width + door.props.style.left;
          near(start, end);
          assert.equal(surface.borderLeftWidth ?? surface.borderWidth, 0);
          end = start + door.props.style.width;
          const contactColor = '#c0c9cf';
          assert.equal(surface.borderRightWidth ?? surface.borderWidth, end < canvasStyle.width ? 4 : 0);
          assert.equal(surface.borderBottomWidth ?? surface.borderWidth, rowIndex < count - 1 ? 4 : 0);
          assert.equal(surface.borderRightColor, end < canvasStyle.width ? contactColor : undefined);
          assert.equal(surface.borderBottomColor, rowIndex < count - 1 ? contactColor : undefined);
          assert.equal(surface.borderTopLeftRadius, 0);
          assert.equal(surface.borderTopRightRadius, 0);
          assert.equal(surface.borderBottomLeftRadius, 0);
          assert.equal(surface.borderBottomRightRadius, 0);
          assert.equal(find(door.type({ ...door.props, selected: true }), named('SelectionFrame')), undefined);
        }
        const geometry = getFridgeFocusGeometry(draft, { areaId: group.props.group.body.id,
          returnAreaId: group.props.group.body.doorIds[0], canvas: { x: 10, y: 20, width: canvasStyle.width, height: canvasStyle.height } },
          { x: 0, y: 0, width: 375, height: 600 });
        near(geometry.source.y, 20 + rowIndex * rowHeight);
        near(geometry.source.height, rowHeight);
        near(geometry.source.width, group.props.group.width * canvasStyle.width);
        component.unmount();
      }
      near(end, canvasStyle.width);
    }
  }
});

test('상단 화살표·등록 체크의 크기를 맞추고 이전 단계 이동과 입력 제한을 유지한다', () => {
  let cancelled = 0;
  const basic = mount(RefrigeratorRegistrationScreen, { navigation: { goBack() { cancelled++; }, dispatch() {} } });
  const back = find(basic.tree, node => node.props.accessibilityLabel === '냉장고 등록 취소');
  const icon = find(back, node => node.type === 'Icon');
  assert.equal(icon.props.name, 'arrow-left');
  assert.equal(icon.props.size, 32);
  assert.equal(find(back, node => node.type === 'Text'), undefined);
  assert.equal(flattenStyle(back.props.style).width, 48);
  assert.equal(flattenStyle(back.props.style).height, 48);
  const next = () => find(basic.tree, node => node.props.accessibilityLabel === '내부 설정으로 이동');
  const nextIcon = find(next(), node => node.type === 'Icon');
  assert.equal(nextIcon.props.name, 'arrow-right');
  assert.equal(nextIcon.props.size, icon.props.size);
  assert.deepEqual(flattenStyle(next().props.style), flattenStyle(back.props.style));
  assert.equal(find(next(), node => node.type === 'Text'), undefined);
  find(basic.tree, node => node.props.accessibilityLabel === '냉장고 이름').props.onChangeText('  ');
  basic.render();
  assert.equal(next().props.disabled, true);
  find(basic.tree, node => node.props.accessibilityLabel === '냉장고 이름').props.onChangeText('우리 집 냉장고');
  basic.render();
  assert.equal(next().props.disabled, false);
  back.props.onPress();
  assert.equal(cancelled, 1);
  basic.unmount();
  for (const expanded of [false, true]) {
    const { screen, viewport, map, target } = registrationFixture(2);
    const before = structuredClone(map.props.draft);
    const register = find(screen.tree, node => node.props.accessibilityLabel === '냉장고 등록');
    const registerIcon = find(register, node => node.type === 'Icon');
    assert.equal(registerIcon.props.name, 'checkbox-marked-circle-plus-outline');
    assert.equal(registerIcon.props.size, 32);
    assert.equal(flattenStyle(register.props.style).width, 48);
    assert.equal(flattenStyle(register.props.style).height, 48);
    assert.equal(find(register, node => node.type === 'Text'), undefined);
    assert.equal(register.props.disabled, false);
    if (expanded) {
      viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
      map.props.onFocus(target);
      screen.render();
      assert.equal(find(screen.tree, node => node.props.accessibilityLabel === '기본 정보로 돌아가기').props.disabled, true);
      find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('open');
      screen.render();
      find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onCategoryChange('slots');
      screen.render();
    }
    const previous = find(screen.tree, node => node.props.accessibilityLabel === '기본 정보로 돌아가기');
    assert.equal(previous.props.disabled, false);
    previous.props.onPress();
    screen.render();
    assert.equal(find(screen.tree, named('FridgeFocusView')), undefined);
    animations.at(-1).finish();
    screen.render();
    assert(find(screen.tree, node => node.props.accessibilityLabel === '내부 설정으로 이동'));
    assert(find(screen.tree, node => node.props.accessibilityLabel === '냉장고 등록 취소'));
    assert.deepEqual(find(screen.tree, named('FridgeInteriorMap')).props.draft, before);
    screen.unmount();
  }
});

test('홈 버튼은 Material 홈 아이콘과 iOS 버전별 네이티브 스타일을 사용하고 Android 버튼을 유지한다', t => {
  const previous = { ...native.Platform };
  t.after(() => Object.assign(native.Platform, previous));
  for (const [platform, version, expectedStyle] of [
    ['ios', '26.1.1', 'glass'], ['ios', '18.7', 'bordered'], ['android', 35, null],
  ]) {
    native.Platform.OS = platform;
    native.Platform.Version = version;
    let pressed = 0;
    const module = platform === 'ios' ? iosHomeButtonModule : defaultHomeButtonModule;
    const control = mount(module.FridgeHomeButton, { disabled: false, onPress() { pressed++; } });
    t.after(() => control.unmount());
    const button = () => homeButton(control);
    if (platform === 'ios') {
      assert.equal(control.tree.type, 'SwiftUIHost');
      assert.equal(control.tree.props.matchContents, true);
      assert.equal(control.tree.props.ignoreSafeArea, 'all');
      assert.equal(button().type, 'SwiftUIButton');
      assert.equal(button().props.systemImage, undefined);
      const label = button().props.children;
      assert.equal(label.type, 'SwiftUILabel');
      assert.equal(label.props.title, '홈');
      assert.equal(label.props.icon.type, 'RNHostView');
      assert.equal(label.props.icon.props.matchContents, true);
      assert.equal(label.props.icon.props.children.type, 'Icon');
      assert.equal(label.props.icon.props.children.props.name, 'home');
      assert.equal(label.props.icon.props.children.props.pointerEvents, 'none');
      assert.equal(button().props.modifiers.find(modifier => modifier.type === 'buttonStyle').value, expectedStyle);
      assert.equal(button().props.modifiers.find(modifier => modifier.type === 'accessibilityLabel').value, '홈으로 이동');
    } else {
      assert.equal(button().type, 'FeedbackPressable');
      assert.equal(find(control.tree, node => node.type === 'SwiftUIHost'), undefined);
      assert.equal(find(control.tree, node => node.type === 'Icon').props.name, 'home');
    }
    button().props.onPress();
    assert.equal(pressed, 1);
    control.props.disabled = true;
    control.render();
    assert.equal(homeButtonDisabled(button()), true);
  }
});

test('편집 내부 설정의 홈 버튼은 도면·메뉴·이전 단계를 거치거나 저장하지 않고 홈으로 이동한다', async t => {
  for (const expanded of [false, true]) await t.test(expanded ? '도면·하위 메뉴 열림' : '전체 도면', async t => {
    const previous = { ...repository };
    t.after(() => Object.assign(repository, previous));
    const saved = savedRefrigerator('홈으로 나갈 냉장고');
    const before = structuredClone(saved);
    repository.getRefrigerator = async () => structuredClone(saved);
    let writes = 0;
    repository.registerRefrigerator = repository.updateRefrigerator = async () => { writes++; };
    let removed = 0;
    const action = { type: 'GO_BACK' };
    const screen = mount(RefrigeratorRegistrationScreen, {
      navigation: {
        goBack() { screen.preventRemove.onRemove({ data: { action } }); },
        dispatch(value) { assert.strictEqual(value, action); removed++; },
      }, route: { params: { refrigeratorId: saved.id } },
    });
    t.after(() => screen.unmount());
    await new Promise(setImmediate);
    screen.render();
    assert.equal(homeButton(screen), undefined);
    find(screen.tree, node => node.props.accessibilityLabel === '1단 문 늘리기').props.onPress();
    screen.render();
    find(screen.tree, node => node.props.accessibilityLabel === '내부 설정으로 이동').props.onPress();
    animations.at(-1).finish();
    screen.render();
    if (expanded) {
      const viewport = find(screen.tree, node => node.type === 'View' && node.props.ref && node.props.onLayout);
      viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
      const map = find(screen.tree, named('FridgeInteriorMap'));
      const row = map.props.draft.rows[0];
      map.props.onFocus({ areaId: row.compartments[0].id, returnAreaId: row.doors[0].id,
        canvas: { x: 24, y: 210, width: 327, height: 540 } });
      screen.render();
      find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('open');
      screen.render();
      find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onCategoryChange('slots');
      screen.render();
    }
    const animationCount = animations.length;
    homeButton(screen).props.onPress();
    assert.equal(removed, 1);
    assert.equal(writes, 0);
    assert.equal(animations.length, animationCount);
    assert.deepEqual(saved, before);
  });
});

test('홈 버튼은 안전 영역·실제 툴바·하위 메뉴 위로 이동하고 도면 위치와 크기를 유지한다', t => {
  let removed = 0;
  const { screen, viewport, map, target } = registrationFixture(2, 2, {
    goBack() { removed++; }, dispatch() {},
  });
  t.after(() => screen.unmount());
  const home = () => homeButton(screen);
  const control = () => find(screen.tree, named('FridgeHomeButton'));
  const position = () => flattenStyle(control().props.style);
  assert.equal(position().position, 'absolute');
  assert.equal(position().left, tokens.spacing.lg);
  assert.equal(position().bottom, 34 + tokens.spacing.md);
  const closedSize = structuredClone(map.props.layoutSize);
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  map.props.onFocus(target);
  screen.render();
  assert.equal(homeButtonDisabled(home()), true);
  home().props.onPress();
  assert.equal(removed, 0);
  const toolbar = find(screen.tree, node => children(node).some(child => child.type === 'FridgeAreaMenu'));
  toolbar.props.onLayout({ nativeEvent: { layout: { height: 120 } } });
  find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('open');
  screen.render();
  assert.equal(homeButtonDisabled(home()), false);
  assert.equal(position().bottom, 120 + tokens.spacing.md);
  const focus = find(screen.tree, named('FridgeFocusView'));
  const bounds = structuredClone(focus.props.viewport);
  const openedSize = structuredClone(focus.props.sizeViewport);
  find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onCategoryChange('slots');
  screen.render();
  assert.equal(position().bottom, 120 + diagramLayoutModule.FRIDGE_SUBMENU_HEIGHT
    + diagramLayoutModule.FRIDGE_SUBMENU_BOTTOM_SPACE + tokens.spacing.md);
  assert.deepEqual(find(screen.tree, named('FridgeFocusView')).props.viewport, bounds);
  assert.deepEqual(find(screen.tree, named('FridgeFocusView')).props.sizeViewport, openedSize);
  assert.deepEqual(find(screen.tree, named('FridgeInteriorMap')).props.layoutSize, closedSize);
  assert(children(screen.tree).includes(control()), '홈 버튼은 단계·도면 배치 밖에 떠 있어야 한다');
  find(screen.tree, named('FridgeFocusView')).props.onClose();
  screen.render();
  assert.equal(homeButtonDisabled(home()), true);
  assert.equal(position().bottom, 34 + tokens.spacing.md);
  home().props.onPress();
  assert.equal(removed, 0);
});

test('등록 체크는 한 번만 저장하고 성공 알림을 확인할 때까지 입력·뒤로가기를 막는다', async t => {
  const previous = repository.registerRefrigerator;
  t.after(() => { repository.registerRefrigerator = previous; });
  const pending = deferred();
  const calls = [];
  repository.registerRefrigerator = (db, draft) => {
    calls.push({ db, draft: structuredClone(draft) });
    return pending.promise;
  };
  let screen;
  let removed = 0;
  const action = { type: 'GO_BACK' };
  const fixture = registrationFixture(2, 2, {
    goBack() { screen.preventRemove.onRemove({ data: { action } }); },
    dispatch(value) { assert.strictEqual(value, action); removed++; },
  });
  screen = fixture.screen;
  t.after(() => screen.unmount());
  fixture.viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  fixture.map.props.onFocus(fixture.target);
  screen.render();
  find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('open');
  screen.render();
  const draft = structuredClone(find(screen.tree, named('FridgeInteriorMap')).props.draft);
  const previousButton = find(screen.tree, node => node.props.accessibilityLabel === '기본 정보로 돌아가기');
  const register = find(screen.tree, node => node.props.accessibilityLabel === '냉장고 등록');
  const alertCount = alerts.length;
  const saving = register.props.onPress();
  await register.props.onPress();
  assert.equal(calls.length, 1);
  assert.strictEqual(calls[0].db, database);
  assert.deepEqual(calls[0].draft, draft);
  screen.render();
  const busy = find(screen.tree, node => node.props.accessibilityLabel === '냉장고 등록');
  assert.equal(busy.props.disabled, true);
  assert.equal(busy.props.accessibilityState.busy, true);
  assert(find(busy, node => node.type === 'ActivityIndicator'));
  const content = find(screen.tree, node => node.type === 'View' && node.props.onLayout && node.props.accessibilityElementsHidden === true);
  assert.equal(content.props.pointerEvents, 'none');
  assert.equal(content.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(find(screen.tree, node => node.type === 'FridgeAreaMenu').props.disabled, true);
  const home = homeButton(screen);
  assert.equal(homeButtonDisabled(home), true);
  home.props.onPress();
  const animationCount = animations.length;
  previousButton.props.onPress();
  screen.preventRemove.onRemove({ data: { action } });
  find(screen.tree, named('FridgeFocusView')).props.onClose();
  find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onStorageModeChange('FROZEN');
  screen.render();
  assert.equal(removed, 0);
  assert.equal(animations.length, animationCount);
  assert.deepEqual(find(screen.tree, named('FridgeInteriorMap')).props.draft, draft);
  assert.equal(alerts.length, alertCount);
  pending.resolve('saved-fridge');
  await saving;
  assert.equal(removed, 0);
  assert.equal(alerts.length, alertCount + 1);
  const success = alerts.at(-1);
  assert.deepEqual(success.slice(0, 2), ['알림', '냉장고를 등록했습니다.']);
  assert.equal(success[2].length, 1);
  assert.equal(success[2][0].text, '확인');
  assert.equal(success[3].cancelable, false);
  screen.render();
  assert.equal(find(screen.tree, node => node.props.accessibilityLabel === '냉장고 등록').props.disabled, true);
  await register.props.onPress();
  previousButton.props.onPress();
  home.props.onPress();
  screen.preventRemove.onRemove({ data: { action } });
  assert.equal(calls.length, 1);
  assert.equal(alerts.length, alertCount + 1);
  assert.equal(removed, 0);
  success[2][0].onPress();
  assert.equal(removed, 1);
});

test('등록 실패 시 오류를 알리고 초안을 유지해 다시 저장할 수 있다', async t => {
  const previous = repository.registerRefrigerator;
  t.after(() => { repository.registerRefrigerator = previous; });
  const pending = deferred();
  const calls = [];
  repository.registerRefrigerator = (db, draft) => {
    calls.push(structuredClone(draft));
    return calls.length === 1 ? pending.promise : Promise.resolve('saved-fridge');
  };
  let removed = 0;
  const { screen, map } = registrationFixture(1, 2, { goBack() { removed++; }, dispatch() {} });
  t.after(() => screen.unmount());
  const before = structuredClone(map.props.draft);
  const saving = find(screen.tree, node => node.props.accessibilityLabel === '냉장고 등록').props.onPress();
  pending.reject(new Error('냉장·냉동을 선택해 주세요.'));
  await saving;
  screen.render();
  assert.deepEqual(alerts.at(-1), ['오류', '냉장·냉동을 선택해 주세요.']);
  assert.equal(removed, 0);
  assert.deepEqual(find(screen.tree, named('FridgeInteriorMap')).props.draft, before);
  const retry = find(screen.tree, node => node.props.accessibilityLabel === '냉장고 등록');
  assert.equal(retry.props.disabled, false);
  assert.equal(retry.props.accessibilityState.busy, false);
  assert.equal(find(screen.tree, node => node.props.accessibilityLabel === '기본 정보로 돌아가기').props.disabled, false);
  await retry.props.onPress();
  assert.equal(removed, 0);
  assert.deepEqual(alerts.at(-1).slice(0, 2), ['알림', '냉장고를 등록했습니다.']);
  alerts.at(-1)[2][0].onPress();
  assert.equal(removed, 1);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], before);
});

test('문을 열고 닫는 중에는 등록 저장을 시작하지 않는다', async t => {
  const previous = repository.registerRefrigerator;
  t.after(() => { repository.registerRefrigerator = previous; });
  let calls = 0;
  repository.registerRefrigerator = async () => { calls++; };
  const { screen, viewport, map, target } = registrationFixture();
  t.after(() => screen.unmount());
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  map.props.onFocus(target);
  screen.render();
  const register = () => find(screen.tree, node => node.props.accessibilityLabel === '냉장고 등록');
  assert.equal(register().props.accessibilityState.disabled, true);
  await register().props.onPress();
  find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('open');
  screen.render();
  find(screen.tree, named('FridgeFocusView')).props.onClose();
  screen.render();
  assert.equal(register().props.accessibilityState.disabled, true);
  await register().props.onPress();
  assert.equal(calls, 0);
});

test('홈의 편집 아이콘으로 저장된 구성을 열고 수정 저장 후 홈 도면을 갱신한다', async t => {
  const previous = { ...repository };
  t.after(() => Object.assign(repository, previous));
  let saved = savedRefrigerator('편집할 냉장고');
  saved.rows[0].doors[0].storageEnabled = false;
  saved.rows[0].compartments[0].slots[0].drawerCount = 2;
  const before = structuredClone(saved);
  repository.getRefrigerator = async () => structuredClone(saved);
  const pending = deferred();
  const updates = [];
  let registrations = 0;
  repository.registerRefrigerator = async () => { registrations++; };
  repository.updateRefrigerator = (db, id, draft) => {
    assert.strictEqual(db, database);
    updates.push({ id, draft: structuredClone(draft) });
    return pending.promise;
  };
  let destination;
  const home = mount(HomeScreen, { navigation: { navigate(name, params) { destination = { name, params }; } } });
  t.after(() => home.unmount());
  assert.equal(find(home.tree, node => node.props.accessibilityLabel === '냉장고 편집'), undefined);
  await new Promise(setImmediate);
  home.render();
  find(home.tree, node => node.props.accessibilityLabel === '냉장고 편집').props.onPress();
  assert.deepEqual(destination, { name: 'RefrigeratorRegistration', params: { refrigeratorId: saved.id } });
  let removed = 0;
  const editor = mount(RefrigeratorRegistrationScreen, {
    navigation: { goBack() { removed++; home.focus(); }, dispatch() {} }, route: { params: destination.params },
  });
  t.after(() => editor.unmount());
  assert(find(editor.tree, node => node.props.accessibilityLabel === '냉장고 정보 불러오는 중'));
  assert.equal(find(editor.tree, node => node.props.accessibilityLabel === '냉장고 이름'), undefined);
  assert.equal(find(editor.tree, node => node.props.accessibilityLabel === '내부 설정으로 이동').props.disabled, true);
  await new Promise(setImmediate);
  editor.render();
  assert(find(editor.tree, node => node.type === 'Text' && node.props.children === '냉장고 편집'));
  assert.deepEqual(find(editor.tree, named('FridgeInteriorMap')).props.draft.rows, saved.rows);
  find(editor.tree, node => node.props.accessibilityLabel === '냉장고 이름').props.onChangeText('편집한 냉장고');
  editor.render();
  find(editor.tree, node => node.props.accessibilityLabel === '1단 문 늘리기').props.onPress();
  editor.render();
  find(editor.tree, node => node.props.accessibilityLabel === '내부 설정으로 이동').props.onPress();
  animations.at(-1).finish();
  editor.render();
  const save = find(editor.tree, node => node.props.accessibilityLabel === '냉장고 수정 저장');
  assert.equal(find(save, node => node.type === 'Icon').props.name, 'checkbox-marked-circle-outline');
  const saving = save.props.onPress();
  await save.props.onPress();
  editor.render();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, saved.id);
  assert.equal(updates[0].draft.rows[0].doors.length, 2);
  assert.equal(updates[0].draft.rows[0].doors[0].storageEnabled, false);
  assert.equal(updates[0].draft.rows[0].compartments[0].slots[0].drawerCount, 2);
  assert.equal(find(editor.tree, node => node.props.accessibilityLabel === '냉장고 수정 저장').props.disabled, true);
  assert.equal(find(editor.tree, node => node.props.accessibilityLabel === '기본 정보로 돌아가기').props.disabled, true);
  editor.preventRemove.onRemove({ data: { action: { type: 'GO_BACK' } } });
  assert.equal(removed, 0);
  assert.deepEqual(saved, before);
  saved = { id: saved.id, name: updates[0].draft.name, rows: updates[0].draft.rows };
  pending.resolve(saved.id);
  await saving;
  assert.equal(removed, 0);
  const success = alerts.at(-1);
  assert.deepEqual(success.slice(0, 2), ['알림', '냉장고를 수정했습니다.']);
  editor.render();
  assert.equal(find(editor.tree, node => node.props.accessibilityLabel === '냉장고 수정 저장').props.disabled, true);
  await save.props.onPress();
  editor.preventRemove.onRemove({ data: { action: { type: 'GO_BACK' } } });
  assert.equal(updates.length, 1);
  assert.equal(removed, 0);
  success[2][0].onPress();
  await new Promise(setImmediate);
  home.render();
  assert.equal(removed, 1);
  assert.equal(registrations, 0);
  assert.deepEqual(find(home.tree, named('FridgeInteriorMap')).props.draft, saved);
  assert.equal(find(home.tree, node => node.props.accessibilityRole === 'header').props.children, saved.name);
});

test('이름 변경은 편집에서만 표시하고 구조 초안을 유지하며 저장 중 중복 요청·이동을 막는다', async t => {
  const previous = { ...repository };
  t.after(() => Object.assign(repository, previous));
  const registration = mount(RefrigeratorRegistrationScreen, { navigation: { goBack() {}, dispatch() {} } });
  t.after(() => registration.unmount());
  assert.equal(find(registration.tree, node => node.type === 'FormTextInput').props.trailingElement, undefined);

  const saved = savedRefrigerator('원래 이름');
  repository.getRefrigerator = async () => structuredClone(saved);
  const pending = deferred();
  const calls = [];
  repository.updateRefrigeratorName = (db, id, name) => {
    assert.strictEqual(db, database);
    calls.push({ id, name });
    return pending.promise;
  };
  let removed = 0;
  const screen = mount(RefrigeratorRegistrationScreen, {
    navigation: { goBack() { removed++; }, dispatch() {} }, route: { params: { refrigeratorId: saved.id } },
  });
  t.after(() => screen.unmount());
  await new Promise(setImmediate);
  screen.render();
  const input = () => find(screen.tree, node => node.type === 'FormTextInput');
  const button = () => input().props.trailingElement;
  assert.equal(button().props.disabled, true);
  input().props.onChangeText('   ');
  screen.render();
  assert.equal(button().props.disabled, true);
  input().props.onChangeText('  새 이름  ');
  screen.render();
  find(screen.tree, node => node.props.accessibilityLabel === '1단 문 늘리기').props.onPress();
  screen.render();
  const rows = structuredClone(find(screen.tree, named('FridgeInteriorMap')).props.draft.rows);
  const save = button().props.onPress;
  const saving = save();
  await save();
  screen.render();
  assert.deepEqual(calls, [{ id: saved.id, name: '  새 이름  ' }]);
  assert.equal(button().props.loading, true);
  assert.equal(input().props.editable, false);
  assert.equal(find(screen.tree, node => node.props.accessibilityLabel === '내부 설정으로 이동').props.disabled, true);
  screen.preventRemove.onRemove({ data: { action: { type: 'GO_BACK' } } });
  assert.equal(removed, 0);
  pending.resolve('새 이름');
  await saving;
  screen.render();
  assert.equal(input().props.value, '새 이름');
  assert.equal(button().props.disabled, true);
  assert.deepEqual(find(screen.tree, named('FridgeInteriorMap')).props.draft.rows, rows);
  assert.equal(removed, 0);
  assert.deepEqual(alerts.at(-1), ['알림', '냉장고 이름을 변경했습니다.']);
  find(screen.tree, node => node.props.accessibilityLabel === '냉장고 편집 취소').props.onPress();
  assert.equal(removed, 1);
  assert.equal(calls.length, 1);
});

test('이름 변경 실패 시 이름과 구조 초안을 유지해 다시 저장할 수 있다', async t => {
  const previous = { ...repository };
  t.after(() => Object.assign(repository, previous));
  const saved = savedRefrigerator('원래 이름');
  repository.getRefrigerator = async () => structuredClone(saved);
  const calls = [];
  repository.updateRefrigeratorName = async (db, id, name) => {
    calls.push({ id, name });
    if (calls.length === 1) throw new Error('검증용 이름 변경 실패');
    return name;
  };
  const screen = mount(RefrigeratorRegistrationScreen, {
    navigation: { goBack() { assert.fail('이름 변경 후 편집 화면을 유지해야 합니다.'); }, dispatch() {} },
    route: { params: { refrigeratorId: saved.id } },
  });
  t.after(() => screen.unmount());
  await new Promise(setImmediate);
  screen.render();
  const input = () => find(screen.tree, node => node.type === 'FormTextInput');
  const button = () => input().props.trailingElement;
  input().props.onChangeText('재시도할 이름');
  screen.render();
  const before = structuredClone(find(screen.tree, named('FridgeInteriorMap')).props.draft);
  await button().props.onPress();
  screen.render();
  assert.deepEqual(alerts.at(-1), ['오류', '검증용 이름 변경 실패']);
  assert.deepEqual(find(screen.tree, named('FridgeInteriorMap')).props.draft, before);
  assert.equal(button().props.disabled, false);
  assert.equal(button().props.loading, false);
  await button().props.onPress();
  screen.render();
  assert.deepEqual(calls, [{ id: saved.id, name: '재시도할 이름' }, { id: saved.id, name: '재시도할 이름' }]);
  assert.equal(button().props.disabled, true);
});

test('편집을 취소하면 저장을 호출하지 않고 기존 구성을 유지한다', async t => {
  const previous = { ...repository };
  t.after(() => Object.assign(repository, previous));
  const saved = savedRefrigerator('취소 전 이름');
  const before = structuredClone(saved);
  repository.getRefrigerator = async () => saved;
  let writes = 0;
  repository.updateRefrigerator = async () => { writes++; };
  repository.registerRefrigerator = async () => { writes++; };
  let removed = 0;
  const screen = mount(RefrigeratorRegistrationScreen, {
    navigation: { goBack() { removed++; }, dispatch() {} }, route: { params: { refrigeratorId: saved.id } },
  });
  t.after(() => screen.unmount());
  await new Promise(setImmediate);
  screen.render();
  find(screen.tree, node => node.props.accessibilityLabel === '냉장고 이름').props.onChangeText('취소할 이름');
  screen.render();
  find(screen.tree, node => node.props.accessibilityLabel === '1단 문 늘리기').props.onPress();
  screen.render();
  find(screen.tree, node => node.props.accessibilityLabel === '냉장고 편집 취소').props.onPress();
  assert.equal(removed, 1);
  assert.equal(writes, 0);
  assert.deepEqual(saved, before);
});

test('수정 저장에 실패하면 편집 초안을 유지해 신규 등록 없이 다시 저장한다', async t => {
  const previous = { ...repository };
  t.after(() => Object.assign(repository, previous));
  const saved = savedRefrigerator('재시도할 냉장고');
  repository.getRefrigerator = async () => structuredClone(saved);
  const calls = [];
  const pending = deferred();
  repository.updateRefrigerator = (db, id, draft) => {
    calls.push({ id, draft: structuredClone(draft) });
    return calls.length === 1 ? pending.promise : Promise.resolve(id);
  };
  let removed = 0;
  const screen = mount(RefrigeratorRegistrationScreen, {
    navigation: { goBack() { removed++; }, dispatch() {} }, route: { params: { refrigeratorId: saved.id } },
  });
  t.after(() => screen.unmount());
  await new Promise(setImmediate);
  screen.render();
  find(screen.tree, node => node.props.accessibilityLabel === '냉장고 이름').props.onChangeText('수정한 이름 유지');
  screen.render();
  find(screen.tree, node => node.props.accessibilityLabel === '내부 설정으로 이동').props.onPress();
  animations.at(-1).finish();
  screen.render();
  const before = structuredClone(find(screen.tree, named('FridgeInteriorMap')).props.draft);
  const saving = find(screen.tree, node => node.props.accessibilityLabel === '냉장고 수정 저장').props.onPress();
  pending.reject(new Error('검증용 수정 실패'));
  await saving;
  screen.render();
  assert.deepEqual(alerts.at(-1), ['오류', '검증용 수정 실패']);
  assert.equal(removed, 0);
  assert.deepEqual(find(screen.tree, named('FridgeInteriorMap')).props.draft, before);
  const retry = find(screen.tree, node => node.props.accessibilityLabel === '냉장고 수정 저장');
  assert.equal(retry.props.disabled, false);
  await retry.props.onPress();
  assert.equal(removed, 0);
  assert.deepEqual(alerts.at(-1).slice(0, 2), ['알림', '냉장고를 수정했습니다.']);
  alerts.at(-1)[2][0].onPress();
  assert.equal(removed, 1);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].id, saved.id);
});

test('편집 조회 실패·미등록·다른 ID는 기본 구성을 노출하거나 저장하지 않고 재시도한다', async t => {
  for (const failure of ['조회 실패', '미등록', '다른 ID']) await t.test(failure, async t => {
    const previous = { ...repository };
    t.after(() => Object.assign(repository, previous));
    const saved = savedRefrigerator('조회 복구한 냉장고');
    repository.getRefrigerator = async () => {
      if (failure === '조회 실패') throw new Error('조회 실패');
      return failure === '미등록' ? null : { ...saved, id: '다른 냉장고' };
    };
    const screen = mount(RefrigeratorRegistrationScreen, {
      navigation: { goBack() {}, dispatch() {} }, route: { params: { refrigeratorId: saved.id } },
    });
    t.after(() => screen.unmount());
    await new Promise(setImmediate);
    screen.render();
    assert(find(screen.tree, node => node.props.accessibilityRole === 'alert'));
    assert.equal(find(screen.tree, node => node.props.accessibilityLabel === '냉장고 이름'), undefined);
    assert.equal(find(screen.tree, named('FridgeInteriorMap')), undefined);
    assert.equal(find(screen.tree, node => node.props.accessibilityLabel === '내부 설정으로 이동').props.disabled, true);
    repository.getRefrigerator = async () => structuredClone(saved);
    find(screen.tree, node => node.props.label === '다시 불러오기').props.onPress();
    screen.render();
    await new Promise(setImmediate);
    screen.render();
    assert.equal(find(screen.tree, node => node.props.accessibilityRole === 'alert'), undefined);
    assert.equal(find(screen.tree, node => node.props.accessibilityLabel === '냉장고 이름').props.value, saved.name);
    assert.deepEqual(find(screen.tree, named('FridgeInteriorMap')).props.draft.rows, saved.rows);
  });
});

test('하단 메뉴는 OS 기본 탭 3개로 연결하고 등록은 탭 밖에서 연다', async t => {
  for (const platform of ['ios', 'android']) {
    await t.test(platform, async t => {
      const previousPlatform = native.Platform.OS;
      native.Platform.OS = platform;
      t.after(() => { native.Platform.OS = previousPlatform; });
      const requests = [];
      const { ShoppingScreen } = loadComponent('src/screens/ShoppingScreen.tsx');
      const { SettingsScreen } = loadComponent('src/screens/SettingsScreen.tsx');
      const { MainTabNavigator } = loadComponent('src/navigation/MainTabNavigator.tsx', {
        '@react-navigation/bottom-tabs/unstable': {
          createNativeBottomTabNavigator: () => ({ Navigator: 'NativeTabs', Screen: 'NativeTabScreen' }),
        },
        '@react-native-vector-icons/material-design-icons': { MaterialDesignIcons: {
          async getImageSource(name, size) {
            requests.push({ name, size });
            return { uri: `file:///${name}.png`, width: size, height: size, scale: 1 };
          },
        } },
        '@/screens/HomeScreen': { HomeScreen },
        '@/screens/ShoppingScreen': { ShoppingScreen },
        '@/screens/SettingsScreen': { SettingsScreen },
      });
      const tabs = mount(MainTabNavigator, {});
      t.after(() => tabs.unmount());
      await new Promise(setImmediate);
      tabs.render();
      assert.equal(tabs.tree.type, 'NativeTabs');
      assert.equal(tabs.tree.props.initialRouteName, 'Home');
      assert.equal(tabs.tree.props.screenOptions.headerShown, false);
      const routes = children(tabs.tree);
      assert.deepEqual(routes.map(route => route.props.name), ['Home', 'Shopping', 'Settings']);
      assert.deepEqual(routes.map(route => route.props.options.title), ['냉장고', '장보기', '설정']);
      assert.deepEqual(routes.map(route => route.props.component), [HomeScreen, ShoppingScreen, SettingsScreen]);
      assert.deepEqual(requests.map(request => request.name), ['fridge-outline', 'cart-outline', 'cog-outline']);
      for (const [index, route] of routes.entries()) {
        assert.equal(route.props.options.tabBarIcon.type, 'image');
        assert.equal(route.props.options.tabBarIcon.source.uri, `file:///${requests[index].name}.png`);
      }
      const { RootNavigator } = loadComponent('src/navigation/RootNavigator.tsx', {
        '@react-navigation/native-stack': {
          createNativeStackNavigator: () => ({ Navigator: 'Stack', Screen: 'StackScreen' }),
        },
        '@/navigation/MainTabNavigator': { MainTabNavigator },
        '@/screens/RefrigeratorRegistrationScreen': { RefrigeratorRegistrationScreen },
      });
      const root = mount(RootNavigator, {});
      t.after(() => root.unmount());
      const stackRoutes = children(root.tree);
      assert.deepEqual(stackRoutes.map(route => route.props.name), ['MainTabs', 'RefrigeratorRegistration']);
      assert.strictEqual(stackRoutes[0].props.component, MainTabNavigator);
      assert.strictEqual(stackRoutes[1].props.component, RefrigeratorRegistrationScreen);
      assert.equal(stackRoutes[1].props.options.gestureEnabled, false);
      for (const [Component, title] of [[ShoppingScreen, '장보기'], [SettingsScreen, '설정']]) {
        const screen = mount(Component, {});
        t.after(() => screen.unmount());
        assert.deepEqual(screen.tree.props.edges, { top: true, bottom: true, left: true, right: true });
        assert.deepEqual(findAll(screen.tree, node => node.type === 'Text').map(node => node.props.children), [title]);
      }
    });
  }
});

test('홈은 조회가 끝난 뒤 미등록 상태에서만 등록 버튼을 표시한다', async t => {
  let destination;
  const home = mount(HomeScreen, { navigation: { navigate(route) { destination = route; } } });
  t.after(() => home.unmount());
  assert(find(home.tree, node => node.type === 'ActivityIndicator'));
  assert.equal(find(home.tree, node => node.props.label === '냉장고 등록하기'), undefined);
  await new Promise(setImmediate);
  home.render();
  find(home.tree, node => node.props.label === '냉장고 등록하기').props.onPress();
  assert.equal(destination, 'RefrigeratorRegistration');
});

test('홈으로 돌아오면 전체 도면을 다시 조회하고 늦은 이전 조회 결과를 무시한다', async t => {
  const previous = repository.getRefrigerator;
  t.after(() => { repository.getRefrigerator = previous; });
  const pending = deferred();
  let calls = 0;
  repository.getRefrigerator = () => ++calls === 1 ? pending.promise : Promise.resolve(savedRefrigerator('등록한 냉장고'));
  const home = mount(HomeScreen, { navigation: { navigate() {} } });
  t.after(() => home.unmount());
  home.focus();
  await new Promise(setImmediate);
  home.render();
  assert.equal(find(home.tree, named('FridgeInteriorMap')).props.draft.name, '등록한 냉장고');
  assert.equal(find(home.tree, node => node.props.label === '냉장고 등록하기'), undefined);
  pending.resolve(null);
  await new Promise(setImmediate);
  home.render();
  assert.equal(find(home.tree, named('FridgeInteriorMap')).props.draft.name, '등록한 냉장고');
  assert.equal(find(home.tree, node => node.props.label === '냉장고 등록하기'), undefined);
});

test('홈 조회 실패 시 등록으로 오인하지 않고 오류 표시 후 다시 조회한다', async t => {
  const previous = repository.getRefrigerator;
  t.after(() => { repository.getRefrigerator = previous; });
  repository.getRefrigerator = async () => { throw new Error('조회 실패'); };
  const home = mount(HomeScreen, { navigation: { navigate() {} } });
  t.after(() => home.unmount());
  await new Promise(setImmediate);
  home.render();
  assert(find(home.tree, node => node.props.accessibilityRole === 'alert'));
  assert.equal(find(home.tree, node => node.props.label === '냉장고 등록하기'), undefined);
  repository.getRefrigerator = async () => savedRefrigerator('저장된 냉장고');
  find(home.tree, node => node.props.label === '다시 불러오기').props.onPress();
  home.render();
  await new Promise(setImmediate);
  home.render();
  assert.equal(find(home.tree, named('FridgeInteriorMap')).props.draft.name, '저장된 냉장고');
  assert.equal(find(home.tree, node => node.props.accessibilityRole === 'alert'), undefined);
});

test('홈은 최상단 냉장고 이름과 등록 화면의 전체 도면을 표시하고 별도 경로·칸 목록을 추가하지 않는다', async t => {
  const previous = repository.getRefrigerator;
  t.after(() => { repository.getRefrigerator = previous; });
  const snapshot = savedRefrigerator('복원된 냉장고');
  snapshot.rows[0].doors[0].storageEnabled = false;
  snapshot.rows[0].compartments[0].slots[0].drawerCount = 2;
  snapshot.rows[1].doors[0].kind = 'DRAWER';
  snapshot.rows[1].compartments[0].storageMode = 'FROZEN';
  repository.getRefrigerator = async () => structuredClone(snapshot);
  const home = mount(HomeScreen, { navigation: { navigate() {} } });
  t.after(() => home.unmount());
  await new Promise(setImmediate);
  home.render();
  const map = find(home.tree, named('FridgeInteriorMap'));
  const registration = registrationFixture();
  t.after(() => registration.screen.unmount());
  assert.strictEqual(map.type, find(registration.screen.tree, named('FridgeInteriorMap')).type);
  assert.equal(map.props.fitHeight, true);
  assert.equal(map.props.focus, null);
  assert.deepEqual(map.props.draft, snapshot);
  assert.equal(findAll(home.tree, named('FridgeInteriorMap')).length, 1);
  assert.equal(find(home.tree, named('FridgeMap')), undefined);
  assert.equal(find(home.tree, named('FridgeFocusView')), undefined);
  assert.equal(find(home.tree, node => node.type === 'FridgeAreaMenu'), undefined);
  const texts = findAll(home.tree, node => node.type === 'Text');
  assert.equal(texts.length, 1);
  assert.equal(texts[0].props.accessibilityRole, 'header');
  assert.equal(texts[0].props.children, snapshot.name);
  assert.equal(find(home.tree, node => node.type === 'ScrollView'), undefined);
  assert.equal(find(home.tree, node => node.type === 'PrimaryButton'), undefined);
});

test('홈도 같은 문 열림·중앙 보기·수납 없음·서랍형 표시와 바깥 닫기를 사용한다', async t => {
  const previous = repository.getRefrigerator;
  t.after(() => { repository.getRefrigerator = previous; });
  for (const kind of ['HINGED', 'DRAWER']) {
    await t.test(kind, async t => {
      const snapshot = savedRefrigerator('표시할 냉장고');
      snapshot.rows[0].doors[0].kind = kind;
      snapshot.rows[0].doors[0].storageEnabled = false;
      const before = structuredClone(snapshot);
      let reads = 0;
      repository.getRefrigerator = async () => { reads++; return structuredClone(snapshot); };
      const home = mount(HomeScreen, { navigation: { navigate() {} } });
      t.after(() => home.unmount());
      await new Promise(setImmediate);
      home.render();
      const map = () => find(home.tree, named('FridgeInteriorMap'));
      const viewport = find(home.tree, node => node.type === 'View' && node.props.ref && node.props.onLayout);
      // 헤더·안전 영역 안에 중앙 보기를 넣으면 이름 높이만큼 중심이 밀린다.
      assert.equal(find(find(home.tree, node => node.type === 'SafeAreaView'), node => node === viewport), undefined);
      assert(children(home.tree).includes(viewport));
      assert.deepEqual(flattenStyle(viewport.props.style), native.StyleSheet.absoluteFill);
      viewport.props.onLayout({ nativeEvent: { layout: { width: 375, height: 844 } } });
      viewport.props.ref.current = { measureInWindow: callback => callback(0, 0, 375, 844) };
      const row = snapshot.rows[0];
      const target = { areaId: row.compartments[0].id,
        returnAreaId: kind === 'DRAWER' ? row.compartments[0].id : row.doors[0].id,
        canvas: { x: 52.5, y: 42, width: 270, height: 540 } };
      map().props.onFocus(target);
      home.render();
      const focus = () => find(home.tree, named('FridgeFocusView'));
      assert.strictEqual(focus().type, FridgeFocusView);
      assert.equal(focus().props.phase, 'opening');
      assert.deepEqual(focus().props.target, target);
      assert.deepEqual(focus().props.viewport, { x: 0, y: 0, width: 375, height: 844 });
      const geometry = getFridgeFocusGeometry(snapshot, target, focus().props.viewport, focus().props.sizeViewport);
      near(geometry.focusedTop + geometry.height / 2, 844 / 2);
      assert.equal(find(home.tree, node => node.type === 'SafeAreaView').props.accessibilityElementsHidden, true);
      const overlay = mount(focus().type, focus().props);
      t.after(() => overlay.unmount());
      assertFocusAccess(overlay, 'opening');
      const animation = animations.at(-1);
      assert.equal(animation.config.duration, 480);
      assert.equal([...backHandlers].at(-1)(), true);
      home.render();
      assert.equal(focus().props.phase, 'opening');
      animation.finish();
      home.render();
      overlay.props = focus().props;
      overlay.render();
      assertFocusAccess(overlay, 'open');
      const pockets = interiorAreas(overlay).filter(area => !area.props.area.isBody);
      assert.equal(pockets.length, kind === 'DRAWER' ? 0 : 1);
      if (pockets.length) {
        assert.equal(pockets[0].props.layout.positions.filter(position => position.areaId === row.doors[0].id).length, 0);
        const emptyPocket = find(pockets[0].type(pockets[0].props), named('DoorWithoutStorage'));
        assert(emptyPocket);
        assert.equal(pockets[0].props.onSelectArea, undefined);
        assert.equal(emptyPocket.props.onPress, undefined);
        const empty = mount(emptyPocket.type, emptyPocket.props);
        t.after(() => empty.unmount());
        assert.equal(empty.tree.type, 'View');
        assert.equal(empty.tree.props.accessibilityRole, undefined);
      }
      const body = interiorAreas(overlay).find(area => area.props.area.isBody);
      const bodyMap = find(body.type(body.props), node => node.type === mapModule.FridgeMap);
      const slot = find(mapModule.FridgeMap(bodyMap.props), node => node.type === 'Pressable' && node.props.accessibilityRole === 'button');
      slot.props.onPress({ stopPropagation() {} });
      home.render();
      assert.equal(focus().props.selectedAreaId, row.compartments[0].id);
      assert.equal(focus().props.selectedSlotIndex, 0);
      find(home.tree, node => node.type === 'IngredientListSheet').props.onClose();
      home.render();
      find(overlay.tree, node => node.props.accessibilityLabel === '냉장고 도면 바깥 영역 눌러 닫기').props.onPress();
      home.render();
      assert.equal(focus().props.phase, 'closing');
      overlay.props = focus().props;
      overlay.render();
      assert.equal(animations.at(-1).config.duration, 420);
      assertFocusAccess(overlay, 'closing');
      animations.at(-1).finish();
      home.render();
      assert.equal(focus(), undefined);
      assert.equal(map().props.focus, null);
      assert.equal(map().props.selectedAreaId, target.returnAreaId);
      assert.equal(backHandlers.size, 0);
      assert.equal(find(home.tree, node => node.type === 'SafeAreaView').props.accessibilityElementsHidden, false);
      assert.equal(reads, 1);
      assert.deepEqual(map().props.draft, before);
      assert.deepEqual(findAll(home.tree, node => node.type === 'Text').map(node => node.props.children), [snapshot.name]);
    });
  }
});

test('홈은 본체의 좌우 위치·포켓 전면을 개별 선택하고 닫기·재조회 시 선택을 초기화한다', async t => {
  const previous = repository.getRefrigerator;
  t.after(() => { repository.getRefrigerator = previous; });
  const saved = savedRefrigerator('칸 선택용 냉장고');
  const row = saved.rows[0];
  row.compartments[0].slots[0].drawerCount = 2;
  row.compartments[0].slots.push({ id: 'ordinary-slot', name: model.getSlotName(1), drawerCount: 0 });
  const snapshot = structuredClone(saved);
  let reads = 0;
  repository.getRefrigerator = async () => { reads++; return structuredClone(saved); };
  const home = mount(HomeScreen, { navigation: { navigate() {} } });
  t.after(() => home.unmount());
  await new Promise(setImmediate);
  home.render();
  const viewport = find(home.tree, node => node.type === 'View' && node.props.ref && node.props.onLayout);
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 0, 375, 844) };
  const target = { areaId: row.compartments[0].id, returnAreaId: row.doors[0].id,
    canvas: { x: 52.5, y: 130, width: 270, height: 540 } };
  const focus = () => find(home.tree, named('FridgeFocusView'));
  const open = () => {
    find(home.tree, named('FridgeInteriorMap')).props.onFocus(target);
    home.render();
  };
  open();
  const overlay = mount(focus().type, focus().props);
  t.after(() => overlay.unmount());
  const slots = () => interiorAreas(overlay).flatMap(area => {
    const tree = area.type(area.props);
    assert.equal(find(tree, named('SelectionFrame')), undefined);
    const map = find(tree, node => node.type === mapModule.FridgeMap);
    assert.equal(map.props.onSelectArea, undefined);
    assert.equal(map.props.selectedAreaId, undefined);
    assert.equal(typeof map.props.onSelectSlot, 'function');
    assert.equal(map.props.onSelectPosition, undefined);
    const rendered = mapModule.FridgeMap(map.props);
    assert.equal(find(rendered, node => node.type === 'FeedbackPressable'), undefined);
    const highlight = tree => findAll(tree, node => node.props.pointerEvents === 'none'
      && flattenStyle(node.props.style).overflow === 'hidden')
      .map(node => flattenStyle(node.props.style));
    const editor = mapModule.FridgeMap({ ...map.props, onSelectArea() {} });
    assert.deepEqual(highlight(rendered), highlight(editor));
    for (const style of highlight(rendered)) {
      assert.equal(style.borderRadius, 6);
      assert.equal(style.backgroundColor, tokens.fridgeDoorColors[map.props.storageMode].selection);
      assert.match(style.backgroundColor, /^#[0-9A-F]{6}$/);
      assert.equal(style.boxShadow, undefined);
    }
    if (area.props.area.isBody) {
      return findAll(rendered, node => node.type === 'Pressable' && node.props.accessibilityRole === 'button')
        .map(button => ({ id: button.key, button }));
    }
    assert.equal(highlight(rendered).length, 0, '포켓 행 전체에 선택 배경을 표시하면 안 된다');
    assert.equal(find(rendered, node => node.type === 'Pressable'), undefined);
    const slotIds = new Set(map.props.positions.map(position => position.slotId));
    return [...slotIds].map(id => {
      const slot = find(rendered, node => node.key === id);
      assert.equal(slot.type, 'View');
      assert.equal(slot.props.onPress, undefined, '수납함 위쪽 빈 공간은 선택 대상이 아니다');
      assert.equal(slot.props.accessibilityRole, undefined);
      const bin = find(slot, named('DoorPocketBin'));
      const renderedBin = bin.type(bin.props);
      const button = children(renderedBin)[0];
      const decorative = bin.type({ style: bin.props.style });
      assert.equal(renderedBin.props.pointerEvents, 'box-none');
      assert.equal(renderedBin.props.accessibilityElementsHidden, undefined);
      assert.equal(renderedBin.props.importantForAccessibility, undefined);
      assert.equal(button.type, 'Pressable');
      assert.equal(button.props.accessibilityRole, 'button');
      assert.deepEqual(flattenStyle(renderedBin.props.style), flattenStyle(decorative.props.style));
      const front = flattenStyle(button.props.style);
      const defaultFront = flattenStyle(children(decorative)[0].props.style);
      assert.deepEqual({ ...front, backgroundColor: undefined }, { ...defaultFront, backgroundColor: undefined });
      assert.equal(front.backgroundColor, button.props.accessibilityState.selected
        ? tokens.fridgeDoorColors[map.props.storageMode].selection : defaultFront.backgroundColor);
      assert.equal(front.height, '62%');
      assert.equal(front.bottom, 0);
      assert.equal(front.borderWidth, 3);
      assert.equal(front.borderTopWidth, 0);
      assert.equal(front.borderBottomLeftRadius, 12);
      assert.equal(front.borderBottomRightRadius, 12);
      assert.equal(front.overflow, 'hidden');
      assert.equal(children(button).length, 0, '선택 배경은 별도 사각형 없이 전면판 자체의 곡선을 사용한다');
      if (button.props.accessibilityState.selected) assert.match(front.backgroundColor, /^#[0-9A-F]{6}$/);
      return { id: slot.key, button };
    });
  });
  const press = slot => {
    let stopped = false;
    slot.button.props.onPress({ stopPropagation() { stopped = true; } });
    assert(stopped);
  };
  const refresh = () => { home.render(); overlay.props = focus().props; overlay.render(); };
  const before = getFridgeFocusGeometry(saved, target, focus().props.viewport, focus().props.sizeViewport);
  assert(slots().every(slot => slot.button.props.disabled));
  for (const slot of slots()) press(slot);
  home.render();
  assert.equal(focus().props.selectedSlotIndex, undefined);
  assert.equal(find(home.tree, node => node.type === 'IngredientListSheet'), undefined);
  animations.at(-1).finish();
  refresh();
  const animationCount = animations.length;
  const expected = [
    { id: `${row.compartments[0].slots[0].id}-left`, slotIndex: 0, areaId: row.compartments[0].id },
    { id: `${row.compartments[0].slots[0].id}-right`, slotIndex: 0, areaId: row.compartments[0].id },
    { id: 'ordinary-slot', slotIndex: 1, areaId: row.compartments[0].id },
    ...row.doors[0].slots.map((slot, index) => ({ id: slot.id, slotIndex: index, areaId: row.doors[0].id })),
  ];
  assert.equal(slots().length, expected.length);
  for (const [index, { id, slotIndex, areaId }] of expected.entries()) {
    assert.equal(slots()[index].button.props.disabled, false);
    press(slots()[index]);
    refresh();
    assert.equal(focus().props.selectedSlotIndex, slotIndex);
    assert.equal(focus().props.selectedPositionId, id);
    assert.equal(focus().props.selectedAreaId, areaId);
    const selected = slots().filter(slot => slot.button.props.accessibilityState.selected);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].id, id);
    const sheet = find(home.tree, node => node.type === 'IngredientListSheet');
    const layout = model.getDraftLayout(saved);
    const position = layout.positions.find(position => position.id === id);
    assert.deepEqual(sheet.props.position, position);
    assert.equal(focus().props.scrollHintBlocked, true);
    const coveredViewport = find(home.tree, node => node.type === 'View' && node.props.ref && node.props.onLayout);
    assert.equal(coveredViewport.props.pointerEvents, 'none');
    assert.equal(coveredViewport.props.accessibilityElementsHidden, true);
    // 목록을 닫아도 열린 도면과 현재 칸의 선택은 유지한다.
    if (index === expected.length - 1) assert.equal([...backHandlers].at(-1)(), true);
    else sheet.props.onClose();
    home.render();
    assert.equal(find(home.tree, node => node.type === 'IngredientListSheet'), undefined);
    assert.equal(focus().props.phase, 'open');
    assert.equal(focus().props.selectedPositionId, id);
    const after = getFridgeFocusGeometry(saved, target, focus().props.viewport, focus().props.sizeViewport);
    near(after.height, before.height);
    near(after.body.width, before.body.width);
  }
  assert.equal(animations.length, animationCount, '칸 선택으로 여닫기 애니메이션을 재시작하면 안 된다');
  assert.equal(reads, 1);
  assert.deepEqual(saved, snapshot);
  find(overlay.tree, node => node.props.accessibilityLabel === '냉장고 도면 바깥 영역 눌러 닫기').props.onPress();
  refresh();
  assert.equal(focus().props.phase, 'closing');
  assert(slots().every(slot => slot.button.props.disabled));
  for (const slot of slots()) press(slot);
  home.render();
  assert.equal(focus().props.selectedAreaId, row.doors[0].id);
  assert.equal(focus().props.selectedSlotIndex, 1);
  animations.at(-1).finish();
  home.render();
  assert.equal(focus(), undefined);
  open();
  assert.equal(focus().props.selectedSlotIndex, undefined);
  assert.equal(focus().props.selectedPositionId, undefined);
  focus().props.onPhaseChange('open');
  home.render();
  focus().props.onSelectSlot(row.compartments[0].id, 0);
  home.render();
  home.focus();
  await new Promise(setImmediate);
  home.render();
  assert.equal(focus(), undefined);
  assert.equal(reads, 2);
  open();
  assert.equal(focus().props.selectedSlotIndex, undefined);
  assert.equal(focus().props.selectedPositionId, undefined);
});

test('홈의 재료 배지는 저장 직후 선택·열림을 유지하며 갱신되고 재진입 시 DB에서 복원한다', async t => {
  const previousGet = repository.getRefrigerator;
  const previousIngredients = ingredientRepository.getIngredients;
  t.after(() => { repository.getRefrigerator = previousGet; ingredientRepository.getIngredients = previousIngredients; });
  const saved = savedRefrigerator('재료 배지 냉장고');
  const row = saved.rows[0];
  const slotId = row.compartments[0].slots[0].id;
  row.compartments[0].slots[0].drawerCount = 2;
  const persisted = [{ id: 'first', name: '우유', quantity: '2개', expirationDate: null, slotId, drawerNumber: 1 }];
  repository.getRefrigerator = async () => saved;
  let reads = 0;
  ingredientRepository.getIngredients = async db => { assert.strictEqual(db, database); reads++; return [...persisted]; };
  const home = mount(HomeScreen, { navigation: { navigate() {} } });
  t.after(() => home.unmount());
  await new Promise(setImmediate);
  home.render();
  const viewport = find(home.tree, node => node.type === 'View' && node.props.ref && node.props.onLayout);
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 0, 375, 844) };
  const target = { areaId: row.compartments[0].id, returnAreaId: row.doors[0].id,
    canvas: { x: 52.5, y: 130, width: 270, height: 540 } };
  const focus = () => find(home.tree, named('FridgeFocusView'));
  const open = () => {
    find(home.tree, named('FridgeInteriorMap')).props.onFocus(target);
    home.render();
    focus().props.onPhaseChange('open');
    home.render();
  };
  open();
  const overlay = mount(focus().type, focus().props);
  t.after(() => overlay.unmount());
  const badgeCounts = () => {
    overlay.props = focus().props;
    overlay.render();
    const body = interiorAreas(overlay).find(area => area.props.area.isBody);
    const map = find(body.type(body.props), node => node.type === mapModule.FridgeMap);
    return findAll(mapModule.FridgeMap(map.props), node => node.type === 'Text' && typeof node.props.children === 'number')
      .map(node => node.props.children);
  };
  assert.deepEqual(badgeCounts(), [1]);
  focus().props.onSelectSlot(row.compartments[0].id, 0, `${slotId}-left`);
  home.render();
  const animationCount = animations.length;
  const sheet = find(home.tree, node => node.type === 'IngredientListSheet');
  const ingredient = { ...persisted[0], id: 'second' };
  persisted.push(ingredient);
  sheet.props.onRegistered(ingredient);
  home.render();
  assert.deepEqual(badgeCounts(), [2]);
  assert.equal(reads, 1);
  assert.equal(animations.length, animationCount);
  assert.equal(focus().props.phase, 'open');
  assert.equal(focus().props.selectedPositionId, `${slotId}-left`);
  assert(find(home.tree, node => node.type === 'IngredientListSheet'));
  sheet.props.onClose();
  home.render();
  assert.deepEqual(badgeCounts(), [2]);
  home.focus();
  await new Promise(setImmediate);
  home.render();
  assert.equal(focus(), undefined);
  open();
  assert.deepEqual(badgeCounts(), [2]);
  assert.equal(reads, 2);
});

test('재료 시트는 절반 높이에서 시작하고 스와이프 닫기와 빈 목록·조회 중을 구분한다', async t => {
  const previous = ingredientRepository.getIngredientsByPosition;
  t.after(() => { ingredientRepository.getIngredientsByPosition = previous; });
  const pending = deferred();
  const requests = [];
  ingredientRepository.getIngredientsByPosition = (db, position) => {
    assert.strictEqual(db, database);
    requests.push(position);
    return pending.promise;
  };
  let closed = 0;
  const sheet = mount(IngredientListSheet, {
    position: { id: 'slot-left', slotId: 'slot', drawerNumber: 1 },
    onClose() { closed++; },
  });
  t.after(() => sheet.unmount());
  const nativeClose = [];
  sheet.tree.props.ref.current = { close() { nativeClose.push(true); } };
  assert.equal(sheet.tree.type, 'BottomSheet');
  assert.equal(sheet.tree.props.index, 0);
  assert.equal(sheet.tree.props.snapPoints, undefined);
  assert.equal(sheet.tree.props.enableDynamicSizing, false);
  assert.equal(sheet.tree.props.enablePanDownToClose, true);
  assert(find(sheet.tree, node => node.props.accessibilityLabel === '재료 목록 불러오는 중'));
  assert.equal(find(sheet.tree, node => node.type === 'FlatList'), undefined);
  assert.equal(find(sheet.tree, node => node.props.accessibilityLabel === '재료 추가').props.disabled, true);
  pending.resolve([]);
  await new Promise(setImmediate);
  sheet.render();
  assert.deepEqual(requests, [{ slotId: 'slot', drawerNumber: 1 }]);
  const list = find(sheet.tree, node => node.type === 'FlatList');
  assert.deepEqual(list.props.data, []);
  assert(find(list.props.ListEmptyComponent, node => node.props.children === '아직 보관 중인 재료가 없어요'));
  assert.equal(find(sheet.tree, node => node.props.accessibilityRole === 'alert'), undefined);
  assert.equal(find(sheet.tree, node => node.props.accessibilityLabel === '재료 추가').props.disabled, false);
  assert.equal(find(sheet.tree, node => node.props.accessibilityLabel === '재료 시트 닫기'), undefined);
  const panel = children(sheet.tree)[0];
  assert.equal(panel.props.accessibilityViewIsModal, true);
  assert.equal(flattenStyle(panel.props.style).height, undefined);
  panel.props.onAccessibilityEscape();
  assert.equal(nativeClose.length, 1);
  assert.equal(closed, 0);
  sheet.tree.props.onClose();
  assert.equal(closed, 1);
});

test('D-day는 현지 날짜로 계산하고 D-2부터 당일·기한 경과까지 긴급 상태로 표시한다', () => {
  const now = new Date(2026, 10, 4, 23, 59);
  for (const [date, label, isUrgent] of [
    ['2026-11-07', 'D-3', false], ['2026-11-06', 'D-2', true],
    ['2026-11-05', 'D-1', true], ['2026-11-04', 'D-DAY', true],
    ['2026-11-03', 'D+1', true], [null, '유통기한 미입력', false],
  ]) assert.deepEqual(ingredientModel.getIngredientExpirationStatus(date, now), { label, isUrgent });
  for (const hour of [0, 23]) {
    assert.deepEqual(ingredientModel.getIngredientExpirationStatus('2026-11-06', new Date(2026, 10, 4, hour, 1)),
      { label: 'D-2', isUrgent: true });
  }
  assert.deepEqual(ingredientModel.getIngredientExpirationStatus('2027-01-01', new Date(2026, 11, 31, 23, 59)),
    { label: 'D-1', isUrgent: true });
  assert.deepEqual(ingredientModel.getIngredientExpirationStatus('2028-03-01', new Date(2028, 1, 28, 12)),
    { label: 'D-2', isUrgent: true });
  assert.deepEqual(ingredientModel.getIngredientExpirationStatus('2027-03-01', new Date(2027, 1, 28, 12)),
    { label: 'D-1', isUrgent: true });
});

test('재료 목록은 D-day를 오른쪽 끝에 표시하고 D-2부터 빨간색으로 구분한다', async t => {
  const previous = ingredientRepository.getIngredientsByPosition;
  t.after(() => { ingredientRepository.getIngredientsByPosition = previous; });
  const ingredients = [
    { id: 'milk', name: '우유', quantity: '반 통', expirationDate: '2026-11-30', slotId: 'pocket', drawerNumber: 0 },
    { id: 'eggs', name: '계란', quantity: '2개', expirationDate: null, slotId: 'pocket', drawerNumber: 0 },
    { id: 'apple', name: '사과', quantity: '1개', expirationDate: '2026-11-06', slotId: 'pocket', drawerNumber: 0 },
    { id: 'carrot', name: '당근', quantity: '1개', expirationDate: '2026-11-04', slotId: 'pocket', drawerNumber: 0 },
    { id: 'tofu', name: '두부', quantity: '1모', expirationDate: '2026-11-03', slotId: 'pocket', drawerNumber: 0 },
  ];
  ingredientRepository.getIngredientsByPosition = async (db, position) => {
    assert.deepEqual(position, { slotId: 'pocket', drawerNumber: 0 });
    return ingredients;
  };
  const now = new Date(2026, 10, 4, 12);
  const { IngredientListSheet: FixedDateSheet } = loadComponent('src/features/ingredient/components/IngredientListSheet.tsx', {
    '@/features/ingredient/model/ingredient': {
      getIngredientExpirationStatus: date => ingredientModel.getIngredientExpirationStatus(date, now),
    },
  });
  const sheet = mount(FixedDateSheet, {
    position: { id: 'pocket', slotId: 'pocket' }, onClose() {},
  });
  t.after(() => sheet.unmount());
  await new Promise(setImmediate);
  sheet.render();
  const list = find(sheet.tree, node => node.type === 'FlatList');
  assert.deepEqual(list.props.data, ingredients);
  for (const item of ingredients) {
    assert.equal(list.props.keyExtractor(item), item.id);
    const rendered = list.props.renderItem({ item });
    const texts = findAll(rendered, node => node.type === 'Text').map(node => node.props.children);
    const expiration = ingredientModel.getIngredientExpirationStatus(item.expirationDate, now);
    assert.deepEqual(texts, [item.name, item.quantity, expiration.label]);
    const label = find(rendered, node => node.type === 'Text' && node.props.children === expiration.label);
    assert.equal(flattenStyle(label.props.style).textAlign, 'right');
    assert.equal(flattenStyle(label.props.style).color, expiration.isUrgent ? tokens.colors.error : tokens.colors.textMuted);
    assert.equal(flattenStyle(rendered.props.style).flexDirection, 'row');
    assert.equal(flattenStyle(children(rendered)[0].props.style).flex, 1);
  }
});

test('재료 조회 실패는 빈 목록으로 표시하지 않고 패널에서 다시 불러온다', async t => {
  const previous = ingredientRepository.getIngredientsByPosition;
  t.after(() => { ingredientRepository.getIngredientsByPosition = previous; });
  let calls = 0;
  ingredientRepository.getIngredientsByPosition = async () => {
    if (++calls === 1) throw new Error('검증용 조회 실패');
    return [];
  };
  const sheet = mount(IngredientListSheet, {
    position: { id: 'slot', slotId: 'slot' }, onClose() {},
  });
  t.after(() => sheet.unmount());
  await new Promise(setImmediate);
  sheet.render();
  assert.equal(find(sheet.tree, node => node.props.accessibilityRole === 'alert').props.children, '재료 목록을 불러오지 못했습니다.');
  assert.equal(find(sheet.tree, node => node.type === 'FlatList'), undefined);
  assert.equal(find(sheet.tree, node => node.props.accessibilityLabel === '재료 추가').props.disabled, true);
  const retry = find(sheet.tree, node => node.props.label === '다시 불러오기').props.onPress();
  sheet.render();
  assert(find(sheet.tree, node => node.type === 'ActivityIndicator'));
  await retry;
  sheet.render();
  assert.equal(calls, 2);
  assert.equal(find(sheet.tree, node => node.props.accessibilityRole === 'alert'), undefined);
  assert.deepEqual(find(sheet.tree, node => node.type === 'FlatList').props.data, []);
});

test('이전 위치의 조회가 늦게 끝나도 새 위치의 재료 목록을 덮어쓰지 않는다', async t => {
  const previous = ingredientRepository.getIngredientsByPosition;
  t.after(() => { ingredientRepository.getIngredientsByPosition = previous; });
  const left = deferred();
  const right = deferred();
  ingredientRepository.getIngredientsByPosition = (db, position) => position.drawerNumber === 1 ? left.promise : right.promise;
  const sheet = mount(IngredientListSheet, {
    position: { id: 'slot-left', slotId: 'slot', drawerNumber: 1 }, onClose() {},
  });
  t.after(() => sheet.unmount());
  sheet.props = { ...sheet.props, position: { id: 'slot-right', slotId: 'slot', drawerNumber: 2 } };
  sheet.render();
  const ingredients = [{ id: 'right-item', name: '오른쪽 재료', quantity: '1개', expirationDate: null }];
  right.resolve(ingredients);
  await new Promise(setImmediate);
  sheet.render();
  assert.deepEqual(find(sheet.tree, node => node.type === 'FlatList').props.data, ingredients);
  left.resolve([{ id: 'left-item', name: '늦은 왼쪽 재료' }]);
  await new Promise(setImmediate);
  sheet.render();
  assert.deepEqual(find(sheet.tree, node => node.type === 'FlatList').props.data, ingredients);
});

test('재료 패널은 실제 너비로 양방향 전환하고 전환 중 연속 이동·입력·닫기를 막는다', async t => {
  let closed = 0;
  let nativeClosed = 0;
  const sheet = mount(IngredientListSheet, {
    position: { id: 'slot', slotId: 'slot' }, onClose() { closed++; },
  });
  t.after(() => sheet.unmount());
  await new Promise(setImmediate);
  sheet.render();
  sheet.tree.props.ref.current = { close() { nativeClosed++; } };
  const input = label => find(sheet.tree, node => node.props.accessibilityLabel === label);
  const track = () => find(sheet.tree, node => node.type === 'Animated.View');
  const viewport = find(sheet.tree, node => children(node).includes(track()));
  viewport.props.onLayout({ nativeEvent: { layout: { width: 320 } } });
  sheet.render();
  assert.deepEqual(flattenStyle(track().props.style).transform[0].translateX.outputRange, [0, -320]);
  assert.equal(children(track())[0].props.pointerEvents, 'auto');
  assert.equal(input('재료명'), undefined);

  const add = input('재료 추가');
  const animationCount = animations.length;
  add.props.onPress();
  add.props.onPress();
  sheet.render();
  assert.equal(animations.length, animationCount + 1);
  assert.deepEqual(animations.at(-1).config, { toValue: 1, duration: 240, useNativeDriver: true });
  assert(find(sheet.tree, node => node.type === 'FlatList'));
  assert(input('재료명'));
  for (const page of children(track())) {
    assert.equal(page.props.pointerEvents, 'none');
    assert.equal(page.props.accessibilityElementsHidden, true);
    assert.equal(page.props.importantForAccessibility, 'no-hide-descendants');
  }
  assert.equal(sheet.tree.props.enablePanDownToClose, false);
  input('재료명').props.onChangeText('전환 중 변경 금지');
  input('유통기한 날짜 선택').props.onPress();
  input('재료 목록으로 돌아가기').props.onPress();
  await input('재료 등록').props.onPress();
  children(sheet.tree)[0].props.onAccessibilityEscape();
  sheet.tree.props.onClose();
  sheet.render();
  assert.equal(animations.length, animationCount + 1);
  assert.equal(input('재료명').props.value, '');
  assert.equal(find(sheet.tree, node => node.type === 'IngredientExpirationCalendar'), undefined);
  assert.equal(closed, 0);
  assert.equal(nativeClosed, 0);

  animations.at(-1).finish();
  sheet.render();
  assert.equal(children(track())[1].props.pointerEvents, 'auto');
  assert.equal(children(track())[1].props.accessibilityElementsHidden, false);
  assert.equal(find(sheet.tree, node => node.type === 'FlatList'), undefined);
  assert.equal(sheet.tree.props.enablePanDownToClose, true);
  input('재료명').props.onChangeText('계란');
  sheet.render();
  input('재료 목록으로 돌아가기').props.onPress();
  sheet.render();
  assert.equal(animations.at(-1).config.toValue, 0);
  assert.equal(input('재료명').props.value, '계란');
  assert(find(sheet.tree, node => node.type === 'FlatList'));
  animations.at(-1).finish();
  sheet.render();
  assert.equal(input('재료명'), undefined);
  assert.equal(children(track())[0].props.pointerEvents, 'auto');
  input('재료 추가').props.onPress();
  animations.at(-1).finish(false);
  sheet.render();
  assert.equal(animations.at(-1).value.value, 1);
  assert.equal(input('재료명').props.value, '계란');
  assert.equal(input('재료명').props.editable, true);
});

test('추가도 같은 시트의 축소 높이를 기본으로 사용하고 날짜 선택·해제와 목록 복귀 후 입력 유지를 지원한다', async t => {
  const previous = { ...ingredientRepository };
  t.after(() => Object.assign(ingredientRepository, previous));
  ingredientRepository.getIngredientsByPosition = async () => [];
  const { sheet, input, save, openCalendar } = await ingredientFormFixture(t);
  assert.equal(sheet.tree.type, 'BottomSheet');
  assert.equal(sheet.tree.props.index, 0);
  assert.equal(input('재료 시트 닫기'), undefined);
  assert.equal(find(sheet.tree, node => node.type === 'Modal'), undefined);
  const header = find(sheet.tree, node => children(node).includes(save()));
  assert.equal(flattenStyle(header.props.style).alignItems, 'center');
  const title = find(header, node => node.props.accessibilityRole === 'header');
  const heading = find(header, node => children(node).includes(title));
  assert.equal(flattenStyle(heading.props.style).justifyContent, 'center');
  assert.equal(flattenStyle(heading.props.style).minHeight, 48);
  for (const button of [input('재료 목록으로 돌아가기'), save()]) {
    assert.equal(flattenStyle(button.props.style).width, 48);
    assert.equal(flattenStyle(button.props.style).height, 48);
    assert.equal(find(button, node => node.type === 'Icon').props.size, 32);
  }
  assert.equal(find(save(), node => node.type === 'Icon').props.name, 'checkbox-marked-circle-plus-outline');
  assert.equal(find(sheet.tree, node => node.props.label === '저장'), undefined);
  assert.equal(save().props.disabled, true);
  const quantityFocus = [];
  input('재료 수량').props.ref.current = { focus() { quantityFocus.push(true); } };
  input('재료명').props.onSubmitEditing();
  assert.equal(quantityFocus.length, 1);
  input('재료명').props.onChangeText('계란');
  input('재료 수량').props.onChangeText('2개');
  sheet.render();
  assert.equal(save().props.disabled, false);
  openCalendar();
  assert.equal(save().props.disabled, true);
  const picker = find(sheet.tree, node => node.type === 'IngredientExpirationCalendar');
  assert.equal(picker.props.value, null);
  assert.deepEqual(picker.props.anchor, { x: 24, y: 360, width: 327, height: 52 });
  assert.equal(find(find(sheet.tree, node => node.type === 'ScrollView'), node => node.type === 'IngredientExpirationCalendar'), undefined);
  assert.equal(find(sheet.tree, node => node.props.label === '이 날짜로 선택'), undefined);
  picker.props.onDismiss();
  sheet.render();
  assert.equal(find(sheet.tree, node => node.type === 'IngredientExpirationCalendar'), undefined);
  assert.equal(save().props.disabled, false);
  openCalendar();
  find(sheet.tree, node => node.type === 'IngredientExpirationCalendar').props.onSelect('2026-11-04');
  sheet.render();
  assert(find(input('유통기한 날짜 선택'), node => node.props.children === '2026-11-04'));
  assert(find(sheet.tree, node => node.type === 'IngredientExpirationCalendar'));
  find(sheet.tree, node => node.type === 'IngredientExpirationCalendar').props.onDismiss();
  sheet.render();
  assert.equal(find(sheet.tree, node => node.type === 'IngredientExpirationCalendar'), undefined);
  assert.equal(save().props.disabled, false);
  input('유통기한 선택 해제').props.onPress();
  sheet.render();
  assert(find(input('유통기한 날짜 선택'), node => node.props.children === '날짜 선택'));
  input('재료 목록으로 돌아가기').props.onPress();
  sheet.render();
  animations.at(-1).finish();
  sheet.render();
  assert.equal(sheet.tree.props.index, 0);
  assert(find(sheet.tree, node => node.type === 'FlatList'));
  find(sheet.tree, node => node.props.accessibilityLabel === '재료 추가').props.onPress();
  animations.at(-1).finish();
  sheet.render();
  assert.equal(input('재료명').props.value, '계란');
  assert.equal(input('재료 수량').props.value, '2개');
});

test('날짜 팝업은 키보드가 닫힌 뒤 네이티브 화면 좌표를 받고 이전 요청의 측정 결과를 무시한다', async t => {
  const previousKeyboard = { ...native.Keyboard };
  t.after(() => Object.assign(native.Keyboard, previousKeyboard));
  let keyboardVisible = true;
  let keyboardHidden;
  native.Keyboard.isVisible = () => keyboardVisible;
  native.Keyboard.addListener = (event, callback) => {
    assert.equal(event, 'keyboardDidHide');
    keyboardHidden = callback;
    return { remove() {} };
  };
  const { sheet, input } = await ingredientFormFixture(t);
  const measurement = () => find(sheet.tree, node => node.type === 'IngredientDateFieldAnchor');
  const popup = () => find(sheet.tree, node => node.type === 'IngredientExpirationCalendar');
  input('유통기한 날짜 선택').props.onPress();
  sheet.render();
  assert.equal(measurement(), undefined);
  assert.equal(popup(), undefined);
  input('재료 목록으로 돌아가기').props.onPress();
  keyboardHidden();
  sheet.render();
  assert.equal(measurement(), undefined);
  animations.at(-1).finish();
  sheet.render();
  input('재료 추가').props.onPress();
  animations.at(-1).finish();
  sheet.render();

  input('유통기한 날짜 선택').props.onPress();
  keyboardVisible = false;
  keyboardHidden();
  sheet.render();
  const firstMeasurement = measurement().props.onMeasure;
  input('재료 목록으로 돌아가기').props.onPress();
  firstMeasurement({ x: 33, y: 752, width: 327, height: 52 });
  sheet.render();
  assert.equal(popup(), undefined);
  animations.at(-1).finish();
  sheet.render();
  input('재료 추가').props.onPress();
  animations.at(-1).finish();
  sheet.render();
  input('유통기한 날짜 선택').props.onPress();
  sheet.render();
  const earlierMeasurement = measurement().props.onMeasure;
  input('유통기한 날짜 선택').props.onPress();
  sheet.render();
  const latestMeasurement = measurement().props.onMeasure;
  earlierMeasurement({ x: 24, y: 330, width: 343, height: 52 });
  sheet.render();
  assert.equal(popup(), undefined);
  const frame = { x: 33, y: 752, width: 327, height: 52 };
  latestMeasurement(frame);
  sheet.render();
  assert.deepEqual(popup().props.anchor, frame);
  assert.equal(measurement(), undefined);
  latestMeasurement({ ...frame, y: 330 });
  sheet.render();
  assert.deepEqual(popup().props.anchor, frame);
  popup().props.onDismiss();
  latestMeasurement({ ...frame, y: 330 });
  sheet.render();
  assert.equal(popup(), undefined);
});

test('날짜 입력 영역은 iOS·Android 네이티브의 창 좌표와 실제 폭을 전달하고 터치를 가로채지 않는다', () => {
  const frame = { x: 33, y: 752, width: 327, height: 52 };
  for (const [platform, modifierType] of [['ios', 'onGeometryChange'], ['android', 'onGloballyPositioned']]) {
    const { IngredientDateFieldAnchor } = loadComponent(`src/features/ingredient/components/IngredientDateFieldAnchor.${platform}.tsx`);
    const measured = [];
    const anchor = IngredientDateFieldAnchor({ onMeasure(value) { measured.push(value); } });
    assert.equal(anchor.props.pointerEvents, 'none');
    assert.deepEqual(anchor.props.style, native.StyleSheet.absoluteFill);
    const observer = children(anchor)[0].props.modifiers.find(modifier => modifier.type === modifierType);
    observer.value(frame);
    assert.deepEqual(measured, [frame]);
  }
});

test('iOS 날짜 선택기는 UIKit 고유 크기를 비율대로 맞추고 선택 이벤트를 즉시 한 번 전달한다', t => {
  const { IngredientExpirationDatePicker } = loadComponent('src/features/ingredient/components/IngredientExpirationDatePicker.ios.tsx');
  const selected = [];
  const measured = [];
  const value = new Date(2028, 1, 29, 12);
  const host = mount(IngredientExpirationDatePicker, {
    value, width: 305, disabled: false,
    onChange(date) { selected.push(date); }, onContentHeight(height) { measured.push(height); },
  });
  t.after(() => host.unmount());
  assert.equal(host.tree.type, 'View');
  const picker = () => find(host.tree, node => node.type === 'UIKitDateTimePicker');
  assert.strictEqual(picker().props.value, value);
  assert.equal(picker().props.mode, 'date');
  assert.equal(picker().props.display, 'inline');
  assert.equal(picker().props.locale, 'ko_KR');
  const measure = (width, height) => picker().props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
  measure(0, 0);
  host.render();
  assert.deepEqual(measured, []);
  measure(330, 360);
  host.render();
  const scale = 305 / 330;
  assert.equal(picker().props.style.transform[0].scale, scale);
  assert.equal(host.tree.props.style.height, 360 * scale);
  assert.deepEqual(measured, [360 * scale]);
  host.props = { ...host.props, width: 280 };
  host.render();
  assert.equal(host.tree.props.style.height, 360 * 280 / 330);
  const changed = new Date(2028, 2, 1, 12);
  picker().props.onValueChange({}, changed);
  // React 재렌더나 애니메이션을 기다리지 않고 전달한다.
  assert.deepEqual(selected, [changed]);
  const measuredBeforeClose = [...measured];
  measure(330, 500);
  picker().props.onValueChange({}, new Date(2028, 2, 2, 12));
  host.props = { ...host.props, layoutFrozen: true };
  host.render();
  assert.strictEqual(picker().props.value, value);
  assert.equal(host.tree.props.style.height, 360 * 280 / 330);
  assert.deepEqual(measured, measuredBeforeClose);
  assert.deepEqual(selected, [changed]);
});

test('날짜 팝업은 iOS의 높이를 일정하게 유지하고 버튼 위아래에 붙어 네이티브 날짜 변경을 전달한다', async t => {
  for (const platform of ['ios', 'android']) await t.test(platform, t => {
    const previousPlatform = native.Platform.OS;
    const previousWindow = native.useWindowDimensions;
    native.Platform.OS = platform;
    t.after(() => { native.Platform.OS = previousPlatform; });
    const selected = [];
    let dismissed = 0;
    const calendar = mount(IngredientExpirationCalendar, {
      value: '2028-02-29', anchor: { x: 24, y: 360, width: 327, height: 52 },
      onSelect(date) { selected.push(date); }, onDismiss() { dismissed++; },
    });
    t.after(() => calendar.unmount());
    const picker = () => find(calendar.tree, node => node.type === 'IngredientExpirationDatePicker');
    assert.equal(calendar.tree.type, 'Modal');
    assert.equal(picker().props.value.getFullYear(), 2028);
    assert.equal(picker().props.value.getMonth(), 1);
    assert.equal(picker().props.value.getDate(), 29);
    const popup = () => find(calendar.tree, node => node.type === 'View' && flattenStyle(node.props.style).position === 'absolute');
    const calendarContent = find(calendar.tree, node => node.type === 'View' && flattenStyle(node.props.style).width === 305);
    if (platform === 'android') calendarContent.props.onLayout({ nativeEvent: { layout: { height: 340 } } });
    else picker().props.onContentHeight(335);
    calendar.render();
    assert.equal(flattenStyle(popup().props.style).height, platform === 'ios' ? 357 : 362);
    assert.equal(picker().props.height, undefined);
    assert.equal(flattenStyle(popup().props.style).width, 327);
    assert.equal(flattenStyle(popup().props.style).left, 24);
    assert.equal(picker().props.width, 305);
    assert(flattenStyle(popup().props.style).top >= 412);
    assert(flattenStyle(popup().props.style).top + flattenStyle(popup().props.style).height <= 800);
    native.useWindowDimensions = () => ({ width: 393, height: 852 });
    t.after(() => { native.useWindowDimensions = previousWindow; });
    calendar.props = { ...calendar.props, anchor: { x: 33, y: 752, width: 327, height: 52 } };
    calendar.render();
    assert.equal(flattenStyle(popup().props.style).width, 327);
    assert.equal(flattenStyle(popup().props.style).left, 33);
    assert.equal(flattenStyle(popup().props.style).height, platform === 'ios' ? 357 : 362);
    assert.equal(flattenStyle(popup().props.style).top + flattenStyle(popup().props.style).height, 746);
    native.useWindowDimensions = () => ({ width: 800, height: 1024 });
    calendar.props = { ...calendar.props, anchor: { x: 123, y: 700, width: 327, height: 52 } };
    calendar.render();
    assert.equal(flattenStyle(popup().props.style).width, 327);
    assert.equal(flattenStyle(popup().props.style).left, 123);
    assert(flattenStyle(popup().props.style).top + flattenStyle(popup().props.style).height <= 700);
    assert.deepEqual(selected, []);
    if (platform === 'android') {
      picker().props.onChange(new Date(2028, 1, 29, 0, 0));
      assert.deepEqual(selected, []);
    }
    const displayedStyle = flattenStyle(popup().props.style);
    picker().props.onContentHeight(500);
    picker().props.onChange(new Date(2028, 2, 1, 0, 30));
    calendar.render();
    assert.equal(calendar.tree.props.visible, true);
    assert.equal(calendar.tree.props.animationType, 'none');
    assert.equal(calendar.tree.props.onDismiss, undefined);
    assert.equal(picker().props.layoutFrozen, true);
    assert.deepEqual(flattenStyle(popup().props.style), displayedStyle);
    assert.deepEqual(selected, ['2028-03-01']);
    picker().props.onContentHeight(200);
    picker().props.onChange(new Date(2028, 2, 2, 0, 30));
    calendar.tree.props.onRequestClose();
    calendar.render();
    assert.deepEqual(flattenStyle(popup().props.style), displayedStyle);
    const fade = animations.at(-1);
    assert.deepEqual(fade.config, { toValue: 0, duration: 140, useNativeDriver: true });
    fade.finish();
    fade.finish();
    assert.deepEqual(selected, ['2028-03-01']);
    assert.equal(dismissed, 1);
    calendar.props = { ...calendar.props, disabled: true };
    calendar.render();
    assert.equal(picker().props.disabled, true);
    picker().props.onChange(new Date(2028, 2, 2, 23, 30));
    assert.deepEqual(selected, ['2028-03-01']);
  });
});

test('날짜 팝업은 모달을 전환하지 않고 레이어만 페이드하며 중복 종료와 해제 후 콜백을 막는다', t => {
  const previousPlatform = native.Platform.OS;
  t.after(() => { native.Platform.OS = previousPlatform; });
  for (const platform of ['ios', 'android']) for (const trigger of ['back', 'outside', 'escape']) {
    native.Platform.OS = platform;
    let dismissed = 0;
    const calendar = mount(IngredientExpirationCalendar, {
      value: null, anchor: { x: 33, y: 752, width: 327, height: 52 }, disabled: true,
      onSelect() { assert.fail('비활성화된 달력은 날짜를 선택하지 않는다.'); }, onDismiss() { dismissed++; },
    });
    t.after(() => calendar.unmount());
    const picker = find(calendar.tree, node => node.type === 'IngredientExpirationDatePicker');
    picker.props.onChange(new Date(2028, 1, 29, 12));
    calendar.render();
    assert.equal(calendar.tree.props.visible, true);
    const close = trigger === 'back' ? calendar.tree.props.onRequestClose
      : trigger === 'outside' ? find(calendar.tree, node => node.props.accessibilityLabel === '유통기한 달력 닫기').props.onPress
        : children(calendar.tree)[0].props.onAccessibilityEscape;
    close();
    close();
    calendar.render();
    assert.equal(calendar.tree.props.visible, true);
    assert.equal(calendar.tree.props.animationType, 'none');
    assert.equal(dismissed, 0);
    assert(find(calendar.tree, node => node.type === 'IngredientExpirationDatePicker'));
    const fade = animations.at(-1);
    fade.finish(false);
    fade.finish();
    assert.equal(dismissed, 1);
  }
  native.Platform.OS = 'ios';
  let selected = 0;
  let dismissed = 0;
  const interrupted = mount(IngredientExpirationCalendar, {
    value: null, anchor: { x: 33, y: 752, width: 327, height: 52 },
    onSelect() { selected++; }, onDismiss() { dismissed++; },
  });
  find(interrupted.tree, node => node.type === 'IngredientExpirationDatePicker').props.onChange(new Date(2028, 1, 29, 12));
  const interruptedFade = animations.at(-1);
  interrupted.unmount();
  interruptedFade.finish();
  assert.equal(selected, 1);
  assert.equal(dismissed, 0);
});

test('날짜 선택은 페이드 완료 전에 입력에 반영되고 달력 크기·값은 종료까지 유지된다', async t => {
  const { sheet, input, save, openCalendar } = await ingredientFormFixture(t);
  input('재료명').props.onChangeText('계란');
  input('재료 수량').props.onChangeText('2개');
  sheet.render();
  openCalendar();
  const panelCalendar = () => find(sheet.tree, node => node.type === 'IngredientExpirationCalendar');
  const calendar = mount(IngredientExpirationCalendar, panelCalendar().props);
  t.after(() => calendar.unmount());
  const picker = () => find(calendar.tree, node => node.type === 'IngredientExpirationDatePicker');
  const popupStyle = () => flattenStyle(find(calendar.tree,
    node => node.type === 'View' && flattenStyle(node.props.style).position === 'absolute').props.style);
  picker().props.onContentHeight(335);
  calendar.render();
  animations.at(-1).finish();
  const initialValue = picker().props.value;
  const displayedStyle = popupStyle();

  picker().props.onChange(new Date(2028, 1, 29, 12));
  sheet.render();
  assert(find(input('유통기한 날짜 선택'), node => node.props.children === '2028-02-29'));
  assert(panelCalendar());
  assert.equal(save().props.disabled, true);
  const fade = animations.at(-1);
  assert.deepEqual(fade.config, { toValue: 0, duration: 140, useNativeDriver: true });

  calendar.props = panelCalendar().props;
  calendar.render();
  picker().props.onContentHeight(500);
  calendar.render();
  assert.equal(calendar.tree.props.visible, true);
  assert.equal(calendar.tree.props.animationType, 'none');
  assert.strictEqual(picker().props.value, initialValue);
  assert.deepEqual(popupStyle(), displayedStyle);
  fade.finish();
  sheet.render();
  assert.equal(panelCalendar(), undefined);
  assert.equal(save().props.disabled, false);
  assert(find(input('유통기한 날짜 선택'), node => node.props.children === '2028-02-29'));
});

test('재료 저장 성공 알림을 확인할 때까지 중복 요청·입력·닫기를 막고 확인 후 목록을 갱신한다', async t => {
  const previous = { ...ingredientRepository };
  t.after(() => Object.assign(ingredientRepository, previous));
  const pending = deferred();
  const calls = [];
  const queries = [];
  const persisted = [];
  ingredientRepository.getIngredientsByPosition = async (db, position) => { queries.push(position); return [...persisted]; };
  ingredientRepository.registerIngredient = (db, input) => { assert.strictEqual(db, database); calls.push(input); return pending.promise; };
  let closed = 0;
  const { sheet, input, save } = await ingredientFormFixture(t, () => { closed++; });
  const registered = [];
  sheet.props = { ...sheet.props, onRegistered: ingredient => registered.push(ingredient) };
  sheet.render();
  const nativeClose = [];
  sheet.tree.props.ref.current = { close() { nativeClose.push(true); } };
  input('재료명').props.onChangeText(' 계란 ');
  input('재료 수량').props.onChangeText(' 2개 ');
  sheet.render();
  const alertCount = alerts.length;
  const animationCount = animations.length;
  const firstSave = save().props.onPress();
  const duplicateSave = save().props.onPress();
  sheet.render();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { name: ' 계란 ', quantity: ' 2개 ', expirationDate: null, slotId: 'slot', drawerNumber: 1 });
  assert.equal(save().props.accessibilityState.busy, true);
  assert(find(save(), node => node.props.accessibilityLabel === '재료 등록 중'));
  assert.equal(sheet.tree.props.enablePanDownToClose, false);
  assert.equal(input('재료명').props.editable, false);
  assert.equal(input('재료 수량').props.editable, false);
  assert.equal(input('재료 시트 닫기'), undefined);
  assert.equal(input('재료 목록으로 돌아가기').props.disabled, true);
  input('재료명').props.onChangeText('저장 중 변경 금지');
  input('재료 목록으로 돌아가기').props.onPress();
  children(sheet.tree)[0].props.onAccessibilityEscape();
  sheet.tree.props.onClose();
  sheet.render();
  assert.equal(input('재료명').props.value, ' 계란 ');
  assert.equal(closed, 0);
  assert.equal(nativeClose.length, 0);
  assert.equal(alerts.length, alertCount);
  assert.deepEqual(registered, []);
  persisted.push({ id: 'saved-item', name: '계란', quantity: '2개', expirationDate: null, slotId: 'slot', drawerNumber: 1 });
  pending.resolve(persisted[0]);
  await Promise.all([firstSave, duplicateSave]);
  sheet.render();
  assert.deepEqual(registered, persisted);
  assert.equal(alerts.length, alertCount + 1);
  const success = alerts.at(-1);
  assert.deepEqual(success.slice(0, 2), ['알림', '재료를 등록했습니다.']);
  assert.equal(success[2].length, 1);
  assert.equal(success[2][0].text, '확인');
  assert.equal(success[3].cancelable, false);
  assert.equal(animations.length, animationCount);
  assert.equal(save().props.disabled, true);
  assert.equal(input('재료명').props.value, ' 계란 ');
  await save().props.onPress();
  input('재료명').props.onChangeText('확인 전 변경 금지');
  input('재료 목록으로 돌아가기').props.onPress();
  children(sheet.tree)[0].props.onAccessibilityEscape();
  sheet.tree.props.onClose();
  sheet.render();
  assert.equal(calls.length, 1);
  assert.equal(alerts.length, alertCount + 1);
  assert.deepEqual(registered, persisted);
  assert.equal(animations.length, animationCount);
  assert.equal(input('재료명').props.value, ' 계란 ');
  assert.equal(closed, 0);
  assert.equal(nativeClose.length, 0);
  success[2][0].onPress();
  success[2][0].onPress();
  sheet.render();
  assert.equal(animations.length, animationCount + 1);
  assert.equal(animations.at(-1).config.toValue, 0);
  assert.equal(input('재료명').props.value, ' 계란 ');
  assert.equal(sheet.tree.props.enablePanDownToClose, false);
  animations.at(-1).finish();
  sheet.render();
  await new Promise(setImmediate);
  sheet.render();
  assert.equal(sheet.tree.props.index, 0);
  assert.equal(sheet.tree.props.enablePanDownToClose, true);
  assert.deepEqual(queries, [{ slotId: 'slot', drawerNumber: 1 }, { slotId: 'slot', drawerNumber: 1 }]);
  assert.deepEqual(find(sheet.tree, node => node.type === 'FlatList').props.data, persisted);
  find(sheet.tree, node => node.props.accessibilityLabel === '재료 추가').props.onPress();
  animations.at(-1).finish();
  sheet.render();
  assert.equal(input('재료명').props.value, '');
  assert.equal(input('재료 수량').props.value, '');
  assert.equal(save().props.disabled, true);
});

test('재료 저장 실패는 입력을 유지하고 성공 후 목록 재조회 실패는 중복 등록 없이 복구한다', async t => {
  const previous = { ...ingredientRepository };
  t.after(() => Object.assign(ingredientRepository, previous));
  let reads = 0;
  let writes = 0;
  const persisted = { id: 'item', name: '우유', quantity: '반 통', expirationDate: '2026-11-30', slotId: 'slot', drawerNumber: 1 };
  ingredientRepository.getIngredientsByPosition = async () => {
    if (++reads === 2) throw new Error('검증용 저장 후 조회 실패');
    return reads === 1 ? [] : [persisted];
  };
  ingredientRepository.registerIngredient = async (db, input) => {
    if (++writes === 1) throw new Error('내부 DB 오류');
    assert.equal(input.expirationDate, '2026-11-30');
    return persisted;
  };
  const { sheet, input, save, openCalendar } = await ingredientFormFixture(t);
  const registered = [];
  sheet.props = { ...sheet.props, onRegistered: ingredient => registered.push(ingredient) };
  sheet.render();
  input('재료명').props.onChangeText('우유');
  input('재료 수량').props.onChangeText('반 통');
  openCalendar();
  find(sheet.tree, node => node.type === 'IngredientExpirationCalendar').props.onSelect('2026-11-30');
  sheet.render();
  find(sheet.tree, node => node.type === 'IngredientExpirationCalendar').props.onDismiss();
  sheet.render();
  const alertCount = alerts.length;
  await save().props.onPress();
  sheet.render();
  assert.equal(alerts.length, alertCount);
  assert.match(find(sheet.tree, node => node.props.accessibilityRole === 'alert').props.children, /재료를 저장하지 못했습니다/);
  assert.deepEqual(registered, []);
  assert.equal(input('재료명').props.value, '우유');
  assert.equal(input('재료 수량').props.value, '반 통');
  assert.equal(save().props.accessibilityState.busy, false);
  assert.equal(save().props.disabled, false);
  assert.equal(sheet.tree.props.enablePanDownToClose, true);
  await save().props.onPress();
  sheet.render();
  assert.equal(alerts.length, alertCount + 1);
  alerts.at(-1)[2][0].onPress();
  sheet.render();
  animations.at(-1).finish();
  sheet.render();
  await new Promise(setImmediate);
  sheet.render();
  assert.equal(input('재료명'), undefined);
  assert.equal(save(), undefined);
  assert.equal(find(sheet.tree, node => node.props.accessibilityRole === 'alert').props.children, '재료 목록을 불러오지 못했습니다.');
  assert.equal(writes, 2);
  assert.deepEqual(registered, [persisted]);
  find(sheet.tree, node => node.props.label === '다시 불러오기').props.onPress();
  sheet.render();
  await new Promise(setImmediate);
  sheet.render();
  assert.deepEqual(find(sheet.tree, node => node.type === 'FlatList').props.data, [persisted]);
  assert.equal(writes, 2);
});

test('홈·등록·편집은 닫힘·열림 크기를 공유하고 홈의 중앙 위치만 화면 전체를 기준으로 삼는다', async t => {
  const previousGet = repository.getRefrigerator;
  const previousWindow = native.useWindowDimensions;
  t.after(() => { repository.getRefrigerator = previousGet; native.useWindowDimensions = previousWindow; });
  for (const [width, height] of [[320, 568], [375, 844], [768, 1024]]) {
    native.useWindowDimensions = () => ({ width, height });
    for (const rowCount of [1, 2, 3, 4]) for (const doorCount of [1, 2]) {
      const registration = mount(RefrigeratorRegistrationScreen, { navigation: { goBack() {}, dispatch() {} } });
      t.after(() => registration.unmount());
      const registrationMap = () => find(registration.tree, named('FridgeInteriorMap'));
      while (registrationMap().props.draft.rows.length > rowCount) {
        const count = registrationMap().props.draft.rows.length;
        find(registration.tree, node => node.props.accessibilityLabel === `${count}단 삭제`).props.onPress();
        registration.render();
      }
      while (registrationMap().props.draft.rows.length < rowCount) {
        find(registration.tree, node => node.props.label === '단 추가').props.onPress();
        registration.render();
      }
      if (doorCount === 2) for (let index = 0; index < rowCount; index++) {
        find(registration.tree, node => node.props.accessibilityLabel === `${index + 1}단 문 늘리기`).props.onPress();
        registration.render();
      }
      const saved = { id: 'shared-fridge', ...structuredClone(registrationMap().props.draft) };
      repository.getRefrigerator = async () => structuredClone(saved);
      const home = mount(HomeScreen, { navigation: { navigate() {} } });
      const editor = mount(RefrigeratorRegistrationScreen, {
        navigation: { goBack() {}, dispatch() {} }, route: { params: { refrigeratorId: saved.id } },
      });
      t.after(() => { home.unmount(); editor.unmount(); });
      await new Promise(setImmediate);
      home.render(); editor.render();
      for (const screen of [registration, editor]) {
        find(screen.tree, node => node.props.accessibilityLabel === '내부 설정으로 이동').props.onPress();
        animations.at(-1).finish();
        screen.render();
      }
      const screens = [home, registration, editor];
      const configs = screens.map(screen => find(screen.tree, named('FridgeInteriorMap')));
      assert.deepEqual(configs[0].props.layoutSize, configs[1].props.layoutSize);
      assert.deepEqual(configs[0].props.layoutSize, configs[2].props.layoutSize);
      const maps = configs.map(config => mount(config.type, config.props));
      t.after(() => maps.forEach(map => map.unmount()));
      maps.forEach((map, index) => {
        map.tree.props.onLayout({ nativeEvent: { layout: {
          width: width - 48, height: configs[index].props.layoutSize.height + (index === 0 ? 120 : 0),
        } } });
        map.render();
      });
      const canvases = maps.map(map => flattenStyle(children(map.tree)[0].props.style));
      assert.deepEqual(canvases[0], canvases[1]);
      assert.deepEqual(canvases[0], canvases[2]);
      const reference = diagramLayoutModule.getFridgeDiagramSizes({ width, height }, { top: 44, bottom: 34, left: 0, right: 0 });
      const focuses = screens.map((screen, index) => {
        const viewport = find(screen.tree, node => node.type === 'View' && node.props.ref && node.props.onLayout);
        const frame = index === 0 ? { x: 0, y: 0, width, height }
          : { x: 0, y: 115, width, height: reference.opened.height + FRIDGE_MENU_RESERVED_SPACE };
        viewport.props.onLayout({ nativeEvent: { layout: frame } });
        viewport.props.ref.current = { measureInWindow: callback => callback(frame.x, frame.y, frame.width, frame.height) };
        const row = configs[index].props.draft.rows[0];
        configs[index].props.onFocus({ areaId: row.compartments[0].id, returnAreaId: row.doors[0].id,
          canvas: { x: (width - canvases[index].width) / 2, y: 150, width: canvases[index].width, height: canvases[index].height } });
        screen.render();
        return find(screen.tree, named('FridgeFocusView'));
      });
      focuses.forEach(focus => assert.deepEqual(focus.props.sizeViewport, reference.opened));
      const overlays = focuses.map(focus => mount(focus.type, focus.props));
      t.after(() => overlays.forEach(overlay => overlay.unmount()));
      const renderedSizes = overlays.map(overlay => {
        const { width, height } = flattenStyle(moving(overlay).props.style);
        return { width, height };
      });
      assert.deepEqual(renderedSizes[0], renderedSizes[1]);
      assert.deepEqual(renderedSizes[0], renderedSizes[2]);
      const geometries = focuses.map(({ props }) => getFridgeFocusGeometry(props.draft, props.target, props.viewport, props.sizeViewport));
      for (const geometry of geometries.slice(1)) {
        near(geometry.body.width, geometries[0].body.width);
        near(geometry.height, geometries[0].height);
        near(geometry.fitRatio, geometries[0].fitRatio);
        assert.deepEqual(geometry.pockets.map(pocket => pocket.frame), geometries[0].pockets.map(pocket => pocket.frame));
      }
      near(geometries[0].focusedTop + geometries[0].height / 2, height / 2);
    }
  }
});

test('홈 도면의 뒤로가기는 열린 보기를 닫고 재조회 후 늦은 측정 결과는 무시한다', async t => {
  const previous = repository.getRefrigerator;
  t.after(() => { repository.getRefrigerator = previous; });
  const snapshot = savedRefrigerator('다시 읽은 냉장고');
  repository.getRefrigerator = async () => structuredClone(snapshot);
  const home = mount(HomeScreen, { navigation: { navigate() {} } });
  t.after(() => home.unmount());
  await new Promise(setImmediate);
  home.render();
  const viewport = () => find(home.tree, node => node.type === 'View' && node.props.ref && node.props.onLayout);
  const map = () => find(home.tree, named('FridgeInteriorMap'));
  const focus = () => find(home.tree, named('FridgeFocusView'));
  const target = { areaId: snapshot.rows[0].compartments[0].id, returnAreaId: snapshot.rows[0].doors[0].id,
    canvas: { x: 52.5, y: 42, width: 270, height: 540 } };
  viewport().props.ref.current = { measureInWindow: callback => callback(0, 24, 375, 520) };
  map().props.onFocus(target);
  home.render();
  focus().props.onPhaseChange('open');
  home.render();
  assert.equal([...backHandlers].at(-1)(), true);
  home.render();
  assert.equal(focus().props.phase, 'closing');
  focus().props.onPhaseChange('closed');
  home.render();
  let completeMeasurement;
  viewport().props.ref.current = { measureInWindow: callback => { completeMeasurement = callback; } };
  map().props.onFocus(target);
  home.focus();
  await new Promise(setImmediate);
  completeMeasurement(0, 24, 375, 520);
  home.render();
  assert.equal(focus(), undefined);
  assert.equal(map().props.focus, null);
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

test('합친 본체는 어느 문을 눌러도 같은 본체를 열고 외관 선택 표시 없이 내부 포켓을 개별 선택한다', () => {
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
    assert(doors(compartment).every(door => !find(door.type(door.props), named('SelectionFrame'))));
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

test('본체·포켓 내부는 전환 내내 유지하고 한 애니메이션으로 펼친 뒤 각각 조작할 수 있다', () => {
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
  const hingeOpacity = () => flattenStyle(find(moving(focus), node => children(node).some(named('DoorHinges'))).props.style).opacity;
  assert.equal(hingeOpacity().value.value, 0);
  assert.equal(movingDoors(focus)[0].props.progress, progress);
  assert(style.transform.every(transform => Object.values(transform)[0].value === progress));
  opening.finish();
  focus.render();
  assertFocusAccess(focus, 'open');
  assert.equal(hingeOpacity().value.value, 1);
  const close = find(children(focus.tree)[0], node => node.type === 'Pressable');
  assert.equal(close.props.accessibilityLabel, '냉장고 도면 바깥 영역 눌러 닫기');
  close.props.onPress();
  focus.render();
  assertFocusAccess(focus, 'closing');
  assert.equal(hingeOpacity().value.value, 1);
  animations.at(-1).finish();
  focus.render();
  assert.deepEqual(phases, ['open', 'closed']);
  assertFocusAccess(focus, 'closed');
  assert.equal(hingeOpacity().value.value, 0);
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
              assert.equal(find(front, named('SelectionFrame')), undefined);
              if (back) {
                assert.equal(flattenStyle(back.props.style).overflow, 'hidden');
                assert.deepEqual(corners(back.props.style), mirrored(expected));
                const backSurface = flattenStyle(children(back)[0].props.style);
                assert.deepEqual(corners(backSurface), mirrored(expected));
                assert.equal(backSurface.boxShadow, undefined);
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
              assert.equal(selectedStyle.boxShadow, undefined);
              assert.equal(selectedStyle.borderWidth, 2);
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

test('문을 열고 닫는 동안 앞면 인쇄 크기를 유지하고 내부 글자·배지에 배율을 적용하지 않는다', () => {
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
        const hinges = find(moving(focus), node => children(node).some(named('DoorHinges')));
        assert.equal(animations.at(-1).config.useNativeDriver, false);
        for (const node of findAll(moving(focus), node => ['View', 'Animated.View'].includes(node.type))) {
          if (node === hinges) continue;
          assert(!(flattenStyle(node.props.style).transform ?? []).some(transform => 'scaleX' in transform || 'scaleY' in transform));
        }
        for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
          const width = dimensionAt(panelStyle.width, progress);
          const height = dimensionAt(panelStyle.height, progress);
          near(width, geometry.source.width + (geometry.body.width - geometry.source.width) * progress);
          near(height, geometry.source.height + (geometry.body.height - geometry.source.height) * progress);
          assert(width >= Math.min(geometry.source.width, geometry.body.width) - 1e-8);
          assert(width <= Math.max(geometry.source.width, geometry.body.width) + 1e-8);
          assert(height >= Math.min(geometry.source.height, geometry.body.height) - 1e-8);
          assert(height <= Math.max(geometry.source.height, geometry.body.height) + 1e-8);
          if (hinges) {
            const transform = flattenStyle(hinges.props.style).transform;
            near(dimensionAt(transform.find(value => value.scaleX).scaleX, progress), width / geometry.body.width);
            near(dimensionAt(transform.find(value => value.scaleY).scaleY, progress), height / geometry.body.height);
          }
          const centerX = origin.left + dimensionAt(origin.transform[0].translateX, progress)
            + dimensionAt(panelStyle.left, progress) + dimensionAt(panelStyle.transform[0].translateX, progress) + width / 2;
          const centerY = origin.top + dimensionAt(origin.transform[1].translateY, progress)
            + dimensionAt(panelStyle.top, progress) + dimensionAt(panelStyle.transform[1].translateY, progress) + height / 2;
          near(centerX, geometry.source.x - viewport.x + geometry.source.width / 2
            + (geometry.translateX + geometry.body.left + geometry.body.width / 2 - geometry.width / 2) * progress);
          near(centerY, geometry.source.y - viewport.y + geometry.source.height / 2 + geometry.translateY * progress);
          for (const door of movingDoors(focus)) {
            const doorTree = door.type(door.props);
            const doorStyle = flattenStyle(doorTree.props.style);
            near(dimensionAt(doorStyle.width, progress, width), width / geometry.group.doors.length);
            near(dimensionAt(doorStyle.height, progress, height), height);
            const closedDoor = doors(compartment).find(candidate => candidate.props.door.id === door.props.door.id);
            const closedArt = find(closedDoor.type(closedDoor.props), named('DoorModeArt'));
            near(find(doorTree, named('DoorModeArt')).props.size, closedArt.props.size);
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
        const closingPanel = find(moving(focus), node => node.type === 'Animated.View' && flattenStyle(node.props.style).width?.outputRange);
        const closingStyle = flattenStyle(closingPanel.props.style);
        near(dimensionAt(closingStyle.width, 1), geometry.body.width);
        near(dimensionAt(closingStyle.height, 1), geometry.body.height);
        near(dimensionAt(closingStyle.width, 0), geometry.source.width);
        near(dimensionAt(closingStyle.height, 0), geometry.source.height);
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
  near(oldTranslateY.outputRange[1], 0);
  focus.props = { ...focus.props, viewport: { ...focus.props.viewport, height: 520 } };
  focus.render();
  assert.equal(animations.at(-1), animation);
  const after = flattenStyle(moving(focus).props.style);
  near(after.top + after.height / 2 + oldTranslateY.outputRange[1], 260);
  near(after.transform.find(transform => transform.translateY).translateY.outputRange[1], 0);
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

test('본체·포켓의 흰색 이름 영역을 누르면 해당 영역의 선택 상태와 편집 대상을 전환한다', () => {
  const { draft, requests, compartment } = fixture();
  selectDoor(compartment);
  const { focus, selected } = focusedFixture(draft, requests[0]);
  animations.at(-1).finish();
  focus.render();
  let pocket = interiorAreas(focus).find(node => !node.props.area.isBody);
  const pocketMap = find(pocket.type(pocket.props), node => node.type === mapModule.FridgeMap);
  const pocketTree = mapModule.FridgeMap(pocketMap.props);
  const pocketFrame = find(pocketTree, node => children(node).includes(pocketMap.props.areaHeader));
  assert.equal(pocketFrame.type, 'Pressable');
  assert.equal(findAll(pocketTree, node => node.type === 'Pressable').length, 1);
  assert.equal(pocketFrame.props.accessibilityState.selected, false);
  pocketFrame.props.onPress();
  focus.render();
  assert.equal(focus.props.selectedAreaId, draft.rows[0].doors[0].id);
  assert.equal(interiorAreas(focus).find(node => !node.props.area.isBody).props.selected, true);
  assert.equal(interiorAreas(focus).find(node => node.props.area.isBody).props.selected, false);
  const body = interiorAreas(focus).find(node => node.props.area.isBody);
  const bodyMap = find(body.type(body.props), node => node.type === mapModule.FridgeMap);
  for (const mode of ['CHILLED', 'FROZEN']) {
    const bodyTree = mapModule.FridgeMap({ ...bodyMap.props, storageMode: mode });
    const bodyFrame = find(bodyTree, node => children(node).includes(bodyMap.props.areaHeader));
    assert.equal(bodyFrame.type, 'Pressable');
    assert.equal(findAll(bodyTree, node => node.type === 'Pressable').length, 1);
    assert.equal(bodyFrame.props.disabled, false);
    assert.equal(bodyFrame.props.accessibilityState.selected, false);
  }
  const disabledFrame = find(mapModule.FridgeMap({ ...bodyMap.props, disabled: true }),
    node => children(node).includes(bodyMap.props.areaHeader));
  assert.equal(disabledFrame.props.disabled, true);
  assert.equal(disabledFrame.props.accessibilityState.disabled, true);
  find(mapModule.FridgeMap(bodyMap.props), node => children(node).includes(bodyMap.props.areaHeader)).props.onPress();
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

test('큰 도면은 본체·포켓을 같은 비율로 줄이고 세로 스크롤 없이 표시한다', () => {
  for (const opening of ['LEFT_DOOR', 'RIGHT_DOOR', 'DRAWER']) {
    let draft = model.createRefrigeratorDraft();
    draft = model.removeDraftRow(draft, draft.rows[1].id);
    const row = draft.rows[0];
    draft = model.setDraftDoorOpening(draft, row.id, row.doors[0].id, opening);
    const { compartment, requests } = fixture(draft);
    selectDoor(compartment);
    const viewport = { x: 0, y: 120, width: 375, height: 320 };
    const geometry = getFridgeFocusGeometry(draft, requests[0], viewport);
    assert(geometry.fitRatio > 0 && geometry.fitRatio < 1);
    assert(geometry.focusedTop >= 0);
    assert(geometry.focusedTop + geometry.contentHeight <= viewport.height);
    near(geometry.body.width / geometry.source.width, geometry.height / geometry.source.height);
    near(geometry.body.width / geometry.height, geometry.source.width / geometry.source.height);
    for (const { frame } of geometry.pockets) {
      near(frame.height, geometry.body.height);
      near(frame.width * geometry.group.doors.length, geometry.body.width);
    }
    const { focus } = focusedFixture(draft, requests[0], viewport);
    assertFocusAccess(focus, 'opening');
    animations.at(-1).finish();
    focus.render();
    assertFocusAccess(focus, 'open');
    assert.equal(find(focus.tree, node => node.type === 'ScrollView' && !node.props.horizontal), undefined);
    focus.props.onClose();
    focus.render();
    assertFocusAccess(focus, 'closing');
    const origin = flattenStyle(moving(focus).props.style);
    const panel = find(moving(focus), node => node.type === 'Animated.View' && flattenStyle(node.props.style).width?.outputRange);
    const panelStyle = flattenStyle(panel.props.style);
    for (const progress of [1, 0.75, 0.5, 0.25, 0]) {
      const width = dimensionAt(panelStyle.width, progress);
      const height = dimensionAt(panelStyle.height, progress);
      near(width / height, geometry.source.width / geometry.source.height);
      const centerY = origin.top + dimensionAt(origin.transform[1].translateY, progress)
        + dimensionAt(panelStyle.top, progress) + height / 2;
      near(centerY, geometry.source.y - viewport.y + geometry.source.height / 2 + geometry.translateY * progress);
    }
    near(dimensionAt(panelStyle.width, 0), geometry.source.width);
    near(dimensionAt(panelStyle.height, 0), geometry.source.height);
    animations.at(-1).finish();
    focus.render();
    assertFocusAccess(focus, 'closed');
    const fits = getFridgeFocusGeometry(draft, requests[0], { ...viewport, height: 700 });
    assert(fits.fitRatio > 1);
    near(fits.height, opening === 'DRAWER' ? 652 : 636);
    near(fits.body.width, opening === 'DRAWER' ? 326 : 318);
    near(fits.focusedTop + fits.height / 2, 350);
    focus.unmount();
  }
});

test('같은 원본 비율과 칸 조건이면 단·도어 조합에 관계없이 같은 크기로 편집한다', () => {
  for (const opening of ['LEFT_DOOR', 'RIGHT_DOOR', 'DRAWER']) {
    const geometries = [[1, 1], [2, 2]].map(([rowCount, doorCount]) => {
      let draft = model.createRefrigeratorDraft();
      if (rowCount === 1) draft = model.removeDraftRow(draft, draft.rows[1].id);
      const rowId = draft.rows[0].id;
      if (doorCount === 2) draft = model.changeDraftDoorCount(draft, rowId, 1);
      draft = model.setDraftDoorOpening(draft, rowId, draft.rows[0].doors[0].id, opening);
      const { compartment, requests } = fixture(draft);
      selectDoor(compartment);
      return [[375, 600], [320, 240], [260, 500]].map(([width, height]) =>
        getFridgeFocusGeometry(draft, requests[0], { x: 0, y: 120, width, height }));
    });
    for (const [index, reference] of geometries[0].entries()) {
      const geometry = geometries[1][index];
      near(geometry.height, reference.height);
      near(geometry.body.width, reference.body.width);
      if (index === 0) near(geometry.body.width / geometry.height, 1 / 2);
      near(geometry.focusedTop, reference.focusedTop);
      near(geometry.focusedLeft + geometry.body.left, reference.focusedLeft + reference.body.left);
      near(geometry.body.fromWidth, 135);
      near(geometry.body.fromHeight, 270);
    }
  }
});

test('1단 도면의 축소 크기와 위치는 카테고리를 열고 닫아도 유지한다', () => {
  const { screen, viewport, target } = registrationFixture(1, 1);
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  find(screen.tree, named('FridgeInteriorMap')).props.onFocus(target);
  screen.render();
  const focus = () => find(screen.tree, named('FridgeFocusView'));
  focus().props.onPhaseChange('open');
  screen.render();
  const initial = getFridgeFocusGeometry(focus().props.draft, target, focus().props.viewport);
  assert(initial.fitRatio < 1);
  for (const category of ['mode', 'opening', 'slots', null]) {
    find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onCategoryChange(category);
    screen.render();
    viewport.props.onLayout({ nativeEvent: { layout: { width: 375, height: 520 } } });
    screen.render();
    const geometry = getFridgeFocusGeometry(focus().props.draft, target, focus().props.viewport);
    near(geometry.fitRatio, initial.fitRatio);
    near(geometry.body.width, initial.body.width);
    near(geometry.height, initial.height);
    near(geometry.translateY, initial.translateY);
  }
  screen.unmount();
});

test('모든 단의 연결 도면은 표시 영역에 맞춰 배치하고 원래 위치로 복귀한다', () => {
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
        near(geometry.top + geometry.translateY, geometry.focusedTop);
        near(geometry.height, geometry.source.height * geometry.fitRatio);
        assert(geometry.focusedTop >= 0);
        assert(geometry.focusedTop + geometry.contentHeight <= viewport.height + 1e-8);
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
    assert.equal(mergeButton.props.accessibilityState.expanded, undefined);
    assert.equal(find(toolbar.tree, node => node.props.accessibilityLabel?.endsWith('하위 설정')), undefined);
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
    toolbar.props = menu().props;
    toolbar.render();
    const splitButton = find(toolbar.tree, node => node.props.accessibilityLabel === '문별로 본체 분리');
    assert.equal(find(toolbar.tree, node => node.props.accessibilityLabel === '이웃 본체와 합치기'), undefined);
    assert.equal(splitButton.props.accessibilityState.expanded, undefined);
    splitButton.props.onPress();
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

test('칸 수와 관계없이 합치고 분리하며 초기화 안내와 툴바 높이를 유지한다', () => {
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
    menu().props.onCategoryChange('slots');
    screen.render();
    toolbar.props = menu().props;
    toolbar.render();
    const beforeLayout = flowLayout(toolbar.tree);
    for (let count = 1; count < model.MAX_SLOTS; count++) {
      find(toolbarTree(screen), node => node.props.accessibilityLabel?.endsWith('칸 늘리기')).props.onPress();
      screen.render();
    }
    assert.equal(menu().props.mergeDisabled, false);
    toolbar.props = menu().props;
    toolbar.render();
    assert.deepEqual(flowLayout(toolbar.tree), beforeLayout, '초기화 안내가 도면의 표시 영역을 바꾸면 안 된다');
    const merge = find(toolbar.tree, node => node.props.accessibilityLabel === '이웃 본체와 합치기');
    assert.equal(merge.props.disabled, false);
    assert.match(merge.props.accessibilityHint, /1칸, 분할 없음/);
    assert.equal(find(merge, node => node.type === 'Text' && node.props.children === '1칸 초기화'), undefined);
    find(screen.tree, named('FridgeFocusView')).props.onSelectSlot(row.compartments[selectedIndex].id, 3);
    screen.render();
    merge.props.onPress();
    screen.render();
    assert.deepEqual(menu().props.slots, [{ name: '위에서 1번째 칸', drawerCount: 0 }]);
    assert.equal(menu().props.selectedSlotIndex, 0);
    const split = find(toolbarTree(screen), node => node.props.accessibilityLabel === '문별로 본체 분리');
    assert.match(split.props.accessibilityHint, /1칸, 분할 없음/);
    assert.equal(find(split, node => node.type === 'Text' && node.props.children === '1칸 초기화'), undefined);
    split.props.onPress();
    screen.render();
    assert(find(screen.tree, named('FridgeFocusView')).props.draft.rows[0].compartments.every(body =>
      body.slots.length === 1 && body.slots[0].drawerCount === 0));
    toolbar.unmount();
    screen.unmount();
  }
});

test('툴바가 표시 영역을 줄여도 세로로 긴 도면의 높이가 오히려 커지지 않는다', () => {
  for (const side of ['LEFT_DOOR', 'RIGHT_DOOR']) {
    for (const drawerCount of [2, 0]) {
      const { screen, viewport, map, row, target } = registrationFixture(2, 1);
      row.doors[0].side = side;
      row.compartments[0].slots = Array.from({ length: 4 }, (_, index) => ({ name: model.getSlotName(index), drawerCount }));
      const measuredTarget = { ...target, canvas: { x: 52.5, y: 160, width: 270, height: 540 } };
      viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 600) };
      map.props.onFocus(measuredTarget);
      screen.render();
      const focus = () => find(screen.tree, named('FridgeFocusView'));
      const before = getFridgeFocusGeometry(focus().props.draft, measuredTarget, focus().props.viewport, focus().props.sizeViewport);
      // 툴바가 실제 레이아웃에 들어오면서 줄어든 높이를 전달한다.
      viewport.props.onLayout({ nativeEvent: { layout: { width: 375, height: 480 } } });
      screen.render();
      const after = getFridgeFocusGeometry(focus().props.draft, measuredTarget, focus().props.viewport, focus().props.sizeViewport);
      near(after.height, before.height);
      near(after.body.width, before.body.width);
      assert.equal(after.verticalScrollable, true);
      assert(after.focusedTop + after.scrollViewportHeight <= focus().props.viewport.height);
      focus().props.onPhaseChange('open');
      screen.render();
      for (const category of ['mode', 'slots', null]) {
        find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onCategoryChange(category);
        screen.render();
        viewport.props.onLayout({ nativeEvent: { layout: { width: 375, height: 480 } } });
        screen.render();
        const current = getFridgeFocusGeometry(focus().props.draft, measuredTarget, focus().props.viewport, focus().props.sizeViewport);
        near(current.height, after.height);
        near(current.body.width, after.body.width);
      }
      screen.unmount();
    }
  }
});

test('원본 비율을 유지해 확대하고 칸 수·좌우 분할 때문에 부족한 방향만 보정한다', () => {
  let draft = model.addDraftRow(model.addDraftRow(model.createRefrigeratorDraft()));
  const row = draft.rows[0];
  row.doors[0].slots = [{ name: '1칸', drawerCount: 0 }];
  const { compartment, requests } = fixture(draft);
  selectDoor(compartment);
  const viewport = { x: 0, y: 120, width: 375, height: 600 };
  const original = getFridgeFocusGeometry(draft, requests[0], viewport);
  near(original.body.width, 327);
  near(original.height, 163.5);
  near(original.body.width / original.height, original.source.width / original.source.height);
  row.compartments[0].slots = Array.from({ length: 4 }, (_, index) => ({ name: model.getSlotName(index), drawerCount: 0 }));
  const moreSlots = getFridgeFocusGeometry(draft, requests[0], viewport);
  near(moreSlots.body.width, original.body.width);
  near(moreSlots.height, 380);
  near(moreSlots.body.fromWidth, original.source.width);
  near(moreSlots.body.fromHeight, original.source.height);

  draft = model.createRefrigeratorDraft();
  draft = model.removeDraftRow(draft, draft.rows[1].id);
  draft = model.changeDraftDoorCount(draft, draft.rows[0].id, 1);
  const narrow = fixture(draft);
  selectDoor(narrow.compartment);
  const before = getFridgeFocusGeometry(draft, narrow.requests[0], viewport);
  near(before.body.width / before.height, 1 / 4);
  near(before.body.width, 138);
  near(before.height, 552);
  draft.rows[0].compartments[0].slots[0].drawerCount = 2;
  const divided = getFridgeFocusGeometry(draft, narrow.requests[0], viewport);
  near(divided.body.width, 188);
  near(divided.height, 536);
  assert(divided.body.width > divided.source.width * divided.fitRatio);
});

test('현재 조합과 더 많은 단·문·칸에서도 모든 편집 칸의 최소 크기와 복귀 좌표를 보장한다', () => {
  const template = model.createRefrigeratorDraft().rows[0];
  for (const rowCount of [1, 2, 3, 4, 6]) {
    for (const doorCount of [1, 2, 3]) {
      for (const merged of doorCount === 1 ? [false] : [false, true]) {
        for (const slotCount of [1, 3, 4, 8]) {
          for (const drawerCount of [0, 2]) {
            for (const opening of ['LEFT_DOOR', 'RIGHT_DOOR', 'DRAWER']) {
              if (merged && opening === 'DRAWER') continue;
              const slots = Array.from({ length: slotCount }, (_, index) => ({ name: model.getSlotName(index), drawerCount }));
              const draft = { name: '편집 크기 검증', nextId: 100, rows: Array.from({ length: rowCount }, (_, rowIndex) => {
                const doors = Array.from({ length: doorCount }, (_, index) => ({ ...template.doors[0], id: 'door-' + rowIndex + '-' + index,
                  kind: opening === 'DRAWER' ? 'DRAWER' : 'HINGED', side: merged ? index % 2 ? 'RIGHT_DOOR' : 'LEFT_DOOR'
                    : opening === 'DRAWER' ? 'LEFT_DOOR' : opening,
                  slots: Array.from({ length: Math.min(slotCount, 5) }, (_, i) => ({ name: model.getSlotName(i), drawerCount: 0 })),
                }));
                const bodies = merged ? [doors] : doors.map(door => [door]);
                return { id: 'row-' + rowIndex, doors, compartments: bodies.map((bodyDoors, index) => ({ ...template.compartments[0],
                  id: 'body-' + rowIndex + '-' + index, doorIds: bodyDoors.map(door => door.id), slots,
                })) };
              }) };
              const row = draft.rows.at(-1);
              const body = row.compartments.at(-1);
              const target = { areaId: body.id, returnAreaId: body.doorIds[0], canvas: { x: 24, y: -170, width: 270, height: 540 } };
              const bodyMinimum = mapModule.getFridgeAreaEditSize(slots, true);
              for (const [width, height] of [[375, 600], [320, 240], [160, 200], [768, 500]]) {
                const geometry = getFridgeFocusGeometry(draft, target, { x: 0, y: 110, width, height });
                const pocketMinimums = geometry.pockets.map(({ door }) => mapModule.getFridgeAreaEditSize(door.slots, false));
                const minimumWidth = Math.max(bodyMinimum.width, ...pocketMinimums.map(size => size.width * body.doorIds.length));
                const minimumHeight = Math.max(bodyMinimum.height, ...pocketMinimums.map(size => size.height));
                assert(geometry.body.width >= minimumWidth - 1e-8);
                assert(geometry.height >= minimumHeight - 1e-8);
                const availableBodyHeight = Math.max(1, height - 48 - (geometry.scrollable ? 16 : 0));
                assert(geometry.height <= Math.max(minimumHeight, availableBodyHeight) + 1e-8,
                  '표시 높이와 칸의 최소 높이보다 더 크게 세로 길이를 늘리면 안 된다');
                if (Math.abs(geometry.body.width / geometry.height - geometry.source.width / geometry.source.height) > 1e-8) {
                  assert(Math.abs(geometry.body.width - minimumWidth) < 1e-8 || Math.abs(geometry.height - minimumHeight) < 1e-8,
                    '편집 크기가 부족하지 않은 축까지 비율을 보정하면 안 된다');
                }
                for (const [index, pocket] of geometry.pockets.entries()) {
                  assert(pocket.frame.width >= pocketMinimums[index].width - 1e-8);
                  assert(pocket.frame.height >= pocketMinimums[index].height - 1e-8);
                }
                near(geometry.source.width, merged ? 270 : 270 / doorCount);
                near(geometry.source.height, 540 / rowCount);
                near(geometry.body.fromWidth, geometry.source.width);
                near(geometry.body.fromHeight, geometry.source.height);
                assert(geometry.focusedTop >= 0);
                assert(geometry.focusedTop + geometry.scrollViewportHeight <= height + 1e-8);
                assert.equal(geometry.verticalScrollable, geometry.contentHeight > Math.max(1, height - 48) + 0.01);
                assert.equal(geometry.scrollable, geometry.width > Math.max(1, width - 48) + 0.01);
                const left = geometry.focusedLeft + geometry.body.left;
                if (geometry.body.width <= width - 48) {
                  assert(left >= 24 - 1e-8);
                  assert(left + geometry.body.width <= width - 24 + 1e-8);
                }
              }
            }
          }
        }
      }
    }
  }
});

test('수납을 끈 포켓의 보관된 칸 수는 최소 편집 크기를 키우지 않는다', () => {
  const draft = model.createRefrigeratorDraft();
  const row = draft.rows[0];
  row.doors[0].slots = Array.from({ length: 8 }, (_, index) => ({ name: model.getSlotName(index), drawerCount: 0 }));
  const { compartment, requests } = fixture(draft);
  selectDoor(compartment);
  const viewport = { x: 0, y: 120, width: 375, height: 320 };
  const active = getFridgeFocusGeometry(draft, requests[0], viewport);
  row.doors[0].storageEnabled = false;
  const inactive = getFridgeFocusGeometry(draft, requests[0], viewport);
  assert(active.height > inactive.height);
  assert.equal(inactive.verticalScrollable, false);
  assert.equal(inactive.pockets.length, 1);
});

test('작은 화면에서도 실제 렌더링 여백·선반·분할선을 제외한 편집 칸은 72 이상이다', () => {
  const draft = model.addDraftRow(model.addDraftRow(model.createRefrigeratorDraft()));
  draft.rows[0].compartments[0].slots = Array.from({ length: 4 }, (_, index) => ({ name: model.getSlotName(index), drawerCount: 2 }));
  const { compartment, requests } = fixture(draft);
  selectDoor(compartment);
  const viewport = { x: 0, y: 120, width: 160, height: 240 };
  const geometry = getFridgeFocusGeometry(draft, requests[0], viewport);
  const { focus } = focusedFixture(draft, requests[0], viewport);
  for (const area of interiorAreas(focus)) {
    const map = find(area.type(area.props), node => node.type === mapModule.FridgeMap);
    const tree = mapModule.FridgeMap(map.props);
    const frame = find(tree, node => children(node).includes(map.props.areaHeader));
    const frameStyle = flattenStyle(frame.props.style);
    const content = children(frame).at(-1);
    const contentStyle = flattenStyle(content.props.style);
    const slots = children(content);
    const headerStyle = flattenStyle(map.props.areaHeader.props.style);
    const shelfSpace = slots.reduce((sum, slot) => sum + (flattenStyle(slot.props.style).marginTop ?? 0), 0);
    const cellHeight = (geometry.height - frameStyle.borderWidth * 2 - headerStyle.minHeight - contentStyle.marginBottom
      - (contentStyle.paddingTop ?? 0) - (contentStyle.paddingBottom ?? 0) - shelfSpace) / slots.length;
    assert(cellHeight >= 72 - 1e-8);
    const areaWidth = area.props.area.isBody ? geometry.body.width : geometry.pockets.find(pocket => pocket.door.id === area.props.area.id).frame.width;
    for (const slot of slots) {
      const row = children(slot).find(node => flattenStyle(node.props.style).flexDirection === 'row');
      const positions = children(row);
      const divider = positions.reduce((sum, node) => {
        const style = flattenStyle(node.props.style);
        return sum + (style.borderLeftWidth ?? 0) + (style.marginLeft ?? 0);
      }, 0);
      const cellWidth = (areaWidth - frameStyle.borderWidth * 2 - contentStyle.marginHorizontal * 2
        - contentStyle.paddingHorizontal * 2 - divider) / positions.length;
      assert(cellWidth >= 72 - 1e-8);
    }
  }
  focus.unmount();
});

for (const opening of ['LEFT_DOOR', 'DRAWER']) {
  test(opening + '의 최소 편집 크기가 넘치면 내부만 스크롤하고 이동한 위치에서 원래 도면으로 닫는다', () => {
    let draft = model.createRefrigeratorDraft();
    draft = model.removeDraftRow(draft, draft.rows[1].id);
    const row = draft.rows[0];
    draft = model.setDraftDoorOpening(draft, row.id, row.doors[0].id, opening);
    draft.rows[0].compartments[0].slots = Array.from({ length: 4 }, (_, index) => ({ name: model.getSlotName(index), drawerCount: 2 }));
    const { compartment, requests } = fixture(draft);
    selectDoor(compartment);
    const viewport = { x: 0, y: 120, width: opening === 'DRAWER' ? 375 : 160, height: 240 };
    const geometry = getFridgeFocusGeometry(draft, requests[0], viewport);
    const { focus } = focusedFixture(draft, requests[0], viewport);
    const selected = [];
    focus.props = { ...focus.props, selectedSlotIndex: 0, onSelectSlot: (id, index, positionId) => selected.push({ id, index, positionId }) };
    focus.render();
    assertFocusAccess(focus, 'opening');
    animations.at(-1).finish();
    focus.render();
    assertFocusAccess(focus, 'open');
    const vertical = find(focus.tree, node => node.type === 'ScrollView' && node.props.horizontal === false);
    const horizontal = find(focus.tree, node => node.type === 'ScrollView' && node.props.horizontal);
    assert(vertical);
    assert.equal(Boolean(horizontal), opening !== 'DRAWER');
    const frame = flattenStyle(vertical.props.style);
    assert(frame.top + frame.height <= viewport.height);
    assert(children(vertical)[0].props.style.height > frame.height);
    const resets = [];
    vertical.props.ref.current = { scrollTo: args => resets.push(args) };
    if (horizontal) horizontal.props.ref.current = { scrollTo: args => resets.push(args) };
    const x = horizontal ? Math.max(0, geometry.initialScrollX - 20) : 0;
    const y = geometry.contentHeight - geometry.scrollViewportHeight;
    const visibleLeft = horizontal ? geometry.scrollPaddingLeft + geometry.body.left - x : geometry.focusedLeft;
    assert(visibleLeft < viewport.width && visibleLeft + geometry.body.width > 0);
    assert(geometry.height - y <= frame.height);
    assert(geometry.height - y >= 72);
    horizontal?.props.onScroll({ nativeEvent: { contentOffset: { x, y: 0 } } });
    vertical.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y } } });
    focus.render();
    const area = interiorAreas(focus).find(node => node.props.area.isBody);
    const map = find(area.type(area.props), node => node.type === mapModule.FridgeMap);
    const slots = findAll(mapModule.FridgeMap(map.props), node => node.type === 'Pressable' && node.props.accessibilityLabel?.includes('위에서 4번째 칸'));
    assert.equal(slots.length, 2);
    slots[1].props.onPress({ stopPropagation() {} });
    assert.deepEqual(selected, [{ id: row.compartments[0].id, index: 3, positionId: map.props.positions.at(-1).id }]);
    assert.equal(resets.length, 0);
    focus.props.onClose();
    focus.render();
    assertFocusAccess(focus, 'closing');
    const style = flattenStyle(moving(focus).props.style);
    near(style.left + dimensionAt(style.transform[0].translateX, 1), horizontal ? geometry.scrollPaddingLeft - x : geometry.focusedLeft);
    near(style.top + dimensionAt(style.transform[1].translateY, 1), geometry.focusedTop - y);
    near(style.top + dimensionAt(style.transform[1].translateY, 0), geometry.top);
    animations.at(-1).finish();
    focus.render();
    assertFocusAccess(focus, 'closed');
    focus.unmount();
  });
}

test('가로로 긴 단은 본체 너비까지 확대하고 왼쪽 열림은 오른쪽 끝에, 오른쪽 열림은 왼쪽 끝에 둔다', () => {
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
      near(geometry.body.width, viewportWidth - 48);
      near(geometry.height, 380);
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
  focus.props = { ...focus.props, viewport: { ...focus.props.viewport, width: 1400 } };
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
  const { focus } = focusedFixture(draft, requests[0], { x: 0, y: 120, width: 375, height: 320 });
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
  menu().props.onCategoryChange('opening');
  screen.render();
  assert.equal(focus().props.scrollHintBlocked, true);
  menu().props.onCategoryChange(null);
  menu().props.onCategoryChange('slots');
  screen.render();
  assert.equal(focus().props.scrollHintBlocked, true);
  menu().props.onCategoryChange(null);
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
  const outside = find(children(focus.tree)[0], node => node.type === 'Pressable');
  assert.equal(outside.props.accessibilityRole, 'button');
  assert.equal(children(outside).length, 0);
  map.props = { ...map.props, focus: requests[0] };
  map.render();
  assert(children(children(map.tree)[0]).every(node => named('FridgeCompartment')(node) || node.props.pointerEvents === 'none'));
  assert.equal(flattenStyle(compartment.tree.props.style).opacity, 0);
  focus.unmount();
});

test('문 뒷면은 앞면과 반대로 회전하고 포켓 내부는 열고 닫는 동안 유지한다', () => {
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
    assert.equal(flattenStyle(content.props.style).opacity ?? 1, 1);
    for (const phase of ['opening', 'open', 'closing']) {
      const pocketBack = children(door.type({ ...door.props, phase }))[1];
      const pocketContent = find(pocketBack, node => children(node).some(named('InteriorArea')));
      assert.equal(flattenStyle(pocketContent.props.style).opacity ?? 1, 1);
      assert.equal(pocketContent.props.pointerEvents, phase === 'open' ? 'auto' : 'none');
      assert.equal(pocketContent.props.accessibilityElementsHidden, phase !== 'open');
      assert.equal(pocketContent.props.importantForAccessibility, phase === 'open' ? 'auto' : 'no-hide-descendants');
      assert.strictEqual(children(pocketContent)[0], children(content)[0]);
    }
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

test('도면 화면은 고정하고 기본 정보만 세로 스크롤을 허용하며 별도 설정 모달은 없다', () => {
  const screen = mount(RefrigeratorRegistrationScreen, { navigation: { goBack() {}, dispatch() {} } });
  const pageScrolls = () => findAll(screen.tree, node => node.type === 'ScrollView' && node.props.ref);
  assert.deepEqual(pageScrolls().map(node => node.props.scrollEnabled), [true, false]);
  find(screen.tree, node => node.props.accessibilityLabel === '내부 설정으로 이동').props.onPress();
  animations.at(-1).finish();
  screen.render();
  assert.deepEqual(pageScrolls().map(node => node.props.scrollEnabled), [false, false]);
  const configuration = pageScrolls()[1];
  assert.equal(configuration.props.bounces, false);
  assert.equal(configuration.props.overScrollMode, 'never');
  assert.equal(configuration.props.showsVerticalScrollIndicator, false);
  assert.equal(flattenStyle(configuration.props.contentContainerStyle).height, '100%');
  assert.equal(find(screen.tree, named('FridgeInteriorMap')).props.fitHeight, true);
  assert.equal(find(screen.tree, node => node.type === 'Modal'), undefined);
  screen.unmount();
});

test('1단·여러 단 모두 비율을 유지한 중앙 보기를 제목 영역에서도 닫을 수 있고 전환 중에는 닫지 않는다', () => {
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
    near(geometry.body.width, geometry.source.width * geometry.fitRatio);
    near(geometry.body.height, geometry.source.height * geometry.fitRatio);
    find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onCategoryChange('opening');
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

test('기본정보 도면은 단 개수·화면 너비가 바뀌어도 독립된 세로 비율과 단별 조절 위치를 유지한다', () => {
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
      near(frame.width / height, structureModule.STRUCTURE_PREVIEW_ASPECT_RATIO);
      assert.equal(frame.aspectRatio, structureModule.STRUCTURE_PREVIEW_ASPECT_RATIO);
      const controls = children(editor).at(-1);
      assert.equal(children(controls).length, rowCount);
      const reservedWidth = children(editor).filter(child => child !== preview)
        .reduce((sum, child) => sum + flattenStyle(child.props.style).width, 0);
      const gapWidth = flattenStyle(editor.props.style).gap * (children(editor).length - 1);
      assert(frame.width + reservedWidth + gapWidth <= availableWidth - tokens.spacing.lg * 2);
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
      near(geometry.body.fromHeight, height / rowCount);
      near(geometry.body.width, Math.min(327, geometry.source.width * geometry.fitRatio));
      assert(geometry.height >= Math.min(200, geometry.source.height));
      if (rowCount <= 2) near(geometry.body.width / geometry.body.height, geometry.source.width / geometry.source.height);
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
    assert.equal(focus.props.viewport.height, 520 - FRIDGE_MENU_RESERVED_SPACE);
    assert.equal(focus.props.overlayHeight, 600);
    const overlay = mount(FridgeFocusView, focus.props);
    const overlayStyle = flattenStyle(overlay.tree.props.style);
    assert.equal(overlayStyle.height, 600);
    assert.equal(overlayStyle.bottom, undefined);
    const backdropStyle = flattenStyle(children(overlay.tree)[0].props.style);
    assert.equal(backdropStyle.top, 0);
    assert.equal(backdropStyle.bottom, 0);
    const centered = flattenStyle(moving(overlay).props.style);
    near(centered.top + centered.height / 2, (520 - FRIDGE_MENU_RESERVED_SPACE) / 2);
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
      assert.equal(menu.props.activeCategory, expanded ? 'opening' : null);
      assert.deepEqual(flowChildren(menu.tree).map(node => flattenStyle(node.props.style)), beforeFlow);
      assert.equal(flowChildren(menu.tree).length, 1);
      const panel = find(menu.tree, node => node.props.accessibilityLabel === '여는 방식 하위 설정');
      if (expanded) {
        const style = flattenStyle(panel.props.style);
        assert.notEqual(style.position, 'absolute');
        assert.equal(style.height, '100%');
        assert.equal(flattenStyle(children(menu.tree)[0].props.style).height, 82);
        assert.equal(flattenStyle(children(menu.tree)[0].props.style).position, 'absolute');
      } else assert.equal(panel, undefined);
      focus = find(screen.tree, named('FridgeFocusView'));
      assert.strictEqual(focus.props.viewport, beforeBounds);
      assert.equal(focus.props.overlayHeight, 600);
      near(getFridgeFocusGeometry(focus.props.draft, target, focus.props.viewport).translateY, before.translateY);
    }
    const toolbar = find(screen.tree, node => children(node).some(child => child.type === 'FridgeAreaMenu'));
    assert(flattenStyle(toolbar.props.style).zIndex > (flattenStyle(viewport.props.style).zIndex ?? 0));
    find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onCategoryChange('slots');
    screen.render();
    assert(find(toolbarTree(screen), node => node.props.accessibilityLabel === '칸 구성 하위 설정'));
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

test('하위 메뉴를 열고 닫은 뒤 레이아웃이 다시 측정되어도 도면 좌표와 툴바 배치 높이는 유지한다', () => {
  const { screen, viewport, target, row } = registrationFixture(2);
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 600) };
  find(screen.tree, named('FridgeInteriorMap')).props.onFocus(target);
  screen.render();
  viewport.props.onLayout({ nativeEvent: { layout: { width: 375, height: 520 } } });
  screen.render();
  const focus = () => find(screen.tree, named('FridgeFocusView'));
  const menu = () => find(screen.tree, node => node.type === 'FridgeAreaMenu').props;
  focus().props.onPhaseChange('open');
  screen.render();
  const bounds = focus().props.viewport;
  const geometry = getFridgeFocusGeometry(focus().props.draft, target, bounds);
  assert.equal(bounds.height, 520 - FRIDGE_MENU_RESERVED_SPACE);
  for (const category of ['mode', 'opening', 'slots', null, 'slots', null]) {
    menu().onCategoryChange(category);
    screen.render();
    viewport.props.onLayout({ nativeEvent: { layout: { width: 375, height: 520 } } });
    screen.render();
    assert.strictEqual(focus().props.viewport, bounds);
    const next = getFridgeFocusGeometry(focus().props.draft, target, focus().props.viewport);
    near(next.translateY, geometry.translateY);
    near(next.translateX, geometry.translateX);
    const tree = toolbarTree(screen);
    const normalFlow = children(tree).filter(child => flattenStyle(child.props.style).position !== 'absolute');
    assert.equal(normalFlow.length, 1, '하위 메뉴가 툴바 높이에 더해지면 안 된다');
    assert.equal(find(tree, node => node.props.accessibilityLabel?.endsWith('하위 설정')) !== undefined, category !== null);
  }
  focus().props.onSelectArea(row.doors[0].id);
  screen.render();
  find(toolbarTree(screen), node => node.type === 'Switch').props.onValueChange(false);
  screen.render();
  viewport.props.onLayout({ nativeEvent: { layout: { width: 375, height: 520 } } });
  screen.render();
  assert.strictEqual(focus().props.viewport, bounds);
  viewport.props.onLayout({ nativeEvent: { layout: { width: 414, height: 620 } } });
  screen.render();
  assert.equal(focus().props.viewport.width, 414);
  assert.equal(focus().props.viewport.height, 620 - FRIDGE_MENU_RESERVED_SPACE);
  screen.unmount();
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
  assert.equal(counts.length, 1);
  assert.equal(counts[0].props.children, 1);
  const position = find(withIngredients, node => node.type === 'FeedbackPressable' && node.key === layout.positions[1].id);
  assert.match(position.props.accessibilityLabel, /재료 1건$/);
});

test('재료 배지는 좌우·포켓을 구분하고 빈 칸·편집에서는 숨기며 100건부터 99+로 표시한다', () => {
  const draft = savedRefrigerator('배지 표시 냉장고');
  draft.rows[0].compartments[0].slots[0].drawerCount = 2;
  const layout = model.getDraftLayout(draft);
  const [left, right, pocket] = layout.positions;
  const ingredients = [left, ...Array.from({ length: 100 }, () => right), pocket]
    .map((position, index) => ({ id: `item-${index}`, positionId: position.id }));
  for (const storageMode of ['CHILLED', 'FROZEN']) {
    const props = { ...layout, ingredients, storageMode, showAreaLabels: false, onSelectSlot() {} };
    const tree = mapModule.FridgeMap(props);
    assert.deepEqual(findAll(tree, node => node.type === 'Text').map(node => node.props.children), [1, '99+', 1]);
    const leftButton = find(tree, node => node.type === 'Pressable' && node.key === left.id);
    const rightButton = find(tree, node => node.type === 'Pressable' && node.key === right.id);
    assert.match(leftButton.props.accessibilityLabel, /재료 1건$/);
    assert.match(rightButton.props.accessibilityLabel, /재료 100건$/);
    const bin = find(tree, named('DoorPocketBin'));
    const renderedBin = bin.type(bin.props);
    const front = children(renderedBin)[0];
    assert.equal(renderedBin.props.pointerEvents, 'box-none');
    assert.equal(front.type, 'Pressable');
    const badge = children(front)[0];
    assert.equal(badge.props.pointerEvents, 'none');
    assert.equal(badge.props.accessibilityElementsHidden, true);
    assert.match(front.props.accessibilityLabel, /재료 1건$/);
    for (const hidden of [{ ...props, showIngredientCounts: false }, { ...props, ingredients: [] }]) {
      const hiddenTree = mapModule.FridgeMap(hidden);
      assert.equal(findAll(hiddenTree, node => node.type === 'Text').length, 0);
    }
  }
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
    find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onCategoryChange('slots');
    screen.render();
    const panel = () => toolbarTree(screen);
    assert.equal(findAll(panel(), node => node.type === 'FormTextInput').length, 0);
    assert.equal(find(panel(), named('FridgeMap')), undefined);
    const increase = find(panel(), node => node.props.accessibilityLabel?.endsWith('칸 늘리기'));
    increase.props.onPress();
    screen.render();
    if (isBody) {
      focus().props.onSelectSlot(areaId, 1);
      screen.render();
      const selector = find(panel(), node => node.type === 'SlotStructureSelector');
      assert.equal(selector.props.accessibilityLabel, '1단 본체 위에서 2번째 칸');
      selector.props.onChange(2);
      screen.render();
      const draft = find(screen.tree, named('FridgeInteriorMap')).props.draft;
      assert.deepEqual(draft.rows[0].compartments[0].slots, [
        { name: '위에서 1번째 칸', drawerCount: 0 }, { name: '위에서 2번째 칸', drawerCount: 2 },
      ]);
      assert(find(panel(), node => node.type === 'ScrollView'));
      assert.equal(find(panel(), node => node.type === 'Modal'), undefined);
    } else {
      assert.equal(findAll(panel(), node => node.type === 'SlotStructureSelector').length, 0);
      assert.equal(find(panel(), node => node.type === 'Text' && node.props.accessibilityRole === 'header'
        && typeof node.props.children === 'string' && node.props.children.includes('번째 칸')), undefined);
      assert.notEqual(flattenStyle(find(panel(), node => node.props.accessibilityLabel === '칸 구성 하위 설정').props.style).position, 'absolute');
    }
  }
  screen.unmount();
});

test('카테고리를 다시 누르면 접고 하위 영역에 툴바 배경을 적용하며 여백 안에 삼각형 화살표를 표시한다', () => {
  const { screen, viewport, target, row } = registrationFixture(2);
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  find(screen.tree, named('FridgeInteriorMap')).props.onFocus(target);
  screen.render();
  find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('open');
  screen.render();
  const categories = () => findAll(toolbarTree(screen), node => node.props.accessibilityHint?.includes('하위 설정'));
  assert.deepEqual(categories().map(node => node.props.accessibilityLabel), ['보관 모드', '여는 방식', '칸 구성']);
  assert.equal(find(toolbarTree(screen), node => node.props.accessibilityLabel === '본체 연결'), undefined);
  assert(find(toolbarTree(screen), node => node.props.accessibilityLabel === '이웃 본체와 합치기'));
  for (const label of ['여는 방식', '보관 모드', '칸 구성']) {
    categories().find(node => node.props.accessibilityLabel === label).props.onPress();
    screen.render();
    const tree = toolbarTree(screen);
    const panel = find(tree, node => node.props.accessibilityLabel === `${label} 하위 설정`);
    const parent = categories().find(node => node.props.accessibilityLabel === label);
    const arrow = find(parent, node => flattenStyle(node.props.style).borderTopWidth === 6);
    assert.equal(parent.props.accessibilityState.expanded, true);
    assert.equal(categories().filter(node => node.props.accessibilityState.expanded).length, 1);
    assert.notEqual(flattenStyle(panel.props.style).position, 'absolute');
    const reservedStyle = flattenStyle(children(tree)[0].props.style);
    assert.equal(reservedStyle.height, 82);
    const panelStyle = flattenStyle(panel.props.style);
    const arrowStyle = flattenStyle(arrow.props.style);
    assert.equal(panelStyle.backgroundColor, flattenStyle(tree.props.style).backgroundColor);
    assert(reservedStyle.marginBottom > 0);
    assert.equal(arrowStyle.width, 0);
    assert.equal(arrowStyle.height, 0);
    assert.equal(arrowStyle.borderLeftColor, 'transparent');
    assert.equal(arrowStyle.borderRightColor, 'transparent');
    assert.equal(arrowStyle.borderTopColor, '#000000');
    assert.equal(arrowStyle.bottom, '100%');
    const parentStyle = flattenStyle(parent.props.style);
    assert(arrowStyle.marginBottom - parentStyle.borderWidth >= 10);
    const toolbarStyle = flattenStyle(tree.props.style);
    assert.equal(toolbarStyle.paddingVertical + reservedStyle.marginBottom - arrowStyle.marginBottom - arrowStyle.borderTopWidth, 6);
    if (label === '보관 모드') {
      assert.equal(find(parent, node => node.type === 'Icon').props.name, 'thermometer-low');
      const chilled = find(tree, node => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel.endsWith('냉장'));
      assert.equal(find(chilled, node => node.type === 'Icon').props.name, 'weather-windy');
    }
    assert.equal(find(tree, node => node.props.accessibilityRole === 'header'), undefined);
    const horizontalRows = findAll(panel, node => node.type === 'ScrollView' && node.props.horizontal);
    assert(horizontalRows.length > 0);
    for (const scroll of horizontalRows) {
      assert.equal(scroll.props.nestedScrollEnabled, true);
      assert.equal(flattenStyle(scroll.props.contentContainerStyle).alignItems, 'flex-start');
      assert(flattenStyle(scroll.props.contentContainerStyle).paddingBottom >= 16);
      for (const button of findAll(scroll, node => node.type === 'FeedbackPressable')) {
        assert.equal(flattenStyle(button.props.style).flexShrink, 0);
        for (const text of findAll(button, node => node.type === 'Text')) {
          assert.equal(text.props.numberOfLines, 1);
          assert.equal(flattenStyle(text.props.style).flexShrink, 0);
        }
      }
    }
    if (label === '칸 구성') {
      const selector = find(panel, node => node.type === 'SlotStructureSelector');
      assert.equal(selector.props.inline, true);
      assert.equal(find(panel, node => node.props.accessibilityLabel === '분할할 칸 선택'), undefined);
      assert.equal(horizontalRows.length, 1);
      assert(children(horizontalRows[0]).includes(selector));
      const { SlotStructureSelector } = loadComponent('src/features/fridge/components/SlotStructureSelector.tsx');
      const split = SlotStructureSelector(selector.props);
      assert.equal(find(split, node => node.type === 'ScrollView'), undefined);
      assert.equal(find(split, node => node.type === 'Text' && node.props.children === selector.props.label), undefined);
      assert(find(SlotStructureSelector({ ...selector.props, inline: false }), node => node.type === 'Text' && node.props.children === selector.props.label));
    }
    parent.props.onPress();
    screen.render();
    assert.equal(find(toolbarTree(screen), node => node.props.accessibilityLabel?.endsWith('하위 설정')), undefined);
    assert.equal(children(toolbarTree(screen)).length, 1);
    assert.equal(flattenStyle(children(toolbarTree(screen))[0].props.style).height, undefined);
  }
  categories().find(node => node.props.accessibilityLabel === '여는 방식').props.onPress();
  screen.render();
  categories().find(node => node.props.accessibilityLabel === '보관 모드').props.onPress();
  screen.render();
  assert.equal(find(toolbarTree(screen), node => node.props.accessibilityLabel === '여는 방식 하위 설정'), undefined);
  assert(find(toolbarTree(screen), node => node.props.accessibilityLabel === '보관 모드 하위 설정'));
  const blocked = FridgeAreaMenu({ ...find(screen.tree, node => node.type === 'FridgeAreaMenu').props, disabled: true });
  assert.equal(find(blocked, node => node.props.accessibilityLabel?.endsWith('하위 설정')), undefined);
  assert(findAll(blocked, node => node.props.accessibilityHint?.includes('하위 설정')).every(node => node.props.disabled));
  find(screen.tree, named('FridgeFocusView')).props.onSelectArea(row.doors[0].id);
  screen.render();
  assert.deepEqual(categories().map(node => node.props.accessibilityLabel), ['칸 구성']);
  const storageSwitch = () => find(toolbarTree(screen), node => node.type === 'Switch');
  assert.equal(storageSwitch().props.value, true);
  assert.equal(storageSwitch().props.accessibilityLabel, '문 수납 사용');
  const disabledSwitch = find(FridgeAreaMenu({ ...find(screen.tree, node => node.type === 'FridgeAreaMenu').props, disabled: true }),
    node => node.type === 'Switch');
  assert.equal(disabledSwitch.props.disabled, true);
  storageSwitch().props.onValueChange(false);
  screen.render();
  assert.equal(storageSwitch().props.value, false);
  assert.equal(find(toolbarTree(screen), node => node.props.accessibilityLabel === '문 수납 하위 설정'), undefined);
  assert.equal(categories().find(node => node.props.accessibilityLabel === '칸 구성').props.disabled, true);
  storageSwitch().props.onValueChange(true);
  screen.render();
  assert.equal(storageSwitch().props.value, true);
  assert.equal(categories().find(node => node.props.accessibilityLabel === '칸 구성').props.disabled, false);
  assert.equal(find(screen.tree, named('FridgeInteriorMap')).props.draft.rows[0].doors[0].slots.length, 2);
  screen.unmount();
});

test('칸 구성에서 도면의 칸 선택·분할 편집을 연동하고 칸 삭제 후에도 유효한 칸을 선택한다', () => {
  const { screen, viewport, target } = registrationFixture();
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  find(screen.tree, named('FridgeInteriorMap')).props.onFocus(target);
  screen.render();
  const focus = () => find(screen.tree, named('FridgeFocusView'));
  const menu = () => find(screen.tree, node => node.type === 'FridgeAreaMenu').props;
  focus().props.onPhaseChange('open');
  screen.render();
  menu().onCategoryChange('slots');
  screen.render();
  find(toolbarTree(screen), node => node.props.accessibilityLabel?.endsWith('칸 늘리기')).props.onPress();
  screen.render();
  const overlay = mount(FridgeFocusView, focus().props);
  const renderMap = () => {
    overlay.props = focus().props;
    overlay.render();
    const body = interiorAreas(overlay).find(node => node.props.area.isBody);
    const map = find(body.type(body.props), node => node.type === mapModule.FridgeMap);
    return mapModule.FridgeMap(map.props);
  };
  const tree = renderMap();
  const slotButtons = findAll(tree, node => node.type === 'Pressable' && node.props.accessibilityLabel?.includes('번째 칸'));
  assert.equal(slotButtons.length, 2);
  assert.equal(slotButtons[0].props.accessibilityState.selected, true);
  let stopped = false;
  slotButtons[1].props.onPress({ stopPropagation() { stopped = true; } });
  screen.render();
  assert.equal(stopped, true);
  assert.equal(focus().props.selectedSlotIndex, 1);
  const selectedTree = renderMap();
  const selectedSlot = find(selectedTree, node => node.type === 'Pressable'
    && node.props.accessibilityLabel?.includes('번째 칸') && node.props.accessibilityState.selected);
  assert.equal(flattenStyle(selectedSlot.props.style).backgroundColor, 'transparent');
  const highlight = find(selectedSlot, node => node.props.pointerEvents === 'none' && flattenStyle(node.props.style).overflow === 'hidden');
  const shelf = find(selectedTree, node => flattenStyle(node.props.style).height === 4);
  const highlightStyle = flattenStyle(highlight.props.style);
  const shelfStyle = flattenStyle(shelf.props.style);
  assert(highlightStyle.top >= shelfStyle.top + shelfStyle.height);
  assert(highlightStyle.left >= shelfStyle.left);
  assert(highlightStyle.right >= shelfStyle.right);
  const selector = find(toolbarTree(screen), node => node.type === 'SlotStructureSelector');
  assert.equal(selector.props.accessibilityLabel, '1단 본체 위에서 2번째 칸');
  selector.props.onChange(2);
  screen.render();
  assert.equal(menu().slots[1].drawerCount, 2);
  const halves = findAll(renderMap(), node => node.type === 'Pressable' && node.props.accessibilityLabel?.includes('위에서 2번째 칸'));
  assert.equal(halves.length, 2);
  for (const half of halves) {
    half.props.onPress({ stopPropagation() {} });
    screen.render();
    assert.equal(focus().props.selectedPositionId, half.key);
    const selected = findAll(renderMap(), node => node.type === 'Pressable'
      && node.props.accessibilityLabel?.includes('번째 칸') && node.props.accessibilityState?.selected);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].key, half.key);
    assert(find(selected[0], node => node.props.pointerEvents === 'none' && flattenStyle(node.props.style).backgroundColor === tokens.fridgeDoorColors.CHILLED.selection));
  }
  menu().onSlotStructureChange(0);
  screen.render();
  assert.equal(focus().props.selectedPositionId, undefined);
  menu().onSlotStructureChange(2);
  screen.render();
  const firstHalf = find(renderMap(), node => node.type === 'Pressable'
    && node.props.accessibilityLabel?.includes('번째 칸') && node.props.accessibilityState?.selected);
  assert.match(firstHalf.props.accessibilityLabel, /왼쪽/);
  find(toolbarTree(screen), node => node.props.accessibilityLabel?.endsWith('칸 줄이기')).props.onPress();
  screen.render();
  assert.equal(focus().props.selectedSlotIndex, 0);
  assert.equal(focus().props.selectedPositionId, undefined);
  menu().onCategoryChange(null);
  screen.render();
  assert.equal(focus().props.selectedSlotIndex, undefined);
  overlay.props = { ...focus().props, phase: 'closing', selectedSlotIndex: 0 };
  overlay.render();
  const closingBody = interiorAreas(overlay).find(node => node.props.area.isBody);
  assert.equal(find(closingBody.type(closingBody.props), node => node.type === mapModule.FridgeMap).props.onSelectSlot, undefined);
  overlay.unmount();
  screen.unmount();
});

test('본체 1~4칸은 바깥·선반 여백을 균등하게 유지하고 좌우 위치를 개별 선택한다', () => {
  for (const mode of ['CHILLED', 'FROZEN', null]) {
    const palette = mode ? tokens.fridgeDoorColors[mode] : tokens.fridgeSurfaces;
    const foreground = mode ? palette.ink : palette.handle;
    const composite = '#' + [1, 3, 5].map(offset => Math.round(
      parseInt(foreground.slice(offset, offset + 2), 16) * 0.2
      + parseInt(palette.frame.slice(offset, offset + 2), 16) * 0.8,
    ).toString(16).padStart(2, '0')).join('').toUpperCase();
    for (let count = 1; count <= 4; count++) {
      for (const split of [false, true]) {
        const draft = model.createRefrigeratorDraft();
        const body = draft.rows[0].compartments[0];
        body.slots = Array.from({ length: count }, (_, index) => ({ name: model.getSlotName(index), drawerCount: split ? 2 : 0 }));
        const layout = model.getDraftLayout(draft);
        const props = { ...layout, areas: layout.areas.filter(area => area.id === body.id),
          storageMode: mode, fitHeight: true, showIngredientCounts: false, onSelectArea() {}, onSelectSlot() {} };
        const bodyPositions = layout.positions.filter(position => position.areaId === body.id);
        let firstHighlight;
        for (const [selectionIndex, selectedPosition] of bodyPositions.entries()) {
          const selectedSlotIndex = Math.floor(selectionIndex / (split ? 2 : 1));
          const tree = mapModule.FridgeMap({ ...props, selectedSlotIndex, selectedPositionId: selectedPosition.id });
          const content = find(tree, node => flattenStyle(node.props.style).backgroundColor === palette.frame);
          const slots = children(content);
          assert.equal(slots.length, count);
          const contentStyle = flattenStyle(content.props.style);
          assert.equal(contentStyle.paddingTop, 6);
          assert.equal(contentStyle.paddingTop, contentStyle.paddingBottom);
          assert.equal(contentStyle.paddingHorizontal, contentStyle.paddingTop);
          slots.forEach((slot, index) => {
            const style = flattenStyle(slot.props.style);
            assert.equal(style.flex, 1);
            assert.equal(style.borderTopWidth ?? 0, 0);
            const shelf = find(slot, node => flattenStyle(node.props.style).height === 4);
            if (index === 0) {
              assert.equal(shelf, undefined);
              assert.equal(style.marginTop ?? 0, 0);
            } else {
              const shelfStyle = flattenStyle(shelf.props.style);
              assert.equal(shelfStyle.boxShadow, undefined);
              assert.equal(shelfStyle.borderRadius, 0);
              assert.equal(style.marginTop, 12);
              assert.equal(style.marginTop, contentStyle.paddingTop + contentStyle.paddingBottom);
              assert.equal(style.marginTop + shelfStyle.top + shelfStyle.height / 2, contentStyle.paddingTop);
              assert.equal(-shelfStyle.top - shelfStyle.height / 2, contentStyle.paddingBottom);
              assert.equal(shelfStyle.left, 0);
              assert.equal(shelfStyle.right, 0);
            }
            const row = children(slot).find(node => flattenStyle(node.props.style).flexDirection === 'row');
            const positions = children(row);
            assert.equal(positions.length, split ? 2 : 1);
            assert.equal(findAll(slot, node => node.props.pointerEvents === 'none'
              && flattenStyle(node.props.style).overflow === 'hidden').length, index === selectedSlotIndex ? 1 : 0);
            assert.equal(children(slot).some(node => flattenStyle(node.props.style).backgroundColor === palette.selection), false);
            positions.forEach((position, positionIndex) => {
              const selected = position.key === selectedPosition.id;
              assert.equal(position.type, 'Pressable');
              assert.equal(position.props.accessibilityState.selected, selected);
              const positionStyle = flattenStyle(position.props.style);
              assert.equal(positionStyle.flex, 1);
              assert.equal(positionStyle.minHeight, 0);
              assert.equal(positionStyle.borderLeftWidth ?? 0, 0);
              if (positionIndex > 0) {
                assert.equal(positionStyle.marginLeft, 12);
                const divider = find(position, node => flattenStyle(node.props.style).width === 4);
                const dividerStyle = flattenStyle(divider.props.style);
                assert.equal(dividerStyle.top, 0);
                assert.equal(dividerStyle.bottom, 0);
                assert.equal(positionStyle.marginLeft, contentStyle.paddingHorizontal * 2);
                assert.equal(dividerStyle.left + positionStyle.marginLeft + dividerStyle.width / 2, contentStyle.paddingHorizontal);
                assert.equal(-dividerStyle.left - dividerStyle.width / 2, contentStyle.paddingHorizontal);
              }
              const highlight = find(position, node => node.props.pointerEvents === 'none'
                && flattenStyle(node.props.style).overflow === 'hidden');
              if (!selected) {
                assert.equal(highlight, undefined);
                return;
              }
              const highlightStyle = flattenStyle(highlight.props.style);
              for (const edge of ['top', 'bottom', 'left', 'right']) assert.equal(highlightStyle[edge], 0);
              assert.equal(highlightStyle.borderRadius, 6);
              assert.equal(contentStyle.borderRadius - highlightStyle.borderRadius, contentStyle.paddingTop);
              assert.equal(highlightStyle.backgroundColor, composite);
              assert.equal(highlightStyle.backgroundColor, palette.selection);
              if (firstHighlight) assert.deepEqual(highlightStyle, firstHighlight);
              else firstHighlight = highlightStyle;
            });
          });
        }
      }
    }
  }
});

test('서랍형 전환은 본체 칸을 초기화하고 합치기·칸 편집을 숨기며 보관 모드를 유지한다', () => {
  for (const drawerIndex of [0, 1]) {
    const { screen, viewport, row, target } = registrationFixture(2);
    viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
    const focus = () => find(screen.tree, named('FridgeFocusView'));
    const menu = () => find(screen.tree, node => node.type === 'FridgeAreaMenu').props;
    const panel = () => toolbarTree(screen);
    const draft = () => find(screen.tree, named('FridgeInteriorMap')).props.draft;
    const openBody = index => {
      find(screen.tree, named('FridgeInteriorMap')).props.onFocus({ ...target,
        areaId: row.compartments[index].id, returnAreaId: row.doors[index].id });
      screen.render();
      focus().props.onPhaseChange('open');
      screen.render();
    };
    const openSettings = () => { menu().onCategoryChange('slots'); screen.render(); };
    const closeSettings = () => {
      panel().props.onAccessibilityEscape();
      screen.render();
    };
    openBody(drawerIndex);
    openSettings();
    find(panel(), node => node.props.accessibilityLabel?.endsWith('칸 늘리기')).props.onPress();
    screen.render();
    find(panel(), node => node.type === 'SlotStructureSelector').props.onChange(2);
    screen.render();
    assert.equal(draft().rows[0].compartments[drawerIndex].slots.length, 2);
    const resetSlots = [{ name: '위에서 1번째 칸', drawerCount: 0 }];
    const otherBody = structuredClone(draft().rows[0].compartments[1 - drawerIndex]);
    const doorSlots = structuredClone(draft().rows[0].doors[drawerIndex].slots);
    closeSettings();
    menu().onOpeningChange(row.doors[drawerIndex].id, 'DRAWER');
    screen.render();
    assert.equal(menu().onMerge, undefined);
    assert.equal(find(FridgeAreaMenu(menu()), node => node.props.accessibilityLabel === '이웃 본체와 합치기'), undefined);
    openSettings();
    assert.equal(find(panel(), node => node.props.accessibilityLabel?.endsWith('칸 늘리기')), undefined);
    assert.equal(find(panel(), node => node.props.accessibilityLabel?.endsWith('칸 줄이기')), undefined);
    assert.equal(find(panel(), node => node.type === 'SlotStructureSelector'), undefined);
    assert.equal(find(panel(), node => node.type === 'ScrollView'), undefined);
    assert.equal(find(panel(), node => node.props.accessibilityLabel === '칸 구성'), undefined);
    menu().onCategoryChange('mode');
    screen.render();
    const modes = findAll(panel(), node => node.props.accessibilityRole === 'radio');
    assert.equal(modes.length, 2);
    assert(modes.every(mode => !mode.props.disabled));
    modes[1].props.onPress();
    screen.render();
    assert.equal(draft().rows[0].compartments[drawerIndex].storageMode, 'FROZEN');
    assert.deepEqual(draft().rows[0].compartments[drawerIndex].slots, resetSlots);
    assert.equal(menu().selectedSlotIndex, 0);
    assert.deepEqual(draft().rows[0].compartments[1 - drawerIndex], otherBody);
    assert.deepEqual(draft().rows[0].doors[drawerIndex].slots, doorSlots);
    closeSettings();
    menu().onOpeningChange(row.doors[drawerIndex].id, row.doors[drawerIndex].side);
    screen.render();
    assert.equal(typeof menu().onMerge, 'function');
    openSettings();
    assert(find(panel(), node => node.props.accessibilityLabel?.endsWith('칸 늘리기')));
    assert.equal(findAll(panel(), node => node.type === 'SlotStructureSelector').length, 1);
    assert.deepEqual(draft().rows[0].compartments[drawerIndex].slots, resetSlots);
    closeSettings();
    menu().onOpeningChange(row.doors[drawerIndex].id, 'DRAWER');
    screen.render();
    focus().props.onClose();
    screen.render();
    focus().props.onPhaseChange('closed');
    screen.render();
    openBody(1 - drawerIndex);
    assert.equal(menu().onMerge, undefined);
    openSettings();
    assert(find(panel(), node => node.props.accessibilityLabel?.endsWith('칸 늘리기')));
    assert.equal(findAll(panel(), node => node.type === 'SlotStructureSelector').length, 1);
    screen.unmount();
  }
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
    find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onCategoryChange('slots');
    screen.render();
    const area = () => [...getDraft().rows[0].doors, ...getDraft().rows[0].compartments].find(area => area.id === areaId);
    const counter = action => find(toolbarTree(screen), node => node.type === 'FeedbackPressable'
      && node.props.accessibilityLabel?.endsWith(`칸 ${action}`));
    const beforeSlots = structuredClone(area().slots);
    while (area().slots.length < limit) {
      assert.equal(counter('늘리기').props.disabled, false);
      counter('늘리기').props.onPress();
      screen.render();
    }
    assert.equal(counter('늘리기').props.disabled, true);
    assert.equal(find(screen.tree, node => node.type === 'FridgeAreaMenu').props.maxSlotCount, limit);
    assert.equal(find(toolbarTree(screen), node => node.props.accessibilityLiveRegion === 'polite').props.children.join(''), `${limit}칸`);
    counter('늘리기').props.onPress();
    screen.render();
    assert.equal(area().slots.length, limit);
    assert.deepEqual(area().slots.slice(0, beforeSlots.length), beforeSlots);
    while (area().slots.length > 1) {
      counter('줄이기').props.onPress();
      screen.render();
    }
    assert.equal(counter('줄이기').props.disabled, true);
    assert.equal(find(toolbarTree(screen), node => node.props.accessibilityLiveRegion === 'polite').props.children.join(''), '1칸');
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
    draft.rows[0].compartments[0].slots = Array.from({ length: 4 }, (_, index) => ({ name: model.getSlotName(index), drawerCount: 2 }));
    const { compartment, requests } = fixture(draft);
    selectDoor(compartment);
    const { focus } = focusedFixture(draft, requests[0]);
    const palette = tokens.fridgeDoorColors[mode];
    for (const area of interiorAreas(focus)) {
      const map = find(area.type(area.props), node => node.type === mapModule.FridgeMap);
      const tree = mapModule.FridgeMap(map.props);
      const frame = find(tree, node => children(node).includes(map.props.areaHeader));
      assert.equal(flattenStyle(frame.props.style).borderColor, '#FFFFFF');
      assert.equal(flattenStyle(frame.props.style).backgroundColor, '#FFFFFF');
      const content = children(frame).at(-1);
      assert.equal(flattenStyle(content.props.style).backgroundColor, palette.frame);
      assert.equal(flattenStyle(content.props.style).marginBottom, flattenStyle(content.props.style).marginHorizontal);
      assert.equal(flattenStyle(content.props.style).borderRadius, area.props.area.isBody ? 12 : tokens.fridgeSurfaces.cavityRadius);
      assert.equal(flattenStyle(frame.props.style).boxShadow, undefined);
      assert.equal(flattenStyle(find(map.props.areaHeader, node => node.type === 'Text').props.style).color, palette.ink);
      if (area.props.area.isBody) {
        const shelf = find(tree, node => flattenStyle(node.props.style).height === 4);
        assert.equal(flattenStyle(shelf.props.style).backgroundColor, palette.shelf);
        assert.equal(flattenStyle(shelf.props.style).borderRadius, 0);
        const rightPositions = findAll(tree, node => node.props.accessibilityLabel?.includes('오른쪽'));
        assert.equal(rightPositions.length, 4);
        rightPositions.forEach(rightPosition => {
          assert.equal(flattenStyle(rightPosition.props.style).borderLeftWidth ?? 0, 0);
          assert.equal(flattenStyle(rightPosition.props.style).marginLeft, 12);
          const divider = children(rightPosition).find(node => flattenStyle(node.props.style).width === 4);
          const dividerStyle = flattenStyle(divider.props.style);
          assert.equal(dividerStyle.backgroundColor, palette.shelf);
          assert.equal(dividerStyle.borderRadius, 0);
          assert.equal(dividerStyle.top, 0);
          assert.equal(dividerStyle.bottom, 0);
          assert.equal(dividerStyle.boxShadow, undefined);
          assert.equal(divider.props.pointerEvents, 'none');
          assert.equal(divider.props.importantForAccessibility, 'no-hide-descendants');
        });
      } else {
        for (const bin of findAll(tree, named('DoorPocketBin'))) {
          const front = flattenStyle(children(bin.type(bin.props))[0].props.style);
          assert.equal(front.backgroundColor, palette.pocket);
          assert.equal(front.borderColor, palette.shelf);
          assert.equal(front.borderWidth, 3);
          assert.equal(front.borderTopWidth, 0);
          assert.equal(front.borderTopLeftRadius, 0);
          assert.equal(front.borderTopRightRadius, 0);
          assert.equal(front.borderBottomLeftRadius, 12);
          assert.equal(front.borderBottomRightRadius, 12);
          assert.equal(front.boxShadow, undefined);
        }
      }
    }
    const empty = mount(interiorModule.DoorWithoutStorage, { label: '수납 없음', selected: false, storageMode: mode });
    children(empty.tree).at(-1).props.onLayout({ nativeEvent: { layout: { width: 80, height: 164 } } });
    empty.render();
    const lines = findAll(empty.tree, node => flattenStyle(node.props.style).height === 2);
    assert.equal(lines.length, 2);
    assert(lines.every(line => flattenStyle(line.props.style).backgroundColor === palette.motif + '66'));
    assert.equal(flattenStyle(empty.tree.props.style).borderColor, '#FFFFFF');
    assert.equal(flattenStyle(empty.tree.props.style).backgroundColor, '#FFFFFF');
    assert.equal(flattenStyle(children(empty.tree).at(-1).props.style).backgroundColor, palette.frame);
    assert.equal(flattenStyle(empty.tree.props.style).boxShadow, undefined);
    empty.unmount();
    focus.unmount();
  }
});

test('문의 크기와 관계없이 중앙 모드 그림과 공간 이름을 표시한다', () => {
  for (const mode of ['CHILLED', 'FROZEN']) {
    for (const size of [16, 56]) {
      const tree = mapModule.DoorModeArt({ storageMode: mode, size });
      const icons = findAll(tree, node => node.type === 'Icon');
      assert.equal(icons.length, 1);
      assert.equal(icons[0].props.name, mode === 'CHILLED' ? 'weather-windy' : 'snowflake');
      assert.equal(findAll(tree, node => node.type === 'Text').length, 1);
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
            assert.equal(flattenStyle(frame.props.style).backgroundColor, '#FFFFFF');
            background = flattenStyle(children(frame).at(-1).props.style).backgroundColor;
            const positions = findAll(mapTree, node => node.props.accessibilityLabel?.includes('위에서'));
            assert(positions.every(position => flattenStyle(position.props.style).backgroundColor === 'transparent'));
          } else {
            const empty = find(tree, named('DoorWithoutStorage'));
            const mounted = mount(empty.type, empty.props);
            assert.equal(flattenStyle(mounted.tree.props.style).backgroundColor, '#FFFFFF');
            background = flattenStyle(children(mounted.tree).at(-1).props.style).backgroundColor;
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
      assert.equal(flattenStyle(handle.props.style).boxShadow, undefined);
      const hinges = find(focus.tree, named('DoorHinges'));
      const hinge = find(hinges.type(hinges.props), named('DoorHinge'));
      const pin = children(hinge.type(hinge.props))[0];
      assert.equal(flattenStyle(pin.props.style).backgroundColor, tokens.fridgeDoorColors[mode].handle);
      assert.equal(flattenStyle(pin.props.style).boxShadow, undefined);
      const layout = model.getDraftLayout(draft);
      const individual = mapModule.FridgeMap({ ...layout, storageMode: mode,
        selectedPositionId: layout.positions[0].id, onSelectPosition() {} });
      const selectedSlot = find(individual, node => node.type === 'FeedbackPressable' && node.props.accessibilityState.selected);
      const slotStyle = flattenStyle(selectedSlot.props.style);
      assert.equal(slotStyle.backgroundColor, 'transparent');
      assert.equal(slotStyle.boxShadow, undefined);
      const positionFrame = children(selectedSlot).at(-1);
      const positionFrameStyle = flattenStyle(positionFrame.props.style);
      assert.equal(positionFrameStyle.position, 'absolute');
      assert.equal(positionFrameStyle.borderWidth, 2);
      assert.equal(positionFrameStyle.borderColor, tokens.fridgeDoorColors[mode].ink);
      assert.equal(positionFrame.props.pointerEvents, 'none');
      assert.equal(positionFrame.props.importantForAccessibility, 'no-hide-descendants');
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
          const header = map ? map.props.areaHeader : find(tree, named('DoorWithoutStorage')).props.areaHeader;
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

test('냉장·냉동과 칸 변경은 내부 설정에만 반영하고 기본정보 도면은 유지한다', () => {
  const { screen, viewport, map, target } = registrationFixture();
  const basicProps = () => find(screen.tree, node => node.type === 'FridgeStructurePreview').props;
  const before = structuredClone(basicProps());
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  map.props.onFocus(target);
  screen.render();
  find(screen.tree, named('FridgeFocusView')).props.onPhaseChange('open');
  screen.render();
  find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onCategoryChange('slots');
  screen.render();
  find(toolbarTree(screen), node => node.props.accessibilityLabel?.endsWith('칸 늘리기')).props.onPress();
  screen.render();
  find(screen.tree, node => node.type === 'FridgeAreaMenu').props.onCategoryChange('mode');
  screen.render();
  for (const [mode, label] of [['FROZEN', '냉동'], ['CHILLED', '냉장']]) {
    find(toolbarTree(screen), node => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === '1단 본체 ' + label).props.onPress();
    screen.render();
    const draft = find(screen.tree, named('FridgeInteriorMap')).props.draft;
    assert.equal(draft.rows[0].compartments[0].storageMode, mode);
    const { compartment } = fixture(draft);
    const door = doors(compartment)[0];
    const tree = door.type(door.props);
    assert.equal(find(tree, named('DoorModeArt')).props.storageMode, mode);
    assert.equal(flattenStyle(find(tree, node => node.type === 'Pressable').props.style).backgroundColor, tokens.fridgeDoorColors[mode].background);
    assert.deepEqual(basicProps(), before);
  }
  screen.unmount();
});

test('기본정보는 단·문 개수만 받고 여는 방식·문 수납·본체 합치기에 영향받지 않는다', () => {
  const { screen, viewport, map, row, target } = registrationFixture(2);
  const basicProps = () => find(screen.tree, node => node.type === 'FridgeStructurePreview').props;
  const before = structuredClone(basicProps());
  assert.deepEqual(before.rows, [{ id: row.id, doorCount: 2 },
    { id: map.props.draft.rows[1].id, doorCount: 1 }]);
  const beforeTree = structureModule.FridgeStructurePreview(before);
  const assertBasicUnchanged = () => {
    assert.deepEqual(basicProps(), before);
    assert.deepEqual(structureModule.FridgeStructurePreview(basicProps()), beforeTree);
  };
  viewport.props.ref.current = { measureInWindow: callback => callback(0, 110, 375, 520) };
  map.props.onFocus(target);
  screen.render();
  const focus = () => find(screen.tree, named('FridgeFocusView'));
  focus().props.onPhaseChange('open');
  screen.render();
  const menu = () => find(screen.tree, node => node.type === 'FridgeAreaMenu').props;
  for (const opening of ['RIGHT_DOOR', 'DRAWER', 'LEFT_DOOR']) {
    menu().onOpeningChange(row.doors[0].id, opening);
    screen.render();
    const door = focus().props.draft.rows[0].doors[0];
    assert.equal(opening === 'DRAWER' ? door.kind : door.side, opening === 'DRAWER' ? 'DRAWER' : opening);
    assertBasicUnchanged();
  }
  focus().props.onSelectArea(row.doors[0].id);
  screen.render();
  menu().onStorageChange(false);
  screen.render();
  assert.equal(focus().props.draft.rows[0].doors[0].storageEnabled, false);
  assertBasicUnchanged();
  focus().props.onSelectArea(row.compartments[0].id);
  screen.render();
  menu().onMerge();
  screen.render();
  assert.equal(focus().props.draft.rows[0].compartments.length, 1);
  assertBasicUnchanged();
  menu().onSplit();
  screen.render();
  assert.equal(focus().props.draft.rows[0].compartments.length, 2);
  assertBasicUnchanged();
  find(screen.tree, node => node.props.accessibilityLabel === '1단 문 줄이기').props.onPress();
  screen.render();
  assert.equal(basicProps().rows[0].doorCount, 1);
  assert.equal(children(children(structureModule.FridgeStructurePreview(basicProps()))[0]).length, 1);
  screen.unmount();
});

test('기본정보 도면 UI는 내부 설정의 색상·손잡이·모서리 토큰 변경과 독립적이다', () => {
  const props = { rows: [{ id: 'row-1', doorCount: 2 }, { id: 'row-2', doorCount: 1 }] };
  const before = structureModule.FridgeStructurePreview(props);
  const original = { ...tokens.fridgeSurfaces };
  try {
    Object.assign(tokens.fridgeSurfaces, {
      border: '#FF0000', exterior: '#000000', frame: '#000000', handle: '#FF0000',
      handleLength: 160, radius: 40,
    });
    const changed = loadComponent('src/features/fridge/components/FridgeStructurePreview.tsx');
    assert.deepEqual(changed.FridgeStructurePreview(props), before);
  } finally {
    Object.assign(tokens.fridgeSurfaces, original);
  }
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
