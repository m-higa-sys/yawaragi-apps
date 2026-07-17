// test-sokutei-duedate.js
// 期限計算2関数 sokuteiCycleMonths_ / sokuteiDueDate_ を sokutei.html ローカルから shared.js §I へ
// 単一化した移設の検証。
//   (1) shared.js 版の実バイトを抽出して期限計算の代表ケース（月末クランプ・年跨ぎ・うるう）を検証
//   (2) 回帰: 結線前の sokutei.html 実挙動を固めた golden（test-sokutei-duedate.golden.json）と
//       shared.js 版が全88組合せで完全一致＝「結線前後で due-date が1ミリも変わらない」実測
//   (3) 構造: sokutei.html が shared.js を読み込み、ローカル2定義が撤去されていること
// 実行: node scripts/test-sokutei-duedate.js

const fs = require('fs');
const path = require('path');

function extractFn(src, name) {
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
  if (start < 0) throw new Error('function ' + name + ' が無い（未実装＝RED）');
  if (findSig(start + ('function ' + name).length) >= 0) {
    throw new Error(name + ' が複数定義（抽出器が誤った塊を掴む恐れ）');
  }
  const braceOpen = src.indexOf('{', start);
  let depth = 0, i = braceOpen;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

function loadPair(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const box = {};
  eval(extractFn(src, 'sokuteiCycleMonths_') + '\n' + extractFn(src, 'sokuteiDueDate_') +
    '\nbox.cycle = sokuteiCycleMonths_; box.due = sokuteiDueDate_;');
  return box;
}

const shared = loadPair('shared.js');                 // 単一化後の正本（shared.js §I）
const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'sokutei.html'), 'utf8');
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-sokutei-duedate.golden.json'), 'utf8'));

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: exp=' + JSON.stringify(expected) + ' act=' + JSON.stringify(actual)); }
}

console.log('[sokuteiCycleMonths_] 要介護→3 / 要支援・事業対象・その他→4');
eq(shared.cycle('要介護1'), 3, '要介護1=3');
eq(shared.cycle('要介護'), 3, '要介護=3');
eq(shared.cycle('要支援1'), 4, '要支援1=4');
eq(shared.cycle('要支援2'), 4, '要支援2=4');
eq(shared.cycle('事業対象者'), 4, '事業対象者=4');
eq(shared.cycle(''), 4, '空=4');
eq(shared.cycle(null), 4, 'null=4');

console.log('[sokuteiDueDate_] 基準日+周期・月末クランプ・年跨ぎ・うるう');
eq(shared.due('2026-06-20', '要介護1'), '2026-09-20', '要介護+3ヶ月');
eq(shared.due('2026-06-20', '要支援2'), '2026-10-20', '要支援+4ヶ月');
eq(shared.due('2026-01-31', '要介護1'), '2026-04-30', '月末クランプ 1/31→4/30(30日)');
eq(shared.due('2026-11-15', '要介護1'), '2027-02-15', '年跨ぎ 11月+3→翌年2月');
eq(shared.due('2026-12-10', '要支援1'), '2027-04-10', '年跨ぎ 12月+4→翌年4月');
eq(shared.due('2023-11-30', '要介護1'), '2024-02-29', 'うるう年 11/30+3→2/29(クランプ)');
eq(shared.due('2025-11-30', '要介護1'), '2026-02-28', '非うるう 11/30+3→2/28(クランプ)');
eq(shared.due('2026-10-31', '要支援1'), '2027-02-28', '要支援 10/31+4→翌2月末クランプ');

// === 回帰: 結線前 sokutei.html 実挙動(golden) と shared.js が全組合せ一致 ===
console.log('[回帰] 結線前後で due-date 不変（golden == shared.js・全88組合せ）');
{
  let mism = 0, n = 0;
  Object.keys(golden).forEach(k => {
    n++;
    let got;
    if (k.slice(0, 4) === 'cyc:') got = shared.cycle(k.slice(4));
    else { const rest = k.slice(4); const p = rest.split('|'); got = shared.due(p[0], p[1] === undefined ? '' : p[1]); }
    if (got !== golden[k]) { mism++; console.log('  FAIL golden不一致 ' + k + ' :: gold=' + golden[k] + ' shared=' + got); fail++; }
  });
  eq(mism, 0, '全' + n + '組合せで golden==shared（結線前挙動を1ミリも変えていない）');
}

// === 構造: sokutei.html が shared.js を読み込み、ローカル2定義が撤去された ===
console.log('[構造] sokutei.html の結線と撤去');
{
  const loadsShared = /<script[^>]*src=["']shared\.js/.test(htmlSrc);
  eq(loadsShared, true, 'sokutei.html が <script src="shared.js"> を読み込む');
  const hasLocalCycle = /function\s+sokuteiCycleMonths_\s*\(/.test(htmlSrc);
  const hasLocalDue = /function\s+sokuteiDueDate_\s*\(/.test(htmlSrc);
  eq(hasLocalCycle, false, 'sokuteiCycleMonths_ のローカル定義が撤去されている');
  eq(hasLocalDue, false, 'sokuteiDueDate_ のローカル定義が撤去されている');
  // 使用箇所（呼び出し）は残っている＝機能が生きている
  eq(/sokuteiDueDate_\s*\(/.test(htmlSrc), true, 'sokuteiDueDate_ の呼び出しは残存（機能維持）');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
