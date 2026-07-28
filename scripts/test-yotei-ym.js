// test-yotei-ym.js
// 予定月スライド方式 段階1 の純関数 TDD（gas/yawaragi-board/yotei-core.js）。
//
// 検証対象は「実バイト」: vm で yotei-core.js を読み込み、本物の関数を呼ぶ。
//   （純関数を写したテストは不可＝ドリフトを検知できないため）
// vm は別realm。ロード先で作った Date は instanceof Date が false になるため、
//   型判定は Object.prototype.toString.call() を使う（実装側も同じ規約）。
//
// 周期(3/4ヶ月)は shared.js §I の sokuteiCycleMonths_ を実抽出して注入する。
//   yotei-core.js 内に周期判定を複製しないことの確認も兼ねる。
//
// 実行: node scripts/test-yotei-ym.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// ---- yotei-core.js を vm で実ロード（本物を呼ぶ） ----
const CORE_PATH = path.join(ROOT, 'gas', 'yawaragi-board', 'yotei-core.js');
if (!fs.existsSync(CORE_PATH)) {
  console.error('FAIL: gas/yawaragi-board/yotei-core.js が無い（未実装＝RED）');
  process.exit(1);
}
const sandbox = { module: { exports: {} }, console: console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(CORE_PATH, 'utf8'), sandbox, { filename: 'yotei-core.js' });
const Y = sandbox.module.exports;

// ---- shared.js §I の sokuteiCycleMonths_ を実バイト抽出（複製しない） ----
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function ' + name + ' が無い');
  const bo = src.indexOf('{', start);
  let depth = 0, i = bo;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}
const box = {};
eval(extractFn(fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8'), 'sokuteiCycleMonths_')
  + '\nbox.fn = sokuteiCycleMonths_;');
const cycleMonthsFn = box.fn;   // shared.js の実バイト（同名 const にすると eval 済み宣言と衝突する）

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n    actual  =' + a + '\n    expected=' + e); }
}
function ok(cond, label) { eq(!!cond, true, label); }
function sec(t) { console.log('\n[' + t + ']'); }

// =====================================================================
sec('ymAdd — 年跨ぎ・+0・負数');
eq(Y.ymAdd('2026-12', 1), '2027-01', '2026-12 +1 = 2027-01（年跨ぎ）');
eq(Y.ymAdd('2026-07', 0), '2026-07', '+0 は不変');
eq(Y.ymAdd('2026-01', -1), '2025-12', '-1 で前年12月へ');
eq(Y.ymAdd('2026-10', 3), '2027-01', '2026-10 +3 = 2027-01');
eq(Y.ymAdd('2026-09', 4), '2027-01', '2026-09 +4 = 2027-01');
eq(Y.ymAdd('2026-01', 12), '2027-01', '+12 = 翌年同月');
eq(Y.ymAdd('2026-01', -13), '2024-12', '-13 = 13ヶ月前');
eq(Y.ymAdd('2026-07', 1), '2026-08', '通常の+1');
eq(Y.ymAdd('', 1), '', '空文字は空を返す（壊れない）');
eq(Y.ymAdd('こわれた', 1), '', '解釈不能は空を返す');
eq(Y.ymAdd('2026-13', 1), '', '月が範囲外は空を返す');
eq(Y.ymAdd('2026-07-28', 1), '2026-08', 'YYYY-MM-DD も先頭7桁で受ける');

sec('nextYmAfterDone — 実施月 + 周期');
eq(Y.nextYmAfterDone('2026-07-28', 3), '2026-10', '2026-07-28 & 3ヶ月 = 2026-10');
eq(Y.nextYmAfterDone('2026-07-28', 4), '2026-11', '2026-07-28 & 4ヶ月 = 2026-11');
eq(Y.nextYmAfterDone('2026-11-05', 3), '2027-02', '年跨ぎ（11月+3=翌2月）');
eq(Y.nextYmAfterDone('2026-12-31', 4), '2027-04', '大晦日実施でも月基準（日は無視）');
eq(Y.nextYmAfterDone('2026-01-01', 3), '2026-04', '月初実施');
eq(Y.nextYmAfterDone('2026-03', 3), '2026-06', 'YYYY-MM（計画書開始月）も受ける');
eq(Y.nextYmAfterDone('', 3), '', '起点なしは空を返す（呼び出し側が当月へ倒す）');
eq(Y.nextYmAfterDone('2026-07-28', 0), '2026-07', '周期0は同月');
// vm 別realm対策: Object.prototype.toString.call() で Date を判定できること
const dInside = vm.runInContext('new Date(Date.UTC(2026,6,28))', sandbox);
ok(!(dInside instanceof Date), '前提: vm内Dateは instanceof Date が false（別realm）');
eq(Object.prototype.toString.call(dInside), '[object Date]', '前提: toString.call で Date と判る');
eq(Y.nextYmAfterDone(dInside, 3), '2026-10', 'vm内の Date オブジェクトを受けられる（realm差に強い）');
eq(Y.nextYmAfterDone(new Date(Date.UTC(2026, 6, 28)), 3), '2026-10', 'ホスト側 Date も受けられる');

sec('nextYmSlide — 1ヶ月スライド');
eq(Y.nextYmSlide('2026-07'), '2026-08', '7月→8月');
eq(Y.nextYmSlide('2026-12'), '2027-01', '12月→翌1月（年跨ぎ）');
eq(Y.nextYmSlide(''), '', '空は空');

sec('nextYmUnslide — Undo（-1ヶ月）');
eq(Y.nextYmUnslide('2026-08'), '2026-07', '8月→7月');
eq(Y.nextYmUnslide('2027-01'), '2026-12', '翌1月→12月（年跨ぎ）');
eq(Y.nextYmSlide(Y.nextYmUnslide('2026-08')), '2026-08', 'スライド↔Undo は往復で元に戻る');

sec('isDue — 過ぎている人も対象に含める');
eq(Y.isDue('2026-07', '2026-07'), true, '当月ちょうどは対象');
eq(Y.isDue('2026-06', '2026-07'), true, '過ぎている（先月期限）も対象');
eq(Y.isDue('2025-12', '2026-07'), true, '年を跨いで過ぎていても対象');
eq(Y.isDue('2026-08', '2026-07'), false, '来月予定は対象外');
eq(Y.isDue('2027-01', '2026-12'), false, '年跨ぎの未来は対象外');
eq(Y.isDue('', '2026-07'), true, '予定月が空＝未設定は対象に出す（漏れ検知）');

sec('周期は shared.js の sokuteiCycleMonths_ を注入して使う（複製しない）');
eq(sokuteiCycleMonths_('要介護2'), 3, '要介護=3ヶ月（shared.js 実バイト）');
eq(sokuteiCycleMonths_('要支援1'), 4, '要支援=4ヶ月');
eq(sokuteiCycleMonths_('事業対象者'), 4, '事業対象者=4ヶ月');
ok(!/要介護/.test(fs.readFileSync(CORE_PATH, 'utf8').replace(/\/\/[^\n]*/g, '')),
  'yotei-core.js のコード部に介護度判定の複製が無い（コメントを除く）');

// =====================================================================
sec('buildInitialYotei — 初期値一括生成（冪等）');
const DEPS = { cycleMonths: cycleMonthsFn, normalizeName: function (s) { return String(s || '').replace(/[\s　]+/g, ''); } };

const BASE = {
  domain: 'sokutei',
  thisYm: '2026-07',
  users: [
    { userId: '要介護_履歴あり', name: '要介護_履歴あり', care: '要介護2', planStart: '2026-03' },
    { userId: '要介護_履歴なし', name: '要介護_履歴なし', care: '要介護1', planStart: '2026-05' },
    { userId: '要支援_履歴あり', name: '要支援_履歴あり', care: '要支援2', planStart: '' },
    { userId: '起点なし', name: '起点なし', care: '要介護3', planStart: '' }
  ],
  lastDoneByKey: {
    '要介護_履歴あり': '2026-06-10',
    '要支援_履歴あり': '2026-04-01'
  },
  existing: []
};
function run(over) {
  const inp = Object.assign({}, BASE, over || {});
  return Y.buildInitialYotei(inp, DEPS);
}
const r1 = run();
const byId = {};
r1.rows.forEach(function (r) { byId[r.userId] = r; });

eq(r1.rows.length, 4, '4名ぶん生成される');
eq(byId['要介護_履歴あり'].nextYm, '2026-09', '履歴あり要介護: 2026-06 +3 = 2026-09');
eq(byId['要介護_履歴あり'].cycleMonths, 3, 'cycleMonths=3 が行に載る');
eq(byId['要介護_履歴あり'].note, '', '履歴ありは note 空');
eq(byId['要介護_履歴なし'].nextYm, '2026-08', '履歴なし要介護: planStart 2026-05 +3 = 2026-08');
eq(byId['要支援_履歴あり'].nextYm, '2026-08', '履歴あり要支援: 2026-04 +4 = 2026-08');
eq(byId['要支援_履歴あり'].cycleMonths, 4, '要支援は cycleMonths=4');
eq(byId['起点なし'].nextYm, '2026-07', '起点なしは当月（すぐ対象に出す）');
eq(byId['起点なし'].note, '起点なし', "note='起点なし'");
eq(byId['要介護_履歴あり'].domain, 'sokutei', 'domain が全行に入る');
eq(r1.stats.fromDone, 2, 'stats.fromDone=2（履歴由来）');
eq(r1.stats.fromPlanStart, 1, 'stats.fromPlanStart=1');
eq(r1.stats.noAnchor, 1, 'stats.noAnchor=1');
eq(r1.stats.skippedExisting, 0, 'stats.skippedExisting=0');
eq(r1.stats.byYm, { '2026-07': 1, '2026-08': 2, '2026-09': 1 }, 'stats.byYm が月別件数を返す');

sec('buildInitialYotei — 冪等（既存行は上書きしない）');
const r2 = run({ existing: [{ userId: '要介護_履歴あり', domain: 'sokutei' }] });
eq(r2.rows.length, 3, '既存1件を除いた3件だけ生成');
eq(r2.stats.skippedExisting, 1, 'skippedExisting=1');
ok(!r2.rows.some(function (r) { return r.userId === '要介護_履歴あり'; }), '既存者は rows に含まれない');
const r3 = run({ existing: BASE.users.map(function (u) { return { userId: u.userId, domain: 'sokutei' }; }) });
eq(r3.rows.length, 0, '2回目の実行では0件（＝2回走らせても壊れない）');
eq(r3.stats.skippedExisting, 4, '4件すべてスキップ');

sec('buildInitialYotei — domain が違う既存行はスキップ対象にしない（汎用の器）');
const r4 = run({ existing: [{ userId: '要介護_履歴あり', domain: 'oral' }] });
eq(r4.rows.length, 4, "domain='oral' の行があっても sokutei は生成される");
eq(r4.stats.skippedExisting, 0, 'skippedExisting=0');

sec('buildInitialYotei — 氏名の正規化フォールバック');
const r5 = run({
  lastDoneByKey: { '要介護 履歴あり': '2026-06-10' },   // userId と一致しない（空白入り）
  users: [{ userId: '要介護_履歴あり', name: '要介護 履歴あり', care: '要介護2', planStart: '2026-03' }]
});
eq(r5.rows[0].nextYm, '2026-09', 'userId で引けなくても正規化名で履歴を拾う');

sec('buildInitialYotei — 履歴は最大値を採用（3ソースのマージ後を渡す想定）');
const r6 = run({
  users: [{ userId: 'X', name: 'X', care: '要介護1', planStart: '2026-01' }],
  lastDoneByKey: { 'X': '2026-05-20' }
});
eq(r6.rows[0].nextYm, '2026-08', '履歴が planStart より優先される');

sec('buildInitialYotei — 空入力でも壊れない');
const r7 = Y.buildInitialYotei({ domain: 'sokutei', thisYm: '2026-07', users: [], lastDoneByKey: {}, existing: [] }, DEPS);
eq(r7.rows.length, 0, '0名でも例外を出さない');
eq(r7.stats.byYm, {}, 'byYm は空オブジェクト');

// =====================================================================
console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
