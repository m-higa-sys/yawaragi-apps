// 現場ハブ genba「今月のやり残し」カードの分野集計 純関数テスト
// 対象: genba.html の buildYarinokoshiSummary / YARI_DOMAINS（月次ボード monthBoard 出力を4分野に集計するだけ）
// 実行: node scripts/test-genba-yarinokoshi.js（vmで実物ソースを抽出して評価・test-kobetsu-hold-render と同方式）
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

// 実物ソースから YARI_DOMAINS 定義 と buildYarinokoshiSummary 関数を抽出して vm 評価
function extractFn(src, name) {
  const sig = 'function ' + name + '(';
  const s = src.indexOf(sig);
  if (s < 0) throw new Error('関数が無い: ' + name);
  let d = 0;
  for (let j = src.indexOf('{', s); j < src.length; j++) {
    if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(s, j + 1); }
  }
}
const domM = html.match(/var YARI_DOMAINS = \[[\s\S]*?\];/);
if (!domM) throw new Error('YARI_DOMAINS が無い');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(domM[0] + '\n' + extractFn(html, 'buildYarinokoshiSummary'), sandbox);
const build = sandbox.buildYarinokoshiSummary;

let pass = 0, fail = 0;
function ok(c, l) { if (c) pass++; else { fail++; console.error('  [FAIL] ' + l); } }
function dom(summary, key) { return summary.domains.find(function (d) { return d.key === key; }); }

// ===== フィクスチャ: monthBoard 相当（section.key / countUndone / countTarget）=====
const sections = [
  { key: 'oralEval', label: '口腔評価', countUndone: 4, countTarget: 10 },
  { key: 'oralPlan', label: '口腔計画書', countUndone: 3, countTarget: 8 },
  { key: 'kunPlan', label: '個訓計画書', countUndone: 14, countTarget: 20 },
  { key: 'kunEval', label: '個訓評価', countUndone: 3, countTarget: 5 },
  { key: 'sokuteiKaigo', label: '測定(要介護)', countUndone: 4, countTarget: 6 },
  { key: 'sokuteiShien', label: '測定(要支援等)', countUndone: 25, countTarget: 30 },
  { key: 'tsushoPlan', label: '通所計画書', countUndone: 10, countTarget: 12 },
  { key: 'tsushoEval', label: '通所評価', countUndone: 2, countTarget: 4 },
  { key: 'tsushoMoni', label: '通所モニ', countUndone: 1, countTarget: 3 }
];
const warnings = [
  { type: 'neverMeasured', userId: 'a', name: 'x' },
  { type: 'noDueDate', userId: 'b', name: 'y' },
  { type: 'noDueDate', userId: 'c', name: 'z' },
  { type: 'somethingElse', userId: 'd', name: 'w' }
];

// ===== A. 4分野に正しく集計（未=Σ countUndone / total=Σ countTarget）=====
const S = build(sections, warnings);
ok(S.domains.length === 4, 'A0: 分野は4つ');
ok(dom(S, 'oral').undone === 7 && dom(S, 'oral').total === 18, 'A1: 口腔 = oralEval+oralPlan（未7/対象18）');
ok(dom(S, 'kun').undone === 17 && dom(S, 'kun').total === 25, 'A2: 個訓 = kunPlan+kunEval（未17/対象25）');
ok(dom(S, 'sokutei').undone === 29 && dom(S, 'sokutei').total === 36, 'A3: 測定 = sokuteiKaigo+sokuteiShien（未29/対象36）');
ok(dom(S, 'tsusho').undone === 13 && dom(S, 'tsusho').total === 19, 'A4: 通所 = tsushoPlan+tsushoEval+tsushoMoni（未13/対象19）');
ok(dom(S, 'oral').label === '口腔' && dom(S, 'tsusho').label === '通所', 'A5: 分野ラベル');

// ===== B. 全体合計 =====
ok(S.totalUndone === 66, 'B1: totalUndone = 66');
ok(S.totalTarget === 98, 'B2: totalTarget = 98');

// ===== C. warnings 件数（既知2種のみ・未知typeは無視）=====
ok(S.warnings.neverMeasured === 1, 'C1: neverMeasured = 1');
ok(S.warnings.noDueDate === 2, 'C2: noDueDate = 2');

// ===== D. total0（全済）=====
const zeroSecs = sections.map(function (s) { return { key: s.key, label: s.label, countUndone: 0, countTarget: s.countTarget }; });
const Z = build(zeroSecs, []);
ok(Z.totalUndone === 0, 'D1: 全済 → totalUndone 0（カードは「今月ぶん完了」）');
ok(Z.totalTarget === 98, 'D2: total0でも対象数は保持');
ok(Z.warnings.neverMeasured === 0 && Z.warnings.noDueDate === 0, 'D3: warnings空');

// ===== E. 欠損・安全既定 =====
const E = build([], []);
ok(E.domains.length === 4 && E.totalUndone === 0, 'E1: 空sections → 4分野0で安全');
const E2 = build(undefined, undefined);
ok(E2.totalUndone === 0 && E2.warnings.noDueDate === 0, 'E2: undefined入力でも落ちない');
// 未知キーは無視（他sectionが混ざっても分野合計に混入しない）
const E3 = build([{ key: 'somethingUnrelated', countUndone: 999, countTarget: 999 }, { key: 'oralEval', countUndone: 1, countTarget: 2 }], []);
ok(E3.totalUndone === 1 && dom(E3, 'oral').undone === 1, 'E3: 分野外keyは合計に混入しない');

// ===== 結果 =====
if (fail === 0) console.log('ALL GREEN  (pass=' + pass + ')');
else { console.error('FAILED: ' + fail + ' / total ' + (pass + fail)); process.exit(1); }
