// test-sokutei-output-sheet.js
// 「測定出力」シート層（ensureSokuteiOutputSheet_ / readSokuteiOutput_ /
//  readSokuteiOutputLegacy_ / sokuteiOutputSeedFromLegacy_ / writeSokuteiOutput_）の検証。
//
// 本番スプレッドシートには一切触れず、SpreadsheetApp / Utilities / LockService を偽物に差し替えて
// コード.js の実バイトを抽出して呼ぶ（純関数を写したテストではない）。
//   - シートが10列で作られる（ヘッダー文字列も固定）
//   - 主キーは (userId, domain, 測定年月)。同じ組み合わせで2回書いても行が増えない
//   - 🖨(riyousha) と 📄(caremgr) が独立して済／未に切り替わり、取り消しもできる
//   - ★測定年月が変わると別行＝前回のチェックが引き継がれない（1測定回＝1行の設計の要）
//   - ★個訓15列目 output_by は読むだけ。個訓シートへの書き込みが1回も発生しない
//   - ★新規行を作るとき legacy を引き継ぐ（1つ押した瞬間にもう片方が「未」へ落ちない）
// 実行: node scripts/test-sokutei-output-sheet.js

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

// ---- 偽 Sheets（test-yotei-sheet.js と同じ作り）----
function FakeSheet(name) {
  this.name = name;
  this.grid = [];
  this.formats = 0;
  this.frozen = 0;
  this.writes = 0;      // ★setValues / setValue が呼ばれた回数（個訓シートは常に0であること）
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
  if (typeof row === 'string') {   // 'A:J' 形式
    return { setNumberFormat: function () { self.formats++; return this; } };
  }
  self._ensure(row + nRows - 1, col + nCols - 1);
  const api = {
    setValues: function (vals) {
      self.writes++;
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
    setValue: function (v) { self.writes++; self.grid[row - 1][col - 1] = v; return api; },
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

// ---- 個訓シート（読むだけの対象）の固定データ ----
// 列: 0 userId / 1 name / 2 year / 3 month / …… / 12 sokutei_date / 13 sokutei_by / 14 output_by / 15 tasseido_date
// ★本番実測(2026-07-29): 記録行の year/month と測定日の年月は食い違う（記録2026-05・測定2026-07 など）。
//   だから測定年月は必ず sokutei_date の年月で取る。ここでも同じ食い違いを再現している。
function kunRow(userId, name, year, month, sokuteiDate, outputBy) {
  const r = new Array(16).fill('');
  r[0] = userId; r[1] = name; r[2] = year; r[3] = month;
  r[12] = sokuteiDate; r[13] = '測定者' + userId; r[14] = outputBy;
  return r;
}
const KUN_HEADER = new Array(16).fill('h');
function makeKunSheet() {
  const sh = new FakeSheet('個別機能訓練計画書記録');
  sh.grid = [
    KUN_HEADER.slice(),
    kunRow('U1', 'ダミー甲', 2026, 5, '2026-07-10', 'スタッフA'),   // 記録は5月・測定は7月（本番と同じ食い違い）
    kunRow('U2', 'ダミー乙', 2026, 6, '2026-06-05', 'スタッフB'),   // 6月の実績
    kunRow('U3', 'ダミー丙', 2026, 5, '2026-07-11', ''),            // 測定はしたが出力者は空＝legacy にしない
    kunRow('U4', 'ダミー丁', 2026, 5, new Date('2026-07-12T00:00:00+09:00'), 'スタッフD'),  // Date型で入っている行
    kunRow('U5', 'ダミー戊', 2026, 5, '2026/07/13', 'スタッフE'),   // スラッシュ区切りの行
    kunRow('', 'userId無し', 2026, 5, '2026-07-14', 'スタッフF')    // userId が無い行は拾わない
  ];
  sh.writes = 0;   // 固定データの流し込みは書き込み回数に数えない
  return sh;
}

let KUN_SHEET = makeKunSheet();
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
  // 個訓シートは「読むだけ」。本物の ensureKeikakushoSheet_ は呼ばず、固定データの偽シートを返す。
  ensureKeikakushoSheet_: function () { return KUN_SHEET; }
};

const src = [
  extractVarLine(code, 'SOKUTEI_OUTPUT_SHEET_'),
  extractVarLine(code, 'SOKUTEI_OUTPUT_HEADERS_'),
  extractVarLine(code, 'SOKUTEI_OUTPUT_KINDS_'),
  extractFn(code, 'ensureSokuteiOutputSheet_'),
  extractFn(code, 'sokuteiOutputRowToObj_'),
  extractFn(code, 'readSokuteiOutput_'),
  extractFn(code, 'readSokuteiOutputLegacy_'),
  extractFn(code, 'sokuteiOutputSeedFromLegacy_'),
  extractFn(code, 'writeSokuteiOutput_')
].join('\n');
const names = Object.keys(sandboxGlobals);
const fn = new Function(...names, src
  + '\nreturn { ensureSokuteiOutputSheet_, sokuteiOutputRowToObj_, readSokuteiOutput_,'
  + ' readSokuteiOutputLegacy_, sokuteiOutputSeedFromLegacy_, writeSokuteiOutput_,'
  + ' SOKUTEI_OUTPUT_HEADERS_, SOKUTEI_OUTPUT_SHEET_, SOKUTEI_OUTPUT_KINDS_ };');
const G = fn(...names.map(n => sandboxGlobals[n]));

function resetSheets() {
  Object.keys(SHEETS).forEach(k => delete SHEETS[k]);
  KUN_SHEET = makeKunSheet();
  sandboxGlobals.ensureKeikakushoSheet_ = function () { return KUN_SHEET; };
}
const outSheet = () => SHEETS[G.SOKUTEI_OUTPUT_SHEET_];

// =====================================================================
sec('シートは10列で作られる（列順・ヘッダー文字列が固定）');
resetSheets();
const sh = G.ensureSokuteiOutputSheet_();
eq(G.SOKUTEI_OUTPUT_HEADERS_.length, 10, 'ヘッダーは10列');
eq(sh.getDataRange().getValues()[0],
  ['userId', 'name', 'domain', '測定年月', 'riyousha_at', 'riyousha_by', 'caremgr_at', 'caremgr_by', 'updatedAt', 'note'],
  '列順とヘッダー文字列が指定どおり');
eq(sh.frozen, 1, '1行目を固定');
eq(G.SOKUTEI_OUTPUT_SHEET_, '測定出力', 'シート名は「測定出力」');
eq(G.SOKUTEI_OUTPUT_KINDS_, ['riyousha', 'caremgr'], '種類は🖨利用者用と📄ケアマネ用の2つだけ');
const sh2 = G.ensureSokuteiOutputSheet_();
eq(sh2.getDataRange().getValues().length, 1, '2回呼んでもヘッダー行は1本（冪等）');
ok(sh.formats > 0, 'テキスト書式を掛けている（YYYY-MM が日付に化けない）');

// =====================================================================
sec('主キーは (userId, domain, 測定年月)＝同じ組み合わせの行を2つ作らない');
resetSheets();
let r = G.writeSokuteiOutput_('U1', 'sokutei', '2026-08', 'riyousha', true, { by: 'スタッフX', name: 'ダミー甲' });
ok(r.ok, '1回目の書き込みが成功');
eq(G.readSokuteiOutput_('sokutei', '2026-08').length, 1, '1行');
r = G.writeSokuteiOutput_('U1', 'sokutei', '2026-08', 'caremgr', true, { by: 'スタッフY', name: 'ダミー甲' });
eq(G.readSokuteiOutput_('sokutei', '2026-08').length, 1, '★同じ(userId,domain,測定年月)で書いても1行のまま（重複しない）');
r = G.writeSokuteiOutput_('U1', 'sokutei', '2026-08', 'riyousha', false, { by: 'スタッフZ' });
eq(G.readSokuteiOutput_('sokutei', '2026-08').length, 1, '未に戻しても1行のまま');
eq(G.readSokuteiOutput_('sokutei', '2026-08')[0].name, 'ダミー甲', 'name は初回の値を保持する（by だけ渡した回で消えない）');

// =====================================================================
sec('🖨 と 📄 は独立して済／未に切り替わり、取り消しもできる');
resetSheets();
const st = () => {
  const rows = G.readSokuteiOutput_('sokutei', '2026-08');
  const x = rows[0] || {};
  return { riyousha: !!x.riyousha_at, caremgr: !!x.caremgr_at };
};
G.writeSokuteiOutput_('U9', 'sokutei', '2026-08', 'riyousha', true, { by: 'スタッフX', name: 'ダミー己' });
eq(st(), { riyousha: true, caremgr: false }, '🖨だけ済にすると📄は未のまま');
G.writeSokuteiOutput_('U9', 'sokutei', '2026-08', 'caremgr', true, { by: 'スタッフX' });
eq(st(), { riyousha: true, caremgr: true }, '📄も済にすると両方済');
G.writeSokuteiOutput_('U9', 'sokutei', '2026-08', 'riyousha', false, { by: 'スタッフX' });
eq(st(), { riyousha: false, caremgr: true }, '★🖨を取り消しても📄は済のまま（片方の操作でもう片方を巻き込まない）');
G.writeSokuteiOutput_('U9', 'sokutei', '2026-08', 'caremgr', false, { by: 'スタッフX' });
eq(st(), { riyousha: false, caremgr: false }, '📄も取り消せる');
let row9 = G.readSokuteiOutput_('sokutei', '2026-08')[0];
eq(row9.riyousha_by, '', '未に戻すと担当者も空になる');
ok(row9.updatedAt, '未に戻した記録も updatedAt に残る');

// =====================================================================
sec('★測定年月が変わると別行＝前回のチェックが引き継がれない（1測定回＝1行）');
resetSheets();
G.writeSokuteiOutput_('U1', 'sokutei', '2026-08', 'riyousha', true, { by: 'スタッフX', name: 'ダミー甲' });
G.writeSokuteiOutput_('U1', 'sokutei', '2026-08', 'caremgr', true, { by: 'スタッフX' });
eq(G.readSokuteiOutput_('sokutei', '2026-08').length, 1, '8月ぶんは1行');
eq(G.readSokuteiOutput_('sokutei', '2026-11').length, 0, '★次の測定月(11月)には行が無い＝チェックは引き継がれない');
G.writeSokuteiOutput_('U1', 'sokutei', '2026-11', 'riyousha', true, { by: 'スタッフX' });
eq(G.readSokuteiOutput_('sokutei', '2026-11').length, 1, '11月ぶんは新しい行になる');
eq(G.readSokuteiOutput_('sokutei', '2026-11')[0].caremgr_at, '', '★11月の📄は未から始まる（8月の済を持ち越さない）');
eq(G.readSokuteiOutput_('sokutei', '2026-08')[0].caremgr_at !== '', true, '8月ぶんの記録はそのまま残る');
eq(G.readSokuteiOutput_('sokutei', '').length, 2, 'ym 未指定なら両方の月が返る');

// =====================================================================
sec('domain が違えば別行（口腔/個訓/通所を同じシートに載せられる汎用の器）');
resetSheets();
G.writeSokuteiOutput_('U1', 'sokutei', '2026-08', 'riyousha', true, { by: 'スタッフX' });
G.writeSokuteiOutput_('U1', 'oral', '2026-08', 'riyousha', true, { by: 'スタッフX' });
eq(G.readSokuteiOutput_('sokutei', '2026-08').length, 1, 'sokutei は1行のまま');
eq(G.readSokuteiOutput_('oral', '2026-08').length, 1, 'oral が1行できる');
eq(G.readSokuteiOutput_('', '').length, 2, 'domain 未指定なら全件2行');

// =====================================================================
sec('個訓15列目 output_by の読み取り（測定年月は sokutei_date の年月で取る）');
resetSheets();
let leg = G.readSokuteiOutputLegacy_('2026-07');
eq(leg.map(x => x.userId).sort(), ['U1', 'U4', 'U5'], '★7月に測って出力者が入っている行だけ拾う');
eq(leg.filter(x => x.userId === 'U1')[0].ym, '2026-07',
  '★記録行は year=2026/month=5 だが、測定年月は測定日の 2026-07 になる');
eq(leg.filter(x => x.userId === 'U1')[0].by, 'スタッフA', '出力者を拾う');
eq(leg.filter(x => x.userId === 'U4')[0].sokutei_date, '2026-07-12', 'Date型で入っている行も拾う');
eq(leg.filter(x => x.userId === 'U5')[0].sokutei_date, '2026-07-13', 'スラッシュ区切りの行も拾う');
ok(leg.every(x => x.userId !== 'U3'), '出力者が空の行は拾わない（測定だけして出力はまだ）');
ok(leg.every(x => x.userId !== ''), 'userId が無い行は拾わない');
eq(G.readSokuteiOutputLegacy_('2026-06').map(x => x.userId), ['U2'], '6月を指定すれば6月の実績だけ');
eq(G.readSokuteiOutputLegacy_('').length, 4, 'ym 未指定なら全期間（U1/U2/U4/U5）');

// =====================================================================
sec('★新規行を作るときだけ legacy を引き継ぐ（1つ押してもう片方が「未」へ落ちない）');
resetSheets();
let seed = G.sokuteiOutputSeedFromLegacy_('U1', 'sokutei', '2026-07', 'ダミー甲');
eq({ r: !!seed.riyousha_at, c: !!seed.caremgr_at }, { r: true, c: true },
  '旧アプリの出力実績がある人は🖨📄の両方を済として引き継ぐ');
eq(seed.riyousha_by, 'スタッフA', '出力者も引き継ぐ');
seed = G.sokuteiOutputSeedFromLegacy_('U3', 'sokutei', '2026-07', 'ダミー丙');
eq({ r: !!seed.riyousha_at, c: !!seed.caremgr_at }, { r: false, c: false }, '実績が無い人は両方とも未から始まる');
seed = G.sokuteiOutputSeedFromLegacy_('U1', 'oral', '2026-07', 'ダミー甲');
eq({ r: !!seed.riyousha_at, c: !!seed.caremgr_at }, { r: false, c: false },
  'domain が sokutei 以外なら引き継がない（個訓の測定実績は測定分野のもの）');

resetSheets();
// 旧アプリで出力済の人が🖨を「未」に戻す＝行が新規に作られる場面
G.writeSokuteiOutput_('U1', 'sokutei', '2026-07', 'riyousha', false, { by: 'スタッフX', name: 'ダミー甲' });
let u1 = G.readSokuteiOutput_('sokutei', '2026-07')[0];
eq(!!u1.riyousha_at, false, '押した側（🖨）は未になる');
eq(!!u1.caremgr_at, true, '★押していない側（📄）は済のまま＝勝手に「未」へ落ちない');
eq(u1.caremgr_by, 'スタッフA', '引き継いだ出力者も残る');
ok(String(u1.note).indexOf('引き継ぎ') >= 0, '引き継いだことが note に残る（後から追える）');

// =====================================================================
sec('★個訓シート（個別機能訓練計画書記録）へ書き込みが1回も発生しない');
resetSheets();
G.readSokuteiOutputLegacy_('2026-07');
G.sokuteiOutputSeedFromLegacy_('U1', 'sokutei', '2026-07', 'ダミー甲');
G.writeSokuteiOutput_('U1', 'sokutei', '2026-07', 'riyousha', true, { by: 'スタッフX', name: 'ダミー甲' });
G.writeSokuteiOutput_('U1', 'sokutei', '2026-07', 'caremgr', false, { by: 'スタッフX' });
G.writeSokuteiOutput_('U2', 'sokutei', '2026-06', 'caremgr', true, { by: 'スタッフX' });
eq(KUN_SHEET.writes, 0, '★個訓シートへの書き込み回数は0（読むだけ・社長決定 乙=A）');
ok(!!outSheet(), '書き込み先は「測定出力」シートだけ');
ok(outSheet().writes > 0, '「測定出力」シートには書けている');
// 個訓シートの中身が1バイトも変わっていないこと
const kunNow = JSON.stringify(KUN_SHEET.grid.map(r => r.map(c => (c instanceof Date) ? c.toISOString() : c)));
const kunFresh = JSON.stringify(makeKunSheet().grid.map(r => r.map(c => (c instanceof Date) ? c.toISOString() : c)));
eq(kunNow, kunFresh, '★個訓シートの中身が固定データのまま（1セルも変わっていない）');

// =====================================================================
sec('不正な入力は書かずに弾く');
resetSheets();
eq(G.writeSokuteiOutput_('', 'sokutei', '2026-08', 'riyousha', true, {}).ok, false, 'userId 空は弾く');
eq(G.writeSokuteiOutput_('U1', '', '2026-08', 'riyousha', true, {}).ok, false, 'domain 空は弾く');
eq(G.writeSokuteiOutput_('U1', 'sokutei', '2026-8', 'riyousha', true, {}).ok, false, 'ym は YYYY-MM のみ');
eq(G.writeSokuteiOutput_('U1', 'sokutei', '2026-08-01', 'riyousha', true, {}).ok, false, '日付まで入った ym は弾く');
eq(G.writeSokuteiOutput_('U1', 'sokutei', '2026-08', 'houkokusho', true, {}).ok, false,
  '★kind は riyousha / caremgr のみ（報告書「作成」のような存在しない作業を作らせない）');
ok(!outSheet() || G.readSokuteiOutput_('', '').length === 0, '弾いた分は1行も書かれていない');

// =====================================================================
console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
