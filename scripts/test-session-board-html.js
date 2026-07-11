// セッションボード フロント session-board.html の描画スモークテスト（DOMスタブ・素node）
// 実行: node scripts/test-session-board-html.js
// jsdom非依存。session-board.html の本文スクリプトを vm で実行し、demo描画・タブ厳格フィルタ・
// 当日内タブ記憶（日付変で自動リセット）・conflictバナー・localStorage保存を検証する。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'session-board.html'), 'utf8');
const lastOpen = html.lastIndexOf('<script>');
const code = html.slice(lastOpen + '<script>'.length, html.indexOf('</script>', lastOpen));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }

// session-board.html を demo モードで1回起動し、DOM要素スタブ群を返す
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
  const documentStub = {
    getElementById: getEl,
    querySelectorAll(sel) { return sel === '#tabs .tab' ? [amBtn, pmBtn] : []; },
    createElement() { return { set src(v) {}, onerror: null }; },
    head: { appendChild() {} }
  };
  const store = Object.assign({}, initialStore || {});
  const localStorageStub = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  const sandbox = {
    document: documentStub, localStorage: localStorageStub,
    location: { search: '?demo=1', href: 'https://x/session-board.html?demo=1' },
    console, Date, JSON, Math, encodeURIComponent, parseInt, URL, URLSearchParams, setTimeout, clearTimeout
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { getEl, amBtn, pmBtn, store };
}

// ===== A. demo初期描画（同日'am'をseedしamを決定化）=====
var r = runBoard({ 'sessionBoard_tab': JSON.stringify({ date: '2026-07-13', tab: 'am' }) });
ok(r.getEl('dnum').textContent === '7/13', 'A1: 日付大表示 7/13');
ok(r.getEl('dwk').textContent === '月', 'A2: 曜日 月');
ok(r.getEl('ribbon').className === 'demo-ribbon', 'A3: demoリボン表示');
ok(r.getEl('conflict').innerHTML.indexOf('例外 花子') >= 0, 'A4: conflictバナーに衝突者名');
ok(r.getEl('conflict').innerHTML.indexOf('AM/PM両方に出席登録') >= 0, 'A5: conflictバナー文言');
ok(r.getEl('amCnt').textContent == 12 && r.getEl('pmCnt').textContent == 10, 'A6: タブ人数 am12/pm10');
ok(r.amBtn.className.indexOf('on') >= 0, 'A7: 同日seedでamタブ選択');
var boardAm = r.getEl('board').innerHTML;
ok(boardAm.indexOf('田中 一郎') >= 0, 'A8: am測定に田中一郎');
ok(boardAm.indexOf('鈴木 花子') < 0, 'A9: pm専用の鈴木花子はamに出ない（厳格フィルタ）');
ok(boardAm.indexOf('未撮影') >= 0 && boardAm.indexOf('加藤 信') >= 0, 'A10: 誕生日はタブ外常時表示');
ok(boardAm.indexOf('新規 太郎（体験）') >= 0, 'A11: residue(am)表示');

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
