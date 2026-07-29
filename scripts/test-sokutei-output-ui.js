// test-sokutei-output-ui.js
// 測定管理（sokutei.html）の「出力2チェック」と「予定月超過のオレンジ枠」の検証。
//
// 実態（社長 2026-07-29）: 結果報告書はリハブで作る。測定値を入れた時点で報告書はできあがるので
//   「作成」という作業は無い。残るのは 🖨 利用者用（プリント）と 📄 ケアマネ用（PDF出力）の2つだけ。
//   両方が済んで初めて完了。片方でも残っていたら「やり残し」＝一覧から消さない（消えると忘れる）。
//
// sokutei.html の <script> の実バイトを読み込み、DOM と fetch を偽物にして描画結果を読む
//   （純関数を写したテストではない）。
// 実行: node scripts/test-sokutei-output-ui.js

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

// =====================================================================
// 固定データ（すべてダミー名）。TODAY = 2026-07-28（当月 2026-07）
// =====================================================================
const TODAY = '2026-07-28';
const YM = '2026-07';
// planStart=2026-01 / planMonths=3 → 計画月は 1/4/7/10 月 → 当月以降の最初は 2026-07（＝当月）
const KAIGO_USERS = [
  // 測定未。予定月が当月ちょうど＝オレンジ（超過）には入らない
  { userId: 'U1', name: 'ダミー甲', furigana: 'ダミーコウ', category: '要介護2', days: '月水', planStart: '2026-01', planMonths: 3 },
  // 今月測定済・出力は2つとも未 → 「出力残」
  { userId: 'U2', name: 'ダミー乙', furigana: 'ダミーオツ', category: '要介護1', days: '火木', planStart: '2026-01', planMonths: 3 },
  // 今月測定済・「測定出力」シートに両方済 → 「完了」
  { userId: 'U3', name: 'ダミー丙', furigana: 'ダミーヘイ', category: '要介護1', days: '金', planStart: '2026-01', planMonths: 3 },
  // 今月測定済・個訓15列目 output_by あり（legacy）→ 初期表示から「完了」
  { userId: 'U4', name: 'ダミー丁', furigana: 'ダミーテイ', category: '要介護3', days: '水', planStart: '2026-01', planMonths: 3 }
];
const TSUSHO_USERS = [
  // 要支援・測定未。予定月が 2026-04 のまま止まっている ＝ オレンジ（超過）
  { userId: 'U5', name: 'ダミー戊', furigana: 'ダミーボ', category: '要支援2', cancelled: false }
];
const USER_LIST = [
  { userName: 'ダミー甲', userNameKana: 'ダミーコウ', days: '月水', ampm: '午前' },
  { userName: 'ダミー乙', userNameKana: 'ダミーオツ', days: '火木', ampm: '午後' },
  { userName: 'ダミー丙', userNameKana: 'ダミーヘイ', days: '金', ampm: '午前' },
  { userName: 'ダミー丁', userNameKana: 'ダミーテイ', days: '水', ampm: '午前' },
  { userName: 'ダミー戊', userNameKana: 'ダミーボ', days: '月', ampm: '午後' }
];
const YOTEI = [
  { userId: 'U1', name: 'ダミー甲', domain: 'sokutei', nextYm: '2026-07', cycleMonths: 3, slideCount: 0, note: '' },
  { userId: 'U2', name: 'ダミー乙', domain: 'sokutei', nextYm: '2026-10', cycleMonths: 3, slideCount: 0, note: '' },
  { userId: 'U3', name: 'ダミー丙', domain: 'sokutei', nextYm: '2026-10', cycleMonths: 3, slideCount: 0, note: '' },
  { userId: 'U4', name: 'ダミー丁', domain: 'sokutei', nextYm: '2026-10', cycleMonths: 3, slideCount: 0, note: '' },
  { userId: 'U5', name: 'ダミー戊', domain: 'sokutei', nextYm: '2026-04', cycleMonths: 4, slideCount: 0, note: '' }
];
// 個訓15列目 output_by の既存実績（GAS が legacy として返すぶん）。丁だけ。
const LEGACY = [
  { userId: 'U4', name: 'ダミー丁', ym: '2026-07', by: 'スタッフA', sokutei_date: '2026-07-12' }
];

let YOTEI_STATE = null;
let KAIGO_RECORDS = [];
let SHIEN_ROWS = [];
let OUTPUT_ROWS = [];
let ALL_MEASURED = false;
const captured = { writes: [] };

function param(url, k) { const m = url.match(new RegExp('[?&]' + k + '=([^&]*)')); return m ? decodeURIComponent(m[1]) : ''; }
function ymAddStub(ym, n) {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const m0 = (m - 1) + n, ny = y + Math.floor(m0 / 12), nm = ((m0 % 12) + 12) % 12 + 1;
  return ny + '-' + (nm < 10 ? '0' : '') + nm;
}

// GAS 側 writeSokuteiOutput_ と同じ規約でふるまう偽サーバ（legacy の引き継ぎも同じ）
function fakeSetOutput(url) {
  const userId = param(url, 'userId'), name = param(url, 'name'), domain = param(url, 'domain');
  const ym = param(url, 'ym'), kind = param(url, 'kind'), done = param(url, 'done') === 'true';
  const by = param(url, 'by');
  if (['riyousha', 'caremgr'].indexOf(kind) < 0) return { ok: false, error: 'invalid kind' };
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: 'invalid ym' };
  let row = OUTPUT_ROWS.find(x => x.userId === userId && x.domain === domain && x.ym === ym);
  if (!row) {
    row = { userId: userId, name: name, domain: domain, ym: ym, riyousha_at: '', riyousha_by: '', caremgr_at: '', caremgr_by: '', updatedAt: '', note: '' };
    const leg = LEGACY.find(x => x.userId === userId && x.ym === ym);
    if (leg && domain === 'sokutei') {   // 新規行は legacy を引き継ぐ（片方押しでもう片方を落とさない）
      row.riyousha_at = leg.sokutei_date; row.riyousha_by = leg.by;
      row.caremgr_at = leg.sokutei_date; row.caremgr_by = leg.by;
      row.note = '個訓15列目の出力者を引き継ぎ';
    }
    OUTPUT_ROWS.push(row);
  }
  row[kind + '_at'] = done ? (TODAY + ' 09:00:00') : '';
  row[kind + '_by'] = done ? by : '';
  row.updatedAt = TODAY + ' 09:00:00';
  return { ok: true, row: Object.assign({}, row) };
}

function fetchStub(url) {
  let data;
  if (url.indexOf('action=attendance') >= 0) {
    data = { success: true, attendance: { am: [{ name: 'ダミー甲', care: '要介護2', status: '出席' }], pm: [] } };
  } else if (url.indexOf('action=usage_stats') >= 0) data = { success: true, usageStats: { users: [] } };
  else if (url.indexOf('action=getKeikakushoYear') >= 0) {
    data = url.indexOf('year=2026') >= 0
      ? { ok: true, users: KAIGO_USERS, records: KAIGO_RECORDS }
      : { ok: true, users: [], records: [] };
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
  }
  else if (url.indexOf('action=getSokuteiOutput') >= 0) {
    data = { ok: true, domain: 'sokutei', ym: param(url, 'ym'), records: OUTPUT_ROWS.map(x => Object.assign({}, x)), legacy: LEGACY.slice() };
  } else if (url.indexOf('action=setSokuteiOutput') >= 0) {
    captured.writes.push(url);
    data = fakeSetOutput(url);
  } else if (url.indexOf('action=addSokuteiDone') >= 0) {
    captured.writes.push(url);
    data = { ok: true, verified: true, log: {}, yotei: YOTEI_STATE[0] };
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
  // 今月の測定実績: 乙(7/10) 丙(7/11) 丁(7/12)。ALL_MEASURED なら甲・戊も測った状態にする
  KAIGO_RECORDS = [
    { userId: 'U2', name: 'ダミー乙', sokutei_date: '2026-07-10', sokutei_by: 'スタッフX' },
    { userId: 'U3', name: 'ダミー丙', sokutei_date: '2026-07-11', sokutei_by: 'スタッフX' },
    { userId: 'U4', name: 'ダミー丁', sokutei_date: '2026-07-12', sokutei_by: 'スタッフA' }
  ];
  SHIEN_ROWS = [];
  if (ALL_MEASURED) {
    KAIGO_RECORDS.push({ userId: 'U1', name: 'ダミー甲', sokutei_date: '2026-07-05', sokutei_by: 'スタッフX' });
    SHIEN_ROWS.push({ name: 'ダミー戊', care: '要支援2', sokutei_date: '2026-07-06', sokutei_by: 'スタッフX', source: 'app' });
  }
  // 丙は「測定出力」シートに両方済で入っている（丁は legacy 側で済）
  OUTPUT_ROWS = [
    { userId: 'U3', name: 'ダミー丙', domain: 'sokutei', ym: YM, riyousha_at: '2026-07-11 10:00:00', riyousha_by: 'スタッフX', caremgr_at: '2026-07-11 10:01:00', caremgr_by: 'スタッフX', updatedAt: '2026-07-11 10:01:00', note: '' }
  ];
  captured.writes.length = 0;
  Object.keys(els).forEach(k => delete els[k]);
  timers.length = 0;
  // 2026-07-30: 書き込みには操作者の選択が要る（B案 requireOperator）。
  // 現場が最初に自分を選ぶのと同じ前提をここで作る。未選択の挙動は
  // scripts/test-sokutei-operator-gate.js が受け持つ。
  elFor('recordStaffSelect').value = 'スタッフY';
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
  sec('純関数 outputStatusFrom: 「測定出力」シートが正・行が無ければ個訓15列目を見る');
  ALL_MEASURED = false; resetFixtures();
  S = makeSandbox();
  const OUT = {
    rows: [{ userId: 'U3', name: 'ダミー丙', domain: 'sokutei', ym: '2026-07', riyousha_at: '2026-07-11 10:00:00', riyousha_by: 'スタッフX', caremgr_at: '', caremgr_by: '' }],
    legacy: [{ userId: 'U4', name: 'ダミー丁', ym: '2026-07', by: 'スタッフA', sokutei_date: '2026-07-12' }]
  };
  let s1 = S.outputStatusFrom(OUT, 'U3', 'ダミー丙', '2026-07');
  eq({ r: s1.riyousha.done, c: s1.caremgr.done, src: s1.source }, { r: true, c: false, src: 'sheet' },
    'シートに行があればそれが正（🖨だけ済）');
  let s2 = S.outputStatusFrom(OUT, 'U4', 'ダミー丁', '2026-07');
  eq({ r: s2.riyousha.done, c: s2.caremgr.done, src: s2.source }, { r: true, c: true, src: 'legacy' },
    '★行が無い人は個訓15列目の実績（legacy）を初期表示に反映＝🖨📄とも済');
  eq(s2.riyousha.by, 'スタッフA', 'legacy の出力者も拾う');
  let s3 = S.outputStatusFrom(OUT, 'U9', 'ダミー未', '2026-07');
  eq({ r: s3.riyousha.done, c: s3.caremgr.done, src: s3.source }, { r: false, c: false, src: 'none' }, 'どちらにも無ければ両方未');
  let s4 = S.outputStatusFrom(OUT, 'U3', 'ダミー丙', '2026-10');
  eq({ r: s4.riyousha.done, src: s4.source }, { r: false, src: 'none' },
    '★測定年月が違えば別物＝前回のチェックを引き継がない');
  eq(S.outputStatusFrom(OUT, 'U3', 'ダミー丙', '').source, 'none', '測定年月が無い（まだ測っていない）なら none');
  eq(S.outputStatusFrom(null, 'U3', 'ダミー丙', '2026-07').source, 'none', '取得失敗（null）でも落ちない＝全部未で描く');

  sec('純関数 outputStage / countOutputStages: 3段階（測定未・出力残・完了）');
  const mk = (userId, name, doneDate) => ({ userId: userId, name: name, doneThisMonth: doneDate ? { date: doneDate, by: 'スタッフX' } : null });
  eq(S.outputStage(mk('U1', 'ダミー甲', ''), OUT), 'unmeasured', 'まだ測っていない＝測定未');
  eq(S.outputStage(mk('U3', 'ダミー丙', '2026-07-11'), OUT), 'pending', '★片方だけ済＝出力残（完了ではない）');
  eq(S.outputStage(mk('U4', 'ダミー丁', '2026-07-12'), OUT), 'complete', '両方済＝完了');
  eq(S.outputStage(mk('U9', 'ダミー未', '2026-07-20'), OUT), 'pending', '測ったばかりで出力ゼロ＝出力残');
  eq(S.countOutputStages([
    mk('U1', 'ダミー甲', ''), mk('U3', 'ダミー丙', '2026-07-11'), mk('U4', 'ダミー丁', '2026-07-12'), mk('U9', 'ダミー未', '2026-07-20')
  ], OUT), { total: 4, complete: 1, pending: 2, unmeasured: 1 }, 'ヘッダ用の件数が3段階で数えられる');

  sec('純関数 isOverdueYm / overdueBreakdown: 判定は「予定月 < 当月」');
  eq(S.isOverdueYm('2026-06', '2026-07'), true, '先月のまま＝超過');
  eq(S.isOverdueYm('2026-07', '2026-07'), false, '★当月ちょうどは対象外');
  eq(S.isOverdueYm('2026-08', '2026-07'), false, '来月は対象外');
  eq(S.isOverdueYm('2025-12', '2026-01'), true, '★年跨ぎでも正しい');
  eq(S.isOverdueYm('', '2026-07'), false, '予定月が空なら対象外（未設定は別問題）');
  eq(S.isOverdueYm('2026-6', '2026-07'), false, '形式が違うものは拾わない');
  eq(S.overdueBreakdown([{ nextYm: '2026-04' }, { nextYm: '2026-06' }, { nextYm: '2026-06' }]),
    '4月 1名 ／ 6月 2名', '★内訳を月ごとに出す（本番実測と同じ並び）');

  sec('純関数 splitMonthRows: 赤（gap）とオレンジ（超過）で二重表示しない');
  // 赤にも超過にも当てはまる合成行を作る（実データでは同時に起きにくいが、起きても赤だけに出す）
  // dueYm = 測定の期限（判定に使う）／planYm = 計画期間の開始月（表示用）。2026-07-29 に分離した。
  // 赤＝予定月が期限を周期(3ヶ月)ぶん以上越えている人。かつ予定月も当月より前＝オレンジにも当たる合成行
  const both = { userId: 'U8', name: 'ダミー庚', care: '要介護1', nextYm: '2026-06', planYm: '2026-02', dueYm: '2026-01', last: '', cycleMonths: 3 };
  const onlyOver = { userId: 'U5', name: 'ダミー戊', care: '要支援2', nextYm: '2026-04', planYm: '', dueYm: '', last: '', cycleMonths: 4 };
  const normal = { userId: 'U1', name: 'ダミー甲', care: '要介護2', nextYm: '2026-07', planYm: '2026-08', dueYm: '2026-07', last: '', cycleMonths: 3 };
  const sp = S.splitMonthRows([both, onlyOver, normal], '2026-07');
  eq(sp.gapRows.map(r => r.name), ['ダミー庚'], '前提: 庚は赤（期限2026-01に対し予定月2026-06＝5ヶ月＝1周期以上先送り）');
  eq(S.isOverdueYm(both.nextYm, '2026-07'), true, '前提: 庚は予定月も過ぎている');
  eq(sp.overdueRows.map(r => r.name), ['ダミー戊'], '★赤に出た庚はオレンジに出さない（二重表示しない）');
  eq(sp.rest.map(r => r.name), ['ダミー戊', 'ダミー甲'], '残りは赤を除いた集合');

  sec('★C-2: 赤は「期限を過ぎた人」だけ。まだ戻せる遅れはオレンジ（丙・赤を増やさない）');
  // 期限がまだ先（9月）なのに予定月が10月＝計画に間に合わないが、戻せば間に合う
  const late = { userId: 'U7', name: 'ダミー辛', care: '要介護1', nextYm: '2026-10', planYm: '2026-10', dueYm: '2026-09', last: '', cycleMonths: 3 };
  eq(S.planGapLevel(late, late.nextYm, '2026-07'), 'late', '★1ヶ月超過はまだ戻せる＝late（オレンジ）');
  eq(S.planGapLevel(both, both.nextYm, '2026-07'), 'red', '★1回分まるごと飛ばしている人だけ red（赤）');
  eq(S.planGapLevel({ care: '要介護1', nextYm: '2026-11', dueYm: '2026-09', last: '', cycleMonths: 3 }, '2026-11', '2026-07'),
    'late', '2ヶ月超過（1周期未満）はまだオレンジ');
  eq(S.planGapLevel({ care: '要介護1', nextYm: '2026-12', dueYm: '2026-09', last: '', cycleMonths: 3 }, '2026-12', '2026-07'),
    'red', '★3ヶ月超過（ちょうど1周期）から赤');
  eq(S.planGapLevel(normal, normal.nextYm, '2026-07'), '', '間に合っている人は警告なし');
  eq(S.planGapLevel(onlyOver, onlyOver.nextYm, '2026-07'), '', '要支援は計画書が無いので警告なし');
  const sp2 = S.splitMonthRows([both, late, onlyOver, normal], '2026-07');
  eq(sp2.gapRows.map(r => r.name), ['ダミー庚'], '赤は1名だけ');
  eq(sp2.lateRows.map(r => r.name), ['ダミー辛'], '★オレンジの2行目に回る');
  eq(sp2.overdueRows.map(r => r.name), ['ダミー戊'], 'オレンジ1行目（予定月超過）とは別の集合');
  eq(sp2.rest.map(r => r.name), ['ダミー辛', 'ダミー戊', 'ダミー甲'], '★late の人は一覧に残る（消さない）');
  eq(S.lateBreakdown([late, { dueYm: '2026-09' }, { dueYm: '2026-10' }]), '9月 2名 ／ 10月 1名',
    '内訳は期限の月ごとに出す');

  // =====================================================================
  sec('画面: ヘッダは「対象／完了／出力残／測定未」で数え、意味の説明を1行出す');
  ALL_MEASURED = false; resetFixtures();
  S = makeSandbox();
  await S.load();
  tM = els['tab4'].innerHTML;
  ok(tM.indexOf('7月の対象 5名') >= 0, '対象5名（測定未2＋測定済3）');
  ok(tM.indexOf('完了 2・出力残 1・測定未 2') >= 0,
    '★完了2（丙＝シート済・丁＝個訓15列目の実績）／出力残1（乙）／測定未2（甲・戊）');
  ok(tM.indexOf('「完了」＝測定と2つの出力') >= 0, '各語の意味を画面に1行で出している（3-5）');
  ok(tM.indexOf('🖨利用者用') >= 0 && tM.indexOf('📄ケアマネ用') >= 0, '2つの出力が何かを書いている');
  ok(tM.indexOf('送付管理アプリ') >= 0, '★ケアマネへ送る作業は送付管理アプリの担当だと書いてある');
  eq(tM.indexOf('／済 ') >= 0, false, '旧ヘッダ（済／未）は残っていない');

  sec('画面: 3段階のセクションが出る／出力残の人は一覧から消えない');
  ok(tM.indexOf('🟡 まだの人（測定未 2名）') >= 0, '測定未のセクション');
  ok(tM.indexOf('🖨 出力が残っている人（1名）') >= 0, '★出力残のセクション');
  ok(tM.indexOf('✅ 完了（2名）') >= 0, '完了のセクション');
  ok(has(tM, 'ダミー乙'), '★測定済でも出力が残っている人は一覧に残る（3-4）');
  ok(cardOf(tM, 'ダミー乙').indexOf('out-pending') >= 0, '★「🖨📄 出力残」のバッジが付く');
  ok(cardOf(tM, 'ダミー乙').indexOf('pendingrow') >= 0, '行そのものも沈ませない（グレーに埋もれさせない）');
  eq(cardOf(tM, 'ダミー丙').indexOf('out-pending') >= 0, false, '完了の人にはバッジを出さない');
  ok(css.indexOf('.out-pending') >= 0 && css.indexOf('.overdue-head') >= 0, 'CSS が定義されている');

  sec('画面: 🖨 と 📄 のボタンが済／未で出る（測定した人にだけ）');
  ok(cardOf(tM, 'ダミー乙').indexOf('🖨 利用者用 未') >= 0, '乙の🖨は未');
  ok(cardOf(tM, 'ダミー乙').indexOf('📄 ケアマネ用 未') >= 0, '乙の📄は未');
  ok(cardOf(tM, 'ダミー丙').indexOf('🖨 利用者用 済') >= 0, '丙の🖨は済');
  ok(cardOf(tM, 'ダミー丙').indexOf('📄 ケアマネ用 済') >= 0, '丙の📄は済');
  eq(cardOf(tM, 'ダミー甲').indexOf('out-btn') >= 0, false,
    '★まだ測っていない人には出力ボタンを出さない（出力という作業がまだ存在しない）');
  ok(cardOf(tM, 'ダミー乙').indexOf('toggleOutput(this.dataset.name, this.dataset.kind)') >= 0, 'トグルの入口が配線されている');

  sec('画面: 個訓15列目の既存実績が初期表示に反映されている（乙=A）');
  ok(cardOf(tM, 'ダミー丁').indexOf('🖨 利用者用 済') >= 0, '★丁は「測定出力」シートに行が無いが済で出る');
  ok(cardOf(tM, 'ダミー丁').indexOf('📄 ケアマネ用 済') >= 0, '📄も済');
  ok(cardOf(tM, 'ダミー丁').indexOf('旧アプリの記録') >= 0, '★どこから来た済なのかが画面で分かる');
  ok(cardOf(tM, 'ダミー丁').indexOf('スタッフA') >= 0, '旧アプリの出力者を出す');

  sec('画面: 出力残があるうちは「今月ぶん完了 ✅」を出さない（3-6）');
  eq(tM.indexOf('今月ぶん完了 ✅') >= 0, false, '測定未2・出力残1 なので出ない');

  sec('画面: 予定月を過ぎている人のオレンジ枠（4）＋「計画に間に合いません」の別行（C-2）');
  ok(tM.indexOf('⏰ 予定月を過ぎています（1名）') >= 0, '★オレンジ枠が出る');
  eq(tM.indexOf('📋 計画に間に合いません') >= 0, false,
    'このフィクスチャには「間に合わない人」がいないので2行目は出ない（無い枠を出さない）');
  ok(tM.indexOf('overdue-head') >= 0, 'オレンジのスタイルを使っている');
  ok(tM.indexOf('4月 1名') >= 0, '内訳を月ごとに出す');
  eq(tM.indexOf('gap-head') >= 0, false, '前提: この場面では赤（計画書に間に合わない）は出ていない');
  ok(has(tM, 'ダミー戊'), '超過の人は下の一覧にも並んでいる（枠は入口・行は消さない）');
  eq(tM.indexOf('⏰ 予定月を過ぎています（2名）') >= 0, false, '★当月ちょうどの甲は数に入らない');

  // =====================================================================
  sec('操作: 🖨 と 📄 は独立して切り替わり、取り消しもできる');
  ALL_MEASURED = false; resetFixtures();
  S = makeSandbox();
  await S.load();
  await S.toggleOutput('ダミー乙', 'riyousha');
  tM = els['tab4'].innerHTML;
  ok(cardOf(tM, 'ダミー乙').indexOf('🖨 利用者用 済') >= 0, '🖨が済になる');
  ok(cardOf(tM, 'ダミー乙').indexOf('📄 ケアマネ用 未') >= 0, '★📄は未のまま（片方だけ動く）');
  ok(tM.indexOf('完了 2・出力残 1・測定未 2') >= 0, '片方だけではまだ「出力残」のまま');
  ok(has(tM, 'ダミー乙'), '押しても一覧から消えない');
  await S.toggleOutput('ダミー乙', 'caremgr');
  tM = els['tab4'].innerHTML;
  ok(cardOf(tM, 'ダミー乙').indexOf('📄 ケアマネ用 済') >= 0, '📄も済になる');
  ok(tM.indexOf('完了 3・出力残 0・測定未 2') >= 0, '★両方済んで「完了」に移る');
  ok(tM.indexOf('✅ 完了（3名）') >= 0, '完了セクションへ移動する');
  eq(cardOf(tM, 'ダミー乙').indexOf('out-pending') >= 0, false, '出力残バッジが消える');
  await S.toggleOutput('ダミー乙', 'riyousha');
  tM = els['tab4'].innerHTML;
  ok(cardOf(tM, 'ダミー乙').indexOf('🖨 利用者用 未') >= 0, '★もう一度押すと未に戻せる（取り消し）');
  ok(cardOf(tM, 'ダミー乙').indexOf('📄 ケアマネ用 済') >= 0, '取り消しても📄は済のまま');
  ok(tM.indexOf('完了 2・出力残 1・測定未 2') >= 0, '件数も戻る');

  sec('操作: 送信URLの中身（測定の記録とは別の操作）');
  const outUrls = captured.writes.filter(u => u.indexOf('action=setSokuteiOutput') >= 0);
  eq(outUrls.length, 3, '3回の操作で3本');
  ok(outUrls[0].indexOf('kind=riyousha') >= 0 && outUrls[0].indexOf('done=true') >= 0, '1本目は🖨を済に');
  ok(outUrls[0].indexOf('ym=2026-07') >= 0, '★測定年月を必ず送る（1測定回＝1行の主キー）');
  ok(outUrls[0].indexOf('domain=sokutei') >= 0, 'domain を送る');
  ok(outUrls[2].indexOf('done=false') >= 0, '3本目は取り消し');
  eq(captured.writes.filter(u => u.indexOf('action=addSokuteiDone') >= 0).length, 0,
    '★出力の操作で測定の記録（addSokuteiDone）は呼ばない');
  eq(captured.writes.filter(u => u.indexOf('updateKeikakusho') >= 0 || u.indexOf('updatePlanStart') >= 0).length, 0,
    '★個訓シートへ書くAPIを1本も呼ばない（読むだけ）');

  sec('操作: 測定していない人には効かない');
  ALL_MEASURED = false; resetFixtures();
  S = makeSandbox();
  await S.load();
  await S.toggleOutput('ダミー甲', 'riyousha');
  eq(captured.writes.filter(u => u.indexOf('action=setSokuteiOutput') >= 0).length, 0,
    '★まだ測っていない人の出力チェックは送信そのものが起きない');
  await S.toggleOutput('ダミー乙', 'houkokusho');
  eq(captured.writes.filter(u => u.indexOf('action=setSokuteiOutput') >= 0).length, 0,
    '★存在しない種類（報告書の「作成」など）は送らない');

  sec('操作: runRowAction を通っている（送信中表示・連打防止）');
  ALL_MEASURED = false; resetFixtures();
  S = makeSandbox();
  await S.load();
  let p = S.toggleOutput('ダミー乙', 'riyousha');       // 応答を待たずに描画を見る
  ok(els['tab4'].innerHTML.indexOf('⏳ 送信中…') >= 0, '★応答前に「送信中…」が出る（1-9-1）');
  ok(cardOf(els['tab4'].innerHTML, 'ダミー乙').indexOf('disabled') >= 0, '送信中は同じ行のボタンを無効化する');
  await S.toggleOutput('ダミー乙', 'caremgr');           // 送信中に別のボタンを押す
  await p;
  eq(captured.writes.filter(u => u.indexOf('action=setSokuteiOutput') >= 0).length, 1,
    '★送信中に他のボタンを押しても送られない（1-9-2）');

  ALL_MEASURED = false; resetFixtures();
  S = makeSandbox();
  await S.load();
  const ps = [S.toggleOutput('ダミー乙', 'riyousha'), S.toggleOutput('ダミー乙', 'riyousha'), S.toggleOutput('ダミー乙', 'riyousha')];
  await Promise.all(ps);
  eq(captured.writes.filter(u => u.indexOf('action=setSokuteiOutput') >= 0).length, 1,
    '★3回連打しても送信は1回（2ヶ月進む類の事故を作らない）');
  ok(cardOf(els['tab4'].innerHTML, 'ダミー乙').indexOf('🖨 利用者用 済') >= 0, '結果は1回ぶんだけ反映される');

  // =====================================================================
  sec('全員が測定も出力も済んだときだけ「今月ぶん完了 ✅」が出る（3-6）');
  ALL_MEASURED = true; resetFixtures();
  // 甲・戊・乙も両方済にしておく（丙はシート済・丁は legacy 済）
  ['U1', 'U2', 'U5'].forEach((uid, i) => OUTPUT_ROWS.push({
    userId: uid, name: ['ダミー甲', 'ダミー乙', 'ダミー戊'][i], domain: 'sokutei', ym: YM,
    riyousha_at: '2026-07-20 10:00:00', riyousha_by: 'スタッフX',
    caremgr_at: '2026-07-20 10:01:00', caremgr_by: 'スタッフX', updatedAt: '2026-07-20 10:01:00', note: ''
  }));
  S = makeSandbox();
  await S.load();
  tM = els['tab4'].innerHTML;
  ok(tM.indexOf('完了 5・出力残 0・測定未 0') >= 0, '5人全員が完了');
  ok(tM.indexOf('今月ぶん完了 ✅') >= 0, '★測定未0かつ出力残0なので出る');
  ok(tM.indexOf('測定も出力も全部終わっています') >= 0, '文言も出力込みになっている');

  // 出力が1つでも残っていたら出さない
  ALL_MEASURED = true; resetFixtures();
  ['U1', 'U5'].forEach((uid, i) => OUTPUT_ROWS.push({
    userId: uid, name: ['ダミー甲', 'ダミー戊'][i], domain: 'sokutei', ym: YM,
    riyousha_at: '2026-07-20 10:00:00', riyousha_by: 'スタッフX',
    caremgr_at: '2026-07-20 10:01:00', caremgr_by: 'スタッフX', updatedAt: '', note: ''
  }));
  // 乙は出力ゼロのまま＝出力残1
  S = makeSandbox();
  await S.load();
  tM = els['tab4'].innerHTML;
  ok(tM.indexOf('完了 4・出力残 1・測定未 0') >= 0, '測定は全員済んだが出力が1人残っている');
  eq(tM.indexOf('今月ぶん完了 ✅') >= 0, false, '★測定が全部済んでも出力が残っていれば完了にしない');
  ok(has(tM, 'ダミー乙'), '★その1人は一覧に残り続ける（消えると忘れる）');

  // =====================================================================
  sec('既存機能が壊れていない（予定月・スライド・月タップ・Undo・フィルタ・タブ）');
  ALL_MEASURED = false; resetFixtures();
  S = makeSandbox();
  await S.load();
  tM = els['tab4'].innerHTML;
  ok(cardOf(tM, 'ダミー甲').indexOf('予定 2026-07') >= 0, '予定月が出る');
  ok(cardOf(tM, 'ダミー甲').indexOf('計画書 2026-07') >= 0, '要介護には計画月が出る');
  eq(cardOf(tM, 'ダミー戊').indexOf('計画書 ') >= 0, false, '要支援には計画月を出さない');
  await S.slideToNextMonth('ダミー甲');
  eq(captured.writes.filter(u => u.indexOf('action=slideYotei') >= 0).length, 1, '📅来月へ が動く');
  eq(YOTEI_STATE.find(y => y.userId === 'U1').nextYm, '2026-08', '予定月が1ヶ月進む');
  ok(typeof S.pickYm === 'function' && typeof S.openYmPicker === 'function', '月タップの入口が残っている');
  // UNDO_MS は const 宣言のため vm のグローバルには生えない。実バイトを直接見る
  ok(typeof S.showUndoBar === 'function' && /const UNDO_MS = 5000/.test(script0), '5秒Undoバーが残っている');
  ok(typeof S.filterUsers === 'function' && typeof S.applyAllFilters === 'function', '共通フィルタが残っている');
  ok(typeof S.rowPlanGap === 'function' && typeof S.planGapCheck === 'function', '要介護ギャップ警告が残っている');
  ok(typeof S.runRowAction === 'function', 'runRowAction が残っている');
  eq(els['tab1'].innerHTML.length > 0 && els['tab2'].innerHTML.length > 0 && els['tab3'].innerHTML.length > 0, true,
    '他の3タブも従来どおり描画される');

  // =====================================================================
  console.log('\n=== 結果 ===');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
