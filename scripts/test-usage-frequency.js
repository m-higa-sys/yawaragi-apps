// 利用頻度v1.1 純関数層のテスト（Task1: classifyReason + THRESHOLDS + REASON_TABLE）
// 対象: gas/yawaragi-board/usage-frequency.js
// 実行: node scripts/test-usage-frequency.js
// 契約: scratchpad/usage-frequency-contract.md §1 / 設計書 2026-07-09-riyou-hindo-keisan-v1.1-design.md
const path = require('path');
const uf = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'usage-frequency.js'));

let pass = 0, fail = 0;
function ok(c, l) { if (c) pass++; else { fail++; console.error('  [FAIL] ' + l); } }

const { classifyReason, THRESHOLDS, REASON_TABLE } = uf;

// ===== 定数（設計書リテラル準拠・ドリフト禁止）=====
ok(THRESHOLDS && THRESHOLDS['減らし'] === 70, 'C1: THRESHOLDS.減らし === 70');
ok(THRESHOLDS && THRESHOLDS['増やし'] === 110, 'C2: THRESHOLDS.増やし === 110');
ok(THRESHOLDS && THRESHOLDS['曜日差'] === 20, 'C3: THRESHOLDS.曜日差 === 20');
ok(THRESHOLDS && THRESHOLDS['n下限'] === 6, 'C4: THRESHOLDS.n下限 === 6');
ok(THRESHOLDS && THRESHOLDS['期間'] === 3, 'C5: THRESHOLDS.期間 === 3');

ok(REASON_TABLE && REASON_TABLE['除外'].indexOf('入院') !== -1, 'C6: REASON_TABLE.除外 に 入院');
ok(REASON_TABLE && REASON_TABLE['除外'].indexOf('施設側中止') !== -1, 'C7: REASON_TABLE.除外 に 施設側中止');
ok(REASON_TABLE && REASON_TABLE['除外'].indexOf('長期不在') !== -1, 'C8: REASON_TABLE.除外 に 長期不在');
ok(REASON_TABLE && REASON_TABLE['カウント'].indexOf('体調不良') !== -1, 'C9: REASON_TABLE.カウント に 体調不良');
ok(REASON_TABLE && REASON_TABLE['カウント'].indexOf('本人都合') !== -1, 'C10: REASON_TABLE.カウント に 本人都合');
ok(REASON_TABLE && REASON_TABLE['カウント'].indexOf('家族都合') !== -1, 'C11: REASON_TABLE.カウント に 家族都合');
ok(REASON_TABLE && REASON_TABLE['カウント'].indexOf('通院') !== -1, 'C12: REASON_TABLE.カウント に 通院');

// ===== T7: 分岐（率が下がる側を除外しない）=====
ok(classifyReason('欠席', '体調不良', REASON_TABLE) === 'カウント', 'T7a: 欠席×体調不良 → カウント（率が下がる側・除外しない）');
ok(classifyReason('欠席', '入院', REASON_TABLE) === '除外', 'T7b: 欠席×入院 → 除外');
ok(classifyReason('欠席', '通院', REASON_TABLE) === 'カウント', 'T7c: 欠席×通院 → カウント');
ok(classifyReason('欠席', '施設側中止', REASON_TABLE) === '除外', 'T7d: 欠席×施設側中止 → 除外');
ok(classifyReason('欠席', '長期不在', REASON_TABLE) === '除外', 'T7e: 欠席×長期不在 → 除外');

// ===== T8: 未知理由 → 未分類 / type優先 =====
ok(classifyReason('欠席', '謎の理由', REASON_TABLE) === '未分類', 'T8a: 欠席×謎の理由 → 未分類（黙って率を下げない）');
ok(classifyReason('長期休み', '入院', REASON_TABLE) === '除外', 'T8b: 長期休み×入院 → 除外（type優先）');
ok(classifyReason('長期休み', '体調不良', REASON_TABLE) === '除外', 'T8c: 長期休み×体調不良 → 除外（reason問わずtype優先）');
ok(classifyReason('長期休み', '謎の理由', REASON_TABLE) === '除外', 'T8d: 長期休み×謎の理由 → 除外（reason問わず）');

// ===== 堅牢性の基本ケース =====
ok(classifyReason('欠席', undefined, REASON_TABLE) === '未分類', 'R1: 欠席×undefined理由 → 未分類');
ok(classifyReason('欠席', '', REASON_TABLE) === '未分類', 'R2: 欠席×空文字 → 未分類');
ok(classifyReason('欠席', null, REASON_TABLE) === '未分類', 'R3: 欠席×null → 未分類');
ok(classifyReason(undefined, '入院', REASON_TABLE) === '未分類', 'R4: 未知type(undefined)×入院 → 未分類');
ok(classifyReason('', '入院', REASON_TABLE) === '未分類', 'R5: 空type×入院 → 未分類');
ok(classifyReason('出席', '入院', REASON_TABLE) === '未分類', 'R6: 未知type(出席)×入院 → 未分類');
ok(classifyReason(null, null, REASON_TABLE) === '未分類', 'R7: null×null → 未分類');
ok(classifyReason('長期休み', undefined, REASON_TABLE) === '除外', 'R8: 長期休み×undefined → 除外（type優先はreason無くても成立）');
// 既定テーブル（table省略時は内部REASON_TABLEにフォールバック）
ok(classifyReason('欠席', '体調不良') === 'カウント', 'R9: table省略時も内部既定表で カウント');
ok(classifyReason('欠席', '入院') === '除外', 'R10: table省略時も内部既定表で 除外');

// =====================================================================
// Task2: calcWindow（除外は分母と機会の両方から・n=0はrate=null）
// 契約: scratchpad/usage-frequency-contract.md §2
// 合成フィクスチャ。2026年カレンダー: 6/1=月,6/3=水,6/5=金 ... 5/1=金 等（検証済）
// =====================================================================
// calcWindow 未実装でも既存31件が緑のまま見えるよう、関数未定義時は null を返す薄いラッパで包む。
// 実装後は本物を呼ぶので、値のバグはそのまま [FAIL] に出る（握り潰しではない）。
function W(inputs, mo, asOf) {
  return (uf && typeof uf.calcWindow === 'function') ? uf.calcWindow(inputs, mo, asOf) : null;
}
function approx(a, b) { return typeof a === 'number' && Math.abs(a - b) < 1e-9; }

// ---- subMonths（窓開始日の月引き算・月末日クランプ・年跨ぎ）----
if (uf && typeof uf.subMonths === 'function') {
  ok(uf.subMonths('2026-06-30', 1) === '2026-05-30', 'W-sm1: 2026-06-30 -1ヶ月 → 2026-05-30');
  ok(uf.subMonths('2026-06-30', 3) === '2026-03-30', 'W-sm2: 2026-06-30 -3ヶ月 → 2026-03-30');
  ok(uf.subMonths('2026-03-31', 1) === '2026-02-28', 'W-sm3: 2026-03-31 -1ヶ月 → 2026-02-28（月末クランプ・2月）');
  ok(uf.subMonths('2026-05-31', 1) === '2026-04-30', 'W-sm4: 2026-05-31 -1ヶ月 → 2026-04-30（月末クランプ・4月）');
  ok(uf.subMonths('2026-01-15', 3) === '2025-10-15', 'W-sm5: 2026-01-15 -3ヶ月 → 2025-10-15（年跨ぎ）');
} else {
  ok(false, 'W-sm1: 2026-06-30 -1ヶ月 → 2026-05-30 (subMonths 未実装)');
  ok(false, 'W-sm2: 2026-06-30 -3ヶ月 → 2026-03-30 (subMonths 未実装)');
  ok(false, 'W-sm3: 月末クランプ2月 (subMonths 未実装)');
  ok(false, 'W-sm4: 月末クランプ4月 (subMonths 未実装)');
  ok(false, 'W-sm5: 年跨ぎ (subMonths 未実装)');
}

// ---- T4: 入院除外で率が下がらない（除外が分母と機会の両方から引かれる）----
// 契約 月水金[1,3,5]・6月窓(asOf=2026-06-30,1ヶ月)。予定13日・うち入院4日を除外→n=9。
// 実来館=残り9日 → attended=9, rate=9/9=1.0。除外しなければ 9/13≈0.692 に下がるはず（=除外ロジックが効いている証明）。
{
  const inputs = {
    name: 'T4太郎', contractWeekdays: [1, 3, 5], contractPerWeek: 3,
    absences: [
      { date: '2026-06-01', type: '欠席', reason: '入院' }, // 月
      { date: '2026-06-03', type: '欠席', reason: '入院' }, // 水
      { date: '2026-06-05', type: '欠席', reason: '入院' }, // 金
      { date: '2026-06-08', type: '欠席', reason: '入院' }  // 月
    ],
    attendance: ['2026-06-10', '2026-06-12', '2026-06-15', '2026-06-17', '2026-06-19', '2026-06-22', '2026-06-24', '2026-06-26', '2026-06-29'],
    holidays: []
  };
  const r = W(inputs, 1, '2026-06-30');
  ok(r && r.n === 9, 'T4a: 入院4日除外で分母 n=9（予定13−除外4）');
  ok(r && r.attended === 9, 'T4b: attended=9（残り予定日を全来館）');
  ok(r && r.rate === 1, 'T4c: rate=1.0（除外が機会からも消えるので率が下がらない・除外無なら9/13≈0.692）');
  ok(r && r.excludedCount === 4, 'T4d: excludedCount=4（除外された予定日数）');
  ok(r && r.byWeekday && r.byWeekday[1] && r.byWeekday[1].n === 3, 'T4e: byWeekday[月].n=3（予定5−除外2）');
  ok(r && r.byWeekday && r.byWeekday[3] && r.byWeekday[3].n === 3, 'T4f: byWeekday[水].n=3（予定4−除外1）');
  ok(r && r.byWeekday && r.byWeekday[5] && r.byWeekday[5].n === 3, 'T4g: byWeekday[金].n=3（予定4−除外1）');
}

// ---- n=0 → rate=null（NaN/Infinity/0% を返さない）----
// 契約 月[1]・6月窓。長期休み(5/1..6/30)で全ての月曜(5日)を除外 → n=0。
{
  const inputs = {
    name: 'ゼロ子', contractWeekdays: [1], contractPerWeek: 1,
    absences: [{ date: '2026-05-01', type: '長期休み', reason: '入院', endDate: '2026-06-30' }],
    attendance: [], holidays: []
  };
  const r = W(inputs, 1, '2026-06-30');
  ok(r && r.n === 0, 'Z1: 全予定除外で n=0');
  ok(r && r.rate === null, 'Z2: n=0 → rate=null');
  ok(r && Number.isNaN(r.rate) === false, 'Z3: rate は NaN でない');
  ok(r && r.rate !== Infinity && r.rate !== -Infinity, 'Z4: rate は Infinity でない');
  ok(r && r.rate !== 0, 'Z5: rate は 0(0%) でない（null であって 0 ではない）');
  ok(r && r.attended === 0, 'Z6: attended=0');
  ok(r && r.excludedCount === 5, 'Z7: excludedCount=5（長期休みで月曜5日除外）');
  ok(r && r.byWeekday && r.byWeekday[1] && r.byWeekday[1].rate === null, 'Z8: byWeekday[月].rate も null（n=0）');
}

// ---- 追加利用で率>1.0（契約曜日外の来館は overall に加算・byWeekday には積まない）----
// 契約 月[1]・6月窓。月曜5日全来館 + 契約外の水曜2日(追加利用) → attended=7, n=5, rate=1.4>1.0。
{
  const inputs = {
    name: '追加さん', contractWeekdays: [1], contractPerWeek: 1,
    absences: [],
    attendance: ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29', '2026-06-03', '2026-06-10'],
    holidays: []
  };
  const r = W(inputs, 1, '2026-06-30');
  ok(r && r.n === 5, 'A1: 予定は契約曜日のみ n=5');
  ok(r && r.attended === 7, 'A2: attended=7（契約外の追加利用2日も overall に加算）');
  ok(r && approx(r.rate, 1.4), 'A3: rate=1.4（>1.0 が成立＝増やし判定の土台）');
  ok(r && r.rate > 1, 'A4: rate>1.0');
  ok(r && r.byWeekday && r.byWeekday[1] && r.byWeekday[1].attended === 5, 'A5: byWeekday[月].attended=5（契約曜日分のみ）');
  ok(r && r.byWeekday && r.byWeekday[3] === undefined, 'A6: byWeekday[水] は作らない（分母の無い曜日キーを作らない）');
}

// ---- 体調不良はカウント（除外しない）→ 率が下がる（入院との対比）----
// 契約 月[1]・6月窓。6/8を体調不良で欠席。除外されず分母に残る → n=5, attended=4, rate=0.8。
// 対比: もし入院なら除外され n=4,attended=4,rate=1.0 になる。
{
  const inputs = {
    name: '不調子', contractWeekdays: [1], contractPerWeek: 1,
    absences: [{ date: '2026-06-08', type: '欠席', reason: '体調不良' }],
    attendance: ['2026-06-01', '2026-06-15', '2026-06-22', '2026-06-29'],
    holidays: []
  };
  const r = W(inputs, 1, '2026-06-30');
  ok(r && r.n === 5, 'B1: 体調不良は分母から引かない n=5');
  ok(r && r.attended === 4, 'B2: 体調不良の日は未来館 attended=4');
  ok(r && approx(r.rate, 0.8), 'B3: rate=0.8（率が下がる・入院なら1.0）');
  ok(r && r.excludedCount === 0, 'B4: excludedCount=0（体調不良は除外しない）');
}

// ---- 境界日の一貫性（windowStart と asOf の両端 inclusive・窓外は不算入）----
// 契約 月金[1,5]・asOf=2026-06-01(月)・1ヶ月窓 → windowStart=2026-05-01(金)。両端が予定日。
// attendance: 4/30(窓前=不算入) / 5/1(下端=算入) / 6/1(上端=asOf=算入) → attended=2。
{
  const inputs = {
    name: '境界子', contractWeekdays: [1, 5], contractPerWeek: 2,
    absences: [],
    attendance: ['2026-04-30', '2026-05-01', '2026-06-01'],
    holidays: []
  };
  const r = W(inputs, 1, '2026-06-01');
  ok(r && r.n === 10, 'D1: 予定 n=10（金5+月5・両端含む）');
  ok(r && r.attended === 2, 'D2: attended=2（下端5/1と上端6/1のみ・窓前4/30は不算入）');
  ok(r && r.byWeekday && r.byWeekday[5] && r.byWeekday[5].attended === 1, 'D3: byWeekday[金].attended=1（下端5/1）');
  ok(r && r.byWeekday && r.byWeekday[1] && r.byWeekday[1].attended === 1, 'D4: byWeekday[月].attended=1（上端6/1）');
}

// ---- 窓の入れ子（1ヶ月窓 ⊂ 3ヶ月窓・単調性）----
// 契約 月[1]・attendance は4/6,5/4,6/1（各月1回）。1ヶ月窓は6/1のみ算入、3ヶ月窓は3回とも算入。
{
  const inputs = {
    name: '入れ子', contractWeekdays: [1], contractPerWeek: 1,
    absences: [],
    attendance: ['2026-04-06', '2026-05-04', '2026-06-01'],
    holidays: []
  };
  const r1 = W(inputs, 1, '2026-06-30');
  const r3 = W(inputs, 3, '2026-06-30');
  ok(r1 && r1.attended === 1, 'N1: 1ヶ月窓 attended=1（6/1のみ）');
  ok(r3 && r3.attended === 3, 'N2: 3ヶ月窓 attended=3（4/6,5/4,6/1）');
  ok(r1 && r3 && r3.n >= r1.n, 'N3: n 単調（3ヶ月 n ≥ 1ヶ月 n）');
  ok(r1 && r3 && r3.attended >= r1.attended, 'N4: attended 単調（3ヶ月 ≥ 1ヶ月）');
}

// =====================================================================
// Task3: calcActualPerWeek / direction / worstDayInvestigate
// 契約: scratchpad/usage-frequency-contract.md §3 §5 §6
// =====================================================================
const { calcActualPerWeek, direction, worstDayInvestigate } = uf;

// ---- T5: calcActualPerWeek = 契約週回数 × rate（÷4.3等の除数を発明しない）----
// もし ÷4.3 等が混入すれば calcActualPerWeek(2,1.0) は 2/4.3≈0.465 になる。契約×率で 2.0 を保つ。
ok(typeof calcActualPerWeek === 'function' && approx(calcActualPerWeek(2, 1.0), 2.0),
  'T5a: calcActualPerWeek(2,1.0)=2.0（契約×率。÷4.3混入なら0.465等になる）');
ok(typeof calcActualPerWeek === 'function' && approx(calcActualPerWeek(2, 0.5), 1.0),
  'T5b: calcActualPerWeek(2,0.5)=1.0');
ok(typeof calcActualPerWeek === 'function' && approx(calcActualPerWeek(3, 1.2), 3.6),
  'T5c: calcActualPerWeek(3,1.2)=3.6（率>1.0の追加利用も素直に）');
ok(typeof calcActualPerWeek === 'function' && approx(calcActualPerWeek(3, 0.8), 2.4),
  'T5d: calcActualPerWeek(3,0.8)=2.4');
// 1ヶ月窓の率(=出席÷予定・週数約分済み)でも÷4.3でズレない: 契約2・1ヶ月窓率0.9 → 実質1.8回/週（0.9*2）
ok(typeof calcActualPerWeek === 'function' && approx(calcActualPerWeek(2, 0.9), 1.8),
  'T5e: 契約2×1ヶ月窓率0.9=1.8（÷4.3すると0.418になり誤り・率は週数約分済み前提）');
ok(typeof calcActualPerWeek === 'function' && calcActualPerWeek(3, null) === null,
  'T5f: rate=null → null（対象外の実質週回数は出さない）');
ok(typeof calcActualPerWeek === 'function' && calcActualPerWeek(3, undefined) === null,
  'T5g: rate=undefined → null（堅牢性）');

// ---- direction(recent, baseline) → '↑' | '↓' | '' ----
ok(typeof direction === 'function' && direction(2.0, 1.5) === '↑', 'DIR1: recent>baseline → ↑');
ok(typeof direction === 'function' && direction(1.0, 1.5) === '↓', 'DIR2: recent<baseline → ↓');
ok(typeof direction === 'function' && direction(1.5, 1.5) === '', 'DIR3: recent==baseline → ""（マーク無し）');
ok(typeof direction === 'function' && direction(null, 1.5) === '' && direction(1.5, undefined) === '' && direction(null, null) === '',
  'DIR4: null/undefined堅牢性 → ""');

// ---- T10: worstDayInvestigate（曜日−20pt以上 かつ n≥4 → 要調査／n<4は光らせない）----
// overallRate=0.9。水(3) rate=0.6（=30pt下）かつ n=5(≥4) → 光る。
{
  const byWeekday = {
    1: { n: 5, attended: 5, rate: 1.0 }, // 月 上振れ・光らない
    3: { n: 5, attended: 3, rate: 0.6 }, // 水 30pt下・n≥4 → 光る
    5: { n: 5, attended: 4, rate: 0.8 }  // 金 10pt下・光らない
  };
  const r = (typeof worstDayInvestigate === 'function') ? worstDayInvestigate(byWeekday, 0.9) : null;
  ok(r && r.length === 1 && r[0] === '水曜 要調査', 'T10a: 水30pt下×n≥4 → ["水曜 要調査"]');
}
// 同じ30pt下でも n=3 なら光らせない（小n暴れ防止）
{
  const byWeekday = { 3: { n: 3, attended: 1, rate: 0.6 } };
  const r = (typeof worstDayInvestigate === 'function') ? worstDayInvestigate(byWeekday, 0.9) : null;
  ok(r && r.length === 0, 'T10b: 30pt下でも n=3 → 光らせない（小n暴れ防止）');
}
// ちょうど20pt下（境界・以上）かつ n=4 → 光る
{
  const byWeekday = { 2: { n: 4, attended: 3, rate: 0.7 } }; // 火 0.9-0.7=20pt ちょうど
  const r = (typeof worstDayInvestigate === 'function') ? worstDayInvestigate(byWeekday, 0.9) : null;
  ok(r && r.length === 1 && r[0] === '火曜 要調査', 'T10c: ちょうど20pt下×n=4 → 光る（>= 境界含む）');
}
// 複数曜日該当 → 曜日番号昇順
{
  const byWeekday = {
    5: { n: 4, attended: 2, rate: 0.5 }, // 金 40pt下
    2: { n: 4, attended: 2, rate: 0.5 }, // 火 40pt下
    3: { n: 6, attended: 6, rate: 1.0 }  // 水 上振れ・光らない
  };
  const r = (typeof worstDayInvestigate === 'function') ? worstDayInvestigate(byWeekday, 0.9) : null;
  ok(r && r.length === 2 && r[0] === '火曜 要調査' && r[1] === '金曜 要調査', 'T10d: 複数該当は曜日番号昇順（火→金）');
}
// rate=null の曜日はスキップ・該当なしは []
{
  const byWeekday = {
    0: { n: 0, attended: 0, rate: null }, // 日 n=0 → スキップ
    1: { n: 5, attended: 5, rate: 1.0 }   // 月 上振れ
  };
  const r = (typeof worstDayInvestigate === 'function') ? worstDayInvestigate(byWeekday, 0.9) : null;
  ok(r && r.length === 0, 'T10e: rate=nullスキップ・該当なし → []');
}

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
