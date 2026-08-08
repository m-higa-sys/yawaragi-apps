// test-day-gate.js
// day-gate.js（日付またぎ検知）の単体テスト。
//
// 背景: 2026-08-07 に session-board で「開きっぱなしのタブが前日の画面のまま使われる」事故が発生。
//   版ゲート（<head>最先頭の1回きり fetch）は読み込み時にしか走らないため、
//   0時をまたいでも画面の「今日」は起動時のまま固まる。これを構造で塞ぐのが day-gate.js。
//
// 検証する契約:
//   1. ywToday() は **JST固定**（端末TZに依存しない）
//   2. 日付が変わったときだけ1回コールバックが飛び、保持値は必ず更新される
//   3. 検知経路は visibilitychange / pageshow / 60秒タイマー の3つ
//   4. 60秒タイマーは非表示中は何もしない（板GASの同時実行数対策に逆行させない）
//   5. day-gate.js は通信をしない（版チェック本体は今回作らない＝作ったら仕様違反）
//   6. 分岐(A)(B) が仕様どおり（(A)=表示日付を今日へ追従＋再取得 / (B)=表示日付は動かさない）
//
// 実行: node scripts/test-day-gate.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'day-gate.js'), 'utf8');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.error('  NG  ' + msg); }
}
function eq(actual, expected, msg) {
  assert(actual === expected, msg + '  (実測=' + JSON.stringify(actual) + ' 期待=' + JSON.stringify(expected) + ')');
}

// ===== jsdom 上に day-gate.js を読み込む =====
// setInterval は「何ミリ秒で登録されたか」を実測したいので、読み込み前に差し替えて捕まえる。
function loadGate() {
  const { JSDOM } = require(require.resolve('jsdom', { paths: [path.join(ROOT, 'node_modules')] }));
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
  const w = dom.window;

  const intervals = [];
  w.setInterval = function (fn, ms) { intervals.push({ fn: fn, ms: ms }); return intervals.length; };

  let hidden = false;
  Object.defineProperty(w.document, 'hidden', { get: function () { return hidden; }, configurable: true });
  Object.defineProperty(w.document, 'visibilityState', {
    get: function () { return hidden ? 'hidden' : 'visible'; }, configurable: true
  });

  const s = w.document.createElement('script');
  s.textContent = SRC;
  w.document.body.appendChild(s);

  return {
    w: w,
    intervals: intervals,
    setHidden: function (v) { hidden = v; },
    fireVisibility: function () { w.document.dispatchEvent(new w.Event('visibilitychange')); },
    firePageshow: function () { w.dispatchEvent(new w.Event('pageshow')); },
    tick: function () { intervals.forEach(function (t) { t.fn(); }); }
  };
}

// ===== 1. JST固定であること（純粋関数） =====
console.log('[1] ywToday() は JST固定');
{
  const g = loadGate();
  const jstYMD = g.w.ywDayGate.jstYMD;

  // 2026-08-06 23:59:59 JST ＝ 2026-08-06 14:59:59 UTC → まだ 8/6
  eq(jstYMD(new Date('2026-08-06T14:59:59Z')), '2026-08-06', 'JST 8/6 23:59:59 → 2026-08-06');
  // 2026-08-07 00:00:00 JST ＝ 2026-08-06 15:00:00 UTC → もう 8/7
  //   ★UTC基準なら "2026-08-06" になる。ここが JST固定であることの実証。
  eq(jstYMD(new Date('2026-08-06T15:00:00Z')), '2026-08-07', 'JST 8/7 00:00:00 → 2026-08-07（UTC基準なら8/6＝JST固定の実証）');
  // 年またぎ
  eq(jstYMD(new Date('2025-12-31T15:00:00Z')), '2026-01-01', '年またぎ（JST 1/1 00:00）→ 2026-01-01');
  // ゼロ埋め
  eq(jstYMD(new Date('2026-01-02T03:00:00Z')), '2026-01-02', '1桁の月日はゼロ埋めされる');

  eq(typeof g.w.ywToday, 'function', 'window.ywToday が公開されている');
  eq(typeof g.w.ywOnDayChange, 'function', 'window.ywOnDayChange が公開されている');
  eq(typeof g.w.ywOnTick, 'function', 'window.ywOnTick が公開されている（拡張ポイント）');
  eq(g.w.ywToday(), jstYMD(new Date()), 'ywToday() は jstYMD(now) と一致する');
}

// ===== 2. 日付が変わったときだけ1回飛ぶ／保持値は必ず更新される =====
console.log('[2] 日付またぎの検知');
{
  const g = loadGate();
  let clock = '2026-08-06';
  g.w.ywDayGate.__setClock(function () { return clock; });
  g.w.ywDayGate.__resetHeld();   // 差し替えた時計基準で保持値を取り直す

  const calls = [];
  g.w.ywOnDayChange(function (nt, pt, reason) { calls.push([nt, pt, reason]); });

  g.w.ywDayGate.check('test');
  eq(calls.length, 0, '日付が変わっていなければ発火しない');

  clock = '2026-08-07';
  g.w.ywDayGate.check('test');
  eq(calls.length, 1, '日付が変わったら1回だけ発火する');
  eq(calls[0][0], '2026-08-07', 'コールバックに新しい今日が渡る');
  eq(calls[0][1], '2026-08-06', 'コールバックに旧「今日」が渡る');
  eq(calls[0][2], 'test', 'コールバックに検知理由が渡る');
  eq(g.w.ywDayGate.heldToday(), '2026-08-07', '保持値が新しい今日へ更新されている');

  g.w.ywDayGate.check('test');
  eq(calls.length, 1, '同じ日付で再度検知しても二重発火しない');
}

// ===== 3. コールバックが例外を投げても他を巻き込まない／再発火しない =====
console.log('[3] コールバックの例外隔離');
{
  const g = loadGate();
  let clock = '2026-08-06';
  g.w.ywDayGate.__setClock(function () { return clock; });
  g.w.ywDayGate.__resetHeld();

  let second = 0;
  g.w.ywOnDayChange(function () { throw new Error('わざと失敗'); });
  g.w.ywOnDayChange(function () { second++; });

  clock = '2026-08-07';
  g.w.ywDayGate.check('test');
  eq(second, 1, '1つ目が例外を投げても2つ目は実行される');
  eq(g.w.ywDayGate.heldToday(), '2026-08-07', '例外があっても保持値は更新される（無限に再発火しない）');

  g.w.ywDayGate.check('test');
  eq(second, 1, '例外後も二重発火しない');
}

// ===== 4. 検知経路3つ =====
console.log('[4] 検知経路（visibilitychange / pageshow / 60秒タイマー）');
{
  // (a) visibilitychange
  {
    const g = loadGate();
    let clock = '2026-08-06';
    g.w.ywDayGate.__setClock(function () { return clock; });
    g.w.ywDayGate.__resetHeld();
    let n = 0;
    g.w.ywOnDayChange(function () { n++; });

    clock = '2026-08-07';
    g.setHidden(true); g.fireVisibility();
    eq(n, 0, '非表示になったときは検知しない（復帰時にやる）');
    g.setHidden(false); g.fireVisibility();
    eq(n, 1, '可視化復帰で検知する');
  }
  // (b) pageshow（bfcache復帰）
  {
    const g = loadGate();
    let clock = '2026-08-06';
    g.w.ywDayGate.__setClock(function () { return clock; });
    g.w.ywDayGate.__resetHeld();
    let n = 0;
    g.w.ywOnDayChange(function () { n++; });

    clock = '2026-08-07';
    g.firePageshow();
    eq(n, 1, 'pageshow（bfcache復帰）で検知する');
  }
  // (c) 60秒タイマー
  {
    const g = loadGate();
    eq(g.intervals.length, 1, 'タイマーは1本だけ登録される');
    eq(g.intervals[0].ms, 60000, 'タイマー間隔は60000ms');

    let clock = '2026-08-06';
    g.w.ywDayGate.__setClock(function () { return clock; });
    g.w.ywDayGate.__resetHeld();
    let n = 0;
    g.w.ywOnDayChange(function () { n++; });

    clock = '2026-08-07';
    g.setHidden(true);
    g.tick();
    eq(n, 0, '非表示中のタイマーは何もしない（GAS同時実行数対策に逆行させない）');
    g.setHidden(false);
    g.tick();
    eq(n, 1, '前面のままでも60秒タイマーが0時またぎを拾う');
  }
}

// ===== 5. 拡張ポイント（版チェックの相乗り先）だけ用意し、本体は未実装 =====
console.log('[5] 拡張ポイント（本体は未実装であること）');
{
  const g = loadGate();
  const seen = [];
  g.w.ywOnTick(function (today, reason) { seen.push([today, reason]); });
  g.setHidden(false);
  g.tick();
  eq(seen.length, 1, 'ywOnTick に登録した処理が60秒タイマーで呼ばれる');
  eq(seen[0][1], 'timer', 'ywOnTick には検知理由 timer が渡る');

  g.setHidden(true);
  g.tick();
  eq(seen.length, 1, '非表示中は ywOnTick も呼ばれない');

  // ★仕様: 版チェック本体は今回作らない。day-gate.js が通信していないことをコードで固定する。
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert(!/\bfetch\s*\(/.test(code), 'day-gate.js は fetch を呼ばない（版チェック本体は未実装）');
  assert(!/XMLHttpRequest/.test(code), 'day-gate.js は XHR を使わない');
  assert(!/version\.txt/.test(code), 'day-gate.js は version.txt を読まない（版ゲート本体は無改変）');
  assert(!/location\.(reload|replace)/.test(code), 'day-gate.js は自動リロードしない（入力途中を消さない）');
}

// ===== 6. 分岐(A)(B) の契約 =====
// 各アプリの配線が守るべき挙動を、最小のダミーアプリで固定する。
console.log('[6] 分岐(A)(B)');
{
  function makeApp(g, shownDate) {
    const app = { shown: shownDate, refetched: 0, rerendered: 0 };
    g.w.ywOnDayChange(function (newToday, prevToday) {
      if (app.shown === prevToday) {        // (A) 今日を見ていた
        app.shown = newToday;
        app.refetched++;
      } else {                              // (B) 意図して別日を見ている
        app.rerendered++;                   // 表示日付は動かさず、バナー基準日だけ引き直す
      }
    });
    return app;
  }

  // (A) 今日を表示中
  {
    const g = loadGate();
    let clock = '2026-08-06';
    g.w.ywDayGate.__setClock(function () { return clock; });
    g.w.ywDayGate.__resetHeld();
    const app = makeApp(g, '2026-08-06');

    clock = '2026-08-07';
    g.w.ywDayGate.check('test');
    eq(app.shown, '2026-08-07', '(A) 表示日付が新しい今日へ追従する');
    eq(app.refetched, 1, '(A) 当日データを読み直す');
    eq(app.rerendered, 0, '(A) 再描画のみで終わらせない');
  }
  // (B) 明日を表示中
  {
    const g = loadGate();
    let clock = '2026-08-06';
    g.w.ywDayGate.__setClock(function () { return clock; });
    g.w.ywDayGate.__resetHeld();
    const app = makeApp(g, '2026-08-07');   // 意図して明日を見ている

    clock = '2026-08-07';
    g.w.ywDayGate.check('test');
    eq(app.shown, '2026-08-07', '(B) 表示日付は動かさない');
    eq(app.refetched, 0, '(B) 勝手に読み直さない');
    eq(app.rerendered, 1, '(B) バナー基準日だけ引き直す');
    eq(g.w.ywDayGate.heldToday(), '2026-08-07', '(B) でも保持していた今日は更新される');
  }
  // (B) 過去日を表示中
  {
    const g = loadGate();
    let clock = '2026-08-06';
    g.w.ywDayGate.__setClock(function () { return clock; });
    g.w.ywDayGate.__resetHeld();
    const app = makeApp(g, '2026-08-01');

    clock = '2026-08-07';
    g.w.ywDayGate.check('test');
    eq(app.shown, '2026-08-01', '(B) 過去日を見ているときも表示日付は動かさない');
    eq(app.rerendered, 1, '(B) 過去日でもバナー基準日は引き直す');
  }
}

// ===== 7. 二重読み込みガード =====
console.log('[7] 二重読み込みガード');
{
  const g = loadGate();
  let clock = '2026-08-06';
  g.w.ywDayGate.__setClock(function () { return clock; });
  g.w.ywDayGate.__resetHeld();
  let n = 0;
  g.w.ywOnDayChange(function () { n++; });

  // 同じスクリプトをもう一度流し込む（<script> 二重記載の事故を模す）
  const s2 = g.w.document.createElement('script');
  s2.textContent = SRC;
  g.w.document.body.appendChild(s2);

  eq(g.intervals.length, 1, '二重読み込みでもタイマーは増えない');
  clock = '2026-08-07';
  g.setHidden(false);
  g.firePageshow();
  eq(n, 1, '二重読み込みでもコールバックは1回しか飛ばない');
}

console.log('');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
