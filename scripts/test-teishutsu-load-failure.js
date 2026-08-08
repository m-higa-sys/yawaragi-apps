// teishutsu.html — 読み込み失敗を「黙って0件」にしない（A赤帯＋B非上書き＋Cリトライ1回）
//
// 事故（2026-08-05 20:49→20:50・社長の実機）:
//   getOralPlansYear が返らず pop が空になり、当月分81件が消えて繰越93件だけ残った。
//   3経路すべてで失敗を握りつぶし、さらに setSyncTime() が「最終同期 20:50」と成功表示。
//   スタッフには「提出物なし」に見える。＝出すべき書類が出ない。
//
// 守る対象は「カードが消える2本」:
//   ・利用者情報(getOralPlansYear / users) … 当月分の素
//   ・提出送付台帳(getSoufuLedger / rows)  … 繰越の素。締めで固定した未提出そのもの
//
// ★このテストは teishutsu.html から実際の関数を抽出して動かす（文字列検査ではない）。
//   通信しない・GASを叩かない・DOMはスタブ。
// 実行: node scripts/test-teishutsu-load-failure.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'teishutsu.html'), 'utf8');

function grab(name) {
  const m = html.match(new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm'));
  if (!m) { console.error('[FAIL] 関数を抽出できません: ' + name); process.exit(1); }
  return m[0];
}
const SRC = ['loadWithRetry', 'loadData', 'renderLoadFailure', 'reload'].map(grab).join('\n');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- テスト用の器（画面の代わり） ----
// classList は本物と同じ意味で動かす。'hidden' が付いている＝画面に出ていない。
// （toggle('hidden', true) は「隠す」。ここを取り違えると赤帯の判定が逆になる）
function makeEnv(opts) {
  const o = opts || {};
  const els = {};
  const el = () => ({
    innerHTML: '', textContent: '',
    classList: (() => {
      const s = new Set(['hidden']);
      return {
        toggle(c, on) { if (on === undefined) { s.has(c) ? s.delete(c) : s.add(c); } else if (on) s.add(c); else s.delete(c); },
        add(c) { s.add(c); }, remove(c) { s.delete(c); }, contains(c) { return s.has(c); }
      };
    })()
  });
  ['taskList', 'loadError', 'loadErrorWhat', 'loadErrorHint',
   'cntTodo', 'cntCarry', 'cntSorotta', 'cntSent', 'syncInfo'].forEach(id => { els[id] = el(); });

  const calls = { oral: 0, ledger: 0, buildTasks: 0, render: 0, setSyncTime: 0 };
  // mode: 'ok' / 'throw'(通信断・タイムアウト) / 'gasError'(配列キー無し) / 'empty'(本当に0件)
  const pick = (m, n) => (Array.isArray(m) ? (m[n - 1] || m[m.length - 1]) : (m || 'ok'));
  const jsonp = (url) => {
    const action = (url.match(/action=([a-zA-Z]+)/) || [])[1];
    if (action === 'getOralPlansYear') {
      calls.oral++;
      const m = pick(o.oral, calls.oral);
      if (m === 'throw') return Promise.reject(new Error('timeout'));
      if (m === 'gasError') return Promise.resolve({ error: 'boom', success: false });
      if (m === 'empty') return Promise.resolve({ ok: true, users: [] });
      return Promise.resolve({ ok: true, users: [{ userId: '根岸君男', category: '要支援2', cmOffice: 'わかば', furigana: 'ネギシキミオ' }] });
    }
    if (action === 'getSoufuLedger') {
      calls.ledger++;
      const m = pick(o.ledger, calls.ledger);
      if (m === 'throw') return Promise.reject(new Error('timeout'));
      if (m === 'gasError') return Promise.resolve({ ok: false, error: 'boom' });
      if (m === 'empty') return Promise.resolve({ ok: true, rows: [] });
      return Promise.resolve({ ok: true, rows: [{ userId: '根岸君男', docType: 'tsusho_moni', taishoTsuki: '2026-07', status: '保留' }] });
    }
    if (action === 'getTsushoDueDates') return Promise.resolve({ ok: true, dueDates: {} });
    if (action === 'contacts') return Promise.resolve({ cmContacts: [] });
    return Promise.resolve({ ok: true, users: [] });
  };

  const state = Object.assign({
    ym: '2026-08', data: null, dataYm: '', tasks: [], loadFailed: false, failedSources: [], search: ''
  }, o.state || {});

  // setNavBusy … 2026-08-08 に reload が呼ぶようになった（読込中は月送りボタンを無効化する）。
  // 表示層なのでここではカウントするだけ。挙動は test-teishutsu-deadline-ui.js が見る。
  const api = new Function(
    'BOARD_API', 'jsonp', 'state', 'document', 'buildTasks', 'render', 'setSyncTime', 'normOffice', 'esc', 'setNavBusy',
    SRC + '\nreturn { loadWithRetry, loadData, reload };'
  )(
    'https://example.test/exec', jsonp, state,
    { getElementById: id => els[id] || (els[id] = el()) },
    () => { calls.buildTasks++; return [{ userId: 'x', isCarry: true, status: '保留' }]; },
    () => { calls.render++; },
    () => { calls.setSyncTime++; },
    s => String(s || ''), s => String(s == null ? '' : s),
    (busy) => { calls.navBusy = busy; }
  );
  return { api, state, calls, els };
}

const GOOD = () => ({ pop: [{ userId: '既存' }], dueMap: {}, monMap: {}, keikMap: {}, contactMap: {}, ledgerRows: [{ userId: '繰越の人' }] });
const band = e => e.els.loadError.classList.contains('hidden') === false;   // 赤帯が出ているか

(async () => {

console.log('\n[A) 正常時: これまでと1ミリも変わらない]');
{
  const e = makeEnv({ oral: 'ok', ledger: 'ok' });
  await e.api.reload(true);
  ok('A1 state.data が更新される', !!e.state.data && e.state.data.pop.length === 1);
  ok('A2 台帳の行も入る', !!e.state.data && e.state.data.ledgerRows.length === 1);
  ok('A3 対象月を記録する', e.state.dataYm === '2026-08', 'got=' + e.state.dataYm);
  ok('A4 失敗フラグは立たない', e.state.loadFailed === false && e.state.failedSources.length === 0);
  ok('A5 setSyncTime が呼ばれる（成功表示）', e.calls.setSyncTime === 1, 'got=' + e.calls.setSyncTime);
  ok('A6 描画される', e.calls.render === 1);
  ok('A7 どちらもリトライしない（各1回）', e.calls.oral === 1 && e.calls.ledger === 1,
     'oral=' + e.calls.oral + ' ledger=' + e.calls.ledger);
  ok('A8 赤帯は出ない', band(e) === false);
}

console.log('\n[B) ★台帳(getSoufuLedger)が落ちても繰越を消さない ← 今回の追加]');
{
  const prev = GOOD();
  const e = makeEnv({ oral: 'ok', ledger: 'throw', state: { data: prev, dataYm: '2026-08' } });
  await e.api.reload(true);
  ok('B1 ★state.data を上書きしない（繰越の素が残る）',
     !!e.state.data && e.state.data.ledgerRows.length === 1, 'got=' + JSON.stringify(e.state.data && e.state.data.ledgerRows));
  ok('B2 ★setSyncTime を呼ばない', e.calls.setSyncTime === 0, 'got=' + e.calls.setSyncTime);
  ok('B3 ★赤帯が出る', band(e) === true);
  ok('B4 赤帯が「提出送付台帳」と名指しする', e.els.loadErrorWhat.textContent === '提出送付台帳',
     'got=' + JSON.stringify(e.els.loadErrorWhat.textContent));
  ok('B5 補足で「繰越のカードが出ていない可能性」を伝える', /繰越のカードが出ていない可能性/.test(e.els.loadErrorHint.textContent),
     'got=' + e.els.loadErrorHint.textContent);
  ok('B6 前回データで描画は続く（真っ白にしない）', e.calls.render >= 1);
  ok('B7 ★台帳のリトライは1回だけ（呼び出し2回で打ち切り）', e.calls.ledger === 2, 'got=' + e.calls.ledger);
  ok('B8 成功した利用者情報の側はリトライしない', e.calls.oral === 1, 'got=' + e.calls.oral);
}
{
  const e = makeEnv({ oral: 'ok', ledger: 'gasError', state: { data: GOOD(), dataYm: '2026-08' } });
  await e.api.reload(true);
  ok('B9 台帳がGASエラー（rowsキー無し）でも失敗として扱う', e.state.loadFailed === true);
  ok('B10 その場合もリトライは1回だけ', e.calls.ledger === 2, 'got=' + e.calls.ledger);
}
{
  const e = makeEnv({ oral: 'ok', ledger: ['throw', 'ok'] });
  await e.api.reload(true);
  ok('B11 台帳もリトライで復帰する', e.state.loadFailed === false && !!e.state.data && e.calls.setSyncTime === 1);
}
{
  const e = makeEnv({ oral: 'ok', ledger: 'empty' });
  await e.api.reload(true);
  ok('B12 rows:[] は失敗にしない（本当に0件との区別）', e.state.loadFailed === false);
  ok('B13 rows:[] ではリトライしない', e.calls.ledger === 1, 'got=' + e.calls.ledger);
  ok('B14 rows:[] なら同期時刻も更新する', e.calls.setSyncTime === 1);
}

console.log('\n[C) 利用者情報(pop)側は従来どおり守られている]');
{
  const e = makeEnv({ oral: 'throw', ledger: 'ok', state: { data: GOOD(), dataYm: '2026-08' } });
  await e.api.reload(true);
  ok('C1 state.data を上書きしない', !!e.state.data && e.state.data.pop.length === 1);
  ok('C2 setSyncTime を呼ばない', e.calls.setSyncTime === 0);
  ok('C3 赤帯が「利用者情報」と名指しする', e.els.loadErrorWhat.textContent === '利用者情報',
     'got=' + JSON.stringify(e.els.loadErrorWhat.textContent));
  ok('C4 補足で「今月分のカード」を伝える', /今月分のカードが出ていない可能性/.test(e.els.loadErrorHint.textContent));
  ok('C5 リトライは1回だけ', e.calls.oral === 2, 'got=' + e.calls.oral);
  ok('C6 成功した台帳側はリトライしない', e.calls.ledger === 1, 'got=' + e.calls.ledger);
}
{
  const e = makeEnv({ oral: 'gasError', ledger: 'ok' });
  await e.api.reload(true);
  ok('C7 GAS内部エラー（usersキー無し）も失敗として扱う', e.state.loadFailed === true);
}
{
  const e = makeEnv({ oral: 'empty', ledger: 'ok' });
  await e.api.reload(true);
  ok('C8 users:[] は失敗にしない', e.state.loadFailed === false && e.calls.oral === 1);
}

console.log('\n[D) ★両方失敗しても破綻しない]');
{
  const e = makeEnv({ oral: 'throw', ledger: 'throw', state: { data: GOOD(), dataYm: '2026-08' } });
  await e.api.reload(true);
  ok('D1 例外で落ちずに完走する', true);
  ok('D2 state.data を上書きしない', !!e.state.data && e.state.data.pop.length === 1);
  ok('D3 setSyncTime を呼ばない', e.calls.setSyncTime === 0);
  ok('D4 赤帯が両方を名指しする', e.els.loadErrorWhat.textContent === '利用者情報と提出送付台帳',
     'got=' + JSON.stringify(e.els.loadErrorWhat.textContent));
  ok('D5 補足で今月分と繰越の両方を伝える',
     /今月分と繰越のカードが出ていない可能性/.test(e.els.loadErrorHint.textContent), 'got=' + e.els.loadErrorHint.textContent);
  ok('D6 リトライは各1回ずつ（合計4回で打ち切り）', e.calls.oral === 2 && e.calls.ledger === 2,
     'oral=' + e.calls.oral + ' ledger=' + e.calls.ledger);
  ok('D7 前回データで描画は続く', e.calls.render >= 1);
}
{
  const e = makeEnv({ oral: 'throw', ledger: 'throw', state: { data: null, dataYm: '' } });
  await e.api.reload(false);
  ok('D8 前回データが無い両方失敗でも破綻しない', /読み込めませんでした/.test(e.els.taskList.innerHTML));
  ok('D9 その場合もカードを描かない', e.calls.render === 0);
  ok('D10 件数は — 表示', e.els.cntTodo.textContent === '—');
}

console.log('\n[E) ★「該当なし」と「取得失敗」を区別する]');
{
  const e = makeEnv({ oral: 'throw', ledger: 'ok', state: { data: null, dataYm: '' } });
  await e.api.reload(false);
  ok('E1 初回失敗は「読み込めませんでした」（該当なしと別文言）',
     /読み込めませんでした/.test(e.els.taskList.innerHTML) && !/該当タスクはありません/.test(e.els.taskList.innerHTML),
     e.els.taskList.innerHTML.slice(0, 80));
  ok('E2 件数は 0 ではなく —（終わったと誤読させない）', e.els.cntTodo.textContent === '—',
     'got=' + JSON.stringify(e.els.cntTodo.textContent));
  ok('E3 0件のカードを描かない', e.calls.render === 0);
  ok('E4 setSyncTime を呼ばない', e.calls.setSyncTime === 0);
}

console.log('\n[F) 月をまたいだ失敗で、前月のデータを今月として見せない]');
{
  const e = makeEnv({ oral: 'throw', ledger: 'ok', state: { ym: '2026-09', data: GOOD(), dataYm: '2026-08' } });
  await e.api.reload(false);
  ok('F1 別の月のデータは描画に使わない', e.calls.render === 0, 'render回数=' + e.calls.render);
  ok('F2 「読み込めませんでした」を出す', /読み込めませんでした/.test(e.els.taskList.innerHTML));
  ok('F3 保持している data 自体は消さない（次の成功まで温存）', !!e.state.data);
}

console.log('\n[G) 赤帯が消える]');
{
  const e = makeEnv({ oral: 'ok', ledger: 'ok', state: { loadFailed: true, failedSources: ['利用者情報'] } });
  await e.api.reload(true);
  ok('G1 復帰したら赤帯を引っ込める', band(e) === false);
  ok('G2 失敗の記録もクリアされる', e.state.loadFailed === false && e.state.failedSources.length === 0);
}

console.log('\n[H) 画面側の配線（静的検査）]');
ok('H1 赤帯の器がHTMLにある', /id="loadError"/.test(html));
ok('H2 取得元を差し込む枠がある', /id="loadErrorWhat"/.test(html) && /id="loadErrorHint"/.test(html));
ok('H3 文言「を取得できませんでした。数字は不完全です」', /を取得できませんでした。数字は不完全です/.test(html));
ok('H4 失敗時は setSyncTime を通らない構造', /if \(!ok\) \{[\s\S]{0,200}renderLoadFailure\(\)/.test(html));
ok('H5 台帳も loadWithRetry を通る', /loadWithRetry\(BOARD_API \+ '\?action=getSoufuLedger/.test(html));
ok('H6 台帳の判定キーは rows', /getSoufuLedger[^\n]*'rows'\)/.test(html));
ok('H7 旧 .catch\\(\\(\\) => \\(\\{ rows: \\[\\] \\}\\)\\) が残っていない', !/catch\(\(\) => \(\{ rows: \[\] \}\)\)/.test(html));
ok('H8 旧 .catch\\(\\(\\) => \\(\\{ users: \\[\\] \\}\\)\\)（pop用）が残っていない',
   !/getOralPlansYear[^\n]*catch\(\(\) => \(\{ users: \[\] \}\)\)/.test(html));
ok('H9 タイムアウトは20秒のまま（Dは不採用）', /\}, 20000\);/.test(html));
ok('H10 GASへ送るactionを増やしていない', (html.match(/action=upsertSoufuStatus/g) || []).length === 3);
ok('H11 対象外の4本は従来どおり（判定精度が落ちるだけでカードは消えない）',
   (html.match(/catch\(\(\) => \(\{ users: \[\] \}\)\)/g) || []).length === 2   // mon / keik
   && /catch\(\(\) => \(\{ dueDates: \{\} \}\)\)/.test(html)
   && /catch\(\(\) => \(\{ cmContacts: \[\] \}\)\)/.test(html));

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);

})();
