// 個訓アプリ 後片付け（①ラベルの混在 ②記録後に画面が追いつかない）
// 実行: node scripts/test-kobetsu-label-refresh.js
//
// 仕様（社長決定 2026-08-01）:
//   【問題1】同じ列に「計画(7月〜)」と「計画(8月〜)」が並んで意味が分からない。
//     → 配置ルールは1バイトも変えず、ラベルの文言だけを変える（案A）。
//        これから作る枠 … 「▶ 8月分を準備」（青 kb-cyc-plan のまま）
//        済んだ期間     … 「7月分（記録済）」（灰 kb-cyc-past ＝後ろへ引っ込める）
//        緑✓／赤未 のバッジの意味は一切変えない。
//   【問題2】計画書を記録しても画面が新しい予定月を取り込まず、再読込するまで古いまま。
//     → applyValue の成功時、レスポンスの yotei（段階3で GAS が返している）で state.yotei を差し替える。
//        yotei が無いレスポンス（旧GAS・エラー時）は state.yotei を変えない＝従来どおり。
//        ★記録の書込先は変えない。書込先は常に「期間の開始月の行」。
//
// 実HTMLから本物の関数を抽出して回す（テスト用に写した別実装ではない）。
// 利用者の実名は使わない（記号のみ）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, '個別機能訓練計画書チェック.html'), 'utf8');
const shared = fs.readFileSync(path.join(REPO, 'shared.js'), 'utf8');
const core = require(path.join(REPO, 'gas', 'yawaragi-board', 'yotei-core.js'));

// async function も取りこぼさない（applyValue は async）。
function extractFrom(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('関数が無い（未実装＝RED）: ' + name);
  const s = m.index;
  let i = src.indexOf('{', s), d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(s, j + 1); } }
  throw new Error('閉じ括弧が見つからない: ' + name);
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.error('  [FAIL] ' + m); } }
function sec(t) { console.log('\n[' + t + ']'); }

// ---- 実HTML/shared.js から本物を抽出 ----
const HTML_FNS = ['renderTable', 'kobetsuCycleAt', 'getGroup', 'matchesFilter', 'kbBadgeObj', 'kbPlanBadges',
  'kbEvalBadges', 'kbBadgeHtml', 'kbSubmitDue', 'escapeHtml', 'escapeAttr', 'formatMD', 'formatTodayISO',
  'kbNormKey', 'kbPickSokuteiDate', 'kbSokuteiForCell',
  'kbYm', 'kbBuildYoteiMap', 'kbYoteiYm', 'kbIsPlanCell', 'kbIsHyoukaCell', 'kbYoteiLabel', 'updateStats',
  // ★今回足すもの
  'kbAdoptYoteiRow', 'applyValue'];
const SHARED_FNS = ['isPlanMonth', 'isHyoukaMonth', 'isBeforePlanStart'];
const fnSrc = HTML_FNS.map(n => extractFrom(html, n)).join('\n') + '\n'
  + SHARED_FNS.map(n => extractFrom(shared, n)).join('\n');

// ---- DOMスタブ ----
function el() {
  return {
    style: {}, innerHTML: '', textContent: '', className: '',
    classList: { add() { }, remove() { }, contains() { return false; } }
  };
}
const thead = el(), tbody = el();
const ids = {};
['emptyMessage', 'filterBar', 'filterCount', 'totalUsers', 'thisMonthCount', 'progressCount', 'progressTotal',
  'hyoukaMonthCount', 'hyoukaDoneCount', 'hyoukaTotalCount', 'blockedCount', 'yoteiBanner'].forEach(id => ids[id] = el());

// ---- applyValue 用スタブ（通信・トースト・保留再送は本題ではないので記録だけする） ----
const calls = { fetchUrls: [], toasts: [], renders: 0, saves: 0, pendingMarked: [], pendingUnmarked: [] };
let fetchResponse = { ok: true };
let fetchThrows = false;

const sandbox = {
  document: {
    querySelector: sel => sel.indexOf('thead') >= 0 ? thead : (sel.indexOf('tbody') >= 0 ? tbody : el()),
    getElementById: id => ids[id] || el()
  },
  console: console, Math: Math, String: String, Date: Date, JSON: JSON, Object: Object, Array: Array,
  Number: Number, parseInt: parseInt, RegExp: RegExp, isNaN: isNaN, Promise: Promise, Error: Error,
  encodeURIComponent: encodeURIComponent,
  filterDay: '', filterAmpm: '', filterGroup: '',
  usageGate: {},
  sortUsers: function () { },
  isPending: function () { return false; },
  ensureUsageGate: function () { },
  busy: {},
  // yotei-core.js の純関数（単一の正・ここに複製しない）
  ymAdd: core.ymAdd, ymCandidates: core.ymCandidates, isDue: core.isDue,
  state: null,
  // --- applyValue の周辺 ---
  API_BASE: 'https://example.invalid/exec',
  getOperator: function () { return 'テスト' },
  saveCache: function () { calls.saves++ },
  unmarkPending: function (u, y, m, f) { calls.pendingUnmarked.push([u, y, m, f].join('_')) },
  markPending: function (u, y, m, f) { calls.pendingMarked.push([u, y, m, f].join('_')) },
  showToast: function (msg, kind) { calls.toasts.push({ msg: msg, kind: kind || '' }) },
  hideOffline: function () { }, showOffline: function () { },
  updatePendingBanner: function () { },
  fetch: function (url) {
    calls.fetchUrls.push(url);
    if (fetchThrows) return Promise.reject(new Error('network down'));
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(fetchResponse) } });
  }
};
sandbox.MONTHS = [];
for (let i = 0; i < 12; i++) { const mm = ((4 - 1 + i) % 12) + 1; sandbox.MONTHS.push({ m: mm, label: mm + '月', nextYear: (4 + i) > 12 }); }
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fnSrc, sandbox);
// renderTable の呼ばれ方を数える（本物は残したままラップ）
const realRenderTable = sandbox.renderTable;
sandbox.renderTable = function () { calls.renders++; return realRenderTable.apply(null, arguments); };

// ---- fixture（実行月基準・実行日非依存） ----
const now = new Date();
const nowY = now.getFullYear(), nowM = now.getMonth() + 1;
const fy = nowM >= 4 ? nowY : nowY - 1;
function ymOf(delta) {
  const t = nowY * 12 + (nowM - 1) + delta;
  const y = Math.floor(t / 12), m = (t % 12) + 1;
  return { y: y, m: m, s: y + '-' + String(m).padStart(2, '0') };
}
const cur = ymOf(0), p1 = ymOf(-1), p2 = ymOf(-2), p3 = ymOf(-3), n1 = ymOf(1), n2 = ymOf(2), n3 = ymOf(3);
function key(uid, o) { return uid + '_' + o.y + '_' + o.m; }
const EMPTY = { kyoumi_date: '', seikatsu_date: '', keikaku_date: '', blocked_reason: '', sokutei_date: '', sokutei_by: '', output_by: '', tasseido_date: '' };
const rec = o => Object.assign({}, EMPTY, o || {});

function rowCells(tbodyHtml, nameMark) {
  const rows = tbodyHtml.split('<tr').filter(r => r.indexOf(nameMark) >= 0);
  if (!rows.length) return null;
  return rows[0].split('<td').slice(3);   // group / name を除く。index 0 = 4月 ... 11 = 翌3月
}
function cellOfYm(tds, o) {
  const idx = sandbox.MONTHS.findIndex(mo => mo.m === o.m && ((mo.nextYear ? fy + 1 : fy) === o.y));
  return idx < 0 ? null : tds[idx];
}
function hasPlanInput(td) { return !!td && td.indexOf('data-field="keikaku_date"') >= 0; }
function hasEvalInput(td) { return !!td && td.indexOf('data-field="hyouka"') >= 0; }
function planTarget(td) {
  if (!td) return '';
  const m = td.match(/data-year="(\d+)" data-month="(\d+)" data-field="keikaku_date"/);
  return m ? (m[1] + '-' + String(m[2]).padStart(2, '0')) : '';
}
// 計画パートの見出しラベル（kb-cyc-plan / kb-cyc-past のどちらでも取る）
function planLabel(td) {
  if (!td) return '';
  const m = td.match(/<span class="kb-cyc (kb-cyc-plan|kb-cyc-past)">([^<]*)<\/span>/);
  return m ? m[2] : '';
}
function planLabelClass(td) {
  if (!td) return '';
  const m = td.match(/<span class="kb-cyc (kb-cyc-plan|kb-cyc-past)">/);
  return m ? m[1] : '';
}

const baseUser = (uid, mark, planStart) => ({
  userId: uid, name: mark, furigana: 'ア', category: '要介護1',
  planStart: planStart, planMonths: 3, days: '月', ampm: '午前'
});

function setState(users, records, yoteiRecords, shienByMonth) {
  const built = sandbox.kbBuildYoteiMap(yoteiRecords);
  sandbox.state = {
    fiscalYear: fy, users: users, records: records || {}, isLoading: false,
    needsActionOnly: false, shienByMonth: shienByMonth || {},
    yotei: built.map, yoteiOk: built.ok
  };
  return sandbox.state;
}
function render(users, records, yoteiRecords, shienByMonth) {
  setState(users, records, yoteiRecords, shienByMonth);
  sandbox.renderTable();
  return tbody.innerHTML;
}
const yo = (uid, mark, ym) => ({ userId: uid, name: mark, domain: 'kobetsu', nextYm: ym, cycleMonths: 3, slideCount: 0, note: '' });

// =====================================================================
sec('A) 問題1: 同じ月の列で「これから作る」と「済んだ期間」が見分けられる');
{
  // 当月の列に2人を並べる。
  //   ダミーA: 予定月=翌月 → 当月は作業月（分岐A-2・ラベルは翌月を指す）
  //   ダミーB: 予定月=3ヶ月後 で 当月に記録あり → 当月は温存セル（分岐C・ラベルは自セル月）
  const users = [baseUser('U1', 'ダミーA', p3.s), baseUser('U2', 'ダミーB', p3.s)];
  const recs = {}; recs[key('U2', cur)] = rec({ keikaku_date: cur.s + '-10' });
  const htmlOut = render(users, recs, [yo('U1', 'ダミーA', n1.s), yo('U2', 'ダミーB', n3.s)]);
  const a = cellOfYm(rowCells(htmlOut, 'ダミーA'), cur);
  const b = cellOfYm(rowCells(htmlOut, 'ダミーB'), cur);

  ok(hasPlanInput(a) && hasPlanInput(b), 'A0: 同じ当月の列に2人ぶんの計画パートが並ぶ（再現条件）');
  // ★月の数字が違うだけでは「見分けられる」と言わない。現行は両方とも「計画(◯月〜)」で
  //   数字以外は同一＝種類の違いが表現されていない。数字を伏せて比べる。
  const form = s => s.replace(/\d+/g, '#');
  ok(form(planLabel(a)) !== form(planLabel(b)), 'A1: 分岐A-2と分岐Cのラベルが「形」として違う（混在の解消）'
    + ' [A-2="' + planLabel(a) + '" / C="' + planLabel(b) + '"]');
  ok(planLabel(a) === '▶ ' + n1.m + '月分を準備', 'A2: 作業月セルは「▶ ◯月分を準備」（案A・これから作る） 実際="' + planLabel(a) + '"');
  ok(planLabel(b) === cur.m + '月分（記録済）', 'A3: 温存セルは「◯月分（記録済）」（案A・済んだ期間） 実際="' + planLabel(b) + '"');
  ok(planLabelClass(a) === 'kb-cyc-plan', 'A4: これから作る側は青のまま（kb-cyc-plan）');
  ok(planLabelClass(b) === 'kb-cyc-past', 'A5: 済んだ期間は灰（kb-cyc-past）＝後ろへ引っ込む');
  ok(a.indexOf('計画(' + n1.m + '月〜)') < 0 && b.indexOf('計画(' + cur.m + '月〜)') < 0,
    'A6: 旧ラベル「計画(◯月〜)」が残っていない');
}
{
  // 分岐B: 前月が表の外（年度の先頭が予定月）→ 予定月セル自身に出る。これも「これから作る」。
  const users = [baseUser('U1', 'ダミーD', fy + '-04')];
  const tds = rowCells(render(users, {}, [yo('U1', 'ダミーD', fy + '-04')]), 'ダミーD');
  const c4 = cellOfYm(tds, { y: fy, m: 4 });
  ok(hasPlanInput(c4), 'A7: 前月が表の外なら予定月セル自身に入力欄（配置は不変）');
  ok(planLabel(c4) === '▶ 4月分を準備' && planLabelClass(c4) === 'kb-cyc-plan',
    'A8: 分岐Bも「これから作る」側の文言・色 実際="' + planLabel(c4) + '"');
}
{
  // バッジの意味は変えない（緑✓／赤「未」がそのまま出る）。
  const users = [baseUser('U1', 'ダミーF', p3.s)];
  const tds = rowCells(render(users, {}, [yo('U1', 'ダミーF', n1.s)]), 'ダミーF');
  const c = cellOfYm(tds, cur);
  ok(c.indexOf('kb-badge') >= 0, 'A9: 計画パートのバッジ列は今までどおり出る（意味を変えていない）');
}

sec('B) 温存セルはタップして編集できる（表示位置が過去でも入力は生きている）');
{
  const users = [baseUser('U1', 'ダミーB', p3.s)];
  const recs = {}; recs[key('U1', p2)] = rec({ keikaku_date: p2.s + '-10' });
  const tds = rowCells(render(users, recs, [yo('U1', 'ダミーB', n3.s)]), 'ダミーB');
  const c = cellOfYm(tds, p2);
  ok(c.indexOf('onclick="onCellTap(this)"') >= 0, 'B1: 温存セルにも onCellTap 導線が残っている');
  ok(planTarget(c) === p2.s, 'B2: 温存セルの書込先は自セル＝旧データの位置のまま動かない');
}

sec('C) 過去の実績セルが消えない（3ケース・ラベル変更で潰していないこと）');
{
  const users = [baseUser('U1', 'ダミーE', p3.s)];
  const yr = [yo('U1', 'ダミーE', n3.s)];
  // ①個訓シートに計画書作成日がある過去月
  const r1 = {}; r1[key('U1', p3)] = rec({ keikaku_date: p3.s + '-10' });
  const t1 = cellOfYm(rowCells(render(users, r1, yr), 'ダミーE'), p3);
  ok(hasPlanInput(t1), 'C1: ①個訓シートに実績がある過去月のセルは残る');
  ok(t1.indexOf('>-<') < 0, 'C2: ①「-」に潰れていない');
  ok(planLabel(t1) === p3.m + '月分（記録済）', 'C3: ①ラベルは「済んだ期間」側 実際="' + planLabel(t1) + '"');
  // ②個訓シートは空で、測定記録シートにだけ測定がある
  const shien = {}; shien['ダミーE'] = {}; shien['ダミーE'][p2.s] = p2.s + '-05';
  const t2 = cellOfYm(rowCells(render(users, {}, yr, shien), 'ダミーE'), p2);
  ok(hasPlanInput(t2), 'C4: ②測定記録シートにしか測定が無い過去月のセルも残る');
  ok(planLabel(t2) === p2.m + '月分（記録済）', 'C5: ②ラベルは「済んだ期間」側 実際="' + planLabel(t2) + '"');
  // ③keikaku_date は空だが他の実績（興味関心）がある
  const r3 = {}; r3[key('U1', p2)] = rec({ kyoumi_date: p2.s + '-03' });
  const t3 = cellOfYm(rowCells(render(users, r3, yr), 'ダミーE'), p2);
  ok(hasPlanInput(t3), 'C6: ③keikaku_date が空でも他の実績があれば残る');
  ok(planLabel(t3) === p2.m + '月分（記録済）', 'C7: ③ラベルは「済んだ期間」側 実際="' + planLabel(t3) + '"');
  // 評価の実績も残る（無改修の確認）
  const r4 = {}; r4[key('U1', p1)] = rec({ tasseido_date: p1.s + '-20' });
  const t4 = cellOfYm(rowCells(render(users, r4, yr), 'ダミーE'), p1);
  ok(hasEvalInput(t4), 'C8: 過去の達成度評価の実績も消えない');
}

sec('D) kbAdoptYoteiRow（純関数）: 取り込む／取り込まない');
{
  const map = { U1: { nextYm: n1.s, cycleMonths: 3, slideCount: 2, note: 'x', name: 'ダミー' } };
  ok(sandbox.kbAdoptYoteiRow(map, 'U1', { nextYm: n3.s, cycleMonths: 3, slideCount: 0, note: '', name: 'ダミー' }) === true,
    'D1: 正しい行は取り込んで true');
  ok(map.U1.nextYm === n3.s, 'D2: nextYm が差し替わる');
  ok(map.U1.slideCount === 0, 'D3: slideCount も行の値になる（resetSlide が画面に反映される）');
  ok(sandbox.kbAdoptYoteiRow(map, 'U1', null) === false && map.U1.nextYm === n3.s, 'D4: null は無視（落ちない・現状維持）');
  ok(sandbox.kbAdoptYoteiRow(map, 'U1', {}) === false && map.U1.nextYm === n3.s, 'D5: nextYm 無しは無視');
  ok(sandbox.kbAdoptYoteiRow(map, 'U1', { nextYm: '2026-7' }) === false && map.U1.nextYm === n3.s, 'D6: 形式違いは無視');
  ok(sandbox.kbAdoptYoteiRow(null, 'U1', { nextYm: n1.s }) === false, 'D7: map が無くても落ちない');
}

// ============ 非同期（applyValue） ============
const FIELD = 'keikaku_date';
function freshApplyState() {
  // 予定月＝翌月。作業月＝当月。記録は「期間の開始月の行」＝翌月の行に書く。
  const users = [baseUser('U1', 'ダミーG', p3.s)];
  return setState(users, {}, [yo('U1', 'ダミーG', n1.s)]);
}
function resetCalls() {
  calls.fetchUrls.length = 0; calls.toasts.length = 0; calls.pendingMarked.length = 0;
  calls.pendingUnmarked.length = 0; calls.renders = 0; calls.saves = 0;
}

async function main() {
  sec('E) 問題2: 記録の書込先は「期間の開始月の行」のまま変わらない');
  {
    const st = freshApplyState();
    const tds = rowCells(render(st.users, {}, [yo('U1', 'ダミーG', n1.s)]), 'ダミーG');
    ok(planTarget(cellOfYm(tds, cur)) === n1.s, 'E1: 作業月セルの書込先(data-year/month)は予定月の行＝期間の開始月');

    freshApplyState();
    resetCalls();
    fetchThrows = false;
    fetchResponse = { ok: true, updatedAt: 'x', yotei: { userId: 'U1', name: 'ダミーG', domain: 'kobetsu', nextYm: ymOf(4).s, cycleMonths: 3, slideCount: 0, note: '' } };
    // セルが指した通り（予定月の行）に記録する
    await sandbox.applyValue('U1', 'ダミーG', n1.y, n1.m, FIELD, '計画', n1.s + '-05');
    const url = calls.fetchUrls[0] || '';
    ok(url.indexOf('&year=' + n1.y + '&month=' + n1.m + '&') >= 0,
      'E2: 送信先は year/month＝期間の開始月のまま（予定月が進んでも動かない） url=' + url);
    ok(!!sandbox.state.records[key('U1', n1)] && sandbox.state.records[key('U1', n1)].keikaku_date === n1.s + '-05',
      'E3: ローカルの記録も「期間の開始月の行」に入る');
    ok(!sandbox.state.records[key('U1', ymOf(4))], 'E4: 新しい予定月の行には記録を作らない');
  }

  sec('F) 問題2: 成功レスポンスの yotei で state.yotei が更新され、画面が追いつく');
  {
    freshApplyState();
    resetCalls();
    fetchThrows = false;
    const advanced = ymOf(4);   // 記録した月(n1) + 周期3ヶ月
    fetchResponse = { ok: true, updatedAt: 'x', yotei: { userId: 'U1', name: 'ダミーG', domain: 'kobetsu', nextYm: advanced.s, cycleMonths: 3, slideCount: 0, note: '' } };
    ok(sandbox.kbYoteiYm(sandbox.state.yotei, 'U1') === n1.s, 'F0: 記録前の予定月は翌月（再現条件）');
    await sandbox.applyValue('U1', 'ダミーG', n1.y, n1.m, FIELD, '計画', n1.s + '-05');
    ok(sandbox.kbYoteiYm(sandbox.state.yotei, 'U1') === advanced.s,
      'F1: state.yotei がレスポンスの予定月に差し替わる 実際=' + sandbox.kbYoteiYm(sandbox.state.yotei, 'U1'));
    ok(calls.renders >= 1, 'F2: 差し替え後に再描画されている');

    const tds = rowCells(tbody.innerHTML, 'ダミーG');
    ok((cellOfYm(tds, cur) || '').indexOf('予定 ') < 0, 'F3(準備): セル抽出が名前セルを含んでいない');
    const nameCell = (tbody.innerHTML.split('<tr').filter(r => r.indexOf('ダミーG') >= 0)[0] || '');
    ok(nameCell.indexOf('予定 ' + advanced.m + '月 ▾') >= 0,
      'F4: 「予定 ◯月 ▾」の表示が新しい予定月になる（再読込不要）');
    const work = cellOfYm(tds, ymOf(3));   // 新しい予定月の前月＝新しい作業月
    ok(hasPlanInput(work), 'F5: 入力欄の出る月が新しい予定月の前月へ移動する');
    ok(planTarget(work) === advanced.s, 'F6: 移動後の書込先も新しい期間の開始月');
    ok(planLabel(work) === '▶ ' + advanced.m + '月分を準備', 'F7: 移動先は「これから作る」ラベル 実際="' + planLabel(work) + '"');
    const done = cellOfYm(tds, n1);
    ok(hasPlanInput(done) && planLabel(done) === n1.m + '月分（記録済）',
      'F8: いま記録した月は「済んだ期間」として残る（消えない） 実際="' + planLabel(done) + '"');
  }

  sec('G) 問題2: yotei が無いレスポンス／通信失敗でも落ちない（従来どおり）');
  {
    freshApplyState();
    resetCalls();
    fetchThrows = false;
    fetchResponse = { ok: true, updatedAt: 'x' };   // 旧GAS＝yotei を返さない
    let threw = null;
    try { await sandbox.applyValue('U1', 'ダミーG', n1.y, n1.m, FIELD, '計画', n1.s + '-05'); }
    catch (e) { threw = e; }
    ok(!threw, 'G1: yotei 抜きのレスポンスでも例外にならない' + (threw ? ' 実際=' + threw.message : ''));
    ok(sandbox.kbYoteiYm(sandbox.state.yotei, 'U1') === n1.s, 'G2: state.yotei は変更されない（従来の挙動を維持）');
    ok(calls.pendingUnmarked.length === 1, 'G3: 保存成功の後処理（再送待ちの解除）は従来どおり走る');

    freshApplyState();
    resetCalls();
    fetchResponse = { ok: true, yotei: { nextYm: '' } };   // 壊れた yotei
    threw = null;
    try { await sandbox.applyValue('U1', 'ダミーG', n1.y, n1.m, FIELD, '計画', n1.s + '-05'); }
    catch (e) { threw = e; }
    ok(!threw && sandbox.kbYoteiYm(sandbox.state.yotei, 'U1') === n1.s, 'G4: 壊れた yotei は無視して従来どおり');

    freshApplyState();
    resetCalls();
    fetchThrows = true;   // 通信失敗（オフライン）
    threw = null;
    try { await sandbox.applyValue('U1', 'ダミーG', n1.y, n1.m, FIELD, '計画', n1.s + '-05'); }
    catch (e) { threw = e; }
    fetchThrows = false;
    ok(!threw, 'G5: 通信失敗でも例外を投げない（従来どおり再送待ちへ）');
    ok(calls.pendingMarked.length === 1, 'G6: 再送待ちに積まれる');
    ok(sandbox.kbYoteiYm(sandbox.state.yotei, 'U1') === n1.s, 'G7: 通信失敗時に予定月を勝手に進めない');

    freshApplyState();
    resetCalls();
    fetchResponse = { ok: false, error: 'boom' };
    threw = null;
    try { await sandbox.applyValue('U1', 'ダミーG', n1.y, n1.m, FIELD, '計画', n1.s + '-05'); }
    catch (e) { threw = e; }
    ok(!threw && sandbox.kbYoteiYm(sandbox.state.yotei, 'U1') === n1.s, 'G8: ok:false のときも予定月は進めない');
  }

  console.log('\n==== PASS ' + pass + ' / FAIL ' + fail + ' ====');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('[FATAL] ' + (e && e.stack || e)); process.exit(1); });
