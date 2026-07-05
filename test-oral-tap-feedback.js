// タップ反応（hover/active/pointer/常時ヒント）の検証。
// CSS規則の存在（string）＋ タップ可否がセレクタで正しく区別されるか（jsdom .matches）。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, 'oral-plan.html'), 'utf8');

function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '('); let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}
let nowY = 2026, nowM = 7, state = { records: {} };
const isPending = () => false;
const oralCycleAt = eval('(' + extractFn(html, 'oralCycleAt') + ')');
const escapeAttr = eval('(' + extractFn(html, 'escapeAttr') + ')');
const escapeHtml = eval('(' + extractFn(html, 'escapeHtml') + ')');
const formatMD = eval('(' + extractFn(html, 'formatMD') + ')');
const cellChip = eval('(' + extractFn(html, 'cellChip') + ')');
const renderMonthCell = eval('(' + extractFn(html, 'renderMonthCell') + ')');

let pass = 0, fail = 0;
const assert = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n); } };
const has = s => html.indexOf(s) >= 0;

// 1) CSS規則の存在
assert('CSS: .setsume-box:hover', has('.setsume-box:hover'));
assert('CSS: .setsume-box:active', has('.setsume-box:active'));
assert('CSS: .check-cell:not(.disabled):hover', has('.check-cell:not(.disabled):hover'));
assert('CSS: .check-cell:not(.disabled):active', has('.check-cell:not(.disabled):active'));
assert('CSS: @media (hover: hover) でhover隔離', /@media\s*\(hover:\s*hover\)/.test(html));
assert('CSS: -webkit-tap-highlight-color（touch配慮）', has('-webkit-tap-highlight-color'));
assert('CSS: .tap-chip 反応', has('.tap-chip'));

// 2) タップ可否がクラスで区別される
const setsumeTd = renderMonthCell({ userId: 'A', name: 'A', isTarget: true, planStart: '2026-05', planEnd: '' }, { year: 2026, month: 7 }); // setsume
const moniTd = renderMonthCell({ userId: 'B', name: 'B', isTarget: true, planStart: '2026-06', planEnd: '' }, { year: 2026, month: 7 }); // moni2
const disabledTd = renderMonthCell({ userId: 'C', name: 'C', isTarget: true, planStart: '2027-01', planEnd: '' }, { year: 2026, month: 4 }); // none→disabled
const q = frag => new JSDOM('<table><tr>' + frag + '</tr></table>').window.document;

const box = q(setsumeTd).querySelector('.setsume-box');
assert('結果/計画枠が .setsume-box にマッチ（反応対象）', !!box && box.matches('.setsume-box'));
const mtd = q(moniTd).querySelector('td');
assert('モニ日付セルが .check-cell:not(.disabled) にマッチ（反応対象）', mtd.matches('.check-cell:not(.disabled)'));
const dtd = q(disabledTd).querySelector('td');
assert('- セル（押せない）は .check-cell.disabled（反応対象外）', dtd.matches('.check-cell.disabled') && !dtd.matches('.check-cell:not(.disabled)'));

// 3) 常時ヒント: 押せる枠は cursor:pointer
assert('setsume枠は cursor:pointer', /cursor\s*:\s*pointer/.test(box.getAttribute('style') || ''));

console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
