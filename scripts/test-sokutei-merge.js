// test-sokutei-merge.js
// 測定の共通読み関数 mergeSokuteiRecords の TDD 検証（設計書 測定アプリ_共通読み関数 §4②）。
// 「測定済み判定」の 3箇所再実装（sessionBoardBuildInput_ / mb_kunRec・mb_shienSok / 個訓直読み）を
// 1本に集約するための純関数。要介護(個別機能訓練計画書記録)＋要支援(要支援測定記録)を統合する。
//
// 検証対象は「実バイト」:
//   - shared.js §I の mergeSokuteiRecords（ブラウザ用・ブレース対応抽出）
//   - gas/yawaragi-board/session-board-core.js の同名（GAS用・逐語コピー / module.exports 経由）
//   両者が同一挙動であることも突合する（逐語コピーのドリフト検知）。
// サイクル月数は sokuteiCycleMonths_（shared.js §I へ単一化済み）を実抽出して連携確認。
//
// 実行: node scripts/test-sokutei-merge.js

const fs = require('fs');
const path = require('path');

// ---- 実バイト抽出器（test-cycle-judge.js と同流儀・ブレース対応） ----
function extractFn(src, name) {
  const sigParen = 'function ' + name + '(';
  const sigSpace = 'function ' + name + ' (';
  function findSig(from) {
    const a = src.indexOf(sigParen, from);
    const b = src.indexOf(sigSpace, from);
    if (a < 0) return b < 0 ? -1 : b;
    if (b < 0) return a;
    return Math.min(a, b);
  }
  const start = findSig(0);
  if (start < 0) throw new Error('function ' + name + ' が無い（未実装＝RED）');
  if (findSig(start + ('function ' + name).length) >= 0) {
    throw new Error(name + ' が複数定義（抽出器が誤った塊を掴む恐れ）');
  }
  const braceOpen = src.indexOf('{', start);
  let depth = 0, i = braceOpen;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

function loadFromSource(file, name) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const box = {};
  eval(extractFn(src, name) + '\nbox.fn = ' + name + ';');
  return box.fn;
}

// shared.js（ブラウザ正本）
const mergeShared = loadFromSource('shared.js', 'mergeSokuteiRecords');
// GAS（session-board-core.js の逐語コピー・module.exports 経由で取得）
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));
const mergeGas = core.mergeSokuteiRecords;
// サイクル月数（shared.js §I へ単一化済み。移設前は sokutei.html ローカルだった）
const sokuteiCycleMonths_ = loadFromSource('shared.js', 'sokuteiCycleMonths_');

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: exp=' + e + ' act=' + a); }
}
function ok(cond, label) { eq(!!cond, true, label); }

// 各テストを shared/GAS 両実装で回して逐語コピーのドリフトも同時に検知する
function runOn(merge, tag) {
  console.log('\n===== [' + tag + '] mergeSokuteiRecords =====');

  // --- ① paper除外（★最重要・スタッフ別集計を壊さない） ---
  console.log('[paper除外] source:paper は実測定から除外');
  {
    const shien = [
      { name: '鈴木次郎', care: '要支援2', sokutei_date: '2026-05-01', sokutei_by: '', source: 'paper', note: '' },
      { name: '鈴木次郎', care: '要支援2', sokutei_date: '2026-06-14', sokutei_by: '勝又', source: 'app', note: '' },
    ];
    const out = merge([], shien);
    eq(out.length, 1, 'paper 1件は落ち app 1件のみ残る');
    eq(out[0].source, 'app', '残ったのは app レコード');
    eq(out[0].sokutei_date, '2026-06-14', 'app の測定日');
  }

  // --- ② userId結合（要介護は必ず userId でキー化） ---
  console.log('[userId結合] 要介護は key=userId / matchedBy=userId');
  {
    const kaigo = [
      { userId: '田中太郎', name: '田中太郎', sokutei_date: '2026-06-20', sokutei_by: '小野', output_by: '林' },
    ];
    const out = merge(kaigo, []);
    eq(out[0].key, '田中太郎', 'key=userId');
    eq(out[0].matchedBy, 'userId', 'matchedBy=userId');
  }
  console.log('[userId結合] userId空の要介護行は name フォールバック');
  {
    const kaigo = [{ userId: '', name: '退所花子', sokutei_date: '2026-06-20', sokutei_by: '', output_by: '' }];
    const out = merge(kaigo, []);
    eq(out[0].key, '退所花子', 'userId空→key=name');
    eq(out[0].matchedBy, 'name', 'userId空→matchedBy=name');
  }

  // --- ③ 日付名正規化（sokutei_date / last / doneDate → sokutei_date） ---
  console.log('[日付名正規化] last / doneDate 入力も出力は sokutei_date に統一');
  {
    const outLast = merge([{ userId: 'A', name: 'A', last: '2026-06-01', sokutei_by: '' }], []);
    eq(outLast[0].sokutei_date, '2026-06-01', 'last→sokutei_date');
    ok(outLast[0].last === undefined, '出力に last キーは残さない');
    const outDone = merge([], [{ name: 'B', doneDate: '2026-06-02', source: 'app' }]);
    eq(outDone[0].sokutei_date, '2026-06-02', 'doneDate→sokutei_date');
  }

  // --- ④ 要介護・要支援の振り分け（careType） ---
  console.log('[振り分け] 要介護→careType=要介護 / 要支援→要支援系');
  {
    const out = merge(
      [{ userId: 'K', name: 'K', sokutei_date: '2026-06-10', sokutei_by: '', output_by: '甲' }],
      [{ name: 'S', care: '事業対象者', sokutei_date: '2026-06-11', sokutei_by: '', source: 'app' }]
    );
    const kaigo = out.find(r => r.key === 'K'), shien = out.find(r => r.key === 'S');
    eq(kaigo.careType, '要介護', '要介護 careType');
    eq(shien.careType, '要支援系', '要支援系 careType');
    // output_by の非対称: 要介護は文字列 / 要支援は null
    eq(kaigo.output_by, '甲', '要介護 output_by は文字列');
    eq(shien.output_by, null, '要支援 output_by は null');
    // source の非対称: 要介護シートに source 列なし＝''
    eq(kaigo.source, '', '要介護 source は空');
    eq(shien.source, 'app', '要支援 source は app');
  }

  // --- ⑤ 要支援4ヶ月サイクル（careType が既存 sokuteiCycleMonths_ に正しく効く） ---
  console.log('[4ヶ月サイクル] careType→サイクル月数（要介護3・要支援系4）');
  {
    const out = merge(
      [{ userId: 'K', name: 'K', sokutei_date: '2026-06-10' }],
      [{ name: 'S', care: '要支援1', sokutei_date: '2026-06-11', source: 'app' }]
    );
    const kaigo = out.find(r => r.key === 'K'), shien = out.find(r => r.key === 'S');
    eq(sokuteiCycleMonths_(kaigo.careType), 3, '要介護 careType→3ヶ月');
    eq(sokuteiCycleMonths_(shien.careType), 4, '要支援系 careType→4ヶ月');
  }

  // --- エッジ: 測定日の無い行は測定実績でない＝除外 ---
  console.log('[エッジ] 測定日なしの行は除外');
  {
    const out = merge(
      [{ userId: 'K', name: 'K', sokutei_date: '', keikaku_date: '2026-06-01' }], // 計画だけで測定なし
      [{ name: 'S', care: '要支援1', sokutei_date: '', source: 'app' }]
    );
    eq(out.length, 0, '測定日なしは要介護・要支援とも0件');
  }

  // --- エッジ: null/undefined 入力で落ちない ---
  console.log('[エッジ] 引数 null/undefined でも空配列');
  {
    eq(merge(null, null).length, 0, '両方 null →空');
    eq(merge(undefined, undefined).length, 0, '両方 undefined →空');
  }

  // --- オプション includePaper（案A・期限計算は紙seedをアンカーに含める） ---
  console.log('[includePaper] 既定/false は除外・true は含む');
  {
    const shien = [
      { name: '鈴木次郎', care: '要支援2', sokutei_date: '2026-05-01', sokutei_by: '', source: 'paper', note: '' },
      { name: '鈴木次郎', care: '要支援2', sokutei_date: '2026-06-14', sokutei_by: '勝又', source: 'app', note: '' },
    ];
    // 既定（第3引数なし）＝除外＝既存挙動と同じ
    eq(merge([], shien).length, 1, '既定は paper 除外（app 1件）');
    // includePaper:false 明示＝除外
    eq(merge([], shien, { includePaper: false }).length, 1, 'false 明示も除外');
    // includePaper:true＝紙seedも含む（期限計算用・前回測定日アンカー）
    const withPaper = merge([], shien, { includePaper: true });
    eq(withPaper.length, 2, 'true は paper 含む（2件）');
    const paperRow = withPaper.find(r => r.source === 'paper');
    ok(paperRow, 'paper 行が source で判別できる');
    eq(paperRow.sokutei_date, '2026-05-01', 'paper 行の測定日（月初仮置き）が前回アンカー候補');
    eq(paperRow.careType, '要支援系', 'paper 行も要支援系');
    // 要介護には source 概念が無い＝includePaper に依らず不変
    const kaigo = [{ userId: 'K', name: 'K', sokutei_date: '2026-06-10', sokutei_by: '', output_by: '' }];
    eq(merge(kaigo, [], { includePaper: true }).length, 1, '要介護は includePaper に影響されない');
  }
}

runOn(mergeShared, 'shared.js');
runOn(mergeGas, 'GAS core');

// --- 逐語コピーのドリフト検知: 同一入力で shared と GAS の出力が完全一致 ---
console.log('\n===== [ドリフト検知] shared.js == GAS core =====');
{
  const kaigo = [{ userId: 'K', name: 'K', sokutei_date: '2026-06-10', sokutei_by: 'a', output_by: 'b' }];
  const shien = [
    { name: 'S', care: '要支援2', sokutei_date: '2026-06-11', sokutei_by: 'c', source: 'app' },
    { name: 'P', care: '事業対象者', sokutei_date: '2026-05-01', sokutei_by: '', source: 'paper' },
  ];
  eq(mergeShared(kaigo, shien), mergeGas(kaigo, shien), 'shared と GAS の出力が完全一致');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
