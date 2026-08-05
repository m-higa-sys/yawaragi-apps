// test-launcher-teishutsu-row.js
// ランチャー台帳へ「ケアマネ提出（10日便）」(teishutsu) を出す更新の検証（2026-08-05）。
// 本番スプレッドシートには一切触れず、コード.js の実バイト（launcherPlanTeishutsu_ /
// launcherAddTeishutsu_）を抽出し、SpreadsheetApp を偽物に差し替えて呼ぶ。
// 構成は前例 test-launcher-sokutei-row.js（2026-07-29）と同型。
//
//   - 「相談員業務」カテゴリが期待どおりの並びになる
//     （担会・契約後 → ケアマネ送付チェック → ケアマネ提出（10日便） → 見学・体験・新規）
//   - 2回・3回実行しても行が重複しない（冪等）
//   - 既存3本が1バイトも変わらない（★今回は既存行の書き換えが「ゼロ」＝sokutei時と違い改名も無い）
//   - 確認のみ（dryRun）は台帳に1バイトも書かない
//   - ⚠️差分に appregistryMigrateLauncherV2 / launcherApplyMapping_ を呼ぶコードが無い
//
// ★表示順 2.5 の意味（描画側の実挙動に依存するのでここで固定する）:
//   applauncher-render.js は parseInt(表示順,10) で丸めるため 2.5 → 2 となり
//   「ケアマネ送付チェック」(2) と同値になる。同値はアプリ名の localeCompare('ja') で決まり、
//   'ケアマネ送付チェック' < 'ケアマネ提出（10日便）' なので直後に並ぶ。
//   → 既存行を1セルも触らずに「直後」を実現できる（前例: 請求集計ビュー=6.5）。
// 実行: node scripts/test-launcher-teishutsu-row.js

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

// ---- 偽 Sheets（前例と同一）----
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
// 本番の「相談員業務」3行を実測どおりに再現
// （2026-08-05 実測: action=getAppRegistry&scope=staff の応答より）
function baseRows() {
  const mk = (name, cat, desc, url, icon, order) => {
    const r = new Array(14).fill('');
    r[0] = name; r[1] = cat; r[2] = desc; r[3] = url; r[4] = 'staff';
    r[9] = '2026-06-18'; r[10] = '2026-06-18'; r[12] = icon; r[13] = order;
    return r;
  };
  return [
    mk('担会・契約後', '相談員業務', '', B + 'after-contract.html', '📋', 1),
    mk('ケアマネ送付チェック', '相談員業務', '', B + 'ケアマネ送付チェックリスト.html', '📋', 2),
    mk('見学・体験・新規', '相談員業務', '見学・体験・新規利用者の受入対応チェック', B + 'intake.html', '🏠', 3),
    // 他カテゴリも混ぜて「巻き込まないこと」を見る
    mk('yawaragiボード', 'メインボード', '', B + 'genba.html', '📋', 1),
    mk('測定管理', '利用者の記録', '', B + 'sokutei.html', '📐', 9),
    mk('請求集計ビュー（月次）', '事務・手続き', '', B + 'seikyu-board.html', '📊', 6.5)
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
  Utilities: { formatDate: function () { return '2026-08-05'; } },
  Logger: { _log: [], log: function (m) { this._log.push(String(m)); } },
  Date: Date, String, Number, Object, Array, JSON, Error, console
};
vm.createContext(sandbox);
vm.runInContext(extractFn(mappingSrc, 'launcherSlugFromUrl_'), sandbox);
[
  'LAUNCHER_TEISHUTSU_URL_', 'LAUNCHER_TEISHUTSU_NAME_', 'LAUNCHER_TEISHUTSU_ICON_',
  'LAUNCHER_TEISHUTSU_CAT_', 'LAUNCHER_TEISHUTSU_ORDER_', 'LAUNCHER_TEISHUTSU_DESC_'
].forEach(v => vm.runInContext(extractVarLine(code, v), sandbox));
vm.runInContext(extractFn(code, 'launcherPlanTeishutsu_'), sandbox);
vm.runInContext(extractFn(code, 'launcherAddTeishutsu_'), sandbox);
vm.runInContext(extractFn(code, 'AAA_ランチャーケアマネ提出を出す_確認のみ'), sandbox);
vm.runInContext(extractFn(code, 'AAA_ランチャーケアマネ提出を出す'), sandbox);

function freshSheet() {
  SHEETS = {};
  const sh = new FakeSheet('アプリ台帳');
  sh.grid = [HEADERS.slice()].concat(baseRows().map(r => r.slice()));
  SHEETS['アプリ台帳'] = sh;
  sandbox.Logger._log = [];
  return sh;
}
function slug(u) { return String(u).split('/').pop().replace(/\.html$/, ''); }

// applauncher-render.js:19 と同一の丸め＋同値時のアプリ名 localeCompare を再現して並べる
function soudanCat(sh) {
  return sh.grid.slice(1)
    .filter(r => r[1] === '相談員業務' && r[4] === 'staff')
    .map(r => ({ name: r[0], url: r[3], scope: r[4], icon: r[12], order: r[13] }))
    .sort((a, b) => {
      const n = v => { const x = parseInt(v, 10); return isNaN(x) ? 999 : x; };
      return n(a.order) - n(b.order) || String(a.name).localeCompare(String(b.name), 'ja');
    });
}

// =====================================================================
sec('前提: 偽台帳が本番の実測どおり（相談員業務3本）');
let sh = freshSheet();
eq(sh.grid.length - 1, 6, '全6行（相談員業務3＋他カテゴリ3）');
eq(soudanCat(sh).length, 3, '「相談員業務」は3本');
eq(soudanCat(sh).map(x => x.name), ['担会・契約後', 'ケアマネ送付チェック', '見学・体験・新規'], '現状の並び');

sec('確認のみ（dryRun）は台帳に1バイトも書かない');
sh = freshSheet();
const before = JSON.stringify(sh.grid);
const dry = sandbox['AAA_ランチャーケアマネ提出を出す_確認のみ']();
eq(JSON.stringify(sh.grid), before, '★グリッドが1バイトも変わらない');
eq(sh.writes.length, 0, '★書き込みAPIが1回も呼ばれない');
eq(dry.dryRun, true, 'dryRun フラグが立つ');
eq(dry.plan.alreadyRegistered, false, 'まだ未登録と判定する');
ok(sandbox.Logger._log.join('\n').indexOf('確認のみのため、台帳には何も書いていません') >= 0, 'ログに書き込みなしと出る');
ok(sandbox.Logger._log.join('\n').indexOf('ケアマネ提出（10日便）') >= 0, '追加する行の中身をログに出す');

sec('実行すると台帳へ反映される');
sh = freshSheet();
const run = sandbox['AAA_ランチャーケアマネ提出を出す']();
eq(run.ok, true, '読み戻し検証に通る');
eq(sh.grid.length - 1, 7, '★行数が 元の6 → 7（＋1）');
eq(sh.writes.length, 1, '★書き込みは1回だけ（追記した1行のみ）');
const cat = soudanCat(sh);
eq(cat.length, 4, '「相談員業務」が4本になる');
eq(cat.map(x => x.name), [
  '担会・契約後', 'ケアマネ送付チェック', 'ケアマネ提出（10日便）', '見学・体験・新規'
], '★期待どおりの並び（ケアマネ送付チェックの直後・見学より前）');

sec('追加された行の中身');
const t = cat.find(x => slug(x.url) === 'teishutsu');
ok(!!t, 'teishutsu の行がある');
eq(t.name, 'ケアマネ提出（10日便）', '表示名（送付チェックリストと混同しない名前）');
eq(t.order, 2.5, '★表示順は2.5（既存の1・2・3を1つも動かさない）');
eq(t.scope, 'staff', '公開区分は staff（internalへ落とさない＝現場に出る）');
eq(t.url, B + 'teishutsu.html', 'URL');
eq(t.icon, '📤', 'アイコンは📤');
const tRow = sh.grid.slice(1).find(r => slug(r[3]) === 'teishutsu');
eq(tRow.length, 14, '14列で作られる');
eq(tRow[1], '相談員業務', 'カテゴリ');
eq(tRow[9], '2026-08-05', '作成日が入る');
eq(tRow[10], '2026-08-05', '最終更新日が入る');
ok(String(tRow[2]).length > 0, '説明が入る');

sec('★既存行は1バイトも変わらない（今回は改名すら無い＝純粋な追加のみ）');
const beforeAll = baseRows();
beforeAll.forEach(r => {
  const s = slug(r[3]);
  const after = sh.grid.slice(1).find(x => slug(x[3]) === s);
  ok(!!after, s + ' の行が残っている');
  eq(after, r, '★' + s + ' は1バイトも変わっていない');
});

sec('相談員業務のアイコンが既存と重ならない');
eq(cat.filter(x => x.icon === '📤').length, 1, '📤 は新規1本だけ');

sec('冪等: 2回目・3回目を実行しても増えない');
const run2 = sandbox['AAA_ランチャーケアマネ提出を出す']();
eq(sh.grid.length - 1, 7, '2回目でも行数は7のまま');
eq(run2.plan.alreadyRegistered, true, '2回目は「既に登録済み」と判定');
sandbox['AAA_ランチャーケアマネ提出を出す']();
eq(sh.grid.length - 1, 7, '3回目でも行数は7のまま');
eq(sh.grid.slice(1).filter(r => slug(r[3]) === 'teishutsu').length, 1, '★teishutsu の行は1本だけ');

sec('冪等: 登録済みの台帳に対する確認のみは「変更なし」と言う');
sandbox.Logger._log = [];
const dry2 = sandbox['AAA_ランチャーケアマネ提出を出す_確認のみ']();
eq(dry2.plan.alreadyRegistered, true, '既に登録済み');
ok(sandbox.Logger._log.join('\n').indexOf('既に登録済み・変更なし') >= 0, '「既に登録済み・変更なし」と出る');

sec('他カテゴリを巻き込まない');
eq(sh.grid.slice(1).filter(r => r[1] === 'メインボード').length, 1, 'メインボードの行数は不変');
eq(sh.grid.slice(1).filter(r => r[1] === '利用者の記録').length, 1, '利用者の記録の行数は不変');
eq(sh.grid.slice(1).filter(r => r[1] === '事務・手続き').length, 1, '事務・手続きの行数は不変');
eq(sh.grid.slice(1).filter(r => r[4] === 'internal').length, 0, '★どの行も internal へ落ちていない');

sec('純関数 launcherPlanTeishutsu_ は入力を書き換えない（副作用なし）');
const inRows = baseRows();
const snapshot = JSON.stringify(inRows);
sandbox.launcherPlanTeishutsu_(inRows, '2026-08-05');
eq(JSON.stringify(inRows), snapshot, '★渡した配列が変わらない');

sec('台帳が空（ヘッダーのみ）でも落ちない');
SHEETS = {};
const sh2 = new FakeSheet('アプリ台帳');
sh2.grid = [HEADERS.slice()];
SHEETS['アプリ台帳'] = sh2;
sandbox.Logger._log = [];
const run3 = sandbox['AAA_ランチャーケアマネ提出を出す']();
eq(run3.ok, true, '成功する');
eq(sh2.grid.slice(1).filter(r => slug(r[3]) === 'teishutsu').length, 1, 'teishutsu の追加はできている');

// =====================================================================
sec('⚠️ 危険な関数を呼んでいないこと');
const added = [
  extractFn(code, 'launcherPlanTeishutsu_'),
  extractFn(code, 'launcherAddTeishutsu_'),
  extractFn(code, 'AAA_ランチャーケアマネ提出を出す_確認のみ'),
  extractFn(code, 'AAA_ランチャーケアマネ提出を出す')
].join('\n');
eq(/appregistryMigrateLauncherV2/.test(added), false,
  '★今回追加したコードは appregistryMigrateLauncherV2 を1回も呼んでいない');
eq(/launcherApplyMapping_/.test(added), false, '★台帳を作り直す launcherApplyMapping_ も呼んでいない');
eq(/LAUNCHER_MAPPING/.test(added), false, '★マッピング表そのものも参照していない（台帳が単一の正）');
eq(/clearContent|deleteRow|deleteRows/.test(added), false, '★行の削除・全域クリアをしない');

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
