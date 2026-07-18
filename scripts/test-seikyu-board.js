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
  extractFn('sbResolveColumns') +
  extractFn('sbIsSubtotalRow') +
  extractFn('sbNormalize') +
  extractFn('sbExtractRows') +
  '\nsb.parseLine = sbParseLine; sb.decode = sbDecode; sb.toRows = sbToRows; sb.resolve = sbResolveColumns;'
  + ' sb.isSub = sbIsSubtotalRow; sb.normalize = sbNormalize; sb.extract = sbExtractRows;'
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

// ===== C. sbResolveColumns（位置でなく列名一致）=====
const header5 = rows5[1];
const col5 = sb.resolve(header5);
ok(header5[col5.hken] === '被保険者番号', 'C1: hken 列を名前で解決');
ok(header5[col5.riyou] === '利用者請求額総額（3+4-5+6+7+8-9）', 'C2: 利用者請求額 列を解決');
ok(header5[col5.jihi1] === '7保険外サービス費（税抜）', 'C3: 自費税抜 列を解決');
ok(header5[col5.jihi2] === '8保険外サービス費（消費税額）', 'C4: 自費消費税 列を解決');
ok(header5[col5.nyukin] === '入金状況', 'C5: 入金状況 列を解決');
let threw = false;
try { sb.resolve(['関係ない列', 'ダミー']); } catch (e) { threw = true; }
ok(threw, 'C6: 必須列が無ければ例外（黙って壊れない）');

// ===== D. sbIsSubtotalRow（値ベース）=====
ok(sb.isSub('総額') === true, 'D1: 総額→除外');
ok(sb.isSub('保険外のみ') === true, 'D2: 保険外のみ→除外');
ok(sb.isSub('') === true, 'D3: 空→除外');
ok(sb.isSub(' 総額 ') === true, 'D4: 前後空白trimして判定');
ok(sb.isSub('利用者001') === false, 'D5: 個人名→残す');

// ===== E. sbExtractRows（5月フィクスチャ：個人116・小計除外9・自費合算）=====
const recs5 = sb.extract(rows5);
ok(recs5.length === 116, 'E1: 5月 個人行116（総額/保険外のみ/空の9行を値ベース除外）');
ok(recs5.every(r => r.name), 'E2: 全個人行に氏名（被保険者番号は保険外のみ客で空になり得るため必須にしない）');
const withJihi = recs5.find(r => r.jihi > 0);
ok(!!withJihi && typeof withJihi.riyou === 'number', 'E3: riyou は数値・jihi は税抜+消費税の合算');

// ===== F. sbNormalize（境界の数値化）=====
const colF = sb.resolve(rows5[1]);
const fakeRow = []; fakeRow[colF.tsuki]='202605'; fakeRow[colF.hken]='9000000001';
fakeRow[colF.name]='利用者001'; fakeRow[colF.riyou]='2,920'; fakeRow[colF.jihi1]='120';
fakeRow[colF.jihi2]='0'; fakeRow[colF.pay]='口座振替'; fakeRow[colF.nyukin]='未入金';
const nrec = sb.normalize(fakeRow, colF);
ok(nrec.riyou === 2920, 'F1: "2,920"→2920（カンマ除去して数値化）');
ok(nrec.jihi === 120, 'F2: jihi=税抜120+消費税0=120');
ok(nrec.nyukin === '未入金', 'F3: 入金状況を保持');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
