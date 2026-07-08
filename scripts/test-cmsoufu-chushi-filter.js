// test-cmsoufu-chushi-filter.js
// ケアマネ送付チェックリスト.html の「中止者を対象月から落とさない」判定の純関数テスト。
//
// 背景（2026-07-08）:
//   6月末で中止した平野啓二が、中止登録した途端に6月の一覧から消えた。
//   6月は実績送付義務が残るため消えてはいけない。中止者の履歴は全員分残す。
//
// 真因: 対象者の絞り込みが 利用ステータス=中止 で無条件除外していた（日付を見ない）。
//   正: 中止履歴シートA列「最終利用日」で対象月を判定する。中止日・登録日時は使わない
//       （登録が翌月にずれると稼働月から消えるため）。
//
// 判定仕様（対象月 M / M初日 = 'YYYY-MM-01'）:
//   - 稼働中（status が空）      → 常に出す（中止履歴に古い行が残る「再開者」を隠さない）
//   - 中止履歴に行が無い          → 出す（lastUseDate が届かない = ''）
//   - 最終利用日が空欄            → 出す（フェイルセーフ。送付漏れを防ぐ側に倒す）★明示実装
//   - 最終利用日 >= M初日         → 出す
//   - 最終利用日 <  M初日         → 出さない（トグルONで表示）
//
// 方式: 出荷コード（HTML）から純関数を実コード抽出して評価する。
//       テストと出荷コードのドリフトを防ぐ（repo既存テストと同一方式）。
//
// 実行: node scripts/test-cmsoufu-chushi-filter.js

const fs = require('fs');
const path = require('path');

const CM_FILE = 'ケアマネ送付チェックリスト.html';
const CM = fs.readFileSync(path.join(__dirname, '..', CM_FILE), 'utf8');

// 出荷HTMLから純関数を抽出（未移植なら RED）
function extractFn(html, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm');
  const m = html.match(re);
  if (!m) throw new Error(`${CM_FILE} に ${name}() が無い（未移植＝RED）`);
  return m[0];
}

function loadFns() {
  const src = extractFn(CM, 'soufuNormLastUseDate') + '\n' +
              extractFn(CM, 'soufuIsChushiHiddenInMonth') + '\n' +
              'sandbox.soufuNormLastUseDate = soufuNormLastUseDate;' +
              'sandbox.soufuIsChushiHiddenInMonth = soufuIsChushiHiddenInMonth;';
  const sandbox = {};
  (function () { eval(src); })();
  return sandbox;
}

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual)); }
}

let F;
try {
  F = loadFns();
} catch (e) {
  console.log('RED: ' + e.message);
  console.log('RESULT pass=0 fail=1');
  process.exit(1);
}
const { soufuNormLastUseDate: norm, soufuIsChushiHiddenInMonth: hidden } = F;

// ===== soufuNormLastUseDate: 最終利用日の正規化 =====
console.log('[soufuNormLastUseDate]');
eq(norm('2026-06-30'), '2026-06-30', 'ISO日付');
eq(norm('2026-06-30T00:00:00.000Z'), '2026-06-30', 'ISO日時');
eq(norm('2026/6/30'), '2026-06-30', 'スラッシュ区切り（0詰め）');
eq(norm('Tue Jun 30 2026 00:00:00 GMT+0900 (日本標準時)'), '2026-06-30', 'GAS Date文字列');
eq(norm(''), '', '空文字 → 空');
eq(norm('   '), '', '空白のみ → 空');
eq(norm(null), '', 'null → 空');
eq(norm(undefined), '', 'undefined → 空（中止履歴に行が無い）');
eq(norm('不明'), '', '解釈不能 → 空（フェイルセーフ）');

// ===== soufuIsChushiHiddenInMonth: 隠すべきか（true=隠す） =====
console.log('[soufuIsChushiHiddenInMonth]');

// --- 稼働中は常に出す ---
eq(hidden({ status: '', lastUseDate: '' }, '2026-06'), false, '稼働中（status空）は出す');
// 再開者: 中止履歴に古い行が残っていても、稼働中なら隠さない
eq(hidden({ status: '', lastUseDate: '2025-03-31' }, '2026-06'), false, '再開者（status空+古い最終利用日）は出す');

// --- 平野啓二: 最終利用日 2026-06-30 ---
const hirano = { status: '中止', lastUseDate: '2026-06-30' };
eq(hidden(hirano, '2026-06'), false, '平野啓二: 6月は出す（実績送付義務あり）');
eq(hidden(hirano, '2026-07'), true,  '平野啓二: 7月は出さない');
eq(hidden(hirano, '2026-05'), false, '平野啓二: 5月は出す');

// --- 月境界 ---
eq(hidden({ status: '中止', lastUseDate: '2026-06-01' }, '2026-06'), false, '境界: 最終利用日=M初日 は出す');
eq(hidden({ status: '中止', lastUseDate: '2026-05-31' }, '2026-06'), true,  '境界: 最終利用日=M初日の前日 は出さない');
eq(hidden({ status: '中止', lastUseDate: '2026-12-31' }, '2027-01'), true,  '境界: 年跨ぎ 12/31 は翌年1月に出さない');
eq(hidden({ status: '中止', lastUseDate: '2026-12-31' }, '2026-12'), false, '境界: 年跨ぎ 12/31 は12月に出す');

// --- ★要件③: 最終利用日が空欄の中止者は、どの月でも出す（明示実装） ---
eq(hidden({ status: '中止', lastUseDate: '' }, '2026-06'), false, '空欄の中止者: 6月に出す');
eq(hidden({ status: '中止', lastUseDate: '' }, '2027-12'), false, '空欄の中止者: 遠い未来月でも出す');
eq(hidden({ status: '中止', lastUseDate: '' }, '2020-01'), false, '空欄の中止者: 遠い過去月でも出す');
eq(hidden({ status: '中止' }, '2026-07'), false, '中止履歴に行が無い（lastUseDate未定義）→ 出す');
eq(hidden({ status: '中止', lastUseDate: '不明' }, '2026-07'), false, '解釈不能な最終利用日 → 出す');

// --- 終了・卒業も同じ判定（status文字列で分岐しない） ---
eq(hidden({ status: '終了', lastUseDate: '2026-05-31' }, '2026-06'), true,  '終了: 最終利用日で判定される');
eq(hidden({ status: '卒業', lastUseDate: '2026-06-30' }, '2026-06'), false, '卒業: 最終利用日で判定される');

// --- 中止日・登録日時は判定に使わない（最終利用日だけを見る） ---
eq(hidden({ status: '中止', lastUseDate: '2026-06-30', terminateDate: '2026-07-15', timestamp: '2026-07-20' }, '2026-06'),
   false, '中止日/登録日時が翌月でも、最終利用日6/30なら6月に出す');

console.log(`RESULT pass=${pass} fail=${fail}`);
if (fail) process.exit(1);
