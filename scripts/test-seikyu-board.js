// seikyu-board 純関数テスト（実コード抽出方式・test-furikae-tracker.js と同流儀）
// 実行: node scripts/test-seikyu-board.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'seikyu-board.html'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name;
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('seikyu-board.html に ' + sig + ' が無い（未実装＝RED）');
  let depth = 0;
  for (let j = html.indexOf('{', start); j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

const sb = {};
new Function('sb',
  extractFn('sbParseLine') +
  '\nsb.parseLine = sbParseLine;'
)(sb);

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eqArr(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ===== A. sbParseLine（引用符・カンマ・二重引用符）=====
ok(eqArr(sb.parseLine('a,b,c'), ['a', 'b', 'c']), 'A1: 単純3列');
ok(eqArr(sb.parseLine('"x,y",z'), ['x,y', 'z']), 'A2: 引用符内カンマ');
ok(eqArr(sb.parseLine('"a""b",c'), ['a"b', 'c']), 'A3: 二重引用符エスケープ');
ok(eqArr(sb.parseLine('a,,c'), ['a', '', 'c']), 'A4: 空フィールド');
ok(eqArr(sb.parseLine(''), ['']), 'A5: 空行→[""]');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
