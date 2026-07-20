// shift.html 送信中ロック（連打による多重登録の入口側防御）の jsdom 検証
// 実行: node scripts/test-shift-submit-lock.js
//
// 方針:
//   shift.html を jsdom で実際にロードし、apiCall だけを差し替える。
//   実ネットワークへは一切出さない（本番APIを叩かない・通知を発火させない）。
//   shift.html の通信は fetch ではなく JSONP(scriptタグ注入) / google.script.run で、
//   その唯一の入口が apiCall。ここを握れば実通信を完全に遮断できる。
//
// jsdom は repo に入れない（package.json を持たない方針）。repo外から解決する。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(require.resolve('jsdom', {
  paths: ['/tmp/node_modules', '/tmp', 'C:/tmp/node_modules', 'C:/tmp']
}));

const HTML_PATH = path.join(__dirname, '..', 'shift.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}
const tick = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 20; i++) await tick(); };

// ============================================
// shift.html をロードして apiCall を差し替える
// ============================================
async function boot(apiImpl) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.invalid/shift.html' });
  const w = dom.window;
  await new Promise(r => { if (w.document.readyState === 'complete') r(); else w.addEventListener('load', r); });

  const calls = [];
  const toasts = [];
  const alerts = [];

  // 実通信を完全に遮断（ここを差し替えれば JSONP も google.script.run も走らない）
  w.apiCall = function (params) {
    calls.push(JSON.parse(JSON.stringify(params)));
    return apiImpl(params, calls.length);
  };
  w.showToast = function (m) { toasts.push(String(m)); };
  w.alert = function (m) { alerts.push(String(m)); };
  w.confirm = function () { return true; };
  w.prompt = function () { return 'テスト入力'; };
  // 成功後の再読込は通信を伴うので無効化（本テストの対象外）
  w.loadData = function () {};
  w.loadDataAdmin = function () {};
  w.renderAbsenceList = function () {};
  w.loadConditions = function () {};

  // shift.html の状態変数は let 宣言なので window には生えない。
  // グローバル字句環境へ届く window.eval 経由で注入する。
  w.eval("currentUser = '春山'; isAdmin = false; currentMonth = '2026-09'; myWishes = []; isProcessing = false;");

  return { w, calls, toasts, alerts };
}

// 「外せない予定」フォームに値を入れる
function fillAbsence(w) {
  w.document.getElementById('absenceStart').value = '2026-09-10';
  w.document.getElementById('absenceEnd').value = '2026-09-10';
  w.document.getElementById('absenceReason').value = '通院';
}
const btnOf = (w) => w.document.getElementById('absenceSubmitBtn');

console.log('=== shift.html 送信中ロック 検証（jsdom・実通信なし）===\n');

(async () => {

  // ---------- 1. 連打3回で送信は1回だけ ----------
  console.log('[1] 連打（同期的に3回クリック）');
  {
    let release;
    const pending = new Promise(r => { release = r; });
    const { w, calls } = await boot(() => pending);
    fillAbsence(w);
    const btn = btnOf(w);

    // 同期的に3連打（応答が返る前）
    btn.click(); btn.click(); btn.click();
    await settle();

    ok(calls.length === 1, '3連打しても apiCall は1回だけ（実測 ' + calls.length + '回）');
    ok(calls[0] && calls[0].action === 'addAbsence', '送信された action は addAbsence（内容は従来どおり）');
    ok(calls[0] && calls[0].startDate === '2026-09-10' && calls[0].reason === '通院', '送信内容が変わっていない');
    ok(btn.disabled === true, '送信中はボタンが disabled');
    ok(btn.textContent === '送信中…', '送信中はラベルが「送信中…」（押せないことが目に見える）');

    release({ success: true });
    await settle();
    ok(btn.disabled === false, '成功後に disabled が解除される');
    ok(btn.textContent === '登録する', '成功後にラベルが元に戻る');
  }

  // ---------- 2. 解除の全経路 ----------
  console.log('\n[2] 解除の全経路（ここを外すとボタンが永久に押せなくなる）');
  const paths = [
    ['成功',              () => Promise.resolve({ success: true })],
    ['サーバエラー応答',   () => Promise.resolve({ success: false, message: 'この期間は既に外せない予定が登録されています' })],
    ['message欠落の応答',  () => Promise.resolve({ success: false })],
    ['通信断(reject)',     () => Promise.reject(new Error('通信エラー'))],
    ['タイムアウト',       () => Promise.reject(new Error('タイムアウト'))],
    ['予期しない例外',     () => { throw new Error('想定外'); }]
  ];
  for (const [label, impl] of paths) {
    const { w } = await boot(impl);
    fillAbsence(w);
    const btn = btnOf(w);
    btn.click();
    await settle();
    ok(btn.disabled === false && btn.textContent === '登録する', label + ' → disabled/ラベルが元に戻る');
  }

  // ---------- 3. 混み合っています（サーバの新しい応答） ----------
  console.log('\n[3] 競合時のサーバ応答と再送信');
  {
    const BUSY = '混み合っています。もう一度お試しください';
    let n = 0;
    const { w, calls, alerts } = await boot(() => {
      n++;
      return Promise.resolve(n === 1 ? { success: false, message: BUSY } : { success: true });
    });
    fillAbsence(w);
    const btn = btnOf(w);

    btn.click();
    await settle();
    ok(alerts.some(a => a.indexOf(BUSY) >= 0), '「' + BUSY + '」が利用者に表示される');
    ok(btn.disabled === false, '競合応答のあともボタンを押せる状態に戻る');

    // 再送信できること
    fillAbsence(w);
    btn.click();
    await settle();
    ok(calls.length === 2, '再送信が通る（実測 ' + calls.length + '回）');
  }

  // ---------- 4. message が未定義でも壊れない ----------
  console.log('\n[4] message 未定義');
  {
    const { w, alerts } = await boot(() => Promise.resolve({ success: false }));
    fillAbsence(w);
    btnOf(w).click();
    await settle();
    ok(alerts.length === 1 && alerts[0] === 'エラー', 'message 未定義でも既定文言を出して画面が壊れない');
  }

  // ---------- 5. 通常の1回送信（回帰） ----------
  console.log('\n[5] 通常の1回送信（回帰）');
  {
    const { w, calls, toasts } = await boot(() => Promise.resolve({ success: true }));
    fillAbsence(w);
    btnOf(w).click();
    await settle();
    ok(calls.length === 1, 'apiCall 1回');
    ok(toasts.some(t => t.indexOf('外せない予定を登録しました') >= 0), '成功トーストが従来どおり出る');
    ok(w.document.getElementById('absenceStart').value === '', '成功時にフォームがクリアされる（従来どおり）');
    ok(w.document.getElementById('absenceReason').value === '', '理由欄もクリアされる（従来どおり）');
  }

  // ---------- 6. 警告つき成功（回帰） ----------
  console.log('\n[6] 警告つき成功（回帰）');
  {
    const { w, alerts } = await boot(() => Promise.resolve({ success: true, warning: '9/10：送迎ドライバーが3人になります' }));
    fillAbsence(w);
    btnOf(w).click();
    await settle();
    ok(alerts.some(a => a.indexOf('送迎ドライバー') >= 0), 'warning が従来どおり alert で出る');
    ok(btnOf(w).disabled === false, '警告つき成功でも解除される');
  }

  // ---------- 7. 送信前のバリデーションではロックしない ----------
  console.log('\n[7] 送信前バリデーション（ロックを取らない）');
  {
    const { w, calls, toasts } = await boot(() => Promise.resolve({ success: true }));
    // 日付未入力のまま送信
    btnOf(w).click();
    await settle();
    ok(calls.length === 0, '日付未入力なら送信しない（従来どおり）');
    ok(toasts.some(t => t.indexOf('日付を選択してください') >= 0), '従来のバリデーション文言が出る');
    ok(btnOf(w).disabled === false, 'バリデーションで弾かれてもボタンは押せるまま（ロックを取っていない）');
    // その後、正しく入力すれば送れる
    fillAbsence(w);
    btnOf(w).click();
    await settle();
    ok(calls.length === 1, 'バリデーション後に正しく送信できる');
  }

  // ---------- 8. 他の書き込み系にもロックが掛かっている ----------
  console.log('\n[8] 他の書き込み系（連打で1回だけ）');
  const others = [
    ['submitCondition',      w => { w.document.getElementById('condInput').value = '土曜は休みたい'; return () => w.submitCondition(); }, 'addCondition'],
    ['dismissNotifications', w => () => w.dismissNotifications(), 'markNotificationRead'],
    ['deleteAbsence',        w => () => w.deleteAbsence(3), 'removeAbsence'],
    ['doApprove',            w => () => w.doApprove(1), 'approveCondition'],
    ['doReject',             w => () => w.doReject(1), 'rejectCondition'],
    ['addBossRest',          w => { w.document.getElementById('bossRestDate').value = '2026-09-11'; return () => w.addBossRest(); }, 'addBossRest'],
    ['removeBossRest',       w => () => w.removeBossRest(2026, 9, 11), 'removeBossRest']
  ];
  for (const [name, setup, action] of others) {
    let release;
    const pending = new Promise(r => { release = r; });
    const { w, calls } = await boot(() => pending);
    const invoke = setup(w);
    invoke(); invoke(); invoke();
    await settle();
    const mine = calls.filter(c => c.action === action);
    ok(mine.length === 1, name + ': 3連打 → ' + action + ' は1回だけ（実測 ' + mine.length + '回）');
    release({ success: true });
    await settle();
  }

  // ---------- 9. 既存ガードのある関数が壊れていない ----------
  console.log('\n[9] 既存ガード（isProcessing 方式）の回帰');
  {
    let release;
    const pending = new Promise(r => { release = r; });
    const { w, calls } = await boot(() => pending);
    w.renderAll = function () {};
    w.toggleWish(10); w.toggleWish(10); w.toggleWish(10);
    await settle();
    ok(calls.filter(c => c.action === 'addWish').length === 1, 'toggleWish: 3連打 → addWish は1回だけ（従来の isProcessing ガード）');
    release({ success: true });
    await settle();
    ok(w.eval('isProcessing') === false, 'toggleWish: 完了後に isProcessing が戻る');
  }

  console.log('\n----------------------------------------');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  console.log('本番APIへのリクエスト: 0（apiCall を差し替え・JSONPもgoogle.script.runも未実行）');
  console.log('通知の発火: 0');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('テスト自体が異常終了: ' + e.stack); process.exit(1); });
