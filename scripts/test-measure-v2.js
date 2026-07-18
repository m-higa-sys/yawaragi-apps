// test-measure-v2.js
// 測定アプリ 改修（①日付切替 ②午前午後2カラム ③優先順ソート）の純関数 TDD。
//   - msAddDays: ◀▶ の日付移動
//   - msDateWarning: 今日以外を見ているときの警告（過去/未来・N日）＝セッションボード文言に一致
//   - msSplitBySession: 「今日測れる人」を午前/午後2カラムへ振り分け（人数付き）
//   - msPrioritySort: セッションボードの sbSokuteiSort_ を注入流用（overdue赤は最上部・要介護上・残チャンス少い順）
//   - msBuildMeasurementTargets: days を出力に通す（優先順ソートの週回数/残来所計算に必要）＋選択日で抽出が変わる
// sbSokuteiSort_/sbCountWeeklyVisits_/sbCountRemainingVisits_ は session-board-core.js（既存・逐語コピーを増やさない）を require注入。
// 実行: node scripts/test-measure-v2.js

const fs = require('fs');
const path = require('path');
function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('function ' + name + ' が無い（未実装＝RED）');
  const b = src.indexOf('{', s); let d = 0, i = b;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}
function loadDue() {
  const shared = fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8');
  const box = {};
  eval(extractFn(shared, 'sokuteiCycleMonths_') + '\n' + extractFn(shared, 'sokuteiDueDate_') + '\nbox.fn = sokuteiDueDate_;');
  return box.fn;
}
const sokuteiDueDate_ = loadDue();

const core = require(path.join(__dirname, '..', 'measure-core.js'));
const { msAddDays, msDateWarning, msSplitBySession, msPrioritySort, msCountCarryOver, msBuildMeasurementTargets } = core;
const sb = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));
const deps = { weeklyVisits: sb.sbCountWeeklyVisits_, remainingVisits: sb.sbCountRemainingVisits_, sokuteiSort: sb.sbSokuteiSort_ };

let pass = 0, fail = 0;
function eq(a, e, l) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + ' :: exp=' + E + ' act=' + A); } }
function ok(c, l) { eq(!!c, true, l); }

// ===== ① msAddDays =====
console.log('[msAddDays] 日付移動（月跨ぎ・年跨ぎ）');
eq(msAddDays('2026-06-20', 1), '2026-06-21', '+1');
eq(msAddDays('2026-06-20', -1), '2026-06-19', '-1');
eq(msAddDays('2026-06-30', 1), '2026-07-01', '月跨ぎ');
eq(msAddDays('2026-12-31', 1), '2027-01-01', '年跨ぎ');
eq(msAddDays('2026-03-01', -1), '2026-02-28', '月頭-1');

// ===== ① msDateWarning =====
console.log('[msDateWarning] 今日以外の警告（セッションボード文言一致）');
eq(msDateWarning('2026-06-20', '2026-06-20'), { show: false, kind: '', label: '' }, '今日=警告なし');
eq(msDateWarning('2026-06-22', '2026-06-20'), { show: true, kind: 'future', label: '⏩ 未来の日付を表示中（今日ではありません・2日後）' }, '未来2日後');
eq(msDateWarning('2026-06-18', '2026-06-20'), { show: true, kind: 'past', label: '⏪ 過去の日付を表示中（今日ではありません・2日前）' }, '過去2日前');
eq(msDateWarning('2026-06-19', '2026-06-20').label, '⏪ 過去の日付を表示中（今日ではありません・1日前）', '過去1日前');

// ===== ② msSplitBySession =====
console.log('[msSplitBySession] 今日測れる人を午前/午後へ（人数付き）');
{
  const rows = [
    { key: 'A', session: 'am', attendingToday: true },
    { key: 'B', session: 'pm', attendingToday: true },
    { key: 'C', session: 'am', attendingToday: true },
    { key: 'D', session: '', attendingToday: false }  // 不在は2カラムに出さない
  ];
  const r = msSplitBySession(rows);
  eq(r.am.map(x => x.key), ['A', 'C'], '午前=A,C');
  eq(r.pm.map(x => x.key), ['B'], '午後=B');
  eq(r.amCount, 2, '午前人数');
  eq(r.pmCount, 1, '午後人数');
  ok(!r.am.concat(r.pm).some(x => x.key === 'D'), '不在Dはどちらにも出さない');
}

// ===== ③ msPrioritySort =====
// 【2026-07-18 方針変更】スライド組（overdue＝先月以前が期限で未測定）を最上部へ押し上げるのをやめた。
// 理由: スライドは「その月のうちにやればいい」運用で緊急ではない。急かす表示（最上部固定・赤）は現場の
// 実感と合わないため、通常の優先順（要介護上位・残チャンス少い順）の中に混ぜる。区別は控えめバッジと
// 件数の内訳のみで行う（旧: overdue群を先に並べる分岐 → 新: 全件を1回の sbSokuteiSort_ に通す）。
console.log('[msPrioritySort] スライド組も通常の優先順に混ぜる（overdue最上部の固定はしない）');
{
  const today = '2026-06-20';
  const targets = [
    // due・要支援・週2日・欠席多め
    { key: 'S1', name: 'S1', care: '要支援2', days: '月火', status: 'due', 前回測定日: '2026-02-20', 次回期限: '2026-06-20' },
    // due・要介護・週1日（残チャンス少）→ 要介護は careLayer0 で上
    { key: 'K1', name: 'K1', care: '要介護1', days: '金', status: 'due', 前回測定日: '2026-03-20', 次回期限: '2026-06-20' },
    // overdue(スライド)・要支援 → 押し上げない＝要介護より下のまま
    { key: 'O1', name: 'O1', care: '要支援1', days: '水木金', status: 'overdue', 前回測定日: '2026-01-10', 次回期限: '2026-05-10' },
  ];
  const usage = { S1: 0.5 }; // S1の出席率0.5→欠席0.5
  const sorted = msPrioritySort(targets, usage, today, deps);
  const keys = sorted.map(r => r.key);
  eq(sorted[0].key, 'K1', '先頭=要介護(due)。スライド組(要支援overdue)を最上部に押し上げない');
  ok(keys.indexOf('K1') < keys.indexOf('O1'), '要介護K1 が スライド組O1 より上（status非依存）');
  ok(keys.indexOf('K1') < keys.indexOf('S1'), '要介護 K1 が 要支援 S1 より上');
  // 既存挙動非破壊: 全件返る
  eq(sorted.length, 3, '3件すべて返る');
}
console.log('[msPrioritySort] 同じ介護度層ならスライドかどうかで順位が変わらない（urgency勝負）');
{
  const today = '2026-06-20';
  // 同じ要介護・同条件で status だけ違う2人 → 並びは status で決まらず、
  // 残チャンス（週回数）の少ない方が先。スライド(O)を週2日・due(D)を週1日にすると D が先になるはず。
  const targets = [
    { key: 'O', name: 'O', care: '要介護1', days: '月火', status: 'overdue', 前回測定日: '2026-01-10', 次回期限: '2026-05-10' },
    { key: 'D', name: 'D', care: '要介護1', days: '金', status: 'due', 前回測定日: '2026-03-20', 次回期限: '2026-06-20' },
  ];
  const keys = msPrioritySort(targets, {}, today, deps).map(r => r.key);
  eq(keys[0], 'D', '週1日(残チャンス少)のdueが、週2日のスライドより先＝statusで割り込まない');
}
console.log('[msPrioritySort] deps未注入でも落ちない（空配列）');
eq(msPrioritySort([], {}, '2026-06-20', deps).length, 0, '空→空');

// ===== ③ msCountCarryOver（スライド組の件数内訳） =====
// 「今月の残り」タブの人数に内訳を添えるため（例: 75名（うち先月から12名））。
console.log('[msCountCarryOver] スライド組（先月以前が期限＝status:overdue）の件数を数える');
{
  const rows = [
    { key: 'a', status: 'overdue' },
    { key: 'b', status: 'due' },
    { key: 'c', status: 'overdue' },
    { key: 'd', status: 'due' },
  ];
  eq(msCountCarryOver(rows), 2, 'overdue 2件');
  eq(msCountCarryOver([]), 0, '空→0');
  eq(msCountCarryOver(null), 0, 'null→0（未取得時に落ちない）');
  eq(msCountCarryOver([{ status: 'due' }]), 0, 'スライド0名なら0（内訳を出さない判断に使う）');
}

// ===== msBuildMeasurementTargets: days 出力＋選択日で抽出が変わる =====
console.log('[msBuildMeasurementTargets] days を出力に通す（優先順ソート用）');
{
  const universe = [{ key: 'K', name: 'K', care: '要介護1', planStart: '2026-03', planMonths: 3, days: '月火' }];
  const t = msBuildMeasurementTargets(universe, { K: '2026-03-20' }, [], '2026-06-20', sokuteiDueDate_);
  eq(t[0].days, '月火', 'target が days を保持');
}
console.log('[msBuildMeasurementTargets] 選択日(today引数)で抽出が変わる');
{
  const universe = [{ key: 'S', name: 'S', care: '要支援2', days: '月' }];
  // 前回2026-02-20・要支援4ヶ月→期限2026-06-20
  const prev = { S: '2026-02-20' };
  // 選択日=2026-05-15（期限前・今サイクル中）→ 対象外
  eq(msBuildMeasurementTargets(universe, prev, [], '2026-05-15', sokuteiDueDate_).length, 0, '期限前の選択日=対象外');
  // 選択日=2026-06-20（期限月）→ 対象
  eq(msBuildMeasurementTargets(universe, prev, [], '2026-06-20', sokuteiDueDate_).length, 1, '期限月の選択日=対象');
  // 選択日=2026-07-10（超過）→ 対象(overdue)
  const over = msBuildMeasurementTargets(universe, prev, [], '2026-07-10', sokuteiDueDate_);
  eq(over.length, 1, '超過の選択日=対象');
  eq(over[0].status, 'overdue', '超過=overdue');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
