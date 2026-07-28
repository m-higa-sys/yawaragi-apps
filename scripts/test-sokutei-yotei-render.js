// test-sokutei-yotei-render.js
// sokutei.html の「予定月スライド方式 段階1」配線層のヘッドレス検証。
// 実ブラウザを開かず・本番GASへ一切飛ばさず（fetchを完全スタブ・ダミー名のみ）検証する。
//   5-1/5-2 今日の優先を isDue(予定月, 当月) で絞り、ヘッダが対象人数を出す
//   5-3     「📅来月へ」1タップ→ slideYotei・行が消える・5秒Undoバー→ undoSlideYotei で戻る
//   5-4     「今日測定した」→ addSokuteiDone・実施ログ1行増・予定月=実施月+周期・行が消える
//   5-5     対象0人で「今月ぶん完了 ✅」
//   5-7     「全利用者」タブは対象外も全員見える（予定月併記）
// 純関数の網羅は scripts/test-yotei-ym.js 側。ここは配線の回帰ガード。
// 実行: node scripts/test-sokutei-yotei-render.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'sokutei.html'), 'utf8');
const open = html.indexOf('<script>');   // src付きは '<script src=' なので当たらない
const script0 = html.slice(open + '<script>'.length, html.indexOf('</script>', open))
  .replace(/\nload\(\);\s*$/, '\n');     // 末尾の自動起動を剥がしてテストから制御

function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '(');
  const b = src.indexOf('{', s); let d = 0, i = b;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}
const shared = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
const yoteiSrc = fs.readFileSync(path.join(ROOT, 'gas', 'yawaragi-board', 'yotei-core.js'), 'utf8');

let pass = 0, fail = 0;
function eq(a, e, l) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('  PASS ' + l); }
  else { fail++; console.log('  FAIL ' + l + '\n    actual  =' + A + '\n    expected=' + E); }
}
function ok(c, l) { eq(!!c, true, l); }
function sec(t) { console.log('\n[' + t + ']'); }

// ---- DOM スタブ（querySelector/onclick まで最小対応） ----
function makeEl(id) {
  const el = {
    id: id, _in: '', _tx: '', value: '', disabled: false, style: {}, options: [],
    set innerHTML(v) { this._in = v; }, get innerHTML() { return this._in; },
    set textContent(v) { this._tx = v; }, get textContent() { return this._tx; },
    classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } },
    addEventListener() { },
    querySelector(sel) {
      if (!this._q) this._q = {};
      if (!this._q[sel]) this._q[sel] = { textContent: '', onclick: null };
      return this._q[sel];
    }
  };
  return el;
}
const els = {};
function elFor(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; }

// ---- 固定データ（すべてダミー名・実利用者名は使わない） ----
const TODAY = '2026-07-28';
const YOTEI = [
  // 今月(2026-07)が予定月＝対象
  { userId: 'ダミー介護A', name: 'ダミー介護A', domain: 'sokutei', nextYm: '2026-07', cycleMonths: 3, slideCount: 0, note: '' },
  // 過ぎている（先月）＝対象に含める
  { userId: 'ダミー支援B', name: 'ダミー支援B', domain: 'sokutei', nextYm: '2026-06', cycleMonths: 4, slideCount: 1, note: '' },
  // 来月＝対象外
  { userId: 'ダミー介護C', name: 'ダミー介護C', domain: 'sokutei', nextYm: '2026-08', cycleMonths: 3, slideCount: 0, note: '' },
  // 今月が予定月だが本日来館なし＝「残り」
  { userId: 'ダミー支援D', name: 'ダミー支援D', domain: 'sokutei', nextYm: '2026-07', cycleMonths: 4, slideCount: 0, note: '' }
];
const KAIGO_USERS = [
  { userId: 'ダミー介護A', name: 'ダミー介護A', furigana: 'アアア', category: '要介護2', days: '火', planStart: '2026-04', planMonths: 3 },
  { userId: 'ダミー介護C', name: 'ダミー介護C', furigana: 'ウウウ', category: '要介護1', days: '火', planStart: '2026-05', planMonths: 3 }
];
const TSUSHO_USERS = [
  { userId: 'ダミー支援B', name: 'ダミー支援B', furigana: 'イイイ', category: '要支援2', cancelled: false },
  { userId: 'ダミー支援D', name: 'ダミー支援D', furigana: 'エエエ', category: '事業対象者', cancelled: false }
];

let YOTEI_STATE = null;   // スタブ側の「シート」
const captured = { writes: [], reads: [], shienRows: [] };

function yoteiFind(userId) {
  for (const y of YOTEI_STATE) if (y.userId === userId) return y;
  return null;
}
function ymAddStub(ym, n) {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const m0 = (m - 1) + n, ny = y + Math.floor(m0 / 12), nm = ((m0 % 12) + 12) % 12 + 1;
  return ny + '-' + (nm < 10 ? '0' : '') + nm;
}
function param(url, k) {
  const m = url.match(new RegExp('[?&]' + k + '=([^&]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function fetchStub(url) {
  captured.reads.push(url);
  let data;
  if (url.indexOf('action=attendance') >= 0) {
    data = {
      success: true, attendance: {
        am: [{ name: 'ダミー介護A', care: '要介護2', status: '出席' },
             { name: 'ダミー支援B', care: '要支援2', status: '出席' }],
        pm: [{ name: 'ダミー介護C', care: '要介護1', status: '出席' }]
      }
    };
  } else if (url.indexOf('action=usage_stats') >= 0) {
    data = { success: true, usageStats: { users: [] } };
  } else if (url.indexOf('action=getKeikakushoYear') >= 0) {
    data = url.indexOf('year=2026') >= 0
      ? { ok: true, users: KAIGO_USERS, records: [{ userId: 'ダミー介護A', name: 'ダミー介護A', sokutei_date: '2026-04-10', sokutei_by: 'スタッフX' }] }
      : { ok: true, users: [], records: [] };
  } else if (url.indexOf('action=staff_list') >= 0) {
    data = { staff: ['スタッフX', 'スタッフY', '代表', '小野', '林'] };
  } else if (url.indexOf('action=getShienSokutei') >= 0) {
    data = { ok: true, records: captured.shienRows.slice() };
  } else if (url.indexOf('action=user_list') >= 0) {
    data = { success: true, user_list: [] };
  } else if (url.indexOf('action=getTsushoPlansYearV2') >= 0) {
    data = { ok: true, users: TSUSHO_USERS };
  } else if (url.indexOf('action=getYotei') >= 0) {
    data = { ok: true, domain: 'sokutei', records: YOTEI_STATE.map(y => Object.assign({}, y)) };
  } else if (url.indexOf('action=slideYotei') >= 0 || url.indexOf('action=undoSlideYotei') >= 0) {
    captured.writes.push(url);
    const undo = url.indexOf('action=undoSlideYotei') >= 0;
    const row = yoteiFind(param(url, 'userId'));
    if (!row) data = { ok: false, error: 'not found' };
    else {
      row.nextYm = ymAddStub(row.nextYm, undo ? -1 : 1);
      row.slideCount = Math.max(0, row.slideCount + (undo ? -1 : 1));
      row.updatedBy = param(url, 'by');
      data = { ok: true, row: Object.assign({}, row) };
    }
  } else if (url.indexOf('action=addSokuteiDone') >= 0) {
    captured.writes.push(url);
    const uid = param(url, 'userId'), nm = param(url, 'name'), care = param(url, 'care'), date = param(url, 'date');
    const cyc = String(care).indexOf('要介護') === 0 ? 3 : 4;
    const row = yoteiFind(uid);
    const next = ymAddStub(date.slice(0, 7), cyc);
    if (row) { row.nextYm = next; row.slideCount = 0; }
    captured.shienRows.push({ name: nm, care: care, sokutei_date: date, sokutei_by: param(url, 'by'), source: 'app', note: '' });
    data = {
      ok: true, verified: true,
      log: { name: nm, care: care, sokutei_date: date, sokutei_by: param(url, 'by'), source: 'app', note: '' },
      yotei: row ? Object.assign({}, row) : { userId: uid, name: nm, domain: 'sokutei', nextYm: next, cycleMonths: cyc, slideCount: 0 }
    };
  } else data = {};
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
}

class FixedDate extends Date {
  constructor(...a) { if (!a.length) super(TODAY + 'T09:00:00+09:00'); else super(...a); }
  static now() { return new Date(TODAY + 'T09:00:00+09:00').getTime(); }
}

const timers = [];
function makeSandbox() {
  const sandbox = {
    document: {
      getElementById: elFor,
      createElement: () => ({ _t: '', set textContent(v) { this._t = String(v); }, get innerHTML() { return this._t; } })
    },
    fetch: fetchStub,
    alert: (m) => { captured.lastAlert = m; },
    console: console,
    Date: FixedDate,
    setTimeout: (fn, ms) => { const id = timers.length; timers.push({ fn, ms, cleared: false }); return id; },
    clearTimeout: (id) => { if (timers[id]) timers[id].cleared = true; },
    encodeURIComponent, decodeURIComponent,
    Math, JSON, Promise, Array, String, Object, Number, Boolean, RegExp, isNaN, parseInt, parseFloat
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  // 本番は <script src="shared.js"> / <script src="gas/yawaragi-board/yotei-core.js"> で読む分
  ['sokuteiCycleMonths_', 'sokuteiDueDate_'].forEach(n => vm.runInContext(extractFn(shared, n), sandbox));
  vm.runInContext(yoteiSrc.replace(/if \(typeof module[\s\S]*$/, ''), sandbox);
  vm.runInContext(script0, sandbox);
  return sandbox;
}

function resetFixtures() {
  YOTEI_STATE = YOTEI.map(y => Object.assign({}, y));
  captured.writes.length = 0; captured.reads.length = 0; captured.shienRows.length = 0;
  timers.length = 0;
  Object.keys(els).forEach(k => delete els[k]);
}

// =====================================================================
(async function main() {
  sec('5-1/5-2 今日の優先は isDue で絞られ、ヘッダが対象人数を出す');
  resetFixtures();
  let S = makeSandbox();
  await S.load();
  let t1 = els['tab1'].innerHTML;
  ok(t1.indexOf('今月の対象2名（残り1名）') >= 0, 'ヘッダ「来館予定3名中 今月の対象2名（残り1名）」');
  ok(t1.indexOf('来館予定3名中') >= 0, '来館予定は出席3名');
  ok(t1.indexOf('ダミー介護A') >= 0, '予定月=当月 は出る');
  ok(t1.indexOf('ダミー支援B') >= 0, '予定月=先月（過ぎている）も出る');
  eq(t1.indexOf('ダミー介護C') >= 0, false, '予定月=来月 は一切出ない（対象外）');
  eq(t1.indexOf('ダミー支援D') >= 0, false, '本日来館なしは優先リストに出ない（残りに計上）');
  ok(t1.indexOf('予定月 7月') >= 0, '各行に予定月を併記');
  ok(t1.indexOf('📅来月へ') >= 0, '「📅来月へ」ボタンがある');
  ok(t1.indexOf('📝今日測定した') >= 0, '要介護にも「📝今日測定した」が出る（段階1で一本化）');

  sec('5-3 「📅来月へ」→ slideYotei・行が消える・5秒Undo→ undoSlideYotei で戻る');
  await S.slideToNextMonth('ダミー介護A');
  const slideUrl = captured.writes[captured.writes.length - 1];
  ok(slideUrl.indexOf('action=slideYotei') >= 0, 'slideYotei を呼ぶ');
  ok(slideUrl.indexOf('userId=' + encodeURIComponent('ダミー介護A')) >= 0, 'userId を渡す');
  ok(slideUrl.indexOf('domain=sokutei') >= 0, 'domain=sokutei を渡す');
  ok(slideUrl.indexOf('by=') >= 0, '押した人(by)を渡す');
  eq(yoteiFind('ダミー介護A').nextYm, '2026-08', '予定月が +1ヶ月（2026-07→2026-08）');
  eq(yoteiFind('ダミー介護A').slideCount, 1, 'slideCount が +1');
  t1 = els['tab1'].innerHTML;
  eq(t1.indexOf('ダミー介護A') >= 0, false, 'その行が今日の優先から消える');
  ok(t1.indexOf('今月の対象1名') >= 0, 'ヘッダの対象人数が1名に減る');
  eq(elFor('undoBar').style.display, 'flex', 'Undoバーが表示される');
  eq(elFor('undoBar').querySelector('.undo-msg').textContent, 'ダミー介護A を8月へ送りました', 'Undoバーの文言');
  ok(timers.some(t => t.ms === 5000 && !t.cleared), '5秒で自動的に閉じるタイマーが張られる');
  ok(typeof elFor('undoBar').querySelector('.undo-btn').onclick === 'function', '「↩戻す」にハンドラが付く');
  // ↩戻す
  await elFor('undoBar').querySelector('.undo-btn').onclick();
  const undoUrl = captured.writes[captured.writes.length - 1];
  ok(undoUrl.indexOf('action=undoSlideYotei') >= 0, '「↩戻す」で undoSlideYotei を呼ぶ');
  eq(yoteiFind('ダミー介護A').nextYm, '2026-07', '予定月が元(2026-07)へ戻る');
  eq(yoteiFind('ダミー介護A').slideCount, 0, 'slideCount も戻る');
  t1 = els['tab1'].innerHTML;
  ok(t1.indexOf('ダミー介護A') >= 0, '行が今日の優先に復活する');
  ok(t1.indexOf('今月の対象2名') >= 0, 'ヘッダの対象人数が2名に戻る');

  sec('5-4 「今日測定した」→ addSokuteiDone・実施ログ+1行・予定月=実施月+周期');
  elFor('recordStaffSelect').value = 'スタッフY';
  elFor('recordNote').value = '';
  S.openRecordModal('ダミー介護A');
  const shienBefore = captured.shienRows.length;
  await S.submitRecord();
  const doneUrl = captured.writes[captured.writes.length - 1];
  ok(doneUrl.indexOf('action=addSokuteiDone') >= 0, 'addSokuteiDone を呼ぶ（addShienSokutei ではない）');
  ok(doneUrl.indexOf('care=' + encodeURIComponent('要介護2')) >= 0, '介護度を渡す（周期の判定材料）');
  ok(doneUrl.indexOf('date=' + TODAY) >= 0, '実施日は今日');
  eq(captured.shienRows.length, shienBefore + 1, '実施ログが1行増える');
  eq(yoteiFind('ダミー介護A').nextYm, '2026-10', '予定月=実施月7月+3ヶ月=2026-10（要介護）');
  t1 = els['tab1'].innerHTML;
  eq(t1.indexOf('ダミー介護A') >= 0, false, '測定済みの行は今日の優先から消える');
  ok(t1.indexOf('今月の対象1名') >= 0, '対象が1名に減る');

  sec('5-4b 要支援は+4ヶ月');
  elFor('recordStaffSelect').value = 'スタッフX';
  S.openRecordModal('ダミー支援B');
  await S.submitRecord();
  eq(yoteiFind('ダミー支援B').nextYm, '2026-11', '予定月=実施月7月+4ヶ月=2026-11（要支援）');
  eq(yoteiFind('ダミー支援B').slideCount, 0, '実施でスライド回数が0に戻る');

  sec('5-5 対象0人で「今月ぶん完了 ✅」');
  t1 = els['tab1'].innerHTML;
  ok(t1.indexOf('今月ぶん完了 ✅') >= 0, '対象0人で完了表示が出る');
  ok(t1.indexOf('今月の対象0名（残り1名）') >= 0, 'ヘッダは対象0名・残り1名');

  sec('5-7 「全利用者」タブは対象外も全員見える（予定月併記）');
  const t2 = els['tab2'].innerHTML;
  ['ダミー介護A', 'ダミー介護C', 'ダミー支援B', 'ダミー支援D'].forEach(n => {
    ok(t2.indexOf(n) >= 0, '全利用者タブに ' + n + ' が出る');
  });
  ok(t2.indexOf('全 4名') >= 0, 'ヘッダは全4名');
  ok(t2.indexOf('うち今月が予定月 1名') >= 0, '今月が予定月の人数を併記');
  ok(t2.indexOf('予定月 8月') >= 0, '対象外の人の予定月も見える');
  eq(t2.indexOf('📅来月へ') >= 0, false, '全利用者タブにはスライドボタンを出さない（誤操作防止）');

  sec('予定月シートに行が無い人は「未設定」で対象に出す（漏れ検知）');
  resetFixtures();
  YOTEI_STATE = YOTEI_STATE.filter(y => y.userId !== 'ダミー介護A');
  S = makeSandbox();
  await S.load();
  t1 = els['tab1'].innerHTML;
  ok(t1.indexOf('ダミー介護A') >= 0, '予定月が無い人も対象に出る');
  ok(t1.indexOf('予定月 未設定') >= 0, '「未設定」と表示される');

  sec('getYotei が落ちても画面は死なない（全員対象へフォールバック）');
  resetFixtures();
  const origFetch = fetchStub;
  const sandbox2 = (function () {
    const s = makeSandbox();
    return s;
  })();
  // getYotei だけ失敗させる
  const failing = (url) => url.indexOf('action=getYotei') >= 0
    ? Promise.reject(new Error('HTTP 500'))
    : origFetch(url);
  const S2 = makeSandbox();
  S2.fetch = failing;
  await S2.load();
  t1 = els['tab1'].innerHTML;
  ok(t1.indexOf('予定月（getYotei）取得失敗') >= 0, '取得失敗の注意書きが出る');
  ok(t1.indexOf('今月の対象3名') >= 0, '全員を対象として表示（測り漏れを作らない）');
  void sandbox2;

  console.log('\n=== 結果 ===');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
