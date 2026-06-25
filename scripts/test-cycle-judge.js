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
  extractFn('isOralEvalMonth') + '\n' +
  'sandbox.isPlanMonth = isPlanMonth; sandbox.isHyoukaMonth = isHyoukaMonth;' +
  'sandbox.isOralEvalMonth = isOralEvalMonth;';
(function () { eval(code); })();
const { isPlanMonth, isHyoukaMonth, isOralEvalMonth } = sandbox;

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

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
