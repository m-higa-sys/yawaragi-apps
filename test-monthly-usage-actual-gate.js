// 月次利用状況モーダル：緑(来館)を「実績日」限定にする実績ゲートのテスト。
// 事案: 2026-07-16 利用者021（契約曜日=金・月）で未来日 17・24 が緑=来館になっていた。
// 出勤送迎表(dailyOps)は先の日まで「予定」で埋まるため、users に居るだけで attended=true に
// していたのが原因。緑は「date < today(JST) の実績(non-absent)」限定にする。
//
// 実データ由来のフィクスチャ（2026-07-16 に getOps を実取得して確認した値）:
//   利用者021 pm.users 在籍日 = 07-03, 06, 10, 13, 17, 24（status="" ＝ non-absent）
//   今日 07-16 は am/pm どちらにも不在
//   day.confirmed は過去の実実績日(03/06/10/13)でも false ＝ 実績フラグとして使えない
//   → ゲートは date < today を採用

const assert = require('assert');
const core = require('./gas/yawaragi-board/monthly-usage-core.js');

const TODAY = '2026-07-16';
const NAME = '利用者021';

// 実データの構造を再現した dailyOps フィクスチャ
function mkDay(date, pmUsers, pmStatus) {
  return {
    date: date,
    confirmed: false, // 実データ通り: 過去実績日でも false
    am: { users: ['利用者022'], userStatus: {} },
    pm: { users: pmUsers || [], userStatus: pmStatus || {} }
  };
}
const OPS = {
  '2026-07-03': mkDay('2026-07-03', [NAME, '他A'], {}),
  '2026-07-06': mkDay('2026-07-06', [NAME, '他A'], {}),
  '2026-07-10': mkDay('2026-07-10', [NAME, '他A'], {}),
  '2026-07-13': mkDay('2026-07-13', [NAME, '他A'], {}),
  '2026-07-16': mkDay('2026-07-16', ['他A'], {}), // 今日: 京子は不在
  '2026-07-17': mkDay('2026-07-17', [NAME, '他A'], {}), // 未来(予定)
  '2026-07-24': mkDay('2026-07-24', [NAME, '他A'], {})  // 未来(予定)
};

let pass = 0, fail = 0;
function t(label, fn) {
  try { fn(); pass++; console.log('  PASS  ' + label); }
  catch (e) { fail++; console.log('  FAIL  ' + label + '\n        ' + e.message); }
}

console.log('=== muIsActualVisitDate_ : 実績ゲート単体 ===');
// 社長指定 failing test #1: 未来は緑にしない
t('未来 07-17 は実績日でない（緑にしない）', () => {
  assert.strictEqual(core.muIsActualVisitDate_('2026-07-17', TODAY), false);
});
t('未来 07-24 は実績日でない（緑にしない）', () => {
  assert.strictEqual(core.muIsActualVisitDate_('2026-07-24', TODAY), false);
});
// 社長指定 failing test #3: 今日は灰
t('今日 07-16 は実績日でない（灰のまま）', () => {
  assert.strictEqual(core.muIsActualVisitDate_('2026-07-16', TODAY), false);
});
// 社長指定 failing test #2: 過去実績は緑維持
['2026-07-03', '2026-07-06', '2026-07-10', '2026-07-13'].forEach(d => {
  t('過去実績 ' + d + ' は実績日（緑を維持）', () => {
    assert.strictEqual(core.muIsActualVisitDate_(d, TODAY), true);
  });
});
t('空入力は実績日でない（fail-closed）', () => {
  assert.strictEqual(core.muIsActualVisitDate_('', TODAY), false);
  assert.strictEqual(core.muIsActualVisitDate_('2026-07-03', ''), false);
});

console.log('=== muShouldMarkAttended_ : 実績(non-absent) × 過去日 ===');
t('送迎表に記録なし(attended=false)なら過去日でも緑にしない', () => {
  assert.strictEqual(core.muShouldMarkAttended_(false, '2026-07-03', TODAY), false);
});
t('実績あり×過去日 → 緑', () => {
  assert.strictEqual(core.muShouldMarkAttended_(true, '2026-07-03', TODAY), true);
});
t('実績あり×未来日 → 緑にしない', () => {
  assert.strictEqual(core.muShouldMarkAttended_(true, '2026-07-24', TODAY), false);
});

console.log('=== 実データ相当フィクスチャで合格判定を再現 ===');
// getMonthlyUsage の dailyOps ループと同じ判定経路（extractFn は既存 _muExtractUserDayState 相当）
function extractFn(dayOps, name) {
  const state = { attended: false, noPickup: false };
  if (!dayOps) return state;
  ['am', 'pm'].forEach(u => {
    const unit = dayOps[u];
    if (!unit || !Array.isArray(unit.users) || unit.users.indexOf(name) < 0) return;
    const st = (unit.userStatus && unit.userStatus[name]) || '';
    if (st === 'absent' || st === 'longabsent') return;
    state.attended = true;
    if (st === 'family' || st === 'walk') state.noPickup = true;
  });
  return state;
}

// 契約曜日 金・月 の予定日（_muScheduledDatesInMonth 相当・2026-07）
const SCHEDULED = ['2026-07-03', '2026-07-06', '2026-07-10', '2026-07-13',
                   '2026-07-17', '2026-07-20', '2026-07-24', '2026-07-27', '2026-07-31'];

function buildDays() {
  const dayMap = {};
  SCHEDULED.forEach(d => { dayMap[d] = { date: d, attended: false, absent: false, noPickup: false, reason: '' }; });
  const c = core.muMergeDailyOpsIntoDayMap_(dayMap, OPS, NAME, TODAY, extractFn);
  const days = Object.keys(dayMap).sort().map(k => dayMap[k]);
  return { days: days, counters: c };
}

t('緑になるのは過去実績 3・6・10・13 の4日だけ（17・24は灰）', () => {
  const { days } = buildDays();
  const green = days.filter(d => d.attended).map(d => d.date);
  assert.deepStrictEqual(green, ['2026-07-03', '2026-07-06', '2026-07-10', '2026-07-13']);
});
t('未来 17・24 は attended=false（=scheduled 灰 #edf2f7 で描画される）', () => {
  const { days } = buildDays();
  const byDate = {}; days.forEach(d => byDate[d.date] = d);
  assert.strictEqual(byDate['2026-07-17'].attended, false);
  assert.strictEqual(byDate['2026-07-24'].attended, false);
  assert.strictEqual(byDate['2026-07-17'].absent, false); // 欠席にはしない
  assert.strictEqual(byDate['2026-07-24'].absent, false);
});
t('【不変】利用回数 6回（サマリーは予定込みのまま）', () => {
  const { counters } = buildDays();
  assert.strictEqual(counters.attended, 6);
});
t('【不変】利用率 67%（6/9）', () => {
  const { counters } = buildDays();
  assert.strictEqual(Math.round(counters.attended / SCHEDULED.length * 100), 67);
});
t('【不変】直近来館 7/13（muCalcLastVisit 相当: attended かつ date<=today の最大）', () => {
  const { days } = buildDays();
  const visited = days.filter(d => d.attended && d.date <= TODAY).map(d => d.date).sort();
  assert.strictEqual(visited[visited.length - 1], '2026-07-13');
});
t('【不変】送迎なし 0回', () => {
  const { counters } = buildDays();
  assert.strictEqual(counters.noPickup, 0);
});
t('欠席登録済みの日は従来通りスキップ（緑にしない・上書きしない）', () => {
  const dayMap = {};
  SCHEDULED.forEach(d => { dayMap[d] = { date: d, attended: false, absent: false, noPickup: false, reason: '' }; });
  dayMap['2026-07-03'].absent = true;
  dayMap['2026-07-03'].reason = '体調不良';
  core.muMergeDailyOpsIntoDayMap_(dayMap, OPS, NAME, TODAY, extractFn);
  assert.strictEqual(dayMap['2026-07-03'].attended, false);
  assert.strictEqual(dayMap['2026-07-03'].absent, true);
  assert.strictEqual(dayMap['2026-07-03'].reason, '体調不良');
});
t('予定外の過去日に来館（イレギュラー）は従来通り days に追加され緑', () => {
  const dayMap = {};
  SCHEDULED.forEach(d => { dayMap[d] = { date: d, attended: false, absent: false, noPickup: false, reason: '' }; });
  const ops = { '2026-07-08': mkDay('2026-07-08', [NAME], {}) }; // 水曜=契約外の過去日
  core.muMergeDailyOpsIntoDayMap_(dayMap, ops, NAME, TODAY, extractFn);
  assert.ok(dayMap['2026-07-08']);
  assert.strictEqual(dayMap['2026-07-08'].attended, true);
});
t('予定外の未来日に来館予定が入っていても緑にしない', () => {
  const dayMap = {};
  SCHEDULED.forEach(d => { dayMap[d] = { date: d, attended: false, absent: false, noPickup: false, reason: '' }; });
  const ops = { '2026-07-22': mkDay('2026-07-22', [NAME], {}) }; // 水曜=契約外の未来日
  core.muMergeDailyOpsIntoDayMap_(dayMap, ops, NAME, TODAY, extractFn);
  assert.strictEqual(dayMap['2026-07-22'].attended, false);
});

console.log('\n=== ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
