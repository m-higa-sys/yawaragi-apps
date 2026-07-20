// 「電話済みにする」の担当者選択モーダル TDDハーネス（2026-07-08）
// 目的: 受付者バー（前の人の名前が残る）依存を解消し、押すたびに担当者を選ばせる。
//
// ★構造: confirm(同期) → モーダル(非同期) の置換so二段構えになる。
//   kbMarkPhoneDone      = ガード(origin→当日) の後、対象を保持してモーダルを開くだけ（★副作用ゼロ＝N7維持）
//   kbConfirmPhoneDone_  = ガードを再掲（モーダル表示中に日付が変わる等の極端ケース）→ 担当者チェック → POST
//
// ★核心不変条件:
//   - 担当者未選択で確定 → POSTが一切発火しない・「担当者を選んでください」で止まる
//   - 選んだ担当者が POST body の operator に乗る（absReceptionist 直読でない）
//   - action/body は現行と同一（updateAbsenceCmNotified・cmNotified:'電話連絡済'）
//   - 当日ガード・originガードは両関数の先頭に存在
//
// ★実クリック経路: 生成HTMLの onclick を検証してから実関数を駆動（DOM無しモックで済ませない）
//
// 実行: node scripts/verify-kbox-phone-operator.js
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

function makeEl(id) {
  return { id, innerHTML: '', textContent: '', value: '', disabled: false, style: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } } };
}

function buildEnv(opts) {
  const o = opts || {};
  const els = {};
  ['kbox-phone-modal', 'kbox-phone-operators', 'kbox-phone-title', 'kbox-phone-submit'].forEach(i => els[i] = makeEl(i));
  const calls = [];
  const env = {
    document: { getElementById: id => els[id] || null, body: {} },
    kbState: { viewDate: o.viewDate || '2026-07-08', items: [] },
    ABS_BOARD_API_URL: 'https://example.test/exec',
    getStaff: () => ['比嘉', '星野', '勝又', '下浦', '工藤'],
    EXCLUDED_STAFF: ['比嘉'],
    gnbGuardProdWrite: () => { calls.push({ guard: 'origin' }); return true; },
    jstTodayStr: () => '2026-07-08',
    showToast: m => calls.push({ toast: String(m || '') }),
    kbShowModal_: id => { calls.push({ modal: id }); return { style: {} }; },
    kbLoad: () => {},
    setTimeout: () => {},
    kbEsc_: s => String(s),
    fetch: (url, init) => { let b = {}; try { b = JSON.parse(init && init.body || '{}'); } catch (e) {} calls.push({ action: b.action, body: b }); return { then: () => ({ catch: () => {} }) }; },
  };
  env.__els = els; env.__calls = calls;
  return env;
}

const FNS = ['kbIsViewToday_', 'kbRenderPhoneOperators_', 'kbSelectPhoneOperator_', 'kbMarkPhoneDone', 'kbConfirmPhoneDone_'];
function bind(env) {
  const src = FNS.map(n => extractFn(n, true)).filter(Boolean).join('\n\n');
  const keys = Object.keys(env).filter(k => k.indexOf('__') !== 0);
  const prelude = 'let kbPhoneOperator = "";\nlet kbPhoneTarget = null;\n';
  const body = prelude + src + '\n\nreturn {' +
    FNS.map(n => n + ': (typeof ' + n + '!=="undefined")?' + n + ':undefined').join(', ') +
    ', __getOp: () => kbPhoneOperator, __getTarget: () => kbPhoneTarget};';
  const factory = new Function(...keys, body);
  return factory(...keys.map(k => env[k]));
}

// 生成HTMLの onclick から実クリックを再現
function clickOperator(api, env, name) {
  const h = env.__els['kbox-phone-operators'].innerHTML;
  const re = new RegExp('onclick="kbSelectPhoneOperator_\\(\'' + name + '\'[^"]*"');
  if (!re.test(h)) throw new Error('担当者ボタン[' + name + ']のonclickが生成HTMLに無い: ' + h.slice(0, 200));
  api.kbSelectPhoneOperator_(name, makeEl('btn-' + name));
}

// ================= A) モーダル構造 =================
console.log('■ A) 電話済み 担当者選択モーダル');
okSafe(() => html.indexOf('id="kbox-phone-modal"') >= 0, 'A1(★構造): #kbox-phone-modal が存在');
okSafe(() => html.indexOf('id="kbox-phone-operators"') >= 0, 'A2(★構造): 担当者コンテナ #kbox-phone-operators が存在');
okSafe(() => {
  const src = extractFn('kbMarkPhoneDone');
  return src.indexOf("kbShowModal_('kbox-phone-modal')") >= 0;
}, 'A3(★ポータル): kbShowModal_ 経由で開く（body直下退避＝不可視祖先バグの再発防止）');
okSafe(() => {
  const env = buildEnv();
  const api = bind(env);
  api.kbMarkPhoneDone('利用者066', '2026-07-08');
  const h = env.__els['kbox-phone-operators'].innerHTML;
  return h.indexOf('data-operator="下浦"') >= 0 && h.indexOf('data-operator="工藤"') >= 0 && h.indexOf('比嘉') < 0;
}, 'A4(★): 名簿= getStaff − EXCLUDED_STAFF（社長=比嘉を除外・異体字ズレ回避）');
okSafe(() => {
  const env = buildEnv();
  const api = bind(env);
  api.kbMarkPhoneDone('利用者066', '2026-07-08');
  return api.__getOp() === '' && env.__els['kbox-phone-operators'].innerHTML.indexOf('selected') < 0;
}, 'A5(★初期値なし): 受付者バー廃止so毎回選ぶ（初期選択・ハイライトなし）');
okSafe(() => {
  const env = buildEnv();
  const api = bind(env);
  api.kbMarkPhoneDone('利用者066', '2026-07-08');
  const t = api.__getTarget();
  return !!t && t.name === '利用者066' && t.date === '2026-07-08';
}, 'A6: 対象(name/date)を保持してモーダルを開く');

// ================= B) ★N7維持: 開くだけ・副作用ゼロ =================
console.log('■ B) ★N7維持（kbMarkPhoneDoneはガードの後に開くだけ・POSTしない）');
okSafe(() => {
  const env = buildEnv();
  const api = bind(env);
  api.kbMarkPhoneDone('利用者066', '2026-07-08');
  return env.__calls.every(c => c.action !== 'updateAbsenceCmNotified');
}, 'B1(★): kbMarkPhoneDone は POST しない（モーダルを開くだけ）');
okSafe(() => {
  const src = extractFn('kbMarkPhoneDone');
  return src.indexOf('fetch(') < 0 && src.indexOf('confirm(') < 0;
}, 'B2(★): kbMarkPhoneDone に fetch も confirm も無い（確定は kbConfirmPhoneDone_ 側）');
okSafe(() => {
  const src = extractFn('kbMarkPhoneDone');
  return src.indexOf('gnbGuardProdWrite') >= 0 && src.indexOf('kbIsViewToday_') >= 0
      && src.indexOf('gnbGuardProdWrite') < src.indexOf('kbIsViewToday_');
}, 'B3(★ガード先頭): kbMarkPhoneDone は origin→当日 の順でガード');
okSafe(() => {
  const src = extractFn('kbMarkPhoneDone');
  const before = src.slice(0, src.indexOf('kbIsViewToday_'));
  return !/\.disabled\s*=|\.textContent\s*=|\.checked\s*=|innerHTML\s*=|fetch\(|confirm\(|kbShowModal_/.test(before);
}, 'B4(★★N7): 当日ガードより前に副作用ゼロ（UI変更/モーダル表示/fetchを置いていない）');
okSafe(() => {
  const env = buildEnv({ viewDate: '2026-07-07' });   // 過去日
  const api = bind(env);
  api.kbMarkPhoneDone('利用者066', '2026-07-07');
  return env.__calls.every(c => c.modal !== 'kbox-phone-modal');
}, 'B5(★当日ガード): 過去日ではモーダルすら開かない（閲覧のみ）');

// ================= C) 確定側: ガード再掲・未選択で止まる =================
console.log('■ C) 確定 kbConfirmPhoneDone_（ガード再掲・★未選択でPOSTしない）');
okSafe(() => {
  const src = extractFn('kbConfirmPhoneDone_');
  return src.indexOf('gnbGuardProdWrite') >= 0 && src.indexOf('kbIsViewToday_') >= 0;
}, 'C1(★ガード再掲): 確定側にも origin・当日ガードがある');
okSafe(() => {
  const src = extractFn('kbConfirmPhoneDone_');
  return src.indexOf('kbIsViewToday_') < src.indexOf('fetch(');
}, 'C2(★): 当日ガードは fetch( より前');
okSafe(() => {
  const env = buildEnv();
  const api = bind(env);
  api.kbMarkPhoneDone('利用者066', '2026-07-08');
  api.kbConfirmPhoneDone_();                       // 担当者を選ばずに確定
  return env.__calls.every(c => c.action !== 'updateAbsenceCmNotified');
}, 'C3(★★誤記録防止): 担当者未選択で確定 → POSTが一切発火しない');
okSafe(() => {
  const env = buildEnv();
  const api = bind(env);
  api.kbMarkPhoneDone('利用者066', '2026-07-08');
  api.kbConfirmPhoneDone_();
  return env.__calls.some(c => c.toast && c.toast.indexOf('担当者') >= 0);
}, 'C4(★): 未選択なら「担当者を選んでください」で止まる（黙って何も起きないにしない）');
okSafe(() => {
  const env = buildEnv({ viewDate: '2026-07-08' });
  const api = bind(env);
  api.kbMarkPhoneDone('利用者066', '2026-07-08');
  clickOperator(api, env, '下浦');
  env.kbState.viewDate = '2026-07-07';             // モーダル表示中に日付が変わる極端ケース
  api.kbConfirmPhoneDone_();
  return env.__calls.every(c => c.action !== 'updateAbsenceCmNotified');
}, 'C5(★極端ケース): モーダル表示中に過去日へ変わったら確定してもPOSTしない（ガード再掲の意味）');

// ================= D) ★実クリック経路: 選んだ担当者がPOSTに乗る =================
console.log('■ D) ★実クリック経路（選んだ担当者が operator に乗る）');
okSafe(() => {
  const env = buildEnv();
  const api = bind(env);
  api.kbMarkPhoneDone('利用者066', '2026-07-08');
  clickOperator(api, env, '下浦');                 // ★生成HTMLのonclickを駆動
  return api.__getOp() === '下浦';
}, 'D1(★実クリック): 生成HTMLのonclickから担当者を選べる');
okSafe(() => {
  const env = buildEnv();
  const api = bind(env);
  api.kbMarkPhoneDone('利用者066', '2026-07-08');
  clickOperator(api, env, '下浦');
  api.kbConfirmPhoneDone_();
  const rec = env.__calls.filter(c => c.action === 'updateAbsenceCmNotified');
  return rec.length === 1 && rec[0].body.operator === '下浦';
}, 'D2(★★): 選んだ担当者(下浦)が POST body の operator に乗る（absReceptionist直読でない）');
okSafe(() => {
  const env = buildEnv();
  const api = bind(env);
  api.kbMarkPhoneDone('利用者066', '2026-07-08');
  clickOperator(api, env, '下浦');
  clickOperator(api, env, '星野');                 // 選び直し
  api.kbConfirmPhoneDone_();
  const rec = env.__calls.filter(c => c.action === 'updateAbsenceCmNotified');
  return rec.length === 1 && rec[0].body.operator === '星野';
}, 'D3(★): 担当者を選び直せる（最後に選んだ人が記録される）');
okSafe(() => {
  const env = buildEnv();
  const api = bind(env);
  api.kbMarkPhoneDone('利用者066', '2026-07-08');
  clickOperator(api, env, '下浦');
  api.kbConfirmPhoneDone_();
  const rec = env.__calls.filter(c => c.action === 'updateAbsenceCmNotified');
  return rec.length === 1 && rec[0].body.name === '利用者066' && rec[0].body.date === '2026-07-08'
      && rec[0].body.cmNotified === '電話連絡済';
}, 'D4(★非接触): action/body は現行と同一（updateAbsenceCmNotified・cmNotified:電話連絡済）');
okSafe(() => {
  const env = buildEnv();
  const api = bind(env);
  api.kbMarkPhoneDone('利用者066', '2026-07-08');
  clickOperator(api, env, '下浦');
  api.kbConfirmPhoneDone_();
  return env.__calls.every(c => c.action !== 'send_box_cm_mails');
}, 'D5(★送信ゼロ): 電話済み記録はメール送信を伴わない');

// ================= E) 非接触: absReceptionist を読まない =================
console.log('■ E) ★absReceptionist を box側の電話記録経路が読まない');
okSafe(() => extractFn('kbMarkPhoneDone').indexOf('absReceptionist') < 0, 'E1(★): kbMarkPhoneDone が absReceptionist を読まない');
okSafe(() => extractFn('kbConfirmPhoneDone_').indexOf('absReceptionist') < 0, 'E2(★): kbConfirmPhoneDone_ が absReceptionist を読まない');
okSafe(() => extractFn('kbRenderPhoneOperators_').indexOf('absReceptionist') < 0, 'E3(★初期値なし): 担当者描画が absReceptionist を初期値にしない');

console.log('\n実測ハーネス(phone-operator): ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
