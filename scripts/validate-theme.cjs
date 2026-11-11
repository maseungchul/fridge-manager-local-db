/**
 * @file
 * 테마 설정 저장과 시스템 색상 변경 시 실제 적용 모드를 검증한다.
 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const tokens = require('../src/theme/tokens.ts');

function createThemeFixture(savedValue, systemMode = 'light') {
  let current = systemMode;
  let stored = savedValue;
  let rejectSave = false;
  const slots = [];
  let cursor = 0;
  let pending = [];
  const hooks = {
    createContext(value) { return { Provider: 'Provider', value }; },
    useContext(context) { return context.value; },
    useState(initial) {
      const index = cursor++;
      const slot = slots[index] ??= { value: initial };
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useRef(initial) { return hooks.useState({ current: initial })[0]; },
    useCallback(callback) { return callback; },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (!slots[index]) {
        slots[index] = { dependencies };
        pending.push(effect);
      }
    },
  };
  const storage = {
    async getItemAsync(key) { assert.equal(key, 'settings.theme'); return stored; },
    async setItemAsync(key, value) {
      assert.equal(key, 'settings.theme');
      if (rejectSave) throw new Error('save failed');
      stored = value;
    },
  };
  const source = readFileSync('src/theme/ThemeProvider.tsx', 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  const dependencies = {
    react: hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': { useColorScheme: () => current },
    'expo-sqlite/kv-store': storage,
    '@/theme/tokens': tokens,
  };
  new Function('require', 'module', 'exports', output)(
    name => dependencies[name] ?? require(name), module, module.exports);
  function render() {
    cursor = 0;
    const tree = module.exports.ThemeProvider({ children: null });
    for (const effect of pending.splice(0)) effect();
    return tree?.props.value ?? null;
  }
  return {
    render,
    setSystemMode(value) { current = value; },
    failSave() { rejectSave = true; },
    saved() { return stored; },
  };
}

test('시스템 설정은 기기 테마 변경을 따르고 선택값을 저장한다', async () => {
  const fixture = createThemeFixture(null);
  assert.equal(fixture.render(), null);
  await Promise.resolve();
  const light = fixture.render();
  assert.equal(light.preference, 'light');
  await light.changeTheme('system');
  assert.equal(fixture.saved(), 'system');
  assert.equal(fixture.render().mode, 'light');
  fixture.setSystemMode('dark');
  assert.equal(fixture.render().mode, 'dark');
  assert.equal(fixture.render().preference, 'system');
  fixture.setSystemMode('light');
  assert.equal(fixture.render().mode, 'light');
});

test('저장한 시스템 테마를 복원하고 수동 선택과 저장 실패를 처리한다', async () => {
  const fixture = createThemeFixture('system', 'dark');
  fixture.render();
  await Promise.resolve();
  let theme = fixture.render();
  assert.equal(theme.mode, 'dark');
  await theme.changeTheme('light');
  fixture.setSystemMode('dark');
  theme = fixture.render();
  assert.equal(theme.mode, 'light');
  assert.equal(theme.preference, 'light');
  fixture.failSave();
  await assert.rejects(theme.changeTheme('system'), /save failed/);
  assert.equal(fixture.render().preference, 'light');
  assert.equal(fixture.saved(), 'light');
});
