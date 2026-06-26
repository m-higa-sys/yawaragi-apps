// test-cycle-judge.js
// shared.js の当月判定 正準関数を「実コード抽出」して node で検証する。
// 判定関数はネスト波括弧を持つため、ブレース対応の抽出器を使う
// （test-version-gate.js の単一return前提の正規表現は使えない）。
// 実行: node scripts/test-cycle-judge.js

const fs = require('fs');
const path = require('path');

const SHARED_PATH = path.join(__dirname, '..', 'shared.js');
const src = fs.readFileSync(SHARED_PATH, 'utf8');

// function NAME(...) { ... } を波括弧の対応を数えて切り出す
function extractFn(name) {
  // トークン境界化: name直後が '(' か 空白+'(' のものだけを正規の定義とみなす
  // （単純な部分一致だと isPlanMonthV2 を isPlanMonth で誤マッチする）。
  const sigParen = 'function ' + name + '(';
  const sigSpace = 'function ' + name + ' (';
  function findSig(from) {
    const a = src.indexOf(sigParen, from);
    const b = src.indexOf(sigSpace, from);
    if (a < 0) return b < 0 ? -1 : b;
    if (b < 0) return a;
    return Math.min(a, b);
  }
  const start = findSig(0);
  if (start < 0) throw new Error('shared.js に function ' + name + ' が無い（未実装＝RED）');
  // 同名重複ガード: 2個目が見つかったら抽出器が誤った塊を掴む恐れ → throw
  if (findSig(start + ('function ' + name).length) >= 0) {
    throw new Error(name + ' が shared.js に複数定義（抽出器が誤った塊を掴む恐れ）');
  }
  const braceOpen = src.indexOf('{', start);
  let depth = 0, i = braceOpen;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const sandbox = {};
const code = extractFn('isPlanMonth') + '\n' + extractFn('isHyoukaMonth') + '\n' +
  extractFn('isOralEvalMonth') + '\n' + extractFn('monitoringFinalEvalMonth') + '\n' +
  extractFn('submitCellColor') + '\n' + extractFn('isBeforePlanStart') + '\n' +
  'sandbox.isPlanMonth = isPlanMonth; sandbox.isHyoukaMonth = isHyoukaMonth;' +
  'sandbox.isOralEvalMonth = isOralEvalMonth;' +
  'sandbox.monitoringFinalEvalMonth = monitoringFinalEvalMonth;' +
  'sandbox.submitCellColor = submitCellColor;' +
  'sandbox.isBeforePlanStart = isBeforePlanStart;';
(function () { eval(code); })();
const { isPlanMonth, isHyoukaMonth, isOralEvalMonth, monitoringFinalEvalMonth, submitCellColor, isBeforePlanStart } = sandbox;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: exp=' + JSON.stringify(expected) + ' act=' + JSON.stringify(actual)); }
}

console.log('[isPlanMonth] 既定3ヶ月: planStart=2026-04, planMonths=3');
eq(isPlanMonth('2026-04', 3, 2026, 4), true,  '開始月=計画月');
eq(isPlanMonth('2026-04', 3, 2026, 7), true,  '+3ヶ月=計画月');
eq(isPlanMonth('2026-04', 3, 2026, 6), false, '+2ヶ月=非計画月');
eq(isPlanMonth('2026-04', 3, 2026, 3), false, '開始前月=非計画月');
eq(isPlanMonth('', 3, 2026, 4), false, 'planStart空=false');
console.log('[isPlanMonth] 変則: planMonths=2 は開始月のみ');
eq(isPlanMonth('2026-04', 2, 2026, 4), true,  '変則: 開始月のみtrue');
eq(isPlanMonth('2026-04', 2, 2026, 6), false, '変則: 自動リピートなし');

console.log('[isHyoukaMonth] 既定3ヶ月: planStart=2026-04');
eq(isHyoukaMonth('2026-04', 3, 2026, 6), true,  '翌々月=評価月');
eq(isHyoukaMonth('2026-04', 3, 2026, 9), true,  '+3で評価月');
eq(isHyoukaMonth('2026-04', 3, 2026, 3), true,  '開始前月も評価月（前計画評価）');
eq(isHyoukaMonth('2026-04', 3, 2026, 4), false, '開始月=非評価月');
eq(isHyoukaMonth('2026-04', 3, 2026, 7), false, '+3ヶ月（計画月）=非評価月');
console.log('[isHyoukaMonth] 変則: planMonths=2 → 計画最終月が評価月');
eq(isHyoukaMonth('2026-04', 2, 2026, 5), true,  '変則: 開始+1（最終月）=評価月');

console.log('[isOralEvalMonth] startedAt=2026-06 起点3ヶ月毎');
eq(isOralEvalMonth('2026-06', 2026, 6), true,  '開始月=評価月');
eq(isOralEvalMonth('2026-06', 2026, 9), true,  '+3=評価月');
eq(isOralEvalMonth('2026-06', 2026, 7), false, '+1=非評価月');
eq(isOralEvalMonth('2026-06', 2026, 5), false, '開始前=false');
eq(isOralEvalMonth('', 2026, 6), false, 'startedAt空=false');

console.log('[monitoringFinalEvalMonth] override優先・無ければ planStart+11');
eq(monitoringFinalEvalMonth('2025-12', ''), '2026-11', '空→planStart+11ヶ月');
eq(monitoringFinalEvalMonth('2026-01', ''), '2026-12', '空→+11');
eq(monitoringFinalEvalMonth('2026-04', ''), '2027-03', '空→+11(跨年)');
eq(monitoringFinalEvalMonth('2025-12', '2026-03'), '2026-03', 'override優先');
eq(monitoringFinalEvalMonth('', ''), '', 'planStart空→空文字');

console.log('[submitCellColor] 該当→赤/緑/青、非該当→空');
eq(submitCellColor(false, false, false), '', '非該当=空');
eq(submitCellColor(false, true, true), '', '非該当は作成/送付に関わらず空');
eq(submitCellColor(true, false, false), 'red', '該当・未作成=red');
eq(submitCellColor(true, true, false), 'green', '該当・作成済・未送付=green');
eq(submitCellColor(true, true, true), 'blue', '該当・送付済=blue');
eq(submitCellColor(true, false, true), 'blue', '送付済は作成有無に関わらずblue');

console.log('[isBeforePlanStart] 利用開始(planStart)より前の月＝描画ガード true');
eq(isBeforePlanStart('2026-06', 2026, 5), true,  '前月(diff=-1)=開始前');
eq(isBeforePlanStart('2026-06', 2025, 12), true, '前年=開始前');
eq(isBeforePlanStart('2026-06', 2026, 6), false, '当月=開始前でない');
eq(isBeforePlanStart('2026-06', 2026, 8), false, '評価月(以降)=開始前でない');
eq(isBeforePlanStart('2026-01', 2025, 12), true, '跨年の前月=開始前');
eq(isBeforePlanStart('', 2026, 5), false, 'planStart空=false(従来表示=安全側)');

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
