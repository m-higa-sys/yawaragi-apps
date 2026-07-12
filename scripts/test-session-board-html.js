// セッションボード フロント session-board.html の描画スモークテスト（DOMスタブ・素node）
// 実行: node scripts/test-session-board-html.js
// jsdom非依存。本番fetch(JSONP)をモック（要求dateをエコー）し、fetchBoard→boot→render の実経路で
// demo描画・タブ厳格フィルタ・当日内タブ記憶（実今日基準）・conflictバナー・localStorage保存・
// 日付ナビ（前日/翌日/今日/picker・タブ維持）・reqId連打ガードを検証する。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'session-board.html'), 'utf8');
const lastOpen = html.lastIndexOf('<script>');
const code = html.slice(lastOpen + '<script>'.length, html.indexOf('</script>', lastOpen));

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function addDays(s, delta) { var p = s.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2] + delta); return ymd(d); }
function mdOf(s) { var p = s.split('-'); return (+p[1]) + '/' + (+p[2]); }
const TODAY = ymd(new Date());

// board GAS が返すレスポンス相当（要求dateをエコー・行にsession）
function makeFixture(date) {
  var p = date.split('-');
  return {
    ok: true, date: date, year: +p[0], month: +p[1],
    presentCount: 22, presentAm: 12, presentPm: 10,
    ampmConflict: [{ name: '例外 花子', key: '例外花子' }],
    sokutei: [
      { name: '田中 一郎', key: '田中一郎', care: '要介護2', track: 'kaigo', session: 'am', remaining: 3, weeklyVisits: 1, remainingVisits: 1, absenceRate: 0.4 },
      { name: '鈴木 花子', key: '鈴木花子', care: '要介護1', track: 'kaigo', session: 'pm', remaining: 8, weeklyVisits: 2, remainingVisits: 2, absenceRate: 0.1 }
    ],
    koukuMoni: [{ name: '高橋 太郎', key: '高橋太郎', role: 'moni1', session: 'am' }],
    koukuTaisou: [{ name: '井上 健', key: '井上健', session: 'am' }, { name: '清水 保', key: '清水保', session: 'pm' }],
    kotan: [{ name: '田中 一郎', key: '田中一郎', care: '要介護2', session: 'am' }],
    birthday: [{ name: '加藤 信', key: '加藤信', month: +p[1], day: 15 }],
    residue: [{ name: '新規 太郎（体験）', key: '新規太郎（体験）', session: 'am' }]
  };
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }

// session-board.html を起動（JSONPをモックしFIXTUREを返す）→ 操作ハンドルを返す
// opts.manual=true: 初回ロード後の fetch は自動発火せず fireAt() で手動発火（reqId検証用）
function runBoard(initialStore, opts) {
  opts = opts || {};
  const els = {};
  function mkEl(id) {
    return {
      id, textContent: '', innerHTML: '', className: '', value: '', style: {}, _attrs: {}, _h: {},
      addEventListener(ev, fn) { this._h[ev] = fn; },
      fire(ev) { if (this._h[ev]) this._h[ev](); },
      getAttribute(a) { return this._attrs[a]; }
    };
  }
  function getEl(id) { if (!els[id]) els[id] = mkEl(id); return els[id]; }
  const amBtn = mkEl('tab-am'); amBtn._attrs['data-tab'] = 'am';
  const pmBtn = mkEl('tab-pm'); pmBtn._attrs['data-tab'] = 'pm';

  const store = Object.assign({}, initialStore || {});
  const localStorageStub = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  const sandbox = {
    localStorage: localStorageStub,
    location: { search: '', href: 'https://x/session-board.html' },
    console, Date, JSON, Math, encodeURIComponent, decodeURIComponent, parseInt, URL, URLSearchParams, setTimeout, clearTimeout
  };
  sandbox.window = sandbox;

  const requestedDates = [];
  const pending = [];
  let inited = false;
  function fireRec(rec) { if (typeof sandbox[rec.cb] === 'function') sandbox[rec.cb](makeFixture(rec.date)); }
  const documentStub = {
    getElementById: getEl,
    querySelectorAll(sel) { return sel === '#tabs .tab' ? [amBtn, pmBtn] : []; },
    createElement() { return { _src: '', set src(v) { this._src = v; }, get src() { return this._src; }, onerror: null }; },
    head: {
      appendChild(elm) {
        var src = String(elm.src || '');
        var cbm = src.match(/[?&]callback=([^&]+)/);
        var dm = src.match(/[?&]date=([^&]+)/);
        var rec = { cb: cbm ? cbm[1] : '', date: dm ? decodeURIComponent(dm[1]) : '' };
        requestedDates.push(rec.date);
        pending.push(rec);
        if (!opts.manual || !inited) fireRec(rec);  // 初回は必ず自動発火
      }
    }
  };
  sandbox.document = documentStub;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  inited = true;
  return {
    getEl, amBtn, pmBtn, store, requestedDates, pending,
    fireAt(i) { fireRec(pending[i]); }
  };
}

// ===== A. 本番fetch(モック)→初期描画（当日=TODAY・同日'am'seedでam決定化）=====
var r = runBoard({ 'sessionBoard_tab': JSON.stringify({ date: TODAY, tab: 'am' }) });
ok(r.requestedDates[0] === TODAY, 'A1: 初回fetchは実今日(todayYMD)を叩く');
ok(r.getEl('dnum').textContent === mdOf(TODAY), 'A2: 日付大表示=今日 ' + mdOf(TODAY));
ok(r.getEl('datePick').value === TODAY, 'A3: 日付pickerに今日が入る');
ok(r.getEl('conflict').innerHTML.indexOf('例外 花子') >= 0, 'A4: conflictバナーに衝突者名');
ok(r.getEl('amCnt').textContent == 12 && r.getEl('pmCnt').textContent == 10, 'A5: タブ人数 am12/pm10');
ok(r.amBtn.className.indexOf('on') >= 0, 'A6: 同日seedでamタブ選択');
var boardAm = r.getEl('board').innerHTML;
ok(boardAm.indexOf('田中 一郎') >= 0 && boardAm.indexOf('鈴木 花子') < 0, 'A7: am厳格フィルタ(田中在/鈴木不在)');
ok(boardAm.indexOf('加藤 信') >= 0, 'A8: 誕生日はタブ外常時表示');
ok(boardAm.indexOf('新規 太郎（体験）') >= 0, 'A9: residue(am)表示');

// ===== B. pmタブ切替（厳格分離・実今日基準でlocalStorage保存）=====
r.pmBtn.fire('click');
var boardPm = r.getEl('board').innerHTML;
ok(r.pmBtn.className.indexOf('on') >= 0 && boardPm.indexOf('鈴木 花子') >= 0 && boardPm.indexOf('田中 一郎') < 0, 'B1: pmタブで厳格分離');
ok(boardPm.indexOf('清水 保') >= 0, 'B2: pmの口腔体操チップ(清水保)');
ok(r.store['sessionBoard_tab'] && JSON.parse(r.store['sessionBoard_tab']).tab === 'pm', 'B3: タブ選択をlocalStorage保存');
ok(JSON.parse(r.store['sessionBoard_tab']).date === TODAY, 'B4: 保存は実今日(todayYMD)基準');

// ===== C. topN 可変・localStorage保存（日付非依存）=====
r.getEl('nMinus').fire('click'); r.getEl('nMinus').fire('click');
ok(r.getEl('nVal').textContent == 1 && r.store['sessionBoard_topN'] === '1', 'C1: topN=1に減算＋保存');

// ===== D. 日付ナビ: 翌日/前日/今日/picker（タブ維持）=====
r.getEl('nextDay').fire('click');
ok(r.requestedDates[r.requestedDates.length - 1] === addDays(TODAY, 1), 'D1: 翌日ボタンで日付+1をfetch');
ok(r.getEl('dnum').textContent === mdOf(addDays(TODAY, 1)), 'D2: 表示日付が翌日に更新');
ok(r.pmBtn.className.indexOf('on') >= 0, 'D3: 日付ナビでタブ維持(pmのまま)');
ok(r.getEl('datePick').value === addDays(TODAY, 1), 'D4: pickerも翌日に追随');
r.getEl('prevDay').fire('click'); r.getEl('prevDay').fire('click');
ok(r.requestedDates[r.requestedDates.length - 1] === addDays(TODAY, -1), 'D5: 前日ボタンで日付-1');
r.getEl('todayBtn').fire('click');
ok(r.requestedDates[r.requestedDates.length - 1] === TODAY, 'D6: 今日ボタンで実今日に戻る');
r.getEl('datePick').value = '2026-07-20';
r.getEl('datePick').fire('change');
ok(r.requestedDates[r.requestedDates.length - 1] === '2026-07-20', 'D7: pickerで任意日をfetch');
ok(r.getEl('dnum').textContent === '7/20', 'D8: picker指定日で表示更新');
ok(JSON.parse(r.store['sessionBoard_tab']).date === TODAY, 'D9: 日付ナビしてもタブ記憶の日付は実今日のまま');

// ===== E. 当日内タブ記憶（同日seed尊重）＋ stale日付は自動リセット =====
var r2 = runBoard({ 'sessionBoard_tab': JSON.stringify({ date: TODAY, tab: 'pm' }) });
ok(r2.pmBtn.className.indexOf('on') >= 0, 'E1: 同日保存tab=pmを初期尊重');
var expectedAuto = (new Date().getHours() < 12) ? 'am' : 'pm';
var r3 = runBoard({ 'sessionBoard_tab': JSON.stringify({ date: '2000-01-01', tab: 'pm' }) });
var selEl = expectedAuto === 'am' ? r3.amBtn : r3.pmBtn;
var otherEl = expectedAuto === 'am' ? r3.pmBtn : r3.amBtn;
ok(selEl.className.indexOf('on') >= 0 && otherEl.className.indexOf('on') < 0,
   'E2: stale日付は無視し時間帯自動(' + expectedAuto + ')に戻す');

// ===== F. reqId連打ガード（古い応答が後着しても最新日付が残る）=====
var rm = runBoard({ 'sessionBoard_tab': JSON.stringify({ date: TODAY, tab: 'am' }) }, { manual: true });
rm.getEl('nextDay').fire('click');   // 要求A: TODAY+1（保留）
rm.getEl('nextDay').fire('click');   // 要求B: TODAY+2（保留）
var iA = rm.pending.length - 2, iB = rm.pending.length - 1;
ok(rm.pending[iA].date === addDays(TODAY, 1) && rm.pending[iB].date === addDays(TODAY, 2), 'F1: 2要求が保留(+1,+2)');
rm.fireAt(iB);  // 新しい方(B=+2)を先に発火
ok(rm.getEl('dnum').textContent === mdOf(addDays(TODAY, 2)), 'F2: 新要求(+2)が描画される');
rm.fireAt(iA);  // 古い方(A=+1)が後着 → reqIdガードで無視されるはず
ok(rm.getEl('dnum').textContent === mdOf(addDays(TODAY, 2)), 'F3: 古い応答(+1)後着でも+2のまま(reqIdガード)');

// ===== G. 「今日ではない日」を見ているとわかる表示（過去/未来の警告）=====
var rg = runBoard({ 'sessionBoard_tab': JSON.stringify({ date: TODAY, tab: 'am' }) });
ok(rg.getEl('dstate').textContent === '' && rg.getEl('dstate').className.indexOf('on') < 0, 'G1: 今日は状態ラベル非表示(空・onなし)');
rg.getEl('nextDay').fire('click');
ok(/未来/.test(rg.getEl('dstate').textContent), 'G2: 未来日で「未来の日付」警告テキスト');
ok(rg.getEl('dstate').className.indexOf('on') >= 0, 'G3: 未来日で dstate に on クラス(色付き表示)');
rg.getEl('todayBtn').fire('click');
ok(rg.getEl('dstate').textContent === '' && rg.getEl('dstate').className.indexOf('on') < 0, 'G4: 今日に戻すと警告解除');
rg.getEl('prevDay').fire('click');
ok(/過去/.test(rg.getEl('dstate').textContent) && rg.getEl('dstate').className.indexOf('on') >= 0, 'G5: 過去日で「過去の日付」警告');

// ===== H. 日付変更中の読み込み中表示（無反応連打の防止）=====
var rh = runBoard({ 'sessionBoard_tab': JSON.stringify({ date: TODAY, tab: 'am' }) }, { manual: true });
ok(rh.getEl('loadInd').textContent === '', 'H1: 初期ロード完了後は読み込み表示なし');
rh.getEl('nextDay').fire('click');   // 応答は保留(manual)
ok(/読み込み|読込|⟳/.test(rh.getEl('loadInd').textContent), 'H2: 日付変更中は読み込み中表示が出る');
rh.fireAt(rh.pending.length - 1);    // 応答受領
ok(rh.getEl('loadInd').textContent === '', 'H3: 応答受領で読み込み表示クリア');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
