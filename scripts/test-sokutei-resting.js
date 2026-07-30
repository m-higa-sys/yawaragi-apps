// test-sokutei-resting.js
// 💤（長期休み中）の条件を「予定月が当月以前」から「期限内の測定が無い」へ変える（2026-07-30）。
//
// 背景（本番実測 2026-07-30）:
//   長期休み5名の予定月は全員未来月（08が3名／09が1名／11が1名）で、💤 は0名だった。
//   現場は 7/29 20時台に24名をスライドしており、休みの人も一緒に送っている。
//   予定月を条件にしている限り、休みの人は画面のどこにも出てこない。
//   社長の目的は「長期休みの人が急に来たとき、探さずにその場で測れること」
//   （3ヶ月休みの予定が2ヶ月で来ることがある）。
//
// 決定:
//   ・条件 = 長期休み中 ＋ 期限内の測定が無い。予定月は見ない
//   ・A-1: 📋（計画に間に合いません）に出ている人は 💤 から外す（📋 のほうが緊急度が高い）
//          赤（1回分まるごと飛ばし）も同様に外す
//   ・B-1: 要支援は covered が定義できないので「前回測定 ＋ 周期」で期限切れかを判定する
//   ・ヘッダの「◯月の対象 ◯名」に 💤 を混ぜない（pool は据え置き・別に数える）
//   ・💤 のカードから 📝測定した が押せること（これが目的そのもの）
//
// 判定式（planGapCheck / planGapLevel / covered）は1行も触らない。
// 実行: node scripts/test-sokutei-resting.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'sokutei.html'), 'utf8');
const open = html.indexOf('<script>');
const script0 = html.slice(open + '<script>'.length, html.indexOf('</script>', open))
  .replace(/\nload\(\);\s*$/, '\n');

function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('function ' + name + ' が無い（未実装＝RED）');
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

// ---- DOM スタブ（test-sokutei-output-ui.js と同じ作り）----
function makeEl(id) {
  return {
    id: id, _in: '', _tx: '', value: '', disabled: false, style: {}, options: [], className: '',
    set innerHTML(v) { this._in = v; }, get innerHTML() { return this._in; },
    set textContent(v) { this._tx = v; }, get textContent() { return this._tx; },
    classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } },
    addEventListener(type, fn) { (this._ev = this._ev || {})[type] = fn; },
    focus() { },
    querySelector(sel) {
      if (!this._q) this._q = {};
      if (!this._q[sel]) this._q[sel] = { textContent: '', onclick: null, disabled: false };
      return this._q[sel];
    }
  };
}
const els = {};
function elFor(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; }

// =====================================================================
// 固定データ（すべてダミー名）。TODAY = 2026-07-28（当月 2026-07）
// 本番の顔ぶれを写した構成にする（人数と内訳を実測と突き合わせられるように）。
//   甲 要介護1・unknownPlan・予定08・前回測定なし・休み中 → 💤
//   乙 要介護1・inTime（期限08）・予定08・前回測定なし・休み中 → 💤（氏名は表記ゆれで届く）
//   丙 要介護1・期限09・予定11 → 📋。休み中だが A-1 で 💤 からは外す
//   丁 要介護2・予定07（当月）・休みでない → 今月の対象（未）
//   戊 要支援2・前回2026-03・周期4 → 期限相当2026-07＝期限切れ・休み中 → 💤
//   己 要支援1・前回2026-05・周期4 → 期限相当2026-09＝余裕あり・休み中 → 💤に出さない（B-1）
//   庚 要支援2・予定04・休みでない → ⏰
// =====================================================================
const TODAY = '2026-07-28';
const YM = '2026-07';
const KAIGO_USERS = [
  { userId: 'U1', name: 'ダミー甲', furigana: 'ダミーコウ', category: '要介護1', days: '月水', planStart: '', planMonths: null },
  { userId: 'U2', name: 'ダミー乙', furigana: 'ダミーオツ', category: '要介護1', days: '火木', planStart: '2026-06', planMonths: 3 },
  { userId: 'U3', name: 'ダミー丙', furigana: 'ダミーヘイ', category: '要介護1', days: '金', planStart: '2026-07', planMonths: 3 },
  { userId: 'U4', name: 'ダミー丁', furigana: 'ダミーテイ', category: '要介護2', days: '水', planStart: '2026-05', planMonths: 3 }
];
const TSUSHO_USERS = [
  { userId: 'U5', name: 'ダミー戊', furigana: 'ダミーボ', category: '要支援2', cancelled: false },
  { userId: 'U6', name: 'ダミー己', furigana: 'ダミーキ', category: '要支援1', cancelled: false },
  { userId: 'U7', name: 'ダミー庚', furigana: 'ダミーコウシン', category: '要支援2', cancelled: false }
];
const USER_LIST = [
  { userName: 'ダミー甲', userNameKana: 'ダミーコウ', days: '月水', ampm: '午前' },
  { userName: 'ダミー乙', userNameKana: 'ダミーオツ', days: '火木', ampm: '午後' },
  { userName: 'ダミー丙', userNameKana: 'ダミーヘイ', days: '金', ampm: '午前' },
  { userName: 'ダミー丁', userNameKana: 'ダミーテイ', days: '水', ampm: '午前' },
  { userName: 'ダミー戊', userNameKana: 'ダミーボ', days: '月', ampm: '午後' },
  { userName: 'ダミー己', userNameKana: 'ダミーキ', days: '火', ampm: '午後' },
  { userName: 'ダミー庚', userNameKana: 'ダミーコウシン', days: '木', ampm: '午前' }
];
const YOTEI = [
  { userId: 'U1', name: 'ダミー甲', domain: 'sokutei', nextYm: '2026-08', cycleMonths: 3, slideCount: 1, note: '' },
  { userId: 'U2', name: 'ダミー乙', domain: 'sokutei', nextYm: '2026-08', cycleMonths: 3, slideCount: 1, note: '' },
  { userId: 'U3', name: 'ダミー丙', domain: 'sokutei', nextYm: '2026-11', cycleMonths: 3, slideCount: 2, note: '' },
  { userId: 'U4', name: 'ダミー丁', domain: 'sokutei', nextYm: '2026-07', cycleMonths: 3, slideCount: 0, note: '' },
  { userId: 'U5', name: 'ダミー戊', domain: 'sokutei', nextYm: '2026-09', cycleMonths: 4, slideCount: 1, note: '' },
  { userId: 'U6', name: 'ダミー己', domain: 'sokutei', nextYm: '2026-09', cycleMonths: 4, slideCount: 0, note: '' },
  { userId: 'U7', name: 'ダミー庚', domain: 'sokutei', nextYm: '2026-04', cycleMonths: 4, slideCount: 0, note: '' }
];
// 長期休み（board GAS: action=absences の absences.longTerm[]）。
// 乙はわざと全角スペース入りで返す＝normKey で正規化して届くことを実測する。
const LONG_TERM = [
  { name: 'ダミー甲', date: '2026-06-02', resumeDate: '', elapsedDays: 57 },
  { name: 'ダミー　乙', date: '2026-06-10', resumeDate: '', elapsedDays: 49 },
  { name: 'ダミー丙', date: '2026-05-20', resumeDate: '', elapsedDays: 70 },
  { name: 'ダミー戊', date: '2026-06-15', resumeDate: '', elapsedDays: 44 },
  { name: 'ダミー己', date: '2026-06-18', resumeDate: '', elapsedDays: 41 },
  { name: 'ダミー辛', date: '2026-06-01', resumeDate: '', elapsedDays: 58 }   // 台帳に居ない人（増えないこと）
];

let YOTEI_STATE = null;
let SHIEN_ROWS = [];
let ABSENCES_MODE = 'ok';   // 'ok' | 'fail' | 'empty'
const captured = { writes: [] };

function param(url, k) { const m = url.match(new RegExp('[?&]' + k + '=([^&]*)')); return m ? decodeURIComponent(m[1]) : ''; }
function ymAddStub(ym, n) {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const m0 = (m - 1) + n, ny = y + Math.floor(m0 / 12), nm = ((m0 % 12) + 12) % 12 + 1;
  return ny + '-' + (nm < 10 ? '0' : '') + nm;
}

function fetchStub(url) {
  let data;
  if (url.indexOf('action=attendance') >= 0) {
    data = { success: true, attendance: { am: [{ name: 'ダミー丁', care: '要介護2', status: '出席' }], pm: [] } };
  } else if (url.indexOf('action=usage_stats') >= 0) data = { success: true, usageStats: { users: [] } };
  else if (url.indexOf('action=getKeikakushoYear') >= 0) {
    data = url.indexOf('year=2026') >= 0
      ? { ok: true, users: KAIGO_USERS, records: [] }
      : { ok: true, users: [], records: [] };
  } else if (url.indexOf('action=staff_list') >= 0) data = { staff: ['スタッフX', 'スタッフY'] };
  else if (url.indexOf('action=getShienSokutei') >= 0) data = { ok: true, records: SHIEN_ROWS.map(x => Object.assign({}, x)) };
  else if (url.indexOf('action=user_list') >= 0) data = { success: true, user_list: USER_LIST };
  else if (url.indexOf('action=getTsushoPlansYearV2') >= 0) data = { ok: true, users: TSUSHO_USERS };
  else if (url.indexOf('action=getYotei') >= 0) data = { ok: true, domain: 'sokutei', records: YOTEI_STATE.map(y => Object.assign({}, y)) };
  else if (url.indexOf('action=getSokuteiOutput') >= 0) data = { ok: true, domain: 'sokutei', ym: param(url, 'ym'), records: [], legacy: [] };
  else if (url.indexOf('action=absences') >= 0) {
    if (ABSENCES_MODE === 'fail') return Promise.reject(new Error('HTTP 500'));
    data = { success: true, absences: { absences: [], longTerm: ABSENCES_MODE === 'empty' ? [] : LONG_TERM.slice(), resumedToday: [] } };
  } else if (url.indexOf('action=slideYotei') >= 0 || url.indexOf('action=undoSlideYotei') >= 0) {
    captured.writes.push(url);
    const undo = url.indexOf('action=undoSlideYotei') >= 0;
    const row = YOTEI_STATE.find(y => y.userId === param(url, 'userId'));
    row.nextYm = ymAddStub(row.nextYm, undo ? -1 : 1);
    data = { ok: true, row: Object.assign({}, row) };
  } else if (url.indexOf('action=addSokuteiDone') >= 0) {
    captured.writes.push(url);
    const userId = param(url, 'userId'), name = param(url, 'name'), date = param(url, 'date');
    const row = YOTEI_STATE.find(y => y.userId === userId) || YOTEI_STATE[0];
    row.nextYm = ymAddStub(date.slice(0, 7), row.cycleMonths);
    data = {
      ok: true, verified: true,
      log: { name: name, care: param(url, 'care'), sokutei_date: date, sokutei_by: param(url, 'by'), source: 'app' },
      yotei: Object.assign({}, row)
    };
  } else { captured.writes.push(url); data = {}; }
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
    confirm: () => true,
    console: console, Date: FixedDate,
    setTimeout: (fn, ms) => { const id = timers.length; timers.push({ fn, ms, cleared: false }); return id; },
    clearTimeout: (id) => { if (timers[id]) timers[id].cleared = true; },
    encodeURIComponent, decodeURIComponent,
    Math, JSON, Promise, Array, String, Object, Number, Boolean, RegExp, isNaN, parseInt, parseFloat
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  ['sokuteiCycleMonths_', 'sokuteiDueDate_', 'isPlanMonth', 'isHyoukaMonth'].forEach(n => vm.runInContext(extractFn(shared, n), sandbox));
  vm.runInContext(yoteiSrc.replace(/if \(typeof module[\s\S]*$/, ''), sandbox);
  vm.runInContext(measureSrc.replace(/if \(typeof module[\s\S]*$/, ''), sandbox);
  vm.runInContext(script0, sandbox);
  return sandbox;
}
function resetFixtures() {
  YOTEI_STATE = YOTEI.map(y => Object.assign({}, y));
  SHIEN_ROWS = [
    { name: 'ダミー戊', care: '要支援2', sokutei_date: '2026-03-10', sokutei_by: 'スタッフX', source: 'app' },
    { name: 'ダミー己', care: '要支援1', sokutei_date: '2026-05-12', sokutei_by: 'スタッフX', source: 'app' }
  ];
  captured.writes.length = 0;
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
// 💤 セクション（見出しから次の見出しまで）を切り出す
function restingSection(h) {
  const head = '<div class="section-label">💤 長期休み中の人';
  const s = String(h), i = s.indexOf(head);
  if (i < 0) return '';
  const next = s.indexOf('<div class="section-label">', i + head.length);
  return s.slice(i, next < 0 ? s.length : next);
}

(async () => {
  let S, tM;

  // =====================================================================
  // 1. 純関数 lacksDueMeasure: 「期限内の測定が無いか」
  //    要介護は covered と同じ数え方（期限に対して前回測定が周期ぶん以内か）
  //    要支援・期限不明の要介護は「前回測定 ＋ 周期」で見る（B-1）
  // =====================================================================
  sec('1. 純関数 lacksDueMeasure: 一度も測っていない人');
  resetFixtures();
  S = makeSandbox();
  eq(S.lacksDueMeasure({ care: '要介護1', last: '', dueYm: '2026-08', cycleMonths: 3 }, YM), true,
    '★要介護・前回測定なし → 期限内の測定が無い');
  eq(S.lacksDueMeasure({ care: '要介護1', last: '', dueYm: '', cycleMonths: 3 }, YM), true,
    '★要介護・計画月不明かつ前回測定なし → 期限内の測定が無い');
  eq(S.lacksDueMeasure({ care: '要支援2', last: '', dueYm: '', cycleMonths: 4 }, YM), true,
    '要支援・前回測定なし → 期限内の測定が無い');

  sec('2. 純関数 lacksDueMeasure: 要介護は期限（dueYm）に対して数える');
  eq(S.lacksDueMeasure({ care: '要介護1', last: '2026-07-02', dueYm: '2026-08', cycleMonths: 3 }, YM), false,
    '7月に測って期限8月・周期3 → 8月の計画書は7月の測定で書ける＝出さない');
  eq(S.lacksDueMeasure({ care: '要介護1', last: '2026-05-10', dueYm: '2026-09', cycleMonths: 3 }, YM), true,
    '★5月に測って期限9月・周期3 → 9月には使えない＝期限内の測定が無い');
  eq(S.lacksDueMeasure({ care: '要介護1', last: '2026-06-10', dueYm: '2026-08', cycleMonths: 3 }, YM), false,
    '期限の2ヶ月前の測定は周期内（covered と同じ境界）');
  eq(S.lacksDueMeasure({ care: '要介護1', last: '2026-05-10', dueYm: '2026-08', cycleMonths: 3 }, YM), true,
    '★期限の3ヶ月前は周期を外れる（境界の外側）');

  sec('3. 純関数 lacksDueMeasure: 要支援は「前回測定 ＋ 周期」で見る（B-1）');
  eq(S.lacksDueMeasure({ care: '要支援2', last: '2026-03-10', dueYm: '', cycleMonths: 4 }, YM), true,
    '★前回2026-03＋周期4＝2026-07 → 当月が期限＝出す（本番の1名）');
  eq(S.lacksDueMeasure({ care: '要支援1', last: '2026-05-12', dueYm: '', cycleMonths: 4 }, YM), false,
    '★前回2026-05＋周期4＝2026-09 → まだ余裕がある＝出さない（本番の1名）');
  eq(S.lacksDueMeasure({ care: '要支援1', last: '2026-02-01', dueYm: '', cycleMonths: 4 }, YM), true,
    '前回2026-02＋周期4＝2026-06 → とっくに期限切れ＝出す');
  eq(S.lacksDueMeasure({ care: '要介護1', last: '2026-03-01', dueYm: '', cycleMonths: 3 }, YM), true,
    '計画月不明の要介護も同じ数え方に倒す（判断材料が前回測定しか無いため）');
  eq(S.lacksDueMeasure({ care: '要支援2', last: '2026-05-12', dueYm: '' }, YM), false,
    '周期が空なら既定3ヶ月（2026-08）→ まだ期限内');

  sec('4. 純関数 lacksDueMeasure: 壊れた入力で落ちない');
  eq(S.lacksDueMeasure(null, YM), true, 'null でも例外にしない（測っていない扱い）');
  eq(S.lacksDueMeasure({ care: '要支援2', last: '2026-03-10', cycleMonths: 4 }, ''), true, '当月が空でも落ちない');
  eq(S.lacksDueMeasure({ care: '要支援2', last: 'こわれた日付', cycleMonths: 4 }, YM), true, '日付が壊れていても落ちない');

  // =====================================================================
  // 2. 純関数 splitMonthRows: 💤 の集合（A-1・二重表示の防止）
  // =====================================================================
  sec('5. splitMonthRows: 💤 は予定月に関係なく出す／📋・赤の人は外す（A-1）');
  const rest1 = { userId: 'R1', name: '休み甲', care: '要介護1', nextYm: '2026-08', dueYm: '', last: '', cycleMonths: 3, onLongLeave: { startDate: '2026-06-02', elapsedDays: 57 } };
  const rest2 = { userId: 'R2', name: '休み乙', care: '要介護1', nextYm: '2026-08', dueYm: '2026-08', last: '', cycleMonths: 3, onLongLeave: { startDate: '2026-06-10', elapsedDays: 49 } };
  const late = { userId: 'R3', name: '休み丙', care: '要介護1', nextYm: '2026-11', dueYm: '2026-09', last: '', cycleMonths: 3, onLongLeave: { startDate: '2026-05-20', elapsedDays: 70 } };
  const red = { userId: 'R4', name: '休み庚', care: '要介護1', nextYm: '2026-06', dueYm: '2026-01', last: '', cycleMonths: 3, onLongLeave: { startDate: '2026-05-01', elapsedDays: 88 } };
  const shienOld = { userId: 'R5', name: '休み戊', care: '要支援2', nextYm: '2026-09', dueYm: '', last: '2026-03-10', cycleMonths: 4, onLongLeave: { startDate: '2026-06-15', elapsedDays: 44 } };
  const shienNew = { userId: 'R6', name: '休み己', care: '要支援1', nextYm: '2026-09', dueYm: '', last: '2026-05-12', cycleMonths: 4, onLongLeave: { startDate: '2026-06-18', elapsedDays: 41 } };
  const normal = { userId: 'R7', name: '通所丁', care: '要介護2', nextYm: '2026-07', dueYm: '2026-07', last: '', cycleMonths: 3, onLongLeave: null };
  const overdue = { userId: 'R8', name: '通所庚', care: '要支援2', nextYm: '2026-04', dueYm: '', last: '', cycleMonths: 4, onLongLeave: null };
  const ALL = [rest1, rest2, late, red, shienOld, shienNew, normal, overdue];
  const POOL = [late, red, normal, overdue];   // 予定月が当月以前 or 警告あり＝いまの pool 相当
  const sp = S.splitMonthRows(POOL, YM, ALL);
  eq(sp.restingRows.map(r => r.name), ['休み甲', '休み乙', '休み戊'],
    '★💤＝長期休み中で期限内の測定が無い人（予定月が未来でも出す）');
  eq(sp.restingRows.map(r => r.name).indexOf('休み丙') < 0, true, '★📋 の人は 💤 に出さない（A-1）');
  eq(sp.restingRows.map(r => r.name).indexOf('休み庚') < 0, true, '★赤の人も 💤 に出さない（A-1と同じ理由）');
  eq(sp.restingRows.map(r => r.name).indexOf('休み己') < 0, true, '★要支援でも周期内に測っていれば出さない（B-1）');
  eq(sp.lateRows.map(r => r.name), ['休み丙'], '📋 は従来どおり（枠は分けない）');
  eq(sp.gapRows.map(r => r.name), ['休み庚'], '赤も従来どおり');
  eq(sp.overdueRows.map(r => r.name), ['通所庚'], '★⏰ は変わらない（休みでない超過の人だけ）');
  eq(sp.restingCards.map(r => r.name), ['休み甲', '休み乙', '休み戊'],
    '★pool の外の人はカードを新たに作る（この画面に居ないから測れない、を潰す）');

  sec('6. splitMonthRows: 既に一覧に並んでいる人はカードを二重に作らない');
  const restOverdue = { userId: 'R9', name: '休み壬', care: '要支援2', nextYm: '2026-05', dueYm: '', last: '', cycleMonths: 4, onLongLeave: { startDate: '2026-06-02', elapsedDays: 57 } };
  const sp2 = S.splitMonthRows([restOverdue, normal], YM, [restOverdue, normal, rest1]);
  eq(sp2.restingRows.map(r => r.name), ['休み壬', '休み甲'], '💤 の人数には両方数える');
  eq(sp2.restingCards.map(r => r.name), ['休み甲'], '★カードを作るのは一覧に居ない人だけ（二重表示しない）');
  eq(sp2.overdueRows.map(r => r.name), [], '休み中の人は ⏰ には出さない（従来どおり）');

  sec('7. splitMonthRows: 長期休みが0名／既存の呼び出し（2引数）を壊さない');
  eq(S.splitMonthRows([normal, overdue], YM, [normal, overdue, rest1].map(r => Object.assign({}, r, { onLongLeave: null }))).restingRows.length, 0,
    'absences が空＝💤 0名');
  const sp3 = S.splitMonthRows([normal, overdue], YM);
  eq(sp3.overdueRows.map(r => r.name), ['通所庚'], '★第3引数を省いても従来どおり動く（既存の呼び出しを壊さない）');
  eq(sp3.restingRows.length, 0, '母集団を渡さなければ 💤 は rows の中だけで数える');

  // =====================================================================
  // 3. 画面（本番の顔ぶれを写したフィクスチャ）
  // =====================================================================
  sec('8. 画面: 💤 は3名（本番実測と同じ内訳）／対象人数は据え置き');
  ABSENCES_MODE = 'ok'; resetFixtures();
  S = makeSandbox();
  await S.load();
  tM = els['tab4'].innerHTML;
  ok(tM.indexOf('7月の対象 3名') >= 0, '★ヘッダの対象は 💤 を混ぜない（丙・丁・庚の3名のまま）');
  ok(tM.indexOf('💤 来所がなく測れていません（3名）') >= 0, '★💤 は3名（甲・乙・戊）');
  ok(tM.indexOf('💤 長期休み中の人（3名）') >= 0, '★💤 専用のセクションが出る');
  const rs = restingSection(tM);
  ok(has(rs, 'ダミー甲'), '甲（計画月不明・前回測定なし）が 💤 に出る');
  ok(has(rs, 'ダミー乙'), '★乙（氏名に全角スペース）も normKey で一致して 💤 に出る');
  ok(has(rs, 'ダミー戊'), '戊（要支援・前回2026-03＋周期4＝期限切れ）が 💤 に出る');
  eq(has(rs, 'ダミー丙'), false, '★丙は 📋 に出ているので 💤 には出さない（A-1）');
  eq(has(rs, 'ダミー己'), false, '★己は周期内に測っているので出さない（B-1）');
  eq(has(tM, 'ダミー己'), false, '己はこの画面のどこにも出ない（対象でもない）');
  eq(tM.indexOf('ダミー辛') >= 0, false, '台帳に居ない長期休みの人は増えない');

  sec('9. 画面: ⏰ と 📋 は変わらない');
  ok(tM.indexOf('⏰ 予定月を過ぎています（1名）') >= 0, '⏰ は庚の1名だけ（休み中の人は入らない）');
  ok(tM.indexOf('📋 計画に間に合いません（1名）') >= 0, '📋 は丙の1名');
  ok(tM.indexOf('1名は長期休み中です') >= 0, '📋 の休み中の人には印を添える（枠は分けない）');
  ok(cardOf(tM, 'ダミー丙').indexOf('💤 休み中') >= 0, '丙のカードには「💤 休み中」のバッジが付く');
  eq(tM.indexOf('gap-head') >= 0, false, '赤（1回分まるごと飛ばし）は0名のまま');

  sec('10. 画面: 💤 のカードから 📝測定した が押せる（これが目的そのもの）');
  ok(cardOf(rs, 'ダミー甲').indexOf('📝測定した') >= 0, '★甲のカードに記録ボタンがある');
  ok(cardOf(rs, 'ダミー戊').indexOf('📝測定した') >= 0, '★戊のカードにも記録ボタンがある');
  ok(cardOf(rs, 'ダミー甲').indexOf('openRecordModal(this.dataset.name)') >= 0, '記録モーダルへ配線されている');
  ok(cardOf(rs, 'ダミー甲').indexOf('💤 休み中（57日）') >= 0, '休み中であることと日数がカードに出る');
  ok(cardOf(rs, 'ダミー甲').indexOf('今月の来所予定なし（休み中）') >= 0, '休み中は「今月あと約◯回」を出さない（既存の約束）');

  sec('11. 操作: 💤 の人を測ると 💤 から外れ、今月の対象に入る');
  S.openRecordModal('ダミー甲');
  elFor('recordStaffSelect').value = 'スタッフX';
  elFor('recordDate').value = TODAY;
  await S.submitRecord();
  const url = captured.writes.find(u => u.indexOf('action=addSokuteiDone') >= 0) || '';
  ok(url.indexOf('name=' + encodeURIComponent('ダミー甲')) >= 0, '★addSokuteiDone が甲の名前で送られる');
  ok(url.indexOf('by=' + encodeURIComponent('スタッフX')) >= 0, '測定者も送られる（測定だけ毎回選ぶ）');
  tM = els['tab4'].innerHTML;
  ok(tM.indexOf('💤 来所がなく測れていません（2名）') >= 0, '★測った人は 💤 から外れる（3名→2名）');
  ok(tM.indexOf('7月の対象 4名') >= 0, '★測った人は今月の実績として対象に入る（3名→4名）');
  eq(has(restingSection(tM), 'ダミー甲'), false, '甲は 💤 セクションから消える');
  ok(has(tM, 'ダミー甲'), '甲は「出力が残っている人」として一覧に残る（消えると忘れる）');

  sec('12. 画面: absences が落ちても 💤 0名で画面は壊れない');
  ABSENCES_MODE = 'fail'; resetFixtures();
  S = makeSandbox();
  await S.load();
  tM = els['tab4'].innerHTML;
  eq(tM.indexOf('💤') >= 0, false, '★💤 は1つも出ない（休み中0名として扱う）');
  ok(tM.indexOf('7月の対象 3名') >= 0, '対象人数は変わらない');
  ok(tM.indexOf('⏰ 予定月を過ぎています（1名）') >= 0, '⏰ は従来どおり出る');
  ok(has(tM, 'ダミー丙') && has(tM, 'ダミー丁') && has(tM, 'ダミー庚'), '一覧も従来どおり描ける');
  eq(els['errbar'].innerHTML.indexOf('absences') >= 0, false, '上部の赤いエラーバーには出さない（測定業務は止めない）');

  sec('13. 画面: longTerm が空でも壊れない');
  ABSENCES_MODE = 'empty'; resetFixtures();
  S = makeSandbox();
  await S.load();
  tM = els['tab4'].innerHTML;
  eq(tM.indexOf('💤') >= 0, false, '長期休み0名＝💤 の枠もセクションも出さない');
  ok(tM.indexOf('7月の対象 3名') >= 0, '対象人数は変わらない');

  sec('14. 回帰: 判定式（planGapCheck / planGapLevel / covered）に手を入れていない');
  ABSENCES_MODE = 'ok'; resetFixtures();
  S = makeSandbox();
  await S.load();
  eq(S.planGapCheck({ isKaigo: true, dueYm: '2026-09', lastYm: '2026-07', cycleMonths: 3, chosenYm: '2026-11' }).kind, 'covered',
    'covered の判定は従来どおり');
  eq(S.planGapCheck({ isKaigo: true, dueYm: '2026-09', lastYm: '', cycleMonths: 3, chosenYm: '2026-11' }).kind, 'gap', 'gap の判定は従来どおり');
  eq(S.planGapCheck({ isKaigo: false, dueYm: '', lastYm: '', cycleMonths: 4, chosenYm: '2026-11' }).kind, 'notKaigo', '要支援は従来どおり対象外');
  eq(S.planGapLevel({ care: '要介護1', nextYm: '2026-12', dueYm: '2026-09', last: '', cycleMonths: 3 }, '2026-12', YM), 'red', '赤の境界は従来どおり');
  eq(S.planGapLevel({ care: '要介護1', nextYm: '2026-11', dueYm: '2026-09', last: '', cycleMonths: 3 }, '2026-11', YM), 'late', 'オレンジの境界も従来どおり');
  ok(els['tab1'].innerHTML.length > 0 && els['tab2'].innerHTML.length > 0 && els['tab3'].innerHTML.length > 0, '他の3タブも従来どおり描画される');

  console.log('\n=== 結果 ===');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
