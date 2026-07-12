// セッションボード フロント session-board.html の描画スモークテスト（DOMスタブ・素node）
// 実行: node scripts/test-session-board-html.js
// jsdom非依存。本番fetch(JSONP)をモックし、fetchBoard→boot→render の実経路で
// demo描画・タブ厳格フィルタ・当日内タブ記憶（日付変で自動リセット）・conflictバナー・localStorage保存を検証する。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'session-board.html'), 'utf8');
const lastOpen = html.lastIndexOf('<script>');
const code = html.slice(lastOpen + '<script>'.length, html.indexOf('</script>', lastOpen));

// board GAS が返すレスポンス相当（sbBuildBoard_出力契約・行にsession）。JSONPで返る想定。
const FIXTURE = {
  ok: true, date: '2026-07-13', year: 2026, month: 7,
  presentCount: 22, presentAm: 12, presentPm: 10,
  ampmConflict: [{ name: '例外 花子', key: '例外花子' }],
  sokutei: [
    { name: '田中 一郎', key: '田中一郎', care: '要介護2', track: 'kaigo', session: 'am', remaining: 3, weeklyVisits: 1, remainingVisits: 1, absenceRate: 0.4 },
    { name: '佐々木 実', key: '佐々木実', care: '要介護3', track: 'kaigo', session: 'am', remaining: 12, weeklyVisits: 3, remainingVisits: 4, absenceRate: 0.0 },
    { name: '中村 明', key: '中村明', care: '事業対象者', track: 'shien', session: 'am', remaining: -999, unmeasured: true, weeklyVisits: 2, remainingVisits: 3, absenceRate: 0.2 },
    { name: '鈴木 花子', key: '鈴木花子', care: '要介護1', track: 'kaigo', session: 'pm', remaining: 8, weeklyVisits: 2, remainingVisits: 2, absenceRate: 0.1 },
    { name: '小林 桃子', key: '小林桃子', care: '要支援1', track: 'shien', session: 'pm', remaining: 22, unmeasured: false, weeklyVisits: 5, remainingVisits: 10, absenceRate: 0.0 }
  ],
  koukuMoni: [
    { name: '高橋 太郎', key: '高橋太郎', role: 'moni1', session: 'am' },
    { name: '伊藤 めぐみ', key: '伊藤めぐみ', role: 'moni2', session: 'pm' }
  ],
  koukuTaisou: [
    { name: '井上 健', key: '井上健', session: 'am' }, { name: '清水 保', key: '清水保', session: 'pm' }
  ],
  kotan: [
    { name: '田中 一郎', key: '田中一郎', care: '要介護2', session: 'am' },
    { name: '鈴木 花子', key: '鈴木花子', care: '要介護1', session: 'pm' }
  ],
  birthday: [
    { name: '加藤 信', key: '加藤信', month: 7, day: 15 }, { name: '吉田 昭', key: '吉田昭', month: 7, day: 28 }
  ],
  residue: [{ name: '新規 太郎（体験）', key: '新規太郎（体験）', session: 'am' }]
};

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }

// session-board.html を起動（fetchBoardのJSONPをモックしFIXTUREを返す）→ DOM要素スタブ群を返す
function runBoard(initialStore) {
  const els = {};
  function mkEl(id) {
    return {
      id, textContent: '', innerHTML: '', className: '', style: {}, _attrs: {}, _click: null,
      addEventListener(ev, fn) { if (ev === 'click') this._click = fn; },
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
    console, Date, JSON, Math, encodeURIComponent, parseInt, URL, URLSearchParams, setTimeout, clearTimeout
  };
  sandbox.window = sandbox;
  // JSONPモック: appendChild(script) 時に callback を FIXTURE で発火（実 fetchBoard→boot→render 経路を通す）
  const documentStub = {
    getElementById: getEl,
    querySelectorAll(sel) { return sel === '#tabs .tab' ? [amBtn, pmBtn] : []; },
    createElement() { return { _src: '', set src(v) { this._src = v; }, get src() { return this._src; }, onerror: null }; },
    head: {
      appendChild(elm) {
        var m = String(elm.src || '').match(/[?&]callback=([^&]+)/);
        if (m && typeof sandbox[m[1]] === 'function') sandbox[m[1]](FIXTURE);
      }
    }
  };
  sandbox.document = documentStub;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { getEl, amBtn, pmBtn, store };
}

// ===== A. 本番fetch(モック)→初期描画（同日'am'をseedしamを決定化）=====
var r = runBoard({ 'sessionBoard_tab': JSON.stringify({ date: '2026-07-13', tab: 'am' }) });
ok(r.getEl('dnum').textContent === '7/13', 'A1: 日付大表示 7/13（JSONP応答のdateで描画）');
ok(r.getEl('dwk').textContent === '月', 'A2: 曜日 月');
ok(r.getEl('conflict').innerHTML.indexOf('例外 花子') >= 0, 'A3: conflictバナーに衝突者名');
ok(r.getEl('conflict').innerHTML.indexOf('AM/PM両方に出席登録') >= 0, 'A4: conflictバナー文言');
ok(r.getEl('amCnt').textContent == 12 && r.getEl('pmCnt').textContent == 10, 'A5: タブ人数 am12/pm10');
ok(r.amBtn.className.indexOf('on') >= 0, 'A6: 同日seedでamタブ選択');
var boardAm = r.getEl('board').innerHTML;
ok(boardAm.indexOf('田中 一郎') >= 0, 'A7: am測定に田中一郎');
ok(boardAm.indexOf('鈴木 花子') < 0, 'A8: pm専用の鈴木花子はamに出ない（厳格フィルタ）');
ok(boardAm.indexOf('未撮影') >= 0 && boardAm.indexOf('加藤 信') >= 0, 'A9: 誕生日はタブ外常時表示');
ok(boardAm.indexOf('新規 太郎（体験）') >= 0, 'A10: residue(am)表示');

// ===== B. pmタブへ切替（厳格分離・当日付きlocalStorage保存）=====
r.pmBtn._click();
var boardPm = r.getEl('board').innerHTML;
ok(r.pmBtn.className.indexOf('on') >= 0, 'B1: pmタブ選択');
ok(boardPm.indexOf('鈴木 花子') >= 0, 'B2: pm測定に鈴木花子');
ok(boardPm.indexOf('田中 一郎') < 0, 'B3: am専用の田中一郎はpmに出ない');
ok(boardPm.indexOf('清水 保') >= 0, 'B4: pmの口腔体操チップ(清水保)');
ok(r.store['sessionBoard_tab'] && JSON.parse(r.store['sessionBoard_tab']).tab === 'pm', 'B5: タブ選択をlocalStorage保存');
ok(JSON.parse(r.store['sessionBoard_tab']).date === '2026-07-13', 'B6: 保存に日付（当日内スコープ）');

// ===== C. topN 可変・localStorage保存 =====
r.getEl('nMinus')._click(); r.getEl('nMinus')._click(); // 3→2→1
ok(r.getEl('nVal').textContent == 1, 'C1: topN=1に減算');
ok(r.store['sessionBoard_topN'] === '1', 'C2: topNもlocalStorage保存');

// ===== D. 当日内タブ記憶（同日seedを尊重）=====
var r2 = runBoard({ 'sessionBoard_tab': JSON.stringify({ date: '2026-07-13', tab: 'pm' }) });
ok(r2.pmBtn.className.indexOf('on') >= 0, 'D1: 同日保存tab=pmを初期尊重');

// ===== E. 日付が変わったら自動リセット（stale日付は無視し時間帯自動）=====
var expectedAuto = (new Date().getHours() < 12) ? 'am' : 'pm';
var r3 = runBoard({ 'sessionBoard_tab': JSON.stringify({ date: '2000-01-01', tab: 'pm' }) });
var selEl = expectedAuto === 'am' ? r3.amBtn : r3.pmBtn;
var otherEl = expectedAuto === 'am' ? r3.pmBtn : r3.amBtn;
ok(selEl.className.indexOf('on') >= 0 && otherEl.className.indexOf('on') < 0,
   'E1: stale日付は無視し時間帯自動(' + expectedAuto + ')に戻す');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
