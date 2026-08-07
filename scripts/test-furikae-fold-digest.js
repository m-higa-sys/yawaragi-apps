// test-furikae-fold-digest.js
// morningDigest 振替不能の月別集計 foldFurikaeByMonth_ の純関数テスト（正本）。
// gas/yawaragi-board/コード.js の foldFurikaeByMonth_ と「同一実装（二重持ち）」であること。
// ※GAS側を直したら必ずここも同じに直す（両者が完全一致）。
// 実行: node scripts/test-furikae-fold-digest.js
//
// 背景（2026-07-23）: 朝の報告が「振替不能 未解決8件」と出したが、実際に動くべき案件は3件だった。
// 原因＝アプリ本体 furikae.html の fnkIsUnpaid は「回収済」と「繰越」の両方を解決済みとして
// 除外する（furikae.html:956）のに、集約API側は「回収済」しか除外していなかった。
// 「繰越」＝前月分が当月カードへ集約されて閉じられた状態（furikae.html:1033-1039）なので、
// 未解決に数えると同じ債権を二重計上する。判定をアプリ本体に揃える。

// ===== 純関数（gas/yawaragi-board/コード.js と同一実装・二重持ち）=====
// 振替不能 records を月別集計。未解決=「回収済」「繰越」以外の合計。byMonth からもそれらは落とす。
// 「繰越」はアプリ本体（furikae.html fnkIsUnpaid）で解決済み扱い＝当月カードへ集約されて閉じた状態。
var FURIKAE_CLOSED_STATUSES = ['回収済', '繰越'];
function foldFurikaeByMonth_(records) {
  var byMonth = {};
  (records || []).forEach(function (r) {
    var m = r.month; if (!m) return;
    var st = r.status; if (!st || FURIKAE_CLOSED_STATUSES.indexOf(st) !== -1) return;
    byMonth[m] = byMonth[m] || {};
    byMonth[m][st] = (byMonth[m][st] || 0) + 1;
  });
  var unresolvedTotal = 0;
  Object.keys(byMonth).forEach(function (m) {
    Object.keys(byMonth[m]).forEach(function (st) { unresolvedTotal += byMonth[m][st]; });
  });
  return { byMonth: byMonth, unresolvedTotal: unresolvedTotal };
}

// ===== テストハーネス =====
var pass = 0, fail = 0;
function eq(actual, expected, label) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n    expected: ' + e + '\n    actual  : ' + a); }
}

console.log('foldFurikaeByMonth_');

// 1) 繰越は未解決に数えない（本件の回帰テスト）
eq(foldFurikaeByMonth_([{ month: '2026-05', status: '繰越' }]),
  { byMonth: {}, unresolvedTotal: 0 }, '繰越のみ → 0件・byMonthに残さない');

// 2) 回収済も従来どおり除外
eq(foldFurikaeByMonth_([{ month: '2026-04', status: '回収済' }]),
  { byMonth: {}, unresolvedTotal: 0 }, '回収済のみ → 0件');

// 3) 実データ再現（2026-07-23 時点の本番14件のうち未回収8件相当）。
//    繰越5件（2〜5月）は閉じており、動くべきは6月の3件だけ。
var real = [
  { month: '2026-02', status: '繰越' },
  { month: '2026-03', status: '繰越' },
  { month: '2026-04', status: '繰越' },
  { month: '2026-04', status: '繰越' },
  { month: '2026-05', status: '繰越' },
  { month: '2026-06', status: '手続中' },
  { month: '2026-06', status: '未対応' },
  { month: '2026-06', status: '手続中' }
];
eq(foldFurikaeByMonth_(real),
  { byMonth: { '2026-06': { '手続中': 2, '未対応': 1 } }, unresolvedTotal: 3 },
  '実データ: 繰越5件は落ち、6月の手続中2・未対応1＝計3件だけ残る');

// 4) 未対応・手続中・連絡済・再提出済は未解決として数える
eq(foldFurikaeByMonth_([
  { month: '2026-06', status: '未対応' },
  { month: '2026-06', status: '連絡済' },
  { month: '2026-06', status: '手続中' },
  { month: '2026-06', status: '再提出済' }
]), { byMonth: { '2026-06': { '未対応': 1, '連絡済': 1, '手続中': 1, '再提出済': 1 } }, unresolvedTotal: 4 },
  '未解決4ステータスはすべて数える');

// 5) month 欠落・status 空は無視（既存挙動の維持）
eq(foldFurikaeByMonth_([
  { status: '未対応' },
  { month: '2026-06', status: '' },
  { month: '2026-06' },
  { month: '2026-06', status: '未対応' }
]), { byMonth: { '2026-06': { '未対応': 1 } }, unresolvedTotal: 1 },
  'month欠落・status空は無視');

// 6) 空・null 入力
eq(foldFurikaeByMonth_([]), { byMonth: {}, unresolvedTotal: 0 }, '空配列');
eq(foldFurikaeByMonth_(null), { byMonth: {}, unresolvedTotal: 0 }, 'null');

// 7) 複数月に未解決が散る場合は月ごとに分かれる
eq(foldFurikaeByMonth_([
  { month: '2026-05', status: '未対応' },
  { month: '2026-06', status: '未対応' },
  { month: '2026-06', status: '繰越' }
]), { byMonth: { '2026-05': { '未対応': 1 }, '2026-06': { '未対応': 1 } }, unresolvedTotal: 2 },
  '複数月に未解決が散る（繰越は混ぜない）');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
