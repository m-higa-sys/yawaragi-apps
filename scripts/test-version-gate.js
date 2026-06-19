// test-version-gate.js
// キャッシュ自動更新バージョンゲートの純関数テスト（design.md §7 準拠）
//
// 方式：genba.html の <head> インラインゲートに定義された純関数
//   gateShouldReload(cur, latest) / buildVersionedUrl(currentUrl, latest)
// を「実コード抽出」して node で評価する（中止操作ゲートと同じTDD流儀＝
// 出荷コードとテスト対象のドリフトを防ぐ）。
//
// 実行: node scripts/test-version-gate.js

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'genba.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

// genba.html から純関数の実ソースを抽出（各関数は単一 return＝ネスト波括弧なし）
function extractFn(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[^}]*\\}');
  const m = html.match(re);
  if (!m) {
    throw new Error('genba.html に function ' + name + ' が見つからない（未実装＝RED）');
  }
  return m[0];
}

// 抽出したソースを評価して関数を取り出す
const sandbox = {};
const src = extractFn('gateShouldReload') + '\n' + extractFn('buildVersionedUrl') +
  '\nsandbox.gateShouldReload = gateShouldReload; sandbox.buildVersionedUrl = buildVersionedUrl;';
(function () {
  // URL/URLSearchParams は node グローバルで利用可能
  eval(src);
})();

const { gateShouldReload, buildVersionedUrl } = sandbox;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual)); }
}

const BASE = 'https://m-higa-sys.github.io/yawaragi-apps/genba.html';

console.log('[gateShouldReload]');
// ?v= 無し（cur=null）+ latest=B → reload する
eq(gateShouldReload(null, 'B'), true, 'cur=null, latest=B -> reload');
// ?v=B + latest=B → reload しない（ループ防止）
eq(gateShouldReload('B', 'B'), false, 'cur=B, latest=B -> no reload (loop guard)');
// ?v=A + latest=B → reload する
eq(gateShouldReload('A', 'B'), true, 'cur=A, latest=B -> reload');
// latest 空文字 → reload しない（fetch異常時の保険）
eq(gateShouldReload('A', ''), false, 'latest="" -> no reload (fetch fail safety)');
eq(gateShouldReload(null, ''), false, 'cur=null, latest="" -> no reload');

console.log('[buildVersionedUrl]');
// ?v= 無し + latest=B → ...?v=B
eq(buildVersionedUrl(BASE, 'B'), BASE + '?v=B', 'no query -> ?v=B');
// ?v=A + latest=B → ...?v=B（差し替え）
eq(buildVersionedUrl(BASE + '?v=A', 'B'), BASE + '?v=B', '?v=A -> ?v=B (swap)');
// 既存クエリ ?foo=1 + latest=B → ?foo=1&v=B（foo保持）
eq(buildVersionedUrl(BASE + '?foo=1', 'B'), BASE + '?foo=1&v=B', '?foo=1 -> ?foo=1&v=B (preserve foo)');

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
