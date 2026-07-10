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
// ---- M-1: ちょうど20pt下だが浮動小数ノイズで <20 に落ちる境界（EPS無しだと点灯しない）----
// 数学的には (0.7-0.5)=0.2=20pt ちょうど＝「以上」で点灯すべき。だが JS で (0.7-0.5)*100=19.999999999999996。
// judge の 70/110 と同じ向きに `>= 曜日差 - EPS` で微小許容を入れないと、真の20ptを取りこぼす。
{
  const byWeekday = { 3: { n: 4, attended: 2, rate: 0.5 } }; // 水 0.7-0.5=20pt（float=19.9999…6）
  const r = (typeof worstDayInvestigate === 'function') ? worstDayInvestigate(byWeekday, 0.7) : null;
  ok(r && r.length === 1 && r[0] === '水曜 要調査', 'T10f: ちょうど20pt下(0.7 vs 0.5・float=19.999…6)×n=4 → 光る（EPS無しだと点灯しない・M-1バグ）');
}
// M-1 対照: 別の真20pt境界ペアでも点灯する（1.0 vs 0.8 も float=19.999…6）
{
  const byWeekday = { 4: { n: 4, attended: 3, rate: 0.8 } }; // 木 1.0-0.8=20pt（float=19.9999…6）
  const r = (typeof worstDayInvestigate === 'function') ? worstDayInvestigate(byWeekday, 1.0) : null;
  ok(r && r.length === 1 && r[0] === '木曜 要調査', 'T10g: 別の真20ptペア(1.0 vs 0.8)でも点灯（EPS向きの回帰）');
}

// =====================================================================
// Task4: judge（対象外・データ不足を率判定より先に・保険は適正圏のみ）
// 契約: scratchpad/usage-frequency-contract.md §4
// 評価順: 1.対象外(n=0/rate null/非有限) 2.データ不足(n<6) 3.減らし(<70) 4.増やし(>110)
//         5.適正圏だが低契約×率天井継続→増やし(保険) 6.それ以外=適正
// rateは分数(0.8=80%)・しきい値は%の数(judge内でrate*100)。丸めを判定に持ち込まない。
// =====================================================================
const { judge } = uf;
const J = (r, n, o) => (typeof judge === 'function') ? judge(r, n, o) : '(judge未実装)';

// ---- T1: n<6 → データ不足（率判定に落ちない）／ n=6 なら率判定に進む ----
ok(J(0.9, 5) === 'データ不足', 'T1a: rate=0.9,n=5 → データ不足（n<6は率判定より先・対象外ではない）');
ok(J(0.9, 6) === '適正', 'T1b: rate=0.9,n=6 → 適正（n=6で率判定に進む・0.9は70〜110圏）');
ok(J(0.5, 5) === 'データ不足', 'T1c: rate=0.5,n=5 → データ不足（率が減らし圏でもnが先）');

// ---- T2: 全除外で n=0（rate=null）→ 対象外 ----
ok(J(null, 0) === '対象外', 'T2: rate=null,n=0 → 対象外');

// ---- T3: ゼロ除算系（null/Infinity/NaN）→ 対象外・NaN/Infinity/"0%"を返さない ----
ok(J(null, 10) === '対象外', 'T3a: rate=null,n=10 → 対象外');
ok(J(Infinity, 10) === '対象外', 'T3b: rate=Infinity → 対象外（非有限）');
ok(J(-Infinity, 10) === '対象外', 'T3c: rate=-Infinity → 対象外（非有限）');
ok(J(NaN, 10) === '対象外', 'T3d: rate=NaN → 対象外（非有限）');
{
  const results = ['対象外', 'データ不足', '減らし', '適正', '増やし'];
  ok(results.indexOf(J(null, 0)) !== -1, 'T3e: 返り値は既定5値のいずれか（NaN/Infinity/"0%"を返さない）');
  ok(results.indexOf(J(Infinity, 10)) !== -1, 'T3f: 非有限入力でも返り値は既定5値のいずれか');
}

// ---- T6: 丸め（途中で丸めず 70/110 境界で判定が反転しない）----
// もし rate を小数1位で丸めると 0.69→0.7 になり誤って適正に化ける。生rateで比較する。
ok(J(0.69, 100) === '減らし', 'T6a: rate=0.69,n=100 → 減らし（0.7に丸めると誤って適正・生rateで<70）');
ok(J(0.70, 100) === '適正', 'T6b: rate=0.70 → 適正（境界含む・70はちょうど適正）');
ok(J(0.699, 100) === '減らし', 'T6c: rate=0.699 → 減らし（69.9%<70・丸めれば70で適正化する反転を防ぐ）');
ok(J(1.10, 100) === '適正', 'T6d: rate=1.10 → 適正（境界含む・110はちょうど適正）');
ok(J(1.11, 100) === '増やし', 'T6e: rate=1.11 → 増やし（111%>110）');
ok(J(1.101, 100) === '増やし', 'T6f: rate=1.101 → 増やし（110.1%>110・丸めれば110で適正化する反転を防ぐ）');

// ---- T9: 増やし＋保険（保険は適正圏のみ・減らし圏は救わない）----
ok(J(1.15, 10) === '増やし', 'T9a: rate=1.15,n=10 → 増やし（率>110・追加利用で率が100超）');
ok(J(0.95, 10, { 低契約: true, 率天井継続: true }) === '増やし', 'T9b: rate=0.95＋低契約×率天井継続 → 増やし（保険・適正圏を引き上げ）');
ok(J(0.95, 10) === '適正', 'T9c: rate=0.95,保険bool無し → 適正（保険が無ければ適正圏のまま・対照）');
ok(J(0.50, 10, { 低契約: true, 率天井継続: true }) === '減らし', 'T9d: rate=0.50＋保険bool → 減らし（減らし圏はstep3優先・保険で救わない）');
ok(J(0.95, 10, { 低契約: true, 率天井継続: false }) === '適正', 'T9e: 率天井継続=falseなら保険発動せず → 適正');
ok(J(0.95, 10, { 低契約: false, 率天井継続: true }) === '適正', 'T9f: 低契約=falseなら保険発動せず → 適正');

// ---- 追加利用はメイン判定に影響させない（情報用に受け取るだけ）----
ok(J(0.95, 10, { 追加利用: 5 }) === '適正', 'T9g: 追加利用を渡しても率が適正圏なら適正（追加利用はメイン判定に効かせない）');

// ---- opts省略時の堅牢性 ----
ok(J(0.8, 10) === '適正', 'JR1: opts省略で適正圏 → 適正（optsデフォルト{}）');
ok(J(0.6, 10) === '減らし', 'JR2: rate=0.6,n=10 → 減らし');
ok(J(1.2, 10) === '増やし', 'JR3: rate=1.2,n=10 → 増やし');

// ---- 保留（§6安全弁・第6の判定値・未分類件数>0 で率判定より前に発火）----
// 未分類が窓内に1件でもあれば、減らし/適正/増やしの自動判定に落とさず人の確認へ回す。
ok(J(0.5, 10, { 未分類件数: 1 }) === '保留', 'HOLD1: rate=0.5(本来減らし)＋未分類件数1 → 保留（誤って減らし候補に落とさない安全弁）');
ok(J(0.95, 10, { 未分類件数: 2 }) === '保留', 'HOLD2: rate=0.95(適正圏)＋未分類件数2 → 保留（適正でも未分類ありなら保留）');
ok(J(1.2, 10, { 未分類件数: 3 }) === '保留', 'HOLD2b: rate=1.2(本来増やし)＋未分類件数3 → 保留（増やし候補にも自動で落とさない）');
ok(J(0.95, 10, { 未分類件数: 0 }) === '適正', 'HOLD3a: rate=0.95＋未分類件数0 → 適正（未分類ゼロなら発火せず通常判定）');
ok(J(0.95, 10) === '適正', 'HOLD3b: rate=0.95＋opts省略(未分類件数既定0) → 適正（既定で保留は発火しない・無害）');
// 評価順: データ不足(n<6) ＞ 保留、対象外(n=0) が最優先
ok(J(0.5, 3, { 未分類件数: 5 }) === 'データ不足', 'HOLD4a: rate=0.5,n=3＋未分類件数5 → データ不足（n<6が保留より先）');
ok(J(0.5, 0, { 未分類件数: 5 }) === '対象外', 'HOLD4b: rate=0.5,n=0＋未分類件数5 → 対象外（n=0が最優先）');
ok(J(null, 6, { 未分類件数: 5 }) === '対象外', 'HOLD4c: rate=null,n=6＋未分類件数5 → 対象外（rate=nullが保留より先）');
// 保留は率判定(減らし<70 / 増やし>110)より前。保険(低契約×率天井継続)も未分類ありなら保留優先。
ok(J(0.95, 10, { 未分類件数: 1, 低契約: true, 率天井継続: true }) === '保留', 'HOLD5: 未分類件数1は保険(低契約×率天井継続)より先に保留（率判定・保険より前）');

// =====================================================================
// I-1: holidays 除外パス（設計§11 名指しの祝日リスク）を突く回帰網
// 契約 §2: holidays は「分母と機会の両方」から引く（除外日に来館記録があっても attended に入らない）。
// 合成: 月[1]・6月窓。月曜は6/1,6/8,6/15,6/22,6/29 の5日。契約曜日(月)に一致する祝日6/15を holidays に入れる。
//   attendance=6/1,6/8,6/15,6/22（6/15は閉所日だが来館記録あり＝異常データ・6/29は本当の欠席）。
//   ①n が1減る(5→4) ②excludedCount が1増える(0→1) ③6/15の来館記録は attended に入らない。
// T4(入院除外)と対称: 除外は「分母と機会の両方」に効く＝閉所日の異常来館記録も破棄され率に混入しない
//   （除外なし: attended=4/n=5=0.80 に 6/15来館が混入／除外あり: attended=3/n=4=0.75 で 6/15を両側から除去）。
{
  const base = {
    name: '祝日子', contractWeekdays: [1], contractPerWeek: 1,
    absences: [],
    attendance: ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22'], // 6/15は祝日だが来館記録あり／6/29欠席
    holidays: []
  };
  const withHoliday = Object.assign({}, base, { holidays: ['2026-06-15'] }); // 月曜に一致する祝日
  const rNo = W(base, 1, '2026-06-30');        // 祝日除外なし（対照）
  const rHo = W(withHoliday, 1, '2026-06-30'); // 祝日除外あり
  ok(rNo && rNo.n === 5, 'H0: 祝日除外なしの分母 n=5（対照・月曜5日）');
  ok(rNo && rNo.attended === 4 && approx(rNo.rate, 0.8), 'H0b: 除外なしだと閉所日6/15の来館が混入 attended=4,rate=0.80');
  ok(rHo && rHo.n === 4, 'H1: 祝日除外で分母 n が1減る（5→4・機会から引かれる）');
  ok(rHo && rHo.excludedCount === 1, 'H2: excludedCount=1（祝日1日が除外）');
  ok(rHo && rHo.attended === 3, 'H3: 6/15来館記録があっても attended に入らない（3・除外日の来館は数えない）');
  ok(rHo && approx(rHo.rate, 0.75), 'H4: rate=0.75（3/4・祝日を分母と機会の両方から除去＝閉所日の異常来館が混入しない）');
  ok(rHo && rHo.byWeekday && rHo.byWeekday[1] && rHo.byWeekday[1].n === 4, 'H5: byWeekday[月].n=4（祝日で1減）');
  ok(rHo && rHo.byWeekday && rHo.byWeekday[1] && rHo.byWeekday[1].attended === 3, 'H6: byWeekday[月].attended=3（6/15来館は per-weekday にも積まない）');
}

// =====================================================================
// M-2: calcWindow の薄いパス2本
// =====================================================================
// M-2①: 出席日が除外日と重なった場合 attended から落ちる（除外日に来た記録は数えない）。
// 月[1]・6月窓。6/8を入院で除外。attendance に 6/8 を含めても attended には入らない。
{
  const inputs = {
    name: '重複子', contractWeekdays: [1], contractPerWeek: 1,
    absences: [{ date: '2026-06-08', type: '欠席', reason: '入院' }], // 除外日
    attendance: ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29'], // 6/8も来館記録に混入
    holidays: []
  };
  const r = W(inputs, 1, '2026-06-30');
  ok(r && r.n === 4, 'M2a: 入院除外で n=4（月曜5−除外1）');
  ok(r && r.attended === 4, 'M2b: 除外日6/8の来館記録は attended に数えない（5来館記録−除外重複1=4）');
  ok(r && r.excludedCount === 1, 'M2c: excludedCount=1');
  ok(r && approx(r.rate, 1.0), 'M2d: rate=1.0（除外日の来館を数えないので率が暴れない）');
}
// M-2②（設計§6・保留-5 統合）: type:'欠席' で未分類の謎理由（classifyReason→'未分類'）の日は
// 除外(入院)と同じく分母 n から引かれる（＝黙って率を下げない）。ただし excludedCount とは別に
// unclassifiedCount で数える。'カウント'(体調不良)が分母に残って率を下げるのとは扱いが違う。
// 入院(除外)との対比で「別カウント」であることを示す。
{
  const mikai = {
    name: '謎理由子', contractWeekdays: [1], contractPerWeek: 1,
    absences: [{ date: '2026-06-08', type: '欠席', reason: '未分類の謎理由' }], // classifyReason→'未分類'
    attendance: ['2026-06-01', '2026-06-15', '2026-06-22', '2026-06-29'], // 6/8は未来館
    holidays: []
  };
  const nyuin = Object.assign({}, mikai, {
    absences: [{ date: '2026-06-08', type: '欠席', reason: '入院' }] // 同じ日を入院(除外)にした対照
  });
  const rM = W(mikai, 1, '2026-06-30');
  const rN = W(nyuin, 1, '2026-06-30');
  // ① n が未分類件数だけ減る（予定5 − 未分類1 = 4）＝除外と同じ数学的扱い
  ok(rM && rM.n === 4, 'M2e: 未分類日は分母 n から引かれる（予定5−未分類1=4・除外と同数学＝黙って率を下げない）');
  // ③ 率は未分類を除いた分母で計算され下がらない（4/4=1.0。分母に残していたら4/5=0.8に下がっていた）
  ok(rM && rM.attended === 4 && approx(rM.rate, 1.0), 'M2f: 未分類を分母から除くので率が下がらない（attended=4/n=4=1.0・残せば0.8）');
  // ② unclassifiedCount で数える／excludedCount とは別カウント（除外ではないので excludedCount=0）
  ok(rM && rM.unclassifiedCount === 1, 'M2g: unclassifiedCount=1（未分類日を別枠で数える）');
  ok(rM && rM.excludedCount === 0, 'M2g2: 未分類は excludedCount=0（入院等の除外とは別カウント）');
  // 対照—同じ日を入院(除外)にすると n は同じ4に減るが、カウント先が excludedCount 側になる
  ok(rN && rN.n === 4, 'M2h: 対照—同じ日を入院にしても n=4（除外も分母から引く＝未分類と同数学）');
  ok(rN && rN.excludedCount === 1 && rN.unclassifiedCount === 0, 'M2i: 対照—入院は excludedCount=1 / unclassifiedCount=0（未分類と除外は別カウント）');
}
// 保留-5補: 'カウント'(体調不良)は分母に残って率が下がる＝未分類/除外と混同しない（既存Bブロックの再確認・対比）。
{
  const taicho = {
    name: '体調対比子', contractWeekdays: [1], contractPerWeek: 1,
    absences: [{ date: '2026-06-08', type: '欠席', reason: '体調不良' }], // classifyReason→'カウント'
    attendance: ['2026-06-01', '2026-06-15', '2026-06-22', '2026-06-29'], // 6/8は未来館
    holidays: []
  };
  const r = W(taicho, 1, '2026-06-30');
  ok(r && r.n === 5, 'M2j: 体調不良(カウント)は分母に残る n=5（未分類・除外とは違い率を下げる側）');
  ok(r && approx(r.rate, 0.8) && r.unclassifiedCount === 0 && r.excludedCount === 0, 'M2k: 体調不良は率0.8に下がり unclassified/excluded どちらでもない');
}

// =====================================================================
// N-1: classifyReason にカスタム表（既定と異なる分類）を渡すと分類が変わる
// 設計「区分追加時は表だけ直す」の回帰網。'通院' を除外側へ移した表で分類が変わる。
// =====================================================================
{
  const custom = { 除外: ['入院', '通院'], カウント: ['体調不良'] }; // 通院を除外へ移動
  ok(classifyReason('欠席', '通院', custom) === '除外', 'N1a: カスタム表では 通院→除外（既定はカウント・表だけで挙動が変わる）');
  ok(classifyReason('欠席', '通院', REASON_TABLE) === 'カウント', 'N1b: 対照—既定表では 通院→カウント');
  ok(classifyReason('欠席', '本人都合', custom) === '未分類', 'N1c: カスタム表に無い 本人都合→未分類（表がカウントを絞れば未分類になる）');
}

// =====================================================================
// N-2: THRESHOLDS / REASON_TABLE の freeze（誤代入によるドリフトを型で封じる）
// sloppy mode では凍結オブジェクトへの代入は例外を出さず黙って無視される→ Object.isFrozen で確認。
// =====================================================================
ok(Object.isFrozen(THRESHOLDS) === true, 'N2a: THRESHOLDS は凍結（Object.isFrozen===true）');
ok(Object.isFrozen(REASON_TABLE) === true, 'N2b: REASON_TABLE は凍結');
ok(Object.isFrozen(REASON_TABLE['除外']) === true, 'N2c: REASON_TABLE.除外 の配列も凍結');
ok(Object.isFrozen(REASON_TABLE['カウント']) === true, 'N2d: REASON_TABLE.カウント の配列も凍結');
{
  // freeze の実効を確認。sloppy mode では単純代入は黙って無視され、frozen配列への push は
  // TypeError を投げる（どちらも「書けない」＝ドリフト事故が値に反映されない）。try/catch で両モード安全に。
  try { THRESHOLDS['減らし'] = 999; } catch (e) { /* strict mode なら throw・どちらでも値は不変 */ }
  ok(THRESHOLDS['減らし'] === 70, 'N2e: 凍結後の誤代入は反映されない（減らし=70のまま・ドリフト防止）');
  try { REASON_TABLE['除外'].push('乗っ取り理由'); } catch (e) { /* frozen配列への push は throw */ }
  ok(REASON_TABLE['除外'].indexOf('乗っ取り理由') === -1, 'N2f: 凍結配列への push も反映されない（除外配列が汚染されない）');
}

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
