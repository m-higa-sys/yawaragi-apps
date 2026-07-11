// 伝達ボード既読 純関数の実コード抽出テスト
// 対象: dengonComputeRecipients_ / dengonAddReadBy_ / dengonRemoveReadBy_ / dengonIsAllRead_
// 実行: node scripts/test-genba-dengon-kidoku.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name;
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('genba.html に ' + sig + ' が無い（未実装＝RED）');
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
  extractFn('dengonComputeRecipients_') + '\n' +
  extractFn('dengonAddReadBy_') + '\n' +
  extractFn('dengonRemoveReadBy_') + '\n' +
  extractFn('dengonIsAllRead_') + '\n' +
  'sb.computeRecipients = dengonComputeRecipients_;' +
  'sb.add = dengonAddReadBy_; sb.remove = dengonRemoveReadBy_; sb.isAllRead = dengonIsAllRead_;'
)(sb);

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }

const MASTER = [
  { name: '比嘉', role: '代表', employ: '−', active: true },
  { name: '勝又', role: '相談員', employ: '社員', active: true },
  { name: '星野', role: '介護', employ: '社員', active: true },
  { name: '下浦', role: '相談員', employ: 'パート', active: true },
  { name: '工藤', role: '相談員', employ: 'パート', active: true },
  { name: '髙山', role: '看護師', employ: 'パート', active: true },
  { name: '石井', role: '看護師', employ: 'パート', active: true },
  { name: '春山', role: '看護師', employ: 'パート', active: true },
  { name: '大久保', role: '介護', employ: 'パート', active: true },
  { name: '小野', role: 'ドライバー', employ: 'パート', active: true },
  { name: '林', role: 'ドライバー', employ: 'パート', active: true }
];
const cr = sb.computeRecipients;

// ===== A1: computeRecipients（分母＝指示書の実測対象）=====
ok(cr(MASTER, '全員').length === 11, 'A1-全員=11');
ok(cr(MASTER, '全員・ドライバー除く').length === 9, 'A1-ドライバー除く=9');
ok(cr(MASTER, '社員').length === 2, 'A1-社員=2');
ok(cr(MASTER, '相談員').length === 3, 'A1-相談員=3');
ok(cr(MASTER, '看護師').length === 3, 'A1-看護師=3');
// 比嘉の包含/除外
ok(cr(MASTER, '全員').indexOf('比嘉') !== -1, 'A1-比嘉は全員に入る');
ok(cr(MASTER, '全員・ドライバー除く').indexOf('比嘉') !== -1, 'A1-比嘉はドライバー除くに入る');
ok(cr(MASTER, '社員').indexOf('比嘉') === -1, 'A1-比嘉は社員に入らない');
ok(cr(MASTER, '相談員').indexOf('比嘉') === -1, 'A1-比嘉は相談員に入らない');
ok(cr(MASTER, '看護師').indexOf('比嘉') === -1, 'A1-比嘉は看護師に入らない');
// ドライバー除外の中身
ok(cr(MASTER, '全員・ドライバー除く').indexOf('小野') === -1, 'A1-小野は除外');
ok(cr(MASTER, '全員・ドライバー除く').indexOf('林') === -1, 'A1-林は除外');
// 在籍=false の除外
const M2 = MASTER.map(m => m.name === '石井' ? Object.assign({}, m, { active: false }) : m);
ok(cr(M2, '看護師').length === 2, 'A1-非在籍(石井)は看護師から除外');
ok(cr(M2, '全員').length === 10, 'A1-非在籍は全員からも除外');
// 個人宛て/未知グループ → []
ok(Array.isArray(cr(MASTER, '工藤')) && cr(MASTER, '工藤').length === 0, 'A1-個人名グループは空配列');
ok(cr(null, '全員').length === 0, 'A1-master不正は空配列');

// ===== A2: addReadBy / removeReadBy（冪等・非破壊）=====
const base = ['髙山', '石井'];
ok(sb.add(base, '春山').length === 3, 'A2-add新規で+1');
ok(sb.add(base, '髙山').length === 2, 'A2-add既存は冪等');
ok(base.length === 2, 'A2-add非破壊（元配列不変）');
ok(sb.add([], '工藤')[0] === '工藤', 'A2-空配列にadd');
ok(sb.add(null, '林').length === 1, 'A2-null許容');
ok(sb.remove(['髙山', '石井'], '髙山').length === 1, 'A2-remove存在で-1');
ok(sb.remove(['髙山', '石井'], '春山').length === 2, 'A2-remove非存在は不変');
ok(sb.remove(null, '林').length === 0, 'A2-null許容');
const b2 = ['髙山', '石井'];
sb.remove(b2, '髙山');
ok(b2.length === 2, 'A2-remove非破壊（元配列不変）');

// ===== A3: isAllRead（recipients と readBy のみで判定・不変条件2）=====
const rc = ['髙山', '石井', '春山'];
ok(sb.isAllRead(rc, ['髙山', '石井', '春山']) === true, 'A3-全員既読でtrue');
ok(sb.isAllRead(rc, ['髙山', '石井']) === false, 'A3-1名未読でfalse');
ok(sb.isAllRead(rc, ['髙山', '石井', '春山', '工藤']) === true, 'A3-readBy余剰でもtrue');
ok(sb.isAllRead([], ['髙山']) === false, 'A3-recipients空はfalse（個人宛て等）');
ok(sb.isAllRead(rc, []) === false, 'A3-readBy空はfalse');
ok(sb.isAllRead(rc, null) === false, 'A3-readBy null許容false');

console.log('dengon-kidoku core: ' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
