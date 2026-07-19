// access_log / origin_log の集計（純関数）の検証。
// ★実物ロード方式: gas/yawaragi-board/access-log-core.js を require して本物を呼ぶ。
// ★集計結果に個人情報（利用者名・職員名・クエリ文字列・UA・href）を混ぜないことを検証する。
// 実行: node scripts/test-access-log-summary.js
var path = require('path');
var core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'access-log-core.js'));

var pass = 0, fail = 0;
function eq(a, b, msg) {
  var x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) { pass++; console.log('  ok   ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + '\n         期待: ' + y + '\n         実際: ' + x); }
}
function ok(c, msg) { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

['buildAccessLogSummary_', 'buildOriginLogSummary_'].forEach(function (fn) {
  if (typeof core[fn] !== 'function') {
    console.log('!! ' + fn + ' を本物からロードできない。テストが無意味なので中断する。');
    process.exit(1);
  }
});

// access_log の行: [timestamp, method, action, origin, token_status, enforce, result, note]
function row(ts, method, action, origin, status, enforce, result) {
  return [ts, method, action, origin, status, enforce === true, result, ''];
}
var T1 = new Date(Date.UTC(2026, 6, 18, 0, 15, 0));   // JST 2026-07-18 09:15
var T2 = new Date(Date.UTC(2026, 6, 19, 4, 30, 0));   // JST 2026-07-19 13:30

console.log('[1] 基本の集計');
var ROWS = [
  row(T1, 'GET', 'morningDigest', '(none)', 'missing', false, 'ok'),
  row(T1, 'GET', 'absences', 'https://m-higa-sys.github.io/yawaragi-apps/genba.html', 'missing', false, 'ok'),
  row(T2, 'POST', 'save_haichi', 'https://m-higa-sys.github.io/yawaragi-apps/genba.html', 'valid', false, 'ok'),
  row(T2, 'GET', 'absences', 'null', 'missing', false, 'ok'),
  row(T2, 'GET', 'absences', 'file:///C:/Users/mh/送迎表.html', 'mismatch', true, 'unauthorized')
];
var s = core.buildAccessLogSummary_(ROWS, { topActions: 20 });
eq(s.totalRows, 5, '総行数');
eq(s.period, { from: '2026-07-18 09:15', to: '2026-07-19 13:30' }, '★期間はJST表記の最古〜最新');
eq(s.byTokenStatus, { missing: 3, valid: 1, mismatch: 1 }, '★token_status別の件数');
eq(s.byResult, { ok: 4, unauthorized: 1 }, 'result別の件数');
eq(s.byMethod, { GET: 4, POST: 1 }, 'method別の件数');

console.log('[1-2] action別（多い順・上位N）');
eq(s.byAction, [
  { action: 'absences', count: 3 },
  { action: 'morningDigest', count: 1 },
  { action: 'save_haichi', count: 1 }
], '★多い順に並ぶ');
var many = [];
for (var i = 0; i < 30; i++) many.push(row(T1, 'GET', 'act' + i, '(none)', 'missing', false, 'ok'));
eq(core.buildAccessLogSummary_(many, { topActions: 20 }).byAction.length, 20, '★上位20件に絞る');
eq(core.buildAccessLogSummary_(many, { topActions: 20 }).actionKindsTotal, 30, '★種類の総数は別途返す（切り捨てを隠さない）');

console.log('[2] origin別（(none) と file:// を明示）');
eq(s.byOrigin, [
  { origin: 'https://m-higa-sys.github.io/yawaragi-apps/genba.html', count: 2, kind: 'prod' },
  { origin: '(none)', count: 1, kind: 'none' },
  { origin: 'file:///C:/Users/mh/送迎表.html', count: 1, kind: 'file' },
  { origin: 'null', count: 1, kind: 'file' }
], '★kind で prod / none / file / other を分類');
eq(s.originAlert, { none: 1, file: 2 }, '★(none) と file:// 由来の件数を明示（Phase B の対象）');

console.log('[3] 個人情報を集計に混ぜない');
var pii = [row(T1, 'GET', 'absences', 'https://x.github.io/app.html?name=山田太郎&date=2026-07-19', 'missing', false, 'ok')];
var sp = core.buildAccessLogSummary_(pii, {});
eq(sp.byOrigin[0].origin, 'https://x.github.io/app.html', '★originのクエリ文字列は除去（利用者名が乗りうる）');
ok(JSON.stringify(sp).indexOf('山田太郎') < 0, '★集計結果に氏名が現れない');
ok(JSON.stringify(sp).indexOf('note') < 0, '★note列は集計に含めない');

console.log('[4] 空・異常系');
eq(core.buildAccessLogSummary_([], {}), { totalRows: 0, period: null, byMethod: {}, byTokenStatus: {}, byResult: {}, byOrigin: [], originAlert: { none: 0, file: 0 }, byAction: [], actionKindsTotal: 0 }, '空');
eq(core.buildAccessLogSummary_(null, {}).totalRows, 0, 'null（落ちない）');
var broken = [['こわれ', null, undefined, '', '', '', '', '']];
ok(core.buildAccessLogSummary_(broken, {}).totalRows === 1, '★壊れた行でも落ちない');
ok(core.buildAccessLogSummary_(broken, {}).period === null, '日付が読めなければ period は null');

console.log('[5] origin_log の集計（href / userAgent は返さない）');
// origin_log の行: [サーバ受信時刻, origin, href, userAgent, クライアント時刻]
var OROWS = [
  [T1, 'file:///C:/Users/mh/送迎表.html', 'file:///C:/Users/mh/送迎表.html?name=山田', 'Mozilla/5.0 (Windows NT 10.0)', ''],
  [T2, 'https://m-higa-sys.github.io', 'https://m-higa-sys.github.io/yawaragi-apps/genba.html', 'Mozilla/5.0 (iPhone)', '']
];
var o = core.buildOriginLogSummary_(OROWS);
eq(o.totalRows, 2, '総行数');
eq(o.origins, [
  { origin: 'file:///C:/Users/mh/送迎表.html', kind: 'file', firstSeen: '2026-07-18 09:15' },
  { origin: 'https://m-higa-sys.github.io', kind: 'prod', firstSeen: '2026-07-19 13:30' }
], '★origin と初回記録時刻のみ');
ok(JSON.stringify(o).indexOf('Mozilla') < 0, '★userAgent は返さない');
ok(JSON.stringify(o).indexOf('山田') < 0, '★href（クエリにPIIが乗りうる）は返さない');
eq(core.buildOriginLogSummary_(null), { totalRows: 0, origins: [] }, 'null（落ちない）');

console.log('');
console.log('=========================================');
console.log('  pass: ' + pass + ' / fail: ' + fail);
console.log('=========================================');
process.exit(fail === 0 ? 0 : 1);
