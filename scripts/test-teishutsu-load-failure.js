// teishutsu.html — 読み込み失敗を「黙って0件」にしない（A赤帯＋B非上書き＋Cリトライ1回）
//
// 事故（2026-08-05 20:49→20:50・社長の実機）:
//   getOralPlansYear が返らず pop が空になり、当月分81件が消えて繰越93件だけ残った。
//   3経路すべてで失敗を握りつぶし、さらに setSyncTime() が「最終同期 20:50」と成功表示。
//   スタッフには「提出物なし」に見える。＝出すべき書類が出ない。
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
const SRC = ['loadOralWithRetry', 'loadData', 'renderLoadFailure', 'reload'].map(grab).join('\n');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- テスト用の器（画面の代わり） ----
function makeEnv(opts) {
  const o = opts || {};
  const els = {};
  // classList は本物と同じ意味で動かす。'hidden' が付いている＝画面に出ていない。
  // （toggle('hidden', true) は「隠す」。ここを取り違えると赤帯の判定が逆になる）
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
  ['taskList', 'loadError', 'cntTodo', 'cntCarry', 'cntSorotta', 'cntSent', 'syncInfo'].forEach(id => { els[id] = el(); });

  const calls = { jsonp: [], oral: 0, buildTasks: 0, render: 0, setSyncTime: 0 };
  const jsonp = (url) => {
    calls.jsonp.push(url);
    const action = (url.match(/action=([a-zA-Z]+)/) || [])[1];
    if (action === 'getOralPlansYear') {
      calls.oral++;
      const mode = Array.isArray(o.oral) ? (o.oral[calls.oral - 1] || o.oral[o.oral.length - 1]) : o.oral;
      if (mode === 'throw') return Promise.reject(new Error('timeout'));
      if (mode === 'gasError') return Promise.resolve({ error: 'boom', success: false }); // users キー無し
      if (mode === 'emptyUsers') return Promise.resolve({ ok: true, users: [] });          // 本当に0名
      return Promise.resolve({ ok: true, users: [{ userId: '根岸君男', category: '要支援2', cmOffice: 'わかば', furigana: 'ネギシキミオ' }] });
    }
    if (action === 'getSoufuLedger') return Promise.resolve({ ok: true, rows: o.ledgerRows || [] });
    if (action === 'getTsushoDueDates') return Promise.resolve({ ok: true, dueDates: {} });
    if (action === 'contacts') return Promise.resolve({ cmContacts: [] });
    return Promise.resolve({ ok: true, users: [] });
  };

  const state = Object.assign({
    ym: '2026-08', data: null, dataYm: '', tasks: [], popFailed: false, search: ''
  }, o.state || {});

  const api = new Function(
    'BOARD_API', 'jsonp', 'state', 'document', 'buildTasks', 'render', 'setSyncTime', 'normOffice', 'esc',
    SRC + '\nreturn { loadOralWithRetry, loadData, reload };'
  )(
    'https://example.test/exec', jsonp, state,
    { getElementById: id => els[id] || (els[id] = el()) },
    () => { calls.buildTasks++; return [{ userId: 'x', isCarry: true, status: '保留' }]; },
    () => { calls.render++; },
    () => { calls.setSyncTime++; },
    s => String(s || ''), s => String(s == null ? '' : s)
  );
  return { api, state, calls, els };
}

const GOOD_DATA = { pop: [{ userId: '既存' }], dueMap: {}, monMap: {}, keikMap: {}, contactMap: {}, ledgerRows: [] };

console.log('\n[A) 正常時: これまでと1ミリも変わらない]');
{
  const e = makeEnv({ oral: 'ok' });
  (async () => {
    await e.api.reload(true);
    ok('A1 state.data が更新される', !!e.state.data && e.state.data.pop.length === 1);
    ok('A2 対象月を記録する', e.state.dataYm === '2026-08', 'got=' + e.state.dataYm);
    ok('A3 失敗フラグは立たない', e.state.popFailed === false);
    ok('A4 setSyncTime が呼ばれる（成功表示）', e.calls.setSyncTime === 1, 'got=' + e.calls.setSyncTime);
    ok('A5 描画される', e.calls.render === 1);
    ok('A6 リトライしない（getOralPlansYear は1回だけ）', e.calls.oral === 1, 'got=' + e.calls.oral);
    ok('A7 赤帯は出ない（hidden が付いたまま）', e.els.loadError.classList.contains('hidden') === true);
    runB();
  })();
}

function runB() {
  console.log('\n[B) ★壊れたデータで上書きしない（本体）]');
  const prev = JSON.parse(JSON.stringify(GOOD_DATA));
  const e = makeEnv({ oral: 'throw', state: { data: prev, dataYm: '2026-08' } });
  (async () => {
    await e.api.reload(true);
    ok('B1 state.data が上書きされない（前回の正常データを保持）',
       !!e.state.data && e.state.data.pop.length === 1, 'got=' + JSON.stringify(e.state.data && e.state.data.pop));
    ok('B2 ★setSyncTime を呼ばない（成功したように見せない）', e.calls.setSyncTime === 0, 'got=' + e.calls.setSyncTime);
    ok('B3 失敗フラグが立つ', e.state.popFailed === true);
    ok('B4 前回データで描画は続ける（画面が真っ白にならない）', e.calls.render >= 1, 'got=' + e.calls.render);
    runC();
  })();
}

function runC() {
  console.log('\n[C) ★リトライは1回だけ（無限ループしない）]');
  {
    const e = makeEnv({ oral: ['throw', 'ok'] });
    (async () => {
      await e.api.reload(true);
      ok('C1 1回目失敗→2回目成功で復帰する', e.state.popFailed === false && !!e.state.data);
      ok('C2 呼び出しは2回（初回＋リトライ1回）', e.calls.oral === 2, 'got=' + e.calls.oral);
      ok('C3 復帰したので setSyncTime も呼ばれる', e.calls.setSyncTime === 1);

      const e2 = makeEnv({ oral: 'throw' });
      await e2.api.reload(true);
      ok('C4 両方失敗しても呼び出しは2回で打ち切る', e2.calls.oral === 2, 'got=' + e2.calls.oral);
      ok('C5 打ち切った後は失敗として扱う', e2.state.popFailed === true);

      const e3 = makeEnv({ oral: 'gasError' });
      await e3.api.reload(true);
      ok('C6 GAS内部エラー（usersキー無し）もリトライ対象', e3.calls.oral === 2, 'got=' + e3.calls.oral);
      ok('C7 GAS内部エラーは失敗として扱う（黙って0件にしない）', e3.state.popFailed === true);
      runD();
    })();
  }
}

function runD() {
  console.log('\n[D) ★「該当なし」と「取得失敗」を区別する]');
  {
    // 本当に0名（users:[] が正しく返った）＝失敗ではない
    const e = makeEnv({ oral: 'emptyUsers' });
    (async () => {
      await e.api.reload(true);
      ok('D1 users:[] は「取得失敗」にしない（配列の有無で判定）', e.state.popFailed === false);
      ok('D2 users:[] なら state.data を更新する', !!e.state.data && e.state.data.pop.length === 0);
      ok('D3 users:[] なら同期時刻も更新する（正常応答なので）', e.calls.setSyncTime === 1);
      ok('D4 users:[] ではリトライしない', e.calls.oral === 1, 'got=' + e.calls.oral);

      // 初回失敗＝前回データが無い
      const e2 = makeEnv({ oral: 'throw', state: { data: null, dataYm: '' } });
      await e2.api.reload(false);
      ok('D5 初回失敗では0件のカードを描かない', e2.calls.render === 0, 'render回数=' + e2.calls.render);
      ok('D6 初回失敗は「読み込めませんでした」と出す（該当なしと別文言）',
         /読み込めませんでした/.test(e2.els.taskList.innerHTML)
         && !/該当タスクはありません/.test(e2.els.taskList.innerHTML),
         e2.els.taskList.innerHTML.slice(0, 80));
      ok('D7 初回失敗では件数を数字で出さない（0件＝終わったと誤読させない）',
         e2.els.cntTodo.textContent === '—', 'got=' + JSON.stringify(e2.els.cntTodo.textContent));
      ok('D8 初回失敗でも setSyncTime を呼ばない', e2.calls.setSyncTime === 0);
      runE();
    })();
  }
}

function runE() {
  console.log('\n[E) 月をまたいだ失敗で、前月のデータを今月として見せない]');
  const e = makeEnv({ oral: 'throw', state: { ym: '2026-09', data: JSON.parse(JSON.stringify(GOOD_DATA)), dataYm: '2026-08' } });
  (async () => {
    await e.api.reload(false);
    ok('E1 別の月のデータは描画に使わない', e.calls.render === 0, 'render回数=' + e.calls.render);
    ok('E2 「読み込めませんでした」を出す', /読み込めませんでした/.test(e.els.taskList.innerHTML));
    ok('E3 保持している data 自体は消さない（次の成功まで温存）', !!e.state.data);
    runF();
  })();
}

function runF() {
  console.log('\n[F) 赤帯（A）が出る／消える]');
  const e = makeEnv({ oral: 'throw', state: { data: JSON.parse(JSON.stringify(GOOD_DATA)), dataYm: '2026-08' } });
  (async () => {
    await e.api.reload(true);
    ok('F1 失敗時に赤帯を出す（hidden が外れる）', e.els.loadError.classList.contains('hidden') === false);
    const e2 = makeEnv({ oral: 'ok' });
    await e2.api.reload(true);
    ok('F2 成功時は赤帯を出さない（hidden を付け直す）', e2.els.loadError.classList.contains('hidden') === true);
    finish();
  })();
}

function finish() {
  console.log('\n[G) 画面側の配線（静的検査）]');
  ok('G1 赤帯の器がHTMLにある', /id="loadError"/.test(html));
  ok('G2 赤帯の文言が指示どおり', /利用者情報を取得できませんでした。数字は不完全です/.test(html));
  ok('G3 失敗時は setSyncTime を通らない構造', /if \(!ok\) \{[\s\S]{0,200}renderLoadFailure\(\)/.test(html));
  ok('G4 タイムアウトは20秒のまま（Dは不採用）', /\}, 20000\);/.test(html));
  ok('G5 GASへ送るactionを増やしていない',
     (html.match(/action=upsertSoufuStatus/g) || []).length === 3);

  console.log('\n=== 結果 ===');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail === 0 ? 0 : 1);
}
