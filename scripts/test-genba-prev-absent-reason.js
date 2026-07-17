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

// genba.html から const ABS_REASONS = [...] の実体を抽出（網羅性ガード用）
function extractAbsReasons() {
  const m = html.match(/const ABS_REASONS = (\[[\s\S]*?\]);/);
  if (!m) throw new Error('genba.html に const ABS_REASONS が無い');
  return new Function('return ' + m[1])();
}

const sandbox = {};
new Function('sb', extractFn('absReasonCategory') + '\n' + extractFn('absPrevAbsentView') +
  '\nsb.absReasonCategory = absReasonCategory; sb.absPrevAbsentView = absPrevAbsentView;')(sandbox);
const { absReasonCategory, absPrevAbsentView } = sandbox;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; }
  else { fail++; console.error('  [FAIL] ' + label + '\n    expected: ' + expected + '\n    actual:   ' + actual); }
}
function eqJson(actual, expected, label) {
  const A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A === E) { pass++; }
  else { fail++; console.error('  [FAIL] ' + label + '\n    expected: ' + E + '\n    actual:   ' + A); }
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

// ----- absPrevAbsentView: 3分類 × {label,bg,text,icon} 完全一致 -----
eqJson(absPrevAbsentView('health'),
  { label: '前回休・体調', bg: '#FAECE7', text: '#993C1D', icon: '🩺' }, 'view: health');
eqJson(absPrevAbsentView('personal'),
  { label: '前回休・私用', bg: '#F1EFE8', text: '#5F5E5A', icon: '' }, 'view: personal（アイコンなし）');
eqJson(absPrevAbsentView('unknown'),
  { label: '前回休・不明', bg: '#FAEEDA', text: '#854F0B', icon: '❓' }, 'view: unknown');

// ----- 未知 category は unknown へフォールバック（例外を投げない）-----
eqJson(absPrevAbsentView('zzz'),
  { label: '前回休・不明', bg: '#FAEEDA', text: '#854F0B', icon: '❓' }, 'view: 未知categoryはunknownへ');
eqJson(absPrevAbsentView(undefined),
  { label: '前回休・不明', bg: '#FAEEDA', text: '#854F0B', icon: '❓' }, 'view: undefinedはunknownへ');

// ----- 分類→表示の合成（実際の使われ方）-----
eqJson(absPrevAbsentView(absReasonCategory('通院')),
  { label: '前回休・体調', bg: '#FAECE7', text: '#993C1D', icon: '🩺' }, '合成: 通院 → 体調バッジ');
eqJson(absPrevAbsentView(absReasonCategory('')),
  { label: '前回休・不明', bg: '#FAEEDA', text: '#854F0B', icon: '❓' }, '合成: 理由なし → 不明バッジ');

// ----- 網羅性ガード: ABS_REASONS 20項目が想定どおり3分類に落ちること -----
// 将来 ABS_REASONS に項目が増えたら、ここで unknown 落ちを検知できる。
const ABS_REASONS = extractAbsReasons();
eq(ABS_REASONS.length, 20, '網羅性: ABS_REASONS は20項目');

const tally = { health: 0, personal: 0, unknown: 0 };
ABS_REASONS.forEach(function (r) { tally[absReasonCategory(r)]++; });
eq(tally.health, 11, '網羅性: health は11項目');
eq(tally.personal, 8, '網羅性: personal は8項目');
eq(tally.unknown, 1, '網羅性: unknown は「その他」の1項目のみ');

// unknown に落ちるのは「その他」だけ＝新項目の追加を検知する
const unknownItems = ABS_REASONS.filter(function (r) { return absReasonCategory(r) === 'unknown'; });
eqJson(unknownItems, ['その他'],
  '網羅性: unknown 落ちは「その他」のみ（他が混ざったら ABS_REASONS に未分類の新項目がある）');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
