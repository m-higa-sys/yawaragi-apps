// test-users-api-default-unchanged.js
// USERS_API の「既定（パラメータ無し）応答は1バイトも変えない」を、デプロイ前に差分で証明する。
//
// 方式: 本番と sha256 一致で取り込んだ旧 コード.gs（git の取り込みコミット）と、
//       改修後の コード.gs を、同一のスタブ環境・同一の入力データで doGet させ、
//       返る JSON 文字列を byte 比較する。
//
//   旧ソース = git show <BASE_COMMIT>:gas/riyousha-daichou-api/コード.gs
//   （BASE_COMMIT は本番実体を無改変で取り込んだコミット）
//
// これで「既定は非改変」が実コード同士の比較で担保される（自己申告ではない）。
// 実データ側の最終確認はデプロイ後に本番応答と baseline-before.json を突合する。
//
// 実行: node scripts/test-users-api-default-unchanged.js

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const GAS_REL = 'gas/riyousha-daichou-api/コード.gs';
const BASE_COMMIT = 'f6df131'; // 本番実体を無改変で取り込んだコミット

const NEW_SRC = fs.readFileSync(path.join(REPO, 'gas', 'riyousha-daichou-api', 'コード.gs'), 'utf8');
const OLD_SRC = execFileSync('git', ['-c', 'core.quotepath=false', 'show', `${BASE_COMMIT}:${GAS_REL}`],
  { cwd: REPO, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

// ---- 実データに寄せた台帳（列名は本番ヘッダの候補に合わせる） ----
const LEDGER = [
  ['氏名', '氏名（カナ）', '介護度', '利用ステータス', '利用曜日', '午前/午後', '計画書開始月', '利用開始日', 'ケアマネ事業所名', 'ケアマネ担当者名'],
  ['荒谷宗親', 'アラタニ ムネチカ', '要支援1', '',     '火木', '午前', '', '', 'わかばの丘地域包括支援センター', '中里　礼子'],
  ['平野啓二', 'ヒラノ ケイジ',     '要支援1', '中止', '月水', '午前', '2026-04', '', 'わかばの丘地域包括支援センター', '中里　礼子'],
  ['空欄太郎', 'クウランタロウ',     '要介護2', '中止', '金',   '午後', '', '', 'テスト居宅', '担当A'],
  ['卒業花子', 'ソツギョウハナコ',   '要介護1', '卒業', '火',   '午前', '', '', 'テスト居宅', '担当A'],
  ['終了次郎', 'シュウリョウジロウ', '要介護3', '終了', '水',   '午後', '', '', 'テスト居宅', '担当B'],
  ['再開三郎', 'サイカイサブロウ',   '要介護1', '',     '木',   '午前', '', '', 'テスト居宅', '担当B'], // 中止履歴に古い行が残る
  ['', '', '', '', '', '', '', '', '', ''],  // 空行
];

const CHUSHI = [
  ['最終利用日', '中止日', '連絡日', '利用者名', '理由'],
  ['2026-06-30', '2026-06-30', '2026-07-01', '平野啓二', '本人意思'],
  ['',           '',           '2026-05-01', '空欄太郎', ''],          // ★最終利用日 空欄
  ['2025-03-31', '2025-03-31', '',           '再開三郎', '転居'],      // 再開者の古い行
  ['2024-01-31', '2024-01-31', '',           '退所済子', ''],          // 台帳に居ない
  ['2026-06-30', '2026-06-30', '',           '卒業花子', ''],
];

// ---- GAS ランタイムのスタブ ----
function makeSandbox(sheets) {
  const captured = {};
  const sandbox = {
    SpreadsheetApp: {
      openById() {
        return {
          getSheetByName(n) {
            if (!sheets[n]) return null;
            return { getDataRange: () => ({ getValues: () => sheets[n] }), getLastRow: () => sheets[n].length };
          }
        };
      }
    },
    ContentService: {
      MimeType: { JSON: 'json', JAVASCRIPT: 'js' },
      createTextOutput(text) { captured.text = text; return { setMimeType() { return this; } }; }
    },
    Utilities: {
      formatDate(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      }
    },
    captured
  };
  return sandbox;
}

function runDoGet(src, params, sheets) {
  const sandbox = makeSandbox(sheets);
  const fn = new Function('SpreadsheetApp', 'ContentService', 'Utilities', 'captured',
    src + '\nreturn doGet({ parameter: ' + JSON.stringify(params) + ' });');
  fn(sandbox.SpreadsheetApp, sandbox.ContentService, sandbox.Utilities, sandbox.captured);
  return sandbox.captured.text;
}

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n    expected=' + b + '\n    actual  =' + a); }
}
function ok(cond, label) { eq(!!cond, true, label); }

const SHEETS = { '利用者台帳': LEDGER, '中止履歴': CHUSHI };

// ===== ①既定応答: 旧ソースと新ソースで byte 一致 =====
console.log('[既定応答の不変（旧 vs 新）]');
const oldDefault = runDoGet(OLD_SRC, {}, SHEETS);
const newDefault = runDoGet(NEW_SRC, {}, SHEETS);
eq(newDefault, oldDefault, 'パラメータ無し: 応答文字列が旧と完全一致');

const oldCb = runDoGet(OLD_SRC, { callback: 'cb' }, SHEETS);
const newCb = runDoGet(NEW_SRC, { callback: 'cb' }, SHEETS);
eq(newCb, oldCb, 'JSONP(callback=cb): 応答文字列が旧と完全一致');

// includeEnded=0 や他の値は既定扱い（オプトインは '1' のみ）
eq(runDoGet(NEW_SRC, { includeEnded: '0' }, SHEETS), oldDefault, "includeEnded=0 は既定と一致");
eq(runDoGet(NEW_SRC, { includeEnded: 'true' }, SHEETS), oldDefault, "includeEnded=true は既定と一致（'1'のみ有効）");

// 既定応答は users 以外のキーを持たない
const dflt = JSON.parse(newDefault);
eq(Object.keys(dflt), ['users'], '既定応答のトップレベルキーは users のみ');
eq(Object.keys(dflt.users[0]), ['name', 'kana', 'care', 'days', 'ampm', 'planStart', 'startDate', 'cmOffice', 'cmName'],
  '既定応答の user キーは9個（cmName 含む）');
eq(dflt.users.map(u => u.name), ['荒谷宗親', '再開三郎'], '既定応答は稼働中のみ（中止/終了/卒業を除外）・カナ順');

// ===== ②includeEnded=1: 中止者が status と lastUseDate 付きで返る =====
console.log('[includeEnded=1]');
const inc = JSON.parse(runDoGet(NEW_SRC, { includeEnded: '1' }, SHEETS));
const byName = {};
inc.users.forEach(u => { byName[u.name] = u; });

eq(inc.users.length, 6, '中止/終了/卒業を含めて6人返る');
ok(byName['平野啓二'], '平野啓二 が含まれる');
eq(byName['平野啓二'].status, '中止', '平野啓二 の status=中止');
eq(byName['平野啓二'].lastUseDate, '2026-06-30', '平野啓二 の lastUseDate=2026-06-30');
eq(byName['平野啓二'].hasChushiRow, true, '平野啓二 は中止履歴に行あり');

eq(byName['空欄太郎'].lastUseDate, '', '空欄の中止者は lastUseDate=""（行は存在）');
eq(byName['空欄太郎'].hasChushiRow, true, '空欄の中止者も hasChushiRow=true');

eq(byName['終了次郎'].lastUseDate, '', '中止履歴に行が無い終了者は lastUseDate=""');
eq(byName['終了次郎'].hasChushiRow, false, '中止履歴に行が無い → hasChushiRow=false');

eq(byName['再開三郎'].status, '', '再開者の status は空（稼働中）');
eq(byName['再開三郎'].lastUseDate, '2025-03-31', '再開者にも古い lastUseDate は付く（隠すか否かはフロントの判断）');

// 既定の9キーは順序も含めて保持し、追加3キーのみ増える
eq(Object.keys(byName['平野啓二']),
  ['name', 'kana', 'care', 'days', 'ampm', 'planStart', 'startDate', 'cmOffice', 'cmName', 'status', 'hasChushiRow', 'lastUseDate'],
  'includeEnded 時のキーは既定9キー + status/hasChushiRow/lastUseDate');

// ===== ③診断: 未マッチ・重複・status分布を黙って落とさない =====
console.log('[診断]');
eq(inc.chushi.headerOk, true, 'chushi.headerOk=true');
eq(inc.chushi.totalRows, 5, 'chushi.totalRows=5（空欄行も数える）');
eq(inc.chushi.unmatched, ['退所済子'], '台帳に居ない中止履歴行を全件報告');
eq(inc.chushi.duplicates, [], '重複なし');
eq(inc.chushi.statusCounts, { '': 2, '中止': 2, '卒業': 1, '終了': 1 }, 'status 値の分布を報告');

// 中止履歴シートが無い場合も既定は壊れない
console.log('[中止履歴シート欠落時]');
const noChushi = { '利用者台帳': LEDGER };
eq(runDoGet(NEW_SRC, {}, noChushi), runDoGet(OLD_SRC, {}, noChushi), '中止履歴なし: 既定応答は旧と一致');
const incNo = JSON.parse(runDoGet(NEW_SRC, { includeEnded: '1' }, noChushi));
eq(incNo.chushi.headerOk, false, '中止履歴なし: headerOk=false で通知');
eq(incNo.users.length, 6, '中止履歴なし: 中止者は lastUseDate="" で全員返る（隠さない）');
eq(incNo.users.every(u => u.lastUseDate === ''), true, '中止履歴なし: 全員 lastUseDate=""');

console.log(`RESULT pass=${pass} fail=${fail}`);
if (fail) process.exit(1);
