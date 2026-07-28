// test-sokutei-plan-gap.js
// 要介護のスライドが個別機能訓練計画書のサイクルを壊さないための警告の検証（2026-07-29）。
//
// 要介護は「測定 → その結果で計画書を作る」順で、計画書の月は planStart 起点で動かせない。
// 予定月だけ後ろへスライドすると「計画書を作る月に測定結果が無い」が起きる。
// 要支援・事業対象者は計画書が無いのでこの問題は起きない。
//
// 社長決定: 完全には塞がない（入院・長期休みで本当に測れないことがある）。
//   警告を出すが押せる。超えた人は赤で目立たせ、一覧から消さない。
//
// 計画月の判定は shared.js §I の isPlanMonth を注入して使う（同じ判定を複製しない）。
// 実行: node scripts/test-sokutei-plan-gap.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'sokutei.html'), 'utf8');
const open = html.indexOf('<script>');
const script0 = html.slice(open + '<script>'.length, html.indexOf('</script>', open))
  .replace(/\nload\(\);\s*$/, '\n');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '(');
  const b = src.indexOf('{', s); let d = 0, i = b;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}
const shared = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
const yoteiSrc = fs.readFileSync(path.join(ROOT, 'gas', 'yawaragi-board', 'yotei-core.js'), 'utf8');
const measureSrc = fs.readFileSync(path.join(ROOT, 'measure-core.js'), 'utf8');

let pass = 0, fail = 0;
function eq(a, e, l) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('  PASS ' + l); }
  else { fail++; console.log('  FAIL ' + l + '\n    actual  =' + A + '\n    expected=' + E); }
}
function ok(c, l) { eq(!!c, true, l); }
function sec(t) { console.log('\n[' + t + ']'); }

// ---- DOM スタブ ----
function makeEl(id) {
  return {
    id: id, _in: '', _tx: '', value: '', disabled: false, style: {}, options: [], className: '',
    set innerHTML(v) { this._in = v; }, get innerHTML() { return this._in; },
    set textContent(v) { this._tx = v; }, get textContent() { return this._tx; },
    classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } },
    addEventListener(type, fn) { (this._ev = this._ev || {})[type] = fn; },
    querySelector(sel) {
      if (!this._q) this._q = {};
      if (!this._q[sel]) this._q[sel] = { textContent: '', onclick: null, disabled: false };
      return this._q[sel];
    }
  };
}
const els = {};
function elFor(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; }

// ---- 固定データ（すべてダミー名）----
// TODAY = 2026-07-28（当月 2026-07）
const TODAY = '2026-07-28';
// planStart=2026-02 / planMonths=3 → 計画月は 2/5/8/11 月 → 当月以降の最初は 2026-08
// planStart=2026-01 / planMonths=3 → 計画月は 1/4/7/10 月 → 当月以降の最初は 2026-07
// planStart=2025-11 / planMonths=3 → 計画月は 11/2/5/8… → 当月以降の最初は 2026-08
const KAIGO_USERS = [
  // 8月が計画月・前回測定なし → 予定月を9月以降にすると計画書に測定結果が無い（★警告対象）
  { userId: 'ダミー甲', name: 'ダミー甲', furigana: 'ダミーコウ', category: '要介護2', days: '月水', planStart: '2026-02', planMonths: 3 },
  // 8月が計画月・7月に測定済み → 8月の計画書は7月の測定で書ける（カバー済み＝警告しない）
  { userId: 'ダミー乙', name: 'ダミー乙', furigana: 'ダミーオツ', category: '要介護1', days: '火木', planStart: '2026-02', planMonths: 3 },
  // 計画月が先（年跨ぎの確認用）。planStart=2026-11 → 当月以降の最初は 2026-11、越えると翌年へ入る
  { userId: 'ダミー丙', name: 'ダミー丙', furigana: 'ダミーヘイ', category: '要介護1', days: '金', planStart: '2026-11', planMonths: 3 },
  // planStart 未設定 → 計画月が算出できない（警告の対象外だが「月不明」と出す）
  { userId: 'ダミー丁', name: 'ダミー丁', furigana: 'ダミーテイ', category: '要介護3', days: '水', planStart: '', planMonths: 3 }
];
const TSUSHO_USERS = [
  // 要支援＝計画書が無い。何ヶ月でもスライドできる
  { userId: 'ダミー戊', name: 'ダミー戊', furigana: 'ダミーボ', category: '要支援2', cancelled: false }
];
const USER_LIST = [
  { userName: 'ダミー甲', userNameKana: 'ダミーコウ', days: '月水', ampm: '午前' },
  { userName: 'ダミー乙', userNameKana: 'ダミーオツ', days: '火木', ampm: '午後' },
  { userName: 'ダミー丙', userNameKana: 'ダミーヘイ', days: '金', ampm: '午前' },
  { userName: 'ダミー丁', userNameKana: 'ダミーテイ', days: '水', ampm: '午前' },
  { userName: 'ダミー戊', userNameKana: 'ダミーボ', days: '月', ampm: '午後' }
];
// 前回測定: 乙だけ 2026-07（今月測った）
const KAIGO_RECORDS = [
  { userId: 'ダミー乙', name: 'ダミー乙', sokutei_date: '2026-07-10', sokutei_by: 'スタッフX' }
];
const YOTEI = [
  { userId: 'ダミー甲', name: 'ダミー甲', domain: 'sokutei', nextYm: '2026-07', cycleMonths: 3, slideCount: 0, note: '' },
  { userId: 'ダミー乙', name: 'ダミー乙', domain: 'sokutei', nextYm: '2026-10', cycleMonths: 3, slideCount: 0, note: '' },
  { userId: 'ダミー丙', name: 'ダミー丙', domain: 'sokutei', nextYm: '2026-07', cycleMonths: 3, slideCount: 0, note: '' },
  { userId: 'ダミー丁', name: 'ダミー丁', domain: 'sokutei', nextYm: '2026-07', cycleMonths: 3, slideCount: 0, note: '' },
  { userId: 'ダミー戊', name: 'ダミー戊', domain: 'sokutei', nextYm: '2026-07', cycleMonths: 4, slideCount: 0, note: '' }
];

let YOTEI_STATE = null;
let SHIEN_ROWS = [];
const captured = { writes: [] };
let CONFIRM_ANSWER = true;
const confirmCalls = [];

function param(url, k) { const m = url.match(new RegExp('[?&]' + k + '=([^&]*)')); return m ? decodeURIComponent(m[1]) : ''; }
function ymAddStub(ym, n) {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const m0 = (m - 1) + n, ny = y + Math.floor(m0 / 12), nm = ((m0 % 12) + 12) % 12 + 1;
  return ny + '-' + (nm < 10 ? '0' : '') + nm;
}
function fetchStub(url) {
  let data;
  if (url.indexOf('action=attendance') >= 0) {
    data = { success: true, attendance: { am: [{ name: 'ダミー甲', care: '要介護2', status: '出席' }], pm: [] } };
  } else if (url.indexOf('action=usage_stats') >= 0) data = { success: true, usageStats: { users: [] } };
  else if (url.indexOf('action=getKeikakushoYear') >= 0) {
    data = url.indexOf('year=2026') >= 0 ? { ok: true, users: KAIGO_USERS, records: KAIGO_RECORDS } : { ok: true, users: [], records: [] };
  } else if (url.indexOf('action=staff_list') >= 0) data = { staff: ['スタッフX', 'スタッフY'] };
  else if (url.indexOf('action=getShienSokutei') >= 0) data = { ok: true, records: SHIEN_ROWS.slice() };
  else if (url.indexOf('action=user_list') >= 0) data = { success: true, user_list: USER_LIST };
  else if (url.indexOf('action=getTsushoPlansYearV2') >= 0) data = { ok: true, users: TSUSHO_USERS };
  else if (url.indexOf('action=getYotei') >= 0) data = { ok: true, domain: 'sokutei', records: YOTEI_STATE.map(y => Object.assign({}, y)) };
  else if (url.indexOf('action=slideYotei') >= 0 || url.indexOf('action=undoSlideYotei') >= 0) {
    captured.writes.push(url);
    const undo = url.indexOf('action=undoSlideYotei') >= 0;
    const row = YOTEI_STATE.find(y => y.userId === param(url, 'userId'));
    row.nextYm = ymAddStub(row.nextYm, undo ? -1 : 1);
    row.slideCount = Math.max(0, row.slideCount + (undo ? -1 : 1));
    data = { ok: true, row: Object.assign({}, row) };
  } else if (url.indexOf('action=setYotei') >= 0) {
    captured.writes.push(url);
    const row = YOTEI_STATE.find(y => y.userId === param(url, 'userId'));
    row.nextYm = param(url, 'nextYm');
    data = { ok: true, row: Object.assign({}, row) };
  } else if (url.indexOf('action=addSokuteiDone') >= 0) {
    captured.writes.push(url);
    const uid = param(url, 'userId'), nm = param(url, 'name'), care = param(url, 'care'), date = param(url, 'date');
    const cyc = String(care).indexOf('要介護') === 0 ? 3 : 4;
    const row = YOTEI_STATE.find(y => y.userId === uid);
    const next = ymAddStub(date.slice(0, 7), cyc);
    if (row) { row.nextYm = next; row.slideCount = 0; }
    const log = { name: nm, care: care, sokutei_date: date, sokutei_by: param(url, 'by'), source: 'app', note: '' };
    SHIEN_ROWS.push(log);
    data = { ok: true, verified: true, log: log, yotei: row ? Object.assign({}, row) : { userId: uid, name: nm, domain: 'sokutei', nextYm: next, cycleMonths: cyc, slideCount: 0 } };
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
      createElement: () => ({ _t: '', set textContent(v) { this._t = String(v); }, get innerHTML() { return this._t; } }),
      querySelector: () => null, activeElement: null
    },
    fetch: fetchStub,
    alert: () => { },
    confirm: (msg) => { confirmCalls.push(String(msg)); return CONFIRM_ANSWER; },
    console: console, Date: FixedDate,
    setTimeout: (fn, ms) => { const id = timers.length; timers.push({ fn, ms, cleared: false }); return id; },
    clearTimeout: (id) => { if (timers[id]) timers[id].cleared = true; },
    encodeURIComponent, decodeURIComponent,
    Math, JSON, Promise, Array, String, Object, Number, Boolean, RegExp, isNaN, parseInt, parseFloat
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  // 計画月の判定は shared.js §I の isPlanMonth を「本物のまま」入れる（複製しない）
  ['sokuteiCycleMonths_', 'sokuteiDueDate_', 'isPlanMonth'].forEach(n => vm.runInContext(extractFn(shared, n), sandbox));
  vm.runInContext(yoteiSrc.replace(/if \(typeof module[\s\S]*$/, ''), sandbox);
  vm.runInContext(measureSrc.replace(/if \(typeof module[\s\S]*$/, ''), sandbox);
  vm.runInContext(script0, sandbox);
  return sandbox;
}
function resetFixtures() {
  YOTEI_STATE = YOTEI.map(y => Object.assign({}, y));
  SHIEN_ROWS = [];
  captured.writes.length = 0;
  confirmCalls.length = 0;
  CONFIRM_ANSWER = true;
  Object.keys(els).forEach(k => delete els[k]);
  timers.length = 0;
}
function cardOf(h, name) {
  const s = String(h), i = s.indexOf('data-row="' + name + '"');
  if (i < 0) return '';
  const start = s.lastIndexOf('<div class="card', i);
  const next = s.indexOf('<div class="card', i);
  return s.slice(start, next < 0 ? s.length : next);
}
function has(h, name) { return String(h).indexOf('data-row="' + name + '"') >= 0; }

(async () => {
  let S, tM;

  // =====================================================================
  sec('純関数 nextPlanYm: 当月以降で最初の計画月（isPlanMonth を使う・複製しない）');
  resetFixtures();
  S = makeSandbox();
  eq(S.nextPlanYm('2026-02', 3, '2026-07'), '2026-08', 'planStart 2月・3ヶ月周期 → 当月7月の次は8月');
  eq(S.nextPlanYm('2026-01', 3, '2026-07'), '2026-07', '当月が計画月ならその月');
  eq(S.nextPlanYm('2025-10', 3, '2026-07'), '2026-07', '前年開始でも 10/1/4/7 と進み当月が計画月になる');
  eq(S.nextPlanYm('2025-11', 3, '2026-12'), '2027-02', '★年跨ぎ（12月→翌年2月）');
  eq(S.nextPlanYm('2026-11', 3, '2026-12'), '2027-02', '★計画月が翌年1月台に来る場合も正しい');
  eq(S.nextPlanYm('', 3, '2026-07'), '', 'planStart 未設定は空');
  eq(S.nextPlanYm(null, 3, '2026-07'), '', 'null でも落ちない');
  eq(S.nextPlanYm('2020-01', 6, '2026-07'), '', '変則周期で今後計画月が無ければ空');
  eq(S.nextPlanYm('2026-09', 6, '2026-07'), '2026-09', '変則周期でも開始月そのものは拾う');

  sec('純関数 planGapCheck: 誰に警告するか');
  const chk = (o) => S.planGapCheck(o);
  eq(chk({ isKaigo: false, planYm: '2026-08', chosenYm: '2027-12' }), { warn: false, kind: 'notKaigo' },
    '★要支援・事業対象者は計画書が無い＝何ヶ月でも動かせる');
  eq(chk({ isKaigo: true, planYm: '', chosenYm: '2027-12' }), { warn: false, kind: 'unknownPlan' },
    '計画月が算出できない要介護は警告しない（画面には別途「月不明」と出す）');
  eq(chk({ isKaigo: true, planYm: '2026-08', chosenYm: '2026-08' }), { warn: false, kind: 'inTime' },
    '計画月と同じ月なら間に合う');
  eq(chk({ isKaigo: true, planYm: '2026-08', chosenYm: '2026-07' }), { warn: false, kind: 'inTime' },
    '計画月より前なら間に合う');
  eq(chk({ isKaigo: true, planYm: '2026-08', chosenYm: '2026-09', lastYm: '', cycleMonths: 3 }),
    { warn: true, kind: 'gap' }, '★計画月を越えて前回測定も無い＝警告');
  eq(chk({ isKaigo: true, planYm: '2026-08', chosenYm: '2026-09', lastYm: '2026-07', cycleMonths: 3 }),
    { warn: false, kind: 'covered' }, '★7月に測っていれば8月の計画書は書ける＝警告しない');
  eq(chk({ isKaigo: true, planYm: '2026-08', chosenYm: '2026-09', lastYm: '2026-06', cycleMonths: 3 }),
    { warn: false, kind: 'covered' }, '2ヶ月前の測定も周期3なら有効');
  eq(chk({ isKaigo: true, planYm: '2026-08', chosenYm: '2026-09', lastYm: '2026-05', cycleMonths: 3 }),
    { warn: true, kind: 'gap' }, '★3ヶ月前の測定は計画月には古すぎる＝警告');
  eq(chk({ isKaigo: true, planYm: '2027-01', chosenYm: '2027-02', lastYm: '2026-12', cycleMonths: 3 }),
    { warn: false, kind: 'covered' }, '★年跨ぎでもカバー判定が正しい');
  eq(chk({ isKaigo: true, planYm: '2027-01', chosenYm: '2027-02', lastYm: '2026-09', cycleMonths: 3 }),
    { warn: true, kind: 'gap' }, '★年跨ぎで古すぎる測定は警告');
  eq(chk({}), { warn: false, kind: 'notKaigo' }, '空オブジェクトでも落ちない');
  eq(chk(null), { warn: false, kind: 'notKaigo' }, 'null でも落ちない');

  // =====================================================================
  sec('2-1 要介護の行に計画月が出て、要支援等には出ない');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  tM = els['tab4'].innerHTML;
  ok(cardOf(tM, 'ダミー甲').indexOf('計画書 2026-08') >= 0, '要介護に「計画書 2026-08」が出る');
  ok(cardOf(tM, 'ダミー丙').indexOf('計画書 2026-11') >= 0, '別の人には別の計画月が出る');
  eq(cardOf(tM, 'ダミー戊').indexOf('計画書') >= 0, false, '★要支援・事業対象者には計画書を出さない');

  sec('2-6 planStart 未設定の要介護は黙って素通りさせない');
  ok(cardOf(tM, 'ダミー丁').indexOf('計画書 月不明') >= 0, '★「計画書 月不明」と出る');
  eq(cardOf(tM, 'ダミー丁').indexOf('plan-gap') >= 0, false, '警告バッジは出さない（対象外）');

  // =====================================================================
  sec('2-2 計画月を超える月を選ぶと、書き込みの前に確認が出る');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  CONFIRM_ANSWER = false;                      // 「やめる」
  const w0 = captured.writes.length;
  await S.slideToNextMonth('ダミー甲');          // 7月 → 8月（計画月と同月＝まだ間に合う）
  eq(confirmCalls.length, 0, '計画月ちょうどへのスライドでは確認を出さない');
  eq(captured.writes.length, w0 + 1, 'そのまま送信される');
  eq(YOTEI_STATE.find(y => y.userId === 'ダミー甲').nextYm, '2026-08', '予定月は8月');
  // ここからもう1回スライドすると 9月＝計画月(8月)を越える
  await S.slideToNextMonth('ダミー甲');
  eq(confirmCalls.length, 1, '★計画月を越える瞬間に確認が出る');
  ok(confirmCalls[0].indexOf('計画書は 8月') >= 0, '確認文に計画月が入る');
  ok(confirmCalls[0].indexOf('9月にすると') >= 0, '確認文に選んだ月が入る');
  ok(confirmCalls[0].indexOf('測定結果がありません') >= 0, '何が起きるかを書いている');
  eq(captured.writes.length, w0 + 1, '★「やめる」で送信が1回も発生しない');
  eq(YOTEI_STATE.find(y => y.userId === 'ダミー甲').nextYm, '2026-08', '★サーバ側も変わっていない');
  eq(els['tab4'].innerHTML.indexOf('⏳ 送信中…') >= 0, false, '「送信中…」も出ない（runRowActionに入っていない）');

  sec('2-2 「はい」なら実行され、赤バッジが付く');
  CONFIRM_ANSWER = true;
  await S.slideToNextMonth('ダミー甲');
  eq(confirmCalls.length, 2, '確認は1回だけ出る');
  eq(captured.writes.length, w0 + 2, '★「はい」で送信される');
  eq(YOTEI_STATE.find(y => y.userId === 'ダミー甲').nextYm, '2026-09', '予定月が9月になる');
  tM = els['tab4'].innerHTML;
  ok(cardOf(tM, 'ダミー甲').indexOf('plan-gap') >= 0, '★赤バッジが付く');
  ok(cardOf(tM, 'ダミー甲').indexOf('⚠ 計画書2026-08／測定2026-09予定') >= 0, 'バッジの文言');
  ok(cardOf(tM, 'ダミー甲').indexOf('gaprow') >= 0, '行にも赤の見た目が付く');

  sec('2-4 計画月を超えた人は対象外になっても一覧から消えない');
  ok(!S.isDue('2026-09', '2026-07'), '前提: 予定月9月は当月の対象ではない');
  ok(has(tM, 'ダミー甲'), '★それでも「今月やる人」に残っている');
  const iGapHead = tM.indexOf('計画書の月に測定結果がありません');
  ok(iGapHead >= 0, '最上部に説明が出る');
  ok(tM.indexOf('data-row="ダミー甲"') > iGapHead, '対象者はその直下に並ぶ');
  ok(iGapHead < tM.indexOf('まだの人'), '★「まだの人」より上に固定されている');

  sec('2-5 ヘッダに「⚠計画書に間に合わない ◯名」が出る');
  ok(tM.indexOf('⚠計画書に間に合わない 1名') >= 0, '★1名と出る');
  eq((tM.match(/data-row="ダミー甲"/g) || []).length, 1, '警告枠と未の両方に二重表示しない');

  sec('要支援・事業対象者は無制限にスライドできる（2-7）');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  CONFIRM_ANSWER = false;
  for (let i = 0; i < 6; i++) await S.slideToNextMonth('ダミー戊');
  eq(confirmCalls.length, 0, '★何回スライドしても確認が出ない');
  eq(YOTEI_STATE.find(y => y.userId === 'ダミー戊').nextYm, '2027-01', '★6ヶ月先まで動く（年跨ぎ）');
  eq(cardOf(els['tab4'].innerHTML, 'ダミー戊').indexOf('plan-gap') >= 0, false, '赤バッジも付かない');

  sec('直近の測定でカバーされている人には確認を出さない（嘘の警告を出さない）');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  CONFIRM_ANSWER = false;
  ok(cardOf(els['tab4'].innerHTML, 'ダミー乙').indexOf('計画書 2026-08') >= 0, '前提: 乙の計画月は8月');
  const wB = captured.writes.length;
  await S.slideToNextMonth('ダミー乙');   // 10月 → 11月（計画月8月を越えている）
  eq(confirmCalls.length, 0, '★7月に測っているので確認を出さない');
  eq(captured.writes.length, wB + 1, 'そのまま送信される');
  eq(cardOf(els['tab4'].innerHTML, 'ダミー乙').indexOf('plan-gap') >= 0, false, '赤バッジも付かない');

  // =====================================================================
  sec('2-3 月タップのポップアップで、越える月に⚠が付く');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  S.openYmPicker('ダミー甲');                       // 計画月 2026-08・前回測定なし
  let grid = elFor('ymPickerGrid').innerHTML;
  const cellOf = (g, ym) => {
    const i = g.indexOf('data-ym="' + ym + '"');
    if (i < 0) return '';
    const s = g.lastIndexOf('<button', i);
    return g.slice(s, g.indexOf('</button>', i));
  };
  eq(cellOf(grid, '2026-07').indexOf('⚠') >= 0, false, '当月(7月)には⚠が付かない');
  eq(cellOf(grid, '2026-08').indexOf('⚠') >= 0, false, '計画月(8月)にも⚠が付かない');
  ok(cellOf(grid, '2026-09').indexOf('⚠') >= 0, '★9月には⚠が付く');
  ok(cellOf(grid, '2026-09').indexOf('risky') >= 0, '色も変わる');
  ok(cellOf(grid, '2027-06').indexOf('⚠') >= 0, '先の月にも⚠が付く');
  ok(elFor('ymPickerNote').textContent.indexOf('計画書（2026-08）') >= 0, 'ポップアップに注記が出る');
  S.closeYmPicker();

  sec('2-3 要支援・計画月不明・カバー済みの人には⚠が付かない');
  S.openYmPicker('ダミー戊');
  grid = elFor('ymPickerGrid').innerHTML;
  eq(grid.indexOf('⚠') >= 0, false, '★要支援には1つも⚠が付かない');
  eq(elFor('ymPickerNote').style.display, 'none', '注記も出ない');
  S.closeYmPicker();
  S.openYmPicker('ダミー丁');
  eq(elFor('ymPickerGrid').innerHTML.indexOf('⚠') >= 0, false, '計画月不明の人にも⚠は付かない');
  ok(elFor('ymPickerNote').textContent.indexOf('計画書の月が分かりません') >= 0, '★代わりに「月が分かりません」と出す');
  S.closeYmPicker();
  S.openYmPicker('ダミー乙');
  eq(elFor('ymPickerGrid').innerHTML.indexOf('⚠') >= 0, false, '★今月測った人には⚠が付かない');
  S.closeYmPicker();

  sec('2-2 月タップでも確認は書き込みの前に出る');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  CONFIRM_ANSWER = false;
  const wC = captured.writes.length;
  S.openYmPicker('ダミー甲');
  await S.pickYm('2026-12');
  eq(confirmCalls.length, 1, '確認が出る');
  eq(captured.writes.length, wC, '★「やめる」で送信が発生しない');
  eq(YOTEI_STATE.find(y => y.userId === 'ダミー甲').nextYm, '2026-07', 'サーバ側も変わらない');
  eq(elFor('undoBar').style.display === 'flex', false, 'Undoバーも出ない');
  CONFIRM_ANSWER = true;
  S.openYmPicker('ダミー甲');
  await S.pickYm('2026-12');
  eq(captured.writes.length, wC + 1, '「はい」で送信される');
  eq(YOTEI_STATE.find(y => y.userId === 'ダミー甲').nextYm, '2026-12', '予定月が12月になる');
  ok(cardOf(els['tab4'].innerHTML, 'ダミー甲').indexOf('plan-gap') >= 0, '赤バッジが付く');

  sec('年跨ぎ: 計画月が翌年になる人でも判定が正しい');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  CONFIRM_ANSWER = false;
  ok(cardOf(els['tab4'].innerHTML, 'ダミー丙').indexOf('計画書 2026-11') >= 0, '前提: 丙の計画月は2026-11');
  S.openYmPicker('ダミー丙');
  grid = elFor('ymPickerGrid').innerHTML;
  eq(cellOf(grid, '2026-11').indexOf('⚠') >= 0, false, '計画月(11月)には⚠なし');
  ok(cellOf(grid, '2026-12').indexOf('⚠') >= 0, '12月には⚠');
  ok(cellOf(grid, '2027-01').indexOf('⚠') >= 0, '★翌年1月にも⚠（年跨ぎで壊れない）');
  S.closeYmPicker();

  sec('1-9の共通ヘルパーを通っている（送信中表示・連打防止が生きている）');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  CONFIRM_ANSWER = true;
  let gate = null;
  S.fetch = (url) => (url.indexOf('action=slideYotei') >= 0)
    ? new Promise(res => { gate = () => res(fetchStub(url)); })
    : fetchStub(url);
  const wD = captured.writes.length;
  const p1 = S.slideToNextMonth('ダミー甲');
  await Promise.resolve();
  ok(els['tab4'].innerHTML.indexOf('⏳ 送信中…') >= 0, '応答前に「送信中…」が出る');
  S.slideToNextMonth('ダミー甲');
  await Promise.resolve();
  eq(captured.writes.length, wD, '送信中の連打は送られない');
  gate();
  await p1;
  eq(captured.writes.filter(u => u.indexOf('action=slideYotei') >= 0).length, 1, '3回押しても送信は1回');

  sec('CSS: 赤バッジ・上部の説明・⚠月のスタイルがある');
  ok(/\.plan-gap\s*\{[^}]*background:\s*#c62828/.test(css), '赤バッジのスタイル');
  ok(/\.card\.gaprow\s*\{/.test(css), '行を目立たせるスタイル');
  ok(/\.gap-head\s*\{/.test(css), '上部の説明枠のスタイル');
  ok(/\.ym-cell\.risky\s*\{/.test(css), '⚠月のスタイル');
  ok(/\.plan-unknown\s*\{/.test(css), '「月不明」のスタイル');

  sec('計画月の判定を複製していない（isPlanMonth を使っている）');
  const scriptBody = script0;
  eq(/diff\s*%\s*3\s*===\s*0/.test(scriptBody), false, '★isPlanMonth の中身を写していない');
  ok(scriptBody.indexOf('isPlanMonth') >= 0, 'isPlanMonth を参照している');
  ok(scriptBody.indexOf('ymAdd(') >= 0, '月の足し算は yotei-core.js の ymAdd を使っている');

  console.log('\n=== 結果 ===');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
