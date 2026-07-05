// test-sougei-nisshi-version-gate.js
// sougei_nisshi.html の <head> インラインゲートに定義された純関数
//   gateShouldReload(cur, latest) / buildVersionedUrl(currentUrl, latest)
// を「実コード抽出」して node で評価する（出荷コードとテスト対象のドリフト防止）。
// さらに genba.html の同関数と文字列一致することを検証し「genba現物をそのまま移植」を強制する。
// 実行: node scripts/test-sougei-nisshi-version-gate.js

const fs = require('fs');
const path = require('path');

const SOUGEI_NISSHI_PATH = path.join(__dirname, '..', 'sougei_nisshi.html');
const GENBA_PATH = path.join(__dirname, '..', 'genba.html');
const sougeiNisshiHtml = fs.readFileSync(SOUGEI_NISSHI_PATH, 'utf8');
const genbaHtml = fs.readFileSync(GENBA_PATH, 'utf8');

// 各関数は単一 return（ネスト波括弧なし）＝ test-version-gate.js と同じ抽出器
function extractFn(html, name, where) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[^}]*\\}');
  const m = html.match(re);
  if (!m) throw new Error(where + ' に function ' + name + ' が見つからない（未実装＝RED）');
  return m[0];
}

const sandbox = {};
const src = extractFn(sougeiNisshiHtml, 'gateShouldReload', 'sougei_nisshi.html') + '\n' +
  extractFn(sougeiNisshiHtml, 'buildVersionedUrl', 'sougei_nisshi.html') +
  '\nsandbox.gateShouldReload = gateShouldReload; sandbox.buildVersionedUrl = buildVersionedUrl;';
(function () { eval(src); })();
const { gateShouldReload, buildVersionedUrl } = sandbox;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual)); }
}

const BASE = 'https://m-higa-sys.github.io/yawaragi-apps/sougei_nisshi.html';

console.log('[gateShouldReload]');
eq(gateShouldReload(null, 'B'), true, 'cur=null, latest=B -> reload');
eq(gateShouldReload('B', 'B'), false, 'cur=B, latest=B -> no reload (loop guard)');
eq(gateShouldReload('A', 'B'), true, 'cur=A, latest=B -> reload');
eq(gateShouldReload('A', ''), false, 'latest="" -> no reload (fetch fail safety)');
eq(gateShouldReload(null, ''), false, 'cur=null, latest="" -> no reload');

console.log('[buildVersionedUrl]');
eq(buildVersionedUrl(BASE, 'B'), BASE + '?v=B', 'no query -> ?v=B');
eq(buildVersionedUrl(BASE + '?v=A', 'B'), BASE + '?v=B', '?v=A -> ?v=B (swap)');
eq(buildVersionedUrl(BASE + '?foo=1', 'B'), BASE + '?foo=1&v=B', '?foo=1 -> ?foo=1&v=B (preserve foo)');

console.log('[genba との同一性（verbatim移植の強制）]');
const nrm = (s) => s.replace(/\r\n/g, '\n');
eq(nrm(extractFn(sougeiNisshiHtml, 'gateShouldReload', 'sougei_nisshi.html')),
   nrm(extractFn(genbaHtml, 'gateShouldReload', 'genba.html')), 'gateShouldReload が genba と一致');
eq(nrm(extractFn(sougeiNisshiHtml, 'buildVersionedUrl', 'sougei_nisshi.html')),
   nrm(extractFn(genbaHtml, 'buildVersionedUrl', 'genba.html')), 'buildVersionedUrl が genba と一致');

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
