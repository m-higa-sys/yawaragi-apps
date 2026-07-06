// furikae.html 別オリジン書込ブロックの実コード抽出テスト
// 対象: fnkIsProdWriteAllowed / fnkGuardProdWrite
//       + 全書込POST（cloudSync 単一ファネル）に「fetch より前にガード」がある構造証明
// 由来: genba.html の 2026-07-03 荒谷4件事故対策（scripts/test-genba-origin-guard.js）を
//       furikae.html 用に移植。furikae は書込POSTが cloudSync 1本に集約されている（saveData→cloudSync）。
// 実行: node scripts/test-furikae-origin-guard.js

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'furikae.html'), 'utf8');

// 単一 return でない関数も抽出できるよう波括弧の対応で切り出す
function extractFn(name) {
  const sig = 'function ' + name;
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('furikae.html に ' + sig + ' が無い（未実装＝RED）');
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

// ===== A. 純関数 fnkIsProdWriteAllowed（本番オリジン完全一致・判定不能は安全側false）=====
const sbA = {};
new Function('sb', "const PROD_ORIGIN = 'https://m-higa-sys.github.io';\n" +
  extractFn('fnkIsProdWriteAllowed') + '\nsb.f = fnkIsProdWriteAllowed;')(sbA);
const isAllowed = sbA.f;

ok(isAllowed('https://m-higa-sys.github.io') === true, 'A1: 本番オリジン完全一致 → true');
ok(isAllowed('http://m-higa-sys.github.io') === false, 'A2: httpスキーム違い → false');
ok(isAllowed('https://m-higa-sys.github.io.evil.example') === false, 'A3: 前方一致もどき → false');
ok(isAllowed('null') === false, 'A4: file://のorigin文字列"null" → false');
ok(isAllowed(null) === false, 'A5: null → false');
ok(isAllowed(undefined) === false, 'A6: undefined → false');
ok(isAllowed({ toString: function () { throw new Error('boom'); } }) === false,
  'A7: 文字列化で例外 → fail-safeでfalse');

// ===== B. ガードwrapper fnkGuardProdWrite（location/notice注入）=====
function makeGuard(origin) {
  const sb = { notices: [] };
  const src = "const PROD_ORIGIN = 'https://m-higa-sys.github.io';\n" +
    'let _fnkGuardNoticeAt = 0;\n' +
    extractFn('fnkIsProdWriteAllowed') + '\n' +
    extractFn('fnkGuardProdWrite') + '\n' +
    'sb.guard = fnkGuardProdWrite;';
  const location = origin === '__throw__'
    ? new Proxy({}, { get: function () { throw new Error('no location'); } })
    : { origin: origin };
  new Function('sb', 'location', 'fnkOriginNotice', 'console', src)(
    sb, location,
    function (msg) { sb.notices.push(msg); },
    { warn: function () {} }
  );
  return sb;
}

const gProd = makeGuard('https://m-higa-sys.github.io');
ok(gProd.guard('t') === true && gProd.notices.length === 0, 'B1: 本番 → true・通知なし');

const gFile = makeGuard('null');
ok(gFile.guard('t') === false && gFile.notices.length === 1, 'B2: 別オリジン → false・通知1回');
ok(gFile.guard('t2') === false && gFile.notices.length === 1, 'B3: 3秒以内の連続ブロック → 通知増えない（デバウンス）');

const gThrow = makeGuard('__throw__');
ok(gThrow.guard('t') === false, 'B4: location参照が例外 → fail-safeでfalse');

// ===== C. 構造証明: 全書込POSTでガードが fetch より前 =====
// furikae の書込POST：cloudSync（データ同期・saveData→cloudSync）と fnkNotifyBoard（伝達ボード件数通知）の2本。
// どちらも先頭で fnkGuardProdWrite を通す。新POSTを足したら必ずここに追加すること（tripwire）。
const SENDERS = ['cloudSync', 'fnkNotifyBoard'];
SENDERS.forEach(function (name) {
  const src = extractFn(name);
  const g = src.indexOf('fnkGuardProdWrite(');
  const f = src.indexOf('fetch(');
  ok(g >= 0 && f >= 0 && g < f, 'C: ' + name + ' はガードが fetch より前（g=' + g + ', f=' + f + '）');
});

// POST行の網羅性: furikae.html全体の method:POST 出現数と SENDERS 内の合計が一致
const POST_RE = /method\s*:\s*['"]post['"]/gi;
const totalPosts = (html.match(POST_RE) || []).length;
const senderPosts = SENDERS.reduce(function (n, name) {
  return n + (extractFn(name).match(POST_RE) || []).length;
}, 0);
ok(totalPosts === senderPosts,
  'C網羅: 全POST行(' + totalPosts + ')がガード済みsender内(' + senderPosts + ')に収まる');
ok(html.indexOf('sendBeacon') < 0 && html.indexOf('XMLHttpRequest') < 0,
  'C裏口: sendBeacon/XHRによる書込経路が存在しない');

// ===== E. 実定数の値ドリフト検知（テスト注入値と本物の一致）=====
ok(html.indexOf("const PROD_ORIGIN = 'https://m-higa-sys.github.io';") >= 0,
  'E1: 実PROD_ORIGINがテスト前提と一致');
ok(/const PROD_URL = 'https:\/\/m-higa-sys\.github\.io\/yawaragi-apps\/furikae\.html';/.test(html),
  'E2: 実PROD_URLが furikae.html を指す');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
