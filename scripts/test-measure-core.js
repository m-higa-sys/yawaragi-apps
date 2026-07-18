// test-measure-core.js
// 測定アプリ① の判定純関数 measure-core.js の TDD（DOM/GAS非依存）。
//   - msCurrentPlanMonth: 現サイクル計画月（isPlanMonth該当月・③のボード✓印と同一キー）
//   - msBuildMeasurementTargets: 全母集団→今月期限＋スライド超過の測定対象（済はsunk除外）
//   - msRouteWrite: 介護度で書込先を振り分け（要介護=updateKeikakusho3項目 / 要支援=addShienSokutei）
// 期限計算は shared.js の sokuteiDueDate_ を注入（新コピーを増やさない）。isPlanMonth も shared.js 実バイトで整合確認。
// 実行: node scripts/test-measure-core.js

const fs = require('fs');
const path = require('path');

function extractFn(src, name) {
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  if (start < 0) throw new Error('function ' + name + ' が無い（未実装＝RED）');
  const braceOpen = src.indexOf('{', start);
  let depth = 0, i = braceOpen;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}
function loadShared(name) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8');
  const box = {};
  eval(extractFn(src, 'sokuteiCycleMonths_') + '\n' + extractFn(src, name) + '\nbox.fn = ' + name + ';');
  return box.fn;
}
const sokuteiDueDate_ = loadShared('sokuteiDueDate_');
const isPlanMonth = loadShared('isPlanMonth');

const core = require(path.join(__dirname, '..', 'measure-core.js'));  // RED時: モジュール無しでthrow
const { msCurrentPlanMonth, msBuildMeasurementTargets, msRouteWrite, msNormalizeName_ } = core;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: exp=' + e + ' act=' + a); }
}
function ok(c, label) { eq(!!c, true, label); }

const TODAY = '2026-06-20';

// ===== msCurrentPlanMonth（③✓印と同一キー・isPlanMonth整合）=====
console.log('[msCurrentPlanMonth] 現サイクル計画月（planStart+3k・today以前の最新計画月）');
eq(msCurrentPlanMonth('2026-06', 3, TODAY), { year: 2026, month: 6 }, 'planStart当月=計画月');
eq(msCurrentPlanMonth('2026-03', 3, TODAY), { year: 2026, month: 6 }, '+3ヶ月周期の当該計画月(3→6月)');
eq(msCurrentPlanMonth('2026-01', 3, TODAY), { year: 2026, month: 4 }, '直近計画月(1,4,7…→4月)');
eq(msCurrentPlanMonth('2025-11', 3, TODAY), { year: 2026, month: 5 }, '年跨ぎ(11,2,5…→5月)');
eq(msCurrentPlanMonth('2026-06', 2, TODAY), { year: 2026, month: 6 }, '変則(L≠3)は計画月=planStartのみ');
eq(msCurrentPlanMonth('', 3, TODAY), null, 'planStart空=null');
console.log('[msCurrentPlanMonth] 算出結果は必ず isPlanMonth 該当（③キー整合）');
[['2026-06', 3], ['2026-03', 3], ['2026-01', 3], ['2025-11', 3]].forEach(function (c) {
  const pm = msCurrentPlanMonth(c[0], c[1], TODAY);
  ok(isPlanMonth(c[0], c[1], pm.year, pm.month), 'isPlanMonth(' + c[0] + ')=' + pm.year + '-' + pm.month);
});

// ===== msBuildMeasurementTargets =====
function target(rows) { return rows; }
console.log('[msBuildMeasurementTargets] 今月due/スライド超過/前回なし/済除外');
{
  const universe = [
    { key: '今月太郎', name: '今月太郎', care: '要介護1', planStart: '2026-03', planMonths: 3 }, // last3/20→due6/20=今月
    { key: '超過花子', name: '超過花子', care: '要介護1', planStart: '2026-01', planMonths: 3 }, // last1/15→due4/15=先月以前
    { key: '未測次郎', name: '未測次郎', care: '要支援2' },                                      // 前回なし=即due
    { key: '済子', name: '済子', care: '要介護1', planStart: '2026-05', planMonths: 3 },        // last5/20→due8/20=未来=除外
  ];
  const prev = { '今月太郎': '2026-03-20', '超過花子': '2026-01-15', '済子': '2026-05-20' }; // 未測次郎は無し
  const attendees = [{ name: '今月太郎', session: 'am' }, { name: '超過花子', session: 'pm' }];
  const t = msBuildMeasurementTargets(universe, prev, attendees, TODAY, sokuteiDueDate_);

  eq(t.length, 3, '対象3人（済子は未来期限でsunk除外）');
  ok(!t.some(r => r.key === '済子'), '済子は除外');
  // 先頭=スライド超過（赤・最上部）
  eq(t[0].key, '超過花子', 'スライド超過が最上部');
  eq(t[0].status, 'overdue', '超過=overdue');
  eq(t[0].次回期限, '2026-04-15', '超過の次回期限=4/15');
  eq(t[0].attendingToday, true, '超過花子は来所');
  eq(t[0].session, 'pm', 'session付与');
  // 今月due
  const ima = t.find(r => r.key === '今月太郎');
  eq(ima.status, 'due', '今月=due');
  eq(ima.次回期限, '2026-06-20', '今月太郎の次回期限=6/20');
  eq(ima.前回測定日, '2026-03-20', '前回測定日');
  // routing に必要な planStart/planMonths を target に通す（要介護の計画月算出用）
  eq(ima.planStart, '2026-03', 'target が planStart を保持（msRouteWrite用）');
  eq(ima.planMonths, 3, 'target が planMonths を保持');
  // 前回なし=即due
  const mi = t.find(r => r.key === '未測次郎');
  eq(mi.status, 'due', '前回なし=即due');
  eq(mi.前回測定日, '', '前回なしは空');
  eq(mi.attendingToday, false, '未測次郎は今日不在（=スライド超過拾い）');
}

console.log('[msBuildMeasurementTargets] 要介護3・要支援4のサイクル差');
{
  const universe = [
    { key: 'K', name: 'K', care: '要介護1', planStart: '2026-02', planMonths: 3 },
    { key: 'S', name: 'S', care: '要支援2' },
  ];
  // 同じ前回2/20：要介護3ヶ月→due5/20(超過)、要支援4ヶ月→due6/20(今月)
  const prev = { 'K': '2026-02-20', 'S': '2026-02-20' };
  const t = msBuildMeasurementTargets(universe, prev, [], TODAY, sokuteiDueDate_);
  eq(t.find(r => r.key === 'K').次回期限, '2026-05-20', '要介護3ヶ月→5/20(超過)');
  eq(t.find(r => r.key === 'K').status, 'overdue', '要介護=overdue');
  eq(t.find(r => r.key === 'S').次回期限, '2026-06-20', '要支援4ヶ月→6/20(今月)');
  eq(t.find(r => r.key === 'S').status, 'due', '要支援=due');
}

console.log('[msBuildMeasurementTargets] includePaper使い分け（前回測定日に紙seedを含めるか）');
{
  const universe = [{ key: 'P', name: 'P', care: '要支援1' }];
  const attendees = [];
  // includePaper:true 由来（紙seedを前回に含む）：last=2026-03-01 → due=2026-07-01(未来)=除外
  const withPaper = msBuildMeasurementTargets(universe, { 'P': '2026-03-01' }, attendees, TODAY, sokuteiDueDate_);
  eq(withPaper.length, 0, 'includePaper:true→紙seedが前回アンカー→今サイクル中で除外');
  // includePaper:false 由来（紙を除外＝前回なし）：即due
  const noPaper = msBuildMeasurementTargets(universe, {}, attendees, TODAY, sokuteiDueDate_);
  eq(noPaper.length, 1, 'includePaper:false→前回なし→即due（対象化）');
  eq(noPaper[0].status, 'due', '前回なし=due');
}

// ===== msRouteWrite =====
console.log('[msRouteWrite] 要介護→updateKeikakusho 3項目・計画月キー・出力者初期=測定者');
{
  const tgt = { key: '介護太郎', name: '介護太郎', care: '要介護1', planStart: '2026-03', planMonths: 3 };
  const r = msRouteWrite(tgt, { sokuteiDate: '2026-06-20', sokuteiBy: '勝又', outputBy: '' }, TODAY);
  eq(r.action, 'updateKeikakusho', 'action');
  eq(r.userId, '介護太郎', 'userId=key');
  eq(r.year, 2026, 'year=計画月year');
  eq(r.month, 6, 'month=計画月month(3+3=6)');
  eq(r.jobs, [
    { field: 'sokutei_date', value: '2026-06-20' },
    { field: 'sokutei_by', value: '勝又' },
    { field: 'output_by', value: '勝又' }
  ], '3項目・出力者空→測定者を初期採用');
}
console.log('[msRouteWrite] 要支援→addShienSokutei（測定者のみ・出力者なし＝ⓑ）');
{
  const tgt = { key: '支援花子', name: '支援花子', care: '事業対象者' };
  const r = msRouteWrite(tgt, { sokuteiDate: '2026-06-18', sokuteiBy: '小林' }, TODAY);
  eq(r.action, 'addShienSokutei', 'action');
  eq(r.name, '支援花子', 'name=key');
  eq(r.date, '2026-06-18', 'date');
  eq(r.by, '小林', 'by');
  ok(!('output_by' in r) && !('outputBy' in r), '出力者は持たない（要支援シートに列なし）');
}
console.log('[msRouteWrite] 測定日省略時は today を採用');
{
  const r = msRouteWrite({ key: 'S', name: 'S', care: '要支援1' }, { sokuteiBy: 'x' }, TODAY);
  eq(r.date, TODAY, '日付省略→today');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
