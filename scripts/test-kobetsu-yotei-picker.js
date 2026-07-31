// 個訓アプリ「予定 ▾」（月タップ）の連打防止・5秒Undo テスト（段階4）
// 実行: node scripts/test-kobetsu-yotei-picker.js
//
// 移植元 sokutei.html の実害記録（:1700）:
//   「📅来月へ」を押しても画面が無反応で、押せていないと思って2回押し、2ヶ月進んで9月まで飛んだ。
//   → 送信は必ず runRowAction() を通す（押下の瞬間に表示を変え、応答まで同じ行の送信を止める）。
//   → 直後に5秒Undoバーを出し、押し間違いをその場で戻せるようにする。
// 個訓へ移植した実装が、この2つを本当に備えているかを実HTMLの本物の関数で確かめる。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, '個別機能訓練計画書チェック.html'), 'utf8');
const core = require(path.join(REPO, 'gas', 'yawaragi-board', 'yotei-core.js'));

function extractFrom(src, name) {
  const sig = 'function ' + name + '(';
  let s = src.indexOf(sig);
  if (s < 0) s = src.indexOf('async function ' + name + '(');
  if (s < 0) throw new Error('関数が無い（未実装＝RED）: ' + name);
  if (src.slice(s - 6, s) === 'async ') s -= 6;
  let i = src.indexOf('{', s), d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(s, j + 1); } }
  throw new Error('閉じ括弧が見つからない: ' + name);
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.error('  [FAIL] ' + m); } }
function sec(t) { console.log('\n[' + t + ']'); }

const FNS = ['runRowAction', 'showUndoBar', 'hideUndoBar', 'openYmPicker', 'closeYmPicker',
  'setYm', 'pickYm', 'undoSetYm', 'kbYm', 'kbYoteiLabel', 'kbBuildYoteiMap', 'kbYoteiYm',
  'thisYmStr', 'escapeAttr', 'escapeHtml'];
const fnSrc = FNS.map(n => extractFrom(html, n)).join('\n');

// ---- DOMスタブ ----
function mkEl(id) {
  const e = {
    id: id, style: {}, innerHTML: '', textContent: '', className: '', disabled: false,
    classList: { add() { }, remove() { }, contains() { return false; } },
    _children: {},
    querySelector: function (sel) {
      if (!this._children[sel]) this._children[sel] = { textContent: '', onclick: null, style: {} };
      return this._children[sel];
    }
  };
  return e;
}
const ids = {};
['ymPicker', 'ymPickerName', 'ymPickerGrid', 'ymPickerNote', 'undoBar', 'toast', 'yoteiBanner'].forEach(i => ids[i] = mkEl(i));

let fetchCalls = [];
let fetchDelayResolvers = [];
let fetchMode = 'ok';
const sandbox = {
  document: { getElementById: id => ids[id] || mkEl(id), querySelector: () => mkEl('x') },
  console: console, Math: Math, String: String, Date: Date, JSON: JSON, Object: Object, Array: Array,
  Number: Number, parseInt: parseInt, RegExp: RegExp, isNaN: isNaN, Promise: Promise, Error: Error,
  setTimeout: setTimeout, clearTimeout: clearTimeout, encodeURIComponent: encodeURIComponent,
  ymAdd: core.ymAdd, ymCandidates: core.ymCandidates, isDue: core.isDue,
  API_BASE: 'https://example.invalid/exec',
  // 実HTML側は let で宣言している定数・状態。vm では関数だけを注入するため、ここに同じ器を用意する。
  UNDO_MS: 5000, UNDO_FADE_MS: 1200,
  busy: {}, rowErr: {}, undoTimer: null, undoFadeTimer: null, ymPickerUserId: '',
  getOperator: () => '',
  showToast: () => { },
  renderTable: function () { renderCount++; },
  state: null,
  fetch: function (url) {
    fetchCalls.push(url);
    if (fetchMode === 'hang') {
      return new Promise(res => fetchDelayResolvers.push(() => res({ ok: true, json: async () => mkRes(url) })));
    }
    if (fetchMode === 'fail') return Promise.resolve({ ok: true, json: async () => ({ ok: false, error: '更新に失敗しました' }) });
    return Promise.resolve({ ok: true, json: async () => mkRes(url) });
  }
};
let renderCount = 0;
function mkRes(url) {
  const m = String(url).match(/nextYm=([\d%-]+)/);
  const ym = m ? decodeURIComponent(m[1]) : '';
  return { ok: true, row: { userId: 'U1', name: 'ダミーA', domain: 'kobetsu', nextYm: ym, cycleMonths: 3, slideCount: 0, note: '' } };
}
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fnSrc, sandbox);

function resetState(nextYm) {
  const built = sandbox.kbBuildYoteiMap([{ userId: 'U1', name: 'ダミーA', domain: 'kobetsu', nextYm: nextYm, cycleMonths: 3, slideCount: 0, note: '' }]);
  sandbox.state = {
    users: [{ userId: 'U1', name: 'ダミーA', category: '要介護1', planStart: '2026-02', planMonths: 3 }],
    records: {}, yotei: built.map, yoteiOk: true
  };
  sandbox.busy = {};
  sandbox.rowErr = {};
  sandbox.ymPickerUserId = '';
  fetchCalls = []; fetchDelayResolvers = []; fetchMode = 'ok'; renderCount = 0;
}

const thisYm = (function () { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();
const plus = n => core.ymAdd(thisYm, n);

(async function main() {
  sec('A) 連打しても2回送信しない（同じ行の2回目は送らない）');
  {
    resetState(plus(3));
    fetchMode = 'hang';                     // 1回目の応答を止めたまま2回目を押す＝実害と同じ状況
    const p1 = sandbox.runRowAction('U1', 'ym', () => sandbox.setYm('U1', plus(4)));
    const p2 = sandbox.runRowAction('U1', 'ym', () => sandbox.setYm('U1', plus(5)));
    ok(fetchCalls.length === 1, 'A1: 送信は1回だけ（2回目は送信そのものが起きない）');
    const r2 = await p2;
    ok(r2 === null, 'A2: 2回目は null を返す（呼び出し側が続きを実行しない）');
    ok(renderCount >= 1, 'A3: 応答を待たずに再描画している（押した瞬間に画面が変わる）');
    fetchDelayResolvers.forEach(f => f());
    const r1 = await p1;
    ok(r1 && r1.nextYm === plus(4), 'A4: 1回目は正しく完了する');
    ok(!sandbox.busy['U1'], 'A5: 完了後はロックが外れる（次の操作ができる）');
  }
  {
    resetState(plus(3));
    const r = await sandbox.runRowAction('U1', 'ym', () => sandbox.setYm('U1', plus(1)));
    ok(r && r.nextYm === plus(1), 'A6: 連続でなければ2回目も送れる');
    const r2 = await sandbox.runRowAction('U1', 'ym', () => sandbox.setYm('U1', plus(2)));
    ok(r2 && r2.nextYm === plus(2), 'A7: 1回目完了後の2回目は通る');
    ok(fetchCalls.length === 2, 'A8: 送信は2回');
  }

  sec('B) 失敗しても黙って戻さない（ロックを外して理由を残す）');
  {
    resetState(plus(3));
    fetchMode = 'fail';
    const r = await sandbox.runRowAction('U1', 'ym', () => sandbox.setYm('U1', plus(1)));
    ok(r === null, 'B1: 失敗は null');
    ok(!sandbox.busy['U1'], 'B2: 失敗してもロックが残らない（永久に押せなくならない）');
    ok(sandbox.rowErr && sandbox.rowErr['U1'], 'B3: 失敗の理由が行に残る');
  }

  sec('C) 5秒Undoバー');
  {
    resetState(plus(3));
    let undone = false;
    sandbox.showUndoBar('テスト', function () { undone = true; });
    ok(ids.undoBar.style.display && ids.undoBar.style.display !== 'none', 'C1: Undoバーが表示される');
    ok(String(ids.undoBar.innerHTML).indexOf('undo-btn') >= 0, 'C2: 「戻す」ボタンがある');
    const btn = ids.undoBar.querySelector('.undo-btn');
    ok(typeof btn.onclick === 'function', 'C3: 戻すボタンに動作が結び付いている');
    btn.onclick();
    ok(undone === true, 'C4: 押すと Undo が走る');
    ok(ids.undoBar.style.display === 'none', 'C5: 押したらバーは消える');
    sandbox.hideUndoBar();
    ok(ids.undoBar.style.display === 'none', 'C6: hideUndoBar で消える');
  }
  {
    // 定数の実測（5秒であること）
    ok(html.indexOf('UNDO_MS = 5000') > 0, 'C7: Undoの表示時間は5秒');
  }

  sec('D) 月を選ぶ → 予定月が変わる → Undo で戻る');
  {
    resetState(plus(3));
    sandbox.openYmPicker('U1');
    ok(String(ids.ymPickerGrid.innerHTML).indexOf('pickYm') >= 0, 'D1: 候補ボタンが並ぶ');
    const cands = core.ymCandidates(thisYm, 12);
    ok(cands.length === 12 && cands[0] === thisYm, 'D2: 候補は当月から12ヶ月（過去月は出さない）');
    ok(String(ids.ymPickerGrid.innerHTML).indexOf(cands[11]) >= 0, 'D3: 12ヶ月目まで出ている');
    ok(String(ids.ymPickerGrid.innerHTML).indexOf('✓') >= 0, 'D4: いまの予定月に印が付く');

    await sandbox.pickYm(plus(5));
    ok(fetchCalls.length === 1, 'D5: 送信は1回');
    ok(fetchCalls[0].indexOf('action=setYotei') >= 0, 'D6: setYotei を呼ぶ');
    ok(fetchCalls[0].indexOf('domain=kobetsu') >= 0, 'D7: domain=kobetsu（測定の行には触れない）');
    ok(fetchCalls[0].indexOf('nextYm=' + encodeURIComponent(plus(5))) >= 0, 'D8: 選んだ月を送る');
    ok(sandbox.kbYoteiYm(sandbox.state.yotei, 'U1') === plus(5), 'D9: 画面の状態も新しい予定月になる');
    ok(String(ids.undoBar.style.display) !== 'none', 'D10: 直後にUndoバーが出る');

    ids.undoBar.querySelector('.undo-btn').onclick();
    await new Promise(r => setTimeout(r, 0));
    ok(fetchCalls.length === 2, 'D11: Undo で戻す送信が走る');
    ok(fetchCalls[1].indexOf('nextYm=' + encodeURIComponent(plus(3))) >= 0, 'D12: 元の予定月へ戻す');
  }
  {
    resetState(plus(3));
    await sandbox.pickYm(plus(3));
    ok(fetchCalls.length === 0, 'D13: 同じ月を選んだら送信しない');
  }
  {
    // 予定月シートに行が無い人でも「予定 ▾」で作れる（起点なしの救済）
    sandbox.state = { users: [{ userId: 'U9', name: 'ダミーZ', category: '要介護1', planStart: '', planMonths: 3 }], records: {}, yotei: {}, yoteiOk: true };
    sandbox.busy = {}; fetchCalls = []; fetchMode = 'ok';
    sandbox.openYmPicker('U9');
    await sandbox.pickYm(plus(2));
    ok(fetchCalls.length === 1 && fetchCalls[0].indexOf('userId=U9') >= 0, 'D14: 行が無い人も予定月を作れる');
  }

  sec('E) 予定月が取れていないときは操作させない');
  {
    resetState(plus(3));
    sandbox.state.yoteiOk = false;
    sandbox.openYmPicker('U1');
    ok(ids.ymPicker.className.indexOf('show') < 0 && ids.ymPicker.style.display !== 'flex',
      'E1: 取得できていないときはピッカーを開かない（見えない値を上書きさせない）');
    ok(fetchCalls.length === 0, 'E2: 送信も起きない');
  }

  console.log('\n==== ' + (fail === 0 ? 'ALL GREEN' : 'FAILED') + '  pass=' + pass + ' fail=' + fail + ' ====');
  if (fail !== 0) process.exit(1);
})();
