// 中止者オプトイン（includeCancelled）の追加テスト（2026-08-03）
//   対象: gas/yawaragi-board/コード.js
//     1. getMonitoringTargetUsers_ … 末尾オプション引数を追加。実コードを抽出しGASをスタブして実行
//     2. getOralPlans / getMonitoringYear の doGet ハンドラ … 抽出できないので静的検査で
//        「既定応答にキーを足していない」ことを担保する
// 完了条件「パラメータ無しの応答が現状とバイト一致」を、キー構成の不変で機械的に守る。
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? ('  → ' + extra) : '')); }
}
function grab(name) {
  const m = SRC.match(new RegExp('function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm'));
  if (!m) { console.error('FAIL: 関数を抽出できません: ' + name); process.exit(1); }
  return m[0];
}

// ---------------------------------------------------------------
// [1] getMonitoringTargetUsers_ を実コードから抽出して実行
// ---------------------------------------------------------------
console.log('[1] getMonitoringTargetUsers_（実コード実行）');

// 台帳（要支援/事業対象＝モニタリング対象、要介護＝対象外）
const LEDGER = [
  ['名前', 'フリガナ', '要介護度', '利用曜日', '午前/午後', 'ケアマネ事業所名', 'ケアマネ担当者名', '利用ステータス'],
  ['現役支援', 'ゲンエキシエン', '要支援２', '火木', '午前', 'わかばの丘', '中里', ''],
  ['事業対象者A', 'ジギョウタイショウА', '事業対象者', '水', '午前', '包括', '田畑', ''],
  ['中止支援', 'チュウシシエン', '要支援１', '月', '午後', 'ひなぎく', '千葉', '中止'],
  ['終了支援', 'シュウリョウシエン', '要支援２', '金', '午前', 'なごみ', '大村', '終了'],
  ['卒業支援', 'ソツギョウシエン', '要支援１', '木', '午後', '花彩', '木村', '卒業'],
  ['要介護の人', 'ヨウカイゴノヒト', '要介護３', '水', '午前', 'わかばの丘', '中里', ''],
];
const CONFIG = [
  ['userId', 'planStart', 'finalEvalMonth'],
  ['現役支援', '2026-04', '2027-03'],
  ['中止支援', '2026-05', '2027-04'],
];
const sheetOf = (v) => ({ getDataRange: () => ({ getValues: () => v }) });

const ctx = {
  SS_ID: 'dummy',
  SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheetOf(LEDGER) }) },
  ensureMonitoringConfigSheet_: () => sheetOf(CONFIG),
  Utilities: { formatDate: () => '' },
};
const src1 = grab('findCol') + '\n' + grab('findColP') + '\n' + grab('getMonitoringTargetUsers_');
const runner = new Function(
  'SS_ID', 'SpreadsheetApp', 'ensureMonitoringConfigSheet_', 'Utilities',
  src1 + '\nreturn getMonitoringTargetUsers_;');
const getMonitoringTargetUsers_ = runner(
  ctx.SS_ID, ctx.SpreadsheetApp, ctx.ensureMonitoringConfigSheet_, ctx.Utilities);

const before = getMonitoringTargetUsers_();          // 既存の呼び方（引数なし）
const withCancelled = getMonitoringTargetUsers_(true);

ok(before.length === 2, '既定: 中止/終了/卒業を除外し2名', JSON.stringify(before.map(u => u.userId)));
ok(before.every(u => !('cancelled' in u)), '既定: cancelled キーを1つも足さない',
  JSON.stringify(Object.keys(before[0] || {})));
ok(!before.some(u => u.userId === '要介護の人'), '要介護は元から対象外（挙動不変）');

ok(withCancelled.length === 5, '=1: 中止・終了・卒業も含め5名',
  JSON.stringify(withCancelled.map(u => u.userId)));
ok(withCancelled.every(u => 'cancelled' in u), '=1: 全要素に cancelled が付く');
ok(withCancelled.find(u => u.userId === '中止支援').cancelled === true, '=1: 中止者は cancelled=true');
ok(withCancelled.find(u => u.userId === '終了支援').cancelled === true, '=1: 終了者も cancelled=true');
ok(withCancelled.find(u => u.userId === '卒業支援').cancelled === true, '=1: 卒業者も cancelled=true');
ok(withCancelled.find(u => u.userId === '現役支援').cancelled === false, '=1: 現役は cancelled=false');

// 既定応答のスナップショット一致（cancelled を除いた中身が完全同一）
const strip = (arr) => JSON.stringify(arr.map((u) => { const c = Object.assign({}, u); delete c.cancelled; return c; }));
ok(strip(before) === strip(withCancelled.filter(u => !u.cancelled)),
  '既定の2名は =1 のときも中身が完全一致（cancelled 以外）');

// falsy 引数は既定と同一（既存呼び出し互換）
ok(JSON.stringify(getMonitoringTargetUsers_(false)) === JSON.stringify(before), 'false は既定と完全一致');
ok(JSON.stringify(getMonitoringTargetUsers_(undefined)) === JSON.stringify(before), 'undefined は既定と完全一致');

// ---------------------------------------------------------------
// [2] doGet ハンドラの静的検査（既定応答にキーを足していないこと）
// ---------------------------------------------------------------
console.log('[2] doGet ハンドラ（静的検査）');

function block(startMarker) {
  const i = SRC.indexOf(startMarker);
  if (i < 0) { console.error('FAIL: ブロックが見つかりません: ' + startMarker); process.exit(1); }
  return SRC.slice(i, i + 4000);
}

const oral = block("if (action === 'getOralPlans')");
ok(/goIncludeCancelled\s*=\s*!!\(e && e\.parameter && \(e\.parameter\.includeCancelled === '1' \|\| e\.parameter\.includeCancelled === 'true'\)\)/.test(oral),
  'oral: includeCancelled を 1/true で受け取る');
ok(/getOralTargetUsers_\(goIncludeCancelled\)/.test(oral), 'oral: フラグをヘルパーに渡している');
ok(/if \(goIncludeCancelled\) goRow\.cancelled/.test(oral), 'oral: plans の cancelled はフラグ時のみ');
ok(/if \(goIncludeCancelled\) goUnsentRow\.cancelled/.test(oral), 'oral: unsent の cancelled はフラグ時のみ');
ok(!/cancelled:/.test(oral.split('return respond')[0].replace(/if \(goIncludeCancelled\)[^\n]*\n/g, '')),
  'oral: 無条件に cancelled を積む箇所が無い');

const moni = block("if (action === 'getMonitoringYear')");
ok(/monIncludeCancelled\s*=\s*!!\(e && e\.parameter && \(e\.parameter\.includeCancelled === '1' \|\| e\.parameter\.includeCancelled === 'true'\)\)/.test(moni),
  'moni: includeCancelled を 1/true で受け取る');
ok(/getMonitoringTargetUsers_\(monIncludeCancelled\)/.test(moni), 'moni: フラグをヘルパーに渡している');

// getKeikakushoYear は既存実装のまま（改修不要の確認）
const kk = block("if (action === 'getKeikakushoYear')");
ok(/getKeikakushoTargetUsers_\(kkIncludeCancelled\)/.test(kk), 'keikakusho: 既存の includeCancelled が健在（無改修）');

// ---------------------------------------------------------------
// [3] 既存呼び出しの互換（引数を足したことで壊していないか）
// ---------------------------------------------------------------
console.log('[3] 既存呼び出しの互換');
const monCalls = SRC.match(/getMonitoringTargetUsers_\([^)]*\)/g)
  .filter(s => !/^getMonitoringTargetUsers_\(includeCancelled\)$/.test(s));
// この番人が守るのは「既存の呼び出しがうっかり真値を渡し始めていないこと」。
// 2026-08-05 追加: soufuGatherCloseUsers_（月末締めスナップショット）は、母集団ルール
//   「非中止の全員＋中止者のうち対象月に利用実績1日以上」を判定するために
//   意図して中止者ごと取得する。よって getMonitoringTargetUsers_(true) を明示的に許可する。
//   ※これを許可しても既定（引数なし）の応答は1バイトも変わらない（上の [1] で担保済み）。
const badMon = monCalls.filter(s => s !== 'getMonitoringTargetUsers_()'
  && s !== 'getMonitoringTargetUsers_(monIncludeCancelled)'
  && s !== 'getMonitoringTargetUsers_(true)');
ok(badMon.length === 0, 'getMonitoringTargetUsers_ の呼び出しは 引数なし か monIncludeCancelled のみ', JSON.stringify(badMon));

console.log('\nPASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
