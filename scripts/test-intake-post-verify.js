// intake専用POST（shared.js gasPostIntake）の挙動テスト（2026-07-29）
// 対象: shared.js §D-3 gasPostIntake / showIntakeError
// 実行: node scripts/test-intake-post-verify.js
//
// 守りたいこと:
//   (1) 既存 gasPost は**1バイトも変わっていない**（欠席・振替不能など全アプリが使用中）
//   (2) gasPostIntake は「サーバーが success:true を返したときだけ」true を返す
//       ＝ {success:false} を「✅保存しました」と嘘をつく構造をなくす
//   (3) サーバーが理由を返したときは再送しない（入力ミスを3回投げない）
//   (4) 通信断は3回まで再試行する
//   (5) 単純リクエスト（プリフライトなし）で送る＝mode:'cors' + text/plain
//   (6) intake.html の保存系が gasPostIntake を呼んでいる（gasPost に戻っていない）

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHARED = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
const INTAKE = fs.readFileSync(path.join(ROOT, 'intake.html'), 'utf8');

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + '\n    expected ' + e + '\n    actual   ' + a); }
}
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

// ===== 関数抽出（test-sokutei-merge.js と同方式・ブレース対応） =====
function extractFn(src, name) {
  let start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function ' + name + ' が無い（未実装＝RED）');
  // `async function foo(` の async を落とすと評価時に構文エラーになるので含める
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  const braceOpen = src.indexOf('{', start);
  let depth = 0, i = braceOpen;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// ===== (1) 既存 gasPost の無改変（origin/master と byte 比較） =====
console.log('[回帰] 既存 gasPost は無改変（欠席登録が従来どおり動くことの担保）');
let baseShared = null;
try {
  baseShared = execSync('git show origin/master:shared.js', { cwd: ROOT, encoding: 'utf8' });
} catch (e) {
  console.log('  SKIP origin/master:shared.js を取得できず（オフライン clone 等）');
}
if (baseShared) {
  for (const fn of ['gasPost', 'gasPostAbsenceWithVerify', 'gasPostEditWithVerify', 'verifyAbsenceInGAS']) {
    let now = null, before = null;
    try { now = extractFn(SHARED, fn); before = extractFn(baseShared, fn); } catch (e) {}
    ok(now !== null && now === before, fn + ' が origin/master と byte 単位で同一');
  }
  // no-cors のままであることも明示（gasPost の性質を変えていない）
  ok(/mode:\s*'no-cors'/.test(extractFn(SHARED, 'gasPost')), "gasPost は mode:'no-cors' のまま");
}

// ===== gasPostIntake をサンドボックスで読み込む =====
// shared.js 全体は const 再宣言や DOM 依存があるため、必要な関数だけ抽出して評価する。
function loadIntakePoster(env) {
  const src = [
    extractFn(SHARED, 'showIntakeError'),
    extractFn(SHARED, 'gasPostIntake')
  ].join('\n');
  const fn = new Function(
    'YAWARAGIBOARD_API_URL', 'fetch', 'document', 'console', 'setTimeout', 'clearTimeout',
    'getIntakeAdminKey', 'handleIntakeUnauthorized', 'Object',
    src + '\nreturn { gasPostIntake: gasPostIntake, showIntakeError: showIntakeError };'
  );
  return fn(
    'https://example.test/exec', env.fetch, env.document, env.console,
    env.setTimeout, env.clearTimeout, env.getIntakeAdminKey, env.handleIntakeUnauthorized, Object
  );
}

// 最小のDOMスタブ（showIntakeError が自前で要素を作る前提を再現）
function makeEnv(fetchImpl) {
  const shown = [];
  const el = {
    id: '', style: { cssText: '', display: '' }, textContent: '',
    setAttribute() {}
  };
  const env = {
    shown,
    calls: [],
    unauthorized: [],
    fetch: async function (url, opts) {
      env.calls.push({ url, opts });
      return fetchImpl(env.calls.length, url, opts);
    },
    document: {
      getElementById() { return null; },   // 常に未作成 → 自前生成パスを通す
      createElement() { return el; },
      body: { appendChild() {} }
    },
    console: { error() {}, warn() {}, log() {} },
    setTimeout: (f) => { f(); return 0; }, // 待ち時間ゼロで即実行（テストを速く・再試行待ちで固まらない）
    clearTimeout: () => {},
    getIntakeAdminKey: () => 'KEY-123',
    handleIntakeUnauthorized: (w) => { env.unauthorized.push(w); }
  };
  // textContent への代入を捕まえるため getter/setter を張る
  Object.defineProperty(el, 'textContent', {
    get() { return this._t || ''; },
    set(v) { this._t = v; shown.push(v); }
  });
  return env;
}

const jsonRes = (obj) => ({ json: async () => obj });

(async function run() {
  // ===== (2) success:true のときだけ true =====
  console.log('\n[成否判定] success:true のときだけ true を返す');
  {
    const env = makeEnv(() => jsonRes({ success: true, id: 'intake_x' }));
    const { gasPostIntake } = loadIntakePoster(env);
    const r = await gasPostIntake({ action: 'intake_create', 氏名: '比嘉' }, '新規受付 中断保存');
    eq(r, true, '{success:true} → true');
    eq(env.calls.length, 1, '送信は1回だけ');
    eq(env.shown.length, 0, 'エラー表示なし');
  }
  {
    const env = makeEnv(() => jsonRes({ success: false, error: 'お名前か電話番号のどちらか1つは入れてください' }));
    const { gasPostIntake } = loadIntakePoster(env);
    const r = await gasPostIntake({ action: 'intake_create' }, '新規受付 中断保存');
    eq(r, false, '{success:false} → false（「✅保存しました」と嘘をつかない）');
    ok(env.shown.length === 1 && env.shown[0].indexOf('お名前か電話番号のどちらか1つは入れてください') >= 0,
       'サーバーの error 文言をそのまま画面に出す');
    // ===== (3) 理由が返っているなら再送しない =====
    eq(env.calls.length, 1, 'サーバーが理由を返したら再送しない（入力ミスを3回投げない）');
  }

  // ===== unauthorized =====
  console.log('\n[unauthorized] 既存 handleIntakeUnauthorized に委ねる');
  {
    const env = makeEnv(() => jsonRes({ error: 'unauthorized', status: 401 }));
    const { gasPostIntake } = loadIntakePoster(env);
    const r = await gasPostIntake({ action: 'intake_update', id: 'x' }, '見学・体験・新規 保存');
    eq(r, false, 'unauthorized → false');
    eq(env.unauthorized, ['見学・体験・新規 保存'], 'handleIntakeUnauthorized(label) が呼ばれる');
    eq(env.shown.length, 0, '鍵エラーは既存導線に任せる（二重表示しない）');
    eq(env.calls.length, 1, 'unauthorized は再送しない');
  }

  // ===== (4) 通信断は3回まで再試行 =====
  console.log('\n[通信断] 3回まで再試行してから false');
  {
    const env = makeEnv(() => { throw new Error('network down'); });
    const { gasPostIntake } = loadIntakePoster(env);
    const r = await gasPostIntake({ action: 'intake_create', 氏名: '比嘉' }, '新規受付 中断保存');
    eq(r, false, '3回とも失敗 → false');
    eq(env.calls.length, 3, '3回送信した');
    ok(env.shown.length === 1 && env.shown[0].indexOf('入力は消えていません') >= 0,
       '「入力は消えていません」と伝える');
  }
  {
    // 1回目だけ失敗 → 2回目で成功
    const env = makeEnv((n) => { if (n === 1) throw new Error('flaky'); return jsonRes({ success: true }); });
    const { gasPostIntake } = loadIntakePoster(env);
    const r = await gasPostIntake({ action: 'intake_create', 氏名: '比嘉' }, 'x');
    eq(r, true, '1回目失敗・2回目成功 → true');
    eq(env.calls.length, 2, '2回で止まる');
  }
  {
    // JSONで無い応答（GASのHTMLエラーページ等）は成功扱いにしない
    const env = makeEnv(() => ({ json: async () => { throw new Error('Unexpected token <'); } }));
    const { gasPostIntake } = loadIntakePoster(env);
    const r = await gasPostIntake({ action: 'intake_create', 氏名: '比嘉' }, 'x');
    eq(r, false, 'JSONで無い応答 → false（成功扱いにしない）');
  }
  {
    // success フィールドが無い応答も成功扱いにしない
    const env = makeEnv(() => jsonRes({ id: 'something' }));
    const { gasPostIntake } = loadIntakePoster(env);
    const r = await gasPostIntake({ action: 'intake_create', 氏名: '比嘉' }, 'x');
    eq(r, false, 'success フィールドが無い応答 → false');
    eq(env.calls.length, 1, '判断がついているので再送しない');
  }

  // ===== (5) 単純リクエスト（プリフライトなし）で送る =====
  console.log('\n[リクエスト形] プリフライトが飛ばない単純リクエスト');
  {
    const env = makeEnv(() => jsonRes({ success: true }));
    const { gasPostIntake } = loadIntakePoster(env);
    await gasPostIntake({ action: 'intake_create', 氏名: '比嘉' }, 'x');
    const o = env.calls[0].opts;
    eq(o.method, 'POST', 'method=POST');
    eq(o.mode, 'cors', "mode='cors'（応答JSONを読むため）");
    eq(o.headers['Content-Type'], 'text/plain;charset=utf-8',
       "Content-Type='text/plain;charset=utf-8'（単純リクエスト＝OPTIONSが飛ばない）");
    const body = JSON.parse(o.body);
    eq(body.adminKey, 'KEY-123', 'intake_* には adminKey が自動付与される');
    eq(body.氏名, '比嘉', '元のペイロードは保持される');
  }
  {
    // 明示 adminKey があればそちら優先（gasPost と同方式）
    const env = makeEnv(() => jsonRes({ success: true }));
    const { gasPostIntake } = loadIntakePoster(env);
    const payload = { action: 'intake_create', adminKey: 'EXPLICIT' };
    await gasPostIntake(payload, 'x');
    eq(JSON.parse(env.calls[0].opts.body).adminKey, 'EXPLICIT', '明示 adminKey を上書きしない');
    eq(payload.adminKey, 'EXPLICIT', '呼び出し側のオブジェクトを書き換えない');
  }

  // ===== (6) intake.html の配線 =====
  console.log('\n[配線] intake.html の保存系が gasPostIntake を呼ぶ');
  const MUST_USE_INTAKE_POST = [
    'intake_advance_phase', 'intake_drop', 'intake_sync_to_userlist',
    'intake_add_as_trial', 'intake_delete'
  ];
  for (const action of MUST_USE_INTAKE_POST) {
    const re = new RegExp("gasPost\\(\\{[^}]*action:\\s*'" + action + "'");
    ok(!re.test(INTAKE), action + ' が素の gasPost を使っていない');
    const re2 = new RegExp("gasPostIntake\\(\\{[^}]*action:\\s*'" + action + "'");
    ok(re2.test(INTAKE), action + ' が gasPostIntake を使っている');
  }
  // 新規保存・編集保存（ペイロード変数 p を渡す形）
  ok(/const ok = await gasPostIntake\(p, suspend \?/.test(INTAKE),
     'saveIntakeModalNew（新規/中断保存）が gasPostIntake を使っている');
  ok(/const ok = await gasPostIntake\(p, '見学・体験・新規 保存'\)/.test(INTAKE),
     'saveIntakeModal（編集保存）が gasPostIntake を使っている');

  // 失敗時にモーダルを閉じない＝閉じる処理が if (ok) の中にしかないこと
  ok(!/closeIntakeModal\(\);\s*\n\s*setTimeout\(loadIntakeList/.test(
        INTAKE.replace(/if \(ok\) \{[\s\S]*?\n\s{8}\}/g, '')),
     '保存失敗時にモーダルを閉じる経路が無い（入力を消さない）');

  console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
