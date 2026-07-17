// genba.html の 前回欠席理由バッジ 純関数を「実コード抽出」してテスト
// 対象: genba.html の absReasonCategory / absPrevAbsentView
// 実行: node scripts/test-genba-prev-absent-reason.js
//
// 出荷コードそのものを検証する（複製ではない）。未実装なら extractFn が throw ＝ RED。

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

// genba.html から function NAME(...) {...} を波括弧バランスで抽出
function extractFn(name) {
  const sig = 'function ' + name + '(';
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('genba.html に ' + sig + ' が無い（未実装＝RED）');
  let depth = 0;
  for (let j = html.indexOf('{', start); j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

const sandbox = {};
new Function('sb', extractFn('absReasonCategory') +
  '\nsb.absReasonCategory = absReasonCategory;')(sandbox);
const { absReasonCategory } = sandbox;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; }
  else { fail++; console.error('  [FAIL] ' + label + '\n    expected: ' + expected + '\n    actual:   ' + actual); }
}

// ----- health 11項目 -----
[
  '体調不良', '痛み（腰痛・膝痛等）', '転倒', '骨折', 'ケガ',
  '感染症（コロナ・インフル等）', '通院', '入院', '退院後の自宅療養', 'ワクチン接種',
  '本人の意欲低下'
].forEach(function (r) { eq(absReasonCategory(r), 'health', 'health: ' + r); });

// ----- personal 8項目 -----
[
  'ショートステイ中', '他サービス利用', '家族の都合', '家族の体調不良',
  '冠婚葬祭', '天候不良', '外出・旅行', '私用'
].forEach(function (r) { eq(absReasonCategory(r), 'personal', 'personal: ' + r); });

// ----- unknown -----
eq(absReasonCategory('その他'), 'unknown', 'unknown: その他');
eq(absReasonCategory(''), 'unknown', 'unknown: 空文字（理由未記入の過去データ）');
eq(absReasonCategory(null), 'unknown', 'unknown: null');
eq(absReasonCategory(undefined), 'unknown', 'unknown: undefined');
eq(absReasonCategory('孫の運動会'), 'unknown', 'unknown: 未知の自由入力（「その他」の実保存値）');

// ----- 正規化 -----
eq(absReasonCategory('  体調不良  '), 'health', 'trim: 前後空白付き');

// ----- 部分一致の誤爆防止（最重要）-----
eq(absReasonCategory('家族の体調不良'), 'personal',
   '誤爆防止: 「家族の体調不良」が「体調不良」に部分マッチして health にならないこと');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
