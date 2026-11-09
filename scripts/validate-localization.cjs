/**
 * @file
 * 번역 키·치환값의 누락과 화면 문구의 직접 작성을 검사한다.
 * 언어 변경이 재료·위치 ID·날짜 계산에 영향을 주지 않는지도 실제 모델로 확인한다.
 */
const assert = require('node:assert/strict');
const { readdirSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const { loadSource } = require('./helpers/load-source.cjs');
const { ko } = loadSource('src/i18n/locales/ko.ts');
const { ja } = loadSource('src/i18n/locales/ja.ts');
const { translate, formatDate } = loadSource('src/i18n/translations.ts');
const { AppError, getErrorMessage } = loadSource('src/i18n/errors.ts');
const fridge = loadSource('src/features/fridge/model/fridgeLayout.ts');
const { getIngredientExpirationStatus } = loadSource('src/features/ingredient/model/ingredient.ts');
const t = (key, ...args) => translate('ja', key, ...args);
const parameters = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

test('한국어·일본어의 번역 키·치환값이 일치하고 빈 문구·일본어의 한국어 누락이 없다', () => {
  assert.deepEqual(Object.keys(ko).sort(), Object.keys(ja).sort());
  for (const key of Object.keys(ko)) {
    assert(ko[key].trim() && ja[key].trim(), key);
    assert.deepEqual(parameters(ko[key]), parameters(ja[key]), key);
    assert(!/[가-힣]/.test(ja[key]), key);
    const values = Object.fromEntries(parameters(ko[key]).map(name => [name, 2]));
    for (const language of ['ko', 'ja']) assert(!/\{\w+\}/.test(translate(language, key, values)), `${language}: ${key}`);
  }
});

test('사용자가 입력한 문구는 재번역하거나 치환식을 다시 해석하지 않는다', () => {
  const name = '달걀・卵 {days} $&';
  const message = t('ingredient.deleteConfirm', { name });
  assert(message.includes(`「${name}」`));
  assert.equal((message.match(/\{days\}/g) ?? []).length, 1);
  assert.equal(t('queue.title', { count: 0 }), '移動待ち 0件');
  assert.equal(t('queue.title', { count: 125 }), '移動待ち 125件');
});

test('위치 이름만 일본어로 생성하고 사용자 이름·재료·위치 식별자와 원본 초안은 보존한다', () => {
  let draft = fridge.createRefrigeratorDraft();
  draft = fridge.changeDraftDoorCount(draft, draft.rows[0].id, 1);
  draft.name = '우리 집 냉장고・わが家';
  const body = draft.rows[0].compartments[0];
  body.slots[0].id = 'stored-slot';
  body.slots[0].drawerCount = 2;
  const ingredient = { id: 'egg', name: '달걀・卵', quantity: '2개', memo: '개봉・開封', expirationDate: '2028-02-29', slotId: 'stored-slot', drawerNumber: 2 };
  const before = structuredClone(draft);
  const korean = fridge.getDraftLayout(draft, [ingredient]);
  const japanese = fridge.getDraftLayout(draft, [ingredient], t);
  assert.deepEqual(japanese.areas.map(area => area.id), korean.areas.map(area => area.id));
  assert.deepEqual(japanese.positions.map(({ id, slotId, drawerNumber }) => ({ id, slotId, drawerNumber })),
    korean.positions.map(({ id, slotId, drawerNumber }) => ({ id, slotId, drawerNumber })));
  assert.deepEqual(japanese.ingredients, korean.ingredients);
  assert.equal(japanese.areas[0].name, '庫内');
  assert.equal(japanese.areas[0].compartment, '1段目・1番目');
  const position = japanese.positions.find(position => position.slotId === 'stored-slot' && position.drawerNumber === 2);
  assert.equal(fridge.getPositionName(position, t), '上から1番目の区画 · 右');
  assert.equal(fridge.getStorageModeName('FROZEN', t), '冷凍室');
  assert.equal(fridge.createRefrigeratorDraft(undefined, t).name, 'わが家の冷蔵庫');
  assert.equal(fridge.createRefrigeratorDraft({ ...draft, id: 'saved' }, t).name, draft.name);
  assert.deepEqual(draft, before);
});

test('유통기한은 공통 D-day 표기·긴급 상태를 유지하고 날짜 표시에서 시간대를 변환하지 않는다', () => {
  const now = new Date(2028, 1, 28, 23, 59);
  for (const [date, label] of [[null, '賞味期限未入力'], ['2028-03-01', 'D-2'], ['2028-02-28', 'D-DAY'], ['2028-02-27', 'D+1']]) {
    const original = getIngredientExpirationStatus(date, now);
    assert.deepEqual(getIngredientExpirationStatus(date, now, t), { ...original, label });
  }
  for (const date of ['0001-01-01', '2028-02-29', '9999-12-31']) {
    assert.equal(formatDate(date, t), date.replaceAll('-', '/'));
    assert.equal(formatDate(date, (key, ...args) => translate('ko', key, ...args)), date.replaceAll('-', '.'));
  }
});

test('저장·검증·기존 DB 트리거 오류는 현재 언어로 안내하고 알 수 없는 오류는 원문을 노출하지 않는다', () => {
  const error = new AppError('errors.doorCount', { row: 2, max: 2 });
  assert.equal(getErrorMessage(error, t, 'fallback'), '2段目のドアは1～2枚で構成してください。');
  for (const key of ['errors.protectedSplit', 'errors.protectedPocket', 'errors.invalidPosition']) {
    const legacy = new Error(`SQLite: ${ko[key]} (code 19)`);
    assert.equal(getErrorMessage(legacy, t, 'fallback'), ja[key]);
  }
  for (const error of [new Error('disk full'), new Error('한국어 원문'), null, 'unknown']) {
    assert.equal(getErrorMessage(error, t, ja['fridge.saveFailure']), ja['fridge.saveFailure']);
  }
});

test('화면·모델에는 번역 대상 한국어 문구가 직접 남아 있지 않는다', () => {
  const root = resolve(__dirname, '../src');
  // 고유 언어명과 Provider 사용 오류는 화면 번역 대상이 아닌 내부 식별 문구다.
  const internal = new Set(['한국어', '표시 언어의 공통 상태를 찾을 수 없습니다.', '임시이동목록의 공통 상태를 찾을 수 없습니다.']);
  const remaining = [];
  for (const file of readdirSync(root, { recursive: true }).filter(file => /\.tsx?$/.test(file) && !file.replaceAll('\\', '/').startsWith('i18n/locales/'))) {
    const source = ts.createSourceFile(file, readFileSync(resolve(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      const literal = ts.isStringLiteralLike(node) || ts.isTemplateExpression(node) || ts.isJsxText(node);
      if (literal && /[가-힣]/.test(node.getText(source))) {
        // 배포된 DB 트리거의 오류 문자열은 마이그레이션 없이 표시 시 번역한다.
        if (file.replaceAll('\\', '/') === 'db/initializeDatabase.ts' && node.getText(source).includes('CREATE TRIGGER')) return;
        if (!internal.has(node.text)) remaining.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(remaining, []);
});
