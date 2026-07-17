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
  extractFn('sbDecode') +
  extractFn('sbToRows') +
  '\nsb.parseLine = sbParseLine; sb.decode = sbDecode; sb.toRows = sbToRows;'
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

// ===== B. sbDecode（SJIS）＋ sbToRows（メタ行/ヘッダ行を含む全行）=====
const fx5 = fs.readFileSync(path.join(__dirname, 'fixtures', 'seikyu', 'fixture-2026-05.csv'));
const txt5 = sb.decode(fx5);
ok(txt5.indexOf('被保険者番号') >= 0, 'B1: SJISフィクスチャがデコードできヘッダ語を含む');
ok(txt5.indexOf('�') === -1 && /利用者/.test(txt5), 'B2: 文字化け(U+FFFD)なくデコード・仮名を含む');
const rows5 = sb.toRows(txt5);
ok(rows5[1][0] === '事業所名', 'B3: rows[1] が本ヘッダ行（先頭=事業所名）');
ok(Array.isArray(rows5[0]) && rows5.length > 100, 'B4: 全行が2次元配列で得られる');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
