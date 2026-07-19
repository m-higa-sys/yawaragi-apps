// doGet/doPost の認証ゲート配線の検証。
// ★実物ロード方式: gas/yawaragi-board/コード.js を vm でロードし、本物の gateAndLog_ を呼ぶ。
//   （抽出・コピーはしない。実装を直さない限り緑にならないようにするため）
// ★instanceof は使わない（vm の別realmで false になり、緑なのに本番が壊れる事故になる）
// 実行: node scripts/test-token-gate-wiring.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function eq(a, b, msg) {
  var x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) { pass++; console.log('  ok   ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + '\n         期待: ' + y + '\n         実際: ' + x); }
}

// --- GAS API のスタブ。Properties は「読まれた回数」を数え、値を差し替えられるようにする ---
var props = { API_TOKEN: null, TOKEN_ENFORCE: 'false' };
var propReads = 0;
var appended = [];      // access_log に積まれた行
var sheetExists = true;

var sandbox = {
  console: console,
  PropertiesService: {
    getScriptProperties: function () {
      return { getProperty: function (k) { propReads++; return props[k]; } };
    }
  },
  SpreadsheetApp: {
    openById: function () {
      return {
        getSheetByName: function () {
          if (!sheetExists) return null;
          return {
            appendRow: function (row) { appended.push(row); },
            setFrozenRows: function () {},
            getLastRow: function () { return appended.length + 1; },
            getLastColumn: function () { return 8; },
            getRange: function () { return { getValues: function () { return [[]]; }, setValue: function () {}, setValues: function () {} }; },
            deleteRows: function () {},
            insertColumnBefore: function () {}
          };
        },
        insertSheet: function () {
          sheetExists = true;
          return { appendRow: function (row) { appended.push(row); }, setFrozenRows: function () {},
                   getRange: function () { return { setValues: function () {} }; } };
        }
      };
    }
  },
  ScriptApp: { getProjectTriggers: function () { return []; }, newTrigger: function () {
    return { timeBased: function () { return { everyDays: function () { return { atHour: function () { return { create: function () {} }; } }; } }; } }; } },
  LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
  UrlFetchApp: { fetch: function () { throw new Error('テスト中の外部fetchは禁止'); } },
  MailApp: { sendEmail: function () { throw new Error('テスト中のメール送信は禁止'); } },
  GmailApp: {}, DriveApp: {},
  Utilities: { formatDate: function (d) { return String(d); } },
  CacheService: { getScriptCache: function () { return { get: function () { return null; }, put: function () {} }; } },
  ContentService: {
    createTextOutput: function (t) { return { _t: t, setMimeType: function () { return this; } }; },
    MimeType: { JSON: 'json', JAVASCRIPT: 'js' }
  },
  HtmlService: {},
  Session: { getActiveUser: function () { return { getEmail: function () { return ''; } }; } }
};

var GAS_PATH = path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js');
var CORE = ['token-auth-core.js', 'access-log-core.js'];
vm.createContext(sandbox);
// *-core.js は GAS 本番では同一プロジェクト内の別ファイルとして同じスコープに載る。同じ形で読む。
CORE.forEach(function (f) {
  var p = path.join(__dirname, '..', 'gas', 'yawaragi-board', f);
  vm.runInContext(fs.readFileSync(p, 'utf8').replace(/if \(typeof module[\s\S]*$/, ''), sandbox, { filename: p });
});
vm.runInContext(fs.readFileSync(GAS_PATH, 'utf8'), sandbox, { filename: GAS_PATH });

['gateAndLog_', 'gateUnauthorizedResponse_', 'appendAccessLog_', 'dailyTrimAccessLog', 'setupAccessLog_', 'checkToken']
  .forEach(function (fn) {
    if (typeof sandbox[fn] !== 'function') {
      console.log('!! ' + fn + ' を本物からロードできない。テストが無意味なので中断する。');
      process.exit(1);
    }
  });

function getEvent(params) { return { parameter: params || {} }; }
function postEvent(body) { return { parameter: {}, postData: { contents: JSON.stringify(body || {}) } }; }
function reset() { appended = []; propReads = 0; }

// ===== 1) enforce=OFF（現行設定）: 全部通る＝既存挙動は不変 =====
console.log('[1] enforce=OFF は素通り（回帰・挙動不変）');
props.TOKEN_ENFORCE = 'false'; props.API_TOKEN = null;
reset();
ok(sandbox.gateAndLog_(getEvent({ action: 'morningDigest' }), 'GET').ok === true, '★GET トークン無し → 通る');
ok(sandbox.gateAndLog_(getEvent({ action: 'getUsers', token: 'でたらめ' }), 'GET').ok === true, '★GET 誤トークン → 通る');
ok(sandbox.gateAndLog_(postEvent({ action: 'save_haichi' }), 'POST').ok === true, '★POST トークン無し → 通る');
ok(sandbox.gateAndLog_(getEvent({ action: 'log_origin' }), 'GET').ok === true, 'log_origin も通る');
eq(appended.length, 4, '★OFFでも全リクエストがログに残る（観測が目的）');

console.log('[1-2] ログの中身（列順・トークン値を書かない）');
reset();
sandbox.gateAndLog_(getEvent({ action: 'getUsers', token: 'ひみつの値', origin: 'https://example.github.io/app.html?name=山田' }), 'GET');
var row = appended[0];
eq(row.length, 8, '★8列');
eq(row[1], 'GET', 'method');
eq(row[2], 'getUsers', 'action');
eq(row[3], 'https://example.github.io/app.html', '★originのクエリは除去（PII防止）');
eq(row[4], 'mismatch', 'token_status（expected未設定なので mismatch）');
eq(row[5], false, 'enforce=false が記録される');
eq(row[6], 'ok', 'result');
ok(JSON.stringify(row).indexOf('ひみつの値') < 0, '★トークンの値そのものはログに出ない');

console.log('[1-3] origin 未送信は (none)');
reset();
sandbox.gateAndLog_(getEvent({ action: 'getUsers' }), 'GET');
eq(appended[0][3], '(none)', '★未送信は (none)＝Phase2の対象を炙り出す');

// ===== 2) enforce=ON =====
console.log('[2] enforce=ON の判定');
props.TOKEN_ENFORCE = 'true'; props.API_TOKEN = 'ただしい合言葉';
reset();
ok(sandbox.gateAndLog_(getEvent({ action: 'getUsers' }), 'GET').ok === false, '★トークン無し → 拒否');
ok(sandbox.gateAndLog_(getEvent({ action: 'getUsers', token: 'ちがう' }), 'GET').ok === false, '★誤トークン → 拒否');
ok(sandbox.gateAndLog_(getEvent({ action: 'getUsers', token: 'ただしい合言葉' }), 'GET').ok === true, '★正しいトークン → 通る');
ok(sandbox.gateAndLog_(postEvent({ action: 'save_haichi', token: 'ただしい合言葉' }), 'POST').ok === true, '★POSTも正しければ通る');
eq(appended.length, 4, 'ON でも全件ログ');
eq(appended[0][6], 'unauthorized', '★拒否は result=unauthorized で残る');

console.log('[2-2] fail-closed（API_TOKEN 未設定のまま ON にしても全通しにしない）');
props.API_TOKEN = null;
ok(sandbox.gateAndLog_(getEvent({ action: 'getUsers', token: 'なんでも' }), 'GET').ok === false, '★expected未設定 → 通さない');

console.log('[2-3] 拒否レスポンスの形');
var r1 = sandbox.gateUnauthorizedResponse_(getEvent({ action: 'getUsers' }));
ok(String(r1._t).indexOf('unauthorized') >= 0, '素のJSONで unauthorized');
var r2 = sandbox.gateUnauthorizedResponse_(getEvent({ action: 'getUsers', callback: 'cb123' }));
ok(String(r2._t).indexOf('cb123(') === 0, '★JSONPは callback でラップ（クライアントが沈黙しない）');

// ===== 3) per-request 読み取り（ロールバック要件） =====
console.log('[3] TOKEN_ENFORCE をリクエストごとに読む（deploy不要の即時ロールバック）');
props.TOKEN_ENFORCE = 'true'; props.API_TOKEN = 'ただしい合言葉';
reset();
ok(sandbox.gateAndLog_(getEvent({ action: 'x' }), 'GET').ok === false, '1回目: ON なので拒否');
props.TOKEN_ENFORCE = 'false';                       // ← Properties だけ書き換える（再ロードしない）
ok(sandbox.gateAndLog_(getEvent({ action: 'x' }), 'GET').ok === true,
  '★2回目: プロパティを false に戻すだけで即通る＝キャッシュしていない');
props.TOKEN_ENFORCE = 'true';
ok(sandbox.gateAndLog_(getEvent({ action: 'x' }), 'GET').ok === false, '★3回目: 戻すとまた拒否＝毎回読んでいる');
ok(propReads >= 6, '★3リクエストで2キー×3回以上読んでいる（実測: ' + propReads + '回）');

// ===== 4) ログ失敗で本処理を止めない =====
console.log('[4] ログ書き込みが失敗しても本処理は止めない');
props.TOKEN_ENFORCE = 'false';
var brokenSpread = sandbox.SpreadsheetApp.openById;
sandbox.SpreadsheetApp.openById = function () { throw new Error('シート死亡'); };
var res4;
try { res4 = sandbox.gateAndLog_(getEvent({ action: 'getUsers' }), 'GET'); } catch (e) { res4 = { threw: true }; }
ok(res4 && res4.ok === true, '★シートが死んでも例外を投げずに通す');
sandbox.SpreadsheetApp.openById = brokenSpread;

// ===== 5) 壊れた入力 =====
console.log('[5] 壊れた入力でも落ちない');
props.TOKEN_ENFORCE = 'false';
ok(sandbox.gateAndLog_({ postData: { contents: '{壊れたJSON' } }, 'POST').ok === true, '★不正JSONのPOSTでも落ちない');
ok(sandbox.gateAndLog_(null, 'GET').ok === true, 'e が null でも落ちない');
ok(sandbox.gateAndLog_(undefined, 'POST').ok === true, 'e が undefined でも落ちない');

console.log('');
console.log('=========================================');
console.log('  pass: ' + pass + ' / fail: ' + fail);
console.log('=========================================');
process.exit(fail === 0 ? 0 : 1);
