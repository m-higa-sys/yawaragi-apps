// コード.js に挿入した gate 配線の抽出テスト（セキュリティ強化 順序2・2026-07-12）
// 対象（コード.jsから実抽出）: respond / gateUnauthorizedResponse_ / appendAccessLog_ / gateAndLog_
// 実行: node scripts/test-token-gate-wiring.js
//
// 実証する完了条件:
//   ・JSONP経路(callback有)では拒否レスポンスが respond() で callback ラップされる（穴①）
//   ・enforce=OFF では token 欠落/不一致でも g.ok=true＝既存挙動が不変（ログのみ増える）
//   ・enforce=ON では不一致は g.ok=false（Phase3の拒否が効く）
//   ・access_log に origin/token_status/result が積まれる／ログ失敗は握りつぶす
// GAS実行はせず、ContentService/PropertiesService/SpreadsheetApp をスタブ注入して純検証する。

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js'), 'utf8');
const core1 = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'token-auth-core.js'));
const core2 = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'access-log-core.js'));

function extractFn(name) {
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  if (start < 0) throw new Error('コード.js に ' + name + ' が無い（未挿入＝RED）');
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }

// ---- スタブ（可変状態は ctx 経由）----
const ctx = { props: {}, rows: [], ssThrows: false };
const ContentService = {
  createTextOutput: (t) => ({ _t: t, _m: null, setMimeType(m) { this._m = m; return this; } }),
  MimeType: { JSON: 'JSON', JAVASCRIPT: 'JAVASCRIPT' }
};
const PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => ctx.props[k] }) };
const SpreadsheetApp = {
  openById: () => {
    if (ctx.ssThrows) throw new Error('ss boom');
    return {
      getSheetByName: () => ({ appendRow: (r) => ctx.rows.push(r), setFrozenRows() {}, getLastRow: () => ctx.rows.length + 1 }),
      insertSheet: () => ({ appendRow() {}, setFrozenRows() {} })
    };
  }
};

const sandbox = new Function(
  'ContentService', 'PropertiesService', 'SpreadsheetApp', 'SS_ID',
  'checkToken', 'buildAccessLogRow_', 'ACCESS_LOG_SHEET', 'ACCESS_LOG_HEADER',
  'API_TOKEN_PROP', 'TOKEN_ENFORCE_PROP',
  extractFn('respond') + '\n' +
  extractFn('gateUnauthorizedResponse_') + '\n' +
  extractFn('appendAccessLog_') + '\n' +
  extractFn('gateAndLog_') + '\n' +
  'return { respond, gateUnauthorizedResponse_, appendAccessLog_, gateAndLog_ };'
);
const S = sandbox(
  ContentService, PropertiesService, SpreadsheetApp, 'fake-ss-id',
  core1.checkToken, core2.buildAccessLogRow_, core2.ACCESS_LOG_SHEET, core2.ACCESS_LOG_HEADER,
  core1.API_TOKEN_PROP, core1.TOKEN_ENFORCE_PROP
);

// ===== 穴①: JSONP拒否ラップ =====
const rJsonp = S.gateUnauthorizedResponse_({ parameter: { callback: 'cb123' } });
ok(rJsonp._m === 'JAVASCRIPT', 'A1: callback有 → MimeType JAVASCRIPT（JSONP）');
ok(/^cb123\(/.test(rJsonp._t) && /unauthorized/.test(rJsonp._t), 'A2: callback名でラップされ unauthorized を含む');
const rPlain = S.gateUnauthorizedResponse_({ parameter: {} });
ok(rPlain._m === 'JSON', 'A3: callback無 → MimeType JSON（素）');
ok(!/\(/.test(rPlain._t.slice(0, 3)) && /unauthorized/.test(rPlain._t), 'A4: 素JSONで unauthorized を含む');
ok(S.gateUnauthorizedResponse_({})._m === 'JSON', 'A5: parameter自体が無くても落ちずJSON');

// ===== enforce=OFF: 既存挙動不変（token欠落/不一致でも通す・ログは正確）=====
ctx.props = { API_TOKEN: 'SECRET', TOKEN_ENFORCE: 'false' };
ctx.rows = [];
const gMiss = S.gateAndLog_({ parameter: { token: '', action: 'getAppRegistry', origin: 'https://m-higa-sys.github.io/portal.html' } }, 'GET');
ok(gMiss.ok === true && gMiss.reason === 'missing', 'B1: OFF×token欠落 → ok:true/missing（挙動不変）');
const rowMiss = ctx.rows[ctx.rows.length - 1];
ok(rowMiss[3] === 'https://m-higa-sys.github.io/portal.html', 'B2: origin列に pageUrl が記録');
ok(rowMiss[4] === 'missing' && rowMiss[5] === false && rowMiss[6] === 'ok', 'B3: token_status=missing/enforce=false/result=ok');
ctx.rows = [];
const gWrong = S.gateAndLog_({ parameter: { token: 'WRONG', action: 'x', origin: 'https://x/genba.html' } }, 'GET');
ok(gWrong.ok === true && gWrong.reason === 'mismatch', 'B4: OFF×不一致 → ok:true/mismatch（挙動不変）');
ok(ctx.rows[0][6] === 'ok', 'B5: 不一致でも result=ok（enforce=OFF）');

// origin未送信は '(none)'
ctx.rows = [];
S.gateAndLog_({ parameter: { token: '', action: 'x' } }, 'GET');
ok(ctx.rows[0][3] === '(none)', 'B6: origin未送信 → (none)（shared.js未経由シグナル）');

// ===== POST経路: bodyのorigin/pageUrl・token を読む =====
ctx.rows = [];
const gPost = S.gateAndLog_({ postData: { contents: JSON.stringify({ token: '', action: 'absence', origin: 'https://m-higa-sys.github.io/genba.html' }) }, parameter: {} }, 'POST');
ok(gPost.ok === true && ctx.rows[0][1] === 'POST' && ctx.rows[0][3] === 'https://m-higa-sys.github.io/genba.html', 'C1: POST body の origin を記録');
ctx.rows = [];
S.gateAndLog_({ postData: { contents: JSON.stringify({ token: '', action: 'x', pageUrl: 'https://y/after-contract.html' }) }, parameter: {} }, 'POST');
ok(ctx.rows[0][3] === 'https://y/after-contract.html', 'C2: pageUrl キーもフォールバックで拾う');

// ===== enforce=ON: 不一致は拒否・一致は通す =====
ctx.props = { API_TOKEN: 'SECRET', TOKEN_ENFORCE: 'true' };
ctx.rows = [];
const gOnBad = S.gateAndLog_({ parameter: { token: 'WRONG', action: 'x', origin: 'https://x/y.html' } }, 'GET');
ok(gOnBad.ok === false && gOnBad.reason === 'mismatch', 'D1: ON×不一致 → ok:false');
ok(ctx.rows[0][6] === 'unauthorized', 'D2: result=unauthorized を記録');
const gOnGood = S.gateAndLog_({ parameter: { token: 'SECRET', action: 'x' } }, 'GET');
ok(gOnGood.ok === true && gOnGood.reason === 'valid', 'D3: ON×一致 → ok:true/valid');

// enforce=ON かつ API_TOKEN 未設定（プロパティ消失）→ fail-closed（全拒否）
ctx.props = { TOKEN_ENFORCE: 'true' }; // API_TOKEN 無し
const gOnNoKey = S.gateAndLog_({ parameter: { token: 'anything', action: 'x' } }, 'GET');
ok(gOnNoKey.ok === false, 'D4: ON×API_TOKEN未設定 → fail-closed で拒否');

// ===== ログ失敗は握りつぶす（本処理を止めない）=====
ctx.props = { API_TOKEN: 'SECRET', TOKEN_ENFORCE: 'false' };
ctx.ssThrows = true;
let threw = false, gSafe = null;
try { gSafe = S.gateAndLog_({ parameter: { token: 'SECRET', action: 'x' } }, 'GET'); } catch (e) { threw = true; }
ok(!threw && gSafe && gSafe.ok === true, 'E1: access_log書込が例外でも gateAndLog_ は落ちず ok を返す');
ctx.ssThrows = false;

console.log('\ntest-token-gate-wiring: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
