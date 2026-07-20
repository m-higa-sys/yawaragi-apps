// Phase2 過去日連絡「記録のみ（送信ゼロ）」TDDハーネス（2026-07-08）
// 対象(実装後に存在／RED時は未実装で落ちる):
//   純関数: kbBizDaysAgo_ / kbPastContactEligible_
//   done判定 additive: kbIsDoneInline_ が '連絡済み（…）' を done 扱い
//   記録フロー: kbMarkContactedPast_(手段モーダルを kbShowModal_ で開く) / kbSubmitPastContact_(recordPastContact をPOST・send非呼び)
//   表示: kbCardHtml_(kbRender内) が '連絡済み（手段）・担当・日付' と note を(エスケープして)表示
// ★核心不変条件: 記録フローは send_box_cm_mails を絶対に呼ばない（送信ゼロ）。
// 実行: node scripts/verify-kbox-past-contact.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

function extractFn(name, optional) {
  let start = html.indexOf('function ' + name + '(');
  if (start < 0) { if (optional) return ''; throw new Error('function ' + name + '( が無い'); }
  if (html.slice(start - 6, start) === 'async ') start -= 6;
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
// 未実装(関数なし)や例外は「落ちるべく落ちる」= FAIL 扱い
function okSafe(thunk, label) { try { ok(!!thunk(), label); } catch (e) { fail++; console.log('  [FAIL] ' + label + '  «' + (e && e.message) + '»'); } }

// 抽出した関数群をスタブ環境に束縛
function bindFns(names, env) {
  const src = names.map(n => extractFn(n, true)).filter(Boolean).join('\n\n');
  const gkeys = Object.keys(env);
  const prelude = 'let kbPastContactEditing = null;\nlet kbPastContactMethod = "";\nlet kbPastContactOperator = "";\n'
    + 'const KB_PAST_VERIFY_DELAY_MS = 2500;\n'
    + (('kbPendingPast' in env) ? '' : 'let kbPendingPast = {};\n');
  const body = prelude + src + '\n\nreturn {' + names.map(n => n + ': (typeof ' + n + '!=="undefined")?' + n + ':undefined').join(', ') + '};';
  const factory = new Function(...gkeys, body);
  return factory(...gkeys.map(k => env[k]));
}

console.log('■ 1) 第3営業日 純関数（週末跨ぎ・境界含む）');
okSafe(() => {
  const { kbBizDaysAgo_ } = bindFns(['kbBizDaysAgo_'], {});
  return kbBizDaysAgo_('2026-07-07', '2026-07-08') === 1;
}, 'B1: 7/7→7/8 = 1営業日');
okSafe(() => { const { kbBizDaysAgo_ } = bindFns(['kbBizDaysAgo_'], {}); return kbBizDaysAgo_('2026-07-06', '2026-07-08') === 2; }, 'B2: 7/6→7/8 = 2');
okSafe(() => { const { kbBizDaysAgo_ } = bindFns(['kbBizDaysAgo_'], {}); return kbBizDaysAgo_('2026-07-03', '2026-07-08') === 3; }, 'B3(★境界): 7/3(金)→7/8 = 3');
okSafe(() => { const { kbBizDaysAgo_ } = bindFns(['kbBizDaysAgo_'], {}); return kbBizDaysAgo_('2026-07-02', '2026-07-08') === 4; }, 'B4: 7/2(木)→7/8 = 4（対象外側）');
okSafe(() => { const { kbBizDaysAgo_ } = bindFns(['kbBizDaysAgo_'], {}); return kbBizDaysAgo_('2026-07-10', '2026-07-13') === 1; }, 'B5(★週末跨ぎ): 7/10(金)→7/13(月) = 1（土日除外）');
okSafe(() => { const { kbBizDaysAgo_ } = bindFns(['kbBizDaysAgo_'], {}); return kbBizDaysAgo_('2026-07-08', '2026-07-13') === 3; }, 'B6(★週末跨ぎ境界): 7/8(水)→7/13(月) = 3');

console.log('■ 2) eligibility（過去日 かつ 1〜3営業日以内・境界含む）');
okSafe(() => { const { kbPastContactEligible_ } = bindFns(['kbPastContactEligible_', 'kbBizDaysAgo_'], {}); return kbPastContactEligible_('2026-07-07', '2026-07-08') === true; }, 'E1: 7/7 過去1日 → 対象');
okSafe(() => { const { kbPastContactEligible_ } = bindFns(['kbPastContactEligible_', 'kbBizDaysAgo_'], {}); return kbPastContactEligible_('2026-07-03', '2026-07-08') === true; }, 'E2(★境界): 7/3 過去3日ちょうど → 対象');
okSafe(() => { const { kbPastContactEligible_ } = bindFns(['kbPastContactEligible_', 'kbBizDaysAgo_'], {}); return kbPastContactEligible_('2026-07-02', '2026-07-08') === false; }, 'E3: 7/2 過去4日 → 対象外');
okSafe(() => { const { kbPastContactEligible_ } = bindFns(['kbPastContactEligible_', 'kbBizDaysAgo_'], {}); return kbPastContactEligible_('2026-07-08', '2026-07-08') === false; }, 'E4: 当日 → 対象外(当日フロー)');
okSafe(() => { const { kbPastContactEligible_ } = bindFns(['kbPastContactEligible_', 'kbBizDaysAgo_'], {}); return kbPastContactEligible_('2026-07-09', '2026-07-08') === false; }, 'E5: 未来 → 対象外');

console.log('■ 3) done判定 additive（連絡済み（手段）を done 扱い・既存値は不変）');
okSafe(() => { const { kbIsDoneInline_ } = bindFns(['kbIsDoneInline_'], {}); return kbIsDoneInline_('連絡済み（Gmail手動）') === true; }, 'D1(★): 連絡済み（Gmail手動）→ done');
okSafe(() => { const { kbIsDoneInline_ } = bindFns(['kbIsDoneInline_'], {}); return kbIsDoneInline_('連絡済み（その他）') === true; }, 'D2: 連絡済み（その他）→ done');
okSafe(() => { const { kbIsDoneInline_ } = bindFns(['kbIsDoneInline_'], {}); return kbIsDoneInline_('送信済') === true && kbIsDoneInline_('電話連絡済') === true; }, 'D3: 既存done値は不変(送信済/電話連絡済)');
okSafe(() => { const { kbIsDoneInline_ } = bindFns(['kbIsDoneInline_'], {}); return kbIsDoneInline_('メール未送信') === false; }, 'D4: 未連絡は done でない');

// ---- 記録フロー用スタブ環境 ----
function recordEnv() {
  const calls = [];
  const env = {
    fetch: function (url, opts) { let body = {}; try { body = JSON.parse(opts && opts.body || '{}'); } catch (e) {} calls.push({ url, action: body.action, body }); return Promise.resolve({}); },
    gnbGuardProdWrite: function () { return true; },
    absReceptionist: '下浦',
    ABS_BOARD_API_URL: 'https://example.test/exec',
    showToast: function () {},
    kbShowModal_: function (id) { calls.push({ modal: id }); return { style: {} }; },
    kbLoad: function () {},
    setTimeout: function (fn) { return 0; },
    document: { getElementById: () => ({ style: {}, value: '', textContent: '', innerHTML: '' }) },
    kbState: { viewDate: '2026-07-07', forward: [], items: [{ name: '利用者066', date: '2026-07-07' }] },
    jstTodayStr: function () { return '2026-07-08'; },
    attMonthAbsCache: {},
    kbPendingPast: {},
    kbRenderDayNow_: () => {},
  };
  env.__calls = calls;
  return env;
}

console.log('■ 4) 記録フロー（recordPastContact をPOST・★send_box_cm_mails 非呼び）');
okSafe(() => {
  const env = recordEnv();
  const api = bindFns(['kbMarkContactedPast_', 'kbSubmitPastContact_', 'kbSelectPastOperator_', 'kbRenderPastOperators_', 'kbApplyPendingPast_', 'kbVerifyPendingPast_', 'kbPendingKey_', 'kbMergeDedupAbs_'], env);
  api.kbMarkContactedPast_('利用者066', '2026-07-07');
  return env.__calls.some(c => c.modal === 'kbox-pastcontact-modal');
}, 'R1(★): 連絡済みボタン→ 手段モーダルを kbShowModal_ 経由で開く');
okSafe(() => {
  const env = recordEnv();
  const api = bindFns(['kbMarkContactedPast_', 'kbSubmitPastContact_', 'kbSelectPastOperator_', 'kbRenderPastOperators_', 'kbApplyPendingPast_', 'kbVerifyPendingPast_', 'kbPendingKey_', 'kbMergeDedupAbs_'], env);
  api.kbMarkContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastOperator_('下浦', mkBtn());   // 2026-07-08: 受付者バー廃止so担当者を明示選択（初期値なし）
  api.kbSubmitPastContact_('Gmail手動', '');
  const rec = env.__calls.filter(c => c.action === 'recordPastContact');
  return rec.length === 1 && rec[0].body.cmNotified === '連絡済み（Gmail手動）' && rec[0].body.operator === '下浦' && rec[0].body.date === '2026-07-07';
}, 'R2(★): 担当者選択→手段選択→ recordPastContact を1回POST(cmNotified/operator/date 正)');
okSafe(() => {
  const env = recordEnv();
  const api = bindFns(['kbMarkContactedPast_', 'kbSubmitPastContact_', 'kbSelectPastOperator_', 'kbRenderPastOperators_', 'kbApplyPendingPast_', 'kbVerifyPendingPast_', 'kbPendingKey_', 'kbMergeDedupAbs_'], env);
  api.kbMarkContactedPast_('利用者066', '2026-07-07');
  api.kbSubmitPastContact_('Gmail手動', 'テスト');
  return env.__calls.every(c => c.action !== 'send_box_cm_mails');
}, 'R3(★★送信ゼロ): 記録フローは send_box_cm_mails を一切呼ばない');

console.log('■ 5) note 異常系（空OK / 入れたら値に乗る / 特殊文字も壊さず送る）');
okSafe(() => {
  const env = recordEnv();
  const api = bindFns(['kbMarkContactedPast_', 'kbSubmitPastContact_', 'kbSelectPastOperator_', 'kbRenderPastOperators_', 'kbApplyPendingPast_', 'kbVerifyPendingPast_', 'kbPendingKey_', 'kbMergeDedupAbs_'], env);
  api.kbMarkContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastOperator_('下浦', mkBtn());   // 2026-07-08: 初期値なしso担当者を明示選択
  api.kbSubmitPastContact_('その他', '');   // note空
  const rec = env.__calls.filter(c => c.action === 'recordPastContact');
  return rec.length === 1 && rec[0].body.cmNotified === '連絡済み（その他）';
}, 'N1: note空でも記録が通る（エラーにならず 連絡済み（その他））');
okSafe(() => {
  const env = recordEnv();
  const api = bindFns(['kbMarkContactedPast_', 'kbSubmitPastContact_', 'kbSelectPastOperator_', 'kbRenderPastOperators_', 'kbApplyPendingPast_', 'kbVerifyPendingPast_', 'kbPendingKey_', 'kbMergeDedupAbs_'], env);
  api.kbMarkContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastOperator_('下浦', mkBtn());   // 2026-07-08: 初期値なしso担当者を明示選択
  api.kbSubmitPastContact_('その他', '休み連絡票をFAX');
  const rec = env.__calls.filter(c => c.action === 'recordPastContact');
  return rec.length === 1 && rec[0].body.note === '休み連絡票をFAX';
}, 'N2: note を入れたら POST body の note に乗る');

console.log('■ 6) 表示（kbCardHtml_ が 連絡済み（手段）・担当・日付・note をエスケープ表示）');
okSafe(() => {
  // kbRender を駆動して #kbox-list を検査
  const listEl = { innerHTML: '' };
  const els = { 'kbox-list': listEl };
  const env = {
    document: { getElementById: id => els[id] || { style: {}, textContent: '', value: '', innerHTML: '' } },
    absReceptionist: '下浦', jstTodayStr: () => '2026-07-08',
    kbState: {
      viewDate: '2026-07-07', checked: {},
      items: [{ name: '利用者066', unit: '午後', cmStaff: '大野', cmOffice: '梨花', care: '要介護',
        cmNotified: '連絡済み（その他）', lastOperator: '下浦', date: '2026-07-07',
        note: '<b>FAX</b>済', cls: { kind: 'mail', done: true } }],
    },
  };
  const names = ['kbEsc_', 'kbUnitGroup_', 'kbIsViewToday_', 'kbFmtChip_', 'kbUpdateBadge', 'kbRenderChrome_', 'kbRenderOperatorRow_', 'kbFmtChip_', 'kbRender'];
  // 依存の多いものは軽量スタブで補う
  const stubProto = 'function kbUpdateBadge(){} function kbRenderChrome_(){} function kbRenderOperatorRow_(){} function kbUnitGroup_(u){return String(u).indexOf("午前")>=0?"am":"pm";} function kbIsViewToday_(v,t){return String(v)===String(t);} function kbFmtChip_(d){return String(d);} function kbUpcomingAbsenceDates_(){return[];}';
  const src = stubProto + '\n' + extractFn('kbEsc_', true) + '\n' + extractFn('kbRender', true);
  const factory = new Function('document', 'absReceptionist', 'jstTodayStr', 'kbState', src + '\nreturn { kbRender: (typeof kbRender!=="undefined")?kbRender:undefined };');
  const api = factory(env.document, env.absReceptionist, env.jstTodayStr, env.kbState);
  if (!api.kbRender) throw new Error('kbRender抽出不可');
  api.kbRender();
  const h = listEl.innerHTML;
  return h.indexOf('連絡済み（その他）') >= 0 && h.indexOf('下浦') >= 0 && h.indexOf('&lt;b&gt;FAX&lt;/b&gt;済') >= 0 && h.indexOf('<b>FAX</b>済') < 0;
}, 'V1(★): 連絡済み（その他）・担当:下浦・note を表示、noteの<b>はエスケープ（生タグ出さない）');

// ---- 選択→確定フロー用スタブ（メモを書ける・即確定バグ修正） ----
function selectEnv() {
  const calls = [];
  const noteEl = { value: '', style: {} };
  const els = { 'kbox-pc-note': noteEl, 'kbox-pastcontact-modal': { style: {} }, 'kbox-pc-title': { textContent: '' } };
  const env = {
    fetch: function (url, opts) { let body = {}; try { body = JSON.parse(opts && opts.body || '{}'); } catch (e) {} calls.push({ action: body.action, body }); return Promise.resolve({}); },
    gnbGuardProdWrite: function () { return true; },
    absReceptionist: '下浦',
    ABS_BOARD_API_URL: 'https://example.test/exec',
    showToast: function (m) { calls.push({ toast: String(m || '') }); },
    kbShowModal_: function () { return { style: {} }; },
    kbLoad: function () {},
    setTimeout: function () {},
    document: { getElementById: id => els[id] || null },
    kbState: { viewDate: '2026-07-07', items: [], forward: [] },
    jstTodayStr: function () { return '2026-07-08'; },
    attMonthAbsCache: {},
    kbPendingPast: {},
    kbRenderDayNow_: () => {},
  };
  env.__calls = calls; env.__noteEl = noteEl;
  env.__mkBtn = () => ({ classList: { add: function () {}, remove: function () {} } });
  return env;
}
const FLOW_FNS = ['kbMarkContactedPast_', 'kbSelectPastMethod_', 'kbSelectPastOperator_', 'kbRenderPastOperators_', 'kbConfirmPastContact_', 'kbSubmitPastContact_', 'kbApplyPendingPast_', 'kbVerifyPendingPast_', 'kbPendingKey_', 'kbMergeDedupAbs_'];

console.log('■ 4b) 手段は選択のみ→「記録する」で確定（即確定バグ修正・メモを書ける）');
okSafe(() => {
  const env = selectEnv();
  const api = bindFns(FLOW_FNS, env);
  api.kbMarkContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastMethod_('Gmail手動', env.__mkBtn());
  return env.__calls.every(c => c.action !== 'recordPastContact');
}, 'U1(★): 手段ボタン押下では記録POSTが発火しない（選択のみ）');
okSafe(() => {
  const env = selectEnv();
  const api = bindFns(FLOW_FNS, env);
  api.kbMarkContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastMethod_('Gmail手動', env.__mkBtn());
  api.kbSelectPastOperator_('下浦', env.__mkBtn());   // 2026-07-08: 初期値なしso担当者を明示選択
  env.__noteEl.value = '休み連絡票をFAX';
  api.kbConfirmPastContact_();
  const rec = env.__calls.filter(c => c.action === 'recordPastContact');
  return rec.length === 1 && rec[0].body.cmNotified === '連絡済み（Gmail手動）' && rec[0].body.note === '休み連絡票をFAX';
}, 'U2(★): 選択→メモ入力→「記録する」で初めてPOST（メモがbodyに乗る）');
okSafe(() => {
  const env = selectEnv();
  const api = bindFns(FLOW_FNS, env);
  api.kbMarkContactedPast_('利用者066', '2026-07-07');
  api.kbConfirmPastContact_();
  const rec = env.__calls.filter(c => c.action === 'recordPastContact');
  const warned = env.__calls.some(c => c.toast && c.toast.indexOf('連絡方法') >= 0);
  return rec.length === 0 && warned;
}, 'U3(★): 手段未選択で「記録する」→ POSTせず警告');
okSafe(() => {
  const s = html.indexOf('id="kbox-pastcontact-modal"');
  const e = html.indexOf('id="kbox-help-modal"');
  const modal = html.slice(s, e);
  const methodUsesSelect = /kbSelectPastMethod_\('Gmail手動'/.test(modal);
  const noDirectSubmit = !/onclick="kbSubmitPastContact_\('Gmail手動'/.test(modal);
  const hasConfirm = /kbConfirmPastContact_\(\)/.test(modal);
  return methodUsesSelect && noDirectSubmit && hasConfirm;
}, 'U4(★構造): 手段ボタン=kbSelectPastMethod_・記録する=kbConfirmPastContact_（method即確定でない）');

// ---- 記録の編集（既存モーダル再利用・上書き） ----
function renderDoneCard(cmNotified, extra) {
  const listEl = { innerHTML: '' };
  const els = { 'kbox-list': listEl };
  const kbState = { viewDate: '2026-07-07', checked: {}, items: [Object.assign({ name: '利用者066', unit: '午後', cmStaff: '大野', cmOffice: '梨花', care: '要介護', cmNotified: cmNotified, lastOperator: '工藤', date: '2026-07-07', cls: { kind: 'mail', done: true } }, extra || {})] };
  const stub = 'function kbUpdateBadge(){} function kbRenderChrome_(){} function kbRenderOperatorRow_(){} function kbUnitGroup_(u){return "pm";} function kbIsViewToday_(v,t){return String(v)===String(t);} function kbFmtChip_(d){return String(d);} function kbUpcomingAbsenceDates_(){return[];} function kbPastContactEligible_(){return false;}';
  const src = stub + '\n' + extractFn('kbEsc_', true) + '\n' + extractFn('kbRender', true);
  const factory = new Function('document', 'absReceptionist', 'jstTodayStr', 'kbState', src + '\nreturn {kbRender: (typeof kbRender!=="undefined")?kbRender:undefined};');
  const api = factory({ getElementById: id => els[id] || { style: {}, textContent: '', value: '', innerHTML: '' } }, '下浦', () => '2026-07-08', kbState);
  api.kbRender();
  return listEl.innerHTML;
}
function editEnv() {
  const calls = [];
  const noteEl = { value: '' };
  const btnEl = { disabled: false, textContent: '記録する' };
  const els = { 'kbox-pc-note': noteEl, 'kbox-pastcontact-modal': { style: {} }, 'kbox-pc-title': { textContent: '' }, 'kbox-pc-methods': { querySelectorAll: () => [] }, 'kbox-pc-submit': btnEl };
  const env = {
    fetch: function (url, opts) { let b = {}; try { b = JSON.parse(opts && opts.body || '{}'); } catch (e) {} calls.push({ action: b.action, body: b }); return Promise.resolve({}); },
    gnbGuardProdWrite: () => true, absReceptionist: '下浦', ABS_BOARD_API_URL: 'https://example.test/exec',
    showToast: m => calls.push({ toast: String(m || '') }), kbShowModal_: id => { calls.push({ modal: id }); return { style: {} }; }, kbLoad: () => {}, setTimeout: () => {},
    document: { getElementById: id => els[id] || null, querySelectorAll: () => [] },
    kbState: { viewDate: '2026-07-07', forward: [], items: [{ name: '利用者066', date: '2026-07-07', cmNotified: '連絡済み（Gmail手動）', note: 'FAXした', lastOperator: '工藤', lastMethod: 'Gmail手動', cls: { kind: 'mail', done: true } }] },
    jstTodayStr: () => '2026-07-08',
    // 過去日カードの実データ源。書込後に無効化しないと古い担当を描き続ける（版-30の実害）
    attMonthAbsCache: { '2026-07': [{ name: '利用者066', date: '2026-07-07', lastOperator: '工藤' }] },
    kbPendingPast: {},          // 楽観的更新の保留オーバーレイ
    kbRenderForDate: () => {},
    kbRenderDayNow_: () => {},
  };
  env.__calls = calls; env.__noteEl = noteEl; env.__btn = btnEl;
  return env;
}
const EDIT_FNS = ['kbEditContactedPast_', 'kbSelectPastMethod_', 'kbSelectPastOperator_', 'kbRenderPastOperators_', 'kbConfirmPastContact_', 'kbSubmitPastContact_', 'kbApplyPendingPast_', 'kbVerifyPendingPast_', 'kbPendingKey_', 'kbMergeDedupAbs_'];
function mkBtn() { return { classList: { add: function () {}, remove: function () {} } }; }

console.log('■ 4c) 記録の編集（手動記録のみ・現在値セット・上書き・送信ゼロ）');
okSafe(() => renderDoneCard('連絡済み（Gmail手動）').indexOf('kbEditContactedPast_') >= 0, 'EB1(★): 連絡済み（手動記録）カードに「編集」ボタンが出る');
okSafe(() => renderDoneCard('送信済').indexOf('kbEditContactedPast_') < 0, 'EB2(★): 正規送信記録「送信済」には編集ボタンを出さない');
okSafe(() => renderDoneCard('電話連絡済').indexOf('kbEditContactedPast_') < 0, 'EB3(★): 「電話連絡済」にも編集ボタンを出さない');
okSafe(() => {
  const env = editEnv();
  const api = bindFns(EDIT_FNS, env);
  api.kbEditContactedPast_('利用者066', '2026-07-07');
  return env.__noteEl.value === 'FAXした' && env.__calls.some(c => c.modal === 'kbox-pastcontact-modal');
}, 'ED1(★): 編集で現在のメモが復元されモーダルが開く');
okSafe(() => {
  const env = editEnv();
  const api = bindFns(EDIT_FNS, env);
  api.kbEditContactedPast_('利用者066', '2026-07-07');   // 手段=Gmail手動・担当=工藤が選択済みで開く
  api.kbSelectPastOperator_('下浦', mkBtn());           // ★モーダル内で担当者を工藤→下浦に選び直す
  api.kbConfirmPastContact_();                          // 記録する=上書き
  const rec = env.__calls.filter(c => c.action === 'recordPastContact');
  return rec.length === 1 && rec[0].body.name === '利用者066' && rec[0].body.date === '2026-07-07' &&
         rec[0].body.cmNotified === '連絡済み（Gmail手動）' && rec[0].body.operator === '下浦';
}, 'ED2(★): 編集→担当者を選び直す→記録するで上書きPOST（同name/date・担当が工藤→下浦に更新）');
okSafe(() => {
  const env = editEnv();
  const api = bindFns(EDIT_FNS, env);
  api.kbEditContactedPast_('利用者066', '2026-07-07');
  api.kbConfirmPastContact_();
  return env.__calls.every(c => c.action !== 'send_box_cm_mails');
}, 'ED3(★送信ゼロ): 編集の上書きでも send_box_cm_mails を呼ばない');
okSafe(() => renderDoneCard('連絡済み（下浦手動）', { lastOperator: '下浦' }).indexOf('担当: 下浦') >= 0, 'ED4: 上書き後カードは新しい担当（下浦）を表示');

// ---- 担当者をモーダル内で選べる（受付者バー依存の解消） ----
console.log('■ 4d) 担当者選択（モーダル内・現在担当を初期選択・選び直して上書き）');
okSafe(() => html.indexOf('id="kbox-pc-operators"') >= 0, 'OP1(★構造): モーダル内に担当者コンテナ kbox-pc-operators がある');
okSafe(() => {
  const s = html.indexOf('id="kbox-pastcontact-modal"');
  const e = html.indexOf('id="kbox-help-modal"');
  const modal = html.slice(s, e);
  // 並び: ①連絡方法(kbox-pc-methods) ②担当者(kbox-pc-operators) ③メモ(kbox-pc-note)
  return modal.indexOf('kbox-pc-methods') < modal.indexOf('kbox-pc-operators')
      && modal.indexOf('kbox-pc-operators') < modal.indexOf('kbox-pc-note');
}, 'OP2(★構造): モーダル項目の並びが ①連絡方法 →②担当者 →③メモ');
okSafe(() => {
  // 担当者ボタン描画: 名簿=getStaff−EXCLUDED_STAFF、選択済みは selected、data-operator付与
  const box = { innerHTML: '' };
  const env = {
    document: { getElementById: id => (id === 'kbox-pc-operators' ? box : null) },
    getStaff: () => ['比嘉', '星野', '下浦', '工藤'],
    EXCLUDED_STAFF: ['比嘉'],
  };
  const api = bindFns(['kbEsc_', 'kbRenderPastOperators_'], env);
  api.kbRenderPastOperators_('工藤');
  const h = box.innerHTML;
  return h.indexOf('data-operator="工藤"') >= 0 && h.indexOf('data-operator="下浦"') >= 0
      && h.indexOf('比嘉') < 0                                   // 社長は候補から除外
      && /data-operator="工藤"[^>]*>|selected[^>]*data-operator="工藤"/.test(h)
      && h.indexOf('selected') >= 0;                             // 現在担当がハイライト
}, 'OP3(★): 担当者ボタン=getStaff−EXCLUDED_STAFF・data-operator付与・現在担当をハイライト');
okSafe(() => {
  const env = editEnv();
  const api = bindFns(EDIT_FNS, env);
  api.kbEditContactedPast_('利用者066', '2026-07-07');   // 現在担当=工藤 が初期選択
  api.kbConfirmPastContact_();                          // 選び直さずそのまま記録
  const rec = env.__calls.filter(c => c.action === 'recordPastContact');
  return rec.length === 1 && rec[0].body.operator === '工藤';
}, 'OP4(★): 編集で現在担当(工藤)が初期選択され、触らなければ工藤のまま上書き（受付者バーで勝手に変わらない）');
okSafe(() => {
  const env = editEnv();
  const api = bindFns(EDIT_FNS, env);
  api.kbEditContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastOperator_('星野', mkBtn());           // 別の担当者に選び直す
  api.kbConfirmPastContact_();
  const rec = env.__calls.filter(c => c.action === 'recordPastContact');
  return rec.length === 1 && rec[0].body.operator === '星野';
}, 'OP5(★): 編集で担当者を選び直すと operator が上書きされる');
okSafe(() => {
  const env = editEnv();
  const api = bindFns(EDIT_FNS, env);
  api.kbEditContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastOperator_('星野', mkBtn());
  api.kbConfirmPastContact_();
  return env.__calls.every(c => c.action !== 'send_box_cm_mails');
}, 'OP6(★送信ゼロ): 担当者を変えた上書きでも send_box_cm_mails を呼ばない');
// OP7反転(2026-07-08): 受付者バー削除so「初期値=受付者バー」は廃止。初期値なし＝毎回選ぶ。
// 未選択のまま記録できてしまうと「担当が空/前の人」の誤記録になるso必ず止まることを固定する。
okSafe(() => {
  const env = selectEnv();                              // 受付者バーは存在しない（env.absReceptionist は無視される）
  const api = bindFns(FLOW_FNS, env);
  api.kbMarkContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastMethod_('電話', env.__mkBtn());
  api.kbConfirmPastContact_();                          // 担当者を選ばずに記録
  const rec = env.__calls.filter(c => c.action === 'recordPastContact');
  return rec.length === 0;                              // ★POSTさせない
}, 'OP7(★反転・誤記録防止): 担当者未選択なら記録POSTが発火しない（受付者バーの値を勝手に使わない）');
okSafe(() => {
  const env = selectEnv();
  const api = bindFns(FLOW_FNS, env);
  api.kbMarkContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastMethod_('電話', env.__mkBtn());
  api.kbSelectPastOperator_('星野', env.__mkBtn());     // モーダル内で選んだ人だけが記録される
  api.kbConfirmPastContact_();
  const rec = env.__calls.filter(c => c.action === 'recordPastContact');
  return rec.length === 1 && rec[0].body.operator === '星野';
}, 'OP7b(★): モーダルで選んだ担当者(星野)が記録される（受付者バー直読でない）');
okSafe(() => {
  const src = extractFn('kbMarkContactedPast_');
  return src.indexOf('absReceptionist') < 0;
}, 'OP7c(★初期値なし): kbMarkContactedPast_ が absReceptionist を初期値にしない');
okSafe(() => {
  // 過去日カードは attMonthAbsCache[月] 由来。書込後に無効化しないと kbLoad しても
  // 古い lastOperator(工藤) を描き続ける（本番で「担当:工藤のまま」になった実害）。
  const env = editEnv();
  const api = bindFns(EDIT_FNS, env);
  api.kbEditContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastOperator_('星野', mkBtn());
  api.kbConfirmPastContact_();
  return !('2026-07' in env.attMonthAbsCache);   // 対象日の月キャッシュが無効化される
}, 'OP8(★実害): 記録/編集の書込後、対象日の月キャッシュ attMonthAbsCache[YYYY-MM] を無効化する');

// ---- 楽観的更新＋ライトバック検証（no-corsは成否を読めない＝嘘表示を残さない設計） ----
// ★POSTの .then/.catch はサーバエラーを拾えない（コード内明記）。よって「成功したことにする」のでなく
//   楽観的に描く→裏でサーバ値を読み直す→一致しなければ巻き戻す（既存の配置ライトバック検証④と同型）。
console.log('■ 4e) 楽観的更新＋ライトバック検証（体感即時・嘘表示を残さない）');

// 純関数: pool へ保留オーバーレイを適用する（kbRenderDayNow_ が items を再構築しても消えない層）
okSafe(() => {
  const { kbApplyPendingPast_ } = bindFns(['kbApplyPendingPast_', 'kbPendingKey_'], {});
  const pool = [{ name: '利用者066', date: '2026-07-07', unit: '午後', cmNotified: '連絡済み（Gmail手動）', lastOperator: '工藤', lastMethod: 'Gmail手動' }];
  const pending = { '利用者066|2026-07-07': { cmNotified: '連絡済み（電話）', lastOperator: '星野', lastMethod: '電話', note: 'かけ直した' } };
  const out = kbApplyPendingPast_(pool, pending);
  const h = out[0];
  return h.lastOperator === '星野' && h.lastMethod === '電話' && h.cmNotified === '連絡済み（電話）' && h.note === 'かけ直した';
}, 'OU1(★): 保留オーバーレイが pool の該当行を新しい担当/手段/メモで上書きする');
okSafe(() => {
  const { kbApplyPendingPast_ } = bindFns(['kbApplyPendingPast_', 'kbPendingKey_'], {});
  const pool = [{ name: '別人', date: '2026-07-07', lastOperator: '工藤' }];
  const pending = { '利用者066|2026-07-07': { lastOperator: '星野' } };
  const out = kbApplyPendingPast_(pool, pending);
  return out[0].lastOperator === '工藤';     // 無関係な行は触らない
}, 'OU2: 保留オーバーレイは対象(name|date)以外の行を書き換えない');
okSafe(() => {
  const { kbApplyPendingPast_ } = bindFns(['kbApplyPendingPast_', 'kbPendingKey_'], {});
  const pool = [{ name: '利用者066', date: '2026-07-07', lastOperator: '工藤' }];
  const out = kbApplyPendingPast_(pool, {});   // 保留なし＝素通し
  return out[0].lastOperator === '工藤' && out.length === 1;
}, 'OU3: 保留が無ければ pool を素通しする（既存描画に影響しない）');

// 押下フィードバック＋楽観的更新: サーバ応答前にオーバーレイが積まれる
okSafe(() => {
  const env = editEnv();
  const api = bindFns(EDIT_FNS, env);
  api.kbEditContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastOperator_('星野', mkBtn());
  api.kbConfirmPastContact_();
  const p = env.kbPendingPast['利用者066|2026-07-07'];
  return !!p && p.lastOperator === '星野';    // POST直後(応答前)に既に反映されている
}, 'OU4(★体感即時): 「記録する」押下と同時に保留オーバーレイへ新しい担当が積まれる（サーバ応答を待たない）');
okSafe(() => {
  const env = editEnv();
  const api = bindFns(EDIT_FNS, env);
  api.kbEditContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastOperator_('星野', mkBtn());
  api.kbConfirmPastContact_();
  const p = env.kbPendingPast['利用者066|2026-07-07'];
  return !!p && p.prev && p.prev.lastOperator === '工藤';   // 巻き戻し用の更新前の値
}, 'OU5(★巻き戻し準備): 保留に更新前の値(prev)を保持する（失敗時に元へ戻せる）');
okSafe(() => {
  const env = editEnv();
  const api = bindFns(EDIT_FNS, env);
  api.kbEditContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastOperator_('星野', mkBtn());
  api.kbConfirmPastContact_();
  return env.__btn.disabled === true && String(env.__btn.textContent).indexOf('保存中') >= 0;
}, 'OU6(★押下フィードバック): 押下で「記録する」ボタンが無効化され「保存中…」になる（二度押し防止）');

// ライトバック検証: サーバ値と突合して確定 or 巻き戻し
okSafe(() => {
  const { kbVerifyPendingPast_ } = bindFns(['kbVerifyPendingPast_', 'kbPendingKey_'], {});
  const pending = { '利用者066|2026-07-07': { lastOperator: '星野', cmNotified: '連絡済み（電話）', prev: { lastOperator: '工藤' } } };
  const server = [{ name: '利用者066', date: '2026-07-07', lastOperator: '星野', cmNotified: '連絡済み（電話）' }];
  const r = kbVerifyPendingPast_(pending, server, '利用者066|2026-07-07');
  return r.ok === true && !('利用者066|2026-07-07' in pending);   // 一致→保留を解除（表示は維持）
}, 'OU7(★確定): サーバ値が楽観値と一致したら保留を解除する（二重描画で古い値に戻らない）');
okSafe(() => {
  const { kbVerifyPendingPast_ } = bindFns(['kbVerifyPendingPast_', 'kbPendingKey_'], {});
  const pending = { '利用者066|2026-07-07': { lastOperator: '星野', cmNotified: '連絡済み（電話）', prev: { lastOperator: '工藤' } } };
  const server = [{ name: '利用者066', date: '2026-07-07', lastOperator: '工藤', cmNotified: '連絡済み（Gmail手動）' }];  // 書込が通っていない
  const r = kbVerifyPendingPast_(pending, server, '利用者066|2026-07-07');
  return r.ok === false && !('利用者066|2026-07-07' in pending);   // 不一致→保留破棄＝サーバ値(工藤)が出る
}, 'OU8(★★嘘表示を残さない): サーバ値が楽観値と違えば保留を破棄し、元(サーバ)の担当に戻す');
okSafe(() => {
  const src = extractFn('kbVerifyPendingPast_', true) + extractFn('kbSubmitPastContact_', true);
  return /記録できませんでした|記録を確認できませんでした/.test(src);
}, 'OU9(★): 巻き戻し時に明示エラーを出す（黙って戻さない）');

// ちらつき/整合
okSafe(() => {
  const src = extractFn('kbRenderDayNow_', true);
  return /kbApplyPendingPast_/.test(src);
}, 'OU10(★ちらつき防止): kbRenderDayNow_ が pool に保留オーバーレイを適用してから items を作る（遅れて返る再取得が楽観表示を崩さない）');
okSafe(() => {
  const env = editEnv();
  const api = bindFns(EDIT_FNS, env);
  api.kbEditContactedPast_('利用者066', '2026-07-07');
  api.kbSelectPastOperator_('星野', mkBtn());
  api.kbConfirmPastContact_();
  return env.__calls.every(c => c.action !== 'send_box_cm_mails');
}, 'OU11(★送信ゼロ): 楽観的更新を入れても send_box_cm_mails を呼ばない');

console.log('\n実測ハーネス(past-contact): ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
