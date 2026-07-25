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
const HTML_FNS = ['renderTable', 'kobetsuCycleAt', 'getGroup', 'matchesFilter', 'kbBadgeObj', 'kbPlanBadges', 'kbEvalBadges',
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

// ===== 10. 過去を隠さない（フェーズ1）: planStartより前でも実績があれば表示／実績なしの開始前は '-' のまま =====
// planStart を遠い未来に置き、描画される全月を「開始前(beforeStart=true)」にする。
// 当月セルにだけ計画・評価の実績を入れ、それが '-' に隠れず表示されること（本改修の本命）、
// 実績のない開始前セルは従来どおり '-' のままであることを、実物 renderTable で確認する。
const far = ymOf(60);  // 5年後 → 描画される12ヶ月すべてが planStart より前
const H = { userId: 'H', name: 'ハツ江', furigana: 'ハ', category: '要介護1', planStart: far.s, planMonths: 3, days: '月', ampm: '午前', sendMethod: 'PDF' };
const recH = {};
recH[key('H', cur)] = { keikaku_date: cur.s + '-04', hyouka_pdf_date: cur.s + '-08' };  // 当月=開始前だが計画・評価の実績あり
sandbox.state = { fiscalYear: fy, users: [H], records: recH, isLoading: false, includeCancelled: false, needsActionOnly: false };
sandbox.renderTable();
let outB = tbody.innerHTML;
ok(outB.indexOf('ハツ江') >= 0, 'B0: 過去温存の対象ユーザーが描画される');
ok(outB.indexOf('計画(') >= 0, 'B1: planStartより前でも計画実績のあるセルは表示される（"-"に隠れない）');
ok(outB.indexOf('kb-cyc-eval') >= 0, 'B1b: planStartより前でも評価実績のあるセルは表示される');
ok(outB.indexOf('disabled">-') >= 0, 'B2: 実績のない開始前セルは従来どおり "-"（disabled）のまま');

// ===== 11. フェーズ2a: 作業月(前月)化。planStart=2026-07 → 6月に計画・測定・評価が揃い、7月に計画バッジが二重に出ない =====
// 会計年度を2026に固定（4月2026〜3月2027を描画）＝6月・7月とも枠内で決定的。表示判定は実行日非依存。
const W = { userId: 'W', name: 'ワク人', furigana: 'ワ', category: '要介護1', planStart: '2026-07', planMonths: 3, days: '月', ampm: '午前', sendMethod: 'PDF' };
sandbox.state = { fiscalYear: 2026, users: [W], records: {}, isLoading: false, includeCancelled: false, needsActionOnly: false };
sandbox.renderTable();
let outW = tbody.innerHTML;
ok(outW.indexOf('計画(7月〜)') >= 0, 'W1: 作業月(6月)に計画パート「計画(7月〜)」が node(計画月)ラベルで出る');
ok((outW.match(/計画\(7月〜\)/g) || []).length === 1, 'W2: 「計画(7月〜)」は1個だけ＝計画月(7月)に対話バッジを二重表示しない');
// 行をtd分割してセル位置を特定（[3]=4月,[4]=5月,[5]=6月,[6]=7月）。計画パートが6月にあり7月に無いこと＝移動を証明。
const rowW = (outW.split('</tr>').find(r => r.indexOf('ワク人') >= 0) || '');
const cellsW = rowW.split('<td');
ok(!!cellsW[5] && cellsW[5].indexOf('計画(7月〜)') >= 0, 'W2b: 計画パートは6月セル(前月＝作業月)に出る');
ok(!!cellsW[6] && cellsW[6].indexOf('計画(') < 0, 'W2c: 7月セル(計画月)には計画パートが出ない（作業月へ移譲＝二重表示なし）');
ok(!!cellsW[5] && cellsW[5].indexOf('kb-cyc-eval') >= 0, 'W3: 作業月(6月)に評価スロットが同居（計画・測定・評価が揃う）');
ok(/data-month="7"[^>]*data-field="keikaku_date"/.test(outW), 'W4: 計画パートの書込先 data-month=7（node=計画月＝格納位置は計画月のまま不変）');
ok(!/data-month="6"[^>]*data-field="keikaku_date"/.test(outW), 'W5: 前月(6月)自身の行へは計画を書き込まない＝格納位置を移さない');

// ===== 12. 年跨ぎ（12月作業月→翌1月計画月）を純関数で検証 =====
const cyc12 = sandbox.kobetsuCycleAt('2026-10', 3, 2026, 12);
ok(cyc12.role === 'work' && cyc12.nodeYear === 2027 && cyc12.nodeMonth === 1,
  'Y1: 12月は作業月・node=翌2027年1月（年跨ぎ計算が正しい）');
ok(sandbox.kobetsuCycleAt('2026-10', 3, 2027, 1).role === 'none', 'Y2: 計画月(1月)自身は role=none（作業月ではない）');

// ===== 13. 変則 planMonths=1: 作業月は開始前月1個だけ =====
ok(sandbox.kobetsuCycleAt('2026-07', 1, 2026, 6).role === 'work', 'V1: 変則(1ヶ月)でも開始前月(6月)は作業月');
ok(sandbox.kobetsuCycleAt('2026-07', 1, 2026, 9).role === 'none', 'V2: 変則(1ヶ月)は他月(9月)は作業月でない');
const V = { userId: 'V', name: 'ヘン子', furigana: 'ワ', category: '要介護1', planStart: '2026-07', planMonths: 1, days: '月', ampm: '午前' };
sandbox.state = { fiscalYear: 2026, users: [V], records: {}, isLoading: false, includeCancelled: false, needsActionOnly: false };
sandbox.renderTable();
ok(((tbody.innerHTML.match(/計画\(/g) || []).length) === 1, 'V3: 変則(1ヶ月)は計画パートが年間1個だけ（作業月=開始前月のみ）');

// ===== 14. planStart前月がグリッド範囲外（4月開始→前月は前年度3月）でもエラーにならず従来表示 =====
const A = { userId: 'A', name: 'エイ子', furigana: 'ワ', category: '要介護1', planStart: '2026-04', planMonths: 3, days: '月', ampm: '午前' };
sandbox.state = { fiscalYear: 2026, users: [A], records: {}, isLoading: false, includeCancelled: false, needsActionOnly: false };
let threw = false;
try { sandbox.renderTable(); } catch (e) { threw = true; }
ok(!threw, 'X1: 作業月がグリッド範囲外の利用者でもエラーにならない');
ok(tbody.innerHTML.indexOf('計画(4月〜)') >= 0, 'X2: 前月が範囲外の計画月(4月)は従来どおり自セルに計画パートを出す（フォールバック）');

// ===== 15. 回帰(クロ指摘): planStartを後ろへ動かし、旧データが作業月“自身の行”に残るケースで隠れない =====
// M: planStart=2026-07 だが 6月(作業月)自身の行に旧・計画/測定データ。node(7月)は空 → 温存フォールバックで6月に表示。
const M = { userId: 'M', name: 'ムー太', furigana: 'ワ', category: '要介護1', planStart: '2026-07', planMonths: 3, days: '月', ampm: '午前' };
sandbox.state = { fiscalYear: 2026, users: [M], records: { 'M_2026_6': { keikaku_date: '2026-06-10', sokutei_date: '2026-06-12' } }, isLoading: false, includeCancelled: false, needsActionOnly: false };
sandbox.renderTable();
let outM = tbody.innerHTML;
ok(outM.indexOf('6/10') >= 0, 'M1: 作業月自身の行の旧・計画データ(6/10)が隠れず表示される（フェーズ1温存の維持）');
ok(outM.indexOf('6/12') >= 0, 'M2: 作業月自身の行の旧・測定データ(6/12)が隠れず表示される');
// 旧データは6月(自セル)行のまま＝格納位置を動かさない（書込先data-month=6）。
const rowM = (outM.split('</tr>').find(r => r.indexOf('ムー太') >= 0) || '');
const cellsM = rowM.split('<td');
ok(!!cellsM[5] && cellsM[5].indexOf('6/10') >= 0, 'M3: 旧データは6月セルに温存表示される');
ok(/data-month="6"[^>]*data-field="keikaku_date"/.test(outM), 'M4: 温存フォールバック時の書込先は自セル(6月)＝旧データの位置を動かさない');

// 別パターン: planStart 5月→8月 で旧6月データ（6月は作業月でないので従来の温存で拾う）
const M2 = { userId: 'M2', name: 'ニー美', furigana: 'ワ', category: '要介護1', planStart: '2026-08', planMonths: 3, days: '月', ampm: '午前' };
sandbox.state = { fiscalYear: 2026, users: [M2], records: { 'M2_2026_6': { keikaku_date: '2026-06-20' } }, isLoading: false, includeCancelled: false, needsActionOnly: false };
sandbox.renderTable();
ok(tbody.innerHTML.indexOf('6/20') >= 0, 'M5: planStart 5月→8月の旧6月データも隠れない（従来の温存で表示）');

console.log('個別機能訓練 1ヶ月1列グリッド DOM: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
