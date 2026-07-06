// 振替不能トラッカー 純関数テスト（実コード抽出方式）
// 対象: fnkExtractResultCode / fnkBadgeFor / fnkIsUnpaid / fnkMonthSummary / fnkGoushanCandidates
// 実行: node scripts/test-furikae-tracker.js

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

// 純関数群をまとめて評価
const sb = {};
new Function('sb',
  extractFn('fnkExtractResultCode') + '\n' +
  extractFn('fnkBadgeFor') + '\n' +
  extractFn('fnkIsUnpaid') + '\n' +
  extractFn('fnkMonthSummary') + '\n' +
  extractFn('fnkGoushanCandidates') + '\n' +
  extractFn('fnkActionableCount') + '\n' +
  extractFn('fnkIsImportMarker') + '\n' +
  extractFn('fnkNeedsImportMarker') + '\n' +
  extractFn('fnkMarkerRecord') + '\n' +
  extractFn('fnkMonthsOf') + '\n' +
  extractFn('fnkNoticeBody') + '\n' +
  'sb.extract = fnkExtractResultCode; sb.badge = fnkBadgeFor; sb.unpaid = fnkIsUnpaid;' +
  'sb.summary = fnkMonthSummary; sb.cand = fnkGoushanCandidates; sb.act = fnkActionableCount;' +
  'sb.isMarker = fnkIsImportMarker; sb.needsMarker = fnkNeedsImportMarker; sb.markerRec = fnkMarkerRecord;' +
  'sb.monthsOf = fnkMonthsOf; sb.noticeBody = fnkNoticeBody;'
)(sb);

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }

// ===== A. 結果コード抽出（split('-')[0] 修正・2桁で切れない）=====
ok(sb.extract('0-振替済み') === '0', 'A1: "0-振替済み" → 0');
ok(sb.extract('2-取引なし') === '2', 'A2: "2-取引なし" → 2');
ok(sb.extract('4-口座振替依頼書なし') === '4', 'A3: "4-口座振替依頼書なし" → 4');
ok(sb.extract('2') === '2', 'A4: 素の"2" → 2');
ok(sb.extract('10-なにか') === '10', 'A5: "10-..." → 10（旧match(/\\d/)[0]なら"1"に化ける・修正の証明）');
ok(sb.extract('') === '', 'A6: 空 → 空');
ok(sb.extract(null) === '', 'A7: null → 空（fail-safe）');

// ===== B. 3色バッジ分類（コード優先・不明は🔴要確認で必ず表面化）=====
ok(sb.badge({ resultCode: '1' }).key === 'white' && sb.badge({ resultCode: '1' }).label === '翌月合算予定',
  'B1: コード1残高不足 → ⚪翌月合算予定');
ok(sb.badge({ resultCode: '4' }).key === 'orange' && sb.badge({ resultCode: '4' }).label === '要依頼書再送',
  'B2: コード4依頼書なし → 🟠要依頼書再送');
['2', '3', '8', '9'].forEach(function (c) {
  ok(sb.badge({ resultCode: c }).key === 'red', 'B3: コード' + c + ' → 🔴要電話確認/要確認');
});
ok(sb.badge({ resultCode: 'x' }).key === 'red' && sb.badge({ resultCode: 'x' }).label === '要確認',
  'B4: 未知コード → 🔴要確認（安全側で表面化）');

// reason テキストからの推定（既存データ＝コード無し）
ok(sb.badge({ reason: '預金取引なし' }).key === 'red', 'B5: 「預金取引なし」→ 🔴');
ok(sb.badge({ reason: '預金口座振替依頼書なし' }).key === 'orange', 'B6: 「…依頼書なし」→ 🟠');
ok(sb.badge({ reason: '残高不足' }).key === 'white', 'B7: 「残高不足」→ ⚪');
ok(sb.badge({ reason: '振替停止（預金者都合）' }).key === 'red', 'B8: 「振替停止」→ 🔴');
ok(sb.badge({ reason: '' }).key === 'red' && sb.badge({ reason: '' }).label === '要確認',
  'B9: 理由空 → 🔴要確認');
// 実データ20260527の3件
ok(sb.badge({ reason: '預金取引なし', resultCode: '2' }).mark === '🔴', 'B10: 井草[2] → 🔴');
ok(sb.badge({ reason: '預金口座振替依頼書なし', resultCode: '4' }).mark === '🟠', 'B11: 石川[4]/町田[4] → 🟠');

// ===== C. 未回収判定（回収済/resolvedMonthで消える・日付では消えない）=====
ok(sb.unpaid({ status: '未対応' }) === true, 'C1: 未対応 → 未回収true');
ok(sb.unpaid({ status: '手続中' }) === true, 'C2: 手続中 → 未回収true');
ok(sb.unpaid({ status: '回収済' }) === false, 'C3: 回収済 → false');
ok(sb.unpaid({ status: '未対応', resolvedMonth: '2026-06' }) === false, 'C4: resolvedMonth有 → false');
ok(sb.unpaid({ status: '未対応', hikiotoshiDate: '2026-05-27' }) === true, 'C5: 日付があっても未回収は消えない');

// ===== D. 月別サマリー（未回収のみ・件数/合計）=====
const recs = [
  { month: '2026-05', amount: 9030, status: '未対応', reason: '預金取引なし', customerId: '151' },
  { month: '2026-05', amount: 6655, status: '未対応', reason: '預金口座振替依頼書なし', customerId: '160' },
  { month: '2026-05', amount: 4753, status: '未対応', reason: '預金口座振替依頼書なし', customerId: '162' },
  { month: '2026-05', amount: 1000, status: '回収済', reason: '残高不足', customerId: '170' },
  { month: '2026-04', amount: 500, status: '未対応', reason: '残高不足', customerId: '151' }
];
const sum = sb.summary(recs, '2026-05');
ok(sum.count === 3, 'D1: 5月の未回収 3件（回収済は除外）');
ok(sum.total === 20438, 'D2: 5月の未回収合計 ¥20,438');

// ===== E. 翌月合算の自動消込候補（過去の未回収×今月成功した顧客番号）=====
const okIds = ['151', '999']; // 今月Excelで成功した顧客番号
const cands = sb.cand(recs, '2026-05', okIds);
ok(cands.length === 1 && cands[0].customerId === '151' && cands[0].month === '2026-04',
  'E1: 4月未回収の顧客151が今月成功 → 候補1件');
ok(sb.cand(recs, '2026-05', []).length === 0, 'E2: 成功者ゼロ → 候補ゼロ');
// 回収済は候補にしない（既に消えている）
const recs2 = [{ month: '2026-04', amount: 500, status: '回収済', customerId: '151' }];
ok(sb.cand(recs2, '2026-05', ['151']).length === 0, 'E3: 既に回収済は候補にしない');

// ===== F. 要対応件数（伝達ボード通知用・🔴🟠のみ・⚪翌月合算は放置可で数えない）=====
const recsF = [
  { month: '2026-05', amount: 9030, status: '未対応', reason: '預金取引なし' },           // 🔴
  { month: '2026-05', amount: 6655, status: '未対応', reason: '預金口座振替依頼書なし' }, // 🟠
  { month: '2026-05', amount: 4753, status: '未対応', reason: '預金口座振替依頼書なし' }, // 🟠
  { month: '2026-05', amount: 1000, status: '未対応', reason: '残高不足' },               // ⚪放置可
  { month: '2026-05', amount: 500, status: '回収済', reason: '預金取引なし' }             // 回収済
];
ok(sb.act(recsF, '2026-05') === 3, 'F1: 要対応=🔴🟠の3件（⚪残高不足と回収済は数えない）');
ok(sb.act([{ month: '2026-05', amount: 1, status: '未対応', reason: '残高不足' }], '2026-05') === 0,
  'F2: ⚪翌月合算予定だけ → 要対応0（放置可）');
ok(sb.act([], '2026-05') === 0, 'F3: 空 → 0');

// ===== M. 取込済マーカー 純関数（案B・センチネル）=====
ok(sb.isMarker({ isImportMarker: true }) === true, 'M1: isImportMarker:true → マーカー');
ok(sb.isMarker({ status: '回収済' }) === false, 'M2: フラグ無し → 非マーカー（status依存にしない）');
ok(sb.isMarker(null) === false, 'M3: null → 非マーカー（fail-safe）');
ok(sb.needsMarker([], '2026-06') === true, 'M4: 該当月レコード皆無 → マーカー要');
ok(sb.needsMarker([{ month: '2026-06', status: '未対応' }], '2026-06') === false, 'M5: 該当月に実レコード有 → マーカー不要');
ok(sb.needsMarker([{ month: '2026-05' }], '2026-06') === true, 'M6: 別月レコードのみ → 対象月2026-06はマーカー要');
ok(sb.needsMarker([{ month: '2026-06', isImportMarker: true }], '2026-06') === false, 'M7: 既にマーカー有 → 二重に作らない（冪等）');
const mk = sb.markerRec('2026-06', 42, '2026-07-06');
ok(mk.isImportMarker === true, 'M8: 生成物は isImportMarker:true');
ok(mk.status === '回収済', 'M9: status=回収済（fold/unpaid が既存ロジックで落とす二重安全）');
ok(mk.month === '2026-06' && mk.id === 42 && mk.createdAt === '2026-07-06', 'M10: month/id/createdAt が引数どおり');
ok(mk.amount === 0 && mk.customerId === '' && !mk.resolvedMonth, 'M11: 金額0・顧客番号空・resolvedMonth無し（回収済フッタにも出ない）');

// ===== N. マーカー隠蔽 5経路（トラッカー側4経路・社長指示の番人）=====
const MK = sb.markerRec('2026-06', 99, '2026-07-06'); // 2026-06はマーカーだけの月
const REC_WITH_MARKER = [
  { id: 1, month: '2026-05', status: '未対応', resultCode: '2', amount: 1000, customerId: '10' }, // 別月の実不能
  MK
];
// 経路1 表示: getMonths相当(fnkMonthsOf)にマーカー月が出ない（幽霊タブ防止）
ok(sb.monthsOf(REC_WITH_MARKER).indexOf('2026-06') === -1, 'N1(表示): マーカーのみの月2026-06はタブに出ない');
ok(sb.monthsOf(REC_WITH_MARKER).indexOf('2026-05') >= 0, 'N1b(表示): 実レコードの月2026-05は出る');
// 経路2 件数集計: fnkMonthSummary がマーカーを数えない
ok(sb.summary(REC_WITH_MARKER, '2026-06').count === 0 && sb.summary(REC_WITH_MARKER, '2026-06').total === 0,
  'N2(件数集計): マーカーのみの月 → count0/total0');
// 経路4 伝達ボード件数: actionable→noticeBody が締め（空文字）
ok(sb.noticeBody(sb.act(REC_WITH_MARKER, '2026-06')) === '', 'N4(伝達ボード件数): マーカーのみの月 → 通知本文は空（締め）');
// 経路5 actionable判定: fnkActionableCount がマーカーを数えない
ok(sb.act(REC_WITH_MARKER, '2026-06') === 0, 'N5(actionable): マーカーのみの月 → 0件');
// 経路3(fold)は板GAS側 Task 5 ＋ M11(resolvedMonth無しで回収済フッタに出ない)で別途カバー → ここは N3 欠番。

// N2b/N5b/N4b: status上は未回収(未対応)だが isImportMarker:true の敵対的マーカー。
// これは fnkIsUnpaid では落ちない＝ !fnkIsImportMarker ガードだけが除外要因になる（ガード外すと赤＝RED保証）。
const ADV_MARKER = { id: 2, month: '2026-06', isImportMarker: true, status: '未対応', resultCode: '2', amount: 500, customerId: '20' };
const REC_ADV = [
  { id: 1, month: '2026-05', status: '未対応', resultCode: '2', amount: 1000, customerId: '10' },
  ADV_MARKER
];
ok(sb.summary(REC_ADV, '2026-06').count === 0 && sb.summary(REC_ADV, '2026-06').total === 0,
  'N2b(件数集計・ピン留め): status未対応でも isImportMarker はガードで除外（ガード外すと赤）');
ok(sb.act(REC_ADV, '2026-06') === 0,
  'N5b(actionable・ピン留め): status未対応でも isImportMarker はガードで除外（ガード外すと赤）');
ok(sb.noticeBody(sb.act(REC_ADV, '2026-06')) === '',
  'N4b(伝達ボード件数・ピン留め): 敵対的マーカーのみの月 → 通知本文は空');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
