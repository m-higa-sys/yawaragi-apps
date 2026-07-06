// 今月の締め担当: ローテ自動算出(2026-07=髙山起点)＋手動上書き優先＋看護師3名のみ。
// ★本物の closeAssigneeAuto / closeAssigneeIsManual / closeAssigneeFor を oral-plan.html から抽出実行。
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'oral-plan.html'), 'utf8');
function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '('); let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}
// 依存（本物のconstと同値を harness に用意）
const NURSE_NAMES = ['髙山', '春山', '石井'];
const CLOSE_ANCHOR_TOTAL = 2026 * 12 + (7 - 1);
let state = { closeAssignees: {} };
const closeAssigneeAuto = eval('(' + extractFn(html, 'closeAssigneeAuto') + ')');
const closeAssigneeIsManual = eval('(' + extractFn(html, 'closeAssigneeIsManual') + ')');
const closeAssigneeFor = eval('(' + extractFn(html, 'closeAssigneeFor') + ')');

let pass = 0, fail = 0;
const eq = (name, got, exp) => { if (got === exp) { pass++; console.log('  PASS', name, '=', got); } else { fail++; console.log('  FAIL', name, 'got', got, 'exp', exp); } };

// 1) 自動ローテ（2026-07=髙山起点・髙山→春山→石井）
state.closeAssignees = {};
eq('2026-07 自動', closeAssigneeAuto('2026-07'), '髙山');
eq('2026-08 自動', closeAssigneeAuto('2026-08'), '春山');
eq('2026-09 自動', closeAssigneeAuto('2026-09'), '石井');
eq('2026-10 自動', closeAssigneeAuto('2026-10'), '髙山');
eq('2026-06 自動(前月)', closeAssigneeAuto('2026-06'), '石井');   // 起点1つ前は石井
eq('2027-07 自動(1年後)', closeAssigneeAuto('2027-07'), '髙山');  // 12ヶ月後=同じ

// 2) 手動上書きが自動より優先
state.closeAssignees = { '2026-08': '石井' };  // 自動は春山だが手動=石井
eq('2026-08 手動優先', closeAssigneeFor('2026-08'), '石井');
eq('2026-08 手動フラグ', String(closeAssigneeIsManual('2026-08')), 'true');
eq('2026-07 手動なし→自動', closeAssigneeFor('2026-07'), '髙山');

// 3) 看護師3名以外の手動値は無効→自動へフォールバック
state.closeAssignees = { '2026-09': '外部さん' };
eq('不正手動値は自動へ', closeAssigneeFor('2026-09'), '石井');   // 自動2026-09=石井
eq('不正手動値は手動扱いしない', String(closeAssigneeIsManual('2026-09')), 'false');

// 4) 不正YMは既定(髙山)へ
state.closeAssignees = {};
eq('不正YM→NURSE_NAMES[0]', closeAssigneeAuto(''), '髙山');

// 5) 選択母集団＝看護師3名のみ（built html の NURSE_NAMES）
const nm = html.match(/const NURSE_NAMES = (\[[^\]]*\])/);
const names = nm ? JSON.parse(nm[1].replace(/'/g, '"')) : [];
eq('NURSE_NAMES 3名', names.join(','), '髙山,春山,石井');

console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
