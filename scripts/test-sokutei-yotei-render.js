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
// 案X移植（2026-07-28）で sokutei.html が measure-core.js も読むようになった（日付ナビ・午前午後分け）
const measureSrc = fs.readFileSync(path.join(ROOT, 'measure-core.js'), 'utf8');

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
    // 日付ナビ（案X-1）の配線を検証したいのでハンドラを控える
    addEventListener(type, fn) { (this._ev = this._ev || {})[type] = fn; },
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
  } else if (url.indexOf('action=setYotei') >= 0) {
    captured.writes.push(url);
    const row = yoteiFind(param(url, 'userId'));
    if (!row) data = { ok: false, error: 'not found' };
    else {
      // 本番 writeYotei_ と同じ規約: 既存行の cycleMonths は care を渡されても書き換えない
      row.nextYm = param(url, 'nextYm');
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
  // 本番は <script src="shared.js"> / <script src="gas/yawaragi-board/yotei-core.js"> / <script src="measure-core.js"> で読む分
  ['sokuteiCycleMonths_', 'sokuteiDueDate_'].forEach(n => vm.runInContext(extractFn(shared, n), sandbox));
  vm.runInContext(yoteiSrc.replace(/if \(typeof module[\s\S]*$/, ''), sandbox);
  vm.runInContext(measureSrc.replace(/if \(typeof module[\s\S]*$/, ''), sandbox);
  sandbox.ymCandidates = vm.runInContext('ymCandidates', sandbox);
  vm.runInContext(script0, sandbox);
  return sandbox;
}

// 成功後の行は「消える」のではなく「グレーで沈む」ようになった（2026-07-28 案X-4 移植）。
// もうフェード待ちのタイマーは無いので、沈んだ行の状態は renderAll 直後にそのまま読める。
// sunk クラスが付いた行を数える小道具（旧 flushFade の置き換え）。
function sunkCount(html) { return (String(html).match(/class="card [^"]*\bsunk\b/g) || []).length; }
// 特定の人のカードだけを切り出す（他人の行のボタンを誤って拾わないため）
function cardOf(html, name) {
  const s = String(html), i = s.indexOf('data-row="' + name + '"');
  if (i < 0) return '';
  const start = s.lastIndexOf('<div class="card', i);
  const next = s.indexOf('<div class="card', i);
  return s.slice(start, next < 0 ? s.length : next);
}
function resetFixtures() {
  YOTEI_STATE = YOTEI.map(y => Object.assign({}, y));
  captured.writes.length = 0; captured.reads.length = 0; captured.shienRows.length = 0;
  timers.length = 0;
  Object.keys(els).forEach(k => delete els[k]);
  // 2026-07-30: 書き込みには操作者の選択が要る（B案 requireOperator）。
  // 現場が最初に自分を選ぶのと同じ前提をここで作る。未選択の挙動は
  // scripts/test-sokutei-operator-gate.js が受け持つ。
  elFor('recordStaffSelect').value = 'スタッフY';
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
  ok(t1.indexOf('予定 2026-07 ▾') >= 0, '各行に予定月を併記（社長指定の「予定 YYYY-MM」形式）');
  ok(t1.indexOf('📅来月へ') >= 0, '「📅来月へ」ボタンがある');
  ok(t1.indexOf('📝測定した') >= 0, '要介護にも記録ボタンが出る（段階1で一本化）');

  sec('月タップ: 予定月の表示がボタンになっている（両タブ）');
  ok(t1.indexOf('class="ym-btn"') >= 0, '今日の優先タブに予定月ボタンがある');
  ok(t1.indexOf('予定 2026-07 ▾') >= 0, '現在の予定月を表示（YYYY-MM）');
  ok(t1.indexOf('openYmPicker') >= 0, 'タップで openYmPicker が呼ばれる配線');
  ok(els['tab2'].innerHTML.indexOf('class="ym-btn"') >= 0, '全利用者タブにも予定月ボタンがある');
  ok(els['tab2'].innerHTML.indexOf('予定 2026-08 ▾') >= 0, '対象外（来月予定）の人にもボタンが出る');

  sec('月タップ: 候補は当月から12個・過去月なし・現在月にチェック');
  S.openYmPicker('ダミー介護A');
  const grid = elFor('ymPickerGrid').innerHTML;
  eq((grid.match(/class="ym-cell/g) || []).length, 12, '候補はちょうど12個');
  eq(elFor('ymPickerName').textContent, 'ダミー介護A', '対象者名が出る');
  eq(elFor('ymPicker').style.display, 'flex', 'ポップアップが開く');
  ok(grid.indexOf('data-ym="2026-07"') >= 0, '当月(2026-07)が候補にある＝対象に戻せる');
  ok(grid.indexOf('data-ym="2027-06"') >= 0, '11ヶ月先(2027-06)まである');
  eq(grid.indexOf('data-ym="2026-06"') >= 0, false, '過去月(2026-06)は出ない');
  eq(grid.indexOf('data-ym="2027-07"') >= 0, false, '12ヶ月より先は出ない');
  ok(grid.indexOf('ym-cell sel') >= 0, '現在の予定月にチェック用クラスが付く');
  ok(grid.indexOf('✓ 7月') >= 0, '現在の予定月(7月)にチェックマーク');

  sec('月タップ: 選ぶと nextYm が変わり cycleMonths は変わらない');
  const cycBefore = yoteiFind('ダミー介護A').cycleMonths;
  eq(cycBefore, 3, '前提: 要介護＝3ヶ月周期');
  await S.pickYm('2026-11');
  const setUrl = captured.writes[captured.writes.length - 1];
  ok(setUrl.indexOf('action=setYotei') >= 0, 'setYotei を呼ぶ（新APIは足していない）');
  ok(setUrl.indexOf('nextYm=2026-11') >= 0, '選んだ月を渡す');
  ok(setUrl.indexOf('domain=sokutei') >= 0, 'domain を渡す');
  ok(setUrl.indexOf('by=') >= 0, '押した人(by)を渡す');
  eq(yoteiFind('ダミー介護A').nextYm, '2026-11', '予定月が 2026-11 になる');
  eq(yoteiFind('ダミー介護A').cycleMonths, 3, '★cycleMonths は 3 のまま（周期を変えない）');
  eq(elFor('ymPicker').style.display, 'none', 'ポップアップが閉じる');
  t1 = els['tab1'].innerHTML;
  // 案X-4: 対象外になっても行は消さず、グレーで沈めて結果ラベルを残す
  ok(t1.indexOf('ダミー介護A') >= 0, '対象外になっても行は残る（消さない）');
  eq(sunkCount(t1), 1, 'その行がグレーで沈む（sunk）');
  ok(t1.indexOf('✅ 11月に変更しました') >= 0, '結果ラベルが行に残る');
  ok(t1.indexOf('今月の対象1名') >= 0, 'ヘッダの対象人数は沈んだ行を除いて1名');

  sec('月タップ: 5秒Undoで元の月へ戻る');
  eq(elFor('undoBar').style.display, 'flex', 'Undoバーが出る');
  eq(elFor('undoBar').querySelector('.undo-msg').textContent, 'ダミー介護A を11月に変更しました', 'Undoバーの文言');
  ok(timers.some(t => t.ms === 5000 && !t.cleared), '5秒タイマーが張られる');
  await elFor('undoBar').querySelector('.undo-btn').onclick();
  eq(yoteiFind('ダミー介護A').nextYm, '2026-07', '元の 2026-07 に戻る');
  eq(yoteiFind('ダミー介護A').cycleMonths, 3, '戻しても cycleMonths は 3');
  t1 = els['tab1'].innerHTML;
  ok(t1.indexOf('ダミー介護A') >= 0, '今日の優先に復活する');
  eq(sunkCount(t1), 0, '戻したら沈めも解除される（また押せる状態に戻る）');
  ok(t1.indexOf('今月の対象2名') >= 0, 'ヘッダの対象人数も2名に戻る');

  sec('月タップ: 同じ月を選んだら何もしない');
  const wBefore = captured.writes.length;
  S.openYmPicker('ダミー介護A');
  await S.pickYm('2026-07');
  eq(captured.writes.length, wBefore, '同月選択では書き込みAPIを叩かない');

  sec('月タップ: 対象外（来月予定）の人の月も変更できる');
  S.openYmPicker('ダミー介護C');
  eq(elFor('ymPickerGrid').innerHTML.indexOf('✓ 8月') >= 0, true, '対象外の人は8月にチェック');
  await S.pickYm('2026-07');
  eq(yoteiFind('ダミー介護C').nextYm, '2026-07', '当月へ引き戻せる');
  eq(yoteiFind('ダミー介護C').cycleMonths, 3, 'cycleMonths 不変');
  t1 = els['tab1'].innerHTML;
  ok(t1.indexOf('ダミー介護C') >= 0, '今日の優先に現れる（対象に戻る）');
  // 後片付け: 8月へ戻す
  S.openYmPicker('ダミー介護C');
  await S.pickYm('2026-08');
  eq(yoteiFind('ダミー介護C').nextYm, '2026-08', '元に戻した');

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
  ok(t1.indexOf('ダミー介護A') >= 0, 'その行は消えずに残る（案X-4）');
  ok(cardOf(t1, 'ダミー介護A').indexOf('sunk') >= 0, 'その行がグレーで沈む');
  ok(t1.indexOf('✅ 8月へ送りました') >= 0, '「8月へ送りました」が行に残る');
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
  ok(t1.indexOf('ダミー介護A') >= 0, '測定済みの行も消えずに残る（案X-4）');
  ok(cardOf(t1, 'ダミー介護A').indexOf('sunk') >= 0, '測定済みの行がグレーで沈む');
  ok(t1.indexOf('✅ 測定を記録しました') >= 0, '「測定を記録しました」が行に残る');
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
  ok(t2.indexOf('予定 2026-08 ▾') >= 0, '対象外の人の予定月も見える');
  eq(t2.indexOf('📅来月へ') >= 0, false, '全利用者タブにはスライドボタンを出さない（誤操作防止）');

  sec('予定月シートに行が無い人は「未設定」で対象に出す（漏れ検知）');
  resetFixtures();
  YOTEI_STATE = YOTEI_STATE.filter(y => y.userId !== 'ダミー介護A');
  S = makeSandbox();
  await S.load();
  t1 = els['tab1'].innerHTML;
  ok(t1.indexOf('ダミー介護A') >= 0, '予定月が無い人も対象に出る');
  ok(t1.indexOf('予定 未設定 ▾') >= 0, '「未設定」と表示される（タップして設定できる）');

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

  // ===================================================================
  // 2026-07-28 本番不具合の回帰ガード
  //   事象: 「📅来月へ」を押しても無反応 → 押せていないと思って2回押し、2ヶ月進んで9月まで飛んだ
  // ===================================================================
  sec('1-9-1 押した瞬間に見た目が変わる（サーバ応答を待たない）');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  let gate = null;
  S.fetch = (url) => (url.indexOf('action=slideYotei') >= 0)
    ? new Promise(res => { gate = () => res(fetchStub(url)); })   // 応答を保留する
    : fetchStub(url);
  const p1 = S.slideToNextMonth('ダミー介護A');   // await しない＝応答前の画面を見る
  await Promise.resolve();
  t1 = els['tab1'].innerHTML;
  ok(t1.indexOf('⏳ 送信中…') >= 0, '★応答前に「⏳ 送信中…」が出る（無反応だった不具合の修正）');
  ok(t1.indexOf(' busy"') >= 0, '応答前に行が送信中スタイルになる');

  sec('1-9-2 送信中は同じ行の他のボタンも押せない');
  const at = t1.indexOf('data-row="ダミー介護A"');
  const card = t1.slice(at, t1.indexOf('</div></div>', at));
  eq((card.match(/disabled/g) || []).length, 3, '📅来月へ・予定▾・今日測定した の3つとも disabled');
  S.openYmPicker('ダミー介護A');
  eq(elFor('ymPicker').style.display === 'flex', false, '送信中は月ピッカーが開かない');

  sec('1-9-2 連打しても送信は1回だけ（in-flight ロック）★本番不具合の直接の再発防止');
  const wBefore2 = captured.writes.length;
  S.slideToNextMonth('ダミー介護A');
  S.slideToNextMonth('ダミー介護A');              // 社長が踏んだ「効かないからもう1回」
  await Promise.resolve();
  eq(captured.writes.length, wBefore2, '2回目・3回目は送信されない');
  gate();
  await p1;
  eq(captured.writes.filter(u => u.indexOf('action=slideYotei') >= 0).length, 1, '3回押しても slideYotei は1回');
  eq(yoteiFind('ダミー介護A').nextYm, '2026-08', '★1ヶ月しか進まない（9月まで飛ばない）');
  eq(yoteiFind('ダミー介護A').slideCount, 1, 'slideCount も +1 のみ');

  // 1-9-3 の意図（押した実感を残す）は案X-4で「消す」から「沈める」へ置き換えた。
  // 消すより残す方が「本当に入ったのか」を確かめられる＝二度押しの動機自体が消える。
  sec('案X-4 成功した行は消えずにグレーで沈む（1-9-3 の置き換え）');
  t1 = els['tab1'].innerHTML;
  ok(t1.indexOf('ダミー介護A') >= 0, '行は残る');
  eq(sunkCount(t1), 1, 'sunk クラスが付く');
  ok(t1.indexOf('✅ 8月へ送りました') >= 0, '何が起きたかが行に書いてある');
  eq(cardOf(t1, 'ダミー介護A').indexOf('📅来月へ') >= 0, false, '沈んだ行にはボタンを出さない（もう押せない＝二重操作の入口を塞ぐ）');
  eq(cardOf(t1, 'ダミー介護A').indexOf('onclick="openRecordModal') >= 0, false, '沈んだ行はカードタップでも開かない');
  ok(t1.indexOf('今月の対象1名') >= 0, 'ヘッダの対象人数も更新される');

  sec('1-9-4 失敗したら表示が元に戻り、理由が行に出る');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  S.fetch = (url) => (url.indexOf('action=slideYotei') >= 0)
    ? Promise.reject(new Error('通信エラー'))
    : fetchStub(url);
  await S.slideToNextMonth('ダミー介護A');
  t1 = els['tab1'].innerHTML;
  ok(t1.indexOf('変更できませんでした') >= 0, '「変更できませんでした」が出る');
  ok(t1.indexOf('通信エラー') >= 0, '失敗の理由も出る');
  eq(t1.indexOf('⏳ 送信中…') >= 0, false, '「送信中…」が残らない');
  ok(t1.indexOf('ダミー介護A') >= 0, '行は消えずに残る（元の表示へ戻る）');
  ok(t1.indexOf('予定 2026-07 ▾') >= 0, '予定月の表示も元のまま');
  eq(yoteiFind('ダミー介護A').nextYm, '2026-07', 'サーバ側も変わっていない');
  ok(t1.indexOf('今月の対象2名') >= 0, 'ヘッダの対象人数も元のまま');
  eq(elFor('undoBar').style.display === 'flex', false, '失敗時はUndoバーを出さない');
  S.fetch = fetchStub;
  await S.slideToNextMonth('ダミー介護A');
  eq(yoteiFind('ダミー介護A').nextYm, '2026-08', '失敗後もやり直せる（ロックが残らない）');

  sec('1-9-5 月タップも同じヘルパーを通る（個別実装していない）');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  let gate2 = null;
  S.fetch = (url) => (url.indexOf('action=setYotei') >= 0)
    ? new Promise(res => { gate2 = () => res(fetchStub(url)); })
    : fetchStub(url);
  S.openYmPicker('ダミー介護A');
  const p2 = S.pickYm('2026-11');
  await Promise.resolve();
  ok(els['tab1'].innerHTML.indexOf('⏳ 送信中…') >= 0, '月タップでも応答前に「送信中…」が出る');
  const w2 = captured.writes.length;
  S.openYmPicker('ダミー介護A');
  await S.pickYm('2026-12');
  eq(captured.writes.length, w2, '送信中の連打は送られない');
  gate2();
  await p2;
  eq(yoteiFind('ダミー介護A').nextYm, '2026-11', '選んだ月に1回だけ変わる');

  sec('1-9-5 「今日測定した」も同じヘルパーを通る');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  let gate3 = null;
  S.fetch = (url) => (url.indexOf('action=addSokuteiDone') >= 0)
    ? new Promise(res => { gate3 = () => res(fetchStub(url)); })
    : fetchStub(url);
  elFor('recordStaffSelect').value = 'スタッフY';
  elFor('recordNote').value = '';
  S.openRecordModal('ダミー介護A');
  const p3 = S.submitRecord();
  await Promise.resolve();
  ok(els['tab1'].innerHTML.indexOf('⏳ 送信中…') >= 0, '「今日測定した」でも応答前に「送信中…」が出る');
  const w3 = captured.writes.length;
  S.openRecordModal('ダミー介護A');
  await S.submitRecord();
  eq(captured.writes.length, w3, '送信中の連打は送られない');
  gate3();
  await p3;
  eq(captured.shienRows.length, 1, '実施ログは1行だけ（二重記録しない）');

  sec('1-9-6 Undoバーがスクロール位置に関係なく必ず見える');
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  ok(/\.undo-bar\s*\{[^}]*position:\s*fixed/.test(css), '.undo-bar が position: fixed');
  ok(/\.undo-bar\s*\{[^}]*z-index:\s*\d+/.test(css), 'z-index が指定されている（他要素に隠れない）');
  ok(/\.undo-bar\.fading\s*\{[^}]*opacity/.test(css), '消える直前に薄くするクラスがある');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  await S.slideToNextMonth('ダミー介護A');
  eq(elFor('undoBar').style.display, 'flex', 'Undoバーが表示される');
  eq(elFor('undoBar').className, 'undo-bar', '出た直後は薄くない');
  const fadeT = timers.filter(t => t.ms === 3800 && !t.cleared);
  ok(fadeT.length >= 1, '消える1.2秒前に薄くするタイマーがある（5000-1200=3800ms）');
  fadeT[0].fn();
  eq(elFor('undoBar').className, 'undo-bar fading', '薄くなるクラスが付く');
  ok(timers.some(t => t.ms === 5000 && !t.cleared), '5秒で消えるタイマーは従来どおり');

  // =====================================================================
  // 案X（measure-app.html の操作感を移植・2026-07-28 社長指示の8項目）
  // =====================================================================
  sec('案X-1 日付ナビ（◀ ▶ 日付タップ 今日）');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  ['prevDay', 'nextDay', 'todayBtn', 'datePick'].forEach(id => {
    ok(els[id] && els[id]._ev, id + ' にイベントが配線されている');
  });
  eq(elFor('datePick').value, TODAY, '日付ピッカーの初期値は今日');
  const readsBefore = captured.reads.length;
  await els['prevDay']._ev.click();
  const attUrl = captured.reads.slice(readsBefore).filter(u => u.indexOf('action=attendance') >= 0)[0];
  ok(attUrl.indexOf('date=2026-07-27') >= 0, '◀で前日の来館者を取り直す');
  eq(elFor('datePick').value, '2026-07-27', 'ピッカーの表示も前日になる');
  await els['nextDay']._ev.click();
  eq(elFor('datePick').value, TODAY, '▶で今日へ戻る');
  elFor('datePick').value = '2026-07-20';
  await els['datePick']._ev.change.call(elFor('datePick'));
  eq(captured.reads.filter(u => u.indexOf('date=2026-07-20') >= 0).length > 0, true, '日付タップでその日を取り直す');
  await els['todayBtn']._ev.click();
  eq(elFor('datePick').value, TODAY, '「今日」で今日へ復帰する');

  sec('案X-8 今日以外を見ているときの警告バナー');
  await S.goDate('2026-07-25');
  ok(elFor('dstate').textContent.indexOf('過去の日付') >= 0, '過去日で警告文が出る');
  ok(elFor('dstate').className.indexOf('on') >= 0, 'バナーが表示状態になる');
  ok(elFor('dstate').className.indexOf('past') >= 0, '過去用の色クラスが付く');
  ok(elFor('dstate').textContent.indexOf('今日基準') >= 0, '期限判定は今日基準である旨も出す');
  await S.goDate('2026-08-05');
  ok(elFor('dstate').className.indexOf('future') >= 0, '未来日は未来用の色クラス');
  await S.goDate(TODAY);
  eq(elFor('dstate').className, 'dstate', '今日に戻すとバナーは消える');
  eq(elFor('dstate').textContent, '', '文言も空になる');

  sec('案X-1 日付を動かしても対象判定（予定月・期限）は今日基準のまま');
  await S.goDate('2026-06-15');   // 先月の日付を見ても…
  ok(els['tab1'].innerHTML.indexOf('ダミー介護A') >= 0, '今月(7月)予定の人はそのまま対象');
  eq(els['tab1'].innerHTML.indexOf('ダミー介護C') >= 0, false, '来月(8月)予定の人は依然として対象外');
  await S.goDate(TODAY);

  sec('案X-3 午前午後の2カラム');
  let t1x = els['tab1'].innerHTML;
  ok(t1x.indexOf('<div class="cols">') >= 0, '2カラムの器がある');
  ok(t1x.indexOf('colhead am') >= 0, '午前の列見出しがある');
  ok(t1x.indexOf('colhead pm') >= 0, '午後の列見出しがある');
  ok(t1x.indexOf('午前　2名') >= 0, '午前の人数が出る（介護A・支援B）');
  ok(t1x.indexOf('午後　0名') >= 0, '午後は対象0名（介護Cは対象外）');
  ok(/@media \(max-width: 620px\)[^}]*\{[^}]*\.cols[^}]*flex-direction: column/.test(css.replace(/\s+/g, ' ')) || css.indexOf('.cols { flex-direction: column; }') >= 0, '狭い画面では縦積みになる');

  sec('案X-6 カード全体タップで記録モーダルが開く');
  ok(cardOf(t1x, 'ダミー介護A').indexOf('onclick="openRecordModal') >= 0, 'カードそのものに記録モーダルの配線がある');
  ok(cardOf(t1x, 'ダミー介護A').indexOf('tappable') >= 0, 'タップできる見た目のクラスが付く');
  ok(cardOf(t1x, 'ダミー介護A').indexOf('event.stopPropagation();openYmPicker') >= 0, '中のボタンはカードのタップに吸われない');
  eq(cardOf(els['tab2'].innerHTML, 'ダミー介護C').indexOf('tappable') >= 0, false, '全利用者タブはカードタップ無効（誤操作防止）');

  sec('案X-5 出力者は要介護のみ');
  elFor('recordStaffSelect').value = 'スタッフY';
  S.openRecordModal('ダミー介護A');
  eq(elFor('recordOutputWrap').style.display, '', '要介護では出力者欄を出す');
  ok(elFor('recordOutputSelect').innerHTML.indexOf('（測定者と同じ）') >= 0, '既定は「測定者と同じ」');
  ok(elFor('recordHint').textContent.indexOf('出力者') >= 0, '要介護向けの説明が出る');
  S.closeRecordModal();
  S.openRecordModal('ダミー支援B');
  eq(elFor('recordOutputWrap').style.display, 'none', '要支援・事業対象者では出力者欄を隠す');
  ok(elFor('recordHint').textContent.indexOf('出力者はありません') >= 0, '要支援向けの説明が出る');
  S.closeRecordModal();

  sec('案X-5 出力者を選ぶと outputBy が送られる（空なら測定者）');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  elFor('recordStaffSelect').value = 'スタッフY';
  elFor('recordNote').value = '';
  S.openRecordModal('ダミー介護A');
  elFor('recordOutputSelect').value = 'スタッフX';
  await S.submitRecord();
  let doneUrlX = captured.writes[captured.writes.length - 1];
  ok(doneUrlX.indexOf('outputBy=' + encodeURIComponent('スタッフX')) >= 0, '選んだ出力者が送られる');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  elFor('recordStaffSelect').value = 'スタッフY';
  S.openRecordModal('ダミー介護A');
  elFor('recordOutputSelect').value = '';
  await S.submitRecord();
  doneUrlX = captured.writes[captured.writes.length - 1];
  ok(doneUrlX.indexOf('outputBy=' + encodeURIComponent('スタッフY')) >= 0, '空欄なら測定者が出力者になる');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  elFor('recordStaffSelect').value = 'スタッフX';
  S.openRecordModal('ダミー支援B');
  await S.submitRecord();
  doneUrlX = captured.writes[captured.writes.length - 1];
  ok(doneUrlX.indexOf('outputBy=&') >= 0 || /outputBy=$/.test(doneUrlX.split('&note=')[0]), '要支援は出力者を送らない（空）');

  sec('案X-2 過去日で記録すると予定月は「測定日の月＋周期」になる（今日基準にしない）');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  eq(elFor('recordDate').value, '', '前提: まだ測定日欄は空');
  elFor('recordStaffSelect').value = 'スタッフY';
  S.openRecordModal('ダミー介護A');
  eq(elFor('recordDate').value, TODAY, '既定値は選んでいる日（初期＝今日）');
  eq(elFor('recordDate').max, TODAY, '未来日は選べないよう max が今日');
  elFor('recordDate').value = '2026-05-12';        // 5月に測ったぶんを後から入れる
  await S.submitRecord();
  const pastUrl = captured.writes[captured.writes.length - 1];
  ok(pastUrl.indexOf('date=2026-05-12') >= 0, '選んだ測定日がそのまま送られる');
  eq(yoteiFind('ダミー介護A').nextYm, '2026-08', '★予定月=測定日の月(5月)+3ヶ月=2026-08（今日の7月起点にしない）');

  sec('案X-2 未来日は記録できない');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  const wF = captured.writes.length;
  elFor('recordStaffSelect').value = 'スタッフY';
  S.openRecordModal('ダミー介護A');
  elFor('recordDate').value = '2026-09-01';
  await S.submitRecord();
  eq(captured.writes.length, wF, '未来日では送信しない');
  ok(String(captured.lastAlert).indexOf('未来の日付') >= 0, '理由を日本語で伝える');

  sec('案X-2 日付ナビで日を変えると記録モーダルの既定日もその日になる');
  await S.goDate('2026-07-21');
  S.openRecordModal('ダミー介護A');
  eq(elFor('recordDate').value, '2026-07-21', '既定の測定日は見ている日');
  S.closeRecordModal();

  sec('案X-7 モバイル最適化（タップ的の大きさ・iOSのちらつき/文字拡大対策）');
  ok(css.indexOf('-webkit-tap-highlight-color: transparent') >= 0, 'タップ時の青いちらつきを消している');
  ok(css.indexOf('-webkit-text-size-adjust: 100%') >= 0, 'iOSの勝手な文字拡大を止めている');
  ok(html.indexOf('viewport-fit=cover') >= 0, 'ノッチ端末に対応している');
  ok(css.indexOf('env(safe-area-inset-bottom)') >= 0, '下端のセーフエリアを確保している');
  ['.tab-btn', '.dpick', '.ym-cell', '.modal-select, .modal-input'].forEach(sel => {
    const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*min-height:\\s*(4[4-9]|[5-9]\\d)px');
    ok(re.test(css), sel + ' に十分なタップ高さがある');
  });

  console.log('\n=== 結果 ===');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
