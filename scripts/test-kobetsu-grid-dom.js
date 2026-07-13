// 個別機能訓練 1ヶ月1列グリッド DOM描画テスト（DOMスタブ・素node／test-kobetsu-status-dom.js と同方式）
// 実行: node scripts/test-kobetsu-grid-dom.js
// 実HTMLから renderTable 系の本物関数を抽出注入し、fixtureで実描画→thead/tbody innerHTMLを検証する。
// 検証: ヘッダ1段化 / 計画月ノード3バッジ / 評価月ノード2バッジ / 色2系統 / 案A導線(onCellTap/onHyoukaCellTap)
//       / データ温存(#6) / 要対応のみトグル（既存フィルタ併用）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, '個別機能訓練計画書チェック.html'), 'utf8');
const shared = fs.readFileSync(path.join(REPO, 'shared.js'), 'utf8');

function extractFrom(src, name) {
  const sig = 'function ' + name + '(';
  const s = src.indexOf(sig);
  if (s < 0) throw new Error('関数が無い: ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(s, j + 1); } }
}
const HTML_FNS = ['renderTable', 'getGroup', 'matchesFilter', 'kbBadgeObj', 'kbPlanBadges', 'kbEvalBadges',
  'kbBadgeHtml', 'kbSubmitDue', 'escapeHtml', 'escapeAttr', 'formatMD', 'formatTodayISO'];
const SHARED_FNS = ['isPlanMonth', 'isHyoukaMonth', 'isBeforePlanStart'];
const fnSrc = HTML_FNS.map(n => extractFrom(html, n)).join('\n') + '\n' + SHARED_FNS.map(n => extractFrom(shared, n)).join('\n');

// ---- DOMスタブ ----
function el() { return { style: {}, innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains() { return false; } } }; }
const thead = el(), tbody = el();
const ids = {};
['emptyMessage', 'filterBar', 'filterCount', 'totalUsers', 'thisMonthCount', 'progressCount', 'progressTotal',
  'hyoukaMonthCount', 'hyoukaDoneCount', 'hyoukaTotalCount'].forEach(id => ids[id] = el());
const sandbox = {
  document: {
    querySelector: sel => sel.indexOf('thead') >= 0 ? thead : (sel.indexOf('tbody') >= 0 ? tbody : el()),
    getElementById: id => ids[id] || el()
  },
  console: console, Math: Math, String: String, Date: Date, JSON: JSON, Object: Object, Array: Array,
  Number: Number, parseInt: parseInt, RegExp: RegExp, isNaN: isNaN,
  filterDay: '', filterAmpm: '', filterGroup: '',
  usageGate: {},
  sortUsers: function () {},                 // fixture順維持
  updateStats: function () {},               // 集計は本テスト対象外
  isPending: function () { return false; },  // 保存未確認なし
  ensureUsageGate: function () {},           // 来所prefetchは対象外
  state: null
};
// 会計年度12ヶ月（4月〜翌3月）
sandbox.MONTHS = [];
for (let i = 0; i < 12; i++) { const mm = ((4 - 1 + i) % 12) + 1; sandbox.MONTHS.push({ m: mm, label: mm + '月', nextYear: (4 + i) > 12 }); }
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fnSrc, sandbox);

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  [FAIL] ' + m); } }

// ---- fixture（実行月基準で相対生成・実行日非依存） ----
const now = new Date();
const nowY = now.getFullYear(), nowM = now.getMonth() + 1;
const fy = nowM >= 4 ? nowY : nowY - 1;
function ymOf(delta) { const t = nowY * 12 + (nowM - 1) + delta; return { y: Math.floor(t / 12), m: (t % 12) + 1, s: Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0') }; }
function key(uid, o) { return uid + '_' + o.y + '_' + o.m; }
const cur = ymOf(0), prev = ymOf(-1), m2 = ymOf(-2);

const users = [
  { userId: 'P', name: 'ピー太', furigana: 'ア', category: '要介護2', planStart: cur.s, planMonths: 3, days: '月', ampm: '午前' },   // 計画月=当月・rec空→計画/測定/提出 未
  { userId: 'E', name: 'イー子', furigana: 'ア', category: '要介護1', planStart: m2.s, planMonths: 3, days: '火', ampm: '午前', sendMethod: 'PDF' },  // 評価月=当月・rec空→提出/評価 未・PDF事業所
  { userId: 'D', name: 'ダン蔵', furigana: 'サ', category: '要介護3', planStart: cur.s, planMonths: 3, days: '水', ampm: '午後' },   // 計画月=当月・全済
  { userId: 'G', name: 'ゴン助', furigana: 'ハ', category: '要介護2', planStart: prev.s, planMonths: 3, days: '木', ampm: '午前' },  // 先月開始・当月は非計画月だが計画データ温存(#6)
];
const records = {};
records[key('D', cur)] = { keikaku_date: cur.s + '-02', sokutei_date: cur.s + '-03', keikaku_sent_date: cur.s + '-09' };
records[key('G', cur)] = { keikaku_date: cur.s + '-05' };   // 当月は計画月でないが作成データあり→温存表示

sandbox.state = { fiscalYear: fy, users: users, records: records, isLoading: false, includeCancelled: false, needsActionOnly: false };

// ===== 1. ヘッダ1段化（旧サブ列[計画/評価]が無い） =====
sandbox.renderTable();
ok(thead.innerHTML.indexOf('sub-header') < 0, 'H1: サブ列ヘッダ(sub-header)が無い＝1段化');
ok((thead.innerHTML.match(/month-header/g) || []).length === 12, 'H1b: 月ヘッダが12個');
ok(thead.innerHTML.indexOf(nowM + '月') >= 0, 'H1c: 当月ラベルがヘッダにある');

// ===== 2. 計画月ノード（P）: 3バッジ・全未・赤 =====
let out = tbody.innerHTML;
ok(out.indexOf('ピー太') >= 0, 'C1: 計画月ユーザーが描画');
ok(out.indexOf('計画(' + nowM + '月〜)') >= 0, 'C1b: サイクルタグ「計画(N月〜)」');
ok((out.match(/#ffebee/g) || []).length >= 3, 'C1c: 未バッジ(赤#ffebee)が3個以上');

// ===== 3. 評価月ノード（E）: 提出/評価・kb-cyc-eval =====
ok(out.indexOf('kb-cyc-eval') >= 0, 'C2: 評価月タグ kb-cyc-eval');
ok(out.indexOf('評価月') >= 0, 'C2b: 「評価月」ラベル');

// ===== 4. 全済（D）: 計画=緑 / 提出=青（色2系統） =====
ok(out.indexOf('#e8f5e9') >= 0, 'C3: 計画済=緑#e8f5e9');
ok(out.indexOf('#e3f2fd') >= 0, 'C3b: 提出済=青#e3f2fd');

// ===== 5. 案A導線: div に onCellTap / onHyoukaCellTap（td単位でなくパートdiv） =====
ok(/data-field="keikaku_date"[^>]*onclick="onCellTap\(this\)"/.test(out), 'C4: 計画パートdivに onCellTap');
ok(/data-field="hyouka"[^>]*onclick="onHyoukaCellTap\(this\)"/.test(out), 'C4b: 評価パートdivに onHyoukaCellTap');
ok(/data-field="hyouka"[^>]*data-sendmethod="PDF"/.test(out), 'C4c: 評価パートに送付方法属性を保持→PDF送付ダイアログ導線維持');

// ===== 6. データ温存(#6): G の当月セル(非計画月)に計画バッジが出る =====
ok(out.indexOf('ゴン助') >= 0, 'C5: 温存ユーザー描画');
// Gの当月レコードは計画作成のみ→「計画」済(緑・✓5)が温存表示される
ok(out.indexOf('✓' + (nowM + '/5')) >= 0, 'C5b: 非計画月でも作成データが温存表示(✓N/5)');

// ===== 7. 要対応のみトグル（Dは全済→消える／P・E・Gは未あり→残る） =====
sandbox.state.needsActionOnly = true;
sandbox.renderTable();
let out2 = tbody.innerHTML;
ok(out2.indexOf('ダン蔵') < 0, 'T1: 要対応ONで全済ユーザー(ダン蔵)が非表示');
ok(out2.indexOf('ピー太') >= 0, 'T1b: 未ありユーザー(ピー太)は残る');
ok(out2.indexOf('イー子') >= 0, 'T1c: 評価未(イー子)は残る');

// ===== 8. トグルOFFで全員復帰（併用性: フィルタ非破壊） =====
sandbox.state.needsActionOnly = false;
sandbox.renderTable();
ok(tbody.innerHTML.indexOf('ダン蔵') >= 0, 'T2: OFFで全済ユーザーが復帰');

// ===== 9. 既存フィルタ併用（曜日=火 で E のみ） =====
sandbox.filterDay = '火';
sandbox.renderTable();
let outF = tbody.innerHTML;
ok(outF.indexOf('イー子') >= 0 && outF.indexOf('ピー太') < 0, 'F1: 曜日フィルタ(火)が従来どおり効く');
sandbox.filterDay = '';

console.log('個別機能訓練 1ヶ月1列グリッド DOM: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
