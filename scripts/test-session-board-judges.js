// scripts/test-session-board-judges.js
// Drift-guard + behavioral matrix for session-board's ported judge functions.
// Ensures gas/yawaragi-board/session-board-judges.js (GAS-executable) stays byte-identical
// to the canonical sources: shared.js#isHyoukaMonth / oral-plan.html#oralCycleAt.

const path = require('path');
const fs = require('fs');
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) { i++; break; } } }
  return src.slice(start, i);
}
const sharedSrc = fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8');
const oralSrc = fs.readFileSync(path.join(__dirname, '..', 'oral-plan.html'), 'utf8');
const judgesSrc = fs.readFileSync(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-judges.js'), 'utf8');

const canonHyouka = extractFn(sharedSrc, 'isHyoukaMonth');
const canonOral = extractFn(oralSrc, 'oralCycleAt');
const portedHyouka = extractFn(judgesSrc, 'isHyoukaMonth');
const portedOral = extractFn(judgesSrc, 'oralCycleAt');
const judges = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-judges.js'));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }

// --- Byte-identity drift guard ---
if (portedHyouka !== canonHyouka) {
  console.error('  [DIFF] isHyoukaMonth length: canon=' + canonHyouka.length + ' ported=' + portedHyouka.length);
}
ok(portedHyouka === canonHyouka, 'DG1: isHyoukaMonth 移植がshared.jsとbyte一致（driftなし）');

if (portedOral !== canonOral) {
  console.error('  [DIFF] oralCycleAt length: canon=' + canonOral.length + ' ported=' + portedOral.length);
}
ok(portedOral === canonOral, 'DG2: oralCycleAt 移植がoral-plan.htmlとbyte一致（driftなし）');

// --- Behavioral matrix ---
const canonHyoukaFn = new Function(canonHyouka + '; return isHyoukaMonth;')();
const canonOralFn = new Function(canonOral + '; return oralCycleAt;')();

const hyoukaPlanStarts = ['2026-04', '2026-08', '2026-12'];
const hyoukaPlanMonthsList = [3, 1, 6];
hyoukaPlanStarts.forEach(function (planStart) {
  hyoukaPlanMonthsList.forEach(function (planMonths) {
    for (let month = 1; month <= 12; month++) {
      const a = judges.isHyoukaMonth(planStart, planMonths, 2026, month);
      const b = canonHyoukaFn(planStart, planMonths, 2026, month);
      ok(a === b, 'BM-hyouka: planStart=' + planStart + ' planMonths=' + planMonths + ' 2026-' + month + ' => ' + a + ' vs ' + b);
    }
  });
});

const oralPlanStarts = ['2026-07', '2026-04'];
const oralPlanEnds = ['', '2026-06', '2027-03'];
oralPlanStarts.forEach(function (planStart) {
  oralPlanEnds.forEach(function (planEnd) {
    for (let month = 1; month <= 12; month++) {
      const a = JSON.stringify(judges.oralCycleAt(planStart, planEnd, 2026, month));
      const b = JSON.stringify(canonOralFn(planStart, planEnd, 2026, month));
      ok(a === b, 'BM-oral: planStart=' + planStart + ' planEnd=' + JSON.stringify(planEnd) + ' 2026-' + month + ' => ' + a + ' vs ' + b);
    }
  });
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
