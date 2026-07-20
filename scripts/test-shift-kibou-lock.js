// シフト希望GAS（gas/shift-kibou/コード.js）の登録競合ロック検証
// 実行: node scripts/test-shift-kibou-lock.js
//
// 方針:
//   実物ロード方式。本番と同一の コード.js を vm でそのまま実行し、
//   SpreadsheetApp / LockService / Utilities 等の GAS API のみ注入する。
//   本番シートには一切アクセスしない（getActiveSpreadsheet をモックが握る）。
//   通知（LINE/Gmail）も UrlFetchApp / GmailApp をモックが握るため1件も発火しない。
//
// 競合の再現モデル（重要・なぜこれで再現と言えるか）:
//   GAS の同時実行は「読み → 判定 → appendRow」の間に他実行の append が挟まる。
//   本テストは共有シートを「コミット済みストア」と「実行ごとのビュー（スナップショット）」に
//   分けて表現する。
//     ・ビューは各リクエストの開始時に固定される（＝他実行の append が見えない ＝ 競合窓）
//     ・appendRow はコミット済みストアへ即時反映される
//     ・ScriptLock の tryLock 成功時にビューを最新コミットへ張り直す
//       （＝直列化されたので最新が読める。これがロックの効き目そのもの）
//   よってロック無しなら3リクエストとも初期状態を読んで3行 append され、
//   ロック有りなら2件目以降が1件目の行を見て重複ブロックされる。
//
// 型判定は Object.prototype.toString.call() を使う（instanceof は使わない）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAS_PATH = path.join(__dirname, '..', 'gas', 'shift-kibou', 'コード.js');
const GAS_SRC = fs.readFileSync(GAS_PATH, 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}
function isDate(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

// 固定の「今」。2026-07-20 09:00 JST（提出期限20日 → 登録可能は 2026-08-01 以降）
const FIXED_NOW = new Date('2026-07-20T00:00:00Z').getTime();
function makeDateClass() {
  class FakeDate extends Date {
    constructor(...a) { if (a.length === 0) { super(FIXED_NOW); } else { super(...a); } }
    static now() { return FIXED_NOW; }
  }
  return FakeDate;
}

// ============================================
// 共有シート世界（競合モデル）
// ============================================
function makeWorld(initialSheets, opts) {
  opts = opts || {};
  const committed = {};
  Object.keys(initialSheets).forEach(function (n) {
    committed[n] = initialSheets[n].map(function (r) { return r.slice(); });
  });

  const world = {
    committed: committed,
    view: null,
    locked: false,
    lockEvents: [],      // 'acquire' / 'release' / 'timeout'
    notifyEvents: [],    // { kind, lockedAtCall }
    appendThrows: opts.appendThrows || null, // シート名 → 例外を投げる
    lockAlwaysTimeout: !!opts.lockAlwaysTimeout,
    // コミット済み状態のコピーを1つ作る（リクエストごとに別インスタンスを持つ）
    snapshot: function () {
      const s = {};
      Object.keys(world.committed).forEach(function (n) {
        s[n] = world.committed[n].map(function (r) { return r.slice(); });
      });
      return s;
    },
    install: function (s) { world.view = s; },
    pin: function () { world.install(world.snapshot()); },
    rows: function (name) { return world.committed[name] || []; }
  };
  world.pin();
  return world;
}

function makeSheet(world, name) {
  function view() {
    if (!world.view[name]) world.view[name] = [];
    return world.view[name];
  }
  return {
    getName: function () { return name; },
    getLastRow: function () { return view().length; },
    getLastColumn: function () { return (view()[0] || []).length; },
    getDataRange: function () {
      return { getValues: function () { return view().map(function (r) { return r.slice(); }); } };
    },
    getRange: function (row, col, nr, nc) {
      return {
        getValues: function () {
          const out = [];
          for (let i = 0; i < (nr || 1); i++) {
            const src = view()[row - 1 + i] || [];
            out.push(src.slice(col - 1, col - 1 + (nc || 1)));
          }
          return out;
        },
        setValues: function (vals) {
          for (let i = 0; i < vals.length; i++) {
            const target = row - 1 + i;
            while (view().length <= target) view().push([]);
            while (world.committed[name].length <= target) world.committed[name].push([]);
            for (let j = 0; j < vals[i].length; j++) {
              view()[target][col - 1 + j] = vals[i][j];
              world.committed[name][target][col - 1 + j] = vals[i][j];
            }
          }
          return this;
        },
        setValue: function (v) { return this.setValues([[v]]); },
        setFontWeight: function () { return this; },
        setBackground: function () { return this; }
      };
    },
    appendRow: function (row) {
      if (world.appendThrows === name) throw new Error('テスト用の意図的な例外（appendRow）');
      if (!world.committed[name]) world.committed[name] = [];
      world.committed[name].push(row.slice());
      view().push(row.slice()); // 自分の書き込みは自分には見える
      return this;
    },
    deleteRow: function () { return this; },
    setFrozenRows: function () { return this; }
  };
}

function makeSandbox(world) {
  const sheetCache = {};
  function sheetFor(name) {
    if (!world.committed[name]) return null;
    if (!sheetCache[name]) sheetCache[name] = makeSheet(world, name);
    return sheetCache[name];
  }
  const ss = {
    getSheetByName: function (n) { return sheetFor(n); },
    insertSheet: function (n) { world.committed[n] = []; world.view[n] = []; return sheetFor(n); },
    getSheets: function () { return Object.keys(world.committed).map(sheetFor); }
  };

  const FakeDate = makeDateClass();

  const sandbox = {
    Date: FakeDate,
    console: console,
    JSON: JSON,
    Math: Math,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Object: Object,
    Array: Array,
    Error: Error,
    isNaN: isNaN,
    parseInt: parseInt,
    parseFloat: parseFloat,
    SpreadsheetApp: {
      getActiveSpreadsheet: function () { return ss; },
      openById: function () { return ss; },
      getUi: function () { throw new Error('UI はテストで使わない'); }
    },
    LockService: {
      getScriptLock: function () {
        return {
          tryLock: function () {
            if (world.lockAlwaysTimeout) { world.lockEvents.push('timeout'); return false; }
            world.locked = true;
            world.lockEvents.push('acquire');
            world.pin(); // 直列化された ＝ 最新のコミット済み状態が読める
            return true;
          },
          waitLock: function () { throw new Error('waitLock は使わない方針'); },
          releaseLock: function () { world.locked = false; world.lockEvents.push('release'); },
          hasLock: function () { return world.locked; }
        };
      },
      getUserLock: function () { throw new Error('ユーザーロックは使わない方針'); },
      getDocumentLock: function () { throw new Error('ドキュメントロックは使わない方針'); }
    },
    Utilities: {
      formatDate: function (d, tz, fmt) {
        const dt = new Date(d.getTime() + 9 * 3600 * 1000); // Asia/Tokyo 固定
        const p = function (n, w) { return String(n).padStart(w || 2, '0'); };
        return fmt
          .replace('yyyy', dt.getUTCFullYear())
          .replace('MM', p(dt.getUTCMonth() + 1))
          .replace('dd', p(dt.getUTCDate()))
          .replace('HH', p(dt.getUTCHours()))
          .replace('mm', p(dt.getUTCMinutes()))
          .replace('ss', p(dt.getUTCSeconds()));
      },
      sleep: function () {}
    },
    Logger: { log: function () {} },
    PropertiesService: {
      getScriptProperties: function () {
        return { getProperty: function () { return null; }, setProperty: function () {}, deleteProperty: function () {} };
      }
    },
    UrlFetchApp: {
      fetch: function () {
        world.notifyEvents.push({ kind: 'line', lockedAtCall: world.locked });
        return { getResponseCode: function () { return 200; }, getContentText: function () { return '{}'; } };
      }
    },
    GmailApp: {
      sendEmail: function () { world.notifyEvents.push({ kind: 'gmail', lockedAtCall: world.locked }); }
    },
    Session: { getActiveUser: function () { return { getEmail: function () { return ''; } }; } },
    ContentService: {
      MimeType: { JSON: 'json', JAVASCRIPT: 'js' },
      createTextOutput: function (s) { return { _text: s, setMimeType: function () { return this; } }; }
    },
    HtmlService: {
      createTemplateFromFile: function () { throw new Error('HTML はテストで使わない'); },
      createHtmlOutputFromFile: function () { throw new Error('HTML はテストで使わない'); }
    },
    CalendarApp: { getDefaultCalendar: function () { return null; } }
  };
  vm.createContext(sandbox);
  vm.runInContext(GAS_SRC, sandbox);
  return sandbox;
}

// ============================================
// スケジューラ（ジェネレータで同時到達を表現）
// ============================================
// 各リクエストをジェネレータとして登録し、scheduler が順に駆動する。
// concurrent=true のとき、各リクエストは「開始時点のビュー」を握ったまま走る
// ＝ 3リクエストが同時に到達し、互いの append を見ないまま判定に入る状況。
function* request(sandbox, world, fn, data, out) {
  // このリクエストが読み始めた時点の世界を、自分専用のスナップショットとして固定
  const myView = world.snapshot();
  yield 'pinned';       // 同時到達点：ここで全リクエストが同じ世界を見ている
  world.install(myView); // 実行に入る＝自分の（古いままの）ビューで判定する
  let res;
  try {
    res = sandbox[fn](data);
  } catch (e) {
    res = { thrown: true, message: e.message };
  }
  out.push(res);
  yield 'done';
}

function runConcurrent(sandbox, world, fn, dataList) {
  const out = [];
  const gens = dataList.map(function (d) { return request(sandbox, world, fn, d, out); });
  // 全員を「読み開始（ピン留め）」まで進める → 同時到達
  gens.forEach(function (g) { g.next(); });
  // ロック無しの実装では、この後どの順で走っても各自が古いビューを見続ける
  gens.forEach(function (g) { g.next(); });
  return out;
}

function runSequential(sandbox, world, fn, dataList) {
  const out = [];
  dataList.forEach(function (d) {
    const g = request(sandbox, world, fn, d, out);
    g.next(); g.next();
  });
  return out;
}

// ============================================
// 初期シート
// ============================================
const HDR_ABS = ['スタッフ名', '開始日', '終了日', '理由', '登録日'];
const HDR_WISH = ['対象月', 'スタッフ', '日', '登録日'];
const HDR_STAFF = ['名前', 'カナ', '雇用形態'];
const HDR_LOG = ['日時', 'スタッフ', '操作', '対象月', '対象日'];
const HDR_NOTI = ['対象スタッフ', 'メッセージ', '対象月', '対象日', '作成日', '既読'];

function baseSheets() {
  return {
    '外せない予定': [HDR_ABS.slice()],
    'シフト希望': [HDR_WISH.slice()],
    'スタッフ': [
      HDR_STAFF.slice(),
      ['春山', 'ハルヤマ', 'パート'],
      ['髙山', 'タカヤマ', 'パート'],
      ['石井', 'イシイ', 'パート'],
      ['勝又', 'カツマタ', '社員'],
      ['星野', 'ホシノ', '社員'],
      ['下浦', 'シモウラ', 'パート'],
      ['工藤', 'クドウ', 'パート'],
      ['大久保', 'オオクボ', 'パート'],
      ['小野', 'オノ', 'パート'],
      ['林', 'ハヤシ', 'パート']
    ],
    '変更履歴': [HDR_LOG.slice()],
    '通知': [HDR_NOTI.slice()],
    '社長休み': [['日付']],
    'LINE登録': [['名前', 'userId']],
    '設定': [['キー', '値']]
  };
}

// 2026-09-10 は木曜（平日）
const ABS_REQ = { staff: '春山', startDate: '2026-09-10', endDate: '2026-09-10', reason: '通院' };
const WISH_REQ = { staff: '春山', month: '2026-09', day: 10 };

function absRows(world) { return world.rows('外せない予定').length - 1; }
function wishRows(world) { return world.rows('シフト希望').length - 1; }
function logRows(world) { return world.rows('変更履歴').length - 1; }

function hasLock(sandbox, fnName) {
  const src = String(sandbox[fnName]);
  return /LockService\s*\.\s*getScriptLock/.test(src);
}

console.log('=== シフト希望GAS 登録競合ロック検証 ===');
console.log('対象: gas/shift-kibou/コード.js（本番と同一・実物ロード）\n');

// ---------- 0. 現行版の赤（ロック未実装なら3行 append される） ----------
console.log('[0] 競合再現（実装前に赤を確認するための観測）');
{
  const world = makeWorld(baseSheets());
  const sb = makeSandbox(world);
  const locked = hasLock(sb, 'addAbsence');
  const res = runConcurrent(sb, world, 'addAbsence', [ABS_REQ, ABS_REQ, ABS_REQ]);
  console.log('    addAbsence にロック: ' + (locked ? 'あり' : 'なし') + ' / append行数: ' + absRows(world));
  const world2 = makeWorld(baseSheets());
  const sb2 = makeSandbox(world2);
  const locked2 = hasLock(sb2, 'addWish');
  runConcurrent(sb2, world2, 'addWish', [WISH_REQ, WISH_REQ, WISH_REQ]);
  console.log('    addWish   にロック: ' + (locked2 ? 'あり' : 'なし') + ' / append行数: ' + wishRows(world2));
  if (!locked) ok(absRows(world) === 3, '【赤】ロック未実装の addAbsence は3行 append される（競合再現）');
  if (!locked2) ok(wishRows(world2) === 3, '【赤】ロック未実装の addWish は3行 append される（競合再現）');
  if (locked && locked2) console.log('    → 実装済みのため赤の観測はスキップ（以下の緑テストで判定）');
  void res;
}

// ---------- 1. 単発登録が従来どおり成功する ----------
console.log('\n[1] 単発登録（回帰）');
{
  const world = makeWorld(baseSheets());
  const sb = makeSandbox(world);
  const r = runSequential(sb, world, 'addAbsence', [ABS_REQ])[0];
  ok(r && r.success === true, 'addAbsence 単発は success:true');
  ok(absRows(world) === 1, 'addAbsence 単発で1行 append');
  ok(isDate(world.rows('外せない予定')[1][4]), '登録日がDate型で入る');
}
{
  const world = makeWorld(baseSheets());
  const sb = makeSandbox(world);
  const r = runSequential(sb, world, 'addWish', [WISH_REQ])[0];
  ok(r && r.success === true, 'addWish 単発は success:true');
  ok(wishRows(world) === 1, 'addWish 単発で1行 append');
  ok(logRows(world) === 1, 'addWish 単発で変更履歴に1行');
}

// ---------- 2. 重複ブロック（回帰） ----------
console.log('\n[2] 重複ブロック（回帰）');
{
  const world = makeWorld(baseSheets());
  const sb = makeSandbox(world);
  const rs = runSequential(sb, world, 'addAbsence', [ABS_REQ, ABS_REQ]);
  ok(rs[1] && rs[1].success === false, 'addAbsence 期間重複は success:false');
  ok(String(rs[1].message).indexOf('既に外せない予定') >= 0, '重複メッセージが従来どおり');
  ok(absRows(world) === 1, '重複時は append されない');
}
{
  const world = makeWorld(baseSheets());
  const sb = makeSandbox(world);
  const rs = runSequential(sb, world, 'addWish', [WISH_REQ, WISH_REQ]);
  ok(rs[1] && rs[1].success === false, 'addWish 同日重複は success:false');
  ok(String(rs[1].message).indexOf('既に登録済み') >= 0, '重複メッセージが従来どおり');
  ok(wishRows(world) === 1, '重複時は append されない');
}

// ---------- 3. 同時3リクエストで1件のみ ----------
console.log('\n[3] 同時3リクエスト（本丸）');
{
  const world = makeWorld(baseSheets());
  const sb = makeSandbox(world);
  const rs = runConcurrent(sb, world, 'addAbsence', [ABS_REQ, ABS_REQ, ABS_REQ]);
  ok(absRows(world) === 1, 'addAbsence 同時3件 → append は1行だけ');
  ok(rs.filter(function (r) { return r && r.success === true; }).length === 1, 'success:true は1件だけ');
  ok(rs.filter(function (r) { return r && r.success === false; }).length === 2, '残り2件は success:false');
}
{
  const world = makeWorld(baseSheets());
  const sb = makeSandbox(world);
  const rs = runConcurrent(sb, world, 'addWish', [WISH_REQ, WISH_REQ, WISH_REQ]);
  ok(wishRows(world) === 1, 'addWish 同時3件 → append は1行だけ');
  ok(logRows(world) === 1, 'addWish 同時3件 → 変更履歴も1行だけ');
  ok(rs.filter(function (r) { return r && r.success === true; }).length === 1, 'success:true は1件だけ');
}
// 本番の addWish 事故（2026-04-19 3秒で4件）に合わせた4連射
{
  const world = makeWorld(baseSheets());
  const sb = makeSandbox(world);
  runConcurrent(sb, world, 'addWish', [WISH_REQ, WISH_REQ, WISH_REQ, WISH_REQ]);
  ok(wishRows(world) === 1, 'addWish 同時4件でも append は1行だけ（2026-04-19 事故の再現形）');
}

// ---------- 4. タイムアウト時に appendRow されない ----------
console.log('\n[4] ロック取得タイムアウト');
{
  const world = makeWorld(baseSheets(), { lockAlwaysTimeout: true });
  const sb = makeSandbox(world);
  const r = runSequential(sb, world, 'addAbsence', [ABS_REQ])[0];
  ok(r && r.success === false, 'addAbsence タイムアウトは success:false');
  ok(String(r.message).indexOf('混み合っています') >= 0, 'タイムアウト文言が仕様どおり');
  ok(absRows(world) === 0, 'タイムアウト時は append されない');
  ok(world.lockEvents.indexOf('acquire') < 0, 'ロックを取得していない');
}
{
  const world = makeWorld(baseSheets(), { lockAlwaysTimeout: true });
  const sb = makeSandbox(world);
  const r = runSequential(sb, world, 'addWish', [WISH_REQ])[0];
  ok(r && r.success === false, 'addWish タイムアウトは success:false');
  ok(String(r.message).indexOf('混み合っています') >= 0, 'タイムアウト文言が仕様どおり');
  ok(wishRows(world) === 0, 'タイムアウト時は append されない');
  ok(logRows(world) === 0, 'タイムアウト時は変更履歴も書かれない');
}

// ---------- 5. 例外時にロックが解放される ----------
console.log('\n[5] 例外時のロック解放（デッドロック防止）');
{
  const world = makeWorld(baseSheets(), { appendThrows: '外せない予定' });
  const sb = makeSandbox(world);
  const r = runSequential(sb, world, 'addAbsence', [ABS_REQ])[0];
  ok(r && r.thrown === true, 'addAbsence: appendRow の例外は握り潰さず伝播する');
  ok(world.locked === false, '例外後にロックが解放されている');
  const acq = world.lockEvents.filter(function (e) { return e === 'acquire'; }).length;
  const rel = world.lockEvents.filter(function (e) { return e === 'release'; }).length;
  ok(acq === 1 && rel === 1, 'acquire/release が1:1（try/finally が効いている）');
}
{
  const world = makeWorld(baseSheets(), { appendThrows: 'シフト希望' });
  const sb = makeSandbox(world);
  const r = runSequential(sb, world, 'addWish', [WISH_REQ])[0];
  ok(r && r.thrown === true, 'addWish: appendRow の例外は握り潰さず伝播する');
  ok(world.locked === false, '例外後にロックが解放されている');
  const acq = world.lockEvents.filter(function (e) { return e === 'acquire'; }).length;
  const rel = world.lockEvents.filter(function (e) { return e === 'release'; }).length;
  ok(acq === 1 && rel === 1, 'acquire/release が1:1（try/finally が効いている）');
}
// 例外の後でも次のリクエストが通る＝ロックが残っていない
{
  const world = makeWorld(baseSheets(), { appendThrows: '外せない予定' });
  const sb = makeSandbox(world);
  runSequential(sb, world, 'addAbsence', [ABS_REQ]);
  world.appendThrows = null;
  const r2 = runSequential(sb, world, 'addAbsence', [ABS_REQ])[0];
  ok(r2 && r2.success === true, '例外の直後でも次の登録が成功する（ロック残留なし）');
}

// ---------- 6. 通知はロック外で撃たれる（保持時間を延ばさない） ----------
console.log('\n[6] 通知(LINE/Gmail)の発火位置');
{
  // 社員同士の被り: 勝又(社員)が登録済みの日に 星野(社員)が申請 → ブロック＋通知
  const sheets = baseSheets();
  sheets['シフト希望'].push(['2026-09', '勝又', 10, new Date()]);
  sheets['LINE登録'].push(['勝又', 'Uxxxxdummy']);
  const world = makeWorld(sheets);
  const sb = makeSandbox(world);
  const r = runSequential(sb, world, 'addWish', [{ staff: '星野', month: '2026-09', day: 10 }])[0];
  ok(r && r.blocked === true, '社員同士の被りは従来どおり blocked');
  ok(wishRows(world) === 1, 'ブロック時は append されない');
  ok(world.notifyEvents.length > 0, '通知が発火している（従来どおり）');
  const inLock = world.notifyEvents.filter(function (e) { return e.lockedAtCall; }).length;
  ok(inLock === 0, '通知はすべてロック解放後に撃たれている（ロック保持時間を延ばさない）');
}

console.log('\n----------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
console.log('本番シートへの書き込み: 0（全てインメモリ）');
console.log('実通知の発火: 0（UrlFetchApp/GmailApp はモック）');
process.exit(fail === 0 ? 0 : 1);
