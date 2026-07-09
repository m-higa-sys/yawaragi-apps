// test-sched-renrakuzumi.js
// gas/gas_出勤送迎表.gs の送迎連絡 純関数を実コード抽出して node で検証。
// 実行: node scripts/test-sched-renrakuzumi.js
const fs = require('fs');
const path = require('path');
const SRC_PATH = path.join(__dirname, '..', 'gas', 'gas_出勤送迎表.gs');
const src = fs.readFileSync(SRC_PATH, 'utf8');

function extractFn(name) {
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
  if (start < 0) throw new Error('gas に function ' + name + ' が無い（未実装＝RED）');
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

const sandbox = {};
const code = extractFn('schedContactLatest') + '\n' + extractFn('schedContactColor') + '\n' + extractFn('schedContactShouldSkip') + '\n' + extractFn('resolveOldTime')
  + '\nsandbox.schedContactLatest = schedContactLatest; sandbox.schedContactColor = schedContactColor; sandbox.schedContactShouldSkip = schedContactShouldSkip; sandbox.resolveOldTime = resolveOldTime;';
(function () { eval(code); })();
const { schedContactLatest, schedContactColor, schedContactShouldSkip, resolveOldTime } = sandbox;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n    期待: ' + e + '\n    実際: ' + a); }
}

console.log('# schedContactLatest');
// 同一キーは記録日時が新しい行が勝つ
eq(schedContactLatest([
  { recordedAt: '2026-07-10 08:40:00', date: '2026-07-15', user: '山田花子', status: '要連絡' },
  { recordedAt: '2026-07-10 08:42:05', date: '2026-07-15', user: '山田花子', status: '連絡済み' },
])['2026-07-15|山田花子'].status, '連絡済み', '最新行が勝つ');
// 別キーは混ざらない
eq(Object.keys(schedContactLatest([
  { recordedAt: '2026-07-10 08:40:00', date: '2026-07-15', user: '山田花子', status: '要連絡' },
  { recordedAt: '2026-07-10 08:40:00', date: '2026-07-16', user: '山田花子', status: '要連絡' },
])).sort(), ['2026-07-15|山田花子', '2026-07-16|山田花子'], '別適用日は別キー');
// 空・不正行は無視
eq(schedContactLatest([null, { recordedAt: '1', date: '', user: 'x' }, { recordedAt: '2', date: '2026-07-15', user: '' }]), {}, '不正行は無視');
eq(schedContactLatest(null), {}, 'null 入力で空オブジェクト');

console.log('\n# schedContactColor');
eq(schedContactColor(false, null), 'normal', '変更色OFF→通常');
eq(schedContactColor(false, '連絡済み'), 'normal', '色OFFは連絡済みでも通常（変更表示しない）');
eq(schedContactColor(true, null), 'need', '色ON・台帳なし→要連絡A');
eq(schedContactColor(true, '要連絡'), 'need', '色ON・要連絡→A');
eq(schedContactColor(true, '連絡済み'), 'done', '色ON・連絡済み→B');
eq(schedContactColor(true, '通常化'), 'need', '色再ON・旧通常化→A（新しい変更）');

console.log('\n# schedContactShouldSkip');
eq(schedContactShouldSkip('連絡済み'), true, '最新が連絡済み→追記スキップ');
eq(schedContactShouldSkip('要連絡'), false, '要連絡→追記する');
eq(schedContactShouldSkip('通常化'), false, '通常化→追記する');
eq(schedContactShouldSkip(null), false, '台帳なし→追記する');

console.log('\n# resolveOldTime');
eq(resolveOldTime('09:10', '09:00'), '09:10', '直前override優先');
eq(resolveOldTime('', '09:00'), '09:00', 'overrideなし→曜日ベース');
eq(resolveOldTime(null, null), '', '両方なし→空欄');
eq(resolveOldTime(undefined, '09:00'), '09:00', 'undefinedは曜日ベースへ');

console.log('\n結果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
