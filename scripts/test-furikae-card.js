// furikae ③カード機能 純関数テスト（実コード抽出方式）
// 対象(Step1): fnkTodoText / fnkNormalizeRecord / fnkApplyContact / fnkContactBadge / fnkExtraBadges
// 実行: node scripts/test-furikae-card.js

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'furikae.html'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name;
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('furikae.html に ' + sig + ' が無い（未実装＝RED）');
  let i = html.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + '\n    expected ' + e + '\n    actual   ' + a); }
}
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

// ===== fnkTodoText（やること文面 code→文）=====
const scopeTodo = {};
new Function('sb',
  extractFn('fnkExtractResultCode') + '\n' +
  extractFn('fnkBadgeFor') + '\n' +
  extractFn('fnkTodoText') + '\n' +
  'sb.fnkTodoText = fnkTodoText;'
)(scopeTodo);
const fnkTodoText = scopeTodo.fnkTodoText;

const TODO_1 = '翌月2ヶ月分まとめて引き落とされる旨を利用者（またはご家族）に伝える';
const TODO_3 = '口座の状態を確認し、翌月の振替可否を電話で確認する';
const TODO_OTHER = '電話で状況を確認する';

console.log('[fnkTodoText]');
eq(fnkTodoText({ resultCode: '1' }), TODO_1, 'code1(残高不足)→翌月2ヶ月分文面');
eq(fnkTodoText({ resultCode: '3' }), TODO_3, 'code3(停止預金者)→口座確認文面');
eq(fnkTodoText({ resultCode: '2' }), TODO_OTHER, 'code2(取引なし)→電話で状況確認');
eq(fnkTodoText({ resultCode: '4' }), TODO_OTHER, 'code4(依頼書なし)→電話で状況確認');
eq(fnkTodoText({ resultCode: '9' }), TODO_OTHER, 'code9(その他)→電話で状況確認');
eq(fnkTodoText({ reason: '残高不足' }), TODO_1, 'reason推定 残高不足→翌月2ヶ月分文面');
eq(fnkTodoText({ reason: '振替停止（預金者都合）' }), TODO_3, 'reason推定 停止→口座確認文面');
eq(fnkTodoText({}), TODO_OTHER, '不明→電話で状況確認（安全側）');

// ===== fnkNormalizeRecord（schema後方互換：新フィールドを既定値で補完・既存は温存）=====
const scopeNorm = {};
new Function('sb', extractFn('fnkNormalizeRecord') + '\nsb.fnkNormalizeRecord = fnkNormalizeRecord;')(scopeNorm);
const fnkNormalizeRecord = scopeNorm.fnkNormalizeRecord;

console.log('\n[fnkNormalizeRecord]');
const n1 = fnkNormalizeRecord({});
eq(n1.occurrence, 1, '空→occurrence既定1');
eq(n1.prevAmount, null, '空→prevAmount既定null');
eq(n1.nextMonthAbsent, false, '空→nextMonthAbsent既定false');
eq(n1.contactedBy, null, '空→contactedBy既定null');
eq(n1.contactedAt, null, '空→contactedAt既定null');
eq(n1.contactMethod, null, '空→contactMethod既定null');
const n2 = fnkNormalizeRecord({ status: '未対応', amount: 1200, customerId: '149' });
eq(n2.status, '未対応', '既存status温存');
eq(n2.amount, 1200, '既存amount温存');
eq(n2.customerId, '149', '既存customerId温存');
const n3 = fnkNormalizeRecord({ occurrence: 2, prevAmount: 5000, nextMonthAbsent: true, contactedBy: '下浦' });
eq(n3.occurrence, 2, '既存occurrence温存(既定1で上書きしない)');
eq(n3.prevAmount, 5000, '既存prevAmount温存');
eq(n3.nextMonthAbsent, true, '既存nextMonthAbsent温存');
eq(n3.contactedBy, '下浦', '既存contactedBy温存');

// ===== fnkApplyContact（連絡記録でレコードを更新・純関数で新オブジェクト返す）=====
const scopeApply = {};
new Function('sb', extractFn('fnkApplyContact') + '\nsb.fnkApplyContact = fnkApplyContact;')(scopeApply);
const fnkApplyContact = scopeApply.fnkApplyContact;

console.log('\n[fnkApplyContact]');
const a1 = fnkApplyContact({ status: '未対応', amount: 1200, customerId: '149' }, { operator: '下浦', method: '電話', dateStr: '2026-07-10' });
eq(a1.status, '連絡済み', '連絡記録→status=連絡済み');
eq(a1.contactedBy, '下浦', 'contactedBy=operator');
eq(a1.contactMethod, '電話', 'contactMethod=method');
eq(a1.contactedAt, '2026-07-10', 'contactedAt=dateStr');
eq(a1.amount, 1200, '既存amount温存');
eq(a1.customerId, '149', '既存customerId温存');
// 追記型＝再連絡で最新に更新（バッジは最新表示）
const a2 = fnkApplyContact(a1, { operator: '町田', method: '家族経由', dateStr: '2026-07-15' });
eq(a2.contactedBy, '町田', '再連絡→最新のcontactedByに更新');
eq(a2.contactMethod, '家族経由', '再連絡→最新のmethodに更新');
eq(a2.contactedAt, '2026-07-15', '再連絡→最新のdateに更新');
// 元オブジェクトを破壊しない（純関数）
const src = { status: '未対応' };
fnkApplyContact(src, { operator: '下浦', method: '電話', dateStr: '2026-07-10' });
eq(src.status, '未対応', '元オブジェクトを破壊しない（純関数）');

// ===== fnkContactBadge（✓連絡済 M/D 名前）=====
const scopeCB = {};
new Function('sb', extractFn('fnkContactBadge') + '\nsb.fnkContactBadge = fnkContactBadge;')(scopeCB);
const fnkContactBadge = scopeCB.fnkContactBadge;

console.log('\n[fnkContactBadge]');
eq(fnkContactBadge({ contactedBy: '下浦', contactedAt: '2026-07-10' }), '✓連絡済 7/10 下浦', '連絡済→M/D 名前');
eq(fnkContactBadge({ contactedBy: '町田', contactedAt: '2026-12-05' }), '✓連絡済 12/5 町田', '2桁月/1桁日も正しい');
eq(fnkContactBadge({}), '', '未連絡→空文字（バッジ出さない）');
eq(fnkContactBadge({ contactedBy: null }), '', 'contactedBy null→空');

// ===== fnkExtraBadges（2回目/⚠️要確認・表示側の判定はStep1・値はStep2）=====
const scopeEB = {};
new Function('sb', extractFn('fnkExtraBadges') + '\nsb.fnkExtraBadges = fnkExtraBadges;')(scopeEB);
const fnkExtraBadges = scopeEB.fnkExtraBadges;

console.log('\n[fnkExtraBadges]');
ok(fnkExtraBadges({ occurrence: 2 }).some(function (b) { return b.indexOf('2回目') >= 0; }), 'occurrence2→「2回目」バッジ');
ok(fnkExtraBadges({ occurrence: 3, prevAmount: 5863 }).some(function (b) { return b.indexOf('2回目') >= 0 && b.indexOf('5,863') >= 0; }), 'occurrence≧2+prevAmount→累積額表示');
ok(fnkExtraBadges({ occurrence: 1 }).length === 0, 'occurrence1→バッジなし');
ok(fnkExtraBadges({ nextMonthAbsent: true }).some(function (b) { return b.indexOf('要確認') >= 0; }), 'nextMonthAbsent→「⚠️翌月請求なし・要確認」');
ok(fnkExtraBadges({ nextMonthAbsent: false }).length === 0, 'nextMonthAbsent false→バッジなし');
ok(fnkExtraBadges({}).length === 0, '既定→バッジなし');

// ===== ③連絡フロー UI配線（構造検査：関数存在・originガード・純関数呼び出し）=====
console.log('\n[UI配線]');
ok(html.indexOf('function fnkContactStart') >= 0, 'fnkContactStart 存在（連絡ボタン起点）');
ok(html.indexOf('function fnkConfirmContact') >= 0, 'fnkConfirmContact 存在');
ok(html.indexOf('function fnkPostContact') >= 0, 'fnkPostContact 存在');
const postBody = extractFn('fnkPostContact');
ok(postBody.indexOf('fnkGuardProdWrite') >= 0, 'fnkPostContact は fnkGuardProdWrite を通す（originガード=tripwire維持）');
ok(postBody.indexOf('recordFurikaeContact') >= 0, 'fnkPostContact は action:recordFurikaeContact をPOST');
const confirmBody = extractFn('fnkConfirmContact');
ok(confirmBody.indexOf('fnkApplyContact') >= 0, 'fnkConfirmContact が fnkApplyContact でレコード更新');
ok(confirmBody.indexOf('saveData') >= 0, 'fnkConfirmContact が saveData（cloudSync=ガード経由）で保存');
const cardBody = extractFn('fnkCardHtml');
ok(cardBody.indexOf('fnkTodoText') >= 0, 'fnkCardHtml が やること文面(fnkTodoText)を表示');
ok(cardBody.indexOf('fnkContactBadge') >= 0, 'fnkCardHtml が 連絡済みバッジ(fnkContactBadge)を表示');
ok(cardBody.indexOf('fnkExtraBadges') >= 0, 'fnkCardHtml が 2回目/要確認バッジ(fnkExtraBadges)を表示');
ok(cardBody.indexOf('fnkContactStart') >= 0, 'fnkCardHtml に 連絡済みボタン(fnkContactStart)');
ok(html.indexOf('FURIKAE_STAFF') >= 0, 'スタッフ名簿 FURIKAE_STAFF 定義（genba職員リスト・比嘉除外）');

// ===== fnkCardHtml 統合（テストデータで やること文面・連絡バッジ・2回目/要確認バッジ が実際に描画される）=====
const scopeCard = {};
new Function('sb',
  extractFn('fnkExtractResultCode') + '\n' +
  extractFn('fnkBadgeFor') + '\n' +
  extractFn('fnkTodoText') + '\n' +
  extractFn('fnkContactBadge') + '\n' +
  extractFn('fnkExtraBadges') + '\n' +
  extractFn('escapeHtml') + '\n' +
  'function fubiHistoryBadge(){return "";}\n' +
  extractFn('fnkCardHtml') + '\n' +
  'sb.fnkCardHtml = fnkCardHtml;'
)(scopeCard);
const fnkCardHtml = scopeCard.fnkCardHtml;

console.log('\n[fnkCardHtml 統合]');
const cardA = fnkCardHtml({ id: 1, month: '2026-06', name: 'ﾑﾗﾀ', amount: 5840, resultCode: '1', occurrence: 2, prevAmount: 5863 });
ok(cardA.indexOf('2回目') >= 0, 'occurrence2→カードに「2回目」バッジ描画');
ok(cardA.indexOf('5,863') >= 0, 'prevAmount→累積額を描画');
ok(cardA.indexOf('fnkContactStart(1)') >= 0, 'カードに連絡済みボタン描画');
ok(cardA.indexOf('翌月2ヶ月分') >= 0, 'code1→やること文面(残高不足)を描画');
const cardB = fnkCardHtml({ id: 2, month: '2026-06', name: 'ｲｼｶﾜ', amount: 2910, resultCode: '4', nextMonthAbsent: true, contactedBy: '下浦', contactedAt: '2026-07-10', contactMethod: '電話' });
ok(cardB.indexOf('⚠️翌月請求なし・要確認') >= 0, 'nextMonthAbsent→「⚠️要確認」バッジ描画');
ok(cardB.indexOf('✓連絡済 7/10 下浦') >= 0, 'contactedBy→連絡済バッジ描画');
ok(cardB.indexOf('電話で状況を確認する') >= 0, 'code4(その他)→やること文面を描画');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
