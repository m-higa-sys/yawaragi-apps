// Step A: 記録ボタンの範囲拡大 TDDハーネス（2026-07-09）
// 目的: 記録ボタンを「第3営業日以内」→「過去日で未対応が残る限り（直近12ヶ月）」へ拡大する。
//       未対応が残っている限りいつでも記録できるべき（6/29が第3営業日を過ぎ記録不能で10日放置の再発防止）。
//
// ★範囲の分離（指示書§2調査③）: kbPastContactEligible_（第3営業日＝アラート赤用）は残す。
//   記録ボタンは新規 kbPastContactRecordable_（過去日 && 直近12ヶ月）で判定する。混ぜると赤の境界が崩れる。
// ★記録処理は不変: recordPastContact POST・kbSubmitPastContact_ は触らない（表示条件だけ差し替え）。
// ★書込ゼロ・送信ゼロ: send_box_cm_mails / gnbGuardProdWrite 本数不変・Phase4非接触。
// ★実データ経路を突く: kbRender を実駆動して #kbox-list の記録ボタン有無を実測（DOM無しモックで済ませない）。
//
// 実行: node scripts/verify-kbox-record-range.js
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
function okSafe(thunk, label) { try { ok(!!thunk(), label); } catch (e) { fail++; console.log('  [FAIL] ' + label + '  «' + (e && e.message) + '»'); } }

// 実コードのトップレベル定数を実物のまま抽出（テストと実装で値がずれないように）。
function extractConst(name) {
  const m = html.match(new RegExp('const\\s+' + name + '\\s*=\\s*([^;]+);'));
  if (!m) throw new Error('const ' + name + ' が無い');
  return 'const ' + name + ' = ' + m[1].trim() + ';';
}
const CONSTS = extractConst('KB_RECORD_MONTHS');   // 記録範囲の月数（実物＝12）

function bindPure(names) {
  const src = names.map(n => extractFn(n, true)).filter(Boolean).join('\n\n');
  const body = CONSTS + '\n' + src + '\n\nreturn {' + names.map(n => n + ': (typeof ' + n + '!=="undefined")?' + n + ':undefined').join(', ') + '};';
  return new Function(body)();
}

// ================= P) 純関数 kbPastContactRecordable_（過去日 && 直近12ヶ月） =================
console.log('■ P) kbPastContactRecordable_（過去日 && 直近12ヶ月・記録ボタンの新範囲）');
const PURE = ['kbAddDaysYMD_', 'kbBizDaysAgo_', 'kbPastContactEligible_', 'kbPastContactRecordable_'];

okSafe(() => { const p = bindPure(PURE); return p.kbPastContactRecordable_('2026-07-07', '2026-07-08') === true; },
  'P1: 7/7（過去1日）→ 記録可');
okSafe(() => { const p = bindPure(PURE); return p.kbPastContactRecordable_('2026-07-02', '2026-07-08') === true; },
  'P2(★拡大の核心): 7/2（第3営業日超）でも過去日なら 記録可（旧eligibleはfalseの日）');
okSafe(() => { const p = bindPure(PURE); return p.kbPastContactRecordable_('2026-06-29', '2026-07-08') === true; },
  'P3(★実害の再発防止): 6/29（10日前）→ 記録可（放置10日の再発を防ぐ）');
okSafe(() => { const p = bindPure(PURE); return p.kbPastContactRecordable_('2025-07-08', '2026-07-08') === true; },
  'P4(★境界): ちょうど12ヶ月前（同日）→ 記録可（境界含む）');
okSafe(() => { const p = bindPure(PURE); return p.kbPastContactRecordable_('2025-07-07', '2026-07-08') === false; },
  'P5(★境界): 12ヶ月と1日前 → 記録不可（際限ない遡及を避ける）');
okSafe(() => { const p = bindPure(PURE); return p.kbPastContactRecordable_('2026-07-08', '2026-07-08') === false; },
  'P6: 当日 → 記録不可（当日フローで対応）');
okSafe(() => { const p = bindPure(PURE); return p.kbPastContactRecordable_('2026-07-09', '2026-07-08') === false; },
  'P7: 未来日 → 記録不可');
okSafe(() => { const p = bindPure(PURE); return p.kbPastContactRecordable_('', '2026-07-08') === false && p.kbPastContactRecordable_(null, '2026-07-08') === false; },
  'P8: 空/null で落ちない・false');

// ================= Q) 範囲の分離（eligible=赤は不変・recordableが上位集合） =================
console.log('■ Q) 範囲の分離（eligible＝赤は不変・recordable が eligible を包含）');
okSafe(() => {
  const p = bindPure(PURE);
  // eligible=true なら recordable=true（赤は必ず記録可）。逆は成り立たない日がある。
  const days = ['2026-07-07', '2026-07-06', '2026-07-03', '2026-07-02', '2026-06-29', '2026-05-01'];
  return days.every(d => !p.kbPastContactEligible_(d, '2026-07-08') || p.kbPastContactRecordable_(d, '2026-07-08'));
}, 'Q1(★): eligible⊆recordable（赤の日は必ず記録可）');
okSafe(() => {
  const p = bindPure(PURE);
  // eligible の境界は不変（Step Aで赤判定を変えていない）
  return p.kbPastContactEligible_('2026-07-03', '2026-07-08') === true &&
         p.kbPastContactEligible_('2026-07-02', '2026-07-08') === false;
}, 'Q2(★非接触): kbPastContactEligible_ の第3営業日境界は不変（赤判定を壊さない）');

// ================= R) 記録ボタン表示（実データ経路 kbRender を実駆動） =================
console.log('■ R) 記録ボタン表示（kbRender を実駆動・#kbox-list を実測）');

// kbRender を駆動して #kbox-list の HTML を得る（V1と同型）。viewDate=過去日・未対応1件。
function renderList(viewDate, today, item) {
  const listEl = { innerHTML: '' };
  const els = { 'kbox-list': listEl };
  const env = {
    document: { getElementById: id => els[id] || { style: {}, textContent: '', value: '', innerHTML: '' } },
    absReceptionist: '下浦', jstTodayStr: () => today,
    kbState: { viewDate: viewDate, checked: {}, items: [item] },
  };
  const stubProto = CONSTS + '\n'
    + 'function kbUpdateBadge(){} function kbRenderChrome_(){} function kbRenderOperatorRow_(){} '
    + 'function kbUnitGroup_(u){return String(u).indexOf("午前")>=0?"am":"pm";} '
    + 'function kbIsViewToday_(v,t){return String(v)===String(t);} function kbFmtChip_(d){return String(d);}';
  // 実物を使う: kbEsc_ / kbBizDaysAgo_ / kbPastContactEligible_ / kbPastContactRecordable_ / kbRender
  const src = stubProto + '\n'
    + extractFn('kbEsc_', true) + '\n'
    + extractFn('kbAddDaysYMD_', true) + '\n'
    + extractFn('kbBizDaysAgo_', true) + '\n'
    + extractFn('kbPastContactEligible_', true) + '\n'
    + extractFn('kbPastContactRecordable_', true) + '\n'
    + extractFn('kbRender', true);
  const factory = new Function('document', 'absReceptionist', 'jstTodayStr', 'kbState',
    src + '\nreturn { kbRender: (typeof kbRender!=="undefined")?kbRender:undefined };');
  const api = factory(env.document, env.absReceptionist, env.jstTodayStr, env.kbState);
  if (!api.kbRender) throw new Error('kbRender抽出不可');
  api.kbRender();
  return listEl.innerHTML;
}
// 未対応（done=false・電話派）カード
function pendingCard(date) {
  return { name: '利用者066', unit: '午後', cmStaff: '大野', cmOffice: '梨花', care: '要介護',
    cmNotified: '', lastOperator: '', date: date, note: '', cls: { kind: 'phone', done: false } };
}
const RECBTN = '送らず記録';   // 記録ボタンの識別子（onclick=kbMarkContactedPast_ のボタン文言）

okSafe(() => renderList('2026-07-07', '2026-07-08', pendingCard('2026-07-07')).indexOf(RECBTN) >= 0,
  'R1: 7/7（過去・未対応）→ 記録ボタンが出る（従来どおり）');
okSafe(() => renderList('2026-07-02', '2026-07-08', pendingCard('2026-07-02')).indexOf(RECBTN) >= 0,
  'R2(★拡大): 7/2（第3営業日超・未対応）→ 記録ボタンが出る（旧仕様では出なかった日）');
okSafe(() => renderList('2026-06-29', '2026-07-08', pendingCard('2026-06-29')).indexOf(RECBTN) >= 0,
  'R3(★実害の再発防止): 6/29（10日前・未対応）→ 記録ボタンが出る');
okSafe(() => renderList('2026-07-08', '2026-07-08', pendingCard('2026-07-08')).indexOf(RECBTN) < 0,
  'R4: 当日 → 記録ボタンは出さない（当日フローで対応・二重化しない）');
okSafe(() => renderList('2025-07-07', '2026-07-08', pendingCard('2025-07-07')).indexOf(RECBTN) < 0,
  'R5(★境界): 12ヶ月と1日前 → 記録ボタンを出さない');
okSafe(() => {
  // done（連絡済み）には記録ボタンを出さない（else節の中＝未対応のみ）
  const doneCard = { name: '利用者066', unit: '午後', cmStaff: '大野', cmOffice: '梨花', care: '要介護',
    cmNotified: '連絡済み（その他）', lastOperator: '下浦', date: '2026-07-02', note: '', cls: { kind: 'mail', done: true } };
  return renderList('2026-07-02', '2026-07-08', doneCard).indexOf(RECBTN) < 0;
}, 'R6(★): done（連絡済み）の過去日には記録ボタンを出さない（未対応のみ）');

// ================= S) 書込ゼロ・非接触（本数不変・記録処理は無改変） =================
console.log('■ S) 書込ゼロ・非接触（記録処理は無改変・本数不変）');
okSafe(() => (html.match(/send_box_cm_mails/g) || []).length === 1, 'S1(★): send_box_cm_mails は1箇所のまま');
okSafe(() => (html.match(/gnbGuardProdWrite/g) || []).length === 13, 'S2(★): gnbGuardProdWrite は13本のまま');
// ★実POST本数で見る（総出現数はコメント増減で脆い＝Step Aで説明コメントが2つ増えて6になった）。
//   記録処理の新設（新たな recordPastContact POST）だけを落とす本質基準。
okSafe(() => (html.match(/action:\s*'recordPastContact'/g) || []).length === 1, 'S3(★): recordPastContact の実POSTは1本のまま（記録処理不変）');
okSafe(() => {
  // 記録処理 kbSubmitPastContact_ は無改変（recordPastContact POST を1本・send非呼び）
  const src = extractFn('kbSubmitPastContact_');
  return (src.match(/action: 'recordPastContact'/g) || []).length === 1 && src.indexOf('send_box_cm_mails') < 0;
}, 'S4(★記録処理不変): kbSubmitPastContact_ は recordPastContact 1本のみ・send非呼び');
okSafe(() => {
  // 記録ボタンの表示条件は kbPastContactRecordable_ に差し替わっている（旧 kbPastContactEligible_ ではない）
  const s = html.indexOf('function kbCardHtml_');
  const e = html.indexOf('return `<div style="border', s);
  const seg = html.slice(s, e);
  return seg.indexOf('kbPastContactRecordable_') >= 0;
}, 'S5(★差し替え): 記録ボタン表示条件は kbPastContactRecordable_ を使う');

console.log('\n実測ハーネス(record-range): ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
