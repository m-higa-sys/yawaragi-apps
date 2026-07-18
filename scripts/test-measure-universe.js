// test-measure-universe.js
// 決定B: sessionBoard に「全母集団（sbIntersectPresent_ の手前・今日不在含む）」を additive 露出。
//   - sbBuildUniverse_(kaigoUsers, shienUsers): 要介護＋要支援の生ロスターを1形に統合（純関数）
//   - sbBuildBoard_ の返りに universe を追加（既存 sokutei 等は不変＝回帰0）
// 実行: node scripts/test-measure-universe.js

const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));
const { sbBuildUniverse_, sbBuildBoard_ } = core;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: exp=' + e + ' act=' + a); }
}
function ok(c, label) { eq(!!c, true, label); }

console.log('[sbBuildUniverse_] 要介護(planStart/planMonths付)＋要支援(days)を1形に統合');
{
  const kaigo = [{ userId: 'K太郎', name: 'K太郎', category: '要介護1', days: '月火', planStart: '2026-03', planMonths: 3 }];
  const shien = [{ name: 'S花子', care: '要支援2', days: '水' }];
  const u = sbBuildUniverse_(kaigo, shien);
  eq(u.length, 2, '全母集団2件');
  eq(u[0], { key: 'K太郎', name: 'K太郎', care: '要介護1', planStart: '2026-03', planMonths: 3, days: '月火', track: 'kaigo' }, '要介護行');
  eq(u[1], { key: 'S花子', name: 'S花子', care: '要支援2', planStart: '', planMonths: 0, days: '水', track: 'shien' }, '要支援行(planStart空)');
}
console.log('[sbBuildUniverse_] null/空で落ちない');
{
  eq(sbBuildUniverse_(null, null).length, 0, '両null=空');
  eq(sbBuildUniverse_([], []).length, 0, '両空=空');
}

console.log('[sbBuildBoard_] 返りに universe を additive 追加・既存キーは不変（今日不在も母集団に残る）');
{
  // 出席者ゼロでも universe は全母集団を返す（交差前）＝スライド超過の土台
  const input = {
    today: '2026-06-20', year: 2026, month: 6,
    attendance: { attendance: { am: [], pm: [] } },
    kaigoUsers: [{ userId: '不在太郎', name: '不在太郎', category: '要介護1', days: '月', planStart: '2026-03', planMonths: 3 }],
    kaigoDoneByKey: {},
    shienUsers: [{ name: '不在花子', care: '要支援1', days: '火' }],
    shienLastByName: {}, usageByKey: {},
    oralUsers: [], oralRecByKey: {}, oralSettings: [], allUsers: [], bdUsers: [], bdStatusByKey: {}
  };
  const board = sbBuildBoard_(input, { isHyoukaMonth: function () { return false; }, oralCycleAt: function () { return { role: 'none' }; } });
  ok(Array.isArray(board.universe), 'universe キーが存在');
  eq(board.universe.length, 2, '今日不在でも母集団2件（交差前）');
  ok(board.universe.some(r => r.key === '不在太郎' && r.track === 'kaigo'), '要介護の今日不在者が母集団に居る');
  ok(board.universe.some(r => r.key === '不在花子' && r.track === 'shien'), '要支援の今日不在者が母集団に居る');
  // 既存キー(交差済み)は不変＝出席0なら sokutei も0
  eq(board.sokutei.length, 0, '既存sokutei(交差済み)は出席0で0件＝挙動不変');
  ok('koukuMoni' in board && 'residue' in board, '既存キー構造は保持');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
