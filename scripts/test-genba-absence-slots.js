// genba.html の (date,unit)集合 純関数を「実コード抽出」してテスト（中止ゲートと同じTDD流儀）
// 対象: genba.html の gnbNormalizeSlots / gnbWeekAbsenceSlots
// 実行: node scripts/test-genba-absence-slots.js
//
// GAS側 absence-slots-core.js と同一ロジックであることを担保する（出荷コードそのものを検証）。

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

// genba.html から function NAME(...) {...} を波括弧バランスで抽出
function extractFn(name) {
  const sig = 'function ' + name;
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('genba.html に ' + sig + ' が無い（未実装＝RED）');
  let i = html.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

const sandbox = {};
new Function('sb', extractFn('gnbNormalizeSlots') + '\n' + extractFn('gnbWeekAbsenceSlots') +
  '\nsb.gnbNormalizeSlots = gnbNormalizeSlots; sb.gnbWeekAbsenceSlots = gnbWeekAbsenceSlots;')(sandbox);
const { gnbNormalizeSlots, gnbWeekAbsenceSlots } = sandbox;

let pass = 0, fail = 0;
function eqJson(actual, expected, label) {
  const A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A === E) { pass++; }
  else { fail++; console.error('  [FAIL] ' + label + '\n    expected: ' + E + '\n    actual:   ' + A); }
}

// 2026-06-17(水)基準。週=06-15(月)〜06-21(日)。利用者: 火(am)・金(pm)・水(am+pm)
const pat = [
  { day: 2, unit: 'am' }, { day: 5, unit: 'pm' }, { day: 3, unit: 'am' }, { day: 3, unit: 'pm' }
];
eqJson(gnbWeekAbsenceSlots(pat, '2026-06-17'),
  [ { date: '2026-06-17', unit: '午前' }, { date: '2026-06-17', unit: '午後' }, { date: '2026-06-19', unit: '午後' } ],
  '水基準: 当日水am/pm＋金pm・過去火は除外');
eqJson(gnbWeekAbsenceSlots(pat, '2026-06-18'),
  [ { date: '2026-06-19', unit: '午後' } ], '木基準: 金pmのみ（水は過去）');
eqJson(gnbWeekAbsenceSlots(pat, '2026-06-21'), [], '日基準: 残り通所日なし→空');

// normalizeSlots: 重複排除＋昇順、am/pm表記正規化、同日am先
eqJson(gnbNormalizeSlots([
    { date: '2026-06-19', unit: 'pm' }, { date: '2026-06-17', unit: 'am' }, { date: '2026-06-17', unit: 'am' }
  ]),
  [ { date: '2026-06-17', unit: '午前' }, { date: '2026-06-19', unit: '午後' } ],
  'normalize: 重複排除＋昇順＋am/pm正規化');
eqJson(gnbNormalizeSlots([ { date: '2026-06-17', unit: '午後' }, { date: '2026-06-17', unit: '午前' } ]),
  [ { date: '2026-06-17', unit: '午前' }, { date: '2026-06-17', unit: '午後' } ], 'normalize: 同日am先');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
