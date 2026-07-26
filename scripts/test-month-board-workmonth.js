// 月次ボード core: 個訓計画書(kunPlan)の「作業月＝前月付け」済判定テスト（純関数・require方式）
// 実行: node scripts/test-month-board-workmonth.js
// 背景（診断「個訓_サイクルずれと偽の未_診断」）:
//   計画書は「作業月＝前月」に作成し前月日付を keikaku_date に持つ運用（グリッド kobetsuCycleAt）。
//   旧 _mbFieldDone_ は当月日付のみ済にするため、前月付けの作成済みが「偽の未」になっていた。
// 仕様（クロ確定・案1）:
//   ・_mbFieldDoneWorkMonth_: keikaku_date が ym（当月）または ym-1（前月＝作業月）にあれば done。
//   ・kunPlan の done を _mbFieldDoneWorkMonth_ に差し替え。当月付け・空・blocked の挙動は不変。
//   ・kunEval(tasseido_date) は無改修（前月問題なし＝在月判定のまま）。
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'month-board-core.js'));
const buildMonthBoard = core.buildMonthBoard;
const wm = core._mbFieldDoneWorkMonth_;
const prevYm = core._mbPrevYm_;

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };
const eq = (name, got, want) => ok(name + '  (got=' + JSON.stringify(got) + ')', JSON.stringify(got) === JSON.stringify(want));

// ===== A) _mbPrevYm_ 純関数 =====
eq('A1 前月(月内)', prevYm('2026-07'), '2026-06');
eq('A2 年跨ぎ 1月→前年12月', prevYm('2026-01'), '2025-12');
eq('A3 不正入力→空', prevYm('bad'), '');
eq('A4 空→空', prevYm(''), '');

// ===== B) _mbFieldDoneWorkMonth_ 純関数 =====
ok('B1 前月付け(2026-06-25, ym=2026-07)→done', wm({ keikaku_date: '2026-06-25' }, 'keikaku_date', '2026-07').done === true);
ok('B2 当月付け(2026-07-01)→done', wm({ keikaku_date: '2026-07-01' }, 'keikaku_date', '2026-07').done === true);
ok('B3 前々月(2026-05-31)→未(前月でも当月でもない)', wm({ keikaku_date: '2026-05-31' }, 'keikaku_date', '2026-07').done === false);
ok('B4 翌月(2026-08-01)→未', wm({ keikaku_date: '2026-08-01' }, 'keikaku_date', '2026-07').done === false);
ok('B5 空→未', wm({ keikaku_date: '' }, 'keikaku_date', '2026-07').done === false);
ok('B6 rec無し→未', wm(null, 'keikaku_date', '2026-07').done === false);
eq('B7 doneDate は実日付を返す', wm({ keikaku_date: '2026-06-25' }, 'keikaku_date', '2026-07').doneDate, '2026-06-25');
ok('B8 年跨ぎ前月(2025-12-20, ym=2026-01)→done', wm({ keikaku_date: '2025-12-20' }, 'keikaku_date', '2026-01').done === true);

// ===== C) buildMonthBoard kunPlan シナリオ（実物ロード・deps注入）=====
const deps = {
  isPlanMonth: (planStart) => !!planStart,   // planStart 有り=当月を計画月扱い
  isHyoukaMonth: () => false,
  sbNormalizeName_: (s) => String(s == null ? '' : s).replace(/[\s　]+/g, '')
};
const U = (id, name) => ({ userId: id, name: name, category: '要介護1', planStart: '2026-01', planMonths: 3 });
function build(users, kunRecords) {
  return buildMonthBoard({
    targetMonth: '2026-07', users: users, kunRecords: kunRecords,
    oralRecords: [], sokuteiRecords: [], tsushoSendRecords: [], tsushoDueMap: {}
  }, deps);
}
const kunPlan = (b) => b.sections.find(s => s.key === 'kunPlan');

{
  const b = build(
    [U('w', '前月付け作成'), U('c', '当月付け作成'), U('n', '未作成'), U('bl', '保留者')],
    [
      { userId: 'w', name: '前月付け作成', keikaku_date: '2026-06-25' }, // 作業月＝前月に作成
      { userId: 'c', name: '当月付け作成', keikaku_date: '2026-07-01' }, // 当月に作成
      { userId: 'bl', name: '保留者', blocked_reason: '保険未登録' }      // 保留
    ]
  );
  const s = kunPlan(b);
  const done = (nm) => s.targets.find(t => t.name === nm);
  ok('C1 前月付け作成 → 済（偽の未の是正）', done('前月付け作成') && done('前月付け作成').done === true);
  ok('C2 当月付け作成 → 済（回帰）', done('当月付け作成') && done('当月付け作成').done === true);
  ok('C3 未作成 → 未（回帰）', done('未作成') && done('未作成').done === false);
  ok('C4 保留者 → kunPlan対象外（blocked除外・回帰）', !s.targets.some(t => t.name === '保留者'));
  eq('C5 対象=3（保留は分母外）', s.countTarget, 3);
  eq('C6 済=2（前月付け＋当月付け）', s.countDone, 2);
  eq('C7 未=1（未作成のみ）', s.countUndone, 1);
}

console.log(`\n==== ${fail === 0 ? 'ALL GREEN' : 'FAILED'}  pass=${pass} fail=${fail} ====`);
if (fail !== 0) process.exit(1);
