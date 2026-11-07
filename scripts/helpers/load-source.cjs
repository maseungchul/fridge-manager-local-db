/**
 * @file
 * 네이티브 실행 환경이 필요 없는 TypeScript 모델·번역 모듈을 검증 스크립트에서 읽는다.
 * 경로 별칭과 상대 경로만 해석하고 동일 모듈의 클래스·상수를 한 번만 생성한다.
 */
const { readFileSync, existsSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const ts = require('typescript');

const root = resolve(__dirname, '../..');
const modules = new Map();

function loadSource(path) {
  let filename = resolve(root, path);
  if (!existsSync(filename)) filename += '.ts';
  if (modules.has(filename)) return modules.get(filename).exports;
  const source = readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  modules.set(filename, module);
  new Function('require', 'module', 'exports', output)(name => {
    if (name.startsWith('@/')) return loadSource(`src/${name.slice(2)}`);
    if (name.startsWith('.')) return loadSource(resolve(dirname(filename), name));
    return require(name);
  }, module, module.exports);
  return module.exports;
}

module.exports = { loadSource };
