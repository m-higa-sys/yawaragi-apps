// test-yukyu-grant-digest.js
// 朝報告の「有給付与予定」セクション（yukyuGrant）の純関数検証。
//
// ★このテストは「二重持ち」ではない。gas/yawaragi-board/コード.js を実際に読み込み、
//   本物の純関数を vm 越しに呼ぶ（test-monitoring-target-users.js と同方式）。
//   純関数をテスト側へ写すと、本体を直さなくても緑になり事故を見逃すため。
//
// 実行: node scripts/test-yukyu-grant-digest.js

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

// ===== GAS API スタブ（外部アクセスは全面禁止） =====
var sandbox = {
  console: console,
  SpreadsheetApp: { openById: function () { throw new Error('テスト中のシートアクセスは禁止'); } },
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
  GmailApp: {}, DriveApp: {},
  CacheService: { getScriptCache: function () { return { get: function () { return null; }, put: function () {} }; } },
  ContentService: { createTextOutput: function () { return { setMimeType: function () { return {}; } }; }, MimeType: {} },
  HtmlService: {},
  Session: { getActiveUser: function () { return { getEmail: function () { return ''; } }; } },
  ScriptApp: {}
};

// ===== 本物の コード.js をロード =====
var GAS_PATH = path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js');
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(GAS_PATH, 'utf8'), sandbox, { filename: GAS_PATH });

console.log('=== 検証対象: ' + GAS_PATH);
['yukyuGrantIsDue_', 'yukyuGrantNotDone_', 'yukyuGrantLabel_', 'buildYukyuGrantSection_'].forEach(function (fn) {
  console.log('=== ロード確認: ' + fn + ' = ' + typeof sandbox[fn]);
  if (typeof sandbox[fn] !== 'function') {
    console.log('!! 本物の関数をロードできていない。テストが無意味なので中断する。');
    process.exit(1);
  }
});
console.log('');

// 行フォーマット: [氏名, 基準日月, 基準日日, 週区分, 次回付与日数, 完了年, 備考]
function row(name, mo, day, kubun, days, doneYear, note) {
  return [name, mo, day, kubun, days, doneYear === undefined ? '' : doneYear, note || ''];
}

// ===== 1) 当月・翌月の判定 =====
console.log('[1] 当月／翌月に基準日がある人だけ対象');
ok(sandbox.yukyuGrantIsDue_(8, '2026-08-13') === true, '当月（8月基準日 × 8月）→ 対象');
ok(sandbox.yukyuGrantIsDue_(8, '2026-07-19') === true, '翌月（8月基準日 × 7月）→ 対象');
ok(sandbox.yukyuGrantIsDue_(8, '2026-06-30') === false, '2ヶ月先（8月基準日 × 6月）→ 対象外');
ok(sandbox.yukyuGrantIsDue_(7, '2026-08-01') === false, '過ぎた月（7月基準日 × 8月）→ 対象外');
ok(sandbox.yukyuGrantIsDue_(3, '2026-07-19') === false, '無関係な月 → 対象外');

// ===== 2) 年跨ぎ（12月に1月分を出す） =====
console.log('[2] 年跨ぎ');
ok(sandbox.yukyuGrantIsDue_(1, '2026-12-01') === true, '★12月に1月基準日を出す（翌月＝翌年1月）');
ok(sandbox.yukyuGrantIsDue_(12, '2026-12-25') === true, '12月に12月基準日を出す（当月）');
ok(sandbox.yukyuGrantIsDue_(1, '2027-01-05') === true, '1月に1月基準日を出す（当月）');
ok(sandbox.yukyuGrantIsDue_(12, '2027-01-05') === false, '1月に12月基準日は出さない（過ぎている）');
ok(sandbox.yukyuGrantIsDue_(2, '2026-12-01') === false, '12月に2月基準日は出さない（2ヶ月先）');

// ===== 3) 完了年による除外（終わるまで方式） =====
console.log('[3] 完了年による除外');
ok(sandbox.yukyuGrantNotDone_('', '2026-07-19') === true, '完了年が空 → 未完了（出す）');
ok(sandbox.yukyuGrantNotDone_(2026, '2026-07-19') === false, '★完了年が今年 → 出さない');
ok(sandbox.yukyuGrantNotDone_('2026', '2026-07-19') === false, '完了年が今年（文字列）→ 出さない');
ok(sandbox.yukyuGrantNotDone_(2025, '2026-07-19') === true, '★完了年が去年 → また出す（毎年繰り返す）');
ok(sandbox.yukyuGrantNotDone_(null, '2026-07-19') === true, 'null → 未完了（出す）');

// ===== 4) 表示文の組み立て =====
console.log('[4] 表示文');
eq(sandbox.yukyuGrantLabel_(row('工藤経子', 8, 6, '週3日', 5)),
  '8/6 工藤経子さん 有給付与予定（週3日→5日）', '★基本形');
eq(sandbox.yukyuGrantLabel_(row('星野友太', 8, 13, '週5日(通常付与)', 10, '', '年5日義務あり')),
  '8/13 星野友太さん 有給付与予定（週5日(通常付与)→10日）　※年5日義務の対象', '★年5日義務ありは注記が付く');
eq(sandbox.yukyuGrantLabel_(row('大久保好美', 9, 2, '週2日', 3)),
  '9/2 大久保好美さん 有給付与予定（週2日→3日）', '1桁月日はゼロ埋めしない');

// ===== 5) セクション組み立て（統合） =====
console.log('[5] セクション組み立て');
var ROWS = [
  row('小野重次郎', 1, 19, '週5日(通常付与)', 14, '', '年5日義務あり'),
  row('林秀明', 7, 30, '週3日', 5),
  row('工藤経子', 8, 6, '週3日', 5),
  row('星野友太', 8, 13, '週5日(通常付与)', 10, '', '年5日義務あり'),
  row('大久保好美', 9, 2, '週2日', 3),
  row('春山忍', 10, 7, '週3日', 6)
];
var s = sandbox.buildYukyuGrantSection_(ROWS, '2026-07-19');
eq(s.count, 3, '★7/19時点の対象は3人（7月＝林、8月＝工藤・星野）');
eq(s.items.map(function (i) { return i.name; }), ['林秀明', '工藤経子', '星野友太'], '★基準日の早い順に並ぶ');
ok(s.items[2].gono5 === true, '星野さんは年5日義務フラグが立つ');
ok(s.items[0].gono5 === false, '林さんは年5日義務フラグが立たない');
eq(s.items[1].label, '8/6 工藤経子さん 有給付与予定（週3日→5日）', 'label が入る');

console.log('[5-2] 完了済みは消える');
var ROWS2 = ROWS.map(function (r) { return r.slice(); });
ROWS2[3][5] = 2026; // 星野を完了にする
var s2 = sandbox.buildYukyuGrantSection_(ROWS2, '2026-07-19');
eq(s2.count, 2, '★完了にした人が母集団から消える');
ok(s2.items.map(function (i) { return i.name; }).indexOf('星野友太') < 0, '星野さんが消えている');

console.log('[5-3] 年跨ぎの統合');
var s3 = sandbox.buildYukyuGrantSection_(ROWS, '2026-12-10');
eq(s3.items.map(function (i) { return i.name; }), ['小野重次郎'], '★12月に1月基準日の小野さんが出る');

console.log('[5-4] 空・異常系');
eq(sandbox.buildYukyuGrantSection_([], '2026-07-19'), { count: 0, items: [] }, '空配列 → count 0');
eq(sandbox.buildYukyuGrantSection_(null, '2026-07-19'), { count: 0, items: [] }, 'null → count 0（落ちない）');
var s5 = sandbox.buildYukyuGrantSection_([row('', 8, 6, '週3日', 5)], '2026-07-19');
eq(s5.count, 0, '氏名が空の行はスキップ');

// ===== 6) 年5日義務の判定は備考列の文字列 =====
console.log('[6] 年5日義務フラグ');
var s6 = sandbox.buildYukyuGrantSection_([row('勝又裕子', 5, 3, '週5日(通常付与)', 11, '', '年5日義務あり')], '2026-05-01');
ok(s6.items[0].gono5 === true, '備考に「年5日義務」を含むと true');
var s7 = sandbox.buildYukyuGrantSection_([row('石井祐子', 10, 1, '週3日', 5, '', '')], '2026-10-01');
ok(s7.items[0].gono5 === false, '備考が空なら false');

console.log('');
console.log('=========================================');
console.log('  pass: ' + pass + ' / fail: ' + fail);
console.log('=========================================');
process.exit(fail === 0 ? 0 : 1);
