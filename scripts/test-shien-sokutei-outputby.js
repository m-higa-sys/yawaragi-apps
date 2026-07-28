// test-shien-sokutei-outputby.js
// 「要支援測定記録」シートへの出力者列（8列目 output_by）後付けの検証（2026-07-28 案X-5）。
// 本番スプレッドシートには一切触れず、SpreadsheetApp を偽物に差し替えて
// コード.js の実バイト（ensureShienSokuteiSheet_ / shienSokuteiRowToObj_）を抽出して呼ぶ。
//   - 新規作成は8列（ヘッダー文字列も固定）
//   - 既に7列で存在するシートには output_by が additive に足される（既存データは1バイトも動かない）
//   - 2回実行しても列は増えない（冪等）
//   - 行オブジェクトが output_by を返す／空欄は ''
// 出力者を「要介護のみ」に倒す判断は案b確定（要支援には出力者の概念が無い）。
//   この列は要介護の行だけが埋まる想定で、要支援の行は常に空。
// 実行: node scripts/test-shien-sokutei-outputby.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'gas', 'yawaragi-board', 'コード.js'), 'utf8');

function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('function ' + name + ' が無い（未実装＝RED）');
  const b = src.indexOf('{', s); let d = 0, i = b;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}
function extractVarLine(src, name) {
  const re = new RegExp('^var ' + name + ' = .*$', 'm');
  const m = src.match(re);
  if (!m) throw new Error('var ' + name + ' が無い');
  return m[0];
}

let pass = 0, fail = 0;
function eq(a, e, l) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('  PASS ' + l); }
  else { fail++; console.log('  FAIL ' + l + '\n    actual  =' + A + '\n    expected=' + E); }
}
function ok(c, l) { eq(!!c, true, l); }
function sec(t) { console.log('\n[' + t + ']'); }

// ---- 偽 Sheets（test-yotei-sheet.js と同方式）----
function FakeSheet(name) { this.name = name; this.grid = []; this.formats = []; }
FakeSheet.prototype._ensure = function (r, c) {
  while (this.grid.length < r) this.grid.push([]);
  for (let i = 0; i < this.grid.length; i++) while (this.grid[i].length < c) this.grid[i].push('');
};
FakeSheet.prototype.getRange = function (row, col, nRows, nCols) {
  const self = this;
  if (typeof row === 'string') return { setNumberFormat: function () { self.formats.push(row); return this; } };
  nRows = nRows || 1; nCols = nCols || 1;
  self._ensure(row + nRows - 1, col + nCols - 1);
  const api = {
    setValues: function (v) { for (let i = 0; i < nRows; i++) for (let j = 0; j < nCols; j++) self.grid[row - 1 + i][col - 1 + j] = v[i][j]; return api; },
    getValues: function () {
      const out = [];
      for (let i = 0; i < nRows; i++) { const r = []; for (let j = 0; j < nCols; j++) r.push(self.grid[row - 1 + i][col - 1 + j]); out.push(r); }
      return out;
    },
    setValue: function (v) { self.grid[row - 1][col - 1] = v; return api; },
    getValue: function () { return self.grid[row - 1][col - 1]; },
    setNumberFormat: function () { self.formats.push('cell'); return api; },
    setBackground: function () { return api; },
    setFontColor: function () { return api; },
    setFontWeight: function () { return api; }
  };
  return api;
};
FakeSheet.prototype.getDataRange = function () { const s = this; return { getValues: function () { return s.grid.map(r => r.slice()); } }; };
FakeSheet.prototype.getLastRow = function () { return this.grid.length; };
FakeSheet.prototype.getLastColumn = function () { return this.grid.length ? this.grid[0].length : 0; };
FakeSheet.prototype.setFrozenRows = function () { return this; };

let SHEETS = {};
const sandbox = {
  SS_ID: 'FAKE',
  SpreadsheetApp: {
    openById: function () {
      return {
        getSheetByName: function (n) { return SHEETS[n] || null; },
        insertSheet: function (n) { SHEETS[n] = new FakeSheet(n); return SHEETS[n]; }
      };
    },
    flush: function () { }
  },
  String, Number, Object, Array, JSON, console
};
vm.createContext(sandbox);
vm.runInContext([
  extractVarLine(code, 'SHIEN_SOKUTEI_HEADERS_'),
  extractFn(code, 'ensureShienSokuteiSheet_'),
  extractFn(code, 'shienSokuteiRowToObj_')
].join('\n\n'), sandbox);

const SHEET_NAME = '要支援測定記録';
const EXPECTED = ['name', 'care', 'sokutei_date', 'sokutei_by', 'source', 'note', 'createdAt', 'output_by'];

sec('新規作成: 8列で作られる（出力者列を含む）');
SHEETS = {};
let sh = sandbox.ensureShienSokuteiSheet_();
eq(sh.grid[0], EXPECTED, 'ヘッダーは8列（末尾が output_by）');
eq(sh.grid[0].length, 8, '列数はちょうど8');
ok(sh.formats.indexOf('A:H') >= 0, 'A:H をテキスト書式にしている（新列もDate解釈されない）');

sec('冪等: 2回目・3回目を呼んでも列は増えない');
sandbox.ensureShienSokuteiSheet_();
sandbox.ensureShienSokuteiSheet_();
eq(SHEETS[SHEET_NAME].grid[0], EXPECTED, '2回・3回呼んでもヘッダーは同じ');
eq(SHEETS[SHEET_NAME].grid[0].length, 8, '列も増えない');

sec('後付け: 既存の7列シートに output_by だけが足される（既存データは動かない）');
SHEETS = {};
const old = new FakeSheet(SHEET_NAME);
old.grid = [
  ['name', 'care', 'sokutei_date', 'sokutei_by', 'source', 'note', 'createdAt'],
  ['ダミー支援B', '要支援2', '2026-03-01', 'スタッフX', 'paper', '', '2026-07-03 10:00:00'],
  ['ダミー介護A', '要介護2', '2026-07-28', 'スタッフY', 'app', 'メモ', '2026-07-28 13:00:00']
];
SHEETS[SHEET_NAME] = old;
sh = sandbox.ensureShienSokuteiSheet_();
eq(sh.grid[0], EXPECTED, '8列目に output_by が足される');
eq(sh.grid[1].slice(0, 7), ['ダミー支援B', '要支援2', '2026-03-01', 'スタッフX', 'paper', '', '2026-07-03 10:00:00'], '既存の紙台帳行は1バイトも変わらない');
eq(sh.grid[2].slice(0, 7), ['ダミー介護A', '要介護2', '2026-07-28', 'スタッフY', 'app', 'メモ', '2026-07-28 13:00:00'], '既存のアプリ行も変わらない');
eq(sh.grid[1][7], '', '既存行の出力者は空（値を勝手に入れない）');
sandbox.ensureShienSokuteiSheet_();
eq(sh.grid[0].length, 8, '後付け後にもう一度呼んでも列は増えない');

sec('行オブジェクト: output_by を返す');
let o = sandbox.shienSokuteiRowToObj_(['ダミー介護A', '要介護2', '2026-07-28', 'スタッフY', 'app', 'メモ', '2026-07-28 13:00:00', 'スタッフX']);
eq(o.output_by, 'スタッフX', '8列目が output_by として読める');
eq(o.name, 'ダミー介護A', 'name は従来どおり');
eq(o.sokutei_by, 'スタッフY', 'sokutei_by は従来どおり（出力者と混ざらない）');
eq(o.note, 'メモ', 'note も従来どおり');

sec('行オブジェクト: 出力者が無い行は空文字（null や undefined を漏らさない）');
o = sandbox.shienSokuteiRowToObj_(['ダミー支援B', '要支援2', '2026-03-01', 'スタッフX', 'paper', '', '2026-07-03 10:00:00']);
eq(o.output_by, '', '7列しかない古い行でも output_by は空文字');
o = sandbox.shienSokuteiRowToObj_(['ダミー支援B', '要支援2', '2026-03-01', 'スタッフX', 'app', '', '2026-07-28 13:00:00', '']);
eq(o.output_by, '', '要支援の行は出力者が空（案b: 要介護のみ出力者を持つ）');

sec('addSokuteiDone の出力者ルールがコードに書かれている（要介護のみ・空欄は測定者）');
const adSrc = code.slice(code.indexOf("action === 'addSokuteiDone'"), code.indexOf("action === 'addSokuteiDone'") + 3000);
ok(/adOutputBy/.test(adSrc), 'outputBy パラメータを受け取っている');
ok(/adIsKaigo\s*\?\s*\(adOutputBy \|\| adBy\)\s*:\s*''/.test(adSrc), '要介護なら outputBy（空なら測定者）／要支援は空');
ok(/SHIEN_SOKUTEI_HEADERS_\.length/.test(adSrc), '書き込み幅をヘッダー定義から取っている（列数の直書きをしていない）');
ok(/未来の日付では記録できません/.test(adSrc), '未来日はサーバ側でも弾く（画面だけの防御にしない）');

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
