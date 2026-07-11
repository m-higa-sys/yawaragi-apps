// furikae-mailing-core.js 純関数テスト（郵送必着ロジック・営業日/祝日・4バンド・guessExpectedDate改修）
// 実行: node scripts/test-furikae-mailing.js
// 一次情報: CSS_kofuri2026schedule_2.pdf（電算システム27日版）。deadline=新規依頼書締切日（当社到着日）＝必着。
const M = require('../furikae-mailing-core.js');
let pass = 0, fail = 0;
function eq(a, e, m) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m + '\n    exp ' + E + '\n    act ' + A); } }
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }

// 本番と同一の公式スケジュール（deadline=必着日）。数値は不可侵・正本12/12一致。
const SCHEDULE = [
  { deadline: '2025-12-18', furikaeDate: '2026-01-27' },
  { deadline: '2026-01-21', furikaeDate: '2026-02-27' },
  { deadline: '2026-02-18', furikaeDate: '2026-03-27' },
  { deadline: '2026-03-23', furikaeDate: '2026-04-27' },
  { deadline: '2026-04-17', furikaeDate: '2026-05-27' },
  { deadline: '2026-05-21', furikaeDate: '2026-06-29' },
  { deadline: '2026-06-23', furikaeDate: '2026-07-27' },
  { deadline: '2026-07-22', furikaeDate: '2026-08-27' },
  { deadline: '2026-08-21', furikaeDate: '2026-09-28' },
  { deadline: '2026-09-18', furikaeDate: '2026-10-27' },
  { deadline: '2026-10-21', furikaeDate: '2026-11-27' },
  { deadline: '2026-11-20', furikaeDate: '2026-12-28' },
];

console.log('[isBusinessDay 土日＋祝日除外]');
ok(M.isBusinessDay('2026-07-14') === true, '7/14(火)→営業日');
ok(M.isBusinessDay('2026-07-18') === false, '7/18(土)→非営業');
ok(M.isBusinessDay('2026-07-19') === false, '7/19(日)→非営業');
ok(M.isBusinessDay('2026-07-20') === false, '7/20(海の日)→非営業');
ok(M.isBusinessDay('2026-09-21') === false, '9/21(敬老の日)→非営業');
ok(M.isBusinessDay('2026-09-22') === false, '9/22(国民の休日)→非営業');
ok(M.isBusinessDay('2026-09-23') === false, '9/23(秋分の日)→非営業');
ok(M.isBusinessDay('2026-05-06') === false, '5/6(振替休日)→非営業');
ok(M.isBusinessDay('2026-01-01') === false, '1/1(元日)→非営業');

console.log('\n[mailByDate＝必着−n営業日（★海の日除外の実証）]');
eq(M.mailByDate('2026-07-22', 3), '2026-07-16', '★限界ライン: 必着7/22−3営業日=7/16(木)（7/20海の日除外）');
eq(M.mailByDate('2026-07-22', 5), '2026-07-14', '★安全ライン: 必着7/22−5営業日=7/14(火)');
eq(M.mailByDate('2026-07-22', 2), '2026-07-17', '必着−2営業日=7/17(金)＝🔴開始');

console.log('\n[subtractBusinessDays 土日跨ぎ／SW(9/21-23)跨ぎ]');
eq(M.subtractBusinessDays('2026-07-22', 1), '2026-07-21', '7/22−1営業日=7/21(火)');
eq(M.subtractBusinessDays('2026-09-24', 1), '2026-09-18', '9/24(木)−1営業日=9/18(金)（SW3連+土日を跨ぐ）');
eq(M.subtractBusinessDays('2026-07-21', 1), '2026-07-17', '7/21(火)−1営業日=7/17(金)（海の日+土日跨ぎ）');

console.log('\n[addBusinessDays 到着見込（輸送）]');
eq(M.addBusinessDays('2026-07-16', 3), '2026-07-22', '7/16投函+3営業日=7/22到着（ぎりぎり必着）');
eq(M.addBusinessDays('2026-07-17', 3), '2026-07-23', '7/17投函+3営業日=7/23到着（必着落ち）');

console.log('\n[guessExpectedDate 改修＝到着見込(投函+3営業日)≤必着]');
eq(M.guessExpectedDate('2026-07-16', SCHEDULE), '2026-08-27', '★7/16投函→到着7/22→8/27に乗る（境界の内側）');
eq(M.guessExpectedDate('2026-07-17', SCHEDULE), '2026-09-28', '★7/17投函→到着7/23→8/27に乗らず次サイクル9/28（旧実装は誤って乗る＝回帰の証明）');
eq(M.guessExpectedDate('2026-06-01', SCHEDULE), '2026-07-27', '6/1投函→7/27（従来同等・非退行）');
eq(M.guessExpectedDate('2026-11-17', SCHEDULE), '2026-12-28', '年末: 11/17投函→到着11/20→12/28に乗る');
eq(M.guessExpectedDate('2026-11-30', SCHEDULE), '2027-01-27', '表末尾超過→翌年1月フォールバック');

console.log('\n[mailingBand 4バンド境界（必着7/22）]');
eq(M.mailingBand('2026-07-14', '2026-07-22').key, 'safe', '7/14=安全🟢（≤必着−5営業日）');
eq(M.mailingBand('2026-07-15', '2026-07-22').key, 'tight', '7/15=ぎりぎり🟡');
eq(M.mailingBand('2026-07-16', '2026-07-22').key, 'tight', '7/16=ぎりぎり🟡（限界ライン）');
eq(M.mailingBand('2026-07-17', '2026-07-22').key, 'rush', '7/17=急ぎ🔴（必着−2営業日）');
eq(M.mailingBand('2026-07-22', '2026-07-22').key, 'rush', '7/22=急ぎ🔴（必着当日）');
eq(M.mailingBand('2026-07-23', '2026-07-22').key, 'over', '7/23=超過⛔（必着翌日）');
const b = M.mailingBand('2026-07-20', '2026-07-22');
eq(b.safeBy, '2026-07-14', 'band.safeBy=7/14');
eq(b.limitBy, '2026-07-16', 'band.limitBy=7/16');

console.log('\n[定数]');
ok(M.TRANSIT_BUSINESS_DAYS === 3, 'TRANSIT_BUSINESS_DAYS=3');
ok(M.SAFE_MARGIN_DAYS === 2, 'SAFE_MARGIN_DAYS=2');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
