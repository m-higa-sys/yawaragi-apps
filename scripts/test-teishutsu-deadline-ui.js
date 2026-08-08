// teishutsu.html — 期限バッジ／月送りボタンの押下フィードバックのテスト（2026-08-08）
//
// 背景（社長実測）:
//   ① ‹ › を押しても見た目が変わらず、押せたのか分からない（* に -webkit-tap-highlight-color:transparent が
//      かかっていて、既定のタップ反応まで消えている）。
//   ② 画面上部に期限が無く、「いつまでに何をするか」が分からない。
//
// ★期限は「表示中の月の翌月10日」を毎回算出する。ハードコードしない（月送りで追随しないと嘘になる）。
// 実ブラウザは開かない（本番GASへPOSTが飛ぶ事故の防止）。純関数はHTMLから抽出して実際に動かし、
// 表示層は文字列として構造を検査する。
// 実行: node scripts/test-teishutsu-deadline-ui.js
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'teishutsu.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}
function count(re) { return (html.match(re) || []).length; }

// HTMLから関数を1つ抜き出す（先頭が function 名、閉じは行頭の }）
function grab(name) {
  const m = html.match(new RegExp('function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm'));
  if (!m) { console.error('[FAIL] 関数を抽出できません: ' + name); process.exit(1); }
  return m[0];
}
const src = ['deadlineOf', 'deadlineText', 'isPastDeadline', 'nowYM', 'shiftYM', 'initialYM'].map(grab).join('\n');
const api = new Function(src + '\nreturn { deadlineOf, deadlineText, isPastDeadline, initialYM, nowYM };')();
const { deadlineOf, deadlineText, isPastDeadline, initialYM, nowYM } = api;

console.log('\n[A) ★期限＝表示中の月の翌月10日（完了条件の実測）]');
ok('A1 7月表示 → 「8月10日までに提出」', deadlineText('2026-07') === '8月10日までに提出', '実測 ' + deadlineText('2026-07'));
ok('A2 8月表示 → 「9月10日までに提出」', deadlineText('2026-08') === '9月10日までに提出', '実測 ' + deadlineText('2026-08'));
ok('A3 1月表示 → 「2月10日までに提出」', deadlineText('2026-01') === '2月10日までに提出', '実測 ' + deadlineText('2026-01'));
ok('A4 ★12月表示 → 「1月10日までに提出」（年跨ぎ）', deadlineText('2026-12') === '1月10日までに提出', '実測 ' + deadlineText('2026-12'));
ok('A5 12月の期限の実体は翌年1月10日',
   deadlineOf('2026-12').getFullYear() === 2027 && deadlineOf('2026-12').getMonth() === 0 && deadlineOf('2026-12').getDate() === 10,
   '実測 ' + deadlineOf('2026-12').toString());

console.log('\n[B) 期限切れ判定（当日はまだ切れていない）]');
const D = (y, m, d, hh, mi) => new Date(y, m - 1, d, hh || 0, mi || 0);
ok('B1 7月分・8/8時点は期限内', isPastDeadline('2026-07', D(2026, 8, 8)) === false);
ok('B2 ★7月分・8/10当日は期限内（「過ぎている」に当日は含めない）', isPastDeadline('2026-07', D(2026, 8, 10)) === false);
ok('B3 7月分・8/10 23:59 でもまだ期限内（時刻に引きずられない）', isPastDeadline('2026-07', D(2026, 8, 10, 23, 59)) === false);
ok('B4 ★7月分・8/11は期限切れ', isPastDeadline('2026-07', D(2026, 8, 11)) === true);
ok('B5 6月分・8/8時点は期限切れ（前月分の取り残し）', isPastDeadline('2026-06', D(2026, 8, 8)) === true);
ok('B6 8月分・8/8時点は期限内（先の月）', isPastDeadline('2026-08', D(2026, 8, 8)) === false);
ok('B7 12月分・翌年1/11は期限切れ（年跨ぎ）', isPastDeadline('2026-12', D(2027, 1, 11)) === true);
ok('B8 12月分・翌年1/10は期限内（年跨ぎ・当日）', isPastDeadline('2026-12', D(2027, 1, 10)) === false);

console.log('\n[H) ★初期表示月＝いま迫っている期限の月（2026-08-08 追加）]');
// 締切は「その月の分を翌月10日まで」。10日までに開いた人が見たいのは前月分。
ok('H1 ★8/8に開く → 2026-07（7月分の締めの最中）', initialYM('2026-08-08') === '2026-07', '実測 ' + initialYM('2026-08-08'));
ok('H2 ★8/10（締切当日）に開く → 2026-07（当日はまだ前月分）', initialYM('2026-08-10') === '2026-07', '実測 ' + initialYM('2026-08-10'));
ok('H3 ★8/11に開く → 2026-08（当月分へ切り替わる）', initialYM('2026-08-11') === '2026-08', '実測 ' + initialYM('2026-08-11'));
ok('H4 ★1/5に開く → 2025-12（年跨ぎ）', initialYM('2026-01-05') === '2025-12', '実測 ' + initialYM('2026-01-05'));
ok('H5 1/11に開く → 2026-01', initialYM('2026-01-11') === '2026-01', '実測 ' + initialYM('2026-01-11'));
ok('H6 1/1に開く → 2025-12（年跨ぎ・月初）', initialYM('2026-01-01') === '2025-12', '実測 ' + initialYM('2026-01-01'));
ok('H7 12/31に開く → 2026-12', initialYM('2026-12-31') === '2026-12', '実測 ' + initialYM('2026-12-31'));
ok('H8 日付が取れないときは当月へ倒す（画面を止めない）', initialYM('') === nowYM() && initialYM(null) === nowYM());
ok('H9 「今日」はJST固定＝day-gate の ywToday() を使う', /function todayJst\(\)[\s\S]{0,200}ywToday\(\)/.test(html));
ok('H10 day-gate.js が読めなくても落ちない（typeof で見る）', /typeof ywToday === 'function'/.test(html));
ok('H11 初期化が initialYM を使う', /state\.ym = initialYM\(todayJst\(\)\)/.test(html));
ok('H12 day-gate.js を読み込んでいる', /<script src="day-gate\.js\?v=[^"]+"><\/script>/.test(html));

console.log('\n[C) 期限バッジが画面上部（月表示の右）にある]');
ok('C1 バッジ要素がある', /id="deadlineBadge"/.test(html));
ok('C2 月ナビの中＝月表示の右に置かれている',
   /<div class="month-nav">[\s\S]*?id="ymLabel"[\s\S]*?id="deadlineBadge"[\s\S]*?<\/div>/.test(html));
ok('C3 ★文言をHTMLに焼き込んでいない（動的算出）', !/月10日までに提出<\/span>/.test(html) && !/>\d+月\d+日までに提出/.test(html));
ok('C4 期限切れの色分けCSSがある（赤系）', /\.deadline-badge\.over\s*\{/.test(html));
ok('C5 バッジを描く関数がある', /function renderDeadlineBadge\(/.test(html));
ok('C6 描画(render)から必ず呼ばれる＝月送りに追随する', /function render\(\)[\s\S]{0,400}renderDeadlineBadge\(\)/.test(html));
ok('C7 期限切れ判定は実時刻で毎回する（起動時固定にしない）',
   /isPastDeadline\(state\.ym,\s*new Date\(\)\)/.test(html));

console.log('\n[D) ★‹ › の押下フィードバック（押した瞬間に見た目が変わる）]');
ok('D1 :active のスタイルがある', /\.month-nav button:active\s*\{/.test(html));
const activeCss = (html.match(/\.month-nav button:active\s*\{[^}]*\}/) || [''])[0];
ok('D2 :active で背景が変わる', /background/.test(activeCss), '実測 ' + activeCss);
ok('D3 :active で縮む（scale 0.94 程度）', /transform:\s*scale\(0\.9[0-6]\)/.test(activeCss), '実測 ' + activeCss);
const navBtnCss = (html.match(/\.month-nav button\s*\{[^}]*\}/) || [''])[0];
ok('D4 タップ領域 44x44px 以上を確保', /min-width:\s*44px/.test(navBtnCss) && /min-height:\s*44px/.test(navBtnCss), '実測 ' + navBtnCss);
ok('D5 読込中（無効）の見た目がある', /\.month-nav button:disabled\s*\{/.test(html));
ok('D6 押した瞬間に反応する（:active に遷移待ちを入れていない）',
   !/transition[^;]*\d{3,}ms/.test(navBtnCss), '実測 ' + navBtnCss);

console.log('\n[E) ★連打で複数リクエストが飛ばない]');
ok('E1 読込中フラグを持つ', /state\.loading/.test(html));
ok('E2 reload の入口で二重起動を弾く', /function reload\(silent\)\s*\{\s*[\s\S]{0,120}if \(state\.loading\) return/.test(html));
ok('E3 ★finally で必ずフラグを戻す（失敗時に永久ロックしない）', /\}\s*finally\s*\{[\s\S]{0,160}state\.loading = false/.test(html));
ok('E4 月送りボタンも読込中は無視する', /function goMonth\(/.test(html) && /if \(state\.loading\) return/.test(html));
ok('E5 読込中はボタンを無効化する', /function setNavBusy\(/.test(html));
ok('E6 ‹ › の両方が goMonth 経由になった',
   /getElementById\('prevM'\)\.onclick = \(\) => goMonth\(-1\)/.test(html) &&
   /getElementById\('nextM'\)\.onclick = \(\) => goMonth\(1\)/.test(html));
ok('E7 月送りは即座に月表示を更新する（通信を待たせない）',
   /function goMonth\(delta\)[\s\S]{0,400}renderDeadlineBadge\(\)/.test(html));

console.log('\n[F) additive＝集計ロジック・台帳への読み書きに触れていない]');
ok('F1 台帳へ書く経路は3本のまま（upsertSoufuStatus）', count(/action=upsertSoufuStatus/g) === 3, '実測 ' + count(/action=upsertSoufuStatus/g));
ok('F2 今月あと／繰越の数え方が不変', /else \{ cTodo\+\+; if \(t\.isCarry\) cCarry\+\+; \}/.test(html));
ok('F3 揃った／今月送付済の数え方が不変',
   /if \(t\.status === '揃った'\) cSorotta\+\+;/.test(html) &&
   /if \(String\(t\.sofu_at\)\.slice\(0, 7\) === state\.ym\) cSent\+\+;/.test(html));
ok('F4 PDF検出（署名済みPDF照合）に触れていない', /sbSignCreatedMap_/.test(html));
ok('F5 繰越スナップショットに触れていない', /isCarry/.test(html));
ok('F6 月の算出関数（shiftYM / nowYM / ymJp）は不変',
   /function shiftYM\(ym, delta\) \{\s*\n\s*const \[y, m\] = ym\.split\('-'\)\.map\(Number\);/.test(html) &&
   /function ymJp\(ym\) \{ const \[y, m\] = ym\.split\('-'\); return y \+ '年' \+ Number\(m\) \+ '月'; \}/.test(html));

// ---- ★実際に動かして確かめる（文字列検査ではなく挙動）----
// goMonth / reload / setNavBusy を画面から抜き出し、DOMと通信だけを差し替えて回す。
// 完了条件「連打してもリクエストが重複しない」は目視より機械で押さえる。
function makeHarness(loadDataImpl) {
  const body = [
    'const state = { ym: "2026-08", loading: false, tasks: [], data: null, dataYm: "", failedSources: [], loadFailed: false };',
    'const calls = { loadData: 0, render: 0 };',
    'const els = {};',
    'const document = { getElementById: (id) => (els[id] || (els[id] = { id: id, textContent: "", innerHTML: "", disabled: false, classList: { toggle: function () {} } })) };',
    'async function loadData(ym) { calls.loadData++; return await deps.loadData(ym); }',
    'function buildTasks() { return []; }',
    'function render() { calls.render++; }',
    'function setSyncTime() {}',
    'function renderLoadFailure() {}',
    'function renderDeadlineBadge() {}',
    grab('shiftYM'),
    grab('ymJp'),
    grab('setNavBusy'),
    grab('goMonth'),
    'async ' + grab('reload'),   // 本体は async function 宣言。grab は function から拾うので async を戻す
    'return { state: state, calls: calls, els: els, goMonth: goMonth, reload: reload };'
  ].join('\n');
  return new Function('deps', body)({ loadData: loadDataImpl });
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n[G) ★実挙動: 連打しても通信は1本（完了条件）]');
  {
    const h = makeHarness(async () => { await wait(20); return true; });
    h.goMonth(1); h.goMonth(1); h.goMonth(1);   // ‹› を素早く3連打
    ok('G1 ★連打3回でも loadData は1回だけ', h.calls.loadData === 1, '実測 ' + h.calls.loadData + ' 回');
    ok('G2 ★月も1つだけ進む（3ヶ月飛ばない）', h.state.ym === '2026-09', '実測 ' + h.state.ym);
    ok('G3 読込中は ‹ › が無効になる', h.els.prevM.disabled === true && h.els.nextM.disabled === true);
    ok('G4 月表示は通信を待たずに切り替わる', h.els.ymLabel.textContent === '2026年9月', '実測 ' + h.els.ymLabel.textContent);
    await wait(60);
    ok('G5 完了後に ‹ › が押せる状態へ戻る', h.els.prevM.disabled === false && h.els.nextM.disabled === false);
    h.goMonth(1);
    ok('G6 完了後はちゃんと次の月へ進める', h.state.ym === '2026-10' && h.calls.loadData === 2,
       '実測 ' + h.state.ym + ' / loadData ' + h.calls.loadData + ' 回');
  }
  {
    // ★失敗しても錠が残らないこと。ここが抜けると通信エラー1回で画面が永久に固まる。
    const h = makeHarness(async () => { await wait(5); throw new Error('通信エラー'); });
    h.goMonth(1);
    await wait(40);
    ok('G7 ★取得が失敗しても loading が戻る', h.state.loading === false);
    ok('G8 ★取得が失敗しても ‹ › が押せる状態へ戻る', h.els.prevM.disabled === false);
    h.goMonth(1);
    ok('G9 失敗の次も月送りできる', h.calls.loadData === 2, '実測 ' + h.calls.loadData + ' 回');
  }

  // ---- 日付またぎ（day-gate）の配線を実際に動かして確かめる ----
  // 10日→11日をまたぐと初期表示月の答えが前月→当月へ変わる。開きっぱなしの端末が
  // 古い月のまま固まらないこと、逆に手で選んだ月を勝手に動かさないことの両方を見る。
  function makeGateHarness(startYm) {
    const body = [
      'const state = { ym: ' + JSON.stringify(startYm) + ', loading: false };',
      'const calls = { reload: 0, badge: 0 };',
      'const cbs = [];',
      'const els = {};',
      'const document = { getElementById: (id) => (els[id] || (els[id] = { id: id, textContent: "", innerHTML: "", disabled: false, classList: { toggle: function () {} } })) };',
      'function ywOnDayChange(cb) { cbs.push(cb); }',
      'function reload() { calls.reload++; }',
      'function renderDeadlineBadge() { calls.badge++; }',
      grab('shiftYM'),
      grab('ymJp'),
      grab('nowYM'),
      grab('initialYM'),
      grab('startDayGate'),
      'startDayGate();',
      'return { state: state, calls: calls, els: els, fire: (nt, pt) => cbs.forEach(f => f(nt, pt, "test")), wired: cbs.length };'
    ].join('\n');
    return new Function(body)();
  }

  console.log('\n[I) ★日付またぎ（10日→11日）で古い月に固まらない]');
  {
    const h = makeGateHarness('2026-07');   // 8/10 に開いた画面＝7月表示のまま放置
    ok('I1 day-gate にコールバックを登録している', h.wired === 1, '実測 ' + h.wired + ' 本');
    h.fire('2026-08-11', '2026-08-10');
    ok('I2 ★初期表示のままの画面は当月(2026-08)へ進む', h.state.ym === '2026-08', '実測 ' + h.state.ym);
    ok('I3 月表示も書き換わる', h.els.ymLabel.textContent === '2026年8月', '実測 ' + h.els.ymLabel.textContent);
    ok('I4 データを取り直す', h.calls.reload === 1, '実測 ' + h.calls.reload + ' 回');
  }
  {
    const h = makeGateHarness('2026-05');   // ‹ を押して自分で5月を見ている最中
    h.fire('2026-08-11', '2026-08-10');
    ok('I5 ★手で選んだ月は勝手に動かさない', h.state.ym === '2026-05', '実測 ' + h.state.ym);
    ok('I6 その場合は取り直しもしない', h.calls.reload === 0, '実測 ' + h.calls.reload + ' 回');
    ok('I7 期限切れの色だけは引き直す', h.calls.badge >= 1);
  }
  {
    const h = makeGateHarness('2026-08');   // 11日以降＝当月表示。ただの0時またぎ
    h.fire('2026-08-16', '2026-08-15');
    ok('I8 答えが変わらない日跨ぎでは月を動かさない', h.state.ym === '2026-08');
    ok('I9 同じく取り直しもしない（通信を無駄に増やさない）', h.calls.reload === 0, '実測 ' + h.calls.reload + ' 回');
  }

  console.log('\n=== 結果 ===');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
