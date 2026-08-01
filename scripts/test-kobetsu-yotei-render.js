// 個訓アプリ 予定月ベース描画テスト（段階4）
// 実行: node scripts/test-kobetsu-yotei-render.js
//
// 仕様（クロ確定 2026-07-31）:
//   正本の3分割 … 過去＝個訓シートの記録／次回予定＝予定月シート(domain='kobetsu')／planStart は種のみ
//   ・計画月     = 予定月(nextYm) そのもの
//   ・評価月     = 予定月の前月
//   ・作業月     = 予定月の前月（前月準備の原則）。計画パートはここに出し、書込先は予定月の行のまま
//   ・予定月が取れない（API失敗）→ planStart ベースへフォールバックし、その旨を画面に出す
//   ・予定月シートに行が無い利用者 → その人だけ planStart ベース
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

function extractFrom(src, name) {
  const sig = 'function ' + name + '(';
  const s = src.indexOf(sig);
  if (s < 0) throw new Error('関数が無い（未実装＝RED）: ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(s, j + 1); } }
  throw new Error('閉じ括弧が見つからない: ' + name);
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.error('  [FAIL] ' + m); } }
function sec(t) { console.log('\n[' + t + ']'); }

// ---- 実HTML/shared.js から本物を抽出 ----
// ★2026-08-01 段階6-1: 配置ルールが KB_WORK_MONTH_FROM / kbPlanMovesToPrevMonth / kbHasPlanRowData を使うため注入する。
//   （vm.runInContext では const がサンドボックスに載らないので定数だけ var で束ねる）
const KB_WM_SRC = 'var KB_WORK_MONTH_FROM = '
  + /const\s+KB_WORK_MONTH_FROM\s*=\s*([^;]+);/.exec(html)[1] + ';\n';
const HTML_FNS = ['kbHasPlanRowData', 'kbPlanMovesToPrevMonth', 'renderTable', 'kobetsuCycleAt', 'getGroup', 'matchesFilter', 'kbBadgeObj', 'kbPlanBadges',
  'kbEvalBadges', 'kbBadgeHtml', 'kbSubmitDue', 'escapeHtml', 'escapeAttr', 'formatMD', 'formatTodayISO',
  'kbNormKey', 'kbPickSokuteiDate', 'kbSokuteiForCell',
  // 段階4で足す予定月まわり
  'kbYm', 'kbBuildYoteiMap', 'kbYoteiYm', 'kbIsPlanCell', 'kbIsHyoukaCell', 'kbYoteiLabel', 'updateStats'];
const SHARED_FNS = ['isPlanMonth', 'isHyoukaMonth', 'isBeforePlanStart'];
const fnSrc = KB_WM_SRC + HTML_FNS.map(n => extractFrom(html, n)).join('\n') + '\n'
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
const sandbox = {
  document: {
    querySelector: sel => sel.indexOf('thead') >= 0 ? thead : (sel.indexOf('tbody') >= 0 ? tbody : el()),
    getElementById: id => ids[id] || el()
  },
  console: console, Math: Math, String: String, Date: Date, JSON: JSON, Object: Object, Array: Array,
  Number: Number, parseInt: parseInt, RegExp: RegExp, isNaN: isNaN,
  filterDay: '', filterAmpm: '', filterGroup: '',
  usageGate: {},
  sortUsers: function () { },
  isPending: function () { return false; },
  ensureUsageGate: function () { },
  busy: {},
  // yotei-core.js の純関数（単一の正・ここに複製しない）
  ymAdd: core.ymAdd, ymCandidates: core.ymCandidates, isDue: core.isDue,
  state: null
};
sandbox.MONTHS = [];
for (let i = 0; i < 12; i++) { const mm = ((4 - 1 + i) % 12) + 1; sandbox.MONTHS.push({ m: mm, label: mm + '月', nextYear: (4 + i) > 12 }); }
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fnSrc, sandbox);

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

// ★2026-08-01 段階6-1: 記録が描かれる列は「期間開始月の1つ前」（KB_WORK_MONTH_FROM 以降）。
//   このテスト群は実行月を起点に組むので、期待する列も同じ規則で求める（実行日に依存させない）。
//   規則そのものは scripts/test-kobetsu-workmonth-column.js が絶対月で固定している。
function prevOf(o) { const t = o.y * 12 + (o.m - 1) - 1; const y = Math.floor(t / 12), m = (t % 12) + 1; return { y: y, m: m, s: y + '-' + String(m).padStart(2, '0') }; }
function planCellOf(o) { return sandbox.kbPlanMovesToPrevMonth(o.s) ? prevOf(o) : o; }

const EMPTY = { kyoumi_date: '', seikatsu_date: '', keikaku_date: '', blocked_reason: '', sokutei_date: '', sokutei_by: '', output_by: '', tasseido_date: '' };
const rec = o => Object.assign({}, EMPTY, o || {});

// セルHTMLを月ごとに切り出す（tbody の1行 = 先頭2セル + 12ヶ月）
function rowCells(tbodyHtml, nameMark) {
  const rows = tbodyHtml.split('<tr').filter(r => r.indexOf(nameMark) >= 0);
  if (!rows.length) return null;
  const tds = rows[0].split('<td').slice(3);   // group / name を除く
  return tds;   // index 0 = 4月 ... 11 = 翌3月
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

const baseUser = (uid, mark, planStart) => ({
  userId: uid, name: mark, furigana: 'ア', category: '要介護1',
  planStart: planStart, planMonths: 3, days: '月', ampm: '午前'
});

function render(users, records, yoteiRecords, yoteiOk) {
  const built = sandbox.kbBuildYoteiMap(yoteiRecords);
  sandbox.state = {
    fiscalYear: fy, users: users, records: records || {}, isLoading: false,
    needsActionOnly: false, shienByMonth: {},
    yotei: built.map, yoteiOk: (yoteiOk === undefined ? built.ok : yoteiOk)
  };
  sandbox.renderTable();
  return tbody.innerHTML;
}

// =====================================================================
sec('A) 計画パートは「予定月の前月（作業月）」に出て、書込先は予定月の行のまま');
{
  // 予定月 = 3ヶ月後。作業月 = 2ヶ月後。
  const users = [baseUser('U1', 'ダミーA', p3.s)];
  const yo = [{ userId: 'U1', name: 'ダミーA', domain: 'kobetsu', nextYm: n3.s, cycleMonths: 3, slideCount: 0, note: '' }];
  const tds = rowCells(render(users, {}, yo), 'ダミーA');
  ok(!!tds, 'A0: 行が描画される');
  ok(hasPlanInput(cellOfYm(tds, n2)), 'A1: 予定月の前月（作業月）のセルに計画の入力欄が出る');
  ok(planTarget(cellOfYm(tds, n2)) === n3.s, 'A2: 書込先(data-year/month)は予定月の行＝期間の開始月のまま');
  ok(!hasPlanInput(cellOfYm(tds, n3)), 'A3: 予定月のセル自体には二重に出さない（前月へ移譲済み）');
  ok(!hasPlanInput(cellOfYm(tds, n1)), 'A4: 予定月と関係ない月には入力欄が出ない');
  ok(!hasPlanInput(cellOfYm(tds, cur)), 'A5: 当月にも出ない（予定月は3ヶ月後）');
  ok(hasEvalInput(cellOfYm(tds, n2)), 'A6: 評価月＝予定月の前月（作業月と同じセルに同居）');
  ok(!hasEvalInput(cellOfYm(tds, n1)) && !hasEvalInput(cellOfYm(tds, n3)), 'A7: それ以外の月は評価月にならない');
}

sec('B) 予定月を動かすと、入力欄の出る月も一緒に動く');
{
  const users = [baseUser('U1', 'ダミーA', p3.s)];
  const mk = ym => [{ userId: 'U1', name: 'ダミーA', domain: 'kobetsu', nextYm: ym, cycleMonths: 3, slideCount: 0, note: '' }];
  const a = rowCells(render(users, {}, mk(n3.s)), 'ダミーA');
  const b = rowCells(render(users, {}, mk(n2.s)), 'ダミーA');
  ok(hasPlanInput(cellOfYm(a, n2)) && !hasPlanInput(cellOfYm(a, n1)), 'B1: 予定月=+3 のとき入力欄は +2');
  ok(hasPlanInput(cellOfYm(b, n1)) && !hasPlanInput(cellOfYm(b, n2)), 'B2: 予定月を +2 へ動かすと入力欄は +1 へ移動');
  ok(planTarget(cellOfYm(b, n1)) === n2.s, 'B3: 移動後も書込先は予定月の行');
}

sec('C) 境界: 予定月＝当月／年跨ぎ／年度の先頭');
{
  // 予定月＝当月（現在3名該当）。作業月＝前月。
  const users = [baseUser('U1', 'ダミーB', p3.s)];
  const yo = [{ userId: 'U1', name: 'ダミーB', domain: 'kobetsu', nextYm: cur.s, cycleMonths: 3, slideCount: 0, note: '' }];
  const tds = rowCells(render(users, {}, yo), 'ダミーB');
  ok(!!tds, 'C0: 予定月＝当月でも落ちずに描画される');
  const inPrev = hasPlanInput(cellOfYm(tds, p1));
  const inCur = hasPlanInput(cellOfYm(tds, cur));
  ok(inPrev || inCur, 'C1: 予定月＝当月のとき、前月（作業月）か当月に入力欄が出る');
  if (inPrev) ok(planTarget(cellOfYm(tds, p1)) === cur.s, 'C2: 書込先は当月＝予定月の行');
  else ok(planTarget(cellOfYm(tds, cur)) === cur.s, 'C2: 書込先は当月＝予定月の行');
}
{
  // 年跨ぎ: 予定月＝翌年1月 → 作業月・評価月＝12月
  const users = [baseUser('U1', 'ダミーC', fy + '-04')];
  const yo = [{ userId: 'U1', name: 'ダミーC', domain: 'kobetsu', nextYm: (fy + 1) + '-01', cycleMonths: 3, slideCount: 0, note: '' }];
  const tds = rowCells(render(users, {}, yo), 'ダミーC');
  const dec = { y: fy, m: 12 }, jan = { y: fy + 1, m: 1 };
  ok(hasPlanInput(cellOfYm(tds, dec)), 'C3: 予定月=翌年1月 → 12月に入力欄（年跨ぎで壊れない）');
  ok(planTarget(cellOfYm(tds, dec)) === (fy + 1) + '-01', 'C4: 書込先は翌年1月の行');
  ok(hasEvalInput(cellOfYm(tds, dec)), 'C5: 評価月も12月（予定月の前月）');
  ok(!hasPlanInput(cellOfYm(tds, jan)), 'C6: 1月セルに二重表示しない');
}
{
  // 年度の先頭が予定月（前月が表の外）→ 予定月セル自身に出す（従来どおり）
  const users = [baseUser('U1', 'ダミーD', fy + '-04')];
  const yo = [{ userId: 'U1', name: 'ダミーD', domain: 'kobetsu', nextYm: fy + '-04', cycleMonths: 3, slideCount: 0, note: '' }];
  const tds = rowCells(render(users, {}, yo), 'ダミーD');
  ok(hasPlanInput(cellOfYm(tds, { y: fy, m: 4 })), 'C7: 前月が表の外なら予定月セル自身に入力欄が出る（入力できなくならない）');
}

sec('D) 過去の実績セルが消えない（今日の3ケース）');
{
  const users = [baseUser('U1', 'ダミーE', p3.s)];
  const yo = [{ userId: 'U1', name: 'ダミーE', domain: 'kobetsu', nextYm: n3.s, cycleMonths: 3, slideCount: 0, note: '' }];
  // ケース①: 個訓シートに計画書作成日がある過去月
  const r1 = {}; r1[key('U1', p3)] = rec({ keikaku_date: p3.s + '-10' });
  const t1 = rowCells(render(users, r1, yo), 'ダミーE');
  ok(hasPlanInput(cellOfYm(t1, p3)), 'D1: ①個訓シートに実績がある過去月のセルは残る');
  ok(cellOfYm(t1, p3).indexOf('>-<') < 0, 'D2: ①「-」に潰れていない');
  // ケース②: 個訓シートは空で、測定記録シートにだけ測定がある
  const t2html = (function () {
    const built = sandbox.kbBuildYoteiMap(yo);
    sandbox.state = {
      fiscalYear: fy, users: users, records: {}, isLoading: false, needsActionOnly: false,
      shienByMonth: { 'ダミーE': { [p2.s]: p2.s + '-05' } },
      yotei: built.map, yoteiOk: built.ok
    };
    sandbox.renderTable();
    return tbody.innerHTML;
  })();
  const t2 = rowCells(t2html, 'ダミーE');
  // ★2026-08-01 段階6-1（クロ決定・指示8）で検証の意味を変えた箇所:
  //   測定記録シート「だけ」では計画パートを立てない（個訓シートの行データのみで判定）。
  //   意図しない行（期間の開始月でない行）への書込を防ぐため。本番実測では該当0件。
  //   測定は、同じ列に描かれる計画パートのバッジとして現れる（下の D3b で固定）。
  ok(!hasPlanInput(cellOfYm(t2, p2)), 'D3: ②測定記録シートだけでは計画パートを立てない（新仕様）');
  const t2b = (function () {
    const built2 = sandbox.kbBuildYoteiMap(yo);
    const rr = {}; rr[key('U1', p2)] = rec({ keikaku_date: p2.s + '-10' });
    sandbox.state = { fiscalYear: fy, users: users, records: rr, isLoading: false, needsActionOnly: false,
      shienByMonth: { 'ダミーE': { [planCellOf(p2).s]: planCellOf(p2).s + '-05' } }, yotei: built2.map, yoteiOk: built2.ok };
    sandbox.renderTable(); return tbody.innerHTML;
  })();
  const c2b = cellOfYm(rowCells(t2b, 'ダミーE'), planCellOf(p2));
  ok(hasPlanInput(c2b) && c2b.indexOf('測定') >= 0, 'D3b: ②同じ列に計画パートがあれば測定記録シートの測定はそこに出る（記録は失われない）');
  // ケース③: keikaku_date は空だが他の実績（興味・生活・保留）がある
  const r3 = {}; r3[key('U1', p2)] = rec({ kyoumi_date: p2.s + '-03', blocked_reason: '' });
  const t3 = rowCells(render(users, r3, yo), 'ダミーE');
  ok(hasPlanInput(cellOfYm(t3, planCellOf(p2))), 'D4: ③keikaku_date が空でも他の実績があれば残る（作業月の列へ）');
  // 評価の実績も残る
  const r4 = {}; r4[key('U1', p1)] = rec({ tasseido_date: p1.s + '-20' });
  const t4 = rowCells(render(users, r4, yo), 'ダミーE');
  ok(hasEvalInput(cellOfYm(t4, p1)), 'D5: 過去の達成度評価の実績も消えない');
}

sec('D-2) 記録が無い過去の計画月スロットは出さない（意図した変更点）');
{
  // planStart ベースでは -6/-3/当月 が計画月になり、記録が無くても「未」の空スロットが並んでいた。
  // 予定月ベースでは「次の1つ」だけが計画月なので、記録の無い過去月は '-' になる。
  // ＝過去は「記録があるかどうか」だけで見える／見えないが決まる（幻の未を作らない）。
  const users = [baseUser('U1', 'ダミーL', ymOf(-6).s)];
  const yo = [{ userId: 'U1', name: 'ダミーL', domain: 'kobetsu', nextYm: n3.s, cycleMonths: 3, slideCount: 0, note: '' }];
  const tds = rowCells(render(users, {}, yo), 'ダミーL');
  ok(!hasPlanInput(cellOfYm(tds, ymOf(-6))), 'D6: 記録の無い過去の計画月には空スロットを出さない');
  ok(!hasPlanInput(cellOfYm(tds, p3)), 'D7: 同上（-3ヶ月）');
  // 同じ条件で planStart ベース（フォールバック）と対比する。
  // 実行月によって年度グリッドのどこに落ちるかが変わるので、月を名指しせず「本数」で比べる（実行日非依存）。
  const countPlan = tdsArr => tdsArr.filter(hasPlanInput).length;
  const tdsFb = rowCells(render(users, {}, null), 'ダミーL');
  ok(countPlan(tdsFb) > countPlan(tds),
    'D8: フォールバック（planStartベース）は従来どおり3ヶ月ごとに計画スロットを並べる（旧挙動は保たれている）'
    + ' 予定月ベース=' + countPlan(tds) + '本 / planStartベース=' + countPlan(tdsFb) + '本');
  ok(countPlan(tds) <= 1, 'D9: 予定月ベースの計画スロットは「次の1つ」だけ');
}

sec('E) フォールバック（予定月が取れない／行が無い）');
{
  const users = [baseUser('U1', 'ダミーF', p3.s)];   // planStart=-3ヶ月 → 計画月は当月
  // ① API失敗（records=null）
  const built = sandbox.kbBuildYoteiMap(null);
  ok(built.ok === false, 'E1: 取得失敗は ok=false で返る');
  ok(JSON.stringify(built.map) === '{}', 'E2: 失敗時のマップは空');
  const tds = rowCells(render(users, {}, null), 'ダミーF');
  ok(hasPlanInput(cellOfYm(tds, p1)) || hasPlanInput(cellOfYm(tds, cur)),
    'E3: 取得失敗でも planStart ベースで描画される（画面が空にならない）');
  ok(ids.yoteiBanner.style.display !== 'none' && String(ids.yoteiBanner.textContent).indexOf('予定月') >= 0,
    'E4: 「予定月を取得できませんでした」が画面に出る（黙って旧挙動に戻らない）');
  // ② 取得は成功したが、その利用者の行が無い
  const yo = [{ userId: 'OTHER', name: 'ダミーZ', domain: 'kobetsu', nextYm: n3.s, cycleMonths: 3, slideCount: 0, note: '' }];
  const tds2 = rowCells(render(users, {}, yo), 'ダミーF');
  ok(!!tds2, 'E5: 予定月シートに行が無い利用者でも落ちない');
  ok(hasPlanInput(cellOfYm(tds2, p1)) || hasPlanInput(cellOfYm(tds2, cur)),
    'E6: 行が無い利用者は planStart ベースで描画される');
  ok(ids.yoteiBanner.style.display === 'none', 'E7: 取得できていればバナーは出ない');
}
{
  // note='起点なし'（記録も planStart も無い1名）は当月で出す＝隠さない
  const users = [baseUser('U1', 'ダミーG', '')];
  const yo = [{ userId: 'U1', name: 'ダミーG', domain: 'kobetsu', nextYm: cur.s, cycleMonths: 3, slideCount: 0, note: '起点なし' }];
  const tds = rowCells(render(users, {}, yo), 'ダミーG');
  ok(!!tds, 'E8: note=起点なし の利用者も行が出る（隠さない）');
  ok(hasPlanInput(cellOfYm(tds, p1)) || hasPlanInput(cellOfYm(tds, cur)), 'E9: 当月（または作業月）に入力欄が出る');
}

sec('F) 純関数の単体');
{
  ok(sandbox.kbYm(2026, 8) === '2026-08', 'F1: kbYm はゼロ埋め');
  ok(sandbox.kbYm(2027, 12) === '2027-12', 'F2: kbYm 2桁月');
  const map = sandbox.kbBuildYoteiMap([{ userId: 'X', nextYm: '2026-11', cycleMonths: 3 }]).map;
  ok(sandbox.kbYoteiYm(map, 'X') === '2026-11', 'F3: kbYoteiYm が予定月を返す');
  ok(sandbox.kbYoteiYm(map, 'NONE') === '', 'F4: 行が無ければ空文字');
  ok(sandbox.kbYoteiYm(undefined, 'X') === '', 'F5: マップ未設定でも落ちない');
  ok(sandbox.kbYoteiYm(sandbox.kbBuildYoteiMap([{ userId: 'Y', nextYm: 'こわれた' }]).map, 'Y') === '',
    'F6: 壊れた nextYm は無効として扱う（planStart へ落ちる）');
  const u = { planStart: '2026-02', planMonths: 3 };
  ok(sandbox.kbIsPlanCell('2026-11', u, 2026, 11) === true, 'F7: 予定月と一致する月が計画月');
  ok(sandbox.kbIsPlanCell('2026-11', u, 2026, 8) === false, 'F8: 予定月と違う月は計画月ではない（planStartでは8月も計画月だが従わない）');
  ok(sandbox.kbIsPlanCell('', u, 2026, 8) === true, 'F9: 予定月が無ければ planStart ベース（従来）へ落ちる');
  ok(sandbox.kbIsHyoukaCell('2026-11', u, 2026, 10) === true, 'F10: 評価月＝予定月の前月');
  ok(sandbox.kbIsHyoukaCell('2027-01', u, 2026, 12) === true, 'F11: 評価月は年跨ぎでも前月');
  ok(sandbox.kbIsHyoukaCell('2026-11', u, 2026, 11) === false, 'F12: 予定月そのものは評価月ではない');
  ok(sandbox.kbIsHyoukaCell('', u, 2026, 4) === true, 'F13: 予定月が無ければ isHyoukaMonth へ落ちる（2026-02+2）');
  ok(sandbox.kbYoteiLabel('', '2026-07') === '未設定', 'F14: 予定月なしのラベル');
  ok(sandbox.kbYoteiLabel('2026-11', '2026-07') === '11月', 'F15: 同じ年は月だけ');
  ok(sandbox.kbYoteiLabel('2027-01', '2026-07') === '2027/1月', 'F16: 年が違えば年を付ける');
}

sec('G) 集計（今月計画該当・評価今月該当）も予定月ベース');
{
  const users = [
    baseUser('U1', 'ダミーH', p3.s),   // 予定月=当月
    baseUser('U2', 'ダミーI', p3.s),   // 予定月=翌月 → 今月該当ではない／評価が当月
    baseUser('U3', 'ダミーJ', p3.s)    // 行なし → planStart ベース（-3ヶ月＝当月が計画月）
  ];
  const yo = [
    { userId: 'U1', name: 'ダミーH', domain: 'kobetsu', nextYm: cur.s, cycleMonths: 3, slideCount: 0, note: '' },
    { userId: 'U2', name: 'ダミーI', domain: 'kobetsu', nextYm: n1.s, cycleMonths: 3, slideCount: 0, note: '' }
  ];
  render(users, {}, yo);
  ok(ids.thisMonthCount.textContent === 2,
    'G1: 今月計画該当＝予定月が当月の人＋行が無く planStart で当月の人（2名） actual=' + ids.thisMonthCount.textContent);
  ok(ids.hyoukaMonthCount.textContent === 1,
    'G2: 評価今月該当＝予定月が翌月の人（1名） actual=' + ids.hyoukaMonthCount.textContent);
}

sec('H) 「予定 ▾」ボタン');
{
  const users = [baseUser('U1', 'ダミーK', p3.s)];
  const yo = [{ userId: 'U1', name: 'ダミーK', domain: 'kobetsu', nextYm: n3.s, cycleMonths: 3, slideCount: 0, note: '' }];
  const out = render(users, {}, yo);
  ok(out.indexOf('openYmPicker') >= 0, 'H1: 行に「予定 ▾」の導線がある');
  ok(out.indexOf(sandbox.kbYoteiLabel(n3.s, cur.s)) >= 0, 'H2: いまの予定月がボタンに出る');
  const out2 = render(users, {}, null);
  ok(out2.indexOf('kb-yotei-btn') >= 0 && out2.indexOf('disabled') >= 0,
    'H3: 予定月を取得できていないときは「予定 ▾」を押せなくする');
}

console.log('\n==== ' + (fail === 0 ? 'ALL GREEN' : 'FAILED') + '  pass=' + pass + ' fail=' + fail + ' ====');
if (fail !== 0) process.exit(1);
