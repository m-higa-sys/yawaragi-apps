// test-sokutei-search-and-load.js
// sokutei.html の2件をまとめて検証する（2026-08-03）。
//
// ■案A: 名前検索を「🔍 絞り込み」の外へ出す
//   機能は前からあったが、既定で畳まれているバーの中の4番目にあり社長がたどり着けなかった。
//   置き場所だけを移す。マッチング（ufSearchKey / ufMatchQuery）は1バイトも変えない。
//   ★移設で一番壊れやすいのは「入力中に再描画されてもカーソルが飛ばない」こと。
//     入力欄を JS で作り直さない（body の静的マークアップに置く）ことで構造的に潰す。
//
// ■利用率エラー: 日付ナビ連打による多重ロード
//   ① load() に多重実行ガード（新しい要求を優先し、古い通信は abort して結果を捨てる）
//   ③ usage_stats は選択日に依存しないので日付ナビでは取り直さない
//
// 実行: node scripts/test-sokutei-search-and-load.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'sokutei.html'), 'utf8');
const open = html.indexOf('<script>');
const script0 = html.slice(open + '<script>'.length, html.indexOf('</script>', open))
  .replace(/\nload\(\);\s*$/, '\n');
const body = html.slice(html.indexOf('<body>'), html.indexOf('<script>'));

let pass = 0, fail = 0;
function eq(a, e, l) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('  PASS ' + l); }
  else { fail++; console.log('  FAIL ' + l + '\n    actual  =' + A + '\n    expected=' + E); }
}
function ok(c, l) { eq(!!c, true, l); }
function sec(t) { console.log('\n[' + t + ']'); }

function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('関数が見つかりません: ' + name);
  const b = src.indexOf('{', s); let d = 0, i = b;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}
const shared = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
const yoteiSrc = fs.readFileSync(path.join(ROOT, 'gas', 'yawaragi-board', 'yotei-core.js'), 'utf8');
const measureSrc = fs.readFileSync(path.join(ROOT, 'measure-core.js'), 'utf8');

const TODAY = '2026-08-03';

// ---- DOM スタブ ----
function makeEl(id) {
  return {
    id: id, _in: '', _tx: '', value: '', disabled: false, style: {}, options: [], className: '',
    _focusCount: 0, _valueWrites: 0,
    set innerHTML(v) { this._in = v; }, get innerHTML() { return this._in; },
    set textContent(v) { this._tx = v; }, get textContent() { return this._tx; },
    classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } },
    addEventListener(type, fn) { (this._ev = this._ev || {})[type] = fn; },
    focus() { this._focusCount++; els.__active = this; },
    setSelectionRange() { },
    querySelector(sel) {
      if (!this._q) this._q = {};
      if (!this._q[sel]) this._q[sel] = { textContent: '', onclick: null, disabled: false };
      return this._q[sel];
    }
  };
}
let els = {};
function elFor(id) {
  if (!els[id]) {
    els[id] = makeEl(id);
    // 入力欄は value への代入回数を数える（再描画のたびに書き戻すとカーソルが飛ぶため）
    if (id === 'ufQuery') {
      let v = '';
      Object.defineProperty(els[id], 'value', {
        get() { return v; },
        set(nv) { v = nv; this._valueWrites++; }
      });
    }
  }
  return els[id];
}

// ---- fetch スタブ（手動で解決できる／abort を観測できる）----
let pending = [];
let fetchLog = [];
function actionOf(url) { const m = String(url).match(/action=([a-zA-Z_]+)/); return m ? m[1] : '?'; }
function fetchStub(url, opt) {
  const rec = { url: url, action: actionOf(url), aborted: false };
  fetchLog.push(rec);
  const p = new Promise((res, rej) => { rec._res = res; rec._rej = rej; });
  if (opt && opt.signal) {
    if (opt.signal.aborted) { rec.aborted = true; rec._rej(new Error('AbortError')); return p; }
    opt.signal.addEventListener('abort', () => {
      rec.aborted = true;
      rec._rej(new Error('AbortError'));
    });
  }
  pending.push(rec);
  return p;
}
// 溜まっている通信を（abort されていないものだけ）まとめて解決する
function flush(overrides) {
  const now = pending; pending = [];
  now.forEach(r => {
    if (r.aborted) return;
    const o = (overrides && overrides[r.action]) || null;
    r._res({ ok: true, json: () => Promise.resolve(o || dataFor(r)) });
  });
}
function countBy(action) { return fetchLog.filter(r => r.action === action).length; }
// 本番コードが getElementById で触るまで els には現れない。未生成なら落とさず印を返す。
function dispOf(id) { return els[id] ? els[id].style.display : '(要素が未生成)'; }
function elOf(id) { return els[id] || makeEl(id); }

// ---- 固定データ（すべてダミー名。実利用者名は使わない）----
const KAIGO_USERS = [
  { userId: 'ダミー田中', name: 'ダミー田中', furigana: 'ダミータナカ', category: '要介護2', days: '月水', planStart: '2026-04', planMonths: 3 },
  { userId: 'ダミー佐藤', name: 'ダミー佐藤', furigana: 'ダミーサトウ', category: '要介護1', days: '火木', planStart: '2026-04', planMonths: 3 }
];
const TSUSHO_USERS = [{ userId: 'ダミー高橋', name: 'ダミー高橋', furigana: 'ダミータカハシ', category: '要支援2', cancelled: false }];
const USER_LIST = [
  { userName: 'ダミー田中', userNameKana: 'ダミータナカ', days: '月水', ampm: '午前' },
  { userName: 'ダミー佐藤', userNameKana: 'ダミーサトウ', days: '火木', ampm: '午後' },
  { userName: 'ダミー高橋', userNameKana: 'ダミータカハシ', days: '月木', ampm: '月午前、木午後' }
];
let USAGE_TAG = 'first';    // usage_stats の応答に印を付けて「取り直したか」を見る
function dataFor(r) {
  switch (r.action) {
    case 'attendance': return { success: true, date: (String(r.url).match(/date=([\d-]+)/) || [])[1], attendance: { am: [], pm: [] } };
    case 'usage_stats': return { success: true, usageStats: { operationStart: '2026-04-06', users: [], __tag: USAGE_TAG } };
    case 'getKeikakushoYear': return String(r.url).indexOf('year=2026') >= 0
      ? { ok: true, users: KAIGO_USERS, records: [] } : { ok: true, users: [], records: [] };
    case 'staff_list': return { success: true, staff: ['スタッフX', 'スタッフY'] };
    case 'getShienSokutei': return { ok: true, records: [] };
    case 'user_list': return { success: true, user_list: USER_LIST };
    case 'getTsushoPlansYearV2': return { ok: true, users: TSUSHO_USERS };
    case 'getYotei': return { ok: true, domain: 'sokutei', records: [] };
    case 'getSokuteiOutput': return { ok: true, records: [], legacy: [] };
    case 'absences': return { success: true, absences: { longTerm: [] } };
    default: return {};
  }
}

class FixedDate extends Date {
  constructor(...a) { if (!a.length) super(TODAY + 'T09:00:00+09:00'); else super(...a); }
  static now() { return new Date(TODAY + 'T09:00:00+09:00').getTime(); }
}
class ACStub {
  constructor() {
    const listeners = [];
    this.signal = {
      aborted: false, _l: listeners,
      addEventListener(t, f) { listeners.push(f); }
    };
  }
  abort() { if (this.signal.aborted) return; this.signal.aborted = true; this.signal._l.slice().forEach(f => f()); }
}

function makeSandbox() {
  const sandbox = {
    document: {
      getElementById: elFor,
      createElement: () => ({ _t: '', set textContent(v) { this._t = String(v); }, get innerHTML() { return this._t; } }),
      querySelector: () => null,
      get activeElement() { return els.__active || null; }
    },
    fetch: fetchStub,
    AbortController: ACStub,
    alert: () => { },
    console: console,
    Date: FixedDate,
    setTimeout: (fn) => 0, clearTimeout: () => { },
    encodeURIComponent, decodeURIComponent,
    Math, JSON, Promise, Array, String, Object, Number, Boolean, RegExp, isNaN, parseInt, parseFloat
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  ['sokuteiCycleMonths_', 'sokuteiDueDate_'].forEach(n => vm.runInContext(extractFn(shared, n), sandbox));
  vm.runInContext(yoteiSrc.replace(/if \(typeof module[\s\S]*$/, ''), sandbox);
  vm.runInContext(measureSrc.replace(/if \(typeof module[\s\S]*$/, ''), sandbox);
  vm.runInContext(script0, sandbox);
  // let/const の束縛は vm のグローバルオブジェクトに載らないため、読み書きの橋渡しだけ足す。
  // （sokutei.html 側のソースは1バイトも書き換えない）
  vm.runInContext([
    'function __state() { return state; }',
    'function __uf() { return uf; }',
    'function __ufOpen() { return ufOpen; }',
    'function __careFilter() { return careFilter; }',
    'function __setPeriod(n) { periodMonths = n; }',
    'function __setUsageKey(k) { usageCacheKey = k; }'
  ].join('\n'), sandbox);
  return sandbox;
}
function reset() { els = {}; pending = []; fetchLog = []; USAGE_TAG = 'first'; }
// マイクロタスクを回して await 連鎖を進める
function tick(n) {
  let p = Promise.resolve();
  for (let i = 0; i < (n || 8); i++) p = p.then(() => { });
  return p;
}

(async () => {
  let S;

  // =====================================================================
  sec('案A-1 検索欄は「🔍 絞り込み」の外（body の静的マークアップ）にある');
  {
    const iUf = body.indexOf('id="ufbar"');
    const iSearch = body.indexOf('id="searchbar"');
    const iInput = body.indexOf('id="ufQuery"');
    ok(iSearch >= 0, 'body に検索バー（#searchbar）がある');
    ok(iInput >= 0, 'body に検索欄（#ufQuery）がある');
    ok(iSearch < iUf, '検索バーは絞り込みバーより上にある');
    // #ufQuery が #searchbar の中にあること（#ufbar は空 div なので中には入りえない）
    const sbStart = body.indexOf('<div id="searchbar"');
    const sbEnd = body.indexOf('</div>', body.indexOf('id="ufQuery"'));
    ok(sbStart >= 0 && iInput > sbStart && sbEnd > iInput, '検索欄は検索バーの中にある');
    ok(body.indexOf('id="ufbar"') >= 0 && /<div id="ufbar"[^>]*><\/div>/.test(body), '絞り込みバーは空 div のまま（中身は JS 生成）');
  }

  sec('案A-2 絞り込みバーの生成HTMLから検索欄が消えている（機能を2箇所に置かない）');
  {
    reset(); S = makeSandbox();
    S.__state().userList = USER_LIST; S.buildDerived();
    S.renderFilterBar();
    const bar = elOf('ufbar').innerHTML;
    ok(bar.indexOf('ufQuery') < 0, '絞り込みバーの中に ufQuery は無い');
    ok(bar.indexOf('名前で探す') < 0, '「名前で探す」の行も無い');
    ok(bar.indexOf('介護度') >= 0 && bar.indexOf('時間帯') >= 0, '介護度・時間帯は従来どおり残っている');
    ok(bar.indexOf('絞り込みをクリア') >= 0, 'クリアボタンも残っている');
  }

  sec('案A-3 バーを開かなくても検索欄が使える');
  {
    reset(); S = makeSandbox();
    S.__state().userList = USER_LIST; S.buildDerived();
    eq(S.__ufOpen(), false, '絞り込みバーは既定で畳まれている（従来どおり）');
    S.showTab(2);
    eq(dispOf('searchbar'), '', '畳んだままでも検索バーは表示されている');
    ok(!!(elOf('ufQuery')._ev && elOf('ufQuery')._ev.input), '検索欄に input ハンドラが付いている（起動時に1回だけ）');
  }

  sec('案A-4 表示条件は絞り込みバーと同じ（FILTER_TABS＝今日の優先／今月やる人／全利用者）');
  {
    reset(); S = makeSandbox();
    S.__state().userList = USER_LIST; S.buildDerived();
    [1, 4, 2].forEach(n => { S.showTab(n); eq(dispOf('searchbar'), '', 'タブ' + n + ' では出る'); });
    S.showTab(3);
    eq(dispOf('searchbar'), 'none', 'スタッフ%（タブ3）では出ない（人単位の集計なので）');
    eq(dispOf('ufbar'), 'none', '絞り込みバーも同じく出ない（条件が揃っている）');
  }

  sec('案A-5 入力すると即座に絞られる（確定ボタン不要・マッチングは従来どおり）');
  {
    reset(); S = makeSandbox();
    S.__state().userList = USER_LIST; S.__state().tsushoUsers = TSUSHO_USERS; S.__state().users = KAIGO_USERS;
    S.buildDerived(); S.showTab(2); S.renderTab2();
    ok(elOf('tab2').innerHTML.indexOf('ダミー高橋') >= 0, '絞り込み前は高橋が出ている');
    elOf('ufQuery').value = 'たなか';
    elOf('ufQuery')._ev.input.call(elOf('ufQuery'));
    eq(S.__uf().query, 'たなか', 'uf.query に反映される');
    ok(elOf('tab2').innerHTML.indexOf('ダミー田中') >= 0, 'ひらがなで漢字氏名が引ける（ふりがな経由・従来どおり）');
    ok(elOf('tab2').innerHTML.indexOf('ダミー高橋') < 0, '他の人は消える');
    // 表記ゆれ（マッチングを移設で壊していないこと）
    [['タナカ', 'カタカナ'], ['ﾀﾅｶ', '半角カナ'], ['田中', '漢字']].forEach(([q, label]) => {
      elOf('ufQuery').value = q; elOf('ufQuery')._ev.input.call(elOf('ufQuery'));
      ok(elOf('tab2').innerHTML.indexOf('ダミー田中') >= 0, label + 'でも引ける');
    });
  }

  sec('案A-6 ★入力中の再描画でカーソルが飛ばない（入力欄を作り直さない）');
  {
    reset(); S = makeSandbox();
    S.__state().userList = USER_LIST; S.buildDerived(); S.showTab(2);
    const q = elOf('ufQuery');
    q.value = 'た'; q._ev.input.call(q);          // 1文字目 → バッジ 0件→1件（従来はここで再描画）
    els.__active = q;                              // 入力欄にフォーカスしている状態
    const writesBefore = q._valueWrites, focusBefore = q._focusCount;
    S.renderFilterBar();                           // 絞り込みバーを描き直す
    S.updateFilterBadge();
    S.renderLists();
    eq(q._valueWrites, writesBefore, '再描画で value を書き戻していない（＝カーソルが飛ばない）');
    eq(q._focusCount, focusBefore, 'focus() を呼び直していない（フォーカスを奪っていない）');
    eq(S.document.activeElement, q, 'フォーカスは検索欄に残ったまま');
    eq(q.value, 'た', '入力値もそのまま');
  }

  sec('案A-7 「絞り込みをクリア」は検索欄も空にする');
  {
    reset(); S = makeSandbox();
    S.__state().userList = USER_LIST; S.buildDerived(); S.showTab(2);
    elOf('ufQuery').value = 'たなか'; elOf('ufQuery')._ev.input.call(elOf('ufQuery'));
    S.__uf().days = ['月']; S.setCareFilter('kaigo');
    eq(S.ufActiveCount(S.__uf(), S.__careFilter()), 3, 'この時点で3件適用中（名前・曜日・介護度）');
    S.clearFilters();
    eq(S.__uf().query, '', 'uf.query が空になる');
    eq(elOf('ufQuery').value, '', '画面の検索欄も空になる');
    eq(S.ufActiveCount(S.__uf(), S.__careFilter()), 0, '適用中0件');
  }

  sec('案A-8 ×ボタンで検索だけをクリアできる（他の条件は残す）');
  {
    reset(); S = makeSandbox();
    S.__state().userList = USER_LIST; S.buildDerived(); S.showTab(2);
    elOf('ufQuery').value = 'たなか'; elOf('ufQuery')._ev.input.call(elOf('ufQuery'));
    S.__uf().days = ['月'];
    eq(dispOf('ufQueryClear'), '', '入力があると×が出る');
    S.clearQuery();
    eq(S.__uf().query, '', '検索だけ空になる');
    eq(S.__uf().days, ['月'], '曜日の条件は残る');
    eq(dispOf('ufQueryClear'), 'none', '空になったら×は消える');
  }

  // =====================================================================
  sec('①-1 load() の多重実行ガード：連打しても通信が積み上がらない');
  {
    reset(); S = makeSandbox();
    const p1 = S.load();                       // 初回
    const n1 = fetchLog.length;
    eq(n1, 12, '初回は12本');
    const p2 = S.load('2026-08-04');           // ▶1回目（前が終わる前）
    const p3 = S.load('2026-08-05');           // ▶2回目
    // 1回目がまだ解決していない＝state.usage が空なので、2回目も usage_stats を含む12本を出す。
    // よって abort されるのは 12（1回目）＋12（2回目）＝24本。
    const aborted = fetchLog.filter(r => r.aborted).length;
    eq(aborted, 24, '古い2回ぶん（12＋12本）はすべて abort されている');
    eq(fetchLog.filter(r => !r.aborted).length, 12, '生きている通信は最新の1回ぶん12本だけ');
    flush(); await tick(20);
    await Promise.all([p1, p2, p3]);
    eq(S.__state().selectedDate, '2026-08-05', '最後に押した日付が採用される（押した結果が必ず出る）');
  }

  sec('①-2 ★古い応答が新しい表示を上書きしない');
  {
    reset(); S = makeSandbox();
    // 1回目を「abort が効かない古い通信」に見立てて、後から解決させる
    const p1 = S.load('2026-08-04');
    const old = pending.slice();
    pending = [];
    const p2 = S.load('2026-08-06');
    const fresh = pending.slice();
    pending = [];
    // 新しい方を先に解決 → 画面は 08-06
    fresh.forEach(r => { if (!r.aborted) r._res({ ok: true, json: () => Promise.resolve(dataFor(r)) }); });
    await tick(20); await p2;
    eq(S.__state().selectedDate, '2026-08-06', '新しい応答が反映されている');
    const usersAfterFresh = S.__state().users.length;
    // そのあとで古い方を（abort を無視して）解決させる
    old.forEach(r => { r.aborted = false; r._res({ ok: true, json: () => Promise.resolve({ ok: true, users: [], records: [], success: true, staff: [], attendance: { am: [], pm: [] } }) }); });
    await tick(20);
    eq(S.__state().selectedDate, '2026-08-06', '古い応答が来ても選択日は 08-06 のまま');
    eq(S.__state().users.length, usersAfterFresh, '古い応答が state を上書きしていない');
    await p1;
  }

  sec('①-3 読み込み中が画面で分かる');
  {
    reset(); S = makeSandbox();
    const p = S.load();
    eq(elOf('status').textContent, '読み込み中…', '取得中は「読み込み中…」が出る');
    flush(); await tick(20); await p;
    eq(elOf('status').textContent, '', '終わったら消える');
  }

  // =====================================================================
  sec('③-1 usage_stats は日付ナビでは取り直さない（選択日に依存しないため）');
  {
    reset(); S = makeSandbox();
    let p = S.load(); flush(); await tick(20); await p;
    eq(countBy('usage_stats'), 1, '初回は取得する');
    eq(countBy('attendance'), 1, 'attendance も1回');
    p = S.load('2026-08-04'); flush(); await tick(20); await p;
    eq(countBy('usage_stats'), 1, '日付を動かしても取り直さない（1回のまま）');
    eq(countBy('attendance'), 2, '★attendance は選択日に依存するので毎回取り直す');
    p = S.load('2026-08-05'); flush(); await tick(20); await p;
    eq(countBy('usage_stats'), 1, '2回動かしても1回のまま');
    eq(countBy('attendance'), 3, 'attendance は3回');
    ok(!!S.__state().usage, 'キャッシュから state.usage は保たれている');
  }

  sec('③-2 ↻再読込では取り直す');
  {
    reset(); S = makeSandbox();
    let p = S.load(); flush(); await tick(20); await p;
    p = S.load('2026-08-04'); flush(); await tick(20); await p;
    eq(countBy('usage_stats'), 1, '日付ナビでは取り直していない');
    USAGE_TAG = 'reloaded';
    p = S.load();                       // ↻再読込＝引数なし
    flush(); await tick(20); await p;
    eq(countBy('usage_stats'), 2, '↻ では取り直す');
    eq(S.__state().usage.__tag, 'reloaded', '新しい応答で置き換わっている');
  }

  sec('③-3 取得に失敗したらキャッシュしない（次回また取りに行く）');
  {
    reset(); S = makeSandbox();
    let p = S.load();
    flush({ usage_stats: { success: false, error: 'boom' } });
    await tick(20); await p;
    ok(!!S.__state().errs.usage, '失敗が errs に立つ');
    eq(S.__state().usage, null, 'state.usage は空');
    p = S.load('2026-08-04'); flush(); await tick(20); await p;
    eq(countBy('usage_stats'), 2, '★失敗はキャッシュせず、次の機会に取り直す');
    ok(!!S.__state().usage, '2回目で取れている');
    ok(!S.__state().errs.usage, 'エラー表示は消える');
  }

  sec('③-4 日付をまたいで開きっぱなしなら取り直す（集計月が変わるため）');
  {
    reset(); S = makeSandbox();
    let p = S.load(); flush(); await tick(20); await p;
    eq(countBy('usage_stats'), 1, '初回1回');
    // 集計対象の3ヶ月が変わった状況を作る（月替わり相当）
    S.__setUsageKey('2026-06..2026-08');
    p = S.load('2026-08-04'); flush(); await tick(20); await p;
    eq(countBy('usage_stats'), 2, '集計月が変わったら日付ナビでも取り直す');
  }

  // =====================================================================
  sec('④ 矢印3回連打で飛ぶ通信の本数');
  {
    reset(); S = makeSandbox();
    let p = S.load(); flush(); await tick(20); await p;
    const base = fetchLog.length;
    eq(base, 12, '初回ロードは12本');
    const a = S.load('2026-08-04'), b = S.load('2026-08-05'), c = S.load('2026-08-06');
    const sent = fetchLog.length - base;
    const alive = fetchLog.slice(base).filter(r => !r.aborted).length;
    eq(sent, 33, '3連打で発行されるのは 11本×3 = 33本（usage_stats は取り直さないので12ではなく11）');
    eq(alive, 11, '★同時に生きているのは最新の11本だけ（従来は36本が生き残っていた）');
    flush(); await tick(20); await Promise.all([a, b, c]);
    eq(S.__state().selectedDate, '2026-08-06', '最後に押した日付が出る');
  }

  sec('⑤ スタッフ%の集計に影響していない（shareBase / totalPeriod）');
  {
    reset(); S = makeSandbox();
    S.__state().records = [
      { userId: 'x1', name: 'x1', sokutei_date: '2026-08-01', sokutei_by: 'スタッフX' },
      { userId: 'x2', name: 'x2', sokutei_date: '2026-08-01', sokutei_by: '' },        // 測定者なし
      { userId: 'x3', name: 'x3', sokutei_date: '2026-08-01', sokutei_by: '小野' }     // 除外スタッフ
    ];
    S.__state().shien = []; S.__state().staff = ['スタッフX', 'スタッフY'];
    S.__state().today = TODAY; S.__setPeriod(1);
    S.renderTab3();
    const h = elOf('tab3').innerHTML;
    ok(h.indexOf('総測定 3件') >= 0, '見出しの実件数は3件（測定者なし・除外も数える）');
    ok(h.indexOf('割合は測定者が記録されている 1 件') >= 0, '%の母数は1件（前回の修正どおり）');
    ok(h.indexOf('1件 (100%)') >= 0, 'スタッフXが100%');
  }

  console.log('\n===== ' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' : pass=' + pass + ' fail=' + fail + ' =====');
  process.exit(fail === 0 ? 0 : 1);
})();
