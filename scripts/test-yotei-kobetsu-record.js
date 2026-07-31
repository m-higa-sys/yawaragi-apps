// 予定月スライド方式 段階3（個訓）: 計画書を記録したら予定月が進む
// 実行: node scripts/test-yotei-kobetsu-record.js
//
// 仕様（クロ確定 2026-07-31）:
//   updateKeikakusho(field=keikaku_date, value=日付) の成功後に
//     nextYm = 「記録した行の年月」＋ planMonths   ★起点は作成日ではなく行の年月
//   を domain='kobetsu' の予定月へ書く（resetSlide=true / syncCycleFromCare は渡さない）。
//   tasseido_date（評価）では予定月を更新しない。日付のクリアでも更新しない。
//   予定月の更新に失敗したら計画書側の書き込みを巻き戻す（片方だけ成功を残さない）。
//
// 純関数は yotei-core.js の実バイト、GAS層は コード.js の実バイトを抽出して呼ぶ
// （テスト用に写した別実装ではない）。本番スプレッドシートには一切触れない。

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'gas', 'yawaragi-board', 'コード.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(ROOT, 'gas', 'yawaragi-board', 'yotei-core.js'), 'utf8');
const core = require(path.join(ROOT, 'gas', 'yawaragi-board', 'yotei-core.js'));

let pass = 0, fail = 0;
function eq(a, e, l) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('  PASS ' + l); }
  else { fail++; console.log('  FAIL ' + l + '\n    actual  =' + A + '\n    expected=' + E); }
}
function ok(c, l) { eq(!!c, true, l); }
function sec(t) { console.log('\n[' + t + ']'); }

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
// doGet 内の 1 ブロック（if (action === '...') { ... }）を実バイトのまま切り出す
function extractActionBlock(src, action) {
  const marker = "if (action === '" + action + "') {";
  const s = src.indexOf(marker);
  if (s < 0) throw new Error('action ブロック ' + action + ' が無い');
  const b = src.indexOf('{', s); let d = 0, i = b;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}

// =====================================================================
// A) 純関数（yotei-core.js）
// =====================================================================
sec('A) 純関数: 次回予定月 = 行の年月 ＋ planMonths');
const nextYm = core.nextYmAfterKeikakuRow;
const cyc = core.kobetsuCycleMonths;
const should = core.shouldAdvanceKobetsuYotei;

ok(typeof nextYm === 'function', 'nextYmAfterKeikakuRow が export されている');
ok(typeof cyc === 'function', 'kobetsuCycleMonths が export されている');
ok(typeof should === 'function', 'shouldAdvanceKobetsuYotei が export されている');

eq(nextYm(2026, 5, 3), '2026-08', '2026-05 の行＋3 → 2026-08');
eq(nextYm(2026, 8, 3), '2026-11', '2026-08 の行＋3 → 2026-11（8月へスライドした人の次は11月）');
eq(nextYm('2026', '8', '3'), '2026-11', '文字列で来ても同じ（GASのパラメータは文字列）');

sec('A-2) 年跨ぎ');
eq(nextYm(2025, 12, 3), '2026-03', '2025-12＋3 → 2026-03');
eq(nextYm(2025, 11, 3), '2026-02', '2025-11＋3 → 2026-02');
eq(nextYm(2026, 10, 6), '2027-04', '2026-10＋6 → 2027-04');
eq(nextYm(2026, 12, 1), '2027-01', '2026-12＋1 → 2027-01');

sec('A-3) planMonths が変則／不正');
eq(nextYm(2026, 5, 1), '2026-06', 'planMonths=1');
eq(nextYm(2026, 5, 2), '2026-07', 'planMonths=2');
eq(nextYm(2026, 5, 6), '2026-11', 'planMonths=6');
eq(nextYm(2026, 5, 0), '2026-08', 'planMonths=0（不正）は既定3');
eq(nextYm(2026, 5, 99), '2026-08', 'planMonths=99（範囲外）は既定3');
eq(nextYm(2026, 5, null), '2026-08', 'planMonths 未指定は既定3');
eq(cyc(0), 3, 'kobetsuCycleMonths(0)=3');
eq(cyc(13), 3, 'kobetsuCycleMonths(13)=3');
eq(cyc('4'), 4, 'kobetsuCycleMonths("4")=4');

sec('A-4) 起点が壊れていたら空を返す（予定月を書かない）');
eq(nextYm(0, 5, 3), '', 'year=0 は空');
eq(nextYm(2026, 0, 3), '', 'month=0 は空');
eq(nextYm(2026, 13, 3), '', 'month=13 は空');
eq(nextYm(null, null, 3), '', 'null は空');

sec('A-5) 更新するのは計画書の記録のみ（評価では更新しない）');
eq(should('keikaku_date', '2026-07-31'), true, 'keikaku_date に日付 → 更新する');
eq(should('tasseido_date', '2026-07-31'), false, '★tasseido_date（評価）では更新しない');
eq(should('kyoumi_date', '2026-07-31'), false, 'kyoumi_date では更新しない');
eq(should('seikatsu_date', '2026-07-31'), false, 'seikatsu_date では更新しない');
eq(should('keikaku_sent_date', '2026-07-31'), false, 'keikaku_sent_date（送付）では更新しない');
eq(should('keikaku_date', ''), false, '★日付のクリアでは更新しない（予定月が勝手に進むのを防ぐ）');
eq(should('keikaku_date', '   '), false, '空白だけもクリア扱い');
eq(should('', ''), false, '空 field は更新しない');

sec('A-6) 記録の上書き（同じ行を2回記録しても同じ答え）');
eq(nextYm(2026, 8, 3), nextYm(2026, 8, 3), '同じ行を2回記録しても nextYm は同じ（冪等）');
eq(nextYm(2026, 11, 3), '2027-02', '次のサイクル（2026-11 の行）を記録したら 2027-02 へ進む');

// =====================================================================
// 偽 Sheets（本番には触らない）
// =====================================================================
function FakeSheet(name) { this.name = name; this.grid = []; this.frozen = 0; this.deleted = 0; }
FakeSheet.prototype._ensure = function (r, c) {
  while (this.grid.length < r) this.grid.push([]);
  for (let i = 0; i < this.grid.length; i++) { while (this.grid[i].length < c) this.grid[i].push(''); }
};
FakeSheet.prototype.getRange = function (row, col, nRows, nCols) {
  const self = this;
  nRows = nRows || 1; nCols = nCols || 1;
  if (typeof row === 'string') return { setNumberFormat: function () { return this; } };
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
    setNumberFormat: function () { return api; },
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
FakeSheet.prototype.appendRow = function (row) { this.grid.push(row.slice()); return this; };
FakeSheet.prototype.deleteRow = function (idx) { this.grid.splice(idx - 1, 1); this.deleted++; return this; };
FakeSheet.prototype.getLastRow = function () { return this.grid.length; };
FakeSheet.prototype.getLastColumn = function () { return this.grid.length ? this.grid[0].length : 0; };
FakeSheet.prototype.setFrozenRows = function (n) { this.frozen = n; return this; };

// 「個別機能訓練計画書記録」の 16 列（col1=userId, 2=name, 3=year, 4=month, 7=keikaku_date, 8=updated_at）
const KK_HEADERS = ['userId', 'name', 'year', 'month', 'kyoumi_date', 'seikatsu_date', 'keikaku_date',
  'updated_at', 'blocked_reason', 'hyouka_pdf_date', 'hyouka_print_date', 'keikaku_sent_date',
  'sokutei_date', 'sokutei_by', 'output_by', 'tasseido_date'];

// sandbox 生成。writeYoteiImpl を渡すと writeYotei_ をそれに差し替える（失敗注入用）
function makeEnv(opts) {
  const o = opts || {};
  const SHEETS = {};
  const kk = new FakeSheet('個別機能訓練計画書記録');
  kk.grid.push(KK_HEADERS.slice());
  (o.kkRows || []).forEach(r => kk.grid.push(r.slice()));
  SHEETS['個別機能訓練計画書記録'] = kk;
  const logs = [];

  const globals = {
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
    sokuteiCycleMonths_: function (care) { return String(care || '').indexOf('要介護') === 0 ? 3 : 4; },
    ensureKeikakushoSheet_: function () { return kk; },
    getKeikakushoTargetUsers_: function () { return (o.users || []).slice(); },
    logKeikakushoOp_: function () { logs.push(Array.prototype.slice.call(arguments)); },
    respond: function (obj) { return obj; },
    __sheets: SHEETS,
    __kk: kk,
    __logs: logs
  };

  let src = coreSrc + '\n'
    + extractVarLine(code, 'YOTEI_HEADERS_') + '\n'
    + extractFn(code, 'ensureYoteiSheet_') + '\n'
    + extractFn(code, 'yoteiRowToObj_') + '\n'
    + extractFn(code, 'readYotei_') + '\n'
    + extractFn(code, 'findYotei_') + '\n'
    + extractFn(code, 'kunrenRollbackKeikaku_') + '\n'
    + extractFn(code, 'kunrenRecordYotei_') + '\n';
  if (o.writeYoteiImpl) globals.writeYotei_ = o.writeYoteiImpl;
  else src += extractFn(code, 'writeYotei_') + '\n';

  // updateKeikakusho ブロックを実バイトのまま関数に包む（doGet の分岐そのものを回す）
  src += 'function handleUpdateKeikakusho(e, callback) {\n'
    + "  var action = 'updateKeikakusho';\n"
    + extractActionBlock(code, 'updateKeikakusho') + '\n'
    + "  return { ok: false, error: 'fellthrough' };\n}\n";

  const names = Object.keys(globals);
  const fn = new Function(...names, src
    + '\nreturn { handleUpdateKeikakusho: handleUpdateKeikakusho, readYotei_: readYotei_, findYotei_: findYotei_,'
    + ' kunrenRecordYotei_: kunrenRecordYotei_, kunrenRollbackKeikaku_: kunrenRollbackKeikaku_, __sheets: __sheets, __kk: __kk, __logs: __logs };');
  return fn(...names.map(n => globals[n]));
}

const USERS = [{ userId: 'U1', name: 'ダミー1', category: '要介護1', planStart: '2026-02', planMonths: 3 },
{ userId: 'U2', name: 'ダミー2', category: '要介護3', planStart: '2026-01', planMonths: 6 }];
const call = (G, p) => G.handleUpdateKeikakusho({ parameter: p }, null);

// =====================================================================
// B) 結線: 計画書を記録したら予定月(kobetsu)が進む
// =====================================================================
sec('B) 計画書を記録 → 予定月(kobetsu)が「行の年月＋planMonths」になる');
{
  const G = makeEnv({ users: USERS });
  // 8月分の計画書を 7/31 に作成（作成日は前月付けになりうる＝起点にしてはいけない）
  const res = call(G, { userId: 'U1', year: '2026', month: '8', field: 'keikaku_date', value: '2026-07-31', operator: 'staffA' });
  eq(res.ok, true, '記録は成功する');
  const row = G.findYotei_('U1', 'kobetsu');
  ok(row, '予定月に kobetsu の行ができる');
  eq(row && row.nextYm, '2026-11', '★nextYm=2026-11（行の年月2026-08＋3）＝作成日2026-07起点の2026-10ではない');
  eq(row && row.cycleMonths, 3, 'cycleMonths=planMonths');
  eq(row && row.slideCount, 0, 'slideCount は0（resetSlide）');
  eq(G.readYotei_('sokutei').length, 0, 'sokutei の行には一切触れない');
  eq(res.yotei && res.yotei.nextYm, '2026-11', 'レスポンスに更新後の予定月が入る');
}
{
  const G = makeEnv({ users: USERS });
  const res = call(G, { userId: 'U2', year: '2025', month: '12', field: 'keikaku_date', value: '2025-11-28', operator: 'staffA' });
  eq(res.ok, true, '年跨ぎでも記録は成功する');
  eq(G.findYotei_('U2', 'kobetsu').nextYm, '2026-06', 'planMonths=6・2025-12＋6 → 2026-06（年跨ぎ）');
  eq(G.findYotei_('U2', 'kobetsu').cycleMonths, 6, 'cycleMonths=6');
}

sec('B-2) 既存行への上書き記録（行が既にある人）');
{
  const G = makeEnv({
    users: USERS,
    kkRows: [['U1', 'ダミー1', 2026, 8, '', '', '', '2026-07-30 10:00:00', '', '', '', '', '', '', '', '']]
  });
  const res = call(G, { userId: 'U1', year: '2026', month: '8', field: 'keikaku_date', value: '2026-07-31', operator: 'staffA' });
  eq(res.ok, true, '既存行の更新でも成功する');
  eq(G.__kk.grid.length, 2, '計画書の行は増えない（ヘッダー＋1行）');
  eq(G.findYotei_('U1', 'kobetsu').nextYm, '2026-11', '予定月は 2026-11');
  // もう一度同じ行を記録（記録の上書き）
  call(G, { userId: 'U1', year: '2026', month: '8', field: 'keikaku_date', value: '2026-08-01', operator: 'staffB' });
  eq(G.readYotei_('kobetsu').length, 1, '2回記録しても予定月の行は1本のまま');
  eq(G.findYotei_('U1', 'kobetsu').nextYm, '2026-11', '同じ行を記録し直しても予定月は動かない（冪等）');
  // 次サイクル（11月分）を記録 → さらに進む
  call(G, { userId: 'U1', year: '2026', month: '11', field: 'keikaku_date', value: '2026-10-25', operator: 'staffB' });
  eq(G.findYotei_('U1', 'kobetsu').nextYm, '2027-02', '次サイクルを記録したら 2027-02 へ進む');
  eq(G.readYotei_('kobetsu').length, 1, '行は1本のまま');
}

sec('B-3) 予定月を更新しないケース');
{
  const G = makeEnv({
    users: USERS,
    kkRows: [['U1', 'ダミー1', 2026, 8, '', '', '2026-07-31', '2026-07-31 10:00:00', '', '', '', '', '', '', '', '']]
  });
  const res = call(G, { userId: 'U1', year: '2026', month: '8', field: 'tasseido_date', value: '2026-08-20', operator: 'staffA' });
  eq(res.ok, true, '評価の記録は成功する');
  eq(G.findYotei_('U1', 'kobetsu'), null, '★tasseido_date（評価）では予定月の行を作らない');
  eq(G.__kk.grid[1][15], '2026-08-20', '評価日そのものは記録されている');
}
{
  const G = makeEnv({
    users: USERS,
    kkRows: [['U1', 'ダミー1', 2026, 8, '', '', '2026-07-31', '2026-07-31 10:00:00', '', '', '', '', '', '', '', '']]
  });
  call(G, { userId: 'U1', year: '2026', month: '8', field: 'keikaku_date', value: '', operator: 'staffA' });
  eq(G.findYotei_('U1', 'kobetsu'), null, '★日付のクリアでは予定月を更新しない');
}
{
  const G = makeEnv({ users: USERS });
  call(G, { userId: 'U1', year: '2026', month: '8', field: 'kyoumi_date', value: '2026-07-20', operator: 'staffA' });
  eq(G.findYotei_('U1', 'kobetsu'), null, 'kyoumi_date でも予定月を更新しない');
}

// =====================================================================
// C) ロールバック（片方だけ成功を残さない）
// =====================================================================
sec('C) 予定月の更新に失敗したら計画書側を巻き戻す');
{
  // 新規行（INSERT）で失敗 → 追記した行を消す
  const G = makeEnv({ users: USERS, writeYoteiImpl: function () { return { ok: false, error: 'boom' }; } });
  const res = call(G, { userId: 'U1', year: '2026', month: '8', field: 'keikaku_date', value: '2026-07-31', operator: 'staffA' });
  eq(res.ok, false, '失敗を隠さず返す');
  eq(res.rolledBack, true, 'rolledBack=true を返す');
  eq(G.__kk.grid.length, 1, '★追記した計画書の行が消えている（ヘッダーのみ）');
  eq(G.__logs.length, 0, '操作ログも書かない（巻き戻した状態と一致させる）');
}
{
  // 既存行（UPDATE）で失敗 → 元の値と更新日時を戻す
  const G = makeEnv({
    users: USERS, writeYoteiImpl: function () { return { ok: false, error: 'boom' }; },
    kkRows: [['U1', 'ダミー1', 2026, 8, '2026-07-10', '', '', '2026-07-10 09:00:00', '', '', '', '', '', '', '', '']]
  });
  const res = call(G, { userId: 'U1', year: '2026', month: '8', field: 'keikaku_date', value: '2026-07-31', operator: 'staffA' });
  eq(res.ok, false, '失敗を隠さず返す');
  eq(res.rolledBack, true, 'rolledBack=true を返す');
  eq(G.__kk.grid.length, 2, '行は消さない（既存行だから）');
  eq(G.__kk.grid[1][6], '', '★keikaku_date が記録前（空）に戻っている');
  eq(G.__kk.grid[1][7], '2026-07-10 09:00:00', '★updated_at も記録前に戻っている');
  eq(G.__kk.grid[1][4], '2026-07-10', '他の列は巻き戻しても壊れない');
  eq(G.__logs.length, 0, '操作ログも書かない');
}
{
  // 起点が壊れている（予定月を計算できない）→ 書き込みを残さない
  const G = makeEnv({ users: USERS });
  const res = call(G, { userId: 'U1', year: '2026', month: '13', field: 'keikaku_date', value: '2026-07-31', operator: 'staffA' });
  eq(res.ok, false, 'month=13 は invalid params で弾かれる（そもそも記録しない）');
  eq(G.__kk.grid.length, 1, '計画書の行は増えない');
}
{
  // 予定月シートが壊れていて writeYotei_ が例外を投げる場合も巻き戻す
  const G = makeEnv({
    users: USERS, writeYoteiImpl: function () { throw new Error('sheet down'); }
  });
  const res = call(G, { userId: 'U1', year: '2026', month: '8', field: 'keikaku_date', value: '2026-07-31', operator: 'staffA' });
  eq(res.ok, false, '例外でも ok:false を返す（500にしない）');
  eq(res.rolledBack, true, 'rolledBack=true');
  eq(G.__kk.grid.length, 1, '★追記した計画書の行が消えている');
}

sec('C-2) 成功時は操作ログが従来どおり残る');
{
  const G = makeEnv({ users: USERS });
  call(G, { userId: 'U1', year: '2026', month: '8', field: 'keikaku_date', value: '2026-07-31', operator: 'staffA' });
  eq(G.__logs.length, 1, 'logKeikakushoOp_ が1回呼ばれる（既存の挙動を壊さない）');
}

// =====================================================================
// D) 既存機能を壊していないこと
// =====================================================================
sec('D) 既存（sokutei / 段階1の seeder）を壊していない');
{
  ok(typeof core.buildInitialYotei === 'function', 'buildInitialYotei（sokutei版）は健在');
  ok(typeof core.buildInitialYoteiKobetsu === 'function', 'buildInitialYoteiKobetsu（段階1）は健在');
  ok(typeof core.ymAdd === 'function' && typeof core.isDue === 'function', 'ymAdd / isDue は健在');
  ok(code.indexOf("writeYotei_(adUserId, 'sokutei'") > 0, 'addSokuteiDone は sokutei へ書き続けている');
  ok(code.indexOf('syncCycleFromCare: true') > 0, 'addSokuteiDone の syncCycleFromCare はそのまま');
  const kunrenBlock = extractFn(code, 'kunrenRecordYotei_');
  eq(kunrenBlock.indexOf('syncCycleFromCare'), -1, '★個訓側は syncCycleFromCare を渡さない（周期を介護度で書き換えない）');
  ok(kunrenBlock.indexOf("'kobetsu'") > 0, '個訓側は domain=kobetsu へ書く');
}

// =====================================================================
// E) 社長がGASエディタから回す入口（段階2の投入手段）
// =====================================================================
sec('E) 投入用ラッパー（GASエディタの関数プルダウンから引数なしで実行できる）');
{
  ok(code.indexOf('function AAA_予定月シート初期値生成_個訓_確認のみ(') > 0, '確認のみ（dryRun）の入口がある');
  ok(code.indexOf('function AAA_予定月シート初期値生成_個訓(') > 0, '投入の入口がある');
  const dry = extractFn(code, 'AAA_予定月シート初期値生成_個訓_確認のみ');
  const run = extractFn(code, 'AAA_予定月シート初期値生成_個訓');
  ok(dry.indexOf('setupYoteiKobetsuInitial_(true)') > 0, '確認のみは dryRun=true（書き込み0）');
  ok(run.indexOf('setupYoteiKobetsuInitial_(false)') > 0, '投入は dryRun=false');
  eq(dry.indexOf('setupYoteiInitial_('), -1, '★測定(sokutei)版の seeder は呼ばない');
  eq(run.indexOf('setupYoteiInitial_('), -1, '★測定(sokutei)版の seeder は呼ばない');
  // 要約ログが実際に読める形で出るか（社長がログだけで過去月0名を判断できること）
  const sum = new Function('return ' + extractFn(code, '_予定月個訓_要約_'))();
  const line = sum({
    targets: 52, inserted: 0,
    stats: { fromRecord: 51, fromPlanStart: 0, noAnchor: 1, pastYm: 0, skippedExisting: 0, byYm: { '2026-09': 14, '2026-10': 16 } }
  });
  ok(line.indexOf('★過去月0名') > 0, 'ログに「★過去月0名」が出る（投入可否の判断材料）');
  ok(line.indexOf('作る行30件') > 0, '作る行の件数が月別分布の合計と一致する');
  ok(line.indexOf('2026-09:14名') > 0, '月別分布がそのまま読める');
}

console.log('\n==== ' + (fail === 0 ? 'ALL GREEN' : 'FAILED') + '  pass=' + pass + ' fail=' + fail + ' ====');
if (fail !== 0) process.exit(1);
