// 送信サマリー内 操作者選択 TDDハーネス（2026-07-08）
// 目的: 「誰が送ったか」の記録を正確にする。受付者バー直読をやめ、サマリー内で選んだ操作者を operator にする。
//
// ★核心不変条件（誤送信＝対外事故に直結so絶対に守る）:
//   - 操作者未選択で「送信する」→ POSTが一切発火しない（send_box_cm_mails を呼ばない）
//   - operator 空のまま send_box_cm_mails が呼ばれない（記録がsystem/空になる事故の防止）
//   - 当日ガード kbIsViewToday_ / originガード gnbGuardProdWrite は維持（N群が別途固定）
//   - メール送信の実体（宛先・本文・items構造・二重送信ガード）は非接触
//
// ★実クリック経路を突く: 生成HTMLの onclick 文字列から関数呼び出しを取り出して実際に駆動する。
//   DOM無しモックで済ませない（Phase2で月キャッシュの穴を見逃した反省）。
//
// 実行: node scripts/verify-kbox-summary-operator.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

function extractFn(name, optional) {
  let start = html.indexOf('function ' + name + '(');
  if (start < 0) { if (optional) return ''; throw new Error('function ' + name + '( が無い'); }
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  for (let j = braceStart; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  [PASS] ' + label); } else { fail++; console.log('  [FAIL] ' + label); } }
function okSafe(thunk, label) { try { ok(!!thunk(), label); } catch (e) { fail++; console.log('  [FAIL] ' + label + '  «' + (e && e.message) + '»'); } }

// ---- DOM風スタブ（innerHTML に入った実HTMLの onclick を後で駆動できるようにする） ----
function makeEl(id) {
  return {
    id: id, innerHTML: '', textContent: '', value: '', disabled: false, style: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
  };
}

function buildEnv(opts) {
  const o = opts || {};
  const ids = ['kbox-sum-count', 'kbox-sum-list', 'kbox-sum-send', 'kbox-summary-modal', 'kbox-sum-operators'];
  const els = {};
  ids.forEach(i => els[i] = makeEl(i));
  const calls = [];
  const env = {
    document: { getElementById: id => els[id] || null, body: {}, },
    kbState: {
      viewDate: o.viewDate || '2026-07-08',
      checked: { '根岸君男': true },
      items: [{ name: '根岸君男', email: 'x@example.test', cmStaff: '大野勝己', cmOffice: '梨花',
                unit: '午後', date: '2026-07-08', toOverride: '', customBody: '',
                cls: { kind: 'mail', done: false } }],
    },
    absReceptionist: ('absReceptionist' in o) ? o.absReceptionist : '工藤',
    ABS_BOARD_API_URL: 'https://example.test/exec',
    getStaff: () => ['比嘉', '星野', '勝又', '下浦', '工藤'],
    EXCLUDED_STAFF: ['比嘉'],
    gnbGuardProdWrite: () => true,
    jstTodayStr: () => '2026-07-08',
    showToast: m => calls.push({ toast: String(m || '') }),
    kbShowModal_: id => { calls.push({ modal: id }); return { style: {} }; },
    kbLoad: () => {},
    setTimeout: () => {},
    fetch: (url, init) => { let b = {}; try { b = JSON.parse(init && init.body || '{}'); } catch (e) {} calls.push({ action: b.action, body: b }); return { then: () => ({ catch: () => ({ finally: () => {} }) }) }; },
  };
  env.__els = els; env.__calls = calls;
  return env;
}

const FNS = ['kbEsc_', 'kbCollectSendTargets_', 'kbRenderSumOperators_', 'kbSelectSumOperator_', 'kbOpenSummary', 'kbExecuteSend', 'kbIsViewToday_'];
function bind(env) {
  const src = FNS.map(n => extractFn(n, true)).filter(Boolean).join('\n\n');
  const keys = Object.keys(env).filter(k => k.indexOf('__') !== 0);
  const prelude = 'let kbSumOperator = "";\n';
  const body = prelude + src + '\n\nreturn {' +
    FNS.map(n => n + ': (typeof ' + n + '!=="undefined")?' + n + ':undefined').join(', ') +
    ', __getSumOperator: () => kbSumOperator};';
  const factory = new Function(...keys, body);
  return factory(...keys.map(k => env[k]));
}

// 生成HTMLの onclick から「操作者ボタンの実クリック」を再現する（実クリック経路）
function clickOperatorByName(api, env, name) {
  const h = env.__els['kbox-sum-operators'].innerHTML;
  const re = new RegExp('onclick="kbSelectSumOperator_\\(\'' + name + '\'[^"]*"');
  if (!re.test(h)) throw new Error('操作者ボタン[' + name + ']のonclickが生成HTMLに無い: ' + h.slice(0, 200));
  api.kbSelectSumOperator_(name, makeEl('btn-' + name));   // onclick が指す実関数を駆動
}

// ================= A) サマリーに操作者選択が出る =================
console.log('■ A) サマリー内 操作者選択UI');
okSafe(() => html.indexOf('id="kbox-sum-operators"') >= 0, 'A1(★構造): サマリーに操作者コンテナ kbox-sum-operators がある');
okSafe(() => {
  const s = html.indexOf('id="kbox-summary-modal"');
  const e = html.indexOf('id="kbox-help-modal"');
  const modal = html.slice(s, e);
  // 並び: 対象一覧(kbox-sum-list) → 操作者(kbox-sum-operators) → 送信する(kbox-sum-send)
  return modal.indexOf('kbox-sum-list') < modal.indexOf('kbox-sum-operators')
      && modal.indexOf('kbox-sum-operators') < modal.indexOf('kbox-sum-send');
}, 'A2(★構造): 並びが 対象一覧 → 操作者 → 送信する');
okSafe(() => {
  const env = buildEnv({ absReceptionist: '工藤' });
  const api = bind(env);
  api.kbOpenSummary();
  const h = env.__els['kbox-sum-operators'].innerHTML;
  // A3反転(2026-07-08): 受付者バー削除so初期選択なし＝毎回選ぶ（前の人の名前が残る事故を封じる）
  return h.indexOf('data-operator="工藤"') >= 0 && h.indexOf('data-operator="下浦"') >= 0
      && h.indexOf('比嘉') < 0                       // 社長は候補から除外
      && h.indexOf('selected') < 0;                  // ★初期選択なし
}, 'A3(★反転): 名簿=getStaff−EXCLUDED_STAFF・初期選択なし（毎回選ぶ）');
okSafe(() => {
  const env = buildEnv({ absReceptionist: '' });      // 受付者バー未選択
  const api = bind(env);
  api.kbOpenSummary();
  return env.__calls.some(c => c.modal === 'kbox-summary-modal');
}, 'A4(★ガード緩和): 受付者バー未選択でもサマリーは開く（選択と確認を同画面で完結）');

// ================= B) 選び直し・operatorの源 =================
console.log('■ B) 操作者の選び直しと POST body の operator');
okSafe(() => {
  const env = buildEnv({ absReceptionist: '工藤' });
  const api = bind(env);
  api.kbOpenSummary();
  clickOperatorByName(api, env, '下浦');              // ★実クリック経路
  return api.__getSumOperator() === '下浦';
}, 'B1(★実クリック): 生成HTMLのonclickから操作者を選び直せる（工藤→下浦）');
okSafe(() => {
  const env = buildEnv({ absReceptionist: '工藤' });
  const api = bind(env);
  api.kbOpenSummary();
  clickOperatorByName(api, env, '下浦');
  api.kbExecuteSend();
  const rec = env.__calls.filter(c => c.action === 'send_box_cm_mails');
  return rec.length === 1 && rec[0].body.operator === '下浦';
}, 'B2(★★): サマリーで選んだ操作者(下浦)が POST body の operator に乗る（受付者バー直読でない）');
// B3反転(2026-07-08): 受付者バー削除so「初期値として使う」も廃止。未選択なら送らない＝誤記録を構造的に封じる。
okSafe(() => {
  const env = buildEnv({ absReceptionist: '工藤' });   // 受付者バーに値があっても
  const api = bind(env);
  api.kbOpenSummary();                                // 操作者を選ばない
  api.kbExecuteSend();
  const rec = env.__calls.filter(c => c.action === 'send_box_cm_mails');
  return rec.length === 0;                            // ★受付者バーの値を勝手に使って送らない
}, 'B3(★反転・誤記録防止): 操作者未選択なら送信しない（受付者バーの値を勝手に使わない）');
okSafe(() => extractFn('kbOpenSummary').indexOf('absReceptionist') < 0, 'B3b(★): kbOpenSummary が absReceptionist を読まない');

// ================= C) ★未選択では送信しない（誤記録の防止） =================
console.log('■ C) ★操作者未選択では送信しない');
okSafe(() => {
  const env = buildEnv({ absReceptionist: '' });      // どこにも操作者がいない
  const api = bind(env);
  api.kbOpenSummary();
  api.kbExecuteSend();
  return env.__calls.every(c => c.action !== 'send_box_cm_mails');
}, 'C1(★★誤送信防止): 操作者未選択で「送信する」→ send_box_cm_mails を呼ばない');
okSafe(() => {
  const env = buildEnv({ absReceptionist: '' });
  const api = bind(env);
  api.kbOpenSummary();
  api.kbExecuteSend();
  return env.__calls.some(c => c.toast && c.toast.indexOf('操作者') >= 0);
}, 'C2(★): 未選択なら「操作者を選んでください」で止まる（黙って何も起きないにしない）');
okSafe(() => {
  const env = buildEnv({ absReceptionist: '' });
  const api = bind(env);
  api.kbOpenSummary();
  api.kbExecuteSend();
  const rec = env.__calls.filter(c => c.action === 'send_box_cm_mails');
  return rec.length === 0;                            // operator空でPOSTされない＝記録がsystem/空になる事故を防ぐ
}, 'C3(★★): operator 空のまま send_box_cm_mails が呼ばれない（記録がsystem/空になる事故の防止）');
okSafe(() => {
  const env = buildEnv({ absReceptionist: '' });
  const api = bind(env);
  api.kbOpenSummary();
  clickOperatorByName(api, env, '星野');              // 受付者バーが空でもサマリーで選べば送れる
  api.kbExecuteSend();
  const rec = env.__calls.filter(c => c.action === 'send_box_cm_mails');
  return rec.length === 1 && rec[0].body.operator === '星野';
}, 'C4(★): 受付者バーが空でも、サマリーで選べば送信できる（B案の狙い）');

// ================= D) 非接触の構造証明（メール送信の実体に触れていない） =================
console.log('■ D) 非接触の構造証明（誤送信・対外事故の防止）');
const sendSrc = extractFn('kbExecuteSend');
okSafe(() => sendSrc.indexOf('kbIsViewToday_') >= 0, 'D1(★当日ガード): kbExecuteSendに当日ガードが残る');
okSafe(() => sendSrc.indexOf('kbIsViewToday_') < sendSrc.indexOf('fetch('), 'D2(★): 当日ガードは fetch( より前');
okSafe(() => sendSrc.indexOf('gnbGuardProdWrite') >= 0, 'D3(★originガード): gnbGuardProdWrite が残る');
okSafe(() => {
  // ★N7維持: 当日ガードより前に副作用ゼロ（operatorは「読み取り」so可・UI変更は不可）
  const before = sendSrc.slice(0, sendSrc.indexOf('kbIsViewToday_'));
  return sendSrc.indexOf('kbIsViewToday_') > 0 && !/\.disabled\s*=|送信中|\.textContent\s*=|\.checked\s*=|fetch\(|innerHTML\s*=/.test(before);
}, 'D4(★★N7維持): 当日ガードより前に副作用ゼロ（UI変更/fetchを置いていない）');
okSafe(() => /action:\s*'send_box_cm_mails'/.test(sendSrc), 'D5(★非接触): send_box_cm_mails の呼び出し方が不変');
okSafe(() => /items:\s*items/.test(sendSrc) && /name:\s*it\.name/.test(sendSrc) && /customBody:/.test(sendSrc) && /toOverride:/.test(sendSrc),
  'D6(★非接触): items 構造（name/date/unit/customBody/toOverride）が不変');
okSafe(() => html.indexOf('function kbBuildBody_') >= 0, 'D7(★非接触): 本文生成 kbBuildBody_ は無変更で存在');
okSafe(() => (html.match(/send_box_cm_mails/g) || []).length === 1, 'D8(★非接触): send_box_cm_mails の出現は1箇所のまま');
// D9更新(2026-07-08): kbConfirmPhoneDone_ にガードを再掲so 12→13。減っていないこと（弱体化していないこと）を固定する。
okSafe(() => (html.match(/gnbGuardProdWrite/g) || []).length >= 13, 'D9(★非接触): gnbGuardProdWrite は13本以上（確定側に再掲・弱体化なし）');
okSafe(() => {
  // 二重送信ガードはサーバ側 kbIsAlreadyNotified_。クライアントは呼び出し経路を変えていない＝送信POSTは1本のみ。
  return (sendSrc.match(/fetch\(/g) || []).length === 1;
}, 'D10(★非接触): 送信fetchは1本のみ（二重送信ガードの前提を崩さない）');

console.log('\n実測ハーネス(summary-operator): ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
