// 口腔体操（口腔①実施記録）当月回数の純関数テスト（node単体・GAS非依存）。
// 実行: node scripts/test-oral-taisou-core.js
// 対象: session-board-core.js の countOralTaisou_ / requiredOralTaisou_ / remainingOralTaisou_
// 土台: oral-record.html 実ロジック（checks[年度][氏名]["{月}月_{回目}"]=日付 / isOralTwiceMonthly 区変ゲート / 年度=month>=4?year:year-1）
const assert = require('assert');
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));

let pass = 0, fail = 0, cases = [];
function t(name, fn) {
  try { fn(); pass++; cases.push('  ok ' + name); }
  catch (e) { fail++; cases.push('  NG ' + name + '\n      ' + (e && e.message || e)); }
}
function eq(a, b, m) { assert.strictEqual(a, b, m); }
const N = core.sbNormalizeName_;

// checks[年度][氏名]["{月}月_{回目}"] = "M/D"
var checks = {
  '2026': {
    '山田太郎': { '7月_1回目': '7/3' },                     // 1回
    '佐藤花子': { '7月_1回目': '7/2', '7月_2回目': '7/20' },  // 2回
    '鈴木一郎': { '7月_1回目': '7/5' },                     // 1回
    '田中　次郎': { '7月_1回目': '7/1' },                    // 氏名に全角空白（NFKC照合テスト）
    '冬田': { '2月_1回目': '2/5' }                          // 年度またぎ（2月=前年度扱い）
  }
};

// ---- countOralTaisou_(oralChecks, normName, year, month) ----
  t('countOralTaisou_ 要介護1回 → 1', function () {
    eq(core.countOralTaisou_(checks, N('山田太郎'), 2026, 7), 1);
  });
  t('countOralTaisou_ 2回実施 → 2', function () {
    eq(core.countOralTaisou_(checks, N('佐藤花子'), 2026, 7), 2);
  });
  t('countOralTaisou_ 氏名NFKC照合（全角空白ずれを吸収）', function () {
    eq(core.countOralTaisou_(checks, N('田中次郎'), 2026, 7), 1);
  });
  t('countOralTaisou_ 該当者なし → 0', function () {
    eq(core.countOralTaisou_(checks, N('存在しない'), 2026, 7), 0);
  });
  t('countOralTaisou_ 該当年度データ無し → 0（未実施扱い）', function () {
    eq(core.countOralTaisou_({}, N('山田太郎'), 2026, 7), 0);
  });
  t('countOralTaisou_ 別月は数えない', function () {
    eq(core.countOralTaisou_(checks, N('山田太郎'), 2026, 8), 0);
  });
  t('countOralTaisou_ 年度またぎ（2027年2月→年度2026を参照）', function () {
    eq(core.countOralTaisou_(checks, N('冬田'), 2027, 2), 1);
  });
  t('countOralTaisou_ oralChecks が null でも 0', function () {
    eq(core.countOralTaisou_(null, N('山田太郎'), 2026, 7), 0);
  });

// ---- requiredOralTaisou_(careLevel, kubunChangeDate, targetMonth) ----
  t('requiredOralTaisou_ 要介護 → 2', function () {
    eq(core.requiredOralTaisou_('要介護1', '', '2026-07'), 2);
  });
  t('requiredOralTaisou_ 要支援 → 1', function () {
    eq(core.requiredOralTaisou_('要支援2', '', '2026-07'), 1);
  });
  t('requiredOralTaisou_ 事業対象 → 1', function () {
    eq(core.requiredOralTaisou_('事業対象者', '', '2026-07'), 1);
  });
  t('requiredOralTaisou_ 要支援・区変前は2回目を数えない → 1', function () {
    eq(core.requiredOralTaisou_('要支援1', '2026-08-15', '2026-07'), 1);
  });
  t('requiredOralTaisou_ 要支援・区変月以降は2 → 2', function () {
    eq(core.requiredOralTaisou_('要支援1', '2026-08-15', '2026-08'), 2);
  });
  t('requiredOralTaisou_ 要支援・区変翌月も2', function () {
    eq(core.requiredOralTaisou_('要支援1', '2026-08-15', '2026-09'), 2);
  });
  t('requiredOralTaisou_ 要介護は区変日があっても常に2', function () {
    eq(core.requiredOralTaisou_('要介護2', '2026-08-15', '2026-07'), 2);
  });

// ---- remainingOralTaisou_(required, done) ----
  t('remainingOralTaisou_ 要介護0回 → 残2', function () { eq(core.remainingOralTaisou_(2, 0), 2); });
  t('remainingOralTaisou_ 要介護1回 → 残1', function () { eq(core.remainingOralTaisou_(2, 1), 1); });
  t('remainingOralTaisou_ 要介護2回 → 残0（済）', function () { eq(core.remainingOralTaisou_(2, 2), 0); });
  t('remainingOralTaisou_ 要支援0回 → 残1', function () { eq(core.remainingOralTaisou_(1, 0), 1); });
  t('remainingOralTaisou_ 要支援1回 → 残0（済）', function () { eq(core.remainingOralTaisou_(1, 1), 0); });
  t('remainingOralTaisou_ 超過でも下限0', function () { eq(core.remainingOralTaisou_(2, 3), 0); });

console.log(cases.join('\n'));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
