// gas_WB設定表.gs の getUsers 中止フィルタ＋saveWBSetting非破壊のユニットテスト
// 実行: node scripts/test-wb-gas-chushi-filter.js
//
// 方針: 実際の .gs をそのまま vm で実行し、SpreadsheetApp/ContentService をモックする。
//       実データ（本番台帳）には一切アクセスしない（openById はモックが握る）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAS_SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'gas_WB設定表.gs'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

// --- モック台帳を差し込んで getUsers/saveWBSetting を実行できる sandbox を作る ---
function makeSandbox(sheetGrid, writeLog) {
  const sheet = {
    getDataRange: function () { return { getValues: function () { return sheetGrid; } }; },
    getRange: function (row, col) {
      return { setValue: function (v) { writeLog.push({ row: row, col: col, value: v }); } };
    }
  };
  const ContentService = {
    MimeType: { JAVASCRIPT: 'js', JSON: 'json' },
    createTextOutput: function (s) { return { _text: s, setMimeType: function () { return this; } }; }
  };
  const SpreadsheetApp = {
    openById: function () { return { getSheetByName: function (n) { return n === '利用者台帳' ? sheet : null; } }; }
  };
  const sandbox = { SpreadsheetApp: SpreadsheetApp, ContentService: ContentService, console: console };
  vm.createContext(sandbox);
  vm.runInContext(GAS_SRC, sandbox);
  return sandbox;
}

// respond() の戻りから JSON を復元（callback付きJSONPをはがす）
function parseResp(out, cb) {
  let s = out._text;
  if (cb) s = s.replace(new RegExp('^' + cb + '\\('), '').replace(/\)$/, '');
  return JSON.parse(s);
}

// 実台帳に寄せたヘッダ（順序は本物どおりでなくてよい。findCol/Partialが名前で解決する）
const HEADER = ['名前', 'カナ', '利用曜日', '午前/午後', 'WB身長', 'WB強さ', 'WBその他', '利用ステータス'];
function row(name, kana, days, ampm, h, st, other, status) {
  return [name, kana, days, ampm, h, st, other, status];
}

console.log('=== gas_WB設定表.gs 中止フィルタ ユニットテスト ===\n');

// ---------- 1. 中止/終了/卒業の除外 ----------
console.log('[1] 中止・終了・卒業の除外（利用者台帳v2/APIと同一基準）');
{
  const grid = [
    HEADER,
    row('現役太郎', 'ゲンエキタロウ', '月,水', '午前', '160', '3', '緑枕', ''),        // 空欄=在籍
    row('中止次郎', 'チュウシジロウ', '火', '午後', '150', '2', '', '中止'),           // 中止→除外
    row('終了三郎', 'シュウリョウサブロウ', '木', '午前', '', '', '', '終了'),          // 終了→除外
    row('卒業四郎', 'ソツギョウシロウ', '金', '午後', '', '', '', '卒業'),              // 卒業→除外
    row('在籍五郎', 'ザイセキゴロウ', '月', '午前', '170', 'BT', '膝枕', '利用中'),      // 「利用中」=在籍
    row('', '', '', '', '', '', '', ''),                                              // 空名→スキップ
    row('休止六郎', 'キュウシロク', '水', '午後', '', '', '', '休止')                    // 休止=除外対象外(基準にない)→残す
  ];
  const sb = makeSandbox(grid, []);
  const j = parseResp(sb.getUsers('cb'), 'cb');
  const names = j.users.map(function (u) { return u.name; });

  ok(j.success === true, 'success:true を返す');
  ok(names.indexOf('中止次郎') < 0, '中止 が除外される');
  ok(names.indexOf('終了三郎') < 0, '終了 が除外される');
  ok(names.indexOf('卒業四郎') < 0, '卒業 が除外される');
  ok(names.indexOf('現役太郎') >= 0, '空欄ステータス（在籍）は残る');
  ok(names.indexOf('在籍五郎') >= 0, '「利用中」は残る');
  ok(names.indexOf('休止六郎') >= 0, '基準外の「休止」は残す（既存2アプリと同一＝発明しない）');
  ok(j.excluded === 3, '除外カウント excluded=3（中止/終了/卒業）');
  ok(j.count === 3, '返却 count=3（現役太郎/在籍五郎/休止六郎のみ）');
  ok(names.indexOf('') < 0, '空名行はスキップされる（従来挙動）');
}

// ---------- 2. WB3列の読み取りが従来通り ----------
console.log('\n[2] WB3列の読み取り（従来挙動の非破壊）');
{
  const grid = [
    HEADER,
    row('現役太郎', 'ゲンエキタロウ', '月', '午前', '160cm', '3', '緑枕,膝枕', '')
  ];
  const sb = makeSandbox(grid, []);
  const j = parseResp(sb.getUsers('cb'), 'cb');
  const u = j.users[0];
  ok(j.hasWBCols === true, 'hasWBCols:true（WB3列そろい検知）');
  ok(u.wbHeight === '160', 'wbHeight は cm を除去して読む（従来通り）');
  ok(u.wbStrength === '3', 'wbStrength を読む');
  ok(u.wbOther === '緑枕,膝枕', 'wbOther を読む');
  ok(u.days === '月' && u.ampm === '午前', 'days/ampm を読む');
}

// ---------- 3. ステータス列が無い台帳でも動く（後方互換） ----------
console.log('\n[3] ステータス列なし台帳（後方互換：全員返す）');
{
  const H2 = ['名前', 'カナ', 'WB身長', 'WB強さ', 'WBその他'];
  const grid = [
    H2,
    ['A太郎', 'エータロウ', '150', '2', ''],
    ['B子', 'ビーコ', '160', '3', '緑枕']
  ];
  const sb = makeSandbox(grid, []);
  const j = parseResp(sb.getUsers('cb'), 'cb');
  ok(j.count === 2, 'ステータス列が無ければ全員返す（誤除外しない）');
  ok(j.excluded === 0, 'excluded=0');
}

// ---------- 4. findColPartial('ステータス') が「利用ステータス」を拾う ----------
console.log('\n[4] 列名解決：findColPartial が「利用ステータス」を拾う');
{
  const grid = [HEADER, row('中止次郎', 'チュウシジロウ', '火', '午後', '', '', '', '中止')];
  const sb = makeSandbox(grid, []);
  const j = parseResp(sb.getUsers('cb'), 'cb');
  ok(j.excluded === 1 && j.count === 0, '「利用ステータス」列を部分一致で解決し中止1名を除外');
}

// ---------- 5. saveWBSetting は中止フィルタと無関係に従来通り書く ----------
console.log('\n[5] saveWBSetting の非破壊（WB3列書き込み）');
{
  const grid = [
    HEADER,
    row('現役太郎', 'ゲンエキタロウ', '月', '午前', '', '', '', ''),
    row('中止次郎', 'チュウシジロウ', '火', '午後', '', '', '', '中止')
  ];
  // 在籍者への保存
  const w1 = [];
  const sb1 = makeSandbox(grid, w1);
  const r1 = parseResp(sb1.saveWBSetting({ name: '現役太郎', wbHeight: '165', wbStrength: '4', wbOther: '緑枕' }, 'cb'), 'cb');
  ok(r1.success === true, '在籍者への保存が成功する');
  ok(w1.length === 3, 'WB3列に setValue が3回走る');
  ok(w1.some(function (x) { return x.value === '165'; }), 'wbHeight=165 が書かれる');

  // 中止者への保存も従来通り可能（saveは名前一致のみ判定＝フィルタで壊さない）
  const w2 = [];
  const sb2 = makeSandbox(grid, w2);
  const r2 = parseResp(sb2.saveWBSetting({ name: '中止次郎', wbHeight: '150', wbStrength: '2', wbOther: '' }, 'cb'), 'cb');
  ok(r2.success === true, '中止者への保存も従来通り成功する（save側は中止フィルタ非適用＝挙動不変）');
  ok(w2.length === 3, '中止者でも WB3列に書ける（既存挙動を壊していない）');
}

console.log('\n================================');
console.log('PASS: ' + pass + ' / FAIL: ' + fail);
console.log('================================');
process.exit(fail === 0 ? 0 : 1);
