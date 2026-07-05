// 節目マス（結果報告書｜計画書）の描画テスト。
// ★本物の renderMonthCell / cellChip / oralCycleAt を oral-plan.html から抽出して実行し、
//   出力HTMLを jsdom でパースして構造（横並び・順序・「節目」語の不在）を実測する。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, 'oral-plan.html'), 'utf8');

// function NAME(...) { ... } を波括弧カウントで正確に切り出す
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('fn not found: ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// 依存をこのスコープに用意（renderMonthCell/cellChip がクロージャで参照）
let nowY = 2026, nowM = 7;
let state = { records: {} };
const isPending = () => false;
const oralCycleAt = eval('(' + extractFn(html, 'oralCycleAt') + ')');
const escapeAttr = eval('(' + extractFn(html, 'escapeAttr') + ')');
const escapeHtml = eval('(' + extractFn(html, 'escapeHtml') + ')');
const formatMD = eval('(' + extractFn(html, 'formatMD') + ')');
const cellChip = eval('(' + extractFn(html, 'cellChip') + ')');
const renderMonthCell = eval('(' + extractFn(html, 'renderMonthCell') + ')');

// planStart=2026-05 → 当月2026-07 が setsume（結果報告書＋計画書の月）
const u = { userId: '照合太郎', name: '照合太郎', isTarget: true, planStart: '2026-05', planEnd: '' };
const tdHtml = renderMonthCell(u, { year: 2026, month: 7 });

const dom = new JSDOM('<table><tr>' + tdHtml + '</tr></table>');
const doc = dom.window.document;
const cell = doc.querySelector('td');
const houkoku = doc.querySelector('[data-field="houkoku_date"]');
const keikaku = doc.querySelector('[data-field="plan_date"]');

let pass = 0, fail = 0;
const assert = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

assert('節目マスに結果報告書枠がある', !!houkoku);
assert('節目マスに計画書枠がある', !!keikaku);
assert('「節目」の語が描画に無い', cell && cell.textContent.indexOf('節目') === -1);
assert('結果報告書が計画書より前(DOM順)', houkoku && keikaku &&
  (houkoku.compareDocumentPosition(keikaku) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
// 横並び: 2枠が同一の flex 親に入っている
const hp = houkoku && houkoku.parentElement, kp = keikaku && keikaku.parentElement;
const sameFlex = hp && kp && hp === kp && /display\s*:\s*flex/.test(hp.getAttribute('style') || '');
assert('結果｜計画 が同一 flex 親で横並び', !!sameFlex);
// ★独立した幅広マス: 各枠が境界線(border)を持ち、単独タップ(onDateCheck)で書込経路に入る
const hasBorder = el => /border\s*:/.test(el.getAttribute('style') || '');
const isTap = el => (el.getAttribute('onclick') || '').indexOf('onDateCheck') >= 0;
assert('結果枠が独立マス(border)', houkoku && hasBorder(houkoku));
assert('計画枠が独立マス(border)', keikaku && hasBorder(keikaku));
assert('結果枠が単独タップ(onDateCheck)', houkoku && isTap(houkoku));
assert('計画枠が単独タップ(onDateCheck)', keikaku && isTap(keikaku));
assert('各枠が flex:1 で均等幅', houkoku && keikaku &&
  /flex\s*:\s*1/.test(houkoku.getAttribute('style') || '') && /flex\s*:\s*1/.test(keikaku.getAttribute('style') || ''));

console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
