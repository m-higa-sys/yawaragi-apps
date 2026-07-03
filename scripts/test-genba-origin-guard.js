// genba.html 別オリジン書込ブロックの実コード抽出テスト
// 対象: gnbIsProdWriteAllowed / gnbGuardProdWrite / gnbApplyOriginWriteLock
//       + 全書込POST関数8つに「fetch より前にガード」がある構造証明
// 実行: node scripts/test-genba-origin-guard.js

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name;
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('genba.html に ' + sig + ' が無い（未実装＝RED）');
  let i = html.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }

// ===== A. 純関数 gnbIsProdWriteAllowed =====
const sbA = {};
new Function('sb', "const PROD_ORIGIN = 'https://m-higa-sys.github.io';\n" +
  extractFn('gnbIsProdWriteAllowed') + '\nsb.f = gnbIsProdWriteAllowed;')(sbA);
const isAllowed = sbA.f;

ok(isAllowed('https://m-higa-sys.github.io') === true, 'A1: 本番オリジン完全一致 → true');
ok(isAllowed('http://m-higa-sys.github.io') === false, 'A2: httpスキーム違い → false');
ok(isAllowed('https://m-higa-sys.github.io.evil.example') === false, 'A3: 前方一致もどき → false');
ok(isAllowed('null') === false, 'A4: file://のorigin文字列"null" → false');
ok(isAllowed(null) === false, 'A5: null → false');
ok(isAllowed(undefined) === false, 'A6: undefined → false');
ok(isAllowed({ toString: function () { throw new Error('boom'); } }) === false,
  'A7: 文字列化で例外 → fail-safeでfalse');

// ===== B. ガードwrapper gnbGuardProdWrite（location/showToast注入） =====
function makeGuard(origin) {
  const sb = { toasts: [] };
  const src = "const PROD_ORIGIN = 'https://m-higa-sys.github.io';\n" +
    'let _gnbGuardToastAt = 0;\n' +
    extractFn('gnbIsProdWriteAllowed') + '\n' +
    extractFn('gnbGuardProdWrite') + '\n' +
    'sb.guard = gnbGuardProdWrite;';
  const location = origin === '__throw__'
    ? new Proxy({}, { get: function () { throw new Error('no location'); } })
    : { origin: origin };
  new Function('sb', 'location', 'showToast', 'console', src)(
    sb, location,
    function (msg) { sb.toasts.push(msg); },
    { warn: function () {} }
  );
  return sb;
}

const gProd = makeGuard('https://m-higa-sys.github.io');
ok(gProd.guard('t') === true && gProd.toasts.length === 0, 'B1: 本番 → true・トーストなし');

const gFile = makeGuard('null');
ok(gFile.guard('t') === false && gFile.toasts.length === 1, 'B2: 別オリジン → false・トースト1回');
ok(gFile.guard('t2') === false && gFile.toasts.length === 1, 'B3: 3秒以内の連続ブロック → トースト増えない（デバウンス）');

const gThrow = makeGuard('__throw__');
ok(gThrow.guard('t') === false, 'B4: location参照が例外 → fail-safeでfalse');

// ===== C. 構造証明: 全書込POST関数でガードが fetch より前 =====
const SENDERS = ['gasPost', 'gasPostAbsenceWithVerify', '_postHaichiToCloud', 'sendWorkReport',
  'jsCreateDrafts', 'rmdSyncWeight', 'rmdToggleOral', 'dengonSubmit'];
SENDERS.forEach(function (name) {
  const src = extractFn(name);
  const g = src.indexOf('gnbGuardProdWrite(');
  const f = src.indexOf('fetch(');
  ok(g >= 0 && f >= 0 && g < f, 'C: ' + name + ' はガードが fetch より前（g=' + g + ', f=' + f + '）');
});

// POST行の網羅性: genba.html全体の method:POST 出現数と SENDERS 内の合計が一致
// （空白・クォート・大文字小文字の揺れに強い正規表現でカウント）
const POST_RE = /method\s*:\s*['"]post['"]/gi;
const totalPosts = (html.match(POST_RE) || []).length;
const senderPosts = SENDERS.reduce(function (n, name) {
  return n + (extractFn(name).match(POST_RE) || []).length;
}, 0);
ok(totalPosts === senderPosts,
  'C網羅: 全POST行(' + totalPosts + ')がガード済み8関数内(' + senderPosts + ')に収まる');
ok(html.indexOf('sendBeacon') < 0 && html.indexOf('XMLHttpRequest') < 0,
  'C裏口: sendBeacon/XHRによる書込経路が存在しない');

// ===== E. 実定数の値ドリフト検知（テスト注入値と本物の一致） =====
ok(html.indexOf("const PROD_ORIGIN = 'https://m-higa-sys.github.io';") >= 0,
  'E1: 実PROD_ORIGINがテスト前提と一致');
// 実GNB_WRITE_LOCK_BTN_IDSの5IDが静的HTMLに実在
['abs-submit-btn', 'abs-resume-submit-btn', 'trm-submit-btn', 'js-create-btn', 'dengon-submit-btn']
  .forEach(function (id) {
    ok(html.indexOf('id="' + id + '"') >= 0, 'E2: 静的HTMLに ' + id + ' が実在');
  });
ok(html.indexOf("const GNB_WRITE_LOCK_BTN_IDS = ['abs-submit-btn', 'abs-resume-submit-btn', 'trm-submit-btn', 'js-create-btn', 'dengon-submit-btn'];") >= 0,
  'E3: 実GNB_WRITE_LOCK_BTN_IDSがテスト前提と一致');

// ===== D. UIロック gnbApplyOriginWriteLock（DOMモック） =====
function makeLockRun(origin) {
  const els = {};
  ['abs-submit-btn', 'abs-resume-submit-btn', 'trm-submit-btn', 'js-create-btn', 'dengon-submit-btn']
    .forEach(function (id) {
      els[id] = { id: id, disabled: false, title: '', textContent: '登録', style: {},
        inserted: '', insertAdjacentHTML: function (pos, htmlStr) { this.inserted += htmlStr; } };
    });
  const sb = { els: els };
  const src = "const PROD_ORIGIN = 'https://m-higa-sys.github.io';\n" +
    "const PROD_URL = 'https://m-higa-sys.github.io/yawaragi-apps/genba.html';\n" +
    "const GNB_WRITE_LOCK_BTN_IDS = ['abs-submit-btn', 'abs-resume-submit-btn', 'trm-submit-btn', 'js-create-btn', 'dengon-submit-btn'];\n" +
    extractFn('gnbIsProdWriteAllowed') + '\n' +
    extractFn('gnbApplyOriginWriteLock') + '\nsb.run = gnbApplyOriginWriteLock;';
  new Function('sb', 'location', 'document', src)(
    sb, { origin: origin },
    { getElementById: function (id) { return els[id] || null; } }
  );
  sb.run();
  return els;
}

const prodEls = makeLockRun('https://m-higa-sys.github.io');
ok(Object.keys(prodEls).every(function (id) { return prodEls[id].disabled === false; }),
  'D1: 本番 → ボタン無変更');

const fileEls = makeLockRun('null');
ok(Object.keys(fileEls).every(function (id) { return fileEls[id].disabled === true; }),
  'D2: 別オリジン → 5ボタン全disabled');
ok(fileEls['abs-submit-btn'].inserted.indexOf('正しいURL') >= 0 &&
   fileEls['abs-submit-btn'].inserted.indexOf('https://m-higa-sys.github.io/yawaragi-apps/genba.html') >= 0,
  'D3: 欠席登録ボタン脇に理由+正規URLリンク挿入');

// getElementByIdが例外を投げても落ちない（init連鎖を殺さない）
let crashed = false;
try {
  const sb2 = {};
  const src2 = "const PROD_ORIGIN = 'x';\nconst PROD_URL = 'y';\n" +
    "const GNB_WRITE_LOCK_BTN_IDS = ['abs-submit-btn'];\n" +
    extractFn('gnbIsProdWriteAllowed') + '\n' +
    extractFn('gnbApplyOriginWriteLock') + '\nsb2.run = gnbApplyOriginWriteLock;';
  new Function('sb2', 'location', 'document', src2)(
    sb2, { origin: 'null' },
    { getElementById: function () { throw new Error('DOM dead'); } }
  );
  sb2.run();
} catch (e) { crashed = true; }
ok(crashed === false, 'D4: DOM例外でもthrowしない（f774228対策）');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
