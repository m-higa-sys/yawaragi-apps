// 個訓アプリ 段階6-1: 計画パートを「作業した月」の列へ寄せる
// 実行: node scripts/test-kobetsu-workmonth-column.js
//
// 仕様（社長決定 2026-08-01・案③）:
//   配置ルール（1文）:
//     「計画パートは、期間開始月が KB_WORK_MONTH_FROM(2026-06) 以降なら その1つ前の月の列に描く。
//       それより前なら 期間開始月の列に描く。」
//   ・2026-06 は作業月主義（前月準備の原則）が運用に入った月。それ以前の記録は当時のやり方のまま据え置く。
//   ・前月が年度グリッドの外に出る場合（年度の4月始まりの期間）は、開始月の列に描く（分岐B・据え置き）。
//   ・ラベルは row(M+1) が予定月かどうかで「▶ N月分を準備」／「N月分（記録済）」（文言・色は現行のまま）。
//   ・★記録の書込先は「期間の開始月の行」のまま。表示位置だけを変える。
//   ・計画パートを立てるかどうかは【個訓シートの行データのみ】で判定する（測定記録シートだけでは立てない）。
//   ・評価パートは無改修（既に作業月にいる）。
//
// 実HTMLから本物の関数を抽出して回す（テスト用に写した別実装ではない）。
// 会計年度を固定して書くので実行日に依存しない（isPast/isCurrent の色分けだけが実行日依存で、配置には効かない）。
// 利用者の実名は使わない（記号のみ）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, '個別機能訓練計画書チェック.html'), 'utf8');
const shared = fs.readFileSync(path.join(REPO, 'shared.js'), 'utf8');
const core = require(path.join(REPO, 'gas', 'yawaragi-board', 'yotei-core.js'));

function extractFrom(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('関数が無い（未実装＝RED）: ' + name);
  const s = m.index;
  let i = src.indexOf('{', s), d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(s, j + 1); } }
  throw new Error('閉じ括弧が見つからない: ' + name);
}
function extractConst(src, name) {
  const m = new RegExp('const\\s+' + name + '\\s*=\\s*([^;]+);').exec(src);
  if (!m) throw new Error('定数が無い（未実装＝RED）: ' + name);
  // ★vm.runInContext では const/let はサンドボックスのプロパティにならない。値を検査するため var で束ねる。
  return 'var ' + name + ' = ' + m[1] + ';';
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.error('  [FAIL] ' + m); } }
function sec(t) { console.log('\n[' + t + ']'); }

// ---- 実HTML/shared.js から本物を抽出 ----
const HTML_FNS = ['renderTable', 'kobetsuCycleAt', 'getGroup', 'matchesFilter', 'kbBadgeObj', 'kbPlanBadges',
  'kbEvalBadges', 'kbBadgeHtml', 'kbSubmitDue', 'escapeHtml', 'escapeAttr', 'formatMD', 'formatTodayISO',
  'kbNormKey', 'kbPickSokuteiDate', 'kbSokuteiForCell', 'blockedIcon', 'blockedLabel',
  'kbYm', 'kbBuildYoteiMap', 'kbYoteiYm', 'kbIsPlanCell', 'kbIsHyoukaCell', 'kbYoteiLabel', 'kbAdoptYoteiRow',
  'updateStats',
  // ★段階6-1で足すもの
  'kbHasPlanRowData', 'kbPlanMovesToPrevMonth'];
const SHARED_FNS = ['isPlanMonth', 'isHyoukaMonth', 'isBeforePlanStart'];
const fnSrc = extractConst(html, 'KB_WORK_MONTH_FROM') + '\n'
  + HTML_FNS.map(n => extractFrom(html, n)).join('\n') + '\n'
  + SHARED_FNS.map(n => extractFrom(shared, n)).join('\n');

// ---- DOMスタブ ----
function el() {
  return {
    style: {}, innerHTML: '', textContent: '', className: '',
    classList: { add() { }, remove() { }, contains() { return false; } }
  };
}
const thead = el(), tbody = el();
const ids = {};
['emptyMessage', 'filterBar', 'filterCount', 'totalUsers', 'thisMonthCount', 'progressCount', 'progressTotal',
  'hyoukaMonthCount', 'hyoukaDoneCount', 'hyoukaTotalCount', 'blockedCount', 'yoteiBanner'].forEach(id => ids[id] = el());
const sandbox = {
  document: {
    querySelector: sel => sel.indexOf('thead') >= 0 ? thead : (sel.indexOf('tbody') >= 0 ? tbody : el()),
    getElementById: id => ids[id] || el()
  },
  console: console, Math: Math, String: String, Date: Date, JSON: JSON, Object: Object, Array: Array,
  Number: Number, parseInt: parseInt, RegExp: RegExp, isNaN: isNaN,
  filterDay: '', filterAmpm: '', filterGroup: '',
  usageGate: {}, sortUsers() { }, isPending() { return false; }, ensureUsageGate() { }, busy: {},
  ymAdd: core.ymAdd, ymCandidates: core.ymCandidates, isDue: core.isDue,
  state: null
};
sandbox.MONTHS = [
  { m: 4, label: '4月' }, { m: 5, label: '5月' }, { m: 6, label: '6月' },
  { m: 7, label: '7月' }, { m: 8, label: '8月' }, { m: 9, label: '9月' },
  { m: 10, label: '10月' }, { m: 11, label: '11月' }, { m: 12, label: '12月' },
  { m: 1, label: '1月', nextYear: true }, { m: 2, label: '2月', nextYear: true }, { m: 3, label: '3月', nextYear: true }
];
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fnSrc, sandbox);

// ---- fixture ----
const EMPTY = { kyoumi_date: '', seikatsu_date: '', keikaku_date: '', blocked_reason: '', sokutei_date: '', sokutei_by: '', output_by: '', tasseido_date: '' };
const rec = o => Object.assign({}, EMPTY, o || {});
const K = (uid, y, m) => uid + '_' + y + '_' + m;
const baseUser = (uid, mark, planStart) => ({
  userId: uid, name: mark, furigana: 'ア', category: '要介護1',
  planStart: planStart, planMonths: 3, days: '月', ampm: '午前'
});
const yo = (uid, mark, ym) => ({ userId: uid, name: mark, domain: 'kobetsu', nextYm: ym, cycleMonths: 3, slideCount: 0, note: '' });

let FY = 2026;
function render(users, records, yoteiRecords, shienByMonth) {
  const built = sandbox.kbBuildYoteiMap(yoteiRecords);
  sandbox.state = {
    fiscalYear: FY, users: users, records: records || {}, isLoading: false,
    needsActionOnly: false, shienByMonth: shienByMonth || {},
    yotei: built.map, yoteiOk: built.ok
  };
  sandbox.renderTable();
  return tbody.innerHTML;
}
function rowCells(tbodyHtml, nameMark) {
  const rows = tbodyHtml.split('<tr').filter(r => r.indexOf(nameMark) >= 0);
  if (!rows.length) return null;
  return rows[0].split('<td').slice(3);   // index 0 = 4月 ... 11 = 翌3月
}
function colIdx(y, m) { return sandbox.MONTHS.findIndex(mo => mo.m === m && ((mo.nextYear ? FY + 1 : FY) === y)); }
function cell(tds, y, m) { const i = colIdx(y, m); return i < 0 ? null : tds[i]; }
// そのセルに描かれた計画パートの書込先（複数ありうるので配列で返す）
function planTargets(td) {
  if (!td) return [];
  const out = [];
  const re = /data-year="(\d+)" data-month="(\d+)" data-field="keikaku_date"/g;
  let m;
  while ((m = re.exec(td))) out.push(m[1] + '-' + String(m[2]).padStart(2, '0'));
  return out;
}
function planLabels(td) {
  if (!td) return [];
  const out = [];
  const re = /<span class="kb-cyc (?:kb-cyc-plan|kb-cyc-past)">([^<]*)<\/span>/g;
  let m;
  while ((m = re.exec(td))) out.push(m[1]);
  return out;
}
function hasEvalInput(td) { return !!td && td.indexOf('data-field="hyouka"') >= 0; }
// 行全体で計画パートが何本描かれたか
function countPlan(tds) { return tds.reduce((n, td) => n + planTargets(td).length, 0); }

// =====================================================================
sec('A) 定数と純関数');
{
  ok(sandbox.KB_WORK_MONTH_FROM === '2026-06', 'A1: 作業月主義の開始月が定数1箇所で定義されている 実際=' + sandbox.KB_WORK_MONTH_FROM);
  ok(sandbox.kbPlanMovesToPrevMonth('2026-06') === true, 'A2: 2026-06 は前月列へ寄せる');
  ok(sandbox.kbPlanMovesToPrevMonth('2026-05') === false, 'A3: 2026-05 は寄せない（境界の下側）');
  ok(sandbox.kbPlanMovesToPrevMonth('2026-04') === false, 'A4: 2026-04 は寄せない');
  ok(sandbox.kbPlanMovesToPrevMonth('2027-01') === true, 'A5: 以降の月はすべて寄せる（年跨ぎ）');
  ok(sandbox.kbPlanMovesToPrevMonth('') === false && sandbox.kbPlanMovesToPrevMonth('2026-6') === false,
    'A6: 壊れた値は寄せない（落ちない）');
  ok(sandbox.kbHasPlanRowData({ keikaku_date: 'x' }) === true, 'A7: 行データ判定（計画）');
  ok(sandbox.kbHasPlanRowData({ blocked_reason: '保留' }) === true, 'A8: 行データ判定（保留も実績扱い・従来どおり）');
  ok(sandbox.kbHasPlanRowData(Object.assign({}, EMPTY)) === false, 'A9: 空行は false');
}

sec('B) 2026-06 以降の行は「その1つ前の月」の列に描かれる（書込先は行の月のまま）');
{
  const u = [baseUser('U1', 'ダミーA', '2026-04')];
  const r = {};
  r[K('U1', 2026, 6)] = rec({ keikaku_date: '2026-05-26' });
  r[K('U1', 2026, 7)] = rec({ keikaku_date: '2026-06-24' });
  r[K('U1', 2026, 8)] = rec({ keikaku_date: '2026-07-27' });
  const tds = rowCells(render(u, r, [yo('U1', 'ダミーA', '2026-11')]), 'ダミーA');
  ok(planTargets(cell(tds, 2026, 5)).join() === '2026-06', 'B1: 6月始まりの期間は5月列に描かれる');
  ok(planTargets(cell(tds, 2026, 6)).join() === '2026-07', 'B2: 7月始まりの期間は6月列に描かれる');
  ok(planTargets(cell(tds, 2026, 7)).join() === '2026-08', 'B3: 8月始まりの期間は7月列に描かれる');
  ok(planTargets(cell(tds, 2026, 8)).length === 0, 'B4: 8月列には残らない（移動済み）');
  ok(planLabels(cell(tds, 2026, 7)).join() === '8月分（記録済）', 'B5: ラベルは行の月のまま「8月分（記録済）」 実際=' + planLabels(cell(tds, 2026, 7)));
  // 記録3本 ＋ 予定月(2026-11)の「▶ 準備」1本 = 4本。
  ok(planTargets(cell(tds, 2026, 10)).join() === '2026-11', 'B6: 予定月ぶんは10月列に出る');
  ok(countPlan(tds) === 4, 'B7: 記録3本＋予定月1本が過不足なく描かれる 実際=' + countPlan(tds));
}

sec('C) 境界（2026-05 と 2026-06）を明示的に');
{
  // 5月の行だけ → 5月列に据え置き
  const u = [baseUser('U1', 'ダミーB', '2026-04')];
  const r5 = {}; r5[K('U1', 2026, 5)] = rec({ blocked_reason: '長期休み' });
  const t5 = rowCells(render(u, r5, [yo('U1', 'ダミーB', '2026-11')]), 'ダミーB');
  ok(planTargets(cell(t5, 2026, 5)).join() === '2026-05', 'C1: 2026-05 の行は5月列に据え置き（移動しない）');
  ok(planTargets(cell(t5, 2026, 4)).length === 0, 'C2: 4月列へは移動しない');

  // 6月の行だけ → 5月列へ移動
  const r6 = {}; r6[K('U1', 2026, 6)] = rec({ keikaku_date: '2026-05-26' });
  const t6 = rowCells(render(u, r6, [yo('U1', 'ダミーB', '2026-11')]), 'ダミーB');
  ok(planTargets(cell(t6, 2026, 5)).join() === '2026-06', 'C3: 2026-06 の行は5月列へ移動する');
  ok(planTargets(cell(t6, 2026, 6)).length === 0, 'C4: 6月列には残らない');

  // 両方持つ → 5月列に2本（境界ゆえの唯一の同居。記録を捨てないことを固定する）
  const rb = {};
  rb[K('U1', 2026, 5)] = rec({ blocked_reason: '長期休み' });
  rb[K('U1', 2026, 6)] = rec({ keikaku_date: '2026-05-26' });
  const tb = rowCells(render(u, rb, [yo('U1', 'ダミーB', '2026-11')]), 'ダミーB');
  const tg = planTargets(cell(tb, 2026, 5)).sort();
  ok(tg.join() === '2026-05,2026-06', 'C5: 5月と6月の両方に行がある人は5月列に2本並ぶ（どちらも捨てない） 実際=' + tg.join());
  ok(countPlan(tb) === 3, 'C6: 合計3本（5月列2本＋予定月1本）＝記録が消えていない 実際=' + countPlan(tb));
}

sec('D) 2026-04・2026-05 の行は自セル据え置き（作業月主義の導入前）');
{
  const u = [baseUser('U1', 'ダミーC', '2026-04')];
  const r = {};
  r[K('U1', 2026, 4)] = rec({ keikaku_date: '2026-04-15' });
  r[K('U1', 2026, 5)] = rec({ sokutei_date: '2026-07-02', sokutei_by: 'ス', output_by: 'ス' });
  const tds = rowCells(render(u, r, [yo('U1', 'ダミーC', '2026-11')]), 'ダミーC');
  ok(planTargets(cell(tds, 2026, 4)).join() === '2026-04', 'D1: 2026-04 の行は4月列（年度の左端・表外へ落とさない）');
  ok(planTargets(cell(tds, 2026, 5)).join() === '2026-05', 'D2: 2026-05 の行は5月列');
  ok(countPlan(tds) === 3, 'D3: 2本とも描かれる（＋予定月1本） 実際=' + countPlan(tds));
}

sec('E) 「これから作る（予定月）」も同じルールで作業月の列に出る');
{
  const u = [baseUser('U1', 'ダミーD', '2026-04')];
  const tds = rowCells(render(u, {}, [yo('U1', 'ダミーD', '2026-11')]), 'ダミーD');
  ok(planTargets(cell(tds, 2026, 10)).join() === '2026-11', 'E1: 予定月11月 → 10月列に入力欄／書込先は11月の行');
  ok(planLabels(cell(tds, 2026, 10)).join() === '▶ 11月分を準備', 'E2: ラベルは「▶ 11月分を準備」（文言・色は現行のまま）');
  ok(planTargets(cell(tds, 2026, 11)).length === 0, 'E3: 11月列に二重表示しない');
  ok(countPlan(tds) === 1, 'E4: 記録が無ければ計画スロットは「次の1つ」だけ');
  ok(hasEvalInput(cell(tds, 2026, 10)), 'E5: 評価パートは同じ10月列（無改修・既に作業月）');
}

sec('F) 年跨ぎ: 翌年1月始まりの期間は12月列へ');
{
  const u = [baseUser('U1', 'ダミーE', '2026-04')];
  const r = {}; r[K('U1', 2027, 1)] = rec({ keikaku_date: '2026-12-20' });
  const tds = rowCells(render(u, r, [yo('U1', 'ダミーE', '2027-01')]), 'ダミーE');
  ok(planTargets(cell(tds, 2026, 12)).join() === '2027-01', 'F1: 2027-01 始まりは 2026-12 列（年跨ぎで壊れない）');
  ok(planLabels(cell(tds, 2026, 12)).join() === '▶ 1月分を準備', 'F2: 予定月なのでラベルは「▶ 1月分を準備」');
  ok(planTargets(cell(tds, 2027, 1)).length === 0, 'F3: 1月列に二重表示しない');
  ok(countPlan(tds) === 1, 'F4: 1本だけ');
}

sec('G) 分岐B: 前月が年度グリッドの外なら開始月の列に据え置く');
{
  // 2027年度を表示。2027-04 始まりの期間は前月が 2027-03（＝前年度）＝表外。
  FY = 2027;
  const u = [baseUser('U1', 'ダミーF', '2026-04')];
  const r = {}; r[K('U1', 2027, 4)] = rec({ keikaku_date: '2027-03-20' });
  const tds = rowCells(render(u, r, [yo('U1', 'ダミーF', '2027-10')]), 'ダミーF');
  ok(planTargets(cell(tds, 2027, 4)).join() === '2027-04', 'G1: 前月が年度外なら開始月の列に描く（記録を消さない）');
  ok(countPlan(tds) === 2, 'G2: 据え置き1本＋予定月ぶん1本 実際=' + countPlan(tds));
  // 予定月が年度の4月＝作業月が表外のケースも据え置き
  const t2 = rowCells(render(u, {}, [yo('U1', 'ダミーF', '2027-04')]), 'ダミーF');
  ok(planTargets(cell(t2, 2027, 4)).join() === '2027-04', 'G3: 予定月が年度の4月なら4月列に入力欄（入力できなくならない）');
  FY = 2026;
}

sec('H) 過去の実績セルが消えない（3ケース）');
{
  const u = [baseUser('U1', 'ダミーG', '2026-04')];
  const yr = [yo('U1', 'ダミーG', '2026-11')];
  // ①個訓シートに計画書作成日がある
  const r1 = {}; r1[K('U1', 2026, 7)] = rec({ keikaku_date: '2026-06-24' });
  const t1 = rowCells(render(u, r1, yr), 'ダミーG');
  ok(planTargets(cell(t1, 2026, 6)).join() === '2026-07', 'H1: ①個訓シートの実績は消えない（6月列へ移動して残る）');
  ok((cell(t1, 2026, 6) || '').indexOf('>-<') < 0, 'H2: ①「-」に潰れていない');
  // ②測定記録シートにしか測定が無い
  //   ★仕様（クロ決定）: 測定記録シートだけでは計画パートを立てない。
  //     ただし同じ列に描かれる計画パートがあれば、その中に測定✓として現れる（記録は失われない）。
  const sh = { 'ダミーG': { '2026-06': '2026-06-05' } };
  const t2 = rowCells(render(u, r1, yr, sh), 'ダミーG');
  ok(planTargets(cell(t2, 2026, 6)).join() === '2026-07', 'H3: ②測定記録シートの測定は、同じ6月列の計画パートに乗る');
  ok((cell(t2, 2026, 6) || '').indexOf('測定') >= 0, 'H4: ②測定バッジが出ている');
  const t2b = rowCells(render(u, {}, yr, sh), 'ダミーG');
  ok(planTargets(cell(t2b, 2026, 6)).length === 0, 'H5: ②行データが無ければ測定記録シートだけでは計画パートを立てない（意図しない行への書込を防ぐ）');
  // ③keikaku_date は空だが他の実績がある
  const r3 = {}; r3[K('U1', 2026, 7)] = rec({ kyoumi_date: '2026-06-03' });
  const t3 = rowCells(render(u, r3, yr), 'ダミーG');
  ok(planTargets(cell(t3, 2026, 6)).join() === '2026-07', 'H6: ③keikaku_date が空でも他の実績があれば残る');
  // 評価の実績も残る（無改修）
  const r4 = {}; r4[K('U1', 2026, 6)] = rec({ tasseido_date: '2026-06-20' });
  const t4 = rowCells(render(u, r4, yr), 'ダミーG');
  ok(hasEvalInput(cell(t4, 2026, 6)), 'H7: 過去の達成度評価は自セル（6月列）のまま消えない');
}

sec('I) 同じ列に2つの計画パートが並ばない（境界の5月列を除く）');
{
  // 3周期ぶんの記録＋予定月。すべて別々の列に散ることを確認する。
  const u = [baseUser('U1', 'ダミーH', '2026-04')];
  const r = {};
  r[K('U1', 2026, 6)] = rec({ keikaku_date: '2026-05-26' });
  r[K('U1', 2026, 9)] = rec({ keikaku_date: '2026-08-20' });
  r[K('U1', 2026, 12)] = rec({ keikaku_date: '2026-11-18' });
  const tds = rowCells(render(u, r, [yo('U1', 'ダミーH', '2027-03')]), 'ダミーH');
  const dup = tds.map((td, i) => ({ i: i, n: planTargets(td).length })).filter(x => x.n > 1);
  ok(dup.length === 0, 'I1: どの列にも計画パートは1本まで 実際の重複列=' + JSON.stringify(dup));
  ok(countPlan(tds) === 4, 'I2: 記録3本＋予定月1本＝4本');
  ok(planTargets(cell(tds, 2026, 5)).join() === '2026-06', 'I3: 6月始まり→5月列');
  ok(planTargets(cell(tds, 2026, 8)).join() === '2026-09', 'I4: 9月始まり→8月列');
  ok(planTargets(cell(tds, 2026, 11)).join() === '2026-12', 'I5: 12月始まり→11月列');
  ok(planTargets(cell(tds, 2027, 2)).join() === '2027-03', 'I6: 予定月3月→2月列');
}

sec('J) 撤去したもの／残したもの');
{
  // コメント中の言及は許す。実コード（宣言）が消えていることを見る。
  ok(!/const\s+claimedNodes/.test(html), 'J1: claimedNodes の事前ループが撤去されている');
  ok(html.indexOf('planClaimedByWork') < 0, 'J2: planClaimedByWork が撤去されている');
  ok(typeof sandbox.kobetsuCycleAt === 'function', 'J3: kobetsuCycleAt は関数として残っている（破壊的変更を避ける）');
  const c = sandbox.kobetsuCycleAt('2026-04', 3, 2026, 6, '2026-07');
  ok(c.role === 'work' && c.nodeYear === 2026 && c.nodeMonth === 7, 'J4: kobetsuCycleAt の挙動も従来どおり');
}

console.log('\n==== PASS ' + pass + ' / FAIL ' + fail + ' ====');
process.exit(fail ? 1 : 0);
