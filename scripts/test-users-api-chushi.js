// test-users-api-chushi.js
// USERS_API（gas/riyousha-daichou-api/コード.gs）の中止履歴突合ロジックの純関数テスト。
//
// 対象は「利用者データ取得（健康管理）」プロジェクト（scriptId 1YpEB…／deploy AKfycbxPtSah… @6）。
// gas/gas_利用者台帳_v2.gs は別プロジェクト（利用者台帳API）なので対象外。
//
// 仕様:
//   - 既定（includeEnded なし）: 応答は1バイトも変えない（この責務は doGet 側／別途実測で検証）
//   - ?includeEnded=1 のとき、中止履歴シート（同一スプレッドシート）を直読し
//     各ユーザに status と lastUseDate を付ける。
//   - 突合キーは「利用者名」の完全一致（台帳に「伊藤フミ子」「伊藤ふみ子」等の別人が実在するため）。
//   - 最終利用日が空欄の行は '' として保持する（黙って捨てない＝要件③の明示実装）。
//   - 同名で複数行（中止→再開→再中止）は「最も新しい最終利用日」を採用する。
//   - 未マッチ行・重複行は診断として全件返す（黙って落とさない）。
//
// 方式: 出荷GASソースから純関数を実コード抽出して評価（実装とテストのドリフト防止）。
// 実行: node scripts/test-users-api-chushi.js

const fs = require('fs');
const path = require('path');

const GAS_FILE = path.join(__dirname, '..', 'gas', 'riyousha-daichou-api', 'コード.gs');
const GAS = fs.readFileSync(GAS_FILE, 'utf8');

function extractFn(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm');
  const m = src.match(re);
  if (!m) throw new Error(`コード.gs に ${name}() が無い（未実装＝RED）`);
  return m[0];
}

function loadFns() {
  const names = ['normLastUseDate', 'buildChushiIndex', 'diagnoseChushi'];
  const src = names.map(n => extractFn(GAS, n)).join('\n') + '\n' +
    names.map(n => `sandbox.${n} = ${n};`).join('');
  const sandbox = {};
  (function () { eval(src); })();
  return sandbox;
}

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: expected=' + b + ' actual=' + a); }
}

let F;
try {
  F = loadFns();
} catch (e) {
  console.log('RED: ' + e.message);
  console.log('RESULT pass=0 fail=1');
  process.exit(1);
}
const { normLastUseDate: norm, buildChushiIndex: build, diagnoseChushi: diag } = F;

// ===== normLastUseDate =====
console.log('[normLastUseDate]');
eq(norm('2026-06-30'), '2026-06-30', 'ISO文字列');
eq(norm(new Date(2026, 5, 30)), '2026-06-30', 'Dateオブジェクト（シート日付セル）');
eq(norm(new Date(2026, 0, 5)), '2026-01-05', 'Dateオブジェクト 0詰め');
eq(norm('2026/6/30'), '2026-06-30', 'スラッシュ区切り');
eq(norm(''), '', '空欄 → 空');
eq(norm(null), '', 'null → 空');
eq(norm('   '), '', '空白のみ → 空');
eq(norm('不明'), '', '解釈不能 → 空');

// ===== buildChushiIndex =====
// values は getDataRange().getValues() 相当（ヘッダ行込み）
console.log('[buildChushiIndex]');
const HEADER = ['最終利用日', '中止日', '連絡日', '利用者名', '理由'];

eq(build([HEADER]).totalRows, 0, 'データ行なし → totalRows=0');

const basic = build([
  HEADER,
  ['2026-06-30', '2026-06-30', '2026-07-01', '平野啓二', '本人意思'],
  ['2026-07-07', '2026-07-07', '2026-07-03', '松本美智子', '家族都合'],
]);
eq(basic.map['平野啓二'], '2026-06-30', '平野啓二 の最終利用日を引ける');
eq(basic.map['松本美智子'], '2026-07-07', '松本美智子 の最終利用日を引ける');
eq(basic.totalRows, 2, 'totalRows=2');
eq(basic.duplicates, [], '重複なし');

// ★要件③: 空欄行を捨てず '' として保持（board の if(!lastUseDate) continue; と違う）
const withEmpty = build([
  HEADER,
  ['', '', '2026-05-01', '空欄太郎', ''],
  ['2026-06-30', '2026-06-30', '2026-07-01', '平野啓二', ''],
]);
eq(Object.prototype.hasOwnProperty.call(withEmpty.map, '空欄太郎'), true, '最終利用日が空欄でも行として保持する');
eq(withEmpty.map['空欄太郎'], '', '空欄は空文字で返る（捨てない）');
eq(withEmpty.totalRows, 2, '空欄行も totalRows に数える');

// 名前が空の行は無視
eq(build([HEADER, ['2026-06-30', '', '', '', '']]).totalRows, 0, '利用者名が空の行は数えない');

// 同名複数行 → 最も新しい最終利用日を採用
const dup = build([
  HEADER,
  ['2025-03-31', '2025-03-31', '', '再開次郎', '転居'],
  ['2026-06-30', '2026-06-30', '', '再開次郎', '本人意思'],
]);
eq(dup.map['再開次郎'], '2026-06-30', '同名複数行 → 最新の最終利用日を採用');
eq(dup.duplicates, [{ name: '再開次郎', count: 2 }], '重複を診断として報告');

// 同名で「日付あり + 空欄」 → 日付ありを採用（空欄に負けない）
const dupEmpty = build([
  HEADER,
  ['', '', '', '混在花子', ''],
  ['2026-06-30', '', '', '混在花子', ''],
]);
eq(dupEmpty.map['混在花子'], '2026-06-30', '同名「空欄+日付あり」→ 日付ありを採用');

// 全部空欄なら ''
const dupAllEmpty = build([HEADER, ['', '', '', '全空三郎', ''], ['', '', '', '全空三郎', '']]);
eq(dupAllEmpty.map['全空三郎'], '', '同名で全て空欄 → 空文字');

// 前後空白は trim して突合（台帳側と揃える）
eq(build([HEADER, ['2026-06-30', '', '', ' 平野啓二 ', '']]).map['平野啓二'], '2026-06-30', '利用者名の前後空白を trim');

// 列順は名前で探す（列が動いても壊れない）
const swapped = build([
  ['利用者名', '理由', '最終利用日'],
  ['平野啓二', '本人意思', '2026-06-30'],
]);
eq(swapped.map['平野啓二'], '2026-06-30', 'ヘッダ名で列を探す（列順非依存）');

// 必須ヘッダが無い → headerOk=false（黙って空を返さない）
eq(build([['なんか', 'ちがう'], ['a', 'b']]).headerOk, false, '必須ヘッダ欠落を headerOk=false で通知');
eq(build([HEADER]).headerOk, true, '必須ヘッダあり → headerOk=true');

// ===== diagnoseChushi: 未マッチ/重複を全件報告 =====
console.log('[diagnoseChushi]');
const idx = build([
  HEADER,
  ['2026-06-30', '', '', '平野啓二', ''],
  ['2025-01-01', '', '', '退所済子', ''],   // 台帳に居ない
  ['2025-03-31', '', '', '再開次郎', ''],
  ['2026-06-30', '', '', '再開次郎', ''],
]);
const ledger = ['平野啓二', '再開次郎', '伊藤フミ子', '伊藤ふみ子'];
const d = diag(idx, ledger);
eq(d.unmatched, ['退所済子'], '台帳に居ない中止履歴行を全件報告');
eq(d.duplicates, [{ name: '再開次郎', count: 2 }], '同名複数行を全件報告');

// 別人の類似名は完全一致なので混ざらない
const idx2 = build([HEADER, ['2026-06-30', '', '', '伊藤ふみ子', '']]);
const d2 = diag(idx2, ['伊藤フミ子', '伊藤ふみ子']);
eq(d2.unmatched, [], '「伊藤ふみ子」は完全一致で解決（未マッチ0）');
eq(idx2.map['伊藤フミ子'], undefined, '「伊藤フミ子」（別人）には波及しない');

console.log(`RESULT pass=${pass} fail=${fail}`);
if (fail) process.exit(1);
