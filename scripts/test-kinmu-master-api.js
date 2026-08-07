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
    '設定': makeSheet(opts.settingsValues || SETTINGS_VALUES)
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
  eq('職種①', taka.職種[0], { 職種: '看護職員', 比率: 50, 勤務形態区分: '' });
  eq('職種②', taka.職種[1], { 職種: '機能訓練指導員', 比率: 50, 勤務形態区分: '' });
  // 2026-08-06: 区分は導出値になったので手入力の未確定としては数えない。
  eq('区分は要確認に載せない', taka.要確認.includes('勤務形態区分①'), false);
  // 週所定時間列そのものが無い旧構成のシートでは、週所定時間も立てない（後方互換）
  eq('列が無ければ週所定時間も立てない', taka.要確認.includes('週所定時間'), false);
  eq('比率②は埋まっているので要確認に載らない', taka.要確認.includes('比率②'), false);

  const higa = r.staff.find((s) => s.氏名 === '比嘉学');
  eq('職種②が空のスロットは落ちる', higa.職種.length, 1);
  eq('比率①が空欄なら要確認に載る', higa.要確認.includes('比率①'), true);
  eq('区分②は導出値なので要確認に載せない', higa.要確認.includes('勤務形態区分②'), false);

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
  eq('保有資格は単一でも配列', taka.保有資格, [{ name: '看護師', acquiredOn: '' }]);
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

/* ============================================================
   2026-08-05 社長判断5件の反映ぶん
   ============================================================ */

// 職種③まである新構成のシート
const STAFF_HEADERS_V2 = STAFF_HEADERS.concat(['職種③', '勤務形態区分③', '比率③']);

function makeStaffValuesV2() {
  return [
    STAFF_HEADERS_V2,
    // 勝又: 判断1 → 職種①介護職員 / 職種②生活相談員。比率は日次ルールで決まるので空
    ['勝又裕子', 'かつまたゆうこ', '要確認', '', '介護職員', '', '', '生活相談員', '', '',
      '相談員条件', '介護福祉士', '相談,介福,送迎兼務', 'memo', '', '', ''],
    // 田中: 判断3 → 3職種を収容
    ['田中美奈子', 'たなかみなこ', '要確認', '要確認', '看護職員', '', '', '機能訓練指導員', '', '',
      '', '看護師', '', 'memo', '介護職員', '', ''],
    // 髙山: 職種③なし。区分②が空なので要確認
    ['髙山奈緒美', 'たかやまなおみ', '要確認', '', '看護職員', '', 50, '機能訓練指導員', '', 50,
      '', '看護師', '看護,機訓', 'memo', '', '', '']
  ];
}

const SETTINGS_VALUES_V2 = [
  ['設定キー', '値', '単位・形式', '状態', '備考'],
  ['常勤所定_週時間_一覧表用', 40, '時間/週', '確定', '様式(12)週平均勤務時間数の基準'],
  ['常勤所定_月時間_加算判定用', 160, '時間/月', '暫定', '東松山市最新様式＋就業規則の裏取り後に確定'],
  ['区分B_定義', '常勤・兼務', '凡例', '確定', ''],
  ['端数処理_方式', '要確認', '切上/切捨/四捨五入', '未確定', '']
];

// ===== 11. 職種③（判断3）=====
{
  const ctx = makeCtx({ staffValues: makeStaffValuesV2() });
  const r = callGet(ctx, { token: 'tok123' });
  eq('職種③まで読める → ok', r.ok, true);

  const tanaka = r.staff.find((s) => s.氏名 === '田中美奈子');
  eq('3職種が配列になる', tanaka.職種.length, 3);
  eq('職種③', tanaka.職種[2], { 職種: '介護職員', 比率: null, 勤務形態区分: '' });
  eq('区分③は導出値なので要確認に載せない', tanaka.要確認.includes('勤務形態区分③'), false);
  eq('職種③があり比率③が空なら要確認', tanaka.要確認.includes('比率③'), true);

  const taka = r.staff.find((s) => s.氏名 === '髙山奈緒美');
  eq('職種③が空なら2職種のまま', taka.職種.length, 2);
  eq('職種③が空なら区分③は要確認に載せない', taka.要確認.includes('勤務形態区分③'), false);
}

// ===== 12. 旧構成（職種③なし）でも壊れない =====
{
  const ctx = makeCtx(); // 14列のまま
  const r = callGet(ctx, { token: 'tok123' });
  eq('職種③列が無いシートでも ok', r.ok, true);
  const taka = r.staff.find((s) => s.氏名 === '髙山奈緒美');
  eq('旧構成でも2職種読める', taka.職種.length, 2);
  eq('旧構成で職種③関連は要確認に出ない', taka.要確認.some((k) => /③/.test(k)), false);
}

// ===== 13. 日次ルールタグがある行は比率を要確認にしない（判断1）=====
{
  const ctx = makeCtx({ staffValues: makeStaffValuesV2() });
  const r = callGet(ctx, { token: 'tok123' });

  const katsu = r.staff.find((s) => s.氏名 === '勝又裕子');
  eq('職種①②が入った', katsu.職種.map((x) => x.職種), ['介護職員', '生活相談員']);
  eq('タグ持ちは比率①を要確認にしない', katsu.要確認.includes('比率①'), false);
  eq('タグ持ちは比率②も要確認にしない', katsu.要確認.includes('比率②'), false);
  eq('タグ持ちでも区分は導出なので要確認に出ない', katsu.要確認.includes('勤務形態区分①'), false);

  const tanaka = r.staff.find((s) => s.氏名 === '田中美奈子');
  eq('タグ無しなら比率①は要確認に残る', tanaka.要確認.includes('比率①'), true);
}
// 免除は「職種が日ごとに切り替わるタグ」だけ。看護2名条件（比嘉）は免除しない。
{
  const ctx = makeCtx();
  eq('免除対象タグは相談員条件のみ', ctx.TAGS_SWITCHING_SHOKUSHU, ['相談員条件']);
  const r = callGet(ctx, { token: 'tok123' });
  const higa = r.staff.find((s) => s.氏名 === '比嘉学');
  eq('看護2名条件は比率①を免除しない（管理者と機訓の配分が未確定のため）',
    higa.要確認.includes('比率①'), true);
}

// ===== 14. 設定シートの状態列（判断2・4）=====
{
  const ctx = makeCtx({ settingsValues: SETTINGS_VALUES_V2 });
  const r = callGet(ctx, { token: 'tok123' });
  eq('settings は従来どおり キー→値', r.settings['常勤所定_週時間_一覧表用'], '40');
  eq('settingsMeta に状態が入る', r.settingsMeta['常勤所定_月時間_加算判定用'].状態, '暫定');
  eq('settingsMeta に単位が入る', r.settingsMeta['常勤所定_月時間_加算判定用'].単位, '時間/月');
  eq('確定した凡例が読める', r.settings['区分B_定義'], '常勤・兼務');
  eq('未確定は状態=未確定', r.settingsMeta['端数処理_方式'].状態, '未確定');
}

// ===== 15. 設定シートの既定値（判断2・4・5）=====
{
  const ctx = makeCtx();
  const rows = ctx.SETTINGS_ROWS;
  const byKey = {};
  rows.forEach((r) => { byKey[r[0]] = r; });

  // 2026-08-07 決着②で用途別2キーは廃止。週所定の1本だけ持ち、月分母は計算で出す。
  eq('常勤所定は週40hの1本', byKey['常勤所定_週時間'][1], 40);
  ok('用途別キーは残さない',
    !byKey['常勤所定_週時間_一覧表用'] && !byKey['常勤所定_月時間_加算判定用']);

  eq('区分A凡例が確定値で入る', byKey['区分A_定義'][1], '常勤・専従');
  eq('区分B凡例が確定値で入る', byKey['区分B_定義'][1], '常勤・兼務');
  eq('区分C凡例が確定値で入る', byKey['区分C_定義'][1], '非常勤・専従');
  eq('区分D凡例が確定値で入る', byKey['区分D_定義'][1], '非常勤・兼務');
  eq('区分凡例は確定', byKey['区分A_定義'][3], '確定');

  // 2026-08-07 決着③で確定（過去提出物の実物26行で裏取り済み）
  eq('端数処理_方式は切り捨てで確定', byKey['端数処理_方式'][1], '切り捨て');
  eq('端数処理_桁数は小数第1位で確定', byKey['端数処理_桁数'][1], '小数第1位');
}

// ===== 16. 判断の反映表（applyDecisions20260805 が書く中身）=====
{
  const ctx = makeCtx();
  const d = ctx.DECISIONS_20260805;
  ok('反映表がある', !!d);
  eq('対象は5名', Object.keys(d).length, 5);
  eq('勝又', d['勝又裕子'], { '職種①': '介護職員', '職種②': '生活相談員' });
  eq('星野', d['星野友太'], { '職種①': '介護職員', '職種②': '生活相談員' });
  eq('石丸', d['石丸美幸'], { '職種①': '生活相談員' });
  eq('田中', d['田中美奈子'], { '職種①': '看護職員', '職種②': '機能訓練指導員', '職種③': '介護職員' });
  eq('伊得', d['伊得たか子'], { '職種①': '看護職員', '職種②': '機能訓練指導員', '職種③': '介護職員' });

  const all = [];
  Object.keys(d).forEach((n) => { Object.keys(d[n]).forEach((k) => all.push(d[n][k])); });
  ok('反映値はすべて職種プルダウンの6択に収まる',
    all.every((v) => ctx.SHOKUSHU_LIST.indexOf(v) >= 0), JSON.stringify(all));
}

// ===== 17. STAFF_HEADERS は既存列を動かさない（追加のみ）=====
{
  const ctx = makeCtx();
  eq('先頭14列は元のまま', ctx.STAFF_HEADERS.slice(0, 14), STAFF_HEADERS);
  eq('追加列は右端に積む', ctx.STAFF_HEADERS.slice(14),
    ['職種③', '勤務形態区分③', '比率③', '週所定時間', '固定勤務パターン']);
  eq('列数は19', ctx.STAFF_HEADERS.length, 19);
}

// ===== 18. 保有資格 = 「資格名:取得日」形式（スキーマ変更）=====
{
  const vals = [
    STAFF_HEADERS_V2,
    ['比嘉学', 'ひがまなぶ', '要確認', '', '管理者', 'B', '', '', '', '',
      '看護2名条件', '柔道整復師:要確認,介護福祉士:2026-03-26', '機訓,介福', 'memo', '', '', ''],
    ['髙山奈緒美', 'たかやまなおみ', '要確認', '', '看護職員', '', 50, '機能訓練指導員', '', 50,
      '', '看護師:2020-04-01', '看護,機訓', 'memo', '', '', ''],
    // 旧形式（コロン無し）も壊れずに読めること
    ['下浦理絵', 'しもうらりえ', '要確認', '', '生活相談員', '', 100, '', '', '',
      '', '介護福祉士', '介福,相談', 'memo', '', '', ''],
    // 資格名そのものが未確定
    ['喜多美咲', '要確認', '要確認', '', '生活相談員', '', 100, '', '', '',
      '', '要確認', '要確認', 'memo', '', '', '']
  ];
  const ctx = makeCtx({ staffValues: vals });
  const r = callGet(ctx, { token: 'tok123' });

  const higa = r.staff.find((s) => s.氏名 === '比嘉学');
  eq('比嘉は2資格を保持', higa.保有資格, [
    { name: '柔道整復師', acquiredOn: '' },
    { name: '介護福祉士', acquiredOn: '2026-03-26' }
  ]);
  eq('取得日が1つでも未確定なら資格取得日が要確認', higa.要確認.includes('資格取得日'), true);
  eq('資格名は確定しているので保有資格は要確認に出ない', higa.要確認.includes('保有資格'), false);

  const taka = r.staff.find((s) => s.氏名 === '髙山奈緒美');
  eq('取得日が揃っていれば要確認に出ない', taka.要確認.includes('資格取得日'), false);
  eq('単一資格もオブジェクト配列', taka.保有資格, [{ name: '看護師', acquiredOn: '2020-04-01' }]);

  const shimo = r.staff.find((s) => s.氏名 === '下浦理絵');
  eq('旧形式は acquiredOn 空で読める', shimo.保有資格, [{ name: '介護福祉士', acquiredOn: '' }]);
  eq('旧形式は資格取得日が要確認', shimo.要確認.includes('資格取得日'), true);

  const kita = r.staff.find((s) => s.氏名 === '喜多美咲');
  eq('資格名が要確認なら空配列', kita.保有資格, []);
  eq('資格名が要確認なら保有資格が要確認', kita.要確認.includes('保有資格'), true);
  eq('資格名が未確定なら資格取得日は立てない', kita.要確認.includes('資格取得日'), false);
}

// ===== 19. 資格セルの移行ロジック（冪等）=====
{
  const ctx = makeCtx();
  const m = ctx.migrateQualCell_;

  eq('比嘉は両資格＋取得日を確定値で書く', m('比嘉学', '要確認'),
    '柔道整復師:要確認,介護福祉士:2026-03-26');
  eq('比嘉は反映済みなら触らない（冪等）',
    m('比嘉学', '柔道整復師:要確認,介護福祉士:2026-03-26'), null);

  eq('旧形式に :要確認 を足す', m('髙山奈緒美', '看護師'), '看護師:要確認');
  eq('複数資格も各々に足す', m('誰か', '介護福祉士,社会福祉士'), '介護福祉士:要確認,社会福祉士:要確認');
  eq('移行済みは触らない（冪等）', m('髙山奈緒美', '看護師:2020-04-01'), null);
  eq('資格名が未確定なら触らない', m('喜多美咲', '要確認'), null);
  eq('空欄も触らない', m('誰か', ''), null);
}

// ===== 20. 比嘉さんが介護福祉士を保有＝サ体加算の分子判定に効く（第2弾申し送りの前提）=====
{
  const vals = [
    STAFF_HEADERS_V2,
    ['比嘉学', 'ひがまなぶ', '要確認', '', '管理者', 'B', '', '', '', '',
      '看護2名条件', '柔道整復師:要確認,介護福祉士:2026-03-26', '機訓,介福', 'memo', '', '', '']
  ];
  const ctx = makeCtx({ staffValues: vals });
  const r = callGet(ctx, { token: 'tok123' });
  const higa = r.staff.find((s) => s.氏名 === '比嘉学');
  // 職種名は「管理者」だが、資格判定は職種名ではなく保有資格で行う
  eq('職種名には介護職員が無い', higa.職種.map((x) => x.職種).includes('介護職員'), false);
  eq('保有資格には介護福祉士がある', higa.保有資格.some((q) => q.name === '介護福祉士'), true);
  eq('介護福祉士の取得日が取れる',
    higa.保有資格.find((q) => q.name === '介護福祉士').acquiredOn, '2026-03-26');
}

/* ============================================================
   区分①の機械導出（2026-08-06）
   A=常勤かつ専従 / B=常勤かつ兼務 / C=非常勤かつ専従 / D=非常勤かつ兼務
   常勤 = 週所定時間 >= max(事業所の常勤所定週時間, 32)   ← 埼玉県基準
   兼務 = 職種が2つ以上
   ============================================================ */

const STAFF_HEADERS_V3 = STAFF_HEADERS_V2.concat(['週所定時間']);

// ===== 21. deriveKubun_ 単体 =====
{
  const ctx = makeCtx();
  const d = ctx.deriveKubun_;

  eq('常勤×専従 → A', d(40, 1, 40), 'A');
  eq('常勤×兼務 → B', d(40, 2, 40), 'B');
  eq('非常勤×専従 → C', d(20, 1, 40), 'C');
  eq('非常勤×兼務 → D', d(15, 2, 40), 'D');
  eq('3職種でも兼務', d(15, 3, 40), 'D');
  eq('ちょうど基準時間なら常勤', d(40, 1, 40), 'A');
  eq('基準を1分でも下回れば非常勤', d(39.9, 1, 40), 'C');
  eq('週所定時間が不明なら空', d(null, 1, 40), '');
  eq('週所定時間が空文字でも空', d('', 2, 40), '');
  eq('職種0でも専従扱いで返す', d(40, 0, 40), 'A');
}

// ===== 22. 常勤基準時間（週32時間の下限）=====
{
  const ctx = makeCtx();
  const t = ctx.fulltimeThreshold_;
  eq('事業所所定40h → 基準40h', t(40), 40);
  eq('事業所所定32h → 基準32h', t(32), 32);
  eq('事業所所定30h（32未満）→ 基準は32h', t(30), 32);
  eq('事業所所定が不明 → 32h を基本にする', t(null), 32);
}

// ===== 23. doGet で区分が導出される =====
{
  const vals = [
    STAFF_HEADERS_V3,
    // 勝又: 週40h・2職種 → B
    ['勝又裕子', 'かつまたゆうこ', '2025-11-03', '', '介護職員', '', '', '生活相談員', '', '',
      '相談員条件', '介護福祉士:要確認', '相談,介福', 'memo', '', '', '', 40],
    // 下浦: 週20.25h・1職種 → C
    ['下浦理絵', 'しもうらりえ', '2024-09-03', '', '生活相談員', '', 100, '', '', '',
      '', '介護福祉士:要確認', '介福,相談', 'memo', '', '', '', 20.25],
    // 髙山: 週15h・2職種 → D
    ['髙山奈緒美', 'たかやまなおみ', '2022-09-01', '', '看護職員', '', 50, '機能訓練指導員', '', 50,
      '', '看護師:要確認', '看護,機訓', 'memo', '', '', '', 15],
    // 比嘉: 週所定時間なし → 導出できない
    ['比嘉学', 'ひがまなぶ', '要確認', '', '管理者', '', '', '', '', '',
      '看護2名条件', '柔道整復師:要確認,介護福祉士:2026-03-26', '機訓,介福', 'memo', '', '', '', '']
  ];
  const ctx = makeCtx({ staffValues: vals });
  const r = callGet(ctx, { token: 'tok123' });

  const katsu = r.staff.find((s) => s.氏名 === '勝又裕子');
  eq('勝又=B', katsu.勤務形態区分, 'B');
  eq('各職種スロットにも同じ区分が入る', katsu.職種.map((x) => x.勤務形態区分), ['B', 'B']);
  eq('週所定時間が返る', katsu.週所定時間, 40);
  eq('常勤フラグ', katsu.常勤, true);
  eq('導出できたので区分は要確認に出ない', katsu.要確認.includes('勤務形態区分①'), false);

  const shimo = r.staff.find((s) => s.氏名 === '下浦理絵');
  eq('下浦=C（非常勤・専従）', shimo.勤務形態区分, 'C');
  eq('下浦は非常勤', shimo.常勤, false);

  const taka = r.staff.find((s) => s.氏名 === '髙山奈緒美');
  eq('髙山=D（非常勤・兼務）', taka.勤務形態区分, 'D');

  const higa = r.staff.find((s) => s.氏名 === '比嘉学');
  eq('週所定時間が無ければ区分は空', higa.勤務形態区分, '');
  eq('導出できない人は週所定時間が要確認', higa.要確認.includes('週所定時間'), true);
  eq('区分そのものは要確認に出さない（手入力項目ではないため）',
    higa.要確認.includes('勤務形態区分①'), false);
}

// ===== 24. 区分は手入力項目ではない（シートの値より導出が優先）=====
{
  const vals = [
    STAFF_HEADERS_V3,
    // シートに誤って A が手入力されているが、週15h・2職種なので D が正
    ['髙山奈緒美', 'たかやまなおみ', '2022-09-01', '', '看護職員', 'A', 50, '機能訓練指導員', 'A', 50,
      '', '看護師:要確認', '看護,機訓', 'memo', '', '', '', 15]
  ];
  const ctx = makeCtx({ staffValues: vals });
  const r = callGet(ctx, { token: 'tok123' });
  eq('手入力のAより導出のDが優先される', r.staff[0].勤務形態区分, 'D');
}

// ===== 25. 有給管理簿からの取り込み表 =====
{
  const ctx = makeCtx();
  const y = ctx.YUKYU_SNAPSHOT_20260806;
  ok('有給管理簿スナップショットがある', !!y);
  eq('10名ぶん', Object.keys(y).length, 10);
  eq('下浦', y['下浦理絵'], { 入社日: '2024-09-03', 週所定時間: 20.25 });
  eq('勝又', y['勝又裕子'], { 入社日: '2025-11-03', 週所定時間: 40 });
  eq('星野', y['星野友太'], { 入社日: '2026-02-13', 週所定時間: 40 });
  eq('林', y['林秀明'], { 入社日: '2026-01-30', 週所定時間: 6 });
  ok('有給管理簿に居ない人は含めない',
    !y['比嘉学'] && !y['伊澤博'] && !y['喜多美咲']);
}

// ===== 26. 2026-08-06 の確定値（喜多の役割・退職者の比率）=====
{
  const ctx = makeCtx();
  const d = ctx.DECISIONS_20260806;
  ok('反映表がある', !!d);
  eq('喜多のシフト用役割は下浦と同値', d['喜多美咲']['シフト用役割'], '介福,相談');
  eq('石丸は1職種なので100', d['石丸美幸']['比率①'], 100);
  eq('田中は3職種で34/33/33', [d['田中美奈子']['比率①'], d['田中美奈子']['比率②'], d['田中美奈子']['比率③']], [34, 33, 33]);
  eq('伊得も34/33/33', [d['伊得たか子']['比率①'], d['伊得たか子']['比率②'], d['伊得たか子']['比率③']], [34, 33, 33]);
  const sum = [34, 33, 33].reduce((a, b) => a + b, 0);
  eq('均等割の合計は100', sum, 100);
}

// ===== 27. 参考様式1 の実物から確定した端数処理 =====
{
  const ctx = makeCtx();
  const t = ctx.truncate1_;
  // 実物（令和3年4月・鳩山町 計画）で26行すべて一致した挙動
  eq('15/4=3.75 → 3.7（切り捨て・四捨五入ではない）', t(15 / 4), 3.7);
  eq('61.8/4=15.45 → 15.4', t(61.8 / 4), 15.4);
  eq('3/4=0.75 → 0.7', t(3 / 4), 0.7);
  eq('39/4=9.75 → 9.7', t(39 / 4), 9.7);
  eq('19.5/4=4.875 → 4.8', t(19.5 / 4), 4.8);
  eq('20/40=0.5 → 0.5', t(20 / 40), 0.5);
  eq('15.4/40=0.385 → 0.3', t(15.4 / 40), 0.3);
  eq('10/40=0.25 → 0.2', t(10 / 40), 0.2);
  eq('2.6/40=0.065 → 0', t(2.6 / 40), 0);
  eq('割り切れる値はそのまま', t(4), 4);
}

/* ============================================================
   2026-08-07 方式の決着＋比嘉さん確定＋固定勤務パターン
   ============================================================ */

// ===== 28. 月の分母は月ごとに算出（40h固定でも160h固定でもない）=====
{
  const ctx = makeCtx();
  const m = ctx.monthlyDenominator_;

  eq('31日の月: 40×31/7', m(40, 31), 40 * 31 / 7);
  eq('30日の月: 40×30/7', m(40, 30), 40 * 30 / 7);
  eq('28日の月: 40×28/7 = 160', m(40, 28), 160);
  eq('29日の月(閏2月)', m(40, 29), 40 * 29 / 7);
  eq('週所定が不明なら null', m(null, 31), null);
  eq('日数が不明なら null', m(40, null), null);

  // 旧様式の160hは「4週=28日ぶん」だった。暦月では月ごとに変わる。
  ok('31日の月は160hより大きい', m(40, 31) > 160);
  ok('30日の月も160hより大きい', m(40, 30) > 160);
}

// ===== 29. 当月日数 =====
{
  const ctx = makeCtx();
  const d = ctx.daysInMonth_;
  eq('2026-08 は31日', d('2026-08'), 31);
  eq('2026-02 は28日', d('2026-02'), 28);
  eq('2024-02 は29日（閏年）', d('2024-02'), 29);
  eq('2026-04 は30日', d('2026-04'), 30);
  eq('不正な入力は null', d('xxxx'), null);
}

// ===== 30. 固定勤務パターンのパース =====
{
  const ctx = makeCtx();
  const p = ctx.parseFixedPattern_;

  eq('標準形', p('40h / 08:30-17:30 × 週5日'),
    { raw: '40h / 08:30-17:30 × 週5日', 週時間: 40, 開始: '08:30', 終了: '17:30', 週日数: 5 });
  eq('全角チルダ・半角xでも読める', p('40h / 08:30~17:30 x 週5日'),
    { raw: '40h / 08:30~17:30 x 週5日', 週時間: 40, 開始: '08:30', 終了: '17:30', 週日数: 5 });
  eq('小数の週時間', p('37.5h / 09:00-17:00 × 週5日').週時間, 37.5);
  eq('空欄は null', p(''), null);
  eq('要確認は null', p('要確認'), null);
  eq('形式が崩れていても raw は残す', p('なんか変な値').raw, 'なんか変な値');
  eq('形式が崩れていれば週時間は null', p('なんか変な値').週時間, null);
}

// ===== 31. 固定勤務パターンが API に出る =====
{
  const H = STAFF_HEADERS_V2.concat(['週所定時間', '固定勤務パターン']);
  const vals = [
    H,
    ['比嘉学', 'ひがまなぶ', '要確認', '', '管理者', '', 20, '機能訓練指導員', '', 80,
      '看護2名条件', '柔道整復師:要確認,介護福祉士:2026-03-26', '機訓,介福', 'memo',
      '', '', '', 40, '40h / 08:30-17:30 × 週5日'],
    ['下浦理絵', 'しもうらりえ', '2024-09-03', '', '生活相談員', '', 100, '', '', '',
      '', '介護福祉士:要確認', '介福,相談', 'memo', '', '', '', 20.25, '']
  ];
  const ctx = makeCtx({ staffValues: vals });
  const r = callGet(ctx, { token: 'tok123' });

  const higa = r.staff.find((s) => s.氏名 === '比嘉学');
  eq('固定勤務パターンが構造化されて返る', higa.固定勤務パターン,
    { raw: '40h / 08:30-17:30 × 週5日', 週時間: 40, 開始: '08:30', 終了: '17:30', 週日数: 5 });
  eq('打刻不要フラグ', higa.打刻対象外, true);
  eq('週40h・2職種なので区分はB', higa.勤務形態区分, 'B');
  eq('比率20:80', higa.職種.map((x) => x.比率), [20, 80]);
  eq('比率が入ったので要確認に出ない', higa.要確認.includes('比率①'), false);
  eq('週所定時間が入ったので要確認に出ない', higa.要確認.includes('週所定時間'), false);

  const shimo = r.staff.find((s) => s.氏名 === '下浦理絵');
  eq('固定パターンが無ければ null', shimo.固定勤務パターン, null);
  eq('打刻対象', shimo.打刻対象外, false);
  eq('固定パターンは要確認に立てない（打刻がある人は不要のため）',
    shimo.要確認.includes('固定勤務パターン'), false);
}

// ===== 32. 設定シートの既定値（2026-08-07 決着ぶん）=====
{
  const ctx = makeCtx();
  const byKey = {};
  ctx.SETTINGS_ROWS.forEach((r) => { byKey[r[0]] = r; });

  eq('集計期間は暦月で確定', byKey['集計期間'][1], '暦月');
  eq('集計期間は確定', byKey['集計期間'][3], '確定');

  eq('常勤所定は週40hの1本だけ持つ', byKey['常勤所定_週時間'][1], 40);
  eq('週所定は確定', byKey['常勤所定_週時間'][3], '確定');
  ok('月時間の固定値は持たない（月ごとに算出するため）',
    !byKey['常勤所定_月時間_加算判定用'] && !byKey['常勤所定_月時間']);
  ok('用途別の週時間キーも残さない', !byKey['常勤所定_週時間_一覧表用']);

  eq('月分母の算出方法を明記', byKey['月分母_算出方法'][1], '週所定時間 × 当月日数 ÷ 7');
  eq('算出方法は確定', byKey['月分母_算出方法'][3], '確定');

  eq('端数処理は切り捨てで確定', byKey['端数処理_方式'][1], '切り捨て');
  eq('端数処理の桁は小数第1位で確定', byKey['端数処理_桁数'][1], '小数第1位');
  eq('端数処理_方式は確定', byKey['端数処理_方式'][3], '確定');
  eq('端数処理_桁数は確定', byKey['端数処理_桁数'][3], '確定');
}

// ===== 33. 常勤判定は新しい設定キーを読む =====
{
  const settings = [
    ['設定キー', '値', '単位・形式', '状態', '備考'],
    ['常勤所定_週時間', 40, '時間/週', '確定', '']
  ];
  const H = STAFF_HEADERS_V2.concat(['週所定時間', '固定勤務パターン']);
  const vals = [
    H,
    ['勝又裕子', 'かつまたゆうこ', '2025-11-03', '', '介護職員', '', '', '生活相談員', '', '',
      '相談員条件', '介護福祉士:要確認', '相談,介福', 'memo', '', '', '', 40, '']
  ];
  const ctx = makeCtx({ staffValues: vals, settingsValues: settings });
  const r = callGet(ctx, { token: 'tok123' });
  eq('新キーで常勤基準が引ける', r.常勤基準_週時間, 40);
  eq('勝又=B', r.staff[0].勤務形態区分, 'B');
}
// 旧キーしか無いシートでも壊れない（後方互換）
{
  const settings = [
    ['設定キー', '値', '単位・形式', '状態', '備考'],
    ['常勤所定_週時間_一覧表用', 40, '時間/週', '確定', '']
  ];
  const H = STAFF_HEADERS_V2.concat(['週所定時間', '固定勤務パターン']);
  const vals = [
    H,
    ['勝又裕子', 'かつまたゆうこ', '2025-11-03', '', '介護職員', '', '', '生活相談員', '', '',
      '相談員条件', '介護福祉士:要確認', '相談,介福', 'memo', '', '', '', 40, '']
  ];
  const ctx = makeCtx({ staffValues: vals, settingsValues: settings });
  const r = callGet(ctx, { token: 'tok123' });
  eq('旧キーでも常勤基準が引ける', r.常勤基準_週時間, 40);
}

// ===== 34. 2026-08-07 の確定値 =====
{
  const ctx = makeCtx();
  const d = ctx.DECISIONS_20260807;
  ok('反映表がある', !!d);
  const h = d['比嘉学'];
  eq('対象は比嘉さんのみ', Object.keys(d), ['比嘉学']);
  eq('週所定時間40', h['週所定時間'], 40);
  eq('職種①=管理者', h['職種①'], '管理者');
  eq('比率①=20', h['比率①'], 20);
  eq('職種②=機能訓練指導員', h['職種②'], '機能訓練指導員');
  eq('比率②=80', h['比率②'], 80);
  eq('比率の合計は100', h['比率①'] + h['比率②'], 100);
  ok('固定勤務パターンが入る', !!h['固定勤務パターン']);
  ok('固定勤務パターンは週40hと整合',
    ctx.parseFixedPattern_(h['固定勤務パターン']).週時間 === 40);
}

console.log('\nPASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
