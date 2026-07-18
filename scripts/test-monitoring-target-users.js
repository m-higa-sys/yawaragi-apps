// test-monitoring-target-users.js
// getMonitoringTargetUsers_（通所介護計画モニタリングの母集団）の対象者フィルタ検証。
//
// ★このテストは「二重持ち」ではない。gas/yawaragi-board/コード.js を実際に読み込み、
//   本物の getMonitoringTargetUsers_ を SpreadsheetApp スタブ越しに呼ぶ。
//   純関数をテスト側へ写すと、本体を直さなくても緑になり事故を見逃すため。
//
// 実行: node scripts/test-monitoring-target-users.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');

// ===== 極小テストハーネス =====
var pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ok   ' + msg); }
  else { fail++; console.log('  FAIL ' + msg); }
}
function eq(actual, expected, msg) {
  var a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; console.log('  ok   ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + '\n         期待: ' + b + '\n         実際: ' + a); }
}

// ===== 利用者台帳フィクスチャ =====
// 介護度の生値は kubun.html の option value と本番台帳の実値に一致させる。
// 事業対象者は「事業対象者」（末尾「者」あり）。要支援は半角/全角数字が混在する。
var DAICHO_HEADERS = ['名前', '要介護度', '利用ステータス', 'フリガナ', '利用曜日', '午前/午後', 'ケアマネ事業所名', 'ケアマネ担当者名'];
var DAICHO_ROWS = [
  // --- 事業対象者（総合事業）: 母集団に入るべき ---
  ['事業対象一郎', '事業対象者', '利用中', 'ジギョウタイショウイチロウ', '月水', '午前', 'ケアマネ事業所A', '担当A'],
  ['事業対象二郎', '事業対象者', '', 'ジギョウタイショウジロウ', '火', '午後', 'ケアマネ事業所B', '担当B'],
  // --- 要支援: 引き続き通ること（回帰） ---
  ['要支援一子', '要支援1', '利用中', 'ヨウシエンイチコ', '月', '午前', 'ケアマネ事業所A', '担当A'],
  ['要支援全角子', '要支援１', '利用中', 'ヨウシエンゼンカクコ', '木', '午前', 'ケアマネ事業所C', '担当C'],
  ['要支援二子', '要支援2', '利用中', 'ヨウシエンニコ', '金', '午後', 'ケアマネ事業所A', '担当A'],
  // --- 要介護1〜5: 入らないこと（回帰） ---
  ['要介護一男', '要介護1', '利用中', '', '月', '午前', '', ''],
  ['要介護二男', '要介護2', '利用中', '', '火', '午前', '', ''],
  ['要介護三男', '要介護3', '利用中', '', '水', '午前', '', ''],
  ['要介護四男', '要介護4', '利用中', '', '木', '午前', '', ''],
  ['要介護五男', '要介護5', '利用中', '', '金', '午前', '', ''],
  ['要介護全角男', '要介護１', '利用中', '', '金', '午前', '', ''],
  // --- 除外されるべき境界 ---
  ['終了事業対象', '事業対象者', '利用終了', '', '月', '午前', '', ''],
  ['中止事業対象', '事業対象者', '中止', '', '月', '午前', '', ''],
  ['卒業事業対象', '事業対象者', '卒業', '', '月', '午前', '', ''],
  ['介護度空欄', '', '利用中', '', '月', '午前', '', ''],
  ['', '事業対象者', '利用中', '', '月', '午前', '', '']  // 名前空欄はスキップ
];

// ===== GAS スタブ =====
function makeSheet(values) {
  return {
    getDataRange: function () { return { getValues: function () { return values; } }; },
    getRange: function () {
      return {
        setValues: function () { return this; },
        setValue: function () { return this; },
        setFontWeight: function () { return this; },
        setBackground: function () { return this; },
        getValues: function () { return values; }
      };
    },
    setFrozenRows: function () { return this; },
    getLastRow: function () { return values.length; },
    getLastColumn: function () { return values[0] ? values[0].length : 0; },
    appendRow: function () { return this; }
  };
}

var SHEETS = {
  '利用者台帳': makeSheet([DAICHO_HEADERS].concat(DAICHO_ROWS)),
  // モニタリング設定は空（ヘッダのみ）＝ planStart 未登録の実態に合わせる
  'モニタリング設定': makeSheet([['userId', 'planStart', 'finalEvalMonth', 'updatedAt']])
};

var sandbox = {
  console: console,
  SpreadsheetApp: {
    openById: function () {
      return {
        getSheetByName: function (n) { return SHEETS[n] || null; },
        insertSheet: function (n) { SHEETS[n] = makeSheet([[]]); return SHEETS[n]; }
      };
    }
  },
  Utilities: {
    formatDate: function (d, tz, fmt) {
      var y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), da = ('0' + d.getDate()).slice(-2);
      if (fmt === 'yyyy-MM') return y + '-' + m;
      return y + '-' + m + '-' + da;
    }
  },
  LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
  PropertiesService: { getScriptProperties: function () { return { getProperty: function () { return ''; } }; } },
  UrlFetchApp: { fetch: function () { throw new Error('テスト中の外部fetchは禁止'); } },
  MailApp: { sendEmail: function () { throw new Error('テスト中のメール送信は禁止'); } },
  GmailApp: {},
  DriveApp: {},
  CacheService: { getScriptCache: function () { return { get: function () { return null; }, put: function () {} }; } },
  ContentService: { createTextOutput: function () { return { setMimeType: function () { return {}; } }; }, MimeType: {} },
  HtmlService: {},
  Session: { getActiveUser: function () { return { getEmail: function () { return ''; } }; } },
  ScriptApp: {}
};

// ===== 本物の コード.js をロード =====
var GAS_PATH = path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js');
var src = fs.readFileSync(GAS_PATH, 'utf8');
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: GAS_PATH });

console.log('=== 検証対象: ' + GAS_PATH);
console.log('=== ロード確認: getMonitoringTargetUsers_ = ' + typeof sandbox.getMonitoringTargetUsers_);
if (typeof sandbox.getMonitoringTargetUsers_ !== 'function') {
  console.log('!! 本物の関数をロードできていない。テストが無意味なので中断する。');
  process.exit(1);
}

// ===== 実行 =====
var users = sandbox.getMonitoringTargetUsers_();
var names = users.map(function (u) { return u.name; });
console.log('=== 母集団に入った利用者: ' + JSON.stringify(names));
console.log('');

// ===== 1) 事業対象者が母集団に入る（本命・現状は赤） =====
console.log('[1] 事業対象者が母集団に入る');
ok(names.indexOf('事業対象一郎') >= 0, '★事業対象一郎（生値「事業対象者」）が母集団に入る');
ok(names.indexOf('事業対象二郎') >= 0, '★事業対象二郎（利用ステータス空欄）が母集団に入る');

// ===== 2) 回帰: 要支援は引き続き通る =====
console.log('[2] 回帰: 要支援1・要支援2は引き続き通る');
ok(names.indexOf('要支援一子') >= 0, '要支援1が通る');
ok(names.indexOf('要支援全角子') >= 0, '要支援１（全角）が通る');
ok(names.indexOf('要支援二子') >= 0, '要支援2が通る');

// ===== 3) 回帰: 要介護1〜5は入らない =====
console.log('[3] 回帰: 要介護1〜5は母集団に入らない');
['要介護一男', '要介護二男', '要介護三男', '要介護四男', '要介護五男'].forEach(function (n) {
  ok(names.indexOf(n) === -1, n + '（要介護）は入らない');
});
ok(names.indexOf('要介護全角男') === -1, '要介護１（全角）も入らない');

// ===== 4) 境界: 終了/中止/卒業・空欄は除外 =====
console.log('[4] 境界: 終了/中止/卒業の事業対象者と介護度空欄は除外');
ok(names.indexOf('終了事業対象') === -1, '利用終了の事業対象者は除外');
ok(names.indexOf('中止事業対象') === -1, '中止の事業対象者は除外');
ok(names.indexOf('卒業事業対象') === -1, '卒業の事業対象者は除外');
ok(names.indexOf('介護度空欄') === -1, '介護度空欄は除外');

// ===== 5) 母集団の中身が過不足ないこと =====
console.log('[5] 母集団の全体像');
eq(names.sort(), ['事業対象一郎', '事業対象二郎', '要支援一子', '要支援二子', '要支援全角子'].sort(),
   '★母集団＝事業対象者2名＋要支援3名のちょうど5名');

// ===== 6) category に生値が保たれること（フロントのバッジ判定用） =====
console.log('[6] category の値');
var jigyo = users.filter(function (u) { return u.name === '事業対象一郎'; })[0];
ok(!!jigyo && String(jigyo.category).indexOf('事業') >= 0,
   '★事業対象者の category が「事業」を含む（monitoring.html のバッジ判定 indexOf(\'事業\') に一致）');

console.log('');
console.log('=========================================');
console.log('  pass: ' + pass + ' / fail: ' + fail);
console.log('=========================================');
process.exit(fail > 0 ? 1 : 0);
