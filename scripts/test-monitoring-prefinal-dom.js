// モニタリング 最終評価月「前月予告」（🔜✍来月サイン）テスト（実物ロード方式）
// 実行: node scripts/test-monitoring-prefinal-dom.js
// 実HTMLから isPreFinalEvalMonth（純関数）と renderTable 系を抽出注入し、
//   ①純関数の真偽（翌月=最終評価月のとき true／当月・無関係・最終評価なし false／年跨ぎ・planStart+11経路）
//   ②実描画（前月セルに🔜✍予告／最終評価月は従来どおり✍／既存送付表示は併記で温存）
// を検証する。product無改修・表示追加のみ（フェーズ2b）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, 'monitoring.html'), 'utf8');
const shared = fs.readFileSync(path.join(REPO, 'shared.js'), 'utf8');

function extractFrom(src, name) {
  const sig = 'function ' + name + '(';
  const s = src.indexOf(sig);
  if (s < 0) throw new Error('関数が無い: ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(s, j + 1); } }
}
const HTML_FNS = ['renderTable', 'getGroup', 'matchesSchedule', 'matchesSearch', 'matchesRow',
  'escapeHtml', 'escapeAttr', 'formatMD', 'isPreFinalEvalMonth'];
const SHARED_FNS = ['isBeforePlanStart', 'monitoringFinalEvalMonth', 'submitCellColor'];
const fnSrc = HTML_FNS.map(n => extractFrom(html, n)).join('\n') + '\n' + SHARED_FNS.map(n => extractFrom(shared, n)).join('\n');

// ---- DOMスタブ（test-monitoring-grid-dom.js と同方式）----
function el() { return { style: {}, innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains() { return false; } } }; }
const thead = el(), tbody = el();
const ids = {};
['emptyMessage', 'filterBar', 'dayFilters', 'ampmFilters', 'filterCount'].forEach(id => ids[id] = el());
const sandbox = {
  document: {
    querySelector: sel => sel.indexOf('thead') >= 0 ? thead : (sel.indexOf('tbody') >= 0 ? tbody : el()),
    querySelectorAll: () => [],
    getElementById: id => ids[id] || el()
  },
  console: console, Math: Math, String: String, Date: Date, JSON: JSON, Object: Object, Array: Array,
  Number: Number, parseInt: parseInt, RegExp: RegExp, isNaN: isNaN,
  filterDay: '', filterAmpm: '', filterSearch: '', filterRow: '',
  sortUsers: function () {},                 // fixture順維持
  isPending: function () { return false; },  // 保存未確認なし
  updateStats: function () {},
  updatePrintTitle: function () {},
  fitTableHeight: function () {},
  monitoringState: null
};
sandbox.MONTHS = [
  { m: 4, label: '4月' }, { m: 5, label: '5月' }, { m: 6, label: '6月' },
  { m: 7, label: '7月' }, { m: 8, label: '8月' }, { m: 9, label: '9月' },
  { m: 10, label: '10月' }, { m: 11, label: '11月' }, { m: 12, label: '12月' },
  { m: 1, label: '1月', nextYear: true }, { m: 2, label: '2月', nextYear: true }, { m: 3, label: '3月', nextYear: true }
];
sandbox.SUB_COLS = [{ field: 'send', label: '送付' }];
sandbox.START_YEAR = 2026;   // 運用開始 2026-05（monitoring.html と同値）
sandbox.START_MONTH = 5;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fnSrc, sandbox);

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  [FAIL] ' + m); } }

// ===== ① 純関数 isPreFinalEvalMonth =====
const pre = sandbox.isPreFinalEvalMonth;
// 上書き(finalEvalMonth)優先経路
ok(pre('', '2026-08', 2026, 7) === true, 'P1: 翌月(2026-08)が最終評価月 → 前月(2026-07)は true');
ok(pre('', '2026-08', 2026, 8) === false, 'P2: 当月=最終評価月そのもの → false');
ok(pre('', '2026-08', 2026, 6) === false, 'P3: 無関係月(6月) → false');
// 最終評価月が算出不能（planStart/finalEvalMonth とも空）
ok(pre('', '', 2026, 7) === false, 'P4: 最終評価月なし → false');
// planStart+11 経路（override 無し）: 2026-05 + 11 = 2027-04 → 前月は 2027-03
ok(pre('2026-05', '', 2027, 3) === true, 'P5: planStart+11(2027-04)の前月(2027-03) → true（override無し経路）');
ok(pre('2026-05', '', 2027, 4) === false, 'P6: planStart+11 の最終評価月そのもの → false');
// 年跨ぎ（12月→翌1月）
ok(pre('', '2027-01', 2026, 12) === true, 'P7: 年跨ぎ 2026-12 の翌月 2027-01 が最終評価月 → true');
ok(pre('', '2027-01', 2027, 12) === false, 'P8: 年違い(2027-12) → false');

// ===== ② 実描画 =====
// td を { cls, text } に分解（class はトークン一致で判定＝'pre-final-eval' が 'final-eval' に誤ヒットしない）
function cells(h) {
  const out = []; const re = /<td class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g; let m;
  while ((m = re.exec(h))) out.push({ cls: m[1].split(/\s+/), text: m[2] });
  return out;
}
const FY = 2026; // 4月〜翌3月。最終評価月 2027-02 → 前月 2027-01（どちらもグリッド内・実行日非依存で未来）
const users = [
  // U1: 最終評価 2027-02・送付実績なし → 前月(2027-01)は素の🔜✍
  { userId: 'U1', name: '予告子', furigana: 'ヨ', category: '要支援1', planStart: '2026-05', finalEvalMonth: '2027-02', days: '月', ampm: '午前' },
  // U2: 同上・前月に送付実績あり → 🔜✍と📧を併記（既存表示を消さない回帰確認）
  { userId: 'U2', name: '併記男', furigana: 'ヘ', category: '要支援2', planStart: '2026-05', finalEvalMonth: '2027-02', days: '火', ampm: '午後' }
];
const records = {
  'U2_2027_1': { pdfSendDate: '2027-01-10' }  // 前月セルに送付実績 → 予告と併記されるべき
};
sandbox.monitoringState = { fiscalYear: FY, users: users, records: records, isLoading: false };
sandbox.renderTable();
const all = cells(tbody.innerHTML);

// U1 の前月(2027-01)＝素の予告
const u1Pre = all.filter(c => c.cls.includes('pre-final-eval') && !c.cls.includes('has-pdf'));
ok(u1Pre.length >= 1 && u1Pre[0].text === '🔜✍', 'D1: 送付実績なしの前月セルは素の「🔜✍」予告');
// 最終評価月そのもの(2027-02)は従来どおり ✍（🔜は付かない・pre-final-evalは付かない）
const finalCells = all.filter(c => c.cls.includes('final-eval') && !c.cls.includes('pre-final-eval'));
ok(finalCells.length >= 1, 'D2: 最終評価月セルに final-eval クラスが付く');
ok(finalCells.every(c => c.text === '✍'), 'D3: 最終評価月は従来どおり ✍（🔜予告は付けない）');
ok(finalCells.every(c => c.text.indexOf('🔜') < 0), 'D4: 最終評価月に予告🔜が混入しない');
// U2 の前月＝既存送付表示(📧)と予告(🔜✍)の併記
const u2Pre = all.filter(c => c.cls.includes('pre-final-eval') && c.cls.includes('has-pdf'));
ok(u2Pre.length === 1, 'D5: 送付実績ありの前月セルも pre-final-eval が付く（1件）');
ok(u2Pre.length === 1 && u2Pre[0].text.indexOf('🔜✍') === 0, 'D6: 併記時も先頭は🔜✍予告');
ok(u2Pre.length === 1 && u2Pre[0].text.indexOf('📧') >= 0 && u2Pre[0].text.indexOf('1/10') >= 0, 'D7: 既存の送付表示(📧 1/10)を消さず併記');
// 予告が出るのは「前月1マスだけ」＝pre-final-eval セルは全体でちょうど2個（U1・U2 各1）
ok(all.filter(c => c.cls.includes('pre-final-eval')).length === 2, 'D8: 予告は最終評価月の前月1マスだけ（U1+U2=2件）');

console.log('モニタリング前月予告(🔜✍) DOM: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
