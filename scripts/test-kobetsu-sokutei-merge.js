// test-kobetsu-sokutei-merge.js
// 個訓アプリの「測定 未／済」を2ソースの和で判定する（2026-07-30）。
//
// 実測で分かった根っこ（2026-07-30）:
//   要介護52名のうち 個訓シートにだけ測定日がある人20名／測定記録シートにだけある人4名／両方0名。
//   2つのシートが完全に分断されており、測定管理アプリで入れると個訓は「未」、
//   個訓で入れると測定管理は「なし」になる。どちらの画面も嘘をつく。
//
// ★書き込みは増やさない。個訓シートの sokutei_date には1バイトも書かない。
//   読む側を両方にするだけ（測定管理で pickLastDate を入れたのと同じ手）。
// ★突き合わせは正規化名（kbNormKey）。生名で照合すると表記ゆれで外れる。
// ★測定記録シートには「何月分の測定か」の列が無いので、測定日の月のセルに出す。
// ★getShienSokutei が落ちても、個訓シートだけで従来どおり動くこと（画面を壊さない）。
//
// 実行: node scripts/test-kobetsu-sokutei-merge.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, '個別機能訓練計画書チェック.html'), 'utf8');
const shared = fs.readFileSync(path.join(REPO, 'shared.js'), 'utf8');

function extractFrom(src, name) {
  const sig = 'function ' + name + '(';
  const s = src.indexOf(sig);
  if (s < 0) throw new Error('関数が無い（未実装＝RED）: ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(s, j + 1); } }
}
// 2026-07-31 段階4: renderTable が予定月ベースの判定を呼ぶようになったため、
//   その純関数群も実HTMLから一緒に抽出する（フォールバック側＝planStartベースの検証内容は不変）。
const HTML_FNS = ['renderTable', 'kbYm', 'kbBuildYoteiMap', 'kbYoteiYm', 'kbIsPlanCell', 'kbIsHyoukaCell', 'kbYoteiLabel', 'kobetsuCycleAt', 'getGroup', 'matchesFilter', 'kbBadgeObj', 'kbPlanBadges', 'kbEvalBadges',
  'kbBadgeHtml', 'kbSubmitDue', 'escapeHtml', 'escapeAttr', 'formatMD', 'formatTodayISO',
  'kbNormKey', 'kbPickSokuteiDate', 'kbBuildSokuteiByMonth', 'kbSokuteiForCell'];
const SHARED_FNS = ['isPlanMonth', 'isHyoukaMonth', 'isBeforePlanStart'];
const fnSrc = HTML_FNS.map(n => extractFrom(html, n)).join('\n') + '\n' + SHARED_FNS.map(n => extractFrom(shared, n)).join('\n');

function el() { return { style: {}, innerHTML: '', textContent: '', classList: { add() { }, remove() { }, contains() { return false; } } }; }
const thead = el(), tbody = el();
const ids = {};
['emptyMessage', 'filterBar', 'filterCount', 'totalUsers', 'thisMonthCount', 'progressCount', 'progressTotal',
  'hyoukaMonthCount', 'hyoukaDoneCount', 'hyoukaTotalCount'].forEach(id => ids[id] = el());
const sandbox = {
  busy: {},                                  // 段階4: 送信中ロック（この検証では常に空）
  // 月の足し算は yotei-core.js の本物を使う（この画面に複製しない＝単一の正）
  ymAdd: require(require('path').resolve(__dirname, '../gas/yawaragi-board/yotei-core.js')).ymAdd,
  document: {
    querySelector: sel => sel.indexOf('thead') >= 0 ? thead : (sel.indexOf('tbody') >= 0 ? tbody : el()),
    getElementById: id => ids[id] || el()
  },
  console: console, Math: Math, String: String, Date: Date, JSON: JSON, Object: Object, Array: Array,
  Number: Number, parseInt: parseInt, RegExp: RegExp, isNaN: isNaN,
  filterDay: '', filterAmpm: '', filterGroup: '',
  usageGate: {}, sortUsers: function () { }, updateStats: function () { },
  isPending: function () { return false; }, ensureUsageGate: function () { }, state: null
};
sandbox.MONTHS = [];
for (let i = 0; i < 12; i++) { const mm = ((4 - 1 + i) % 12) + 1; sandbox.MONTHS.push({ m: mm, label: mm + '月', nextYear: (4 + i) > 12 }); }
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fnSrc, sandbox);
const S = sandbox;

let pass = 0, fail = 0;
function eq(a, e, l) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('  PASS ' + l); }
  else { fail++; console.log('  FAIL ' + l + '\n    actual  =' + A + '\n    expected=' + E); }
}
function ok(c, l) { eq(!!c, true, l); }
function sec(t) { console.log('\n[' + t + ']'); }

// =====================================================================
sec('1. kbNormKey: 突き合わせは正規化名で行う（測定管理の normKey と同じ規則）');
eq(S.kbNormKey('ダミー甲'), S.kbNormKey('ダミー　甲'), '全角スペース入りでも一致');
eq(S.kbNormKey('ダミー甲'), S.kbNormKey('ダミー 甲'), '半角スペース入りでも一致');
eq(S.kbNormKey('ダミー甲'), S.kbNormKey('ダミー甲 様'), '「様」付きでも一致');
eq(S.kbNormKey('ダミー甲') === S.kbNormKey('ダミー乙'), false, '別人は一致しない');
eq(S.kbNormKey(null), '', 'null でも落ちない');
eq(S.kbNormKey(undefined), '', 'undefined でも落ちない');

sec('2. kbPickSokuteiDate: 両方あれば新しい方を採る');
eq(S.kbPickSokuteiDate('2026-07-14', '2026-07-27'), '2026-07-27', '★測定記録シートの方が新しい → そちらを採る');
eq(S.kbPickSokuteiDate('2026-07-27', '2026-07-14'), '2026-07-27', '★個訓シートの方が新しい → そちらを採る');
eq(S.kbPickSokuteiDate('2026-07-14', ''), '2026-07-14', '個訓だけ（20名の型）');
eq(S.kbPickSokuteiDate('', '2026-07-27'), '2026-07-27', '測定記録だけ（4名の型）');
eq(S.kbPickSokuteiDate('', ''), '', 'どちらにも無い → 空（「未」のまま）');
eq(S.kbPickSokuteiDate(null, undefined), '', 'null/undefined でも落ちない');
eq(S.kbPickSokuteiDate('2026-12-28', '2027-01-05'), '2027-01-05', '★年またぎでも新しい方（文字列比較で正しい）');

sec('3. kbBuildSokuteiByMonth: 測定記録シート → { 正規化名: { 年月: その月の最新日 } }');
{
  const rows = [
    { name: 'ダミー甲', sokutei_date: '2026-07-02', sokutei_by: 'スタッフX', source: 'app' },
    { name: 'ダミー　甲', sokutei_date: '2026-07-27', sokutei_by: 'スタッフY', source: 'app' },  // 表記ゆれ・同月で新しい
    { name: 'ダミー乙', sokutei_date: '2026-12-28', sokutei_by: 'スタッフX', source: 'app' },
    { name: 'ダミー乙', sokutei_date: '2027-01-05', sokutei_by: 'スタッフX', source: 'app' },
    { name: '', sokutei_date: '2026-07-10' },
    { name: 'ダミー丙', sokutei_date: '' },
    { name: 'ダミー丁', sokutei_date: 'こわれた日付' }
  ];
  const m = S.kbBuildSokuteiByMonth(rows, S.kbNormKey);
  eq(m[S.kbNormKey('ダミー甲')]['2026-07'], '2026-07-27', '★同じ人・同じ月に2行あれば新しい日を採る（表記ゆれも同じ人として束ねる）');
  eq(m[S.kbNormKey('ダミー乙')]['2026-12'], '2026-12-28', '★年またぎ: 12月は12月のセルへ');
  eq(m[S.kbNormKey('ダミー乙')]['2027-01'], '2027-01-05', '★年またぎ: 1月は1月のセルへ（別々に持つ）');
  eq(Object.keys(m).length, 2, '氏名なし・日付なし・壊れた日付の行は捨てる');
  eq(S.kbBuildSokuteiByMonth([], S.kbNormKey), {}, '空配列 → 空');
  eq(S.kbBuildSokuteiByMonth(null, S.kbNormKey), {}, '★null → 空（getShienSokutei 失敗時の想定）');
  eq(S.kbBuildSokuteiByMonth(undefined, S.kbNormKey), {}, 'undefined → 空');
}

sec('4. kbSokuteiForCell: そのセル（年月）に出す測定日を引く');
{
  const m = S.kbBuildSokuteiByMonth([
    { name: 'ダミー甲', sokutei_date: '2026-07-27' },
    { name: 'ダミー乙', sokutei_date: '2026-12-28' }
  ], S.kbNormKey);
  eq(S.kbSokuteiForCell(m, 'ダミー甲', 2026, 7, S.kbNormKey), '2026-07-27', '★測定日の月のセルに出す');
  eq(S.kbSokuteiForCell(m, 'ダミー　甲', 2026, 7, S.kbNormKey), '2026-07-27', '★表記ゆれでも引ける');
  eq(S.kbSokuteiForCell(m, 'ダミー甲', 2026, 8, S.kbNormKey), '', '別の月のセルには出さない');
  eq(S.kbSokuteiForCell(m, 'ダミー丙', 2026, 7, S.kbNormKey), '', '記録が無い人は空');
  eq(S.kbSokuteiForCell(m, 'ダミー乙', 2026, 12, S.kbNormKey), '2026-12-28', '★年またぎ: 12月セル');
  eq(S.kbSokuteiForCell(m, 'ダミー乙', 2027, 1, S.kbNormKey), '', '1月セルには12月の測定を出さない');
  eq(S.kbSokuteiForCell({}, 'ダミー甲', 2026, 7, S.kbNormKey), '', '★空のマップ（API失敗）でも落ちない');
  eq(S.kbSokuteiForCell(null, 'ダミー甲', 2026, 7, S.kbNormKey), '', '★null でも落ちない');
  eq(S.kbSokuteiForCell(m, '', 2026, 7, S.kbNormKey), '', '氏名が空なら空');
}

sec('5. kbPlanBadges: 測定バッジの材料を2ソースの和にする');
{
  const kunrenOnly = { keikaku_date: '2026-07-27', sokutei_date: '2026-07-14', keikaku_sent_date: '' };
  const neither = { keikaku_date: '2026-07-27', sokutei_date: '', keikaku_sent_date: '' };
  const bOf = (rec, extra) => S.kbPlanBadges(rec, extra).find(b => b.label === '測定');
  eq(bOf(kunrenOnly).state, 'done', '★個訓だけ（20名の型）は従来どおり済（第2引数なしでも動く）');
  eq(bOf(kunrenOnly).date, '2026-07-14', '日付も従来どおり');
  eq(bOf(neither, '2026-07-27').state, 'done', '★測定記録だけ（4名の型）で済になる');
  eq(bOf(neither, '2026-07-27').date, '2026-07-27', '測定記録シートの日付が出る');
  eq(bOf(kunrenOnly, '2026-07-27').date, '2026-07-27', '★両方あれば新しい方（測定記録が新しい）');
  eq(bOf({ sokutei_date: '2026-07-27' }, '2026-07-14').date, '2026-07-27', '★両方あれば新しい方（個訓が新しい）');
  eq(bOf(neither).state, 'todo', 'どちらにも無ければ「未」のまま');
  eq(bOf(neither, '').state, 'todo', '空文字を渡しても「未」のまま');
  eq(bOf(neither, null).state, 'todo', '★null（API失敗）でも「未」＝従来どおり');
  // 2026-07-30: 「提出」は個訓アプリの管轄外になった（送付アプリの担当）ので2つになった
  eq(S.kbPlanBadges(neither, '2026-07-27').map(b => b.label), ['計画', '測定'], 'バッジの並びは変えない');
  eq(S.kbPlanBadges({}).length, 2, '空の rec でも落ちない');
}

// =====================================================================
// 実描画（本物の renderTable）。当月を「作業月」にした型＝本番の4名と同じ形。
//   planStart = 当月−2ヶ月 → 計画月は 当月−2 / 当月+1 …、作業月は 当月−3 / 当月 …
//   つまり当月セルに「計画(◯月〜)」パートが出る。そこの測定バッジを見る。
// =====================================================================
const now = new Date();
const nowY = now.getFullYear(), nowM = now.getMonth() + 1;
const fy = nowM >= 4 ? nowY : nowY - 1;
function ymAdd2(y, m, n) { const t = (y * 12 + (m - 1)) + n; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; }
const ps = ymAdd2(nowY, nowM, -2);
const planStart = ps.y + '-' + String(ps.m).padStart(2, '0');
const nowYM = nowY + '-' + String(nowM).padStart(2, '0');
const USERS = [
  { userId: 'U1', name: 'ダミー甲', furigana: 'ダミーコウ', planStart: planStart, planMonths: 3, sendMethod: 'PDF' },
  { userId: 'U2', name: 'ダミー乙', furigana: 'ダミーオツ', planStart: planStart, planMonths: 3, sendMethod: 'PDF' }
];
// 甲＝個訓シートに測定日あり（20名の型）／乙＝個訓シートは空（4名の型）
const node = ymAdd2(nowY, nowM, 1);   // 当月セルが読み書きする計画月ノード
const RECORDS = {};
RECORDS['U1_' + node.y + '_' + node.m] = { keikaku_date: nowYM + '-01', sokutei_date: nowYM + '-05', keikaku_sent_date: '', tasseido_date: '' };
RECORDS['U2_' + node.y + '_' + node.m] = { keikaku_date: nowYM + '-01', sokutei_date: '', keikaku_sent_date: '', tasseido_date: '' };
function render(shienRows) {
  S.state = {
    users: USERS.map(u => Object.assign({}, u)),
    records: JSON.parse(JSON.stringify(RECORDS)),
    fiscalYear: fy, filterMode: 'all', includeCancelled: false,
    shienByMonth: S.kbBuildSokuteiByMonth(shienRows, S.kbNormKey)
  };
  S.renderTable();
  return tbody.innerHTML;
}
function cellOf(h, name) {
  const i = h.indexOf('data-name="' + name + '"');
  if (i < 0) return '';
  const rowEnd = h.indexOf('</tr>', i);
  return h.slice(i, rowEnd < 0 ? h.length : rowEnd);
}
// 「計画(◯月〜)」パートのうち、当月セルぶんだけを切り出す
function planPartOf(h, name) {
  const row = cellOf(h, name);
  const marker = 'data-year="' + node.y + '" data-month="' + node.m + '" data-field="keikaku_date"';
  const i = row.indexOf(marker);
  if (i < 0) return '';
  const end = row.indexOf('</div>', i);
  return row.slice(i, end < 0 ? row.length : end);
}
// 測定バッジ1個ぶん（外側の span から）を切り出す。
// ラベルは <span style="opacity:0.8;">測定</span> の入れ子なので、外側までさかのぼる（色の検証に要る）。
function sokuteiBadge(part) {
  const i = part.indexOf('>測定<');
  if (i < 0) return '';
  const inner = part.lastIndexOf('<span', i);
  const outer = part.lastIndexOf('<span', inner - 1);
  return part.slice(outer < 0 ? inner : outer, part.indexOf('</span></span>', i) + 14);
}

sec('6. 実描画: 測定記録シートにだけある人（本番4名の型）が「済」になる');
{
  const h = render([{ name: 'ダミー乙', sokutei_date: nowYM + '-27', sokutei_by: 'スタッフX', source: 'app' }]);
  const p2 = planPartOf(h, 'ダミー乙');
  ok(p2.indexOf('測定') >= 0, '前提: 乙の当月セルに計画パート（測定バッジ）が出ている');
  ok(sokuteiBadge(p2).indexOf('✓') >= 0, '★測定記録シートだけの人が「済」になる（✓が付く）');
  eq(sokuteiBadge(p2).indexOf('未') >= 0, false, '「未」ではなくなる');
  ok(sokuteiBadge(p2).indexOf('#e8f5e9') >= 0, '済の色（緑）で描かれる');
  const p1 = planPartOf(h, 'ダミー甲');
  ok(sokuteiBadge(p1).indexOf('✓') >= 0, '★従来から個訓シートにある人（20名の型）は変わらず「済」');
}

sec('7. 実描画: 個訓シートにだけある人は1バイトも変わらない');
{
  const before = render([]);                    // 測定記録シートが空
  const after = render([{ name: 'ダミー甲', sokutei_date: nowYM + '-05', sokutei_by: 'スタッフX', source: 'app' }]);
  eq(planPartOf(before, 'ダミー甲') === planPartOf(after, 'ダミー甲'), true,
    '★同じ日付が両方にあっても描画は同じ（二重に足さない）');
  const p2 = planPartOf(before, 'ダミー乙');
  ok(sokuteiBadge(p2).indexOf('未') >= 0, '測定記録が無ければ従来どおり「未」');
}

sec('8. 実描画: getShienSokutei が失敗しても画面が壊れない（従来どおり動く）');
{
  let threw = false, h = '';
  try { h = render(null); } catch (e) { threw = true; }
  eq(threw, false, '★null（取得失敗）でも例外を投げない');
  ok(h.indexOf('ダミー甲') >= 0 && h.indexOf('ダミー乙') >= 0, '2人とも描画される');
  ok(sokuteiBadge(planPartOf(h, 'ダミー甲')).indexOf('✓') >= 0, '個訓シート由来の「済」は従来どおり出る');
  ok(sokuteiBadge(planPartOf(h, 'ダミー乙')).indexOf('未') >= 0, '拾えない人は従来どおり「未」（勝手に済にしない）');
  let threw2 = false;
  try { S.state.shienByMonth = undefined; S.renderTable(); } catch (e) { threw2 = true; }
  eq(threw2, false, '★state に materials が無くても落ちない（キャッシュ復元直後の想定）');
}

sec('9. 表記ゆれ（normKey）で一致／不一致');
{
  const h = render([{ name: 'ダミー　乙', sokutei_date: nowYM + '-27', source: 'app' }]);   // 全角スペース入り
  ok(sokuteiBadge(planPartOf(h, 'ダミー乙')).indexOf('✓') >= 0, '★表記ゆれでも正規化して一致する');
  const h2 = render([{ name: 'ダミー丙', sokutei_date: nowYM + '-27', source: 'app' }]);    // 別人
  ok(sokuteiBadge(planPartOf(h2, 'ダミー乙')).indexOf('未') >= 0, '★別人の記録は拾わない');
}

sec('10. 個訓シートへの書き込みを増やしていない（実バイト確認）');
{
  const writes = (html.match(/field=sokutei_date/g) || []).length;
  eq(writes, 0, '★sokutei_date を書く updateKeikakusho の呼び出しを増やしていない');
  ok(html.indexOf('action=getShienSokutei') >= 0, '測定記録シートは読むだけ（getShienSokutei）');
  eq((html.match(/action=addShienSokutei/g) || []).length, 0, '測定記録シートにも書かない（読み取り専用）');
}

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
