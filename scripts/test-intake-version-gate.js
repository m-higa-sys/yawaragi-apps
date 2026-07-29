// test-intake-version-gate.js
// intake.html のキャッシュ自動更新バージョンゲート横展開テスト（design.md §7 準拠）
//
// 方式：genba.html を正本とし、intake.html の <head> 最先頭ゲートが
//   (1) genba のゲート <script> ブロックと byte 単位で同一（verbatim 移植）
//   (2) 抽出した純関数 gateShouldReload / buildVersionedUrl が genba と同一挙動
// であることを実コード抽出で検証する（出荷コードとテストのドリフト防止）。
//
// ★2026-07-29 変更: intake は shared.js を **?v= 付き**で読むようになった。
//   理由: intake.html が shared.js の新関数 gasPostIntake に依存するため、HTMLだけ版ゲートで
//   更新されて shared.js が古いキャッシュのまま残ると、保存が丸ごと壊れる（undefined 呼び出し）。
//   これに伴い scripts/bump-app-version.js の SYNC_HTMLS に intake.html を追加済み
//   （＝?v= は version.txt と常に同期する。手書き固定は永久ピン留めになるので禁止）。
//   ゲート自体は shared.js 非依存の自己完結IIFEなので、<script src="shared.js"> の前に置いても非干渉。
//
// 実行: node scripts/test-intake-version-gate.js

const fs = require('fs');
const path = require('path');

const GENBA = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');
const INTAKE = fs.readFileSync(path.join(__dirname, '..', 'intake.html'), 'utf8');

// <head> 直後のゲート <script> 要素（gateShouldReload を含む）を抽出
const GATE_RE = /<script>\s*function gateShouldReload[\s\S]*?<\/script>/;

function extractGate(html, label) {
  const m = html.match(GATE_RE);
  if (!m) throw new Error(label + ' にゲート <script> ブロックが見つからない（未移植＝RED）');
  return m[0];
}

// 抽出したブロックから純関数を評価
function loadFns(gateSrc) {
  const sandbox = {};
  const reShould = /function\s+gateShouldReload\s*\([^)]*\)\s*\{[^}]*\}/;
  const reBuild = /function\s+buildVersionedUrl\s*\([^)]*\)\s*\{[^}]*\}/;
  const src = gateSrc.match(reShould)[0] + '\n' + gateSrc.match(reBuild)[0] +
    '\nsandbox.gateShouldReload = gateShouldReload; sandbox.buildVersionedUrl = buildVersionedUrl;';
  (function () { eval(src); })();
  return sandbox;
}

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual)); }
}

const genbaGate = extractGate(GENBA, 'genba.html');

console.log('[genba同一性]');
// (1) intake.html にゲートブロックが存在する（未移植なら extractGate が throw）
let intakeGate = null;
try {
  intakeGate = extractGate(INTAKE, 'intake.html');
  pass++; console.log('  PASS intake.html にゲート <script> ブロックが存在する');
} catch (e) {
  fail++; console.log('  FAIL ' + e.message);
}
// (2) genba と byte 単位で同一（verbatim 移植）
eq(intakeGate, genbaGate, 'intake のゲートブロックが genba と byte 単位で同一');

if (intakeGate) {
  console.log('[intake抽出 gateShouldReload]');
  const { gateShouldReload, buildVersionedUrl } = loadFns(intakeGate);
  eq(gateShouldReload(null, 'B'), true, 'cur=null, latest=B -> reload');
  eq(gateShouldReload('B', 'B'), false, 'cur=B, latest=B -> no reload (loop guard)');
  eq(gateShouldReload('A', 'B'), true, 'cur=A, latest=B -> reload');
  eq(gateShouldReload('A', ''), false, 'latest="" -> no reload (fetch fail safety)');
  eq(gateShouldReload(null, ''), false, 'cur=null, latest="" -> no reload');

  console.log('[intake抽出 buildVersionedUrl]');
  const BASE = 'https://m-higa-sys.github.io/yawaragi-apps/intake.html';
  eq(buildVersionedUrl(BASE, 'B'), BASE + '?v=B', 'no query -> ?v=B');
  eq(buildVersionedUrl(BASE + '?v=A', 'B'), BASE + '?v=B', '?v=A -> ?v=B (swap)');
  eq(buildVersionedUrl(BASE + '?foo=1', 'B'), BASE + '?foo=1&v=B', '?foo=1 -> ?foo=1&v=B (preserve foo)');
}

// (3) shared.js?v= が version.txt と一致する（bump同期の担保・永久ピン留め防止）
console.log('[shared.js 版同期]');
const VERSION = fs.readFileSync(path.join(__dirname, '..', 'version.txt'), 'utf8').trim();
const intakeSharedVer = (INTAKE.match(/shared\.js\?v=([^"']+)/) || [])[1];
eq(intakeSharedVer, VERSION, 'intake.html の shared.js?v= が version.txt と一致');
const genbaSharedVer = (GENBA.match(/shared\.js\?v=([^"']+)/) || [])[1];
eq(genbaSharedVer, VERSION, 'genba.html の shared.js?v= が version.txt と一致（既存担保）');

// bump スクリプトが intake.html を同期対象に含んでいること（含み忘れ＝永久ピン留め）
const BUMP = fs.readFileSync(path.join(__dirname, 'bump-app-version.js'), 'utf8');
const syncBlock = (BUMP.match(/const SYNC_HTMLS\s*=\s*\[([^\]]*)\]/) || [])[1] || '';
eq(/'intake\.html'|"intake\.html"/.test(syncBlock), true,
   'bump-app-version.js の SYNC_HTMLS に intake.html が含まれる');
eq(/'genba\.html'|"genba\.html"/.test(syncBlock), true,
   'bump-app-version.js の SYNC_HTMLS に genba.html が含まれる');

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
