// 通所計画書（getTsushoPlans）の中止者オプトイン includeCancelled テスト（2026-08-03）
//   対象: gas/yawaragi-board/コード.js
//     1. getTsushoTargetUsers_ … 既にオプション引数を持つ。挙動を固定して退行を防ぐ（ガード）
//     2. getTsushoPlans の doGet ハンドラ … 抽出できないので静的検査で
//        「includeCancelled を受け取り、ユーザーリストへ渡し、cancelled はオプトイン時のみ付ける」
//        ＝既定応答のキー構成を1つも変えないことを機械的に担保する
//
// 背景: 応答行は「通所計画書記録シート」由来なので中止者の行が落ちるわけではないが、
//       ユーザーリストが中止者を含まないため cmOffice / userName の付加が効かず、
//       中止者の行だけ事業所名が空になる。フラグも無いので中止者を判別できない。
//
// 実行: node scripts/test-tsusho-include-cancelled.js
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
// [1] getTsushoTargetUsers_（実コード実行・退行ガード）
// ---------------------------------------------------------------
console.log('[1] getTsushoTargetUsers_（実コード実行）');

const LEDGER = [
  ['名前', 'フリガナ', '要介護度', 'ケアマネ事業所名', '利用ステータス'],
  ['現役介護', 'ゲンエキカイゴ', '要介護３', 'わかばの丘', ''],
  ['現役支援', 'ゲンエキシエン', '要支援２', 'ひなぎく', ''],
  ['中止介護', 'チュウシカイゴ', '要介護２', 'なごみ', '中止'],
  ['終了支援', 'シュウリョウシエン', '要支援１', '花彩', '終了'],
  ['卒業介護', 'ソツギョウカイゴ', '要介護１', '包括', '卒業'],
  ['事業対象の人', 'ジギョウタイショウ', '事業対象者', 'わかばの丘', ''],
];
const CONFIG = [['userId', 'cycleMonths'], ['現役介護', 6]];
const sheetOf = (v) => ({ getDataRange: () => ({ getValues: () => v }) });

const src1 = grab('findCol') + '\n' + grab('findColP') + '\n' + grab('findColContains') + '\n'
           + grab('_normalizeUserName') + '\n' + grab('getTsushoTargetUsers_');
const runner = new Function(
  'SS_ID', 'SpreadsheetApp', 'ensureTsushoPlansSheets_',
  src1 + '\nreturn getTsushoTargetUsers_;');
const getTsushoTargetUsers_ = runner(
  'dummy',
  { openById: () => ({ getSheetByName: () => sheetOf(LEDGER) }) },
  () => ({ configSheet: sheetOf(CONFIG) }));

const before = getTsushoTargetUsers_();            // 既存の呼び方（引数なし）
const after = getTsushoTargetUsers_(true);         // オプトイン
const names = (a) => a.map(u => u.userId).sort();

ok(JSON.stringify(names(before)) === JSON.stringify(['現役介護', '現役支援']),
  '既定: 中止・終了・卒業を除外し2名', JSON.stringify(names(before)));
ok(before.every(u => u.cancelled === false), '既定: 現役は cancelled=false');
ok(!names(before).includes('事業対象の人'), '事業対象は元から対象外（挙動不変）');

ok(JSON.stringify(names(after)) === JSON.stringify(['中止介護', '卒業介護', '現役介護', '現役支援', '終了支援'].sort()),
  '=true: 中止・終了・卒業も含め5名', JSON.stringify(names(after)));
ok(after.filter(u => u.cancelled === true).length === 3, '=true: 中止・終了・卒業の3名が cancelled=true');
ok(after.find(u => u.userId === '中止介護').cmOffice === 'なごみ',
  '=true: 中止者の cmOffice が取れる（これが今回の実害の解消点）');

// 既定で返る2名の中身は、オプトインしても完全一致（余計な変化を入れていない）
const pick = (a, id) => JSON.stringify(a.find(u => u.userId === id));
ok(pick(before, '現役介護') === pick(after, '現役介護'), '既定の利用者は =true でも中身が完全一致');

// ---------------------------------------------------------------
// [2] getTsushoPlans ハンドラ（静的検査）
// ---------------------------------------------------------------
console.log('[2] getTsushoPlans ハンドラ（静的検査）');

const hIdx = SRC.indexOf("if (action === 'getTsushoPlans')");
ok(hIdx >= 0, 'getTsushoPlans ハンドラが存在する');
// ハンドラ本体（次のアクション判定までを対象にする）
const hEnd = SRC.indexOf("if (action ===", hIdx + 40);
const H = SRC.slice(hIdx, hEnd > 0 ? hEnd : hIdx + 4000);

ok(/e\.parameter\.includeCancelled\s*===\s*'1'/.test(H) && /e\.parameter\.includeCancelled\s*===\s*'true'/.test(H),
  'includeCancelled を 1/true の両方で受け取る');
ok(/getTsushoTargetUsers_\(\s*gpIncludeCancelled\s*\)/.test(H),
  'フラグを getTsushoTargetUsers_ に渡している');
ok(!/getTsushoTargetUsers_\(\s*\)/.test(H),
  '引数なし呼び出しが残っていない（渡し忘れの検出）');

// ★既定応答のキーを増やさない: cancelled の代入は必ずフラグの if を伴う
const cancelledAssigns = H.match(/\.cancelled\s*=/g) || [];
ok(cancelledAssigns.length === 2, 'cancelled の代入は plans / unsent の2箇所', '実際=' + cancelledAssigns.length);
ok((H.match(/if\s*\(\s*gpIncludeCancelled\s*\)\s*\w+\.cancelled\s*=/g) || []).length === 2,
  'cancelled はどちらもフラグ時のみ付与（既定はキーを1つも増やさない）');
ok(!/cancelled:\s*/.test(H),
  'オブジェクトリテラルに cancelled を直接書いていない（＝無条件付与が無い）');

// 他のアクションを壊していないこと（口腔・モニの実装が健在）
ok(/goIncludeCancelled/.test(SRC), '口腔の includeCancelled が健在');
ok(/monIncludeCancelled/.test(SRC), '通所モニの includeCancelled が健在');
ok(/kkIncludeCancelled/.test(SRC), '個訓計画書の includeCancelled が健在');

console.log(`\nPASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
