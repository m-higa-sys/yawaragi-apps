// test-chushi-digest.js
// morningDigest「中止・未完」判定の純関数テスト（正本）。
// gas/yawaragi-board/コード.js の chushiApplicableKeys_ / chushiMissing_ /
// chushiBaseDate_ / chushiDecision_ と「同一実装（二重持ち）」であること。
// ※GAS側を直したら必ずここも同じに直す（両者が完全一致）。
// 実行: node scripts/test-chushi-digest.js

// ===== 純関数（gas/yawaragi-board/コード.js と同一実装・二重持ち）=====
function chushiApplicableKeys_(careLevel) {
  // 要支援・事業対象者は個訓非対象（要介護のみ個訓・ADL対象）。'事業対象' で両台帳表記に一致
  var isShien = String(careLevel || '').indexOf('要支援') !== -1 || String(careLevel || '').indexOf('事業対象') !== -1;
  return isShien
    ? ['tsusho', 'koukou', 'rihab_chushi', 'kagakuteki']
    : ['tsusho', 'kotraining', 'koukou', 'rihab_chushi', 'kagakuteki', 'adl'];
}
var CHUSHI_LABELS = {
  tsusho: '通所計画書',
  kotraining: '個別機能訓練計画書',
  koukou: '口腔機能向上計画書',
  rihab_chushi: '利用中止操作',
  kagakuteki: '科学的介護推進体制',
  adl: 'ADL維持等加算'
};
function chushiMissing_(careLevel, tasks) {
  var keys = chushiApplicableKeys_(careLevel);
  var t = tasks || {};
  var out = [];
  for (var i = 0; i < keys.length; i++) {
    if (!t[keys[i]]) out.push(CHUSHI_LABELS[keys[i]]);
  }
  return out;
}
function chushiBaseDate_(contactDate) {
  var m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(contactDate || ''));
  if (!m) return '';
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
  mo += 1; if (mo > 12) { mo = 1; y += 1; }
  return y + '-' + (mo < 10 ? '0' + mo : '' + mo) + '-10';
}
function chushiDecision_(records, dateStr) {
  var today = String(dateStr).slice(0, 10);
  var pending = [], overdue = [];
  (records || []).forEach(function (r) {
    var missing = chushiMissing_(r.careLevel, r.tasks);
    if (missing.length === 0) return; // 全該当項目チェック済み → 消える
    var care = String(r.careLevel || '').indexOf('要支援') !== -1 ? '要支援' : '要介護';
    var base = chushiBaseDate_(r.contactDate);
    var isOver = base !== '' && today > base;
    var mm = /^\d{4}-(\d{2})-\d{2}$/.exec(String(r.terminateDate || ''));
    var cancelMonth = mm ? parseInt(mm[1], 10) : 0;
    var item = {
      name: r.name, care: care, missing: missing,
      cancelMonth: cancelMonth, terminateDate: String(r.terminateDate || '')
    };
    if (isOver) overdue.push(item); else pending.push(item);
  });
  overdue.sort(function (a, b) {
    return a.terminateDate < b.terminateDate ? -1 : a.terminateDate > b.terminateDate ? 1 : 0;
  });
  return { pending: pending, overdue: overdue, pendingCount: pending.length, overdueCount: overdue.length };
}
// ===== ここまで二重持ち =====

// ---- 軽量テストハーネス ----
var passed = 0, failed = 0;
function eq(actual, expected, msg) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.log('  ✗ ' + msg + '\n      expected: ' + e + '\n      actual:   ' + a); }
}
function ok(cond, msg) {
  if (cond) { passed++; } else { failed++; console.log('  ✗ ' + msg); }
}

// 全タスク未チェック（=何が「該当」かを applicable キーで見る）
var allFalse = { tsusho: false, kotraining: false, koukou: false, kagakuteki: false, adl: false, rihab_chushi: false };

// 1) chushiApplicableKeys_：区分ごとの該当キー
eq(chushiApplicableKeys_('要介護2'),
   ['tsusho', 'kotraining', 'koukou', 'rihab_chushi', 'kagakuteki', 'adl'],
   '要介護は個訓・ADLを含む6キー');
eq(chushiApplicableKeys_('要支援1'),
   ['tsusho', 'koukou', 'rihab_chushi', 'kagakuteki'],
   '要支援は個訓・ADLを除く4キー');
eq(chushiApplicableKeys_('事業対象者'),
   ['tsusho', 'koukou', 'rihab_chushi', 'kagakuteki'],
   '★事業対象者は個訓・ADLを除く4キー（新規対応）');
eq(chushiApplicableKeys_('事業対象'),
   ['tsusho', 'koukou', 'rihab_chushi', 'kagakuteki'],
   '★事業対象（別表記）も個訓・ADLを除く4キー');
eq(chushiApplicableKeys_(''),
   ['tsusho', 'kotraining', 'koukou', 'rihab_chushi', 'kagakuteki', 'adl'],
   '空/不明は保守的に要介護扱い（6キー）');

// 2) chushiMissing_：事業対象者の個訓・ADLは未完キーに入らない
var missJigyo = chushiMissing_('事業対象者', allFalse);
ok(missJigyo.indexOf('個別機能訓練計画書') === -1, '★事業対象者：個訓が未完リストに入らない');
ok(missJigyo.indexOf('ADL維持等加算') === -1, '★事業対象者：ADLが未完リストに入らない');
eq(missJigyo, ['通所計画書', '口腔機能向上計画書', '利用中止操作', '科学的介護推進体制'],
   '★事業対象者：未完は通所・口腔・利用中止操作・科学的の4つのみ');

// 要介護は個訓・ADLも未完に入る（退行なし）
var missKaigo = chushiMissing_('要介護2', allFalse);
ok(missKaigo.indexOf('個別機能訓練計画書') !== -1, '要介護：個訓は未完リストに入る（退行なし）');
ok(missKaigo.indexOf('ADL維持等加算') !== -1, '要介護：ADLは未完リストに入る（退行なし）');

// 3) 事業対象者：該当4項目が全部済みなら未完ゼロ（＝中止未完に出ない）
var jigyoDone = { tsusho: true, koukou: true, rihab_chushi: true, kagakuteki: true, kotraining: false, adl: false };
eq(chushiMissing_('事業対象者', jigyoDone), [],
   '★事業対象者：該当4項目済みなら未完ゼロ（個訓・ADL未でも出っぱなしにならない）');

// 4) chushiDecision_：事業対象者は該当項目完了なら pending/overdue どちらにも出ない
var dec = chushiDecision_([
  { name: '事業対象者A', careLevel: '事業対象者', contactDate: '2026-06-15', terminateDate: '2026-06-15',
    tasks: jigyoDone },
  { name: '要介護B（個訓未）', careLevel: '要介護2', contactDate: '2026-07-05', terminateDate: '2026-07-07',
    tasks: jigyoDone }
], '2026-07-11');
ok(dec.pending.concat(dec.overdue).every(function (x) { return x.name !== '事業対象者A'; }),
   '★事業対象者A（該当済み）は中止未完に出ない');
ok(dec.pending.concat(dec.overdue).some(function (x) { return x.name === '要介護B（個訓未）'; }),
   '要介護B（個訓未）は中止未完に出る（退行なし）');

// 5) chushiBaseDate_：連絡日の翌月10日
eq(chushiBaseDate_('2026-06-15'), '2026-07-10', 'chushiBaseDate_：翌月10日（年内）');
eq(chushiBaseDate_('2026-12-20'), '2027-01-10', 'chushiBaseDate_：翌月10日（年跨ぎ）');

// ---- 結果 ----
console.log('\n' + (failed === 0 ? '✅ ALL PASSED' : '❌ FAILED') + ': ' + passed + ' passed, ' + failed + ' failed');
if (typeof module !== 'undefined') {
  module.exports = { chushiApplicableKeys_: chushiApplicableKeys_, chushiMissing_: chushiMissing_, chushiBaseDate_: chushiBaseDate_, chushiDecision_: chushiDecision_ };
}
if (failed > 0) process.exit(1);
