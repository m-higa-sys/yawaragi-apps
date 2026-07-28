// test-yotei-sheet.js
// 「予定月」シート層（ensureYoteiSheet_ / readYotei_ / findYotei_ / writeYotei_）の検証。
// 本番スプレッドシートには一切触れず、SpreadsheetApp / Utilities / LockService を偽物に差し替えて
// コード.js の実バイトを抽出して呼ぶ（純関数を写したテストではない）。
//   - シートが9列で作られる（ヘッダー文字列も固定）
//   - (userId, domain) が主キー: 同じ組み合わせで2回書いても行が増えない（upsert）
//   - domain が違えば別行（口腔/個訓/通所を同じシートに載せられる汎用の器）
//   - slideCount の +1 / -1（0未満にしない）/ 実施時リセット
// 実行: node scripts/test-yotei-sheet.js

const fs = require('fs');
const path = require('path');
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

// ---- 偽 Sheets ----
function FakeSheet(name) {
  this.name = name;
  this.grid = [];           // [row][col] 0始まり
  this.formats = 0;
  this.frozen = 0;
}
FakeSheet.prototype._ensure = function (r, c) {
  while (this.grid.length < r) this.grid.push([]);
  for (let i = 0; i < this.grid.length; i++) {
    while (this.grid[i].length < c) this.grid[i].push('');
  }
};
FakeSheet.prototype.getRange = function (row, col, nRows, nCols) {
  const self = this;
  nRows = nRows || 1; nCols = nCols || 1;
  if (typeof row === 'string') {   // 'A:I' 形式
    return { setNumberFormat: function () { self.formats++; return this; } };
  }
  self._ensure(row + nRows - 1, col + nCols - 1);
  const api = {
    setValues: function (vals) {
      for (let i = 0; i < nRows; i++) for (let j = 0; j < nCols; j++) self.grid[row - 1 + i][col - 1 + j] = vals[i][j];
      return api;
    },
    getValues: function () {
      const out = [];
      for (let i = 0; i < nRows; i++) {
        const r = [];
        for (let j = 0; j < nCols; j++) r.push(self.grid[row - 1 + i][col - 1 + j]);
        out.push(r);
      }
      return out;
    },
    setValue: function (v) { self.grid[row - 1][col - 1] = v; return api; },
    getValue: function () { return self.grid[row - 1][col - 1]; },
    setNumberFormat: function () { self.formats++; return api; },
    setBackground: function () { return api; },
    setFontColor: function () { return api; },
    setFontWeight: function () { return api; }
  };
  return api;
};
FakeSheet.prototype.getDataRange = function () {
  const self = this;
  return { getValues: function () { return self.grid.map(r => r.slice()); } };
};
FakeSheet.prototype.getLastRow = function () { return this.grid.length; };
FakeSheet.prototype.getLastColumn = function () { return this.grid.length ? this.grid[0].length : 0; };
FakeSheet.prototype.setFrozenRows = function (n) { this.frozen = n; return this; };

const SHEETS = {};
const sandboxGlobals = {
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
  Utilities: {
    formatDate: function (d, tz, fmt) {
      const p = n => (n < 10 ? '0' : '') + n;
      const s = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
        + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
      return fmt === 'yyyy-MM' ? s.slice(0, 7) : (fmt === 'yyyy-MM-dd' ? s.slice(0, 10) : s);
    }
  },
  LockService: { getScriptLock: function () { return { waitLock: function () { }, releaseLock: function () { } }; } },
  sokuteiCycleMonths_: function (care) { return String(care || '').indexOf('要介護') === 0 ? 3 : 4; }
};

// コード.js の実バイトを読み込む
const src = [
  extractVarLine(code, 'YOTEI_HEADERS_'),
  extractFn(code, 'ensureYoteiSheet_'),
  extractFn(code, 'yoteiRowToObj_'),
  extractFn(code, 'readYotei_'),
  extractFn(code, 'findYotei_'),
  extractFn(code, 'writeYotei_')
].join('\n');
const names = Object.keys(sandboxGlobals);
const fn = new Function(...names, src + '\nreturn { ensureYoteiSheet_, yoteiRowToObj_, readYotei_, findYotei_, writeYotei_, YOTEI_HEADERS_ };');
const G = fn(...names.map(n => sandboxGlobals[n]));

// =====================================================================
sec('シートは9列で作られる（列順・ヘッダー文字列が固定）');
const sh = G.ensureYoteiSheet_();
eq(G.YOTEI_HEADERS_.length, 9, 'ヘッダーは9列');
eq(sh.getDataRange().getValues()[0],
  ['userId', 'name', 'domain', 'nextYm', 'cycleMonths', 'updatedAt', 'updatedBy', 'slideCount', 'note'],
  '列順とヘッダー文字列が指定どおり');
eq(sh.frozen, 1, '1行目を固定');
const sh2 = G.ensureYoteiSheet_();
eq(sh2.getDataRange().getValues().length, 1, '2回呼んでもヘッダー行は1本（冪等）');

sec('upsert: (userId, domain) が主キー＝2回書いても行が増えない');
let r = G.writeYotei_('U1', 'sokutei', { name: 'ダミー1', care: '要介護2', nextYm: '2026-09', by: 'init' });
ok(r.ok, '1回目の書き込みが成功');
eq(r.row.nextYm, '2026-09', 'nextYm が入る');
eq(r.row.cycleMonths, 3, '要介護は cycleMonths=3');
eq(G.readYotei_('sokutei').length, 1, '1行');
r = G.writeYotei_('U1', 'sokutei', { name: 'ダミー1', care: '要介護2', nextYm: '2026-10', by: 'staffX' });
eq(G.readYotei_('sokutei').length, 1, '同じ(userId,domain)で書いても1行のまま（重複しない）');
eq(G.findYotei_('U1', 'sokutei').nextYm, '2026-10', '値は上書きされる');
eq(G.findYotei_('U1', 'sokutei').updatedBy, 'staffX', 'updatedBy が記録される');
ok(G.findYotei_('U1', 'sokutei').updatedAt, 'updatedAt が記録される');

sec('domain が違えば別行（口腔/個訓/通所を同じシートに載せられる）');
G.writeYotei_('U1', 'oral', { name: 'ダミー1', care: '要介護2', nextYm: '2026-12', by: 'init' });
eq(G.readYotei_('sokutei').length, 1, 'sokutei は1行のまま');
eq(G.readYotei_('oral').length, 1, 'oral が1行できる');
eq(G.readYotei_('').length, 2, 'domain 未指定なら全件2行');
eq(G.findYotei_('U1', 'oral').nextYm, '2026-12', 'oral 側の値は独立');
eq(G.findYotei_('U1', 'sokutei').nextYm, '2026-10', 'sokutei 側は影響を受けない');

sec('slideCount: +1 / -1（0未満にしない）/ 実施でリセット');
eq(G.findYotei_('U1', 'sokutei').slideCount, 0, '初期は0');
G.writeYotei_('U1', 'sokutei', { nextYm: '2026-11', by: 'staffY', slideDelta: 1 });
eq(G.findYotei_('U1', 'sokutei').slideCount, 1, 'スライドで +1');
G.writeYotei_('U1', 'sokutei', { nextYm: '2026-12', by: 'staffY', slideDelta: 1 });
eq(G.findYotei_('U1', 'sokutei').slideCount, 2, 'もう一度スライドで +1');
G.writeYotei_('U1', 'sokutei', { nextYm: '2026-11', by: 'staffY', slideDelta: -1 });
eq(G.findYotei_('U1', 'sokutei').slideCount, 1, 'Undo で -1');
G.writeYotei_('U1', 'sokutei', { nextYm: '2026-10', by: 'staffY', slideDelta: -1 });
G.writeYotei_('U1', 'sokutei', { nextYm: '2026-09', by: 'staffY', slideDelta: -1 });
eq(G.findYotei_('U1', 'sokutei').slideCount, 0, '0未満にはならない');
G.writeYotei_('U1', 'sokutei', { nextYm: '2026-08', by: 'staffY', slideDelta: 1 });
G.writeYotei_('U1', 'sokutei', { nextYm: '2027-01', by: 'staffY', resetSlide: true });
eq(G.findYotei_('U1', 'sokutei').slideCount, 0, '実施(resetSlide)でスライド回数が0に戻る');

sec('cycleMonths は既存値を保持し、介護度未指定でも壊れない');
eq(G.findYotei_('U1', 'sokutei').cycleMonths, 3, 'care 未指定の更新でも 3 のまま');
G.writeYotei_('U2', 'sokutei', { name: 'ダミー2', care: '要支援1', nextYm: '2026-11', by: 'init' });
eq(G.findYotei_('U2', 'sokutei').cycleMonths, 4, '要支援は 4');

sec('不正な nextYm は書かない（シートを壊さない）');
const bad = G.writeYotei_('U3', 'sokutei', { name: 'ダミー3', care: '要介護1', nextYm: '2026-13-01', by: 'init' });
eq(bad.ok, false, 'YYYY-MM でない値は拒否');
eq(G.findYotei_('U3', 'sokutei'), null, '行は作られない');
eq(G.readYotei_('').length, 3, '全件は3行のまま（U1 sokutei / U1 oral / U2 sokutei）');

sec('name/note は空で更新しても既存値を消さない');
G.writeYotei_('U2', 'sokutei', { nextYm: '2026-12', by: 'staffZ' });
eq(G.findYotei_('U2', 'sokutei').name, 'ダミー2', 'name が消えない');

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
