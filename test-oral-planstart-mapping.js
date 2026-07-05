// 回帰テスト: loadFiscalYearData の state.users / state.cancelledUsers マッピングが
// GAS の planStart / planEnd を落とさず反映すること。
// ★再実装ではなく _oral-plan-body.html の実際の .map() アロー本体を抽出して実行する。
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '_oral-plan-body.html'), 'utf8');

// (r1.users || []).map(u => ({ ... })) / (r1.cancelledUsers || []).map(...) のアロー本体を取り出す
function extractMapArrow(varExpr) {
  const esc = varExpr.replace(/[.]/g, '\\.');
  const re = new RegExp('\\(' + esc + '\\s*\\|\\|\\s*\\[\\]\\)\\.map\\((u\\s*=>\\s*\\(\\{[\\s\\S]*?\\}\\))\\)');
  const m = src.match(re);
  if (!m) throw new Error('map arrow not found for ' + varExpr);
  return m[1];
}

let pass = 0, fail = 0;
const assert = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

// GAS getOralPlansYear が返す1件（planStart/planEnd 有り）
const gasUser = {
  userId: '照合太郎', name: '照合太郎', furigana: 'ショウゴウタロウ',
  category: '要支援２', cmOffice: 'X包括', isTarget: true, startedAt: '2026-06-01',
  evalAnchor: '', planStart: '2026-05', planEnd: '', cancelled: false,
  riyouStart: '', sendMethod: 'PDF'
};

['r1.users', 'r1.cancelledUsers'].forEach(v => {
  const arrow = extractMapArrow(v);
  const mapFn = eval('(' + arrow + ')');
  const out = mapFn(gasUser);
  assert(v + ' → planStart を反映する', out.planStart === '2026-05');
  assert(v + ' → planEnd を反映する', out.planEnd === '');
});

console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
