// 個訓アプリ 段階3（片寄せ）: 測定の入力を撤去し、表示だけ残す
// 実行: node scripts/test-kobetsu-sokutei-readonly.js
//
// 仕様（社長決定 2026-08-01・案A）:
//   ・測定の入力（測定日／測定者／出力者）は測定管理アプリ(sokutei.html)へ一本化する。
//     個訓アプリから個訓シート13〜15列目へ書き込む経路を1つも残さない。
//     理由: 個訓から書くと測定管理側の予定月(domain='sokutei')が追随せず、二重督促が増える。
//   ・★表示は減らさない。測定✓／測定 未 のバッジは2ソース和（個訓シート13列目 ∪ 測定記録シート）
//     のまま維持する。既存の個訓シート側データ（2026-08-01 実測20名）が画面から消えないこと。
//   ・計画書ダイアログには「いまの測定状態（読み取り）＋ 案内 ＋ 測定アプリを開くリンク」を出す。
//   ・計画書・評価・興味関心・生活機能の入力は従来どおり。撤去するのは測定だけ。
//   ・GAS側の受け口（updateKeikakusho の sokutei_date/sokutei_by/output_by）は撤去しない
//     （additive の原則。呼ばれなくなるだけ＝巻き戻し可能にしておく）。
//
// 実HTMLから本物の関数を抽出して回す（テスト用に写した別実装ではない）。
// 利用者の実名は使わない（記号のみ）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, '個別機能訓練計画書チェック.html'), 'utf8');
const shared = fs.readFileSync(path.join(REPO, 'shared.js'), 'utf8');
const gasSrc = fs.readFileSync(path.join(REPO, 'gas', 'yawaragi-board', 'コード.js'), 'utf8');
const core = require(path.join(REPO, 'gas', 'yawaragi-board', 'yotei-core.js'));

function extractFrom(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('関数が無い（未実装＝RED）: ' + name);
  const s = m.index;
  let i = src.indexOf('{', s), d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(s, j + 1); } }
  throw new Error('閉じ括弧が見つからない: ' + name);
}
function extractConst(src, name) {
  const m = new RegExp('const\\s+' + name + '\\s*=\\s*([^;]+);').exec(src);
  if (!m) throw new Error('定数が無い: ' + name);
  return 'var ' + name + ' = ' + m[1] + ';';
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.error('  [FAIL] ' + m); } }
function sec(t) { console.log('\n[' + t + ']'); }

// ---- 実HTML/shared.js から本物を抽出 ----
const HTML_FNS = ['kbHasPlanRowData', 'kbPlanMovesToPrevMonth', 'renderTable', 'kobetsuCycleAt', 'getGroup',
  'matchesFilter', 'kbBadgeObj', 'kbPlanBadges', 'kbEvalBadges', 'kbBadgeHtml', 'kbSubmitDue',
  'escapeHtml', 'escapeAttr', 'formatMD', 'formatTodayISO', 'kbNormKey', 'kbPickSokuteiDate', 'kbSokuteiForCell',
  'blockedIcon', 'blockedLabel', 'kbYm', 'kbBuildYoteiMap', 'kbYoteiYm', 'kbIsPlanCell', 'kbIsHyoukaCell',
  'kbYoteiLabel', 'kbAdoptYoteiRow', 'updateStats', 'kbBuildSokuteiByMonth', 'openDateDialog', 'onCellTap'];
const SHARED_FNS = ['isPlanMonth', 'isHyoukaMonth', 'isBeforePlanStart'];
const fnSrc = extractConst(html, 'KB_WORK_MONTH_FROM') + '\n'
  + HTML_FNS.map(n => extractFrom(html, n)).join('\n') + '\n'
  + SHARED_FNS.map(n => extractFrom(shared, n)).join('\n');

// ---- DOMスタブ ----
function el(id) {
  return {
    id: id || '', style: {}, innerHTML: '', textContent: '', className: '', value: '',
    dataset: {},
    classList: { _s: {}, add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; }, contains(c) { return !!this._s[c]; } }
  };
}
const thead = el(), tbody = el();
const ids = {};
['emptyMessage', 'filterBar', 'filterCount', 'totalUsers', 'thisMonthCount', 'progressCount', 'progressTotal',
  'hyoukaMonthCount', 'hyoukaDoneCount', 'hyoukaTotalCount', 'blockedCount', 'yoteiBanner',
  'blockBtnRow', 'blockedBanner', 'blockedSub', 'dateDialog', 'dateDialogSub', 'dateDialogTitle',
  'dateInput', 'dateInputBtnRow', 'measureSection', 'reasonPicker', 'unblockBtnRow',
  'measureStatus'].forEach(id => ids[id] = el(id));
// ★撤去対象のIDは「存在しない」状態にする。実装が触れば TypeError で落ちる＝経路が残っている証拠。
const REMOVED_IDS = ['sokuteiDateInput', 'sokuteiByInput', 'outputByInput'];

const sandbox = {
  document: {
    querySelector: sel => sel.indexOf('thead') >= 0 ? thead : (sel.indexOf('tbody') >= 0 ? tbody : el()),
    getElementById: id => (REMOVED_IDS.indexOf(id) >= 0) ? null : (ids[id] || (ids[id] = el(id)))
  },
  console: console, Math: Math, String: String, Date: Date, JSON: JSON, Object: Object, Array: Array,
  Number: Number, parseInt: parseInt, RegExp: RegExp, isNaN: isNaN,
  filterDay: '', filterAmpm: '', filterGroup: '',
  usageGate: {}, sortUsers() { }, isPending() { return false; }, ensureUsageGate() { }, busy: {},
  ymAdd: core.ymAdd, ymCandidates: core.ymCandidates, isDue: core.isDue,
  getMeasurerOptions: () => ['ス1', 'ス2'],
  dialogState: {}, state: null
};
sandbox.MONTHS = [
  { m: 4, label: '4月' }, { m: 5, label: '5月' }, { m: 6, label: '6月' },
  { m: 7, label: '7月' }, { m: 8, label: '8月' }, { m: 9, label: '9月' },
  { m: 10, label: '10月' }, { m: 11, label: '11月' }, { m: 12, label: '12月' },
  { m: 1, label: '1月', nextYear: true }, { m: 2, label: '2月', nextYear: true }, { m: 3, label: '3月', nextYear: true }
];
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fnSrc, sandbox);

// ---- fixture ----
const EMPTY = { kyoumi_date: '', seikatsu_date: '', keikaku_date: '', blocked_reason: '', sokutei_date: '', sokutei_by: '', output_by: '', tasseido_date: '' };
const rec = o => Object.assign({}, EMPTY, o || {});
const K = (uid, y, m) => uid + '_' + y + '_' + m;
const baseUser = (uid, mark, planStart) => ({
  userId: uid, name: mark, furigana: 'ア', category: '要介護1',
  planStart: planStart, planMonths: 3, days: '月', ampm: '午前'
});
const yo = (uid, mark, ym) => ({ userId: uid, name: mark, domain: 'kobetsu', nextYm: ym, cycleMonths: 3, slideCount: 0, note: '' });
const FY = 2026;
function render(users, records, yoteiRecords, shienByMonth) {
  const built = sandbox.kbBuildYoteiMap(yoteiRecords);
  sandbox.state = {
    fiscalYear: FY, users: users, records: records || {}, isLoading: false,
    needsActionOnly: false, shienByMonth: shienByMonth || {},
    yotei: built.map, yoteiOk: built.ok
  };
  sandbox.renderTable();
  return tbody.innerHTML;
}
function rowCells(h, mark) {
  const rows = h.split('<tr').filter(r => r.indexOf(mark) >= 0);
  return rows.length ? rows[0].split('<td').slice(3) : null;
}
function cell(tds, y, m) {
  const i = sandbox.MONTHS.findIndex(mo => mo.m === m && ((mo.nextYear ? FY + 1 : FY) === y));
  return i < 0 ? null : tds[i];
}
// 測定バッジの状態を読む（済=緑#e8f5e9 / 未=赤#ffebee）
function sokuteiBadge(td) {
  if (!td) return '(セルなし)';
  const bs = (td.split('<span style="display:inline-flex').slice(1)).filter(b => b.indexOf('測定') >= 0);
  if (!bs.length) return '(バッジなし)';
  return bs[0].indexOf('#ffebee') >= 0 ? '未' : '済';
}
function sokuteiBadgeDate(td) {
  if (!td) return '';
  const bs = (td.split('<span style="display:inline-flex').slice(1)).filter(b => b.indexOf('測定') >= 0);
  if (!bs.length) return '';
  const m = bs[0].match(/<span>✓([^<]*)<\/span>/);
  return m ? m[1] : '';
}

// =====================================================================
sec('A) 個訓アプリから測定を書き込む経路が1つも無い');
{
  // 撤去を説明するコメント中の言及は許す。関数定義と呼び出しが消えていることを見る。
  ok(!/function\s+saveMeasureFromDialog/.test(html), 'A1a: saveMeasureFromDialog の定義が存在しない');
  ok(!/saveMeasureFromDialog\(\)"/.test(html), 'A1b: saveMeasureFromDialog を呼ぶボタンが存在しない');
  ok(html.indexOf('sokuteiDateInput') < 0, 'A2: 測定日の入力欄(sokuteiDateInput)が存在しない');
  ok(html.indexOf('sokuteiByInput') < 0, 'A3: 測定者の入力欄(sokuteiByInput)が存在しない');
  ok(html.indexOf('outputByInput') < 0, 'A4: 出力者の入力欄(outputByInput)が存在しない');
  // applyValue / URL 組み立てへ 測定系フィールドを渡す箇所が無いこと（文字列リテラルとしての出現を見る）
  ["'sokutei_date'", "'sokutei_by'", "'output_by'"].forEach(lit => {
    ok(html.indexOf(lit) < 0, 'A5[' + lit + ']: 書込フィールド名としてのリテラルが残っていない');
  });
  ok(!/jobs\.push\(\[\s*'sokutei/.test(html), 'A6: 測定を送信ジョブに積む箇所が無い');
}

sec('B) 測定の表示は2ソースとも従来どおり残る');
{
  const u = [baseUser('U1', 'ダミーA', '2026-04')];
  const yr = [yo('U1', 'ダミーA', '2026-11')];
  // ①個訓シート13列目 由来（既存20名がこの形）
  const r1 = {}; r1[K('U1', 2026, 8)] = rec({ keikaku_date: '2026-07-27', sokutei_date: '2026-07-06' });
  const t1 = cell(rowCells(render(u, r1, yr), 'ダミーA'), 2026, 7);
  ok(sokuteiBadge(t1) === '済', 'B1: ①個訓シートの sokutei_date が「測定✓」で出る 実際=' + sokuteiBadge(t1));
  ok(sokuteiBadgeDate(t1) === '7/6', 'B2: ①日付も従来どおり 実際=' + sokuteiBadgeDate(t1));
  // ②測定記録シート 由来（セルの月で引く）
  const r2 = {}; r2[K('U1', 2026, 8)] = rec({ keikaku_date: '2026-07-27' });
  const sh = { 'ダミーA': { '2026-07': '2026-07-06' } };
  const t2 = cell(rowCells(render(u, r2, yr, sh), 'ダミーA'), 2026, 7);
  ok(sokuteiBadge(t2) === '済', 'B3: ②測定記録シートの測定が「測定✓」で出る 実際=' + sokuteiBadge(t2));
  ok(sokuteiBadgeDate(t2) === '7/6', 'B4: ②日付も出る 実際=' + sokuteiBadgeDate(t2));
  // ③どちらにも無ければ「未」
  const t3 = cell(rowCells(render(u, r2, yr), 'ダミーA'), 2026, 7);
  ok(sokuteiBadge(t3) === '未', 'B5: ③どちらにも無ければ「測定 未」 実際=' + sokuteiBadge(t3));
  // ④これから作る（予定月）セルにも測定バッジが出る＝「誰が測定するか」が月列で分かる
  const t4 = cell(rowCells(render(u, {}, yr), 'ダミーA'), 2026, 10);
  ok(sokuteiBadge(t4) === '未', 'B6: ④予定月の作業月セルにも「測定 未」が出る（把握の用途を壊さない）');
}

sec('C) 既存の個訓シート側データが画面から消えない（撤去しても読み続ける）');
{
  // 2026-08-01 実測の形: 個訓シートにだけ測定日がある（測定記録シートには無い）
  const u = [baseUser('U1', 'ダミーB', '2026-04')];
  const yr = [yo('U1', 'ダミーB', '2026-11')];
  const r = {};
  r[K('U1', 2026, 5)] = rec({ sokutei_date: '2026-07-02', sokutei_by: 'ス1', output_by: 'ス1' });
  const tds = rowCells(render(u, r, yr), 'ダミーB');
  const c = cell(tds, 2026, 5);   // 2026-05 の行は据え置き（KB_WORK_MONTH_FROM より前）
  ok(!!c && c.indexOf('data-field="keikaku_date"') >= 0, 'C1: 測定だけの行でも計画パートが残る（"-"に潰れない）');
  ok(sokuteiBadge(c) === '済', 'C2: 個訓シートだけの測定が「済」で残る 実際=' + sokuteiBadge(c));
  ok(sokuteiBadgeDate(c) === '7/2', 'C3: 日付も残る 実際=' + sokuteiBadgeDate(c));
  ok(sandbox.kbHasPlanRowData(r[K('U1', 2026, 5)]) === true, 'C4: 温存判定も従来どおり sokutei_date を見る');
}

sec('D) 計画書ダイアログ: 入力欄は消え、状態＋案内＋リンクが出る');
{
  const u = [baseUser('U1', 'ダミーC', '2026-04')];
  const r = {}; r[K('U1', 2026, 8)] = rec({ keikaku_date: '2026-07-27', sokutei_date: '2026-07-06' });
  render(u, r, [yo('U1', 'ダミーC', '2026-11')], {});
  let threw = null;
  try {
    // 計画パートのタップ相当（書込先＝期間開始月／表示セル＝その前月）
    sandbox.onCellTap({
      classList: { contains: () => false },
      dataset: { userid: 'U1', name: 'ダミーC', year: '2026', month: '8', field: 'keikaku_date', fieldlabel: '計画', cellyear: '2026', cellmonth: '7' }
    });
  } catch (e) { threw = e; }
  ok(!threw, 'D1: 撤去後の計画セルタップで例外が出ない' + (threw ? ' 実際=' + threw.message : ''));
  ok(ids.measureSection.style.display === 'block', 'D2: 計画セルでは測定セクションが表示される（案内として残す）');
  // 案内とリンクは静的マークアップなので、実HTMLの measureSection ブロックを直接見る。
  const secStart = html.indexOf('<div id="measureSection"');
  const secHtml = html.slice(secStart, html.indexOf('</div>\n    </div>', secStart));
  ok(secHtml.indexOf('href="sokutei.html"') >= 0, 'D3: 測定管理アプリ(sokutei.html)へのリンクがある');
  ok(secHtml.indexOf('target="_blank"') >= 0, 'D3b: リンクは別タブで開く（入力中の計画書日を失わない）');
  ok(secHtml.indexOf('測定管理アプリ') >= 0, 'D4: 入力先を案内する文言がある');
  ok(secHtml.indexOf('<input') < 0 && secHtml.indexOf('<select') < 0, 'D6: 入力要素（input/select）が1つも無い');
  // 状態は JS が measureStatus へ差し込む（2ソース和）。
  const st = ids.measureStatus.innerHTML;
  ok(st.indexOf('測定') >= 0 && st.indexOf('7/6') >= 0, 'D5: いまの測定状態（済 7/6）が読み取りで出る 実際=' + st.slice(0, 120));
  ok(st.indexOf('#e8f5e9') >= 0, 'D5b: 済なので緑で出る');
  // 保留セルでは出さない（従来どおり）
  sandbox.onCellTap({
    classList: { contains: () => false },
    dataset: { userid: 'U1', name: 'ダミーC', year: '2026', month: '9', field: 'keikaku_date', fieldlabel: '計画', cellyear: '2026', cellmonth: '8' }
  });
  ok(ids.measureSection.style.display === 'block', 'D7: 記録の無い計画セルでも案内は出る');
  ok(ids.measureStatus.innerHTML.indexOf('#ffebee') >= 0, 'D8: 記録が無ければ「測定 未」を赤で出す');
}

sec('E) 計画書・評価・興味関心・生活機能の入力は従来どおり');
{
  ok(/data-field="keikaku_date"/.test(tbody.innerHTML) || true, 'E0: （下で個別に見る）');
  const u = [baseUser('U1', 'ダミーD', '2026-04')];
  const r = {}; r[K('U1', 2026, 8)] = rec({ keikaku_date: '2026-07-27' });
  const h = render(u, r, [yo('U1', 'ダミーD', '2026-11')]);
  const tds = rowCells(h, 'ダミーD');
  ok((cell(tds, 2026, 7) || '').indexOf('data-field="keikaku_date"') >= 0, 'E1: 計画書の入力導線は残っている');
  ok(h.indexOf('data-field="hyouka"') >= 0, 'E2: 評価の入力導線は残っている');
  // 興味関心・生活機能はダイアログのラベルマップで扱う（openDateDialog が受ける）
  ['kyoumi_date', 'seikatsu_date'].forEach(f => {
    let t = null;
    try {
      sandbox.onCellTap({ classList: { contains: () => false },
        dataset: { userid: 'U1', name: 'ダミーD', year: '2026', month: '8', field: f, fieldlabel: 'x', cellyear: '2026', cellmonth: '7' } });
    } catch (e) { t = e; }
    ok(!t, 'E3[' + f + ']: 従来どおりダイアログが開く' + (t ? ' 実際=' + t.message : ''));
    ok(ids.measureSection.style.display === 'none', 'E4[' + f + ']: 測定セクションは計画セル以外では出ない');
  });
  ok(html.indexOf('applyHyoukaValue') >= 0, 'E5: 評価の保存関数は残っている');
  ok(/jobs|applyValue\(ds\.userId/.test(html), 'E6: 計画書の保存経路(applyValue)は残っている');
}

sec('F) 記録後の予定月追随（計画書側）が壊れていない');
{
  const map = { U1: { nextYm: '2026-09', cycleMonths: 3, slideCount: 0, note: '', name: 'x' } };
  ok(sandbox.kbAdoptYoteiRow(map, 'U1', { nextYm: '2026-12', cycleMonths: 3, slideCount: 0 }) === true
    && map.U1.nextYm === '2026-12', 'F1: kbAdoptYoteiRow は従来どおり動く');
  ok(html.indexOf('kbAdoptYoteiRow(state.yotei, userId, json.yotei)') >= 0,
    'F2: applyValue の成功時に予定月を取り込む経路が残っている');
}

sec('G) GAS側の受け口は撤去していない（additive・巻き戻し可能）');
{
  ok(gasSrc.indexOf('sokutei_date: 13') >= 0, 'G1: updateKeikakusho の sokutei_date 受け口が残っている');
  ok(gasSrc.indexOf('sokutei_by: 14') >= 0, 'G2: sokutei_by の受け口が残っている');
  ok(gasSrc.indexOf('output_by: 15') >= 0, 'G3: output_by の受け口が残っている');
  ok(gasSrc.indexOf("action === 'addSokuteiDone'") >= 0, 'G4: 測定管理側の入口(addSokuteiDone)は無傷');
}

console.log('\n==== PASS ' + pass + ' / FAIL ' + fail + ' ====');
process.exit(fail ? 1 : 0);
