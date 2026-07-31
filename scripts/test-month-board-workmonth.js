// 月次ボード core: 個訓計画書(kunPlan)の「作業月＝前月付け」済判定テスト（純関数・require方式）
// 実行: node scripts/test-month-board-workmonth.js
// 背景（診断「個訓_サイクルずれと偽の未_診断」）:
//   計画書は「作業月＝前月」に作成し前月日付を keikaku_date に持つ運用（グリッド kobetsuCycleAt）。
//   旧 _mbFieldDone_ は当月日付のみ済にするため、前月付けの作成済みが「偽の未」になっていた。
// 仕様（クロ確定・案1）:
//   ・_mbFieldDoneWorkMonth_: keikaku_date が ym（当月）または ym-1（前月＝作業月）にあれば done。
//   ・kunPlan の done を _mbFieldDoneWorkMonth_ に差し替え。当月付け・空・blocked の挙動は不変。
//   ・kunEval(tasseido_date) は無改修（前月問題なし＝在月判定のまま）。
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'month-board-core.js'));
const buildMonthBoard = core.buildMonthBoard;
const wm = core._mbFieldDoneWorkMonth_;
const prevYm = core._mbPrevYm_;

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };
const eq = (name, got, want) => ok(name + '  (got=' + JSON.stringify(got) + ')', JSON.stringify(got) === JSON.stringify(want));

// ===== A) _mbPrevYm_ 純関数 =====
eq('A1 前月(月内)', prevYm('2026-07'), '2026-06');
eq('A2 年跨ぎ 1月→前年12月', prevYm('2026-01'), '2025-12');
eq('A3 不正入力→空', prevYm('bad'), '');
eq('A4 空→空', prevYm(''), '');

// ===== B) _mbFieldDoneWorkMonth_ 純関数 =====
ok('B1 前月付け(2026-06-25, ym=2026-07)→done', wm({ keikaku_date: '2026-06-25' }, 'keikaku_date', '2026-07').done === true);
ok('B2 当月付け(2026-07-01)→done', wm({ keikaku_date: '2026-07-01' }, 'keikaku_date', '2026-07').done === true);
ok('B3 前々月(2026-05-31)→未(前月でも当月でもない)', wm({ keikaku_date: '2026-05-31' }, 'keikaku_date', '2026-07').done === false);
ok('B4 翌月(2026-08-01)→未', wm({ keikaku_date: '2026-08-01' }, 'keikaku_date', '2026-07').done === false);
ok('B5 空→未', wm({ keikaku_date: '' }, 'keikaku_date', '2026-07').done === false);
ok('B6 rec無し→未', wm(null, 'keikaku_date', '2026-07').done === false);
eq('B7 doneDate は実日付を返す', wm({ keikaku_date: '2026-06-25' }, 'keikaku_date', '2026-07').doneDate, '2026-06-25');
ok('B8 年跨ぎ前月(2025-12-20, ym=2026-01)→done', wm({ keikaku_date: '2025-12-20' }, 'keikaku_date', '2026-01').done === true);

// ===== C) buildMonthBoard kunPlan シナリオ（実物ロード・deps注入）=====
const deps = {
  isPlanMonth: (planStart) => !!planStart,   // planStart 有り=当月を計画月扱い
  isHyoukaMonth: () => false,
  sbNormalizeName_: (s) => String(s == null ? '' : s).replace(/[\s　]+/g, '')
};
const U = (id, name) => ({ userId: id, name: name, category: '要介護1', planStart: '2026-01', planMonths: 3 });
function build(users, kunRecords) {
  return buildMonthBoard({
    targetMonth: '2026-07', users: users, kunRecords: kunRecords,
    oralRecords: [], sokuteiRecords: [], tsushoSendRecords: [], tsushoDueMap: {}
  }, deps);
}
const kunPlan = (b) => b.sections.find(s => s.key === 'kunPlan');

{
  const b = build(
    [U('w', '前月付け作成'), U('c', '当月付け作成'), U('n', '未作成'), U('bl', '保留者')],
    [
      { userId: 'w', name: '前月付け作成', keikaku_date: '2026-06-25' }, // 作業月＝前月に作成
      { userId: 'c', name: '当月付け作成', keikaku_date: '2026-07-01' }, // 当月に作成
      { userId: 'bl', name: '保留者', blocked_reason: '保険未登録' }      // 保留
    ]
  );
  const s = kunPlan(b);
  const done = (nm) => s.targets.find(t => t.name === nm);
  ok('C1 前月付け作成 → 済（偽の未の是正）', done('前月付け作成') && done('前月付け作成').done === true);
  ok('C2 当月付け作成 → 済（回帰）', done('当月付け作成') && done('当月付け作成').done === true);
  ok('C3 未作成 → 未（回帰）', done('未作成') && done('未作成').done === false);
  ok('C4 保留者 → kunPlan対象外（blocked除外・回帰）', !s.targets.some(t => t.name === '保留者'));
  eq('C5 対象=3（保留は分母外）', s.countTarget, 3);
  eq('C6 済=2（前月付け＋当月付け）', s.countDone, 2);
  eq('C7 未=1（未作成のみ）', s.countUndone, 1);
}

// ===== D) kunEval(tasseido_date) 現挙動の固定（回帰テスト・2026-07-31 クロ確定）=====
// ★これは「変更しないこと」を守るためのテスト。kunEval は無改修＝在月判定(_mbFieldDone_)のまま。
//   評価には前倒し運用が存在しない（アプリの showEval は自セル判定・月ずらし無し）ため受入幅を広げない。
//   将来 kunEval にも作業月判定を入れたくなったら、D1 が赤くなることで「仕様変更である」と気づける。
const depsEval = {
  isPlanMonth: () => false,                  // kunPlan を切り離して kunEval だけを見る
  isHyoukaMonth: (planStart) => !!planStart, // planStart 有り=当月を評価月扱い
  sbNormalizeName_: (s) => String(s == null ? '' : s).replace(/[\s　]+/g, '')
};
function buildEval(users, kunRecords) {
  return buildMonthBoard({
    targetMonth: '2026-07', users: users, kunRecords: kunRecords,
    oralRecords: [], sokuteiRecords: [], tsushoSendRecords: [], tsushoDueMap: {}
  }, depsEval);
}
const kunEval = (b) => b.sections.find(s => s.key === 'kunEval');

{
  const b = buildEval(
    [U('ew', '評価_前月付け'), U('ec', '評価_当月付け'), U('en', '評価_未作成')],
    [
      { userId: 'ew', name: '評価_前月付け', tasseido_date: '2026-06-25' },
      { userId: 'ec', name: '評価_当月付け', tasseido_date: '2026-07-01' },
      { userId: 'en', name: '評価_未作成', tasseido_date: '' }
    ]
  );
  const s = kunEval(b);
  const t = (nm) => s.targets.find(x => x.name === nm);
  ok('D1 評価_前月付け → 未のまま（kunEvalは無改修＝在月判定を維持）', t('評価_前月付け') && t('評価_前月付け').done === false);
  ok('D2 評価_当月付け → 済（回帰）', t('評価_当月付け') && t('評価_当月付け').done === true);
  ok('D3 評価_未作成 → 未（回帰）', t('評価_未作成') && t('評価_未作成').done === false);
  eq('D4 対象=3', s.countTarget, 3);
  eq('D5 済=1（当月付けのみ）', s.countDone, 1);
  eq('D6 未=2（前月付け＋未作成）', s.countUndone, 2);
}

// ===== E) kunPlan の修正が kunEval へ漏れていないこと（相互不干渉の確認）=====
{
  const b = buildMonthBoard({
    targetMonth: '2026-07',
    users: [{ userId: 'x', name: 'x', category: '要介護1', planStart: '2026-01', planMonths: 3 }],
    kunRecords: [{ userId: 'x', name: 'x', keikaku_date: '2026-06-25', tasseido_date: '2026-06-25' }],
    oralRecords: [], sokuteiRecords: [], tsushoSendRecords: [], tsushoDueMap: {}
  }, {
    isPlanMonth: () => true,
    isHyoukaMonth: () => true,
    sbNormalizeName_: (s) => String(s == null ? '' : s).replace(/[\s　]+/g, '')
  });
  ok('E1 同一の前月日付でも kunPlan=済 / kunEval=未（判定が分かれている）',
    kunPlan(b).countDone === 1 && kunEval(b).countDone === 0);
}

// =====================================================================
// F) 作業月主義への軸シフト（2026-07-31・クロGO）
//   業務ルール仕様書v1.2 §1-3「前月準備の原則」＝N月開始の計画書はN−1月中に作り終える。
//   よってボード月(y,m)の kunPlan は「翌月(y,m+1)が計画期間の開始月か」で数え、
//   済判定も翌月の行（＝計画期間の開始月ノード）から読む。teishutsu.html:319-322 と同じ軸。
//   ★shared.js の isPlanMonth / isHyoukaMonth は不変更。呼び方だけを変える（sokutei.html の先例と同じ）。
//   ★翌月の行は input.kunRecordsNext で供給する。未供給なら旧軸へフォールバックし warning を立てる
//     （黙って全員「未」になる事故を防ぐ）。
// =====================================================================
const fs = require('fs');
const shared = fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8');
eval(shared.match(/function isPlanMonth[\s\S]*?\n}/)[0]);      // 本物を使う（モックでは軸を検証できない）
eval(shared.match(/function isHyoukaMonth[\s\S]*?\n}/)[0]);
const realDeps = {
  isPlanMonth: isPlanMonth,
  isHyoukaMonth: isHyoukaMonth,
  sbNormalizeName_: (s) => String(s == null ? '' : s).replace(/[\s　]+/g, '')
};
// targetMonth のボードを、当月行 cur と翌月行 next を与えて組み立てる
function buildAxis(targetMonth, users, cur, next) {
  const input = {
    targetMonth: targetMonth, users: users, kunRecords: cur,
    oralRecords: [], sokuteiRecords: [], tsushoSendRecords: [], tsushoDueMap: {}
  };
  if (next !== undefined) input.kunRecordsNext = next;
  return buildMonthBoard(input, realDeps);
}
const KU = (id, planStart, planMonths) => ({ userId: id, name: id, category: '要介護1', planStart: planStart, planMonths: planMonths || 3 });
const sec = (b, k) => b.sections.find(s => s.key === k);

// --- F1: 基本の軸シフト。6月ボードが「7月開始」の計画を数える ---
{
  // planStart=2026-01/3ヶ月 → 計画月は 1,4,7,10月。6月ボードは翌月(7月)を見るので対象。
  const b = buildAxis('2026-06', [KU('u', '2026-01')],
    [],                                                   // 6月行は空
    [{ userId: 'u', name: 'u', keikaku_date: '2026-06-24' }]);  // 7月行に前月付けで作成済み
  eq('F1a 6月ボードの kunPlan 対象=1（翌月7月が計画開始月）', sec(b, 'kunPlan').countTarget, 1);
  eq('F1b 6月中に作成済み → 済', sec(b, 'kunPlan').countDone, 1);
}
// --- F2: 旧軸なら対象だった7月ボードは、新軸では対象externo（1ヶ月前倒しされた） ---
{
  const b = buildAxis('2026-07', [KU('u', '2026-01')], [], []);
  eq('F2 7月ボードの kunPlan 対象=0（7月開始分は6月ボードへ移った）', sec(b, 'kunPlan').countTarget, 0);
}
// --- F3: 早く作った / 遅れて作った の両方が済（完了条件）---
{
  const users = [KU('early', '2026-01'), KU('late', '2026-01'), KU('none', '2026-01')];
  const b = buildAxis('2026-06', users, [], [
    { userId: 'early', name: 'early', keikaku_date: '2026-06-24' }, // 作業月(6月)に作成＝正常
    { userId: 'late', name: 'late', keikaku_date: '2026-07-01' },  // 開始月(7月)に作成＝遅れ
    { userId: 'none', name: 'none', keikaku_date: '' }
  ]);
  const s = sec(b, 'kunPlan');
  const t = (n) => s.targets.find(x => x.name === n);
  ok('F3a 作業月(6月)に作成 → 済', t('early') && t('early').done === true);
  ok('F3b 開始月(7月)に作成 → 済（遅れても作ってあれば済）', t('late') && t('late').done === true);
  ok('F3c 未作成 → 未', t('none') && t('none').done === false);
  eq('F3d 対象=3 / 済=2 / 未=1', [s.countTarget, s.countDone, s.countUndone], [3, 2, 1]);
}
// --- F4: 「当月or前月」＝「開始月or作業月」の等価性が成立するか（クロ指定の実証）---
{
  // 2ヶ月前(5月)に作った場合は済にならない＝受入窓が2ヶ月ぶんに広がっていないこと
  const b = buildAxis('2026-06', [KU('u', '2026-01')], [],
    [{ userId: 'u', name: 'u', keikaku_date: '2026-05-20' }]);
  ok('F4 2ヶ月前(5月)付け → 未（受入窓は 作業月6月 と 開始月7月 の2ヶ月だけ）',
    sec(b, 'kunPlan').countDone === 0);
}
// --- F5: 年跨ぎ（12月ボード → 翌年1月開始）---
{
  // planStart=2026-01 → 計画月は 2026-01。12月(2025-12)ボードの翌月が 2026-01。
  const b = buildAxis('2025-12', [KU('u', '2026-01')], [],
    [{ userId: 'u', name: 'u', keikaku_date: '2025-12-20' }]);
  eq('F5a 2025-12ボード kunPlan 対象=1（翌月=2026-01が計画開始月・年跨ぎ）', sec(b, 'kunPlan').countTarget, 1);
  eq('F5b 12月中に作成済み → 済（年跨ぎの前月付け）', sec(b, 'kunPlan').countDone, 1);
}
// --- F6: diff=-1 は kunPlan では対象・kunEval では非対象（幻の督促ガード）---
{
  // planStart=2026-08 の新規。7月ボード: 翌月8月が計画開始月 → kunPlan対象。
  //   一方 isHyoukaMonth は diff=-1 で true になるが、評価すべき前サイクルが無い → kunEval非対象。
  const b = buildAxis('2026-07', [KU('n', '2026-08')], [],
    [{ userId: 'n', name: 'n', keikaku_date: '' }]);
  eq('F6a diff=-1 は kunPlan 対象=1（8月開始なので7月に作る＝正当）', sec(b, 'kunPlan').countTarget, 1);
  eq('F6b diff=-1 は kunEval 対象=0（幻の督促ガード）', sec(b, 'kunEval').countTarget, 0);
}
// --- F7: 正規の評価対象は kunEval に残る（ガードの巻き添えが無いこと）---
{
  // planStart=2026-02 → isHyoukaMonth は diff=5(2026-07) で true。diff>0 なのでガード対象外。
  const b = buildAxis('2026-07', [KU('e', '2026-02')],
    [{ userId: 'e', name: 'e', tasseido_date: '2026-07-10' }], []);
  eq('F7a 正規の評価月は kunEval 対象=1', sec(b, 'kunEval').countTarget, 1);
  eq('F7b 評価済み → 済', sec(b, 'kunEval').countDone, 1);
}
// --- F8: 保留除外が kunPlan / kunEval 両方で効く ---
{
  const bP = buildAxis('2026-06', [KU('bl', '2026-01')], [],
    [{ userId: 'bl', name: 'bl', blocked_reason: '保険未登録' }]);   // 翌月(7月)行の保留
  eq('F8a kunPlan 保留除外（翌月＝計画開始月の行の blocked_reason を見る）', sec(bP, 'kunPlan').countTarget, 0);
  const bE = buildAxis('2026-07', [KU('e', '2026-02')],
    [{ userId: 'e', name: 'e', blocked_reason: '長期休み' }], []);
  eq('F8b kunEval 保留除外（当月行）', sec(bE, 'kunEval').countTarget, 0);
}
// --- F9: planMonths=1 / 2 でも壊れない ---
{
  // planMonths=1 → isPlanMonth は diff===0 のみ。planStart=2026-07 なら7月だけ。6月ボードが拾う。
  const b1 = buildAxis('2026-06', [KU('a', '2026-07', 1)], [],
    [{ userId: 'a', name: 'a', keikaku_date: '2026-06-30' }]);
  eq('F9a planMonths=1 でも軸シフトが効く', [sec(b1, 'kunPlan').countTarget, sec(b1, 'kunPlan').countDone], [1, 1]);
  const b2 = buildAxis('2026-06', [KU('b', '2026-07', 2)], [],
    [{ userId: 'b', name: 'b', keikaku_date: '' }]);
  eq('F9b planMonths=2 でも対象になり、未作成は未', [sec(b2, 'kunPlan').countTarget, sec(b2, 'kunPlan').countUndone], [1, 1]);
}
// --- F10: 該当行が存在しない（未作成）→ 未。例外で落ちない ---
{
  const b = buildAxis('2026-06', [KU('u', '2026-01')], [], []);   // 翌月行そのものが無い
  eq('F10a 行が無い → 対象1・未1（落ちない）', [sec(b, 'kunPlan').countTarget, sec(b, 'kunPlan').countUndone], [1, 1]);
  ok('F10b doneDate は空', ((sec(b, 'kunPlan').targets[0] || {}).doneDate || '') === '');
}
// --- F11: kunRecordsNext 未供給 → 旧軸フォールバック＋warning（黙って壊れない）---
{
  // next を渡さない＝コード.js が未対応のまま core だけ入った状態を模す
  const b = buildAxis('2026-07', [KU('u', '2026-01')],
    [{ userId: 'u', name: 'u', keikaku_date: '2026-06-25' }], undefined);
  eq('F11a フォールバック時は旧軸（7月ボードが7月開始分を数える）', sec(b, 'kunPlan').countTarget, 1);
  eq('F11b フォールバックでも前月付けは済（既存修正を維持）', sec(b, 'kunPlan').countDone, 1);
  ok('F11c warning が立つ（黙って旧軸に落ちない）',
    (b.warnings || []).some(w => w && w.type === 'kunPlanAxisFallback'));
}

// =====================================================================
// G) コード.js monthBoardBuildInput_ の入力組み立て（実物 vm 抽出・再実装しない）
//   kunRecordsNext（翌月＝計画期間の開始月の行）を additive に足した変更の検証。
//   ★最重要: 当月分 kunRecords が変更前と1件も変わらないこと。ここが動くと
//     sokuteiKaigo など既存判定へ波及する。旧版(origin/master)と実測で突き合わせる。
// =====================================================================
const vm = require('vm');
const { execFileSync } = require('child_process');
const CODE_PATH = path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js');

function extractFunction(s, name) {
  const start = s.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  const open = s.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

// 個訓シートの合成行（col0=userId,1=name,2=year,3=month,6=keikaku,8=blocked,12=sokutei,15=tasseido）
// ★氏名は使わない。U1/U2… の記号のみ。
function sheetRow(uid, y, mo, keikaku, blocked, sokutei, tasseido) {
  const r = new Array(16).fill('');
  r[0] = uid; r[1] = uid; r[2] = y; r[3] = mo;
  r[6] = keikaku || ''; r[8] = blocked || ''; r[12] = sokutei || ''; r[15] = tasseido || '';
  return r;
}
const HEADER = new Array(16).fill('h');

// monthBoardBuildInput_ を最小モックで走らせ、input を得る。
// 個訓セクション以外は safe() が例外を飲む（＝null）ので、kunRecords/kunRecordsNext だけが実測対象。
function runBuildInput(srcText, ym, year, month, rows) {
  const ctx = {
    SS_ID: 'x',
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => null }) },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
    ensureKeikakushoSheet_: () => ({ getDataRange: () => ({ getValues: () => [HEADER].concat(rows) }) }),
    console: console
  };
  vm.createContext(ctx);
  vm.runInContext(extractFunction(srcText, 'monthBoardBuildInput_')
    + '\nthis.__run=function(ym,y,m){return monthBoardBuildInput_(ym,y,m,function(n,f){try{return f();}catch(e){return null;}});};', ctx);
  return ctx.__run(ym, year, month);
}

const codeNew = fs.readFileSync(CODE_PATH, 'utf8');
// 旧版の基準は「kunRecordsNext を入れる直前のコミット」に固定する。
// ★2026-07-31 修正: ここは当初 origin/master を指していたが、本変更が master へ反映された時点で
//   旧版＝新版になり G1d が必ず落ちた（自己参照）。ブランチの進みで壊れないよう SHA で固定する。
//   当該コミットが無い clone（shallow 等）では G セクションを SKIP する
//   （test-users-api-default-unchanged.js と同じ「黙って落とさず理由付きで明示」方式）。
const BASE_COMMIT = '9c6ce54';   // = 7804dc8 の親。コード.js に kunRecordsNext がまだ無い版
let codeOld = null, gSkipReason = '';
try {
  codeOld = execFileSync('git', ['show', BASE_COMMIT + ':gas/yawaragi-board/コード.js'],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) {
  gSkipReason = 'BASE_COMMIT ' + BASE_COMMIT + ' が本cloneに存在しないため G セクションを SKIP';
}

// --- G1: 当月分 kunRecords が旧版と完全一致（件数・中身・順序）---
if (!codeOld) { console.log('  SKIP G1（' + gSkipReason + '）'); } else {
  const rows = [
    sheetRow('U1', 2026, 7, '2026-06-25', '', '2026-06-10', ''),   // 当月
    sheetRow('U2', 2026, 8, '2026-07-20', '', '', ''),             // 翌月
    sheetRow('U3', 2026, 6, '2026-05-30', '', '', '2026-06-05'),   // 前月（どちらにも入らない）
    sheetRow('U4', 2026, 7, '', '保険未登録', '', ''),              // 当月・保留
    sheetRow('U5', 2025, 7, '2025-06-20', '', '', ''),             // 他年
    sheetRow('U6', 2026, 8, '', '長期休み', '', '')                 // 翌月・保留
  ];
  const oldIn = runBuildInput(codeOld, '2026-07', 2026, 7, rows).input;
  const newIn = runBuildInput(codeNew, '2026-07', 2026, 7, rows).input;
  eq('G1a 当月 kunRecords が旧版と完全一致（件数・中身・順序）', newIn.kunRecords, oldIn.kunRecords);
  eq('G1b 当月 kunRecords は2件（U1,U4）', newIn.kunRecords.length, 2);
  eq('G1c sokuteiRecords も旧版と完全一致（全月・波及なし）', newIn.sokuteiRecords, oldIn.sokuteiRecords);
  ok('G1d 旧版には kunRecordsNext が存在しない', oldIn.kunRecordsNext === undefined);
  eq('G1e 新版 kunRecordsNext は2件（U2,U6）', newIn.kunRecordsNext.length, 2);
  eq('G1f kunRecordsNext の中身（翌月行のみ・保留も含む）',
    newIn.kunRecordsNext.map(x => [x.userId, x.keikaku_date, x.blocked_reason]),
    [['U2', '2026-07-20', ''], ['U6', '', '長期休み']]);
}
// --- G2: 年跨ぎ（12月ボード → 翌年1月を翌月として拾う）---
if (!codeOld) { console.log('  SKIP G2（' + gSkipReason + '）'); } else {
  const rows = [
    sheetRow('U1', 2025, 12, '2025-11-28', '', '', ''),   // 当月
    sheetRow('U2', 2026, 1, '2025-12-20', '', '', ''),    // 翌月＝翌年1月
    sheetRow('U3', 2025, 1, '2024-12-20', '', '', '')     // 同じ月番号だが前年 → 拾わない
  ];
  const oldIn = runBuildInput(codeOld, '2025-12', 2025, 12, rows).input;
  const newIn = runBuildInput(codeNew, '2025-12', 2025, 12, rows).input;
  eq('G2a 年跨ぎでも当月 kunRecords は旧版と一致', newIn.kunRecords, oldIn.kunRecords);
  eq('G2b 年跨ぎの翌月(2026-01)を1件拾う', newIn.kunRecordsNext.map(x => x.userId), ['U2']);
  ok('G2c 前年同月(2025-01)は拾わない', !newIn.kunRecordsNext.some(x => x.userId === 'U3'));
}
// --- G3: 実入力を core に通すと warning が出ない（フォールバックしない）---
{
  const rows = [sheetRow('U1', 2026, 8, '2026-07-15', '', '', '')];
  const newIn = runBuildInput(codeNew, '2026-07', 2026, 7, rows).input;
  const b = buildMonthBoard(Object.assign({}, newIn, {
    targetMonth: '2026-07',
    users: [KU('U1', '2026-08')],
    oralRecords: [], sokuteiRecords: [], tsushoSendRecords: [], tsushoDueMap: {}
  }), realDeps);
  ok('G3a kunPlanAxisFallback warning が出ない（新軸で動いている）',
    !(b.warnings || []).some(w => w && w.type === 'kunPlanAxisFallback'));
  eq('G3b 8月開始分を7月ボードが済で拾う', [sec(b, 'kunPlan').countTarget, sec(b, 'kunPlan').countDone], [1, 1]);
}
// --- G4: monthBoard(e) と _computeMonthBoard_ が同じビルダを通る（入力の二重定義が無い）---
{
  const calls = (codeNew.match(/monthBoardBuildInput_\s*\(/g) || []).length;
  eq('G4a monthBoardBuildInput_ の呼び出しは2箇所＋定義1（＝3出現）', calls, 3);
  ok('G4b kunRecordsNext を input に載せる箇所は1つだけ（両経路が共有）',
    (codeNew.match(/kunRecordsNext:\s*kunRecordsNext/g) || []).length === 1);
}

console.log(`\n==== ${fail === 0 ? 'ALL GREEN' : 'FAILED'}  pass=${pass} fail=${fail} ====`);
if (fail !== 0) process.exit(1);
