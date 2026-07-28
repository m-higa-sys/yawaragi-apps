// test-launcher-sokutei-row.js
// ランチャー台帳へ「測定管理(sokutei)」を出す更新の検証（2026-07-29）。
// 本番スプレッドシートには一切触れず、コード.js の実バイト（launcherPlanSokutei_ /
// launcherAddSokutei_）を抽出し、SpreadsheetApp を偽物に差し替えて呼ぶ。
//
//   - 「利用者の記録」カテゴリが期待どおりの並びになる（表示順9＝個訓の次・⛔は末尾）
//   - 2回実行しても行が重複しない・⛔が二重に付かない（冪等）
//   - measure-app の URL・公開区分(scope)・カテゴリ・icon が変わらない（変えるのはアプリ名だけ）
//   - 既存9本がどれも消えない
//   - 確認のみ（dryRun）は台帳に1バイトも書かない
//   - ⚠️差分に appregistryMigrateLauncherV2 を呼ぶコードが無い
// 実行: node scripts/test-launcher-sokutei-row.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'gas', 'yawaragi-board', 'コード.js'), 'utf8');
const mappingSrc = fs.readFileSync(path.join(ROOT, 'gas', 'yawaragi-board', 'applauncher-mapping-core.js'), 'utf8');

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
function FakeSheet(name) { this.name = name; this.grid = []; this.writes = []; }
FakeSheet.prototype._ensure = function (r, c) {
  while (this.grid.length < r) this.grid.push([]);
  for (let i = 0; i < this.grid.length; i++) while (this.grid[i].length < c) this.grid[i].push('');
};
FakeSheet.prototype.getRange = function (row, col, nRows, nCols) {
  const self = this;
  nRows = nRows || 1; nCols = nCols || 1;
  self._ensure(row + nRows - 1, col + nCols - 1);
  const api = {
    setValues: function (v) {
      self.writes.push({ row, col, nRows, nCols });
      for (let i = 0; i < nRows; i++) for (let j = 0; j < nCols; j++) self.grid[row - 1 + i][col - 1 + j] = v[i][j];
      return api;
    },
    getValues: function () {
      const out = [];
      for (let i = 0; i < nRows; i++) { const r = []; for (let j = 0; j < nCols; j++) r.push(self.grid[row - 1 + i][col - 1 + j]); out.push(r); }
      return out;
    },
    setValue: function (v) { self.writes.push({ row, col, nRows: 1, nCols: 1 }); self.grid[row - 1][col - 1] = v; return api; },
    getValue: function () { return self.grid[row - 1][col - 1]; },
    setNumberFormat: function () { return api; }
  };
  return api;
};
FakeSheet.prototype.getLastRow = function () { return this.grid.length; };
FakeSheet.prototype.getLastColumn = function () { return this.grid.length ? this.grid[0].length : 0; };

const HEADERS = ['アプリ名', 'カテゴリ', '説明', 'スタッフ用URL', '公開区分',
  '記録シートID', 'ソース場所', 'GASデプロイID', '注意点', '作成日', '最終更新日', '管理者メモ', 'icon', '表示順'];
const B = 'https://m-higa-sys.github.io/yawaragi-apps/';
// 本番の「利用者の記録」9行を実測どおりに再現（2026-07-29 実測値）
function baseRows() {
  const mk = (name, cat, desc, url, icon, order) => {
    const r = new Array(14).fill('');
    r[0] = name; r[1] = cat; r[2] = desc; r[3] = url; r[4] = 'staff';
    r[9] = '2026-06-18'; r[10] = '2026-06-18'; r[12] = icon; r[13] = order;
    return r;
  };
  return [
    mk('体重チェック', '利用者の記録', '', B + 'weight.html', '⚖️', 1),
    mk('⛔口腔機能管理（使わない）', '利用者の記録', '', B + 'oral.html', '🦷', 2),
    mk('口腔実施記録', '利用者の記録', '口腔体操の実施日を記録（毎月）', B + 'oral-record.html', '🦷', 3),
    mk('口腔モニ・評価・計画', '利用者の記録', '口腔機能向上の3ヶ月サイクル', B + 'oral-plan.html', '🦷', 4),
    mk('身長チェック', '利用者の記録', '', B + 'height.html', '📏', 5),
    mk('通所介護計画管理', '利用者の記録', '要支援=月次モニタリング', B + 'monitoring.html', '📋', 6),
    mk('出席率・利用頻度', '利用者の記録', '週1・要介護・高出席率の増回候補', B + '出席率.html', '📊', 7),
    mk('個別機能訓練計画書', '利用者の記録', '', B + '個別機能訓練計画書チェック.html', '📋', 8),
    mk('身体機能評価(体力測定)', '利用者の記録', '今日測る人を確認し、測定日・測定者・出力者を記録', B + 'measure-app.html', '📐', ''),
    // 他カテゴリも1本混ぜて「巻き込まないこと」を見る
    mk('yawaragiボード', 'メインボード', '', B + 'genba.html', '📋', 1),
    mk('清掃・準備チェック表', '毎日の業務', '', B + 'cleaning.html', '🧹', 6)
  ];
}

let SHEETS = {};
const sandbox = {
  APPREGISTRY_SHEET: 'アプリ台帳',
  APPREGISTRY_HEADERS: HEADERS,
  appregistrySS_: function () {
    return { getSheetByName: function (n) { return SHEETS[n] || null; } };
  },
  SpreadsheetApp: { flush: function () { } },
  Utilities: { formatDate: function () { return '2026-07-29'; } },
  Logger: { _log: [], log: function (m) { this._log.push(String(m)); } },
  Date: Date, String, Number, Object, Array, JSON, Error, console
};
vm.createContext(sandbox);
vm.runInContext(extractFn(mappingSrc, 'launcherSlugFromUrl_'), sandbox);
[
  'LAUNCHER_SOKUTEI_URL_', 'LAUNCHER_SOKUTEI_NAME_', 'LAUNCHER_SOKUTEI_ICON_', 'LAUNCHER_SOKUTEI_CAT_',
  'LAUNCHER_SOKUTEI_ORDER_', 'LAUNCHER_SOKUTEI_DESC_', 'LAUNCHER_MEASUREAPP_SLUG_', 'LAUNCHER_MEASUREAPP_NEWNAME_'
].forEach(v => vm.runInContext(extractVarLine(code, v), sandbox));
vm.runInContext(extractFn(code, 'launcherPlanSokutei_'), sandbox);
vm.runInContext(extractFn(code, 'launcherAddSokutei_'), sandbox);
vm.runInContext(extractFn(code, 'AAA_ランチャー測定管理を出す_確認のみ'), sandbox);
vm.runInContext(extractFn(code, 'AAA_ランチャー測定管理を出す'), sandbox);

function freshSheet() {
  SHEETS = {};
  const sh = new FakeSheet('アプリ台帳');
  sh.grid = [HEADERS.slice()].concat(baseRows().map(r => r.slice()));
  SHEETS['アプリ台帳'] = sh;
  sandbox.Logger._log = [];
  return sh;
}
// 台帳から「利用者の記録」を getAppRegistry と同じ並び（表示順・空は末尾）で取り出す
function recordCat(sh) {
  return sh.grid.slice(1)
    .filter(r => r[1] === '利用者の記録' && r[4] === 'staff')
    .map(r => ({ name: r[0], url: r[3], scope: r[4], icon: r[12], order: r[13] }))
    .sort((a, b) => {
      const n = v => { const x = parseInt(v, 10); return isNaN(x) ? 999 : x; };
      return n(a.order) - n(b.order);
    });
}
function slug(u) { return String(u).split('/').pop().replace(/\.html$/, ''); }

// =====================================================================
sec('前提: 偽台帳が本番の実測どおり（利用者の記録9本）');
let sh = freshSheet();
eq(sh.grid.length - 1, 11, '全11行（利用者の記録9＋他カテゴリ2）');
eq(recordCat(sh).length, 9, '「利用者の記録」は9本');
eq(recordCat(sh).map(x => x.name).slice(-1), ['身体機能評価(体力測定)'], '表示順が空の measure-app は末尾');

sec('確認のみ（dryRun）は台帳に1バイトも書かない');
sh = freshSheet();
const before = JSON.stringify(sh.grid);
const dry = sandbox['AAA_ランチャー測定管理を出す_確認のみ']();
eq(JSON.stringify(sh.grid), before, '★グリッドが1バイトも変わらない');
eq(sh.writes.length, 0, '★書き込みAPIが1回も呼ばれない');
eq(dry.dryRun, true, 'dryRun フラグが立つ');
eq(dry.plan.alreadyRegistered, false, 'まだ未登録と判定する');
eq(dry.plan.renameFrom, '身体機能評価(体力測定)', '変更前の名前をログ用に持つ');
eq(dry.plan.renameTo, '⛔身体機能評価（使わない）', '変更後の名前を持つ');
ok(sandbox.Logger._log.join('\n').indexOf('確認のみのため、台帳には何も書いていません') >= 0, 'ログに書き込みなしと出る');
ok(sandbox.Logger._log.join('\n').indexOf('［控え］変更前の行') >= 0, '★戻せるよう変更前の行をログに出す');
ok(sandbox.Logger._log.join('\n').indexOf('測定管理') >= 0, '追加する行の中身をログに出す');

sec('実行すると台帳へ反映される');
sh = freshSheet();
const run = sandbox['AAA_ランチャー測定管理を出す']();
eq(run.ok, true, '読み戻し検証に通る');
eq(sh.grid.length - 1, 12, '★行数が 元の11 → 12（＋1）');
const cat = recordCat(sh);
eq(cat.length, 10, '「利用者の記録」が10本になる');
eq(cat.map(x => x.name), [
  '体重チェック', '⛔口腔機能管理（使わない）', '口腔実施記録', '口腔モニ・評価・計画', '身長チェック',
  '通所介護計画管理', '出席率・利用頻度', '個別機能訓練計画書', '測定管理', '⛔身体機能評価（使わない）'
], '★期待どおりの並び（測定管理は個訓の次・⛔は末尾）');

sec('追加された測定管理の行の中身');
const sok = cat.find(x => slug(x.url) === 'sokutei');
ok(!!sok, 'sokutei の行がある');
eq(sok.name, '測定管理', '表示名');
eq(sok.icon, '📐', 'アイコンは📐');
eq(sok.order, 9, '表示順9（既存1〜8と衝突しない）');
eq(sok.scope, 'staff', '公開区分は staff（internalへ落とさない＝現場に出る）');
eq(sok.url, B + 'sokutei.html', 'URL');
const sokRow = sh.grid.slice(1).find(r => slug(r[3]) === 'sokutei');
eq(sokRow.length, 14, '14列で作られる');
eq(sokRow[9], '2026-07-29', '作成日が入る');
eq(sokRow[10], '2026-07-29', '最終更新日が入る');
eq(sokRow[1], '利用者の記録', 'カテゴリ');
ok(String(sokRow[2]).length > 0, '説明が入る');

sec('measure-app は名前以外1バイトも変えない（行も消さない）');
const beforeMA = baseRows().find(r => slug(r[3]) === 'measure-app');
const afterMA = sh.grid.slice(1).find(r => slug(r[3]) === 'measure-app');
ok(!!afterMA, '★行は残っている（消していない）');
eq(afterMA[0], '⛔身体機能評価（使わない）', 'アプリ名だけ⛔表記になる');
eq(afterMA[3], beforeMA[3], '★URLは変わらない（ブックマークが壊れない）');
eq(afterMA[4], beforeMA[4], '★公開区分(scope)は変わらない');
eq(afterMA[1], beforeMA[1], 'カテゴリは変わらない');
eq(afterMA[12], beforeMA[12], 'icon は変わらない');
eq(afterMA[13], beforeMA[13], '表示順は変わらない');
eq(afterMA[2], beforeMA[2], '説明は変わらない');
eq(afterMA[9], beforeMA[9], '作成日は変わらない');
eq(afterMA[10], beforeMA[10], '最終更新日も動かさない（指示どおり1セルのみ変更）');

sec('既存の行がどれも消えない・壊れない');
const beforeAll = baseRows();
beforeAll.forEach(r => {
  const s = slug(r[3]);
  const after = sh.grid.slice(1).find(x => slug(x[3]) === s);
  ok(!!after, s + ' の行が残っている');
  if (s !== 'measure-app') eq(after, r, s + ' は1バイトも変わっていない');
});

sec('冪等: 2回目・3回目を実行しても増えない・⛔が重ならない');
const run2 = sandbox['AAA_ランチャー測定管理を出す']();
eq(sh.grid.length - 1, 12, '2回目でも行数は12のまま');
eq(run2.plan.alreadyRegistered, true, '2回目は「既に登録済み」と判定');
eq(run2.plan.renameAlready, true, '2回目は「既に⛔が付いている」と判定');
sandbox['AAA_ランチャー測定管理を出す']();
eq(sh.grid.length - 1, 12, '3回目でも行数は12のまま');
const ma3 = sh.grid.slice(1).find(r => slug(r[3]) === 'measure-app');
eq(ma3[0], '⛔身体機能評価（使わない）', '★⛔⛔ にならない');
eq(sh.grid.slice(1).filter(r => slug(r[3]) === 'sokutei').length, 1, '★sokutei の行は1本だけ');

sec('冪等: 登録済みの台帳に対する確認のみは「変更なし」と言う');
sandbox.Logger._log = [];
const dry2 = sandbox['AAA_ランチャー測定管理を出す_確認のみ']();
eq(dry2.plan.alreadyRegistered, true, '既に登録済み');
const log2 = sandbox.Logger._log.join('\n');
ok(log2.indexOf('既に登録済み・変更なし') >= 0, '「既に登録済み・変更なし」と出る');
ok(log2.indexOf('既に⛔が付いている・変更なし') >= 0, '「既に⛔が付いている・変更なし」と出る');

sec('他カテゴリを巻き込まない');
eq(sh.grid.slice(1).filter(r => r[1] === 'メインボード').length, 1, 'メインボードの行数は不変');
eq(sh.grid.slice(1).filter(r => r[1] === '毎日の業務').length, 1, '毎日の業務の行数は不変');
eq(sh.grid.slice(1).filter(r => r[4] === 'internal').length, 0, '★どの行も internal へ落ちていない');

sec('純関数 launcherPlanSokutei_ は入力を書き換えない（副作用なし）');
const inRows = baseRows();
const snapshot = JSON.stringify(inRows);
sandbox.launcherPlanSokutei_(inRows, '2026-07-29');
eq(JSON.stringify(inRows), snapshot, '★渡した配列が変わらない');

sec('measure-app が台帳に無くても落ちない');
SHEETS = {};
const sh2 = new FakeSheet('アプリ台帳');
sh2.grid = [HEADERS.slice()].concat(baseRows().filter(r => slug(r[3]) !== 'measure-app').map(r => r.slice()));
SHEETS['アプリ台帳'] = sh2;
sandbox.Logger._log = [];
const run3 = sandbox['AAA_ランチャー測定管理を出す']();
eq(run3.ok, true, '成功する');
eq(run3.plan.measureAppFound, false, 'measure-app 無しと判定');
ok(sandbox.Logger._log.join('\n').indexOf('measure-app の行が見つからない') >= 0, 'ログにその旨が出る');
eq(sh2.grid.slice(1).filter(r => slug(r[3]) === 'sokutei').length, 1, 'sokutei の追加はできている');

// =====================================================================
sec('⚠️ 危険な関数を呼んでいないこと');
const added = [
  extractFn(code, 'launcherPlanSokutei_'),
  extractFn(code, 'launcherAddSokutei_'),
  extractFn(code, 'AAA_ランチャー測定管理を出す_確認のみ'),
  extractFn(code, 'AAA_ランチャー測定管理を出す')
].join('\n');
eq(/appregistryMigrateLauncherV2/.test(added), false,
  '★今回追加したコードは appregistryMigrateLauncherV2 を1回も呼んでいない');
eq(/launcherApplyMapping_/.test(added), false, '★台帳を作り直す launcherApplyMapping_ も呼んでいない');
eq(/LAUNCHER_MAPPING/.test(added), false, '★マッピング表そのものも参照していない（台帳が単一の正）');
eq(/clearContent|deleteRow|deleteRows/.test(added), false, '★行の削除・全域クリアをしない');

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
