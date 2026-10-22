/**
 * @file
 * 냉장고 배치 카탈로그의 식별자·출처·공간 배치·문 연결을 검사한다.
 * 자료를 추가할 때 잘못된 연결을 확인하며, 실제 제품 사양의 정확성은 출처와 대조한다.
 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const catalogPath = resolve(__dirname, '../src/features/fridge/model/fridgeLayoutCatalog.json');

/** 같은 범위의 ID 중복과 빈 값을 검사한다. */
function collectIds(items, context) {
  assert(Array.isArray(items), `${context}: 목록이 필요합니다.`);
  const ids = new Set();
  for (const item of items) {
    assert(typeof item.id === 'string' && /^[a-z][a-z0-9-]*$/.test(item.id), `${context}: 올바른 ID가 필요합니다.`);
    assert(!ids.has(item.id), `${context}: ID 중복 ${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

/** 날짜 모양뿐 아니라 실제 달력에 존재하는 날짜인지 확인한다. */
function checkDate(value) {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), `날짜 형식 오류: ${value}`);
  assert(new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, `존재하지 않는 날짜: ${value}`);
}

function validateCatalog(catalog) {
  assert.equal(catalog.schemaVersion, 1);
  assert(Number.isInteger(catalog.catalogRevision) && catalog.catalogRevision > 0);
  checkDate(catalog.researchedOn);
  const sourceIds = collectIds(catalog.sources, '출처');
  assert(sourceIds.size > 0);
  for (const source of catalog.sources) {
    assert(new URL(source.url).protocol === 'https:', `${source.id}: HTTPS 출처가 필요합니다.`);
    assert(source.publisher && source.title && source.evidence, `${source.id}: 출처 설명이 필요합니다.`);
    checkDate(source.checkedOn);
  }

  function checkSources(item, required) {
    assert(Array.isArray(item.sourceIds), `${item.id}: 출처 목록이 필요합니다.`);
    assert(!required || item.sourceIds.length > 0, `${item.id}: 확인한 출처가 필요합니다.`);
    assert.equal(new Set(item.sourceIds).size, item.sourceIds.length, `${item.id}: 출처 중복`);
    item.sourceIds.forEach(id => assert(sourceIds.has(id), `${item.id}: 없는 출처 ${id}`));
  }

  assert(catalog.templates.length > 0, '확인한 배치 유형이 필요합니다.');
  const templateIds = collectIds(catalog.templates, '배치 유형');
  for (const template of catalog.templates) {
    const context = template.id;
    assert(template.name && Number.isInteger(template.revision) && template.revision > 0, `${context}: 이름·개정 번호 오류`);
    assert(['GENERAL', 'FREEZER', 'KIMCHI', 'UNDERCOUNTER'].includes(template.category), `${context}: 분류 오류`);
    assert(['FRONT', 'TOP'].includes(template.view), `${context}: 도식 방향 오류`);
    assert(Array.isArray(template.examples) && template.examples.length > 0, `${context}: 대표 사례 누락`);
    assert(Array.isArray(template.notes), `${context}: 비고 목록 누락`);
    checkSources(template, true);
    const compartmentIds = collectIds(template.compartments, context);
    assert(compartmentIds.size > 0, `${context}: 본체 공간이 필요합니다.`);
    const cells = new Map([...compartmentIds].map(id => [id, []]));
    assert(Array.isArray(template.layout) && template.layout.length > 0, `${context}: 배치가 필요합니다.`);
    const columns = template.layout[0].length;
    assert(columns > 0, `${context}: 배치에 열이 필요합니다.`);
    template.layout.forEach((row, y) => {
      assert(Array.isArray(row) && row.length === columns, `${context}: 행마다 열 수가 같아야 합니다.`);
      row.forEach((id, x) => {
        assert(compartmentIds.has(id), `${context}: 배치에 없는 실 ${id}`);
        cells.get(id).push([y, x]);
      });
    });

    // 반복된 ID는 한 본체이므로 떨어진 셀이나 L자 모양으로 배치하지 않는다.
    for (const compartment of template.compartments) {
      const positions = cells.get(compartment.id);
      assert(positions.length > 0, `${context}: 배치에서 누락된 실 ${compartment.id}`);
      const ys = positions.map(([y]) => y);
      const xs = positions.map(([, x]) => x);
      const size = (Math.max(...ys) - Math.min(...ys) + 1) * (Math.max(...xs) - Math.min(...xs) + 1);
      assert.equal(positions.length, size, `${context}: 실은 직사각형이어야 합니다.`);
      assert(compartment.name && Object.hasOwn(catalog.referenceRoles, compartment.referenceRole), `${context}: 실 용도 오류`);
      const modes = compartment.modeOptions;
      assert(modes === null || (Array.isArray(modes) && modes.length > 0), `${context}: 미확인 모드는 null로 기록합니다.`);
      if (modes !== null) {
        assert.equal(new Set(modes).size, modes.length, `${context}: 모드 중복`);
        modes.forEach(mode => assert(Object.hasOwn(catalog.storageModes, mode), `${context}: 없는 모드 ${mode}`));
      }
    }

    collectIds(template.openings, `${context} 문`);
    const accessed = new Set();
    for (const opening of template.openings) {
      assert(['HINGED', 'DRAWER', 'LID'].includes(opening.kind), `${context}: 문 형태 오류`);
      assert(['CONFIGURABLE', 'NONE'].includes(opening.doorBins), `${context}: 문 수납 정책 오류`);
      assert(opening.kind === 'HINGED' || opening.doorBins === 'NONE', `${context}: 서랍·뚜껑에는 문 수납을 설정하지 않습니다.`);
      assert(Array.isArray(opening.compartmentIds) && opening.compartmentIds.length > 0, `${context}: 문 연결 누락`);
      assert.equal(new Set(opening.compartmentIds).size, opening.compartmentIds.length, `${context}: 문 연결 중복`);
      opening.compartmentIds.forEach(id => {
        assert(compartmentIds.has(id), `${context}: 문에서 없는 실 참조 ${id}`);
        accessed.add(id);
      });
    }
    assert.equal(accessed.size, compartmentIds.size, `${context}: 접근할 문이 없는 실이 있습니다.`);
  }

  assert.equal(catalog.coverage.complete, false, '전 세계 모든 제품을 조사 완료했다고 표시하지 않습니다.');
  assert(Array.isArray(catalog.coverage.excluded));
  collectIds(catalog.coverage.pendingCases, '추가 조사');
  for (const pending of catalog.coverage.pendingCases) {
    assert(!templateIds.has(pending.id), `${pending.id}: 확인 유형과 추가 조사 항목 중복`);
    assert(pending.name && pending.nextCheck, `${pending.id}: 추가 확인 내용 누락`);
    checkSources(pending, false);
  }
  collectIds(catalog.variations, '변형');
  for (const variation of catalog.variations) {
    assert(variation.name && variation.handling, `${variation.id}: 변형 처리 설명 누락`);
    checkSources(variation, true);
  }
}

if (require.main === module) {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  validateCatalog(catalog);
  console.log(`배치 ${catalog.templates.length}종, 출처 ${catalog.sources.length}개, 추가 조사 ${catalog.coverage.pendingCases.length}건 검증 통과`);
}

module.exports = { validateCatalog };
