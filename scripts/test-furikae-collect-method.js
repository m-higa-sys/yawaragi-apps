// furikae 回収方法ピッカーの選択肢テスト（2026-08-02）
// 背景: 社長は現金を扱わない一方、利用中止者の最終集金は振込回収になる。
//       「現金」は死にボタン・「振込」が無いという実態との不一致を解消する。
// 対象: fnkMarkCollected（表示ラベルと fnkConfirmCollected へ渡す保存値の両方）
// 実行: node scripts/test-furikae-collect-method.js

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'furikae.html'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name;
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('furikae.html に ' + sig + ' が無い（未実装＝RED）');
  let i = html.indexOf('{', start), d = 0;
  for (let j = i; j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}') { d--; if (d === 0) return html.slice(start, j + 1); } }
  throw new Error(name + ' 閉じ括弧なし');
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }

// 最小DOMスタブ（jsdom不要）。innerHTML を受け取るだけの器を返す。
const box = { innerHTML: '' };
const sb = {};
new Function('sb', 'document',
  extractFn('fnkMarkCollected') + '\nsb.fnkMarkCollected=fnkMarkCollected;'
)(sb, { getElementById: function (id) { return id === 'fnk-act-7' ? box : null; } });

sb.fnkMarkCollected(7);
const out = box.innerHTML;

console.log('[回収方法ピッカー]');
ok(out.indexOf('>振込<') >= 0, '「振込」ボタンが出る（中止者の振込回収を消し込める）');
ok(out.indexOf("fnkConfirmCollected(7, '振込')") >= 0, '保存値も「振込」（フッタ表示と食い違わない）');
ok(out.indexOf('現金') < 0, '「現金」は出ない（社長は現金を扱わない）');
ok(out.indexOf('>口座変更<') >= 0, '「口座変更」は据え置き');
ok(out.indexOf('>翌月合算<') >= 0, '「翌月合算」は据え置き（自動消込が書く値と同一）');
ok(out.indexOf('>その他<') >= 0, '「その他」は据え置き');

// 存在しない要素IDでも落ちない（既存のガード維持）
let threw = false;
try { sb.fnkMarkCollected(999); } catch (e) { threw = true; }
ok(!threw, '対象カードが無いときは何もせず戻る');

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
