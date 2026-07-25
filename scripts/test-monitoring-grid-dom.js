// モニタリング（ケアマネ送付管理）グリッド DOM描画テスト（実物ロード方式・test-kobetsu-grid-dom.js と同方式）
// 実行: node scripts/test-monitoring-grid-dom.js
// 実HTMLから renderTable 系の本物関数を抽出注入し、fixtureで実描画→tbody innerHTML を検証する。
// 検証（フェーズ1「過去を隠さない」改修）:
//   ・送付実績（PDF/印刷）のあるセルは、運用開始前(isBeforeStart)でも planStart より前でも隠れない
//   ・送付実績のない開始前セルは従来どおり '―'（disabled）のまま
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
// isPending / sortUsers は本体の保存状態・並び替えに依存するためスタブ（sandbox 側）に任せる。
const HTML_FNS = ['renderTable', 'getGroup', 'matchesSchedule', 'matchesSearch', 'matchesRow',
  'escapeHtml', 'escapeAttr', 'formatMD', 'isPreFinalEvalMonth'];
const SHARED_FNS = ['isBeforePlanStart', 'monitoringFinalEvalMonth', 'submitCellColor'];
const fnSrc = HTML_FNS.map(n => extractFrom(html, n)).join('\n') + '\n' + SHARED_FNS.map(n => extractFrom(shared, n)).join('\n');

// ---- DOMスタブ ----
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
  updateStats: function () {},               // 集計は本テスト対象外
  updatePrintTitle: function () {},           // 印刷見出しは対象外
  fitTableHeight: function () {},             // レイアウト計算は対象外
  monitoringState: null
};
// 会計年度12ヶ月（4月〜翌3月）／送付1サブ列 ＝ 本体 monitoring.html と同一
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

// ---- fixture ----
// 会計年度は運用開始と同じ 2026年度に固定（4月〜翌3月）＝ 開始前(4月<5月)セルを描画対象に含める。
// これで判定は「実行日」に依存せず決定的になる（isBeforeStart/isBeforePlanStart は cellYear/月のみで決まる）。
const FY = 2026;
// 要支援ユーザー S: planStart を 2026-09 に置く → 4〜8月は planStart より前
const users = [
  { userId: 'S', name: 'サポ子', furigana: 'サ', category: '要支援1', planStart: '2026-09', days: '月', ampm: '午前' }
];
const records = {
  'S_2026_4': { pdfSendDate: '2026-04-20' },   // 運用開始前(4月<5月)だが送付実績あり → 温存表示
  'S_2026_6': { printSendDate: '2026-06-15' },  // planStart(9月)より前だが送付実績あり → 温存表示
  'S_2026_5': {}                                 // planStartより前・実績なし → 従来どおり '―'
};

sandbox.monitoringState = { fiscalYear: FY, users: users, records: records, isLoading: false };
sandbox.renderTable();
const out = tbody.innerHTML;

// ===== 1. 対象ユーザーが描画される =====
ok(out.indexOf('サポ子') >= 0, 'M0: 対象ユーザーが描画される');

// ===== 2. 運用開始前(isBeforeStart)でも送付実績のあるセルは隠れない =====
ok(out.indexOf('📧') >= 0 && out.indexOf('4/20') >= 0, 'M1: 運用開始前(4月)でもPDF送付実績セルが表示される（📧 4/20）');

// ===== 3. planStartより前でも送付実績のあるセルは隠れない =====
ok(out.indexOf('🖨') >= 0 && out.indexOf('6/15') >= 0, 'M2: planStartより前(6月)でも印刷送付実績セルが表示される（🖨 6/15）');

// ===== 4. 実績のない開始前セルは従来どおり '―'（disabled）のまま =====
ok(out.indexOf('disabled">―') >= 0, 'M3: 実績のない開始前セルは従来どおり "―"（disabled）のまま');

console.log('モニタリング送付グリッド DOM: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
