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
  const prelude = 'let kbPastContactEditing = null;\nlet kbPastContactMethod = "";\n';
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
    kbState: { viewDate: '2026-07-07', items: [{ name: '根岸君男', date: '2026-07-07' }] },
    jstTodayStr: function () { return '2026-07-08'; },
  };
  env.__calls = calls;
  return env;
}

console.log('■ 4) 記録フロー（recordPastContact をPOST・★send_box_cm_mails 非呼び）');
okSafe(() => {
  const env = recordEnv();
  const api = bindFns(['kbMarkContactedPast_', 'kbSubmitPastContact_'], env);
  api.kbMarkContactedPast_('根岸君男', '2026-07-07');
  return env.__calls.some(c => c.modal === 'kbox-pastcontact-modal');
}, 'R1(★): 連絡済みボタン→ 手段モーダルを kbShowModal_ 経由で開く');
okSafe(() => {
  const env = recordEnv();
  const api = bindFns(['kbMarkContactedPast_', 'kbSubmitPastContact_'], env);
  api.kbMarkContactedPast_('根岸君男', '2026-07-07');
  api.kbSubmitPastContact_('Gmail手動', '');
  const rec = env.__calls.filter(c => c.action === 'recordPastContact');
  return rec.length === 1 && rec[0].body.cmNotified === '連絡済み（Gmail手動）' && rec[0].body.operator === '下浦' && rec[0].body.date === '2026-07-07';
}, 'R2(★): 手段選択→ recordPastContact を1回POST(cmNotified/operator/date 正)');
okSafe(() => {
  const env = recordEnv();
  const api = bindFns(['kbMarkContactedPast_', 'kbSubmitPastContact_'], env);
  api.kbMarkContactedPast_('根岸君男', '2026-07-07');
  api.kbSubmitPastContact_('Gmail手動', 'テスト');
  return env.__calls.every(c => c.action !== 'send_box_cm_mails');
}, 'R3(★★送信ゼロ): 記録フローは send_box_cm_mails を一切呼ばない');

console.log('■ 5) note 異常系（空OK / 入れたら値に乗る / 特殊文字も壊さず送る）');
okSafe(() => {
  const env = recordEnv();
  const api = bindFns(['kbMarkContactedPast_', 'kbSubmitPastContact_'], env);
  api.kbMarkContactedPast_('根岸君男', '2026-07-07');
  api.kbSubmitPastContact_('その他', '');   // note空
  const rec = env.__calls.filter(c => c.action === 'recordPastContact');
  return rec.length === 1 && rec[0].body.cmNotified === '連絡済み（その他）';
}, 'N1: note空でも記録が通る（エラーにならず 連絡済み（その他））');
okSafe(() => {
  const env = recordEnv();
  const api = bindFns(['kbMarkContactedPast_', 'kbSubmitPastContact_'], env);
  api.kbMarkContactedPast_('根岸君男', '2026-07-07');
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
      items: [{ name: '根岸君男', unit: '午後', cmStaff: '大野', cmOffice: '梨花', care: '要介護',
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
    kbState: { viewDate: '2026-07-07' },
    jstTodayStr: function () { return '2026-07-08'; },
  };
  env.__calls = calls; env.__noteEl = noteEl;
  env.__mkBtn = () => ({ classList: { add: function () {}, remove: function () {} } });
  return env;
}
const FLOW_FNS = ['kbMarkContactedPast_', 'kbSelectPastMethod_', 'kbConfirmPastContact_', 'kbSubmitPastContact_'];

console.log('■ 4b) 手段は選択のみ→「記録する」で確定（即確定バグ修正・メモを書ける）');
okSafe(() => {
  const env = selectEnv();
  const api = bindFns(FLOW_FNS, env);
  api.kbMarkContactedPast_('根岸君男', '2026-07-07');
  api.kbSelectPastMethod_('Gmail手動', env.__mkBtn());
  return env.__calls.every(c => c.action !== 'recordPastContact');
}, 'U1(★): 手段ボタン押下では記録POSTが発火しない（選択のみ）');
okSafe(() => {
  const env = selectEnv();
  const api = bindFns(FLOW_FNS, env);
  api.kbMarkContactedPast_('根岸君男', '2026-07-07');
  api.kbSelectPastMethod_('Gmail手動', env.__mkBtn());
  env.__noteEl.value = '休み連絡票をFAX';
  api.kbConfirmPastContact_();
  const rec = env.__calls.filter(c => c.action === 'recordPastContact');
  return rec.length === 1 && rec[0].body.cmNotified === '連絡済み（Gmail手動）' && rec[0].body.note === '休み連絡票をFAX';
}, 'U2(★): 選択→メモ入力→「記録する」で初めてPOST（メモがbodyに乗る）');
okSafe(() => {
  const env = selectEnv();
  const api = bindFns(FLOW_FNS, env);
  api.kbMarkContactedPast_('根岸君男', '2026-07-07');
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

console.log('\n実測ハーネス(past-contact): ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
