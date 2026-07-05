// test-schedule-version-gate.js
// schedule.html のキャッシュ自動更新バージョンゲート横展開テスト（design.md §7 準拠）
//
// 方式：genba.html を正本とし、schedule.html の <head> 最先頭ゲートが
//   (1) genba のゲート <script> ブロックと byte 単位で同一（verbatim 移植）
//   (2) 抽出した純関数 gateShouldReload / buildVersionedUrl が genba と同一挙動
// であることを実コード抽出で検証する（出荷コードとテストのドリフト防止）。
//
// 実行: node scripts/test-schedule-version-gate.js

const fs = require('fs');
const path = require('path');

const GENBA = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');
const SCHED = fs.readFileSync(path.join(__dirname, '..', 'schedule.html'), 'utf8');

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
// (1) schedule.html にゲートブロックが存在する（未移植なら extractGate が throw）
let schedGate = null;
try {
  schedGate = extractGate(SCHED, 'schedule.html');
  pass++; console.log('  PASS schedule.html にゲート <script> ブロックが存在する');
} catch (e) {
  fail++; console.log('  FAIL ' + e.message);
}
// (2) genba と byte 単位で同一（verbatim 移植）
eq(schedGate, genbaGate, 'schedule のゲートブロックが genba と byte 単位で同一');

if (schedGate) {
  console.log('[schedule抽出 gateShouldReload]');
  const { gateShouldReload, buildVersionedUrl } = loadFns(schedGate);
  eq(gateShouldReload(null, 'B'), true, 'cur=null, latest=B -> reload');
  eq(gateShouldReload('B', 'B'), false, 'cur=B, latest=B -> no reload (loop guard)');
  eq(gateShouldReload('A', 'B'), true, 'cur=A, latest=B -> reload');
  eq(gateShouldReload('A', ''), false, 'latest="" -> no reload (fetch fail safety)');
  eq(gateShouldReload(null, ''), false, 'cur=null, latest="" -> no reload');

  console.log('[schedule抽出 buildVersionedUrl]');
  const BASE = 'https://m-higa-sys.github.io/yawaragi-apps/schedule.html';
  eq(buildVersionedUrl(BASE, 'B'), BASE + '?v=B', 'no query -> ?v=B');
  eq(buildVersionedUrl(BASE + '?v=A', 'B'), BASE + '?v=B', '?v=A -> ?v=B (swap)');
  eq(buildVersionedUrl(BASE + '?foo=1', 'B'), BASE + '?foo=1&v=B', '?foo=1 -> ?foo=1&v=B (preserve foo)');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
