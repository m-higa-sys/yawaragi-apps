// gas/kinmu-master-api/コード.gs の純粋ロジックを検証する。
// GAS のグローバル（SpreadsheetApp / PropertiesService / ContentService / Utilities / Logger）を
// スタブし、実シートを模したデータで doGet の応答を確かめる。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'gas', 'kinmu-master-api', 'コード.gs');
const code = fs.readFileSync(SRC, 'utf8');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' … ' + extra : '')); }
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  ok(name, a === b, 'actual=' + a + ' expected=' + b);
}

// ---- 実シートを模したデータ（CSV投入した内容の抜粋 + 型のばらつきを再現）----
const STAFF_HEADERS = [
  '氏名', 'カナ', '入職日', '退職日',
  '職種①', '勤務形態区分①', '比率①',
  '職種②', '勤務形態区分②', '比率②',
  '日次ルールタグ', '保有資格', 'シフト用役割', '備考'
];

function makeStaffValues() {
  return [
    STAFF_HEADERS,
    // 比嘉: 職種①=管理者/区分B、比率①空欄、職種②空欄、資格=要確認
    ['比嘉学', 'ひがまなぶ', '要確認', '', '管理者', 'B', '', '', '', '', '看護2名条件', '要確認', '機訓,介福', 'memo'],
    // 髙山: 2職種 50:50、区分は両方空欄
    ['髙山奈緒美', 'たかやまなおみ', '要確認', '', '看護職員', '', 50, '機能訓練指導員', '', 50, '', '看護師', '看護,機訓', 'memo'],
    // 伊澤: 入職日が Date オブジェクトで返るケース（Sheets が日付として解釈した場合）
    ['伊澤博', '要確認', new Date(2026, 7, 3), '', '送迎(基準外)', '', 100, '', '', '', '', '要確認', '送迎', 'memo'],
    // 勝又: 職種①②とも空＝未確定
    ['勝又裕子', 'かつまたゆうこ', '要確認', '', '', '', '', '', '', '', '相談員条件', '介護福祉士', '相談,介福,送迎兼務', 'memo'],
    // 田中: 退職者。退職日が "要確認"（日付未確定）
    ['田中美奈子', 'たなかみなこ', '要確認', '要確認', '', '', '', '', '', '', '', '看護師', '', 'memo'],
    // 空行（氏名なし）は無視されること
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '']
  ];
}

const SETTINGS_VALUES = [
  ['設定キー', '値', '単位・形式', '備考'],
  ['AM時間窓_開始', '09:00', 'HH:MM', ''],
  ['常勤所定_週時間', 40, '時間/週', ''],
  ['端数処理_方式', '要確認', '切上/切捨/四捨五入', '']
];

// ---- GAS スタブ ----
function makeSheet(values) {
  return {
    getDataRange: () => ({ getValues: () => values }),
    getLastRow: () => values.length,
    getLastColumn: () => values[0].length
  };
}

function makeCtx(opts) {
  opts = opts || {};
  const props = opts.props || { KINMU_MASTER_TOKEN: 'tok123' };
  const sheets = {
    '職員マスタ': makeSheet(opts.staffValues || makeStaffValues()),
    '設定': makeSheet(SETTINGS_VALUES)
  };
  if (opts.noSettings) delete sheets['設定'];

  const ctx = {
    console,
    Date,
    Object,
    JSON,
    String,
    Number,
    Array,
    isNaN,
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (n) => sheets[n] || null,
        getUrl: () => 'https://example/sheet',
        getId: () => 'SSID',
        getSheets: () => Object.keys(sheets).map((n) => ({ getName: () => n }))
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; }
      })
    },
    ContentService: {
      MimeType: { JSON: 'json', JAVASCRIPT: 'js' },
      createTextOutput: (t) => ({ _t: t, _m: null, setMimeType(m) { this._m = m; return this; } })
    },
    Utilities: {
      getUuid: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      formatDate: (d, tz, fmt) => {
        const p = (n) => ('0' + n).slice(-2);
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      }
    },
    Logger: { log: () => {} }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

function callGet(ctx, params) {
  const res = ctx.doGet({ parameter: params });
  return JSON.parse(res._t);
}

console.log('test-kinmu-master-api');

// ===== 1. 認証 =====
{
  const ctx = makeCtx();
  const noTok = callGet(ctx, {});
  eq('トークン無しは unauthorized', noTok.ok === false && noTok.error, 'unauthorized');

  const badTok = callGet(ctx, { token: 'wrong' });
  eq('誤トークンは unauthorized', badTok.error, 'unauthorized');

  const okTok = callGet(ctx, { token: 'tok123' });
  ok('正トークンは ok:true', okTok.ok === true);
}
{
  const ctx = makeCtx({ props: {} });
  const r = callGet(ctx, { token: 'anything' });
  ok('トークン未発行なら明示エラー（fail-closed）',
    r.ok === false && /setupSheets/.test(r.error), JSON.stringify(r));
}

// ===== 2. 行の取り込み =====
{
  const ctx = makeCtx();
  const r = callGet(ctx, { token: 'tok123' });
  eq('氏名が空の行は落ちる（5名）', r.staff.length, 5);
  eq('counts.total', r.counts.total, 5);
  eq('counts.active（退職日ありを除く）', r.counts.active, 4);
  eq('counts.retired', r.counts.retired, 1);
}

// ===== 3. 日付の正規化 =====
{
  const ctx = makeCtx();
  const r = callGet(ctx, { token: 'tok123' });
  const izawa = r.staff.find((s) => s.氏名 === '伊澤博');
  eq('Date オブジェクトを YYYY-MM-DD へ正規化', izawa.入職日, '2026-08-03');

  const higa = r.staff.find((s) => s.氏名 === '比嘉学');
  eq('"要確認" は日付として扱わない（入職日は空）', higa.入職日, '');
  eq('"要確認" の入職日は要確認に載る', higa.要確認.includes('入職日'), true);

  const tanaka = r.staff.find((s) => s.氏名 === '田中美奈子');
  eq('退職日が"要確認"でも退職者として数える', tanaka.退職, true);
  eq('退職日が"要確認"なら要確認に載る', tanaka.要確認.includes('退職日'), true);
}

// ===== 4. 職種の畳み込み =====
{
  const ctx = makeCtx();
  const r = callGet(ctx, { token: 'tok123' });

  const taka = r.staff.find((s) => s.氏名 === '髙山奈緒美');
  eq('2職種が配列になる', taka.職種.length, 2);
  eq('職種①', taka.職種[0], { 職種: '看護職員', 勤務形態区分: '', 比率: 50 });
  eq('職種②', taka.職種[1], { 職種: '機能訓練指導員', 勤務形態区分: '', 比率: 50 });
  eq('区分①が空欄なら要確認に載る', taka.要確認.includes('勤務形態区分①'), true);
  eq('職種②があり区分②が空なら要確認に載る', taka.要確認.includes('勤務形態区分②'), true);
  eq('比率②は埋まっているので要確認に載らない', taka.要確認.includes('比率②'), false);

  const higa = r.staff.find((s) => s.氏名 === '比嘉学');
  eq('職種②が空のスロットは落ちる', higa.職種.length, 1);
  eq('比率①が空欄なら要確認に載る', higa.要確認.includes('比率①'), true);
  eq('職種②が空なら区分②は要確認に載せない', higa.要確認.includes('勤務形態区分②'), false);

  const katsu = r.staff.find((s) => s.氏名 === '勝又裕子');
  eq('職種が1つも無ければ空配列', katsu.職種, []);
  eq('職種①が空欄なら要確認に載る', katsu.要確認.includes('職種①'), true);
}

// ===== 5. カンマ区切りの分解 =====
{
  const ctx = makeCtx();
  const r = callGet(ctx, { token: 'tok123' });
  const katsu = r.staff.find((s) => s.氏名 === '勝又裕子');
  eq('シフト用役割をカンマで分解', katsu.シフト用役割, ['相談', '介福', '送迎兼務']);
  eq('日次ルールタグも配列', katsu.日次ルールタグ, ['相談員条件']);
  const taka = r.staff.find((s) => s.氏名 === '髙山奈緒美');
  eq('保有資格は単一でも配列', taka.保有資格, ['看護師']);
  eq('空欄は空配列', taka.日次ルールタグ, []);
}

// ===== 6. activeOnly =====
{
  const ctx = makeCtx();
  const r = callGet(ctx, { token: 'tok123', activeOnly: '1' });
  eq('activeOnly=1 で退職者が消える', r.staff.length, 4);
  eq('activeOnly=1 に田中さんは居ない', r.staff.some((s) => s.氏名 === '田中美奈子'), false);
  const all = callGet(ctx, { token: 'tok123' });
  eq('既定（未指定）は退職者も返す', all.staff.some((s) => s.氏名 === '田中美奈子'), true);
}

// ===== 7. 設定シート =====
{
  const ctx = makeCtx();
  const r = callGet(ctx, { token: 'tok123' });
  eq('設定がキー→値で読める', r.settings['AM時間窓_開始'], '09:00');
  eq('数値設定も文字列で正規化', r.settings['常勤所定_週時間'], '40');
  eq('未確定の設定はそのまま"要確認"', r.settings['端数処理_方式'], '要確認');
}
{
  const ctx = makeCtx({ noSettings: true });
  const r = callGet(ctx, { token: 'tok123' });
  eq('設定シートが無くても落ちない', r.ok, true);
  eq('設定は空オブジェクト', r.settings, {});
}

// ===== 8. 列欠損の検出 =====
{
  const broken = makeStaffValues();
  broken[0] = broken[0].slice(0, 4); // 職種①以降の見出しを落とす
  const ctx = makeCtx({ staffValues: broken });
  const r = callGet(ctx, { token: 'tok123' });
  eq('想定列が無ければ ok:false', r.ok, false);
  ok('欠損した列名がエラーに出る', /職種①/.test(r.error), r.error);
}

// ===== 9. JSONP =====
{
  const ctx = makeCtx();
  const res = ctx.doGet({ parameter: { token: 'tok123', callback: 'cb' } });
  ok('callback 指定で JSONP になる', /^cb\(/.test(res._t) && res._m === 'js');
}

// ===== 10. 書き込みAPIが無いこと =====
{
  const ctx = makeCtx();
  eq('doPost は定義されていない（読み取り専用）', typeof ctx.doPost, 'undefined');
}

console.log('\nPASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
