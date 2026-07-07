// 欠席box JSONPタイムアウト競合の「実測」ハーネス（2026-07-07）
// 実インシデント: GAS応答 8.02秒 × JSONPタイムアウト 8.00秒 の境界競合で、
// タイムアウトが delete window[cbName] した直後に遅れて届いた応答が
// 削除済み関数を呼び ReferenceError → box例外停止（内容を見る/まとめて送信が無反応）。
//
// このハーネスは genba.html から【実コード】の kbJsonp_ / attEnsureMonthAbsences を抽出し、
// window/document/setTimeout をスタブ化して「タイムアウト後に遅延応答が来る」経路を実駆動し、
// 受け皿コールバックが常に関数で、呼んでも例外を投げないことを実測する。
// 実行: node scripts/verify-kbox-jsonp-timeout.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

function extractFn(name) {
  let sig = 'function ' + name + '(';
  let start = html.indexOf(sig);
  if (start < 0) throw new Error('genba.html に ' + sig + ' が無い');
  if (html.slice(start - 6, start) === 'async ') start -= 6;
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  for (let j = braceStart; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

// ---- テスト集計 ----
let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  [PASS] ' + label); } else { fail++; console.log('  [FAIL] ' + label); } }

// ---- 制御可能な実行環境を作る ----
// setTimeout はコールバックを蓄えるだけ（自動発火しない）。テストが任意に fire する。
// document/window はスタブ。appendChild された script.src から callback 名を読む。
function makeEnv() {
  const env = {
    window: {},
    timers: [],          // { fn, ms, id }
    appended: [],        // 追加された script 要素
    Date: { now: (function () { let n = 1000; return function () { return (n += 7); }; })() }, // 単調増加
  };
  env.setTimeout = function (fn, ms) { const id = env.timers.length + 1; env.timers.push({ fn, ms, id }); return id; };
  env.clearTimeout = function (id) { env.timers = env.timers.filter(t => t.id !== id); };
  env.document = {
    createElement: function () { return { id: '', src: '', onerror: null, parentNode: null, remove: function () { this.parentNode = null; } }; },
    getElementById: function (id) { for (const s of env.appended) if (s.id === id) return s; return null; },
    body: { appendChild: function (s) { s.parentNode = env.document.body; env.appended.push(s); } },
  };
  return env;
}

// 抽出した実関数を、スタブ環境に束縛して取り出す
function bind(env, fnNames, extraGlobals) {
  const src = fnNames.map(extractFn).join('\n\n');
  const argNames = ['window', 'document', 'setTimeout', 'clearTimeout', 'Date', 'ABS_BOARD_API_URL'].concat(Object.keys(extraGlobals || {}));
  const argVals = [env.window, env.document, env.setTimeout, env.clearTimeout, env.Date, 'https://example.test/exec'].concat(Object.values(extraGlobals || {}));
  const body = src + '\n\nreturn {' + fnNames.map(n => n + ': ' + n).join(', ') + '};';
  const factory = new Function(...argNames, body);
  return factory(...argVals);
}

function cbNameFromLastScript(env) {
  const s = env.appended[env.appended.length - 1];
  const m = /callback=([^&]+)/.exec(s.src);
  return m ? m[1] : null;
}
function fireTimeout(env) {
  // 最長(=保険)タイムアウトを発火。box系は finish/onFail 用の 1 本だけ持つ。
  const t = env.timers.shift();
  if (t) t.fn();
}

// ---- 構造不変条件（全JSONP経路の統一を固定）----
// 「一箇所直しても別経路が同じ穴」を終わらせるため、genba.html 全体で
//  ・生の delete window[...] は kbReleaseCb_ helper の2行だけ（他JSONP経路は全て kbReleaseCb_ 経由）
//  ・JSONPの短い保険 8000ms は全廃（20000ms 以上）
// を静的に固定する。新規JSONP経路が生の delete / 8000ms を持ち込むと即FAIL。
console.log('■ 構造不変条件（全JSONP経路 統一）');
(function () {
  const delMatches = html.match(/delete window\[/g) || [];
  ok(delMatches.length === 2, 'S1(★): 生の delete window[ は kbReleaseCb_ helper の2行のみ（現数=' + delMatches.length + '）');
  const eightK = html.match(/,\s*8000\s*\)/g) || [];
  ok(eightK.length === 0, 'S2(★): JSONP短タイムアウト 8000ms は全廃（現数=' + eightK.length + '）');
  // kbReleaseCb_ が定義済みで、各JSONP経路から参照されている（使用が十分数ある）
  ok(/function kbReleaseCb_\(/.test(html), 'S3: kbReleaseCb_ helper が定義済み');
  const relUse = (html.match(/kbReleaseCb_\(/g) || []).length;
  ok(relUse >= 20, 'S4(★): kbReleaseCb_ が全経路から参照（定義1+使用多数・現数=' + relUse + '）');
})();

console.log('■ kbJsonp_（前進窓GET）');
(function () {
  const env = makeEnv();
  const { kbJsonp_ } = bind(env, ['kbJsonp_', 'kbReleaseCb_']);
  const p = kbJsonp_('absences', 'abs');
  const cbName = cbNameFromLastScript(env);
  ok(!!cbName && typeof env.window[cbName] === 'function', 'J1: 挿入直後、受け皿コールバックが window 上に関数として存在');

  // タイムアウト発火（応答が来ない8秒/20秒側）→ Promise は null 解決
  let resolved = 'PENDING';
  p.then(v => { resolved = v; });
  fireTimeout(env);
  // マイクロタスクを流す
  return Promise.resolve().then(() => {
    ok(resolved === null, 'J2: タイムアウトで Promise が null 解決（固まらない）');
    // ★核心: タイムアウト後に遅延応答が届いても、受け皿は関数のまま＝呼んでも例外を投げない
    ok(typeof env.window[cbName] === 'function', 'J3(★): settle後も window[cbName] は関数（ReferenceError封じ）');
    let threw = false;
    try { env.window[cbName]({ absences: { absences: [] } }); } catch (e) { threw = true; }
    ok(!threw, 'J4(★): 遅延応答（削除済み関数呼び）でも例外を投げない');
  });
})()
  .then(function () {
    console.log('■ kbJsonp_ 正常応答（タイムアウト前に到着）');
    const env = makeEnv();
    const { kbJsonp_ } = bind(env, ['kbJsonp_', 'kbReleaseCb_']);
    const p = kbJsonp_('absences', 'abs');
    const cbName = cbNameFromLastScript(env);
    let resolved = 'PENDING';
    p.then(v => { resolved = v; });
    env.window[cbName]({ absences: { absences: [{ name: '根岸君男' }] } });   // 正常応答
    return Promise.resolve().then(() => {
      ok(resolved && resolved.absences && resolved.absences.absences[0].name === '根岸君男', 'J5: 正常応答はデータで解決（回帰なし）');
    });
  })
  .then(function () {
    console.log('■ タイムアウト保険は 8 秒より長い（GAS実測8.02秒より余裕）');
    const env = makeEnv();
    const { kbJsonp_ } = bind(env, ['kbJsonp_', 'kbReleaseCb_']);
    kbJsonp_('absences', 'abs');
    const maxMs = Math.max.apply(null, env.timers.map(t => t.ms));
    ok(maxMs > 8000, 'J6(★): kbJsonp_ の保険タイムアウトが 8000ms 超（実測8.02秒に負けない・現値=' + maxMs + ')');
  })
  .then(function () {
    console.log('■ attEnsureMonthAbsences（過去月補完GET）');
    const env = makeEnv();
    // attEnsureMonthAbsences は attMonthAbsCache を参照する
    const { attEnsureMonthAbsences } = bind(env, ['attEnsureMonthAbsences', 'kbReleaseCb_'], { attMonthAbsCache: {} });
    let cbCalls = 0;
    attEnsureMonthAbsences('2026-06-15', function () { cbCalls++; });
    const cbName = cbNameFromLastScript(env);
    ok(!!cbName && typeof env.window[cbName] === 'function', 'M1: 挿入直後、受け皿コールバックが window 上に関数として存在');
    fireTimeout(env);
    ok(cbCalls === 1, 'M2: タイムアウトでも cb は呼ばれ前進（従来表示を壊さない）');
    ok(typeof env.window[cbName] === 'function', 'M3(★): settle後も window[cbName] は関数（ReferenceError封じ）');
    let threw = false;
    try { env.window[cbName]({ absences: [] }); } catch (e) { threw = true; }
    ok(!threw, 'M4(★): 遅延応答でも例外を投げない');
    const maxMs = Math.max.apply(null, env.timers.length ? env.timers.map(t => t.ms) : [0]);
    // 直後に発火済みのため timers は空になり得る→別インスタンスで確認
    const env2 = makeEnv();
    const b2 = bind(env2, ['attEnsureMonthAbsences', 'kbReleaseCb_'], { attMonthAbsCache: {} });
    b2.attEnsureMonthAbsences('2026-06-15', function () {});
    const maxMs2 = Math.max.apply(null, env2.timers.map(t => t.ms));
    ok(maxMs2 > 8000, 'M5(★): attの保険タイムアウトが 8000ms 超（現値=' + maxMs2 + ')');
  })
  .then(function () {
    console.log('\n実測ハーネス(JSONP timeout): ' + pass + ' PASS / ' + fail + ' FAIL');
    process.exit(fail ? 1 : 0);
  })
  .catch(function (e) { console.error('ハーネス自体のエラー:', e); process.exit(2); });
