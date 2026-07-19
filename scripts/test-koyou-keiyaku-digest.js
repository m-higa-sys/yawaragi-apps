// test-koyou-keiyaku-digest.js
// 朝報告の「雇用契約の期限」セクション（koyouKeiyaku）の純関数検証。
//
// ★実物ロード方式: gas/yawaragi-board/コード.js を実際に読み込み、本物の純関数を vm 越しに呼ぶ。
//   純関数をテスト側へ写すと、本体を直さなくても緑になり事故を見逃すため。
//
// 実行: node scripts/test-koyou-keiyaku-digest.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');

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

var GAS_PATH = path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js');
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(GAS_PATH, 'utf8'), sandbox, { filename: GAS_PATH });

console.log('=== 検証対象: ' + GAS_PATH);
['koyouDaysUntil_', 'koyouExpiryState_', 'koyouMukiTenkanDue_', 'koyouKeiyakuLabel_', 'buildKoyouKeiyakuSection_'].forEach(function (fn) {
  console.log('=== ロード確認: ' + fn + ' = ' + typeof sandbox[fn]);
  if (typeof sandbox[fn] !== 'function') {
    console.log('!! 本物の関数をロードできていない。テストが無意味なので中断する。');
    process.exit(1);
  }
});
console.log('');

// 行: [氏名, 契約種別, 契約開始日, 契約終了日, 更新状況, 入社日, 備考]
function row(name, shubetsu, start, end, status, join, note) {
  return [name, shubetsu, start || '', end || '', status || '', join || '', note || ''];
}

// ===== 1) 日数差 =====
console.log('[1] 残日数の計算');
eq(sandbox.koyouDaysUntil_('2026-07-31', '2026-07-19'), 12, '7/19→7/31 は12日');
eq(sandbox.koyouDaysUntil_('2026-07-19', '2026-07-19'), 0, '当日は0日');
eq(sandbox.koyouDaysUntil_('2025-09-30', '2026-07-19'), -292, '★過ぎている場合は負値');
eq(sandbox.koyouDaysUntil_('2026-08-31', '2026-07-19'), 43, '7/19→8/31 は43日（45日以内）');
eq(sandbox.koyouDaysUntil_('2026-09-30', '2026-07-19'), 73, '7/19→9/30 は73日（45日超）');

// ===== 2) 満了状態の判定 =====
console.log('[2] 満了状態（過ぎている / 45日以内 / それ以外）');
eq(sandbox.koyouExpiryState_('2025-09-30', '2026-07-19'), 'expired', '★過ぎている → expired');
eq(sandbox.koyouExpiryState_('2026-07-31', '2026-07-19'), 'soon', '★45日以内 → soon');
eq(sandbox.koyouExpiryState_('2026-08-31', '2026-07-19'), 'soon', '43日先 → soon（境界内）');
eq(sandbox.koyouExpiryState_('2026-09-02', '2026-07-19'), 'soon', '45日ちょうど → soon（境界）');
eq(sandbox.koyouExpiryState_('2026-09-03', '2026-07-19'), 'ok', '46日先 → ok（境界外）');
eq(sandbox.koyouExpiryState_('2026-07-19', '2026-07-19'), 'soon', '当日 → soon（まだ満了していない）');
eq(sandbox.koyouExpiryState_('', '2026-07-19'), 'none', '終了日なし（無期）→ none');

// ===== 3) 無期転換5年 =====
console.log('[3] 無期転換申込権（通算5年・6ヶ月前から表示）');
ok(sandbox.koyouMukiTenkanDue_('2021-07-19', '2026-07-19') === true, '★5年ちょうど → 表示');
ok(sandbox.koyouMukiTenkanDue_('2021-01-01', '2026-07-19') === true, '5年超 → 表示');
ok(sandbox.koyouMukiTenkanDue_('2021-12-01', '2026-07-19') === true, '★5年到達の6ヶ月前（2026-12-01到達）→ 表示');
ok(sandbox.koyouMukiTenkanDue_('2022-09-01', '2026-07-19') === false, '髙山さん（2022-09-01・到達2027-09-01）→ まだ出さない');
ok(sandbox.koyouMukiTenkanDue_('2024-09-03', '2026-07-19') === false, '下浦さん（再入社2024-09-03）→ 出さない');
ok(sandbox.koyouMukiTenkanDue_('', '2026-07-19') === false, '入社日なし → 出さない（落ちない）');

// ===== 4) 表示文 =====
console.log('[4] 表示文');
eq(sandbox.koyouKeiyakuLabel_(row('小野重次郎', '有期', '', '2025-09-30', '未更新', '2023-07-19'), '2026-07-19'),
  '🔴【至急】小野重次郎さん 契約が2025-09-30に満了・292日経過', '★満了済み');
eq(sandbox.koyouKeiyakuLabel_(row('春山忍', '有期', '2025-08-01', '2026-07-31', '未更新', '2025-04-07'), '2026-07-19'),
  '🟠春山忍さん 契約満了まであと12日（2026-07-31）', '★45日以内');
eq(sandbox.koyouKeiyakuLabel_(row('大久保好美', '有期', '2026-03-01', '2026-05-31', '更新済・未スキャン', '2026-03-02'), '2026-07-19'),
  '🟡大久保好美さん 新契約書のスキャン待ち', '★更新済・未スキャンはスキャン待ちを優先');
eq(sandbox.koyouKeiyakuLabel_(row('髙山奈緒美', '未確認', '', '', '要確認', '2022-09-01'), '2026-07-19'),
  '🟡髙山奈緒美さん 契約書の内容が未確認', '★要確認');

// ===== 5) セクション組み立て =====
console.log('[5] セクション組み立て');
var ROWS = [
  row('小野重次郎', '有期', '', '2025-09-30', '未更新', '2023-07-19', '満了から10ヶ月経過・最優先'),
  row('春山忍', '有期', '2025-08-01', '2026-07-31', '未更新', '2025-04-07'),
  row('工藤経子', '有期', '2026-05-01', '2026-07-31', '未更新', '2026-02-06'),
  row('林秀明', '有期', '2026-05-01', '2026-07-31', '未更新', '2026-01-30'),
  row('勝又裕子', '有期', '2026-05-01', '2026-08-31', '未更新', '2025-11-03'),
  row('下浦理絵', '有期', '2025-10-01', '2026-09-30', '未更新', '2024-09-03', '退職後の再入社'),
  row('大久保好美', '有期', '2026-03-01', '2026-05-31', '更新済・未スキャン', '2026-03-02'),
  row('石井祐子', '有期', '2026-04-01', '2026-06-30', '更新済・未スキャン', '2026-04-01'),
  row('星野友太', '無期', '2026-02-13', '', '対象外', '2026-02-13', '退職後の再入社'),
  row('喜多美咲', '無期', '2026-07-16', '', '対象外', '2026-07-16'),
  row('髙山奈緒美', '未確認', '', '', '要確認', '2022-09-01', '契約書が読み取れず')
];
var s = sandbox.buildKoyouKeiyakuSection_(ROWS, '2026-07-19');
var names = s.items.map(function (i) { return i.name; });
console.log('  （対象: ' + JSON.stringify(names) + '）');
ok(names.indexOf('星野友太') < 0, '★無期（対象外）は出さない');
ok(names.indexOf('喜多美咲') < 0, '無期（対象外）は出さない②');
ok(names.indexOf('下浦理絵') < 0, '★2026-09-30 は45日超なので出さない');
ok(names.indexOf('小野重次郎') === 0, '★満了済みが最上位');
ok(names.indexOf('髙山奈緒美') >= 0, '要確認は出す');
ok(names.indexOf('大久保好美') >= 0, 'スキャン待ちは出す');
eq(s.count, s.items.length, 'count と items 数が一致');
eq(s.expired, 1, '★満了済みは1件（小野さん）');

console.log('[5-2] 並び順（🔴満了済み → 🟠期限間近 → 🟡その他）');
eq(s.items[0].level, 'expired', '1件目は expired');
var levels = s.items.map(function (i) { return i.level; });
var order = { expired: 0, soon: 1, other: 2 };
var sorted = levels.slice().sort(function (a, b) { return order[a] - order[b]; });
eq(levels, sorted, '★level の重い順に並んでいる');

console.log('[5-3] 無期転換の統合');
var s2 = sandbox.buildKoyouKeiyakuSection_(
  [row('テスト太郎', '有期', '2021-01-01', '2027-12-31', '未更新', '2021-01-01')], '2026-07-19');
ok(s2.items[0].mukiTenkan === true, '★通算5年超で無期転換フラグが立つ');
ok(s2.items[0].label.indexOf('無期転換申込権') >= 0, '★ラベルに無期転換の注記が付く');
eq(s2.count, 1, '期限が45日超でも無期転換だけで1件出る');

console.log('[5-4] 空・異常系');
eq(sandbox.buildKoyouKeiyakuSection_([], '2026-07-19'), { count: 0, expired: 0, items: [] }, '空配列');
eq(sandbox.buildKoyouKeiyakuSection_(null, '2026-07-19'), { count: 0, expired: 0, items: [] }, 'null（落ちない）');
eq(sandbox.buildKoyouKeiyakuSection_([row('', '有期', '', '2025-01-01', '未更新', '')], '2026-07-19').count, 0,
  '氏名が空の行はスキップ');

console.log('[5-5] 有給付与予定（yukyuGrant）を壊していない');
ok(typeof sandbox.buildYukyuGrantSection_ === 'function', '★buildYukyuGrantSection_ が健在');
eq(sandbox.buildYukyuGrantSection_([['林秀明', 7, 30, '週3日', 5, '', '']], '2026-07-19').count, 1,
  '★有給側の判定が従来どおり動く');

console.log('');
console.log('=========================================');
console.log('  pass: ' + pass + ' / fail: ' + fail);
console.log('=========================================');
process.exit(fail === 0 ? 0 : 1);
