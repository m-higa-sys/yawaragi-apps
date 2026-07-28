// test-sokutei-month-filter.js
// sokutei.html の「今月やる人」タブ（A）と共通フィルタ（B/C）のヘッドレス検証。
// 実ブラウザを開かず・本番GASへ一切飛ばさず（fetchを完全スタブ・ダミー名のみ）検証する。
//
//   A  「今月やる人」タブ: 未が上・済が下／済は実績ベース（予定月が進んでも残る）／件数ヘッダ／完了表示
//   B  共通フィルタ: 曜日・午前午後・名前検索・介護度の AND／0件メッセージ／クリア／タブ跨ぎ保持
//   C  フィルタが純関数（DOM非依存）であること
//
// 段階1の配線（予定月・スライド・月タップ・送信中表示）の回帰は scripts/test-sokutei-yotei-render.js 側。
// 実行: node scripts/test-sokutei-month-filter.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'sokutei.html'), 'utf8');
const open = html.indexOf('<script>');   // src付きは '<script src=' なので当たらない
const script0 = html.slice(open + '<script>'.length, html.indexOf('</script>', open))
  .replace(/\nload\(\);\s*$/, '\n');     // 末尾の自動起動を剥がしてテストから制御
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
    // 要素配下の querySelector（Undoバーの .undo-msg / .undo-btn を触るため最小対応）
    querySelector(sel) {
      if (!this._q) this._q = {};
      if (!this._q[sel]) this._q[sel] = { textContent: '', onclick: null, disabled: false };
      return this._q[sel];
    }
  };
}
const els = {};
function elFor(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; }

// ---- 固定データ（すべてダミー名・実利用者名は使わない）----
// TODAY は 2026-07-28（当月キー = 2026-07）
const TODAY = '2026-07-28';

// 予定月シート。★ダミー鈴木は「測定済みで予定月が10月へ進んだ人」＝実績で拾えないと一覧から消える人
const YOTEI = [
  { userId: 'ダミー田中', name: 'ダミー田中', domain: 'sokutei', nextYm: '2026-07', cycleMonths: 3, slideCount: 0, note: '' }, // 未（当月）
  { userId: 'ダミー佐藤', name: 'ダミー佐藤', domain: 'sokutei', nextYm: '2026-06', cycleMonths: 3, slideCount: 0, note: '' }, // 未（過ぎている）
  { userId: 'ダミー鈴木', name: 'ダミー鈴木', domain: 'sokutei', nextYm: '2026-10', cycleMonths: 3, slideCount: 0, note: '' }, // 済（予定月は先へ進んでいる）
  { userId: 'ダミー高橋', name: 'ダミー高橋', domain: 'sokutei', nextYm: '2026-07', cycleMonths: 4, slideCount: 0, note: '' }, // 未（当月）
  { userId: 'ダミー渡辺', name: 'ダミー渡辺', domain: 'sokutei', nextYm: '2026-09', cycleMonths: 4, slideCount: 0, note: '' }  // 対象外（実績も紙のみ）
];
const KAIGO_USERS = [
  { userId: 'ダミー田中', name: 'ダミー田中', furigana: 'ダミータナカ', category: '要介護2', days: '月水', planStart: '2026-04', planMonths: 3 },
  { userId: 'ダミー佐藤', name: 'ダミー佐藤', furigana: 'ダミーサトウ', category: '要介護1', days: '火木', planStart: '2026-04', planMonths: 3 },
  { userId: 'ダミー鈴木', name: 'ダミー鈴木', furigana: 'ダミースズキ', category: '要介護1', days: '金', planStart: '2026-04', planMonths: 3 }
];
const TSUSHO_USERS = [
  { userId: 'ダミー高橋', name: 'ダミー高橋', furigana: 'ダミータカハシ', category: '要支援2', cancelled: false },
  { userId: 'ダミー渡辺', name: 'ダミー渡辺', furigana: 'ダミーワタナベ', category: '事業対象者', cancelled: false }
];
// 利用者台帳。ampm は実データと同じ3形（'午前' / '午後' / '月午前、木午後'）＋未設定を1件混ぜる
const USER_LIST = [
  { userName: 'ダミー田中', userNameKana: 'ダミータナカ', days: '月水', ampm: '午前' },
  { userName: 'ダミー佐藤', userNameKana: 'ダミーサトウ', days: '火木', ampm: '午後' },
  { userName: 'ダミー鈴木', userNameKana: 'ダミースズキ', days: '金', ampm: '午前' },
  { userName: 'ダミー高橋', userNameKana: 'ダミータカハシ', days: '月木', ampm: '月午前、木午後' },  // 曜日別に枠が違う
  { userName: 'ダミー渡辺', userNameKana: 'ダミーワタナベ', days: '水', ampm: '' }                   // 枠が分からない
];
// 個訓13列目の測定実績。ダミー鈴木の当月ぶん＝「済」の根拠
const KAIGO_RECORDS = [
  { userId: 'ダミー鈴木', name: 'ダミー鈴木', sokutei_date: '2026-07-15', sokutei_by: 'スタッフX' },
  { userId: 'ダミー田中', name: 'ダミー田中', sokutei_date: '2026-04-10', sokutei_by: 'スタッフY' }   // 先月以前＝済にしない
];
// 要支援測定記録。紙台帳の遡り投入は当月でも「今月やった仕事」に数えない
let SHIEN_ROWS = [
  { name: 'ダミー渡辺', care: '事業対象者', sokutei_date: '2026-07-02', sokutei_by: '', source: 'paper', note: '' }
];

let YOTEI_STATE = null;
const captured = { writes: [] };
// 「土曜利用者を1人足したら土ボタンが出る」を実測するための追加枠（コードは一切変えずにデータだけ足す）
let EXTRA_TSUSHO = [], EXTRA_USERLIST = [], EXTRA_YOTEI = [];
function addUser(name, days, ampm, nextYm) {
  EXTRA_TSUSHO.push({ userId: name, name: name, furigana: name, category: '要支援2', cancelled: false });
  EXTRA_USERLIST.push({ userName: name, userNameKana: name, days: days, ampm: ampm });
  EXTRA_YOTEI.push({ userId: name, name: name, domain: 'sokutei', nextYm: nextYm, cycleMonths: 4, slideCount: 0, note: '' });
}
// フィルタバーの曜日ボタンだけを取り出す（介護度・時間帯のチップと混ざらないよう曜日行だけを見る）
function dayButtons(barHtml) {
  const s = String(barHtml);
  const i = s.indexOf('利用曜日');
  if (i < 0) return [];
  const row = s.slice(i, s.indexOf('</div></div>', i));
  return (row.match(/toggleUfDay\('(.)'\)/g) || []).map(m => m.charAt(m.length - 3));
}

function param(url, k) {
  const m = url.match(new RegExp('[?&]' + k + '=([^&]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}
function ymAddStub(ym, n) {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const m0 = (m - 1) + n, ny = y + Math.floor(m0 / 12), nm = ((m0 % 12) + 12) % 12 + 1;
  return ny + '-' + (nm < 10 ? '0' : '') + nm;
}
function fetchStub(url) {
  let data;
  if (url.indexOf('action=attendance') >= 0) {
    data = {
      success: true, attendance: {
        am: [{ name: 'ダミー田中', care: '要介護2', status: '出席' }],
        pm: [{ name: 'ダミー佐藤', care: '要介護1', status: '出席' }]
      }
    };
  } else if (url.indexOf('action=usage_stats') >= 0) {
    data = { success: true, usageStats: { users: [] } };
  } else if (url.indexOf('action=getKeikakushoYear') >= 0) {
    data = url.indexOf('year=2026') >= 0
      ? { ok: true, users: KAIGO_USERS, records: KAIGO_RECORDS }
      : { ok: true, users: [], records: [] };
  } else if (url.indexOf('action=staff_list') >= 0) {
    data = { staff: ['スタッフX', 'スタッフY'] };
  } else if (url.indexOf('action=getShienSokutei') >= 0) {
    data = { ok: true, records: SHIEN_ROWS.slice() };
  } else if (url.indexOf('action=user_list') >= 0) {
    data = { success: true, user_list: USER_LIST.concat(EXTRA_USERLIST) };
  } else if (url.indexOf('action=getTsushoPlansYearV2') >= 0) {
    data = { ok: true, users: TSUSHO_USERS.concat(EXTRA_TSUSHO) };
  } else if (url.indexOf('action=getYotei') >= 0) {
    data = { ok: true, domain: 'sokutei', records: YOTEI_STATE.map(y => Object.assign({}, y)) };
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
  } else if (url.indexOf('action=slideYotei') >= 0) {
    captured.writes.push(url);
    const row = YOTEI_STATE.find(y => y.userId === param(url, 'userId'));
    row.nextYm = ymAddStub(row.nextYm, 1); row.slideCount++;
    data = { ok: true, row: Object.assign({}, row) };
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
      // 検索中のバッジ更新でだけ使う。null を返すと updateFilterBadge は早期 return する
      querySelector: () => null,
      activeElement: null
    },
    fetch: fetchStub,
    alert: () => { },
    console: console,
    Date: FixedDate,
    setTimeout: (fn, ms) => { const id = timers.length; timers.push({ fn, ms, cleared: false }); return id; },
    clearTimeout: (id) => { if (timers[id]) timers[id].cleared = true; },
    encodeURIComponent, decodeURIComponent,
    Math, JSON, Promise, Array, String, Object, Number, Boolean, RegExp, isNaN, parseInt, parseFloat
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  ['sokuteiCycleMonths_', 'sokuteiDueDate_'].forEach(n => vm.runInContext(extractFn(shared, n), sandbox));
  vm.runInContext(yoteiSrc.replace(/if \(typeof module[\s\S]*$/, ''), sandbox);
  vm.runInContext(measureSrc.replace(/if \(typeof module[\s\S]*$/, ''), sandbox);
  vm.runInContext(script0, sandbox);
  return sandbox;
}
function resetFixtures() {
  YOTEI_STATE = YOTEI.concat(EXTRA_YOTEI).map(y => Object.assign({}, y));
  SHIEN_ROWS = [{ name: 'ダミー渡辺', care: '事業対象者', sokutei_date: '2026-07-02', sokutei_by: '', source: 'paper', note: '' }];
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

(async () => {
  let S, tM;

  // =====================================================================
  sec('C-1 フィルタが純関数である（DOM非依存・素のオブジェクトで動く）');
  resetFixtures();
  S = makeSandbox();
  const plain = [
    { name: 'ダミー田中', kana: 'ダミータナカ', weekdays: '月水', ampm: '午前' },
    { name: 'ダミー佐藤', kana: 'ダミーサトウ', weekdays: '火木', ampm: '午後' },
    { name: 'ダミー高橋', kana: 'ダミータカハシ', weekdays: '月木', ampm: '月午前、木午後' }
  ];
  eq(S.filterUsers(plain, {}).length, 3, '条件なしは素通し（3件）');
  eq(S.filterUsers(plain, { days: ['月'] }).map(r => r.name), ['ダミー田中', 'ダミー高橋'], '曜日だけで絞れる');
  eq(S.filterUsers(plain, { slots: ['pm'] }).map(r => r.name), ['ダミー佐藤', 'ダミー高橋'], '時間帯だけで絞れる');
  eq(S.filterUsers(plain, { query: 'たなか' }).map(r => r.name), ['ダミー田中'], '名前だけで絞れる');
  eq(S.filterUsers(plain, { days: ['月'], slots: ['am'] }).map(r => r.name), ['ダミー田中', 'ダミー高橋'], '曜日×時間帯 の AND');
  eq(S.filterUsers(plain, { days: ['木'], slots: ['am'] }).map(r => r.name), [], '★木曜午前は該当なし（高橋の木は午後）');
  eq(S.filterUsers(plain, { days: ['木'], slots: ['pm'] }).map(r => r.name), ['ダミー佐藤', 'ダミー高橋'], '★木曜午後は2名（曜日別の枠を正しく解釈）');
  eq(S.filterUsers(null, { days: ['月'] }), [], 'null を渡しても落ちない');
  eq(S.filterUsers(plain, null).length, 3, 'opt 省略でも落ちない');
  const before = JSON.stringify(plain);
  S.filterUsers(plain, { days: ['月'] });
  eq(JSON.stringify(plain), before, '入力配列を書き換えない（副作用なし）');

  sec('C-1 名前検索は漢字・ひらがな・カタカナ・半角・敬称ゆれで引ける');
  ['ダミー田中', 'たなか', 'タナカ', 'ﾀﾅｶ', 'ﾀﾞﾐｰ田中', '田中'].forEach(q => {
    eq(S.filterUsers(plain, { query: q }).map(r => r.name), ['ダミー田中'], '「' + q + '」で引ける');
  });
  eq(S.filterUsers(plain, { query: 'ダミー田中様' }).map(r => r.name), ['ダミー田中'], '敬称付きでも引ける');
  eq(S.filterUsers(plain, { query: ' たなか ' }).map(r => r.name), ['ダミー田中'], '前後の空白は無視する');
  eq(S.filterUsers(plain, { query: 'いない人' }).length, 0, '該当なしは0件');

  sec('C-1 午前午後列の解釈（ufParseAmpm）');
  eq(S.ufParseAmpm('午前'), [{ day: '', slot: 'am' }], "'午前' → 曜日指定なしの午前");
  eq(S.ufParseAmpm('午後'), [{ day: '', slot: 'pm' }], "'午後' → 曜日指定なしの午後");
  eq(S.ufParseAmpm('月午前、木午後'), [{ day: '月', slot: 'am' }, { day: '木', slot: 'pm' }], '曜日別の2枠に分解する');
  eq(S.ufParseAmpm(''), [], '空は空配列');
  eq(S.ufParseAmpm(null), [], 'null も空配列');

  // =====================================================================
  // 曜日ボタンは実データ駆動（2026-07-28 社長決定）。
  // 社長は今後 土曜営業を始める予定があり、固定リストだと開始時にコードの手直しが要る。
  // 土曜利用者が1人でも登録された時点で、コードを触らずに土ボタンが出ることを固定する。
  sec('曜日ボタンの母集団（ufAvailableDays・純関数）');
  eq(S.ufAvailableDays([{ weekdays: '月水' }, { weekdays: '火木' }, { weekdays: '金' }]),
    ['月', '火', '水', '木', '金'], '月〜金しか居なければ5つ');
  eq(S.ufAvailableDays([{ weekdays: '金' }, { weekdays: '月' }, { weekdays: '水' }]),
    ['月', '水', '金'], '★並び順は曜日順に固定（データの出現順にしない）');
  eq(S.ufAvailableDays([{ weekdays: '月水' }, { weekdays: '火木' }, { weekdays: '土' }]),
    ['月', '火', '水', '木', '土'], '★土曜利用者が1人居れば土が出る');
  eq(S.ufAvailableDays([{ weekdays: '月火水木金' }, { weekdays: '土' }, { weekdays: '日' }]),
    ['月', '火', '水', '木', '金', '土', '日'], '★日曜も出る（最後に付く）');
  eq(S.ufAvailableDays([{ weekdays: '月' }, { weekdays: '' }, { weekdays: null }, {}]),
    ['月'], '★利用曜日が空・null・キー無しが混ざっても壊れない');
  eq(S.ufAvailableDays([]), [], '空配列なら曜日なし');
  eq(S.ufAvailableDays(null), [], 'null でも落ちない');
  eq(S.ufAvailableDays([{ weekdays: '月水' }, { weekdays: '水金' }, { weekdays: '水' }]),
    ['月', '水', '金'], '同じ曜日が何人居ても1つにまとまる');

  // =====================================================================
  sec('A-1/A-2 「今月やる人」タブに 未 と 済 の両方が出る');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  tM = els['tab4'].innerHTML;
  ok(has(tM, 'ダミー田中'), '未（当月が予定月）が出る');
  ok(has(tM, 'ダミー佐藤'), '未（予定月を過ぎている）も出る');
  ok(has(tM, 'ダミー高橋'), '未（要支援・当月）も出る');
  ok(has(tM, 'ダミー鈴木'), '★済（測定して予定月が10月へ進んだ人）が一覧に残る');
  eq(has(tM, 'ダミー渡辺'), false, '対象外（予定月9月・実績は紙のみ）は出ない');

  sec('A-2 済の判定が実績ベースである（予定月では判定していない）');
  eq(YOTEI_STATE.find(y => y.userId === 'ダミー鈴木').nextYm, '2026-10', '前提: 鈴木の予定月は当月ではない');
  ok(cardOf(tM, 'ダミー鈴木').indexOf('donerow') >= 0, '予定月が外れていても済として表示される');
  ok(tM.indexOf('紙台帳の遡り投入') >= 0, '紙台帳を除外していることを画面にも書いてある');

  sec('A-3 未が上・済が下に並ぶ');
  const iUndoneHead = tM.indexOf('まだの人');
  const iDoneHead = tM.indexOf('今月やった人');
  ok(iUndoneHead >= 0 && iDoneHead >= 0, '「まだの人」「今月やった人」の見出しが両方ある');
  ok(iUndoneHead < iDoneHead, '未の見出しが済の見出しより上にある');
  ok(tM.indexOf('data-row="ダミー鈴木"') > iDoneHead, '済の行は済の見出しより下にある');
  ['ダミー田中', 'ダミー佐藤', 'ダミー高橋'].forEach(n => {
    ok(tM.indexOf('data-row="' + n + '"') > iUndoneHead && tM.indexOf('data-row="' + n + '"') < iDoneHead, n + ' は未の側にある');
  });

  sec('A-4 済はグレーアウト＋打消し線＋「日付 済（測定者）」');
  const cSuzuki = cardOf(tM, 'ダミー鈴木');
  ok(cSuzuki.indexOf('donerow') >= 0, '済の行クラスが付く');
  ok(cSuzuki.indexOf('7/15 済（スタッフX）') >= 0, '「7/15 済（スタッフX）」が出る');
  ok(cSuzuki.indexOf('✅') >= 0, 'バッジが✅になる');
  ok(/\.card\.donerow\s*\{[^}]*opacity/.test(css), 'CSSでグレーアウトしている');
  ok(/\.card\.donerow \.nm\s*\{[^}]*line-through/.test(css), 'CSSで氏名に打消し線が入る');
  eq(cSuzuki.indexOf('📝測定した') >= 0, false, '済の行に記録ボタンは出さない（二重記録防止）');
  eq(cSuzuki.indexOf('onclick="openRecordModal') >= 0, false, '済の行はカードタップでも記録モーダルを開かない');

  sec('A-7 済の行でも「📅来月へ」「予定 ▾」は使える');
  ok(cSuzuki.indexOf('📅来月へ') >= 0, '済でもスライドできる');
  ok(cSuzuki.indexOf('openYmPicker') >= 0, '済でも月タップできる');
  ok(cardOf(tM, 'ダミー田中').indexOf('📝測定した') >= 0, '未の行には記録ボタンが出る');

  sec('A-5 ヘッダに件数が出る');
  ok(tM.indexOf('7月の対象 4名') >= 0, '「7月の対象 4名」');
  ok(tM.indexOf('／済 1・未 3') >= 0, '「／済 1・未 3」');
  eq(tM.indexOf('（全体') >= 0, false, 'フィルタ未適用のときは母数を併記しない');

  sec('A-7 スライドが「今月やる人」タブでも通る（1-9の送信中表示・連打防止のまま）');
  const w0 = captured.writes.length;
  const p = S.slideToNextMonth('ダミー田中');
  ok(els['tab4'].innerHTML.indexOf('⏳ 送信中…') >= 0, '応答前に「送信中…」が出る');
  S.slideToNextMonth('ダミー田中');
  await p;
  eq(captured.writes.filter(u => u.indexOf('action=slideYotei') >= 0).length, 1, '連打しても送信は1回だけ');
  eq(YOTEI_STATE.find(y => y.userId === 'ダミー田中').nextYm, '2026-08', '1ヶ月だけ進む');
  void w0;

  // =====================================================================
  sec('B-1 曜日フィルタ');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  S.toggleUfDay('月');
  tM = els['tab4'].innerHTML;
  ok(has(tM, 'ダミー田中'), '月水の人は残る');
  ok(has(tM, 'ダミー高橋'), '月木の人は残る');
  eq(has(tM, 'ダミー佐藤'), false, '火木の人は消える');
  eq(has(tM, 'ダミー鈴木'), false, '金の人（済）も消える');
  ok(tM.indexOf('7月の対象 2名（全体4名中）') >= 0, 'A-5 フィルタ時は母数を併記する');
  ok(tM.indexOf('／済 0・未 2') >= 0, '済・未の内訳もフィルタ後の数になる');
  S.toggleUfDay('火');
  tM = els['tab4'].innerHTML;
  ok(has(tM, 'ダミー佐藤'), '曜日は複数選べる（月＋火）');
  S.toggleUfDay('月'); S.toggleUfDay('火');   // 解除

  sec('B-2 時間帯フィルタ');
  S.toggleUfSlot('am');
  tM = els['tab4'].innerHTML;
  ok(has(tM, 'ダミー田中'), '午前の人が残る');
  ok(has(tM, 'ダミー鈴木'), '午前の人は済でも残る');
  ok(has(tM, 'ダミー高橋'), '月午前の枠を持つ人も残る');
  eq(has(tM, 'ダミー佐藤'), false, '午後の人は消える');
  S.toggleUfSlot('am'); S.toggleUfSlot('pm');
  tM = els['tab4'].innerHTML;
  ok(has(tM, 'ダミー佐藤'), '午後で佐藤が出る');
  eq(has(tM, 'ダミー田中'), false, '午前だけの人は消える');
  S.toggleUfSlot('pm');

  sec('B-1×B-2 曜日と時間帯の AND（曜日別の枠を正しく見る）');
  S.toggleUfDay('木'); S.toggleUfSlot('am');
  tM = els['tab4'].innerHTML;
  eq(has(tM, 'ダミー高橋'), false, '★高橋の木曜は午後なので「木×午前」では出ない');
  eq(has(tM, 'ダミー佐藤'), false, '佐藤も午後なので出ない');
  ok(tM.indexOf('絞り込みの条件に合う人がいません') >= 0, 'B-6 0件のメッセージが出る');
  S.toggleUfSlot('am'); S.toggleUfSlot('pm');
  tM = els['tab4'].innerHTML;
  ok(has(tM, 'ダミー高橋'), '「木×午後」なら高橋が出る');
  S.toggleUfDay('木'); S.toggleUfSlot('pm');

  sec('B-3 名前検索（インクリメンタル・表記ゆれに強い）');
  const q = elFor('ufQuery');
  q.value = 'たなか';
  q.oninput.call(q);
  tM = els['tab4'].innerHTML;
  ok(has(tM, 'ダミー田中'), 'ひらがなで漢字氏名を引ける（ふりがな経由）');
  eq(has(tM, 'ダミー佐藤'), false, '他の人は消える');
  ok(tM.indexOf('7月の対象 1名（全体4名中）') >= 0, '件数と母数が出る');
  q.value = 'ﾀﾅｶ'; q.oninput.call(q);
  ok(has(els['tab4'].innerHTML, 'ダミー田中'), '半角カナでも引ける');
  q.value = '田中'; q.oninput.call(q);
  ok(has(els['tab4'].innerHTML, 'ダミー田中'), '漢字でも引ける');
  q.value = 'そんな人いない'; q.oninput.call(q);
  ok(els['tab4'].innerHTML.indexOf('絞り込みの条件に合う人がいません') >= 0, 'B-6 0件メッセージ');
  q.value = ''; q.oninput.call(q);
  ok(has(els['tab4'].innerHTML, 'ダミー佐藤'), '空にすると戻る');

  sec('B 介護度フィルタとの AND');
  S.setCareFilter('shien');
  tM = els['tab4'].innerHTML;
  ok(has(tM, 'ダミー高橋'), '要支援等で高橋が残る');
  eq(has(tM, 'ダミー田中'), false, '要介護は消える');
  S.toggleUfDay('木');
  tM = els['tab4'].innerHTML;
  ok(has(tM, 'ダミー高橋'), '要支援等 × 木曜 で高橋が残る（AND）');
  S.toggleUfDay('水');
  tM = els['tab4'].innerHTML;
  ok(has(tM, 'ダミー高橋'), '木＋水でも高橋は残る（曜日は OR・他条件と AND）');
  S.setCareFilter('kaigo');
  tM = els['tab4'].innerHTML;
  eq(has(tM, 'ダミー高橋'), false, '要介護のみに切り替えると高橋は消える');

  sec('曜日ボタンが実データから作られる（画面レベル）');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  eq(dayButtons(els['ufbar'].innerHTML), ['月', '火', '水', '木', '金'],
    '★いまのデータは月〜金なのでボタンは5つ（土・日は出ない）');
  // ここから「土曜営業を始めた」状況を、コードを一切変えずにデータだけで再現する
  addUser('ダミー土曜', '土', '午前', '2026-07');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  eq(dayButtons(els['ufbar'].innerHTML), ['月', '火', '水', '木', '金', '土'],
    '★土曜利用者を1人足すと土ボタンが6つ目に出る（金の次）');
  ok(has(els['tab4'].innerHTML, 'ダミー土曜'), '足した土曜利用者が一覧にも出る');
  S.toggleUfDay('土');
  eq(dayButtons(els['ufbar'].innerHTML).length, 6, '土で絞ってもボタンの並びは変わらない');
  ok(has(els['tab4'].innerHTML, 'ダミー土曜'), '土で絞ると土曜利用者が残る');
  eq(has(els['tab4'].innerHTML, 'ダミー田中'), false, '月水の人は消える');
  S.clearFilters();
  addUser('ダミー日曜', '日', '午後', '2026-07');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  eq(dayButtons(els['ufbar'].innerHTML), ['月', '火', '水', '木', '金', '土', '日'],
    '★日曜利用者を足すと日が最後に出る');
  // 利用曜日が空の人を混ぜてもボタン生成が壊れないこと
  addUser('ダミー曜日なし', '', '午前', '2026-07');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  eq(dayButtons(els['ufbar'].innerHTML), ['月', '火', '水', '木', '金', '土', '日'],
    '★利用曜日が空の人がいてもボタンは増えない・壊れない');
  ok(has(els['tab4'].innerHTML, 'ダミー曜日なし'), '曜日が空の人も一覧には出る');
  S.toggleUfDay('月');
  eq(has(els['tab4'].innerHTML, 'ダミー曜日なし'), false, '曜日で絞ると曜日不明の人は外れる');
  // 追加ぶんを片付けて元のデータへ戻す
  EXTRA_TSUSHO = []; EXTRA_USERLIST = []; EXTRA_YOTEI = [];
  resetFixtures();
  S = makeSandbox();
  await S.load();
  eq(dayButtons(els['ufbar'].innerHTML), ['月', '火', '水', '木', '金'], '元のデータに戻すとボタンも5つに戻る');

  sec('B-6 0件メッセージは「壊れた」と誤解させない');
  S.toggleUfDay('月'); S.toggleUfSlot('pm');   // 月曜×午後 は該当なし
  const empty = els['tab4'].innerHTML;
  ok(empty.indexOf('絞り込みの条件に合う人がいません') >= 0, '原因が絞り込みだと分かる見出し');
  ok(empty.indexOf('データが無いのではなく') >= 0, 'データ欠損ではないと明記している');
  ok(empty.indexOf('絞り込みをクリア') >= 0, '次の一手（クリア）を示している');
  S.clearFilters();

  sec('B-4 クリアで全部戻る');
  S.clearFilters();
  tM = els['tab4'].innerHTML;
  ['ダミー田中', 'ダミー佐藤', 'ダミー高橋', 'ダミー鈴木'].forEach(n => ok(has(tM, n), n + ' が戻る'));
  ok(tM.indexOf('7月の対象 4名') >= 0, '件数も戻る');
  eq(tM.indexOf('（全体') >= 0, false, '母数の併記も消える');

  sec('B-5 適用中が見て分かる');
  S.toggleUfDay('月');
  let bar = els['ufbar'].innerHTML;
  ok(bar.indexOf('uf-badge') >= 0, '適用中バッジが出る');
  ok(bar.indexOf('1件適用中') >= 0, '適用件数が出る');
  ok(bar.indexOf('uf-chip on') >= 0, '選んだチップに色が付く');
  S.setCareFilter('kaigo');
  ok(els['ufbar'].innerHTML.indexOf('2件適用中') >= 0, '介護度も適用件数に数える');
  S.clearFilters();
  bar = els['ufbar'].innerHTML;
  eq(bar.indexOf('uf-badge') >= 0, false, 'クリアするとバッジが消える');
  ok(bar.indexOf('disabled') >= 0, '未適用のときクリアボタンは押せない');

  sec('B-7 タブを切り替えてもフィルタは保持される');
  S.toggleUfDay('月');
  S.showTab(2);
  ok(els['ufbar'].style.display !== 'none', '全利用者タブでもフィルタバーが出る');
  ok(els['ufbar'].innerHTML.indexOf('1件適用中') >= 0, '適用状態が残っている');
  const t2 = els['tab2'].innerHTML;
  ok(has(t2, 'ダミー田中'), '全利用者タブにも曜日フィルタが効く');
  eq(has(t2, 'ダミー佐藤'), false, '火木の人は消える');
  ok(t2.indexOf('（全体5名中）') >= 0, '全利用者タブでも母数を併記する');
  S.showTab(1);
  ok(els['ufbar'].innerHTML.indexOf('1件適用中') >= 0, '今日の優先タブへ戻しても保持される');
  const t1 = els['tab1'].innerHTML;
  ok(has(t1, 'ダミー田中'), '今日の優先にも効く（月水の田中は残る）');
  eq(has(t1, 'ダミー佐藤'), false, '火木の佐藤は消える');
  S.showTab(3);
  eq(els['ufbar'].style.display, 'none', 'スタッフ%タブではフィルタバーを出さない');
  S.showTab(4);
  ok(els['ufbar'].innerHTML.indexOf('1件適用中') >= 0, '今月やる人タブへ戻しても保持される');
  S.clearFilters();

  // =====================================================================
  sec('A-6 未が0になったら「今月ぶん完了 ✅」');
  resetFixtures();
  YOTEI_STATE = YOTEI_STATE.map(y => (y.userId === 'ダミー鈴木') ? y : Object.assign({}, y, { nextYm: '2026-12' }));
  S = makeSandbox();
  await S.load();
  tM = els['tab4'].innerHTML;
  ok(tM.indexOf('今月ぶん完了 ✅') >= 0, '未0で完了表示が出る');
  ok(tM.indexOf('／済 1・未 0') >= 0, 'ヘッダも 済1・未0');
  ok(has(tM, 'ダミー鈴木'), '済の人は残って見える');

  sec('A-2 測定するとその場で未→済に移る（予定月が進んでも消えない）');
  resetFixtures();
  S = makeSandbox();
  await S.load();
  ok(cardOf(els['tab4'].innerHTML, 'ダミー田中').indexOf('donerow') < 0, '前提: 田中はまだ未');
  elFor('recordStaffSelect').value = 'スタッフY';
  S.openRecordModal('ダミー田中');
  await S.submitRecord();
  eq(YOTEI_STATE.find(y => y.userId === 'ダミー田中').nextYm, '2026-10', '予定月は10月へ進む（当月から外れる）');
  tM = els['tab4'].innerHTML;
  ok(has(tM, 'ダミー田中'), '★予定月が外れても一覧に残る');
  ok(cardOf(tM, 'ダミー田中').indexOf('donerow') >= 0, '済の見た目に変わる');
  ok(tM.indexOf('／済 2・未 2') >= 0, 'ヘッダが 済2・未2 になる');

  console.log('\n=== 結果 ===');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
