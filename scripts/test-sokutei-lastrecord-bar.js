// test-sokutei-lastrecord-bar.js
// 「直前に ○○ さんとして記録しました」が一定時間で自動的に消えることの検証。
//
// 背景（2026-07-30 社長指示）:
//   今日ここで潰したのは「前の人の名前が残る」問題。表示だけ同じ誤解を生むなら直した意味が薄まる。
//   朝9時の記録が11時まで残っていて、別の人が「いま自分の名前」と読む余地は消す。
//   「記録できた」ことが伝わればそれで役目は終わりなので、10秒程度で消える。
//
// ★タイマーが残って別の描画に影響しないこと（連続記録で二重に走らないこと）を必ず見る。
//
// 実行: node scripts/test-sokutei-lastrecord-bar.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'sokutei.html'), 'utf8');

function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('function ' + name + ' が無い（未実装＝RED）');
  const b = src.indexOf('{', s); let d = 0, i = b;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}
function extractDecl(src, name) {
  const re = new RegExp('(?:let|var|const)\\s+' + name + '\\s*=\\s*[^;]+;');
  const m = src.match(re);
  if (!m) throw new Error('宣言 ' + name + ' が無い（未実装＝RED）');
  return m[0];
}

// ---- DOM とタイマーのスタブ ----
const timers = [];
let seq = 0;
const bar = {
  className: 'opbar', style: { display: 'none' },
  _txt: { _t: '', set textContent(v) { this._t = String(v); }, get textContent() { return this._t; } },
  querySelector(sel) { return sel === '.opbar-text' ? this._txt : null; }
};
const sandbox = {
  console, String, Number, Object, Array, Math, JSON, parseInt, RegExp,
  document: { getElementById: id => (id === 'opbar' ? bar : null) },
  setTimeout: (fn, ms) => { const id = ++seq; timers.push({ id, fn, ms, cleared: false, fired: false }); return id; },
  clearTimeout: id => { const t = timers.find(t => t.id === id); if (t) t.cleared = true; }
};
vm.createContext(sandbox);
vm.runInContext(extractDecl(html, 'OPBAR_MS'), sandbox);
vm.runInContext(extractDecl(html, 'opbarTimer'), sandbox);
vm.runInContext(extractDecl(html, 'opbarSeq'), sandbox);
vm.runInContext(extractFn(html, 'renderOperatorBar'), sandbox);
const OPBAR_MS = vm.runInContext('OPBAR_MS', sandbox);
const show = n => vm.runInContext('renderOperatorBar(' + JSON.stringify(n) + ')', sandbox);
const pending = () => timers.filter(t => !t.cleared && !t.fired);
function fire(t) { t.fired = true; t.fn(); }

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A === E) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n    actual  =' + A + '\n    expected=' + E); }
}
function sec(t) { console.log('\n[' + t + ']'); }

sec('0. 消えるまでの時間');
eq(typeof OPBAR_MS, 'number', 'OPBAR_MS は数値');
eq(OPBAR_MS > 0 && OPBAR_MS <= 30000, true, '0より大きく30秒以内（社長指示: 10秒程度・短くてよい）');

sec('1. 記録直後は出ている');
show('ダミー甲');
eq(bar.style.display, '', '表示されている');
eq(bar.querySelector('.opbar-text').textContent, '直前に ダミー甲 さんとして記録しました', '文言が正しい');
eq(bar.className, 'opbar', '警告色にはしない');
eq(pending().length, 1, '消すためのタイマーが1本だけ動いている');
eq(pending()[0].ms, OPBAR_MS, 'タイマーは OPBAR_MS で仕掛けられている');

sec('2. 時間経過後は消えている');
fire(pending()[0]);
eq(bar.style.display, 'none', '非表示に戻る');
eq(bar.querySelector('.opbar-text').textContent, '', '文言も消える');
eq(pending().length, 0, '発火後にタイマーが残らない');

sec('3. 連続で2件記録したとき、1件目のタイマーが干渉しない');
{
  timers.length = 0;
  show('ダミー甲');                       // 1件目
  const first = pending()[0];
  eq(pending().length, 1, '1件目でタイマー1本');
  show('ダミー乙');                       // 2件目（1件目の10秒が来る前に）
  eq(bar.querySelector('.opbar-text').textContent, '直前に ダミー乙 さんとして記録しました',
    '2件目の名前に置き換わる');
  eq(bar.style.display, '', '2件目も表示されている');
  eq(first.cleared, true, '★1件目のタイマーは捨てられている');
  eq(pending().length, 1, '★動いているタイマーは1本だけ（二重に走らない）');

  // 1件目のタイマーが（仮に生きていても）2件目の表示を消さないこと
  const before = bar.querySelector('.opbar-text').textContent;
  first.fn();                              // 捨てたはずのタイマーを無理に発火させてみる
  eq(bar.querySelector('.opbar-text').textContent, before,
    '★捨てたタイマーが暴発しても2件目の表示は消えない');
  eq(bar.style.display, '', '2件目は表示されたまま');

  // 2件目のタイマーが来たら消える
  const second = pending()[0];
  fire(second);
  eq(bar.style.display, 'none', '2件目のタイマーで消える');
  eq(pending().length, 0, 'タイマーは残らない');
}

sec('4. 空で呼ぶと即座に消え、タイマーも残さない');
{
  timers.length = 0;
  show('ダミー甲');
  const t = pending()[0];
  show('');
  eq(bar.style.display, 'none', '空で呼べば消える');
  eq(t.cleared, true, '仕掛かりのタイマーも捨てる');
  eq(pending().length, 0, '新しいタイマーは作らない');
}

sec('5. 記録後に必ず呼ばれる配線になっているか');
{
  const body = extractFn(html, 'submitRecord');
  eq(body.indexOf('renderOperatorBar(') >= 0, true, 'submitRecord が表示を出している');
  eq(/renderOperatorBar\(\s*by\s*\)/.test(body), true, '出すのは記録に使った測定者名');
}

console.log('\n==== ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + ' / ' + (pass + fail) + ' ====');
process.exit(fail ? 1 : 0);
