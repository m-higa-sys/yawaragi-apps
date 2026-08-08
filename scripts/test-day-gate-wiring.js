// test-day-gate-wiring.js
// day-gate.js を各アプリへ配線した結果を、実HTMLを jsdom で動かして検証する。
//
// なぜ実HTMLで回すか: 事故（2026-08-07 session-board）は「関数が間違っていた」のではなく
//   「日付が変わっても再描画が走らない」という配線の穴だった。純関数テストでは捕まらない。
//   ここでは本物の <script> を読み込み、本物の visibilitychange を投げて画面のDOMを見る。
//
// 検証するアプリ: session-board / sougei-view / sched-grid / sougei_nisshi / genba
//
// 実行: node scripts/test-day-gate-wiring.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { JSDOM } = require(require.resolve('jsdom', { paths: [path.join(ROOT, 'node_modules')] }));

// 外部JSを <script>…</script> へ流し込むためのエスケープ。
//   ソース中の "</script>" （コメント内の使用例など）はHTMLパーサに閉じタグとして食われるため潰す。
//   本番は <script src> で読むので、この加工はテスト側だけの都合。
function inlineJs(name) {
  return '<script>' + fs.readFileSync(path.join(ROOT, name), 'utf8').replace(/<\/script>/g, '<\\/script>') + '</script>';
}
const DAY_GATE_INLINE = inlineJs('day-gate.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.error('  NG  ' + msg); }
}
function eq(a, b, msg) {
  assert(a === b, msg + '  (実測=' + JSON.stringify(a) + ' 期待=' + JSON.stringify(b) + ')');
}
function has(hay, needle, msg) {
  assert(String(hay).indexOf(needle) >= 0, msg + '  (実測=' + JSON.stringify(String(hay).slice(0, 120)) + ')');
}

// ===== 共通: アプリを jsdom で起動する =====
//   - day-gate.js の <script src> を実ソースに差し替え（jsdom は外部srcを取りに行かないため）
//   - その前後に「時計を差し替える小さなscript」を挟み、起動時の今日を固定する
//   - 版ゲートの fetch('version.txt') は stub の fetch が受ける（location.replace は走らない）
const CUR_VERSION = fs.readFileSync(path.join(ROOT, 'version.txt'), 'utf8').trim();

function bootApp(file, fakeToday, opts) {
  opts = opts || {};
  let html = fs.readFileSync(path.join(ROOT, file), 'utf8');

  const shim =
    '<script>window.__FAKE_TODAY = ' + JSON.stringify(fakeToday) + ';</script>' +
    DAY_GATE_INLINE +
    '<script>window.ywDayGate.__setClock(function(){ return window.__FAKE_TODAY; }); window.ywDayGate.__resetHeld();</script>';
  const before = html;
  html = html.replace(/<script src="day-gate\.js\?v=[^"]*"><\/script>/, function () { return shim; });
  if (html === before) throw new Error(file + ' に day-gate.js の <script src> が無い（未配線＝RED）');

  // 外部srcは jsdom では読めないので実ソースを流し込む
  html = html.replace(/<script src="shared\.js\?v=[^"]*"><\/script>/, function () { return inlineJs('shared.js'); });
  html = html.replace(/<script src="auto-refresh-patch\.js"><\/script>/, function () { return inlineJs('auto-refresh-patch.js'); });

  const jsonpUrls = [];   // JSONP（script要素）で飛んだURL
  const fetchUrls = [];   // fetch で飛んだURL
  const navAttempts = []; // 版ゲートの location.replace（jsdom は遷移できないのでエラーで観測する）

  // 既定は「?v= が最新＝版ゲートが何もしない」状態で起動する。
  //   opts.urlVersion に古い版を渡すと、版ゲートが載せ替えにいくのを観測できる。
  const urlVer = Object.prototype.hasOwnProperty.call(opts, 'urlVersion') ? opts.urlVersion : CUR_VERSION;
  const pageUrl = 'https://m-higa-sys.github.io/yawaragi-apps/' + file +
    (urlVer === null ? '' : '?v=' + encodeURIComponent(urlVer));

  const vc = new (require(require.resolve('jsdom', { paths: [path.join(ROOT, 'node_modules')] })).VirtualConsole)();
  vc.on('jsdomError', function (e) {
    if (/navigation/i.test(e.message || '')) navAttempts.push(e.message);
  });

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: pageUrl,
    virtualConsole: vc,
    beforeParse(w) {
      // fetch を差し替える。版ゲートの version.txt も含めてここが受ける。
      w.fetch = function (url) {
        fetchUrls.push(String(url));
        const r = opts.onFetch ? opts.onFetch(String(url)) : null;
        if (r === null || r === undefined) return Promise.reject(new Error('stub: no response'));
        return Promise.resolve({
          ok: true, status: 200,
          text: function () { return Promise.resolve(typeof r === 'string' ? r : JSON.stringify(r)); },
          json: function () { return Promise.resolve(r); }
        });
      };
      // JSONP を捕まえる。src を記録し、必要なら callback を即席で呼ぶ。
      const origAppend = w.Node.prototype.appendChild;
      w.Node.prototype.appendChild = function (node) {
        if (node && node.tagName === 'SCRIPT' && node.src) {
          jsonpUrls.push(node.src);
          const ret = origAppend.call(this, node);
          if (opts.onJsonp) { try { opts.onJsonp(node.src, w); } catch (e) { console.error(e); } }
          return ret;
        }
        return origAppend.call(this, node);
      };
    }
  });

  const w = dom.window;
  return {
    w: w, doc: w.document, jsonpUrls: jsonpUrls, fetchUrls: fetchUrls, navAttempts: navAttempts,
    text: function (id) { const el = w.document.getElementById(id); return el ? el.textContent : null; },
    val: function (id) { const el = w.document.getElementById(id); return el ? el.value : null; },
    // 日付をまたがせて、可視化復帰（実際のイベント）で検知させる
    rollTo: function (ymd) {
      w.__FAKE_TODAY = ymd;
      w.document.dispatchEvent(new w.Event('visibilitychange'));
    },
    settle: function () { return new Promise(function (r) { setTimeout(r, 30); }); }
  };
}
function qs(url, key) {
  const m = String(url).match(new RegExp('[?&]' + key + '=([^&]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// ===================================================================
// 1) session-board — 今回の事故そのもの
// ===================================================================
async function testSessionBoard() {
  console.log('[session-board.html]');
  function sbData(date) {
    return {
      ok: true, date: date, presentAm: 0, presentPm: 0,
      sokutei: [], koukuMoni: [], koukuTaisou: [], kotan: [], residue: [], ampmConflict: []
    };
  }
  const boardUrls = [];
  const app = bootApp('session-board.html', '2026-08-06', {
    onJsonp: function (url, w) {
      const cb = qs(url, 'callback');
      const date = qs(url, 'date');
      if (!cb || !date) return;
      boardUrls.push(date);
      setTimeout(function () { if (typeof w[cb] === 'function') w[cb](sbData(date)); }, 0);
    }
  });
  await app.settle();

  eq(boardUrls[0], '2026-08-06', '起動時は今日(8/6)を取りにいく');
  eq(app.text('dnum'), '8/6', '日付欄が 8/6');
  eq(app.text('dstate'), '', '今日を見ているのでバナーは出ない');

  // ---- 分岐(A) 今日を表示中に日付をまたぐ ----
  app.rollTo('2026-08-07');
  await app.settle();
  eq(boardUrls[boardUrls.length - 1], '2026-08-07', '(A) 新しい今日(8/7)でデータを取り直す');
  eq(app.text('dnum'), '8/7', '(A) 日付欄が 8/7 へ切り替わる');
  eq(app.text('dstate'), '', '(A) 切り替わった後もバナーは出ない');
  eq(app.w.ywToday(), '2026-08-07', '(A) 保持していた今日も更新されている');

  // ---- 分岐(B) 明日を表示中に日付をまたぐ ----
  //   事故の再現: 8/6中に「翌日」で8/7を出したまま放置 → 8/7になっても「1日後」が残った
  const app2 = bootApp('session-board.html', '2026-08-06', {
    onJsonp: function (url, w) {
      const cb = qs(url, 'callback');
      const date = qs(url, 'date');
      if (!cb || !date) return;
      setTimeout(function () { if (typeof w[cb] === 'function') w[cb](sbData(date)); }, 0);
    }
  });
  await app2.settle();
  app2.doc.getElementById('nextDay').dispatchEvent(new app2.w.Event('click'));   // 「翌日」を押す
  await app2.settle();
  eq(app2.text('dnum'), '8/7', '(B前提) 翌日ボタンで 8/7 を表示している');
  has(app2.text('dstate'), '1日後', '(B前提) 「未来の日付を表示中（1日後）」が出ている');

  const before = app2.jsonpUrls.length;
  app2.rollTo('2026-08-07');
  await app2.settle();
  eq(app2.text('dnum'), '8/7', '(B) 表示日付は動かない');
  eq(app2.text('dstate'), '', '(B) 8/7が今日になったのでバナーが消える（事故の是正点）');
  eq(app2.jsonpUrls.length, before, '(B) 勝手に取り直さない（通信は増えない）');
}

// ===================================================================
// 2) sougei-view
// ===================================================================
async function testSougeiView() {
  console.log('[sougei-view.html]');
  const day = { am: { pick: [], drop: [], userStatus: {} }, pm: { pick: [], drop: [], userStatus: {} } };
  const OPS = { dailyOps: { '2026-08-05': day, '2026-08-06': day, '2026-08-07': day } };
  const app = bootApp('sougei-view.html', '2026-08-06', {
    onFetch: function (url) {
      if (url.indexOf('version.txt') >= 0) return '2026-08-06-03';
      if (url.indexOf('getOps') >= 0) return OPS;
      return null;
    }
  });
  await app.settle();
  const getOps = function () { return app.fetchUrls.filter(function (u) { return u.indexOf('getOps') >= 0; }); };

  eq(app.text('dateLabel'), '8月6日(木)', '起動時は今日(8/6)を表示');
  const n1 = getOps().length;

  // (A) 今日を表示中
  app.rollTo('2026-08-07');
  await app.settle();
  eq(app.text('dateLabel'), '8月7日(金)', '(A) 表示日付が 8/7 へ追従する');
  assert(getOps().length > n1, '(A) 送迎表を取り直す');

  // (B) 過去日を表示中
  const app2 = bootApp('sougei-view.html', '2026-08-06', {
    onFetch: function (url) {
      if (url.indexOf('version.txt') >= 0) return '2026-08-06-03';
      if (url.indexOf('getOps') >= 0) return OPS;
      return null;
    }
  });
  await app2.settle();
  app2.w.eval('shiftDate(-1)');   // 前日(8/5)へ
  await app2.settle();
  eq(app2.text('dateLabel'), '8月5日(水)', '(B前提) 過去日(8/5)を表示している');
  const n2 = app2.fetchUrls.filter(function (u) { return u.indexOf('getOps') >= 0; }).length;

  app2.rollTo('2026-08-07');
  await app2.settle();
  eq(app2.text('dateLabel'), '8月5日(水)', '(B) 表示日付は動かない');
  eq(app2.fetchUrls.filter(function (u) { return u.indexOf('getOps') >= 0; }).length, n2, '(B) 勝手に取り直さない');
}

// ===================================================================
// 3) sched-grid
// ===================================================================
async function testSchedGrid() {
  console.log('[sched-grid.html]');
  const DATA = { lastSync: new Date().toISOString(), weekly: {}, overrides: {} };
  function mk(today) {
    return bootApp('sched-grid.html', today, {
      onFetch: function (url) {
        if (url.indexOf('version.txt') >= 0) return '2026-08-06-03';
        if (url.indexOf('getSchedTimes') >= 0) return DATA;
        return null;
      }
    });
  }
  const app = mk('2026-08-06');
  await app.settle();
  eq(app.w.eval('selectedDate'), '2026-08-06', '起動時は今日(8/6)');
  const n1 = app.fetchUrls.filter(function (u) { return u.indexOf('getSchedTimes') >= 0; }).length;

  // (A)
  app.rollTo('2026-08-07');
  await app.settle();
  eq(app.w.eval('selectedDate'), '2026-08-07', '(A) 表示日付が 8/7 へ追従する');
  assert(app.fetchUrls.filter(function (u) { return u.indexOf('getSchedTimes') >= 0; }).length > n1,
    '(A) 送迎時間データを取り直す');
  eq(app.doc.querySelectorAll('#dateBar .future-badge').length, 0, '(A) 「今日ではない」バッジは出ない');

  // (B) 翌日を表示中 → 表示日付は動かず、バッジだけ正しくなる
  const app2 = mk('2026-08-06');
  await app2.settle();
  app2.w.eval('shiftDate(1)');   // 8/7 へ
  await app2.settle();
  eq(app2.w.eval('selectedDate'), '2026-08-07', '(B前提) 翌日(8/7)を表示している');
  eq(app2.doc.querySelectorAll('#dateBar .future-badge').length, 1, '(B前提) 「今日ではない」バッジが出ている');
  const n2 = app2.fetchUrls.filter(function (u) { return u.indexOf('getSchedTimes') >= 0; }).length;

  app2.rollTo('2026-08-07');
  await app2.settle();
  eq(app2.w.eval('selectedDate'), '2026-08-07', '(B) 表示日付は動かない');
  eq(app2.doc.querySelectorAll('#dateBar .future-badge').length, 0, '(B) 8/7が今日になったのでバッジが消える');
  eq(app2.fetchUrls.filter(function (u) { return u.indexOf('getSchedTimes') >= 0; }).length, n2, '(B) 勝手に取り直さない');
}

// ===================================================================
// 4) sougei_nisshi
// ===================================================================
async function testSougeiNisshi() {
  console.log('[sougei_nisshi.html]');
  function mk(today) {
    return bootApp('sougei_nisshi.html', today, {
      onFetch: function (url) {
        if (url.indexOf('version.txt') >= 0) return '2026-08-06-03';
        return null;   // クラウド同期は失敗させる（既存のエラー表示に委ねる経路を通す）
      }
    });
  }
  const app = mk('2026-08-06');
  await app.settle();
  eq(app.val('dateInput'), '2026-08-06', '起動時は今日(8/6)');
  has(app.text('dateBadge'), '【今日】', '起動時のバッジは【今日】');

  // (A)
  app.rollTo('2026-08-07');
  await app.settle();
  eq(app.val('dateInput'), '2026-08-07', '(A) 日付欄が 8/7 へ追従する');
  has(app.text('dateBadge'), '【今日】', '(A) バッジは【今日】のまま');

  // (B) 明日を表示中
  const app2 = mk('2026-08-06');
  await app2.settle();
  app2.doc.getElementById('dateInput').value = '2026-08-07';
  app2.w.eval('loadDate()');
  await app2.settle();
  eq(app2.val('dateInput'), '2026-08-07', '(B前提) 明日(8/7)を表示している');
  has(app2.text('dateBadge'), '【未来日】', '(B前提) バッジは【未来日】');

  app2.rollTo('2026-08-07');
  await app2.settle();
  eq(app2.val('dateInput'), '2026-08-07', '(B) 日付欄は動かない');
  has(app2.text('dateBadge'), '【今日】', '(B) 8/7が今日になったのでバッジが【今日】へ直る');
}

// ===================================================================
// 5) genba — TB_TODAY が GASリクエストURLに入っている（取得日付ごとズレる）
// ===================================================================
async function testGenba() {
  console.log('[genba.html]');
  const app = bootApp('genba.html', '2026-08-06', {
    onFetch: function (url) {
      if (url.indexOf('version.txt') >= 0) return '2026-08-06-03';
      return null;
    }
  });
  await app.settle();

  eq(app.w.eval('typeof ywToday'), 'function', 'day-gate.js が読み込まれている');
  eq(app.w.eval('jstTodayStr()'), '2026-08-06', 'jstTodayStr() が day-gate の今日を返す');
  eq(app.w.eval('TB_TODAY'), '2026-08-06', '起動時の TB_TODAY は 8/6');

  const boardTasks = function () {
    return app.jsonpUrls.filter(function (u) { return u.indexOf('board_tasks') >= 0; });
  };
  app.w.eval('tbFetchGasTasks()');
  await app.settle();
  eq(qs(boardTasks()[boardTasks().length - 1], 'date'), '2026-08-06', '起動時のGASリクエストは date=8/6');

  // 配置日付を今日にしておく（(A)の前提）
  app.doc.getElementById('assign-date').value = '2026-08-06';

  // ---- 日付またぎ ----
  app.rollTo('2026-08-07');
  await app.settle();

  eq(app.w.eval('TB_TODAY'), '2026-08-07', 'TB_TODAY が新しい今日へ追従する');
  eq(qs(boardTasks()[boardTasks().length - 1], 'date'), '2026-08-07',
    '★GASへのリクエストが新しい日付(8/7)で飛ぶ（昨日の日付で取りに行かない）');
  eq(app.w.eval('tbData.date'), '2026-08-07', 'タスクボードの保持日付も更新される');
  eq(app.val('assign-date'), '2026-08-07', '(A) 配置日付が 8/7 へ追従する');

  // ---- (B) 別日を表示していたら動かさない ----
  const app2 = bootApp('genba.html', '2026-08-06', {
    onFetch: function (url) {
      if (url.indexOf('version.txt') >= 0) return '2026-08-06-03';
      return null;
    }
  });
  await app2.settle();
  app2.doc.getElementById('assign-date').value = '2026-08-10';   // 意図して先の日付を見ている
  app2.rollTo('2026-08-07');
  await app2.settle();
  eq(app2.val('assign-date'), '2026-08-10', '(B) 意図して見ている日付は動かさない');
  eq(app2.w.eval('TB_TODAY'), '2026-08-07', '(B) でも TB_TODAY は更新される');
}

// ===================================================================
// 6) ケアマネ送付チェックリスト（2026-08-08 段階2）
//    このアプリは setInterval も visibilitychange も持たない＝自己回復しない。
//    日付またぎで render() が呼び直されることだけを見る。
//    ※render() の中の canFinalizeJisseki() は new Date() を直接読むため、
//      day-gate の偽時計では中身まで動かせない。ここでは「呼び直しの配線」を固定する。
// ===================================================================
async function testCaremanagerSoufu() {
  console.log('[ケアマネ送付チェックリスト.html]');
  const app = bootApp('ケアマネ送付チェックリスト.html', '2026-08-06', {
    onFetch: function (url) { return url.indexOf('version.txt') >= 0 ? CUR_VERSION : null; }
  });
  await app.settle();

  eq(typeof app.w.ywOnDayChange, 'function', 'day-gate.js が読み込まれている');
  eq(app.w.ywToday(), '2026-08-06', '起動時の今日は 8/6');

  // render を数えるスパイに差し替える（グローバル関数宣言なので window 経由で置換できる）
  app.w.eval('window.__renderCalls = 0; var __origRender = window.render;' +
    'window.render = function () { window.__renderCalls++; return __origRender.apply(this, arguments); };');
  const fetchesBefore = app.fetchUrls.length;

  app.rollTo('2026-08-07');
  await app.settle();

  eq(app.w.eval('window.__renderCalls'), 1, '日付またぎで render() がちょうど1回呼ばれる');
  eq(app.w.ywToday(), '2026-08-07', '保持していた今日も更新されている');
  eq(app.fetchUrls.length, fetchesBefore, '★通信はしない（fetchAll を呼ばずGASアクセスを増やさない）');
  eq(app.navAttempts.length, 0, 'ページ遷移（location.replace/reload）は起きない');

  // 二重登録していないこと（もう一度またいでも1回ずつ）
  app.rollTo('2026-08-08');
  await app.settle();
  eq(app.w.eval('window.__renderCalls'), 2, '2回目のまたぎでも呼び出しは1回ずつ（二重登録していない）');
}

// ===================================================================
// 7) cleaning（2026-08-08 段階2）
//    当番・ゴミ出しは自動更新(refreshLog→renderTasks)で自己回復する。
//    取り残されるのは updateDateDisplay() だけなので、そこだけを見る。
// ===================================================================
async function testCleaning() {
  console.log('[cleaning.html]');
  const app = bootApp('cleaning.html', '2026-08-06', {
    onFetch: function (url) { return url.indexOf('version.txt') >= 0 ? CUR_VERSION : null; }
  });
  await app.settle();

  eq(typeof app.w.ywOnDayChange, 'function', 'day-gate.js が読み込まれている');
  assert(/年.*月.*日/.test(app.text('headerDate') || ''), '起動時にヘッダ日付が描かれている');

  // updateDateDisplay() は new Date() を直接読むので、window.Date を固定して観測する。
  //   （day-gate 側の今日は __setClock で別途固定済み。ここは「描画が走ったか」を見るための細工）
  app.w.eval([
    '(function () {',
    '  var R = Date;',
    '  var fixed = new R(2026, 7, 7, 9, 0, 0).getTime();',   // 2026-08-07（月は0始まり）
    '  function F() {',
    '    if (arguments.length === 0) return new R(fixed);',
    '    return new (Function.prototype.bind.apply(R, [null].concat(Array.prototype.slice.call(arguments))))();',
    '  }',
    '  F.now = function () { return fixed; };',
    '  F.prototype = R.prototype;',
    '  window.Date = F;',
    '})();'
  ].join('\n'));

  app.rollTo('2026-08-07');
  await app.settle();

  eq(app.text('headerDate'), '2026年8月7日（金）', '★日付またぎでヘッダ日付が描き直される');
  eq(app.w.ywToday(), '2026-08-07', '保持していた今日も更新されている');
  eq(app.navAttempts.length, 0, 'ページ遷移（location.replace/reload）は起きない');
}

// ===================================================================
// 8) schedule（2026-08-08 段階2・案内バナー方式）
//
//    ★このアプリだけ (A)/(B) の自動追従をしない。onScheduleDateChange() は
//      orderedDayUsers / benchUsers / koukuChecked / sokuteiChecked / absentNames を
//      全部リセットして saveSettings() で保存し、さらにGASを2本叩くため、
//      夜勤帯に配置を組んでいる途中で0時をまたぐと作業が消えて戻せない。
//    ここは「帯が出るだけで状態が1バイトも変わらない」ことを固定する番人。
//    ここが壊れると現場の作業が消えるので、DOM と STATE の両方から見る。
// ===================================================================
async function testSchedule() {
  console.log('[schedule.html]');
  const app = bootApp('schedule.html', '2026-08-06', {
    onFetch: function (url) { return url.indexOf('version.txt') >= 0 ? CUR_VERSION : null; }
  });
  await app.settle();

  eq(typeof app.w.ywOnDayChange, 'function', 'day-gate.js が読み込まれている');
  eq(app.doc.getElementById('dayGateNotice').style.display, 'none', '起動時、案内帯は出ていない（レイアウトを押し広げない）');

  // 「夜勤帯に配置を組んでいる途中」を作る。ここが消えないことが本番の関心事。
  app.w.eval([
    'STATE.selectedDate = "2026-08-06";',
    'STATE.orderedDayUsers = ["利用者A", "利用者B"];',
    'STATE.benchUsers = ["利用者C"];',
    'STATE.koukuChecked = [0, 2];',
    'STATE.sokuteiChecked = [1];',
    'STATE.absentNames = ["利用者D"];'
  ].join(''));
  const snapKeys = ['orderedDayUsers', 'benchUsers', 'koukuChecked', 'sokuteiChecked', 'absentNames', 'selectedDate'];
  const before = {};
  snapKeys.forEach(function (k) { before[k] = app.w.eval('JSON.stringify(STATE.' + k + ')'); });
  const lsBefore = app.w.eval('JSON.stringify(Object.keys(localStorage).sort().map(function(k){return k + "=" + localStorage.getItem(k);}))');
  const fetchesBefore = app.fetchUrls.length;
  const jsonpBefore = app.jsonpUrls.length;

  // ---- 日付をまたぐ ----
  app.rollTo('2026-08-07');
  await app.settle();

  // (1) 帯が出ること
  eq(app.doc.getElementById('dayGateNotice').style.display, '', '日付またぎで案内帯が出る');
  has(app.text('dayGateNoticeText'), '2026-08-07', '帯に新しい今日が書かれている');
  has(app.text('dayGateNoticeText'), '2026-08-06', '帯に表示中の日付も書かれている');
  has(app.text('dayGateNotice'), '消えます', '★押すと配置が消えると帯に明示されている（押してから気づくのでは遅い）');

  // (2) ★状態が1バイトも変わらないこと（ここが本番の関心事）
  snapKeys.forEach(function (k) {
    eq(app.w.eval('JSON.stringify(STATE.' + k + ')'), before[k], '★' + k + ' は日付またぎで変化しない');
  });
  eq(app.w.eval('JSON.stringify(Object.keys(localStorage).sort().map(function(k){return k + "=" + localStorage.getItem(k);}))'),
    lsBefore, '★localStorage も変化しない（saveSettings が走っていない）');
  eq(app.fetchUrls.length, fetchesBefore, '★fetch は増えない（通信しない）');
  eq(app.jsonpUrls.length, jsonpBefore, '★JSONP も増えない（GASを叩かない）');
  eq(app.navAttempts.length, 0, 'ページ遷移（location.replace/reload）は起きない');

  // (3) 「閉じる」で帯だけ消える（状態は触らない）
  app.doc.getElementById('dayGateDismissBtn').dispatchEvent(new app.w.Event('click'));
  await app.settle();
  eq(app.doc.getElementById('dayGateNotice').style.display, 'none', '「閉じる」で帯が消える');
  eq(app.w.eval('JSON.stringify(STATE.orderedDayUsers)'), before.orderedDayUsers, '「閉じる」でも配置は残る');

  // (4) 押されたときだけ切り替わる（既存の onScheduleDateChange を通す）
  const app2 = bootApp('schedule.html', '2026-08-06', {
    onFetch: function (url) { return url.indexOf('version.txt') >= 0 ? CUR_VERSION : null; }
  });
  await app2.settle();
  app2.w.eval('STATE.selectedDate = "2026-08-06"; STATE.orderedDayUsers = ["利用者A"];');
  app2.w.eval('window.__oscCalls = 0; var __origOsc = window.onScheduleDateChange;' +
    'window.onScheduleDateChange = function () { window.__oscCalls++; return __origOsc.apply(this, arguments); };');
  app2.rollTo('2026-08-07');
  await app2.settle();
  eq(app2.w.eval('window.__oscCalls'), 0, '★帯が出ただけでは onScheduleDateChange は呼ばれない');

  app2.doc.getElementById('dayGateSwitchBtn').dispatchEvent(new app2.w.Event('click'));
  await app2.settle();
  eq(app2.w.eval('window.__oscCalls'), 1, '「切り替える」を押したときだけ onScheduleDateChange が呼ばれる');
  eq(app2.val('schedDateInput'), '2026-08-07', '押すと日付欄が今日へ変わる');
  eq(app2.doc.getElementById('dayGateNotice').style.display, 'none', '押した後は帯が消える');
}

// ===================================================================
// 9) 既存の版ゲートが従来どおり動くこと（今回の変更は追加のみ＝無改変であること）
// ===================================================================
const TARGETS = ['session-board.html', 'sougei-view.html', 'sched-grid.html', 'sougei_nisshi.html', 'genba.html',
  'ケアマネ送付チェックリスト.html', 'cleaning.html', 'schedule.html'];

async function testVersionGateIntact() {
  console.log('[版ゲート回帰]');
  // (a) ゲートのコード自体が genba.html（正本）と byte 単位で同一のまま
  const GATE_RE = /<script>\s*function gateShouldReload[\s\S]*?<\/script>/;
  const master = fs.readFileSync(path.join(ROOT, 'genba.html'), 'utf8').match(GATE_RE)[0];
  TARGETS.forEach(function (f) {
    const m = fs.readFileSync(path.join(ROOT, f), 'utf8').match(GATE_RE);
    assert(!!m && m[0] === master, f + ' の版ゲートブロックは無改変（genba と byte 一致）');
  });

  // (b) day-gate.js の <script> は版ゲートより後ろ（<head>最先頭の原則を崩していない）
  TARGETS.forEach(function (f) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(html.indexOf('gateShouldReload') < html.indexOf('day-gate.js'),
      f + ' の day-gate.js は版ゲートより後ろに置かれている');
  });

  // (c) 起動時に version.txt を読みにいき、?v= が古ければ最新版へ載せ替えようとする
  for (const f of TARGETS) {
    const stale = bootApp(f, '2026-08-06', {
      urlVersion: '2026-01-01-01',                      // わざと古い版で開く
      onFetch: function (url) { return url.indexOf('version.txt') >= 0 ? CUR_VERSION : null; }
    });
    await stale.settle();
    assert(stale.fetchUrls.some(function (u) { return u.indexOf('version.txt') >= 0; }),
      f + ' は起動時に version.txt を読む');
    assert(stale.navAttempts.length > 0, f + ' は古い ?v= のとき最新版へ載せ替えにいく（版ゲート健在）');

    const fresh = bootApp(f, '2026-08-06', {
      onFetch: function (url) { return url.indexOf('version.txt') >= 0 ? CUR_VERSION : null; }
    });
    await fresh.settle();
    eq(fresh.navAttempts.length, 0, f + ' は ?v= が最新なら載せ替えない');
  }

  // (c') ?v= が版上げスクリプトの同期対象に載っていること。
  //      載せずに ?v=<固定値> を書くと版が永久にピン留めされ、no-?v= より悪くなる（CLAUDE.md の罠）。
  const bump = fs.readFileSync(path.join(ROOT, 'scripts', 'bump-app-version.js'), 'utf8');
  const listed = (bump.match(/const DAY_GATE_HTMLS = \[([^\]]*)\]/) || [, ''])[1]
    .split(',').map(function (s) { return s.trim().replace(/^['"]|['"]$/g, ''); }).filter(Boolean).sort();
  const actual = fs.readdirSync(ROOT)
    .filter(function (f) { return /\.html$/.test(f) && /day-gate\.js\?v=/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')); })
    .sort();
  eq(JSON.stringify(listed), JSON.stringify(actual),
    'bump-app-version.js の DAY_GATE_HTMLS が day-gate.js?v= を書いた全HTMLと一致する');
  TARGETS.forEach(function (f) {
    const n = (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/day-gate\.js\?v=/g) || []).length;
    eq(n, 1, f + ' の day-gate.js?v= はちょうど1箇所');
  });

  // (d) 日付またぎでは載せ替えない（自動リロード禁止・入力途中を消さない）
  const app = bootApp('session-board.html', '2026-08-06', {
    onFetch: function (url) { return url.indexOf('version.txt') >= 0 ? CUR_VERSION : null; }
  });
  await app.settle();
  app.rollTo('2026-08-07');
  await app.settle();
  eq(app.navAttempts.length, 0, '日付またぎでページ遷移（location.replace/reload）は起きない');
}

// ===================================================================
(async function main() {
  await testVersionGateIntact();
  await testSessionBoard();
  await testSougeiView();
  await testSchedGrid();
  await testSougeiNisshi();
  await testGenba();
  await testCaremanagerSoufu();
  await testCleaning();
  await testSchedule();
  console.log('');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
