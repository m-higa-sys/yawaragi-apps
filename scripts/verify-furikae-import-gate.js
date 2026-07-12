// 取込ゾーン表示分け(B3)の DOM挙動を jsdom で実測（鍵あり=表示／鍵なし=非表示・.controlsは常に表示）。
// 実行: node scripts/verify-furikae-import-gate.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'furikae.html'), 'utf8');

// fnkApplyImportGate / fnkShouldShowImport を実コードから抽出（改変せず本物を使う）
function extractFn(name) {
  const sig = 'function ' + name;
  const s = html.indexOf(sig);
  let i = html.indexOf('{', s), d = 0;
  for (let j = i; j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}') { d--; if (d === 0) return html.slice(s, j + 1); } }
}
const gateSrc = extractFn('fnkShouldShowImport') + '\n' + extractFn('fnkApplyImportGate');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }

function run(hasKey) {
  // 実DOM（取込ゾーン+表示月+カード域）を最小構成で用意
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <div class="drop-zone no-print" id="dropZone" onclick="x()"><p>📂 取込</p>
      <input type="file" id="excelFileInput"></div>
    <div class="import-result" id="importResult"></div>
    <div class="controls no-print"><label>表示月：</label><select id="monthSelect"></select></div>
    <div id="summaryCards"></div>
  </body>`, { url: 'https://m-higa-sys.github.io/yawaragi-apps/furikae.html' });
  const { window } = dom;
  if (hasKey) window.localStorage.setItem('yawaragi_admin_key', 'dummy-key-1234');
  // 実コード(fnkShouldShowImport/fnkApplyImportGate)を document/localStorage 注入で実行（改変なし）
  const gateFn = new Function('document', 'localStorage', gateSrc + '\n fnkApplyImportGate();');
  gateFn(window.document, window.localStorage);
  return {
    dropZone: window.document.getElementById('dropZone').style.display,
    importResult: window.document.getElementById('importResult').style.display,
    controls: window.document.querySelector('.controls').style.display,
    monthSelect: window.document.getElementById('monthSelect') ? 'exists' : 'missing',
    summaryCards: window.document.getElementById('summaryCards') ? 'exists' : 'missing'
  };
}

console.log('[鍵あり = 社長端末]');
const a = run(true);
console.log('  実測:', JSON.stringify(a));
ok(a.dropZone !== 'none', '#dropZone 表示（styleでnoneでない）');
ok(a.importResult !== 'none', '#importResult 表示');
ok(a.controls !== 'none' && a.monthSelect === 'exists', '.controls/表示月 正常表示');

console.log('\n[鍵なし = スタッフ端末]');
const b = run(false);
console.log('  実測:', JSON.stringify(b));
ok(b.dropZone === 'none', '#dropZone 非表示（display:none）');
ok(b.importResult === 'none', '#importResult 非表示');
ok(b.controls !== 'none' && b.monthSelect === 'exists', '.controls/表示月 は非表示にならない（下は正常表示）');
ok(b.summaryCards === 'exists', 'summaryCards(カード域) も残る');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
