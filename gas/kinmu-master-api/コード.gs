// ===== 職員マスタ 読み取りAPI (kinmu-master-api) =====
// 勤務形態一覧表＋サ体加算判定システムの土台。第1弾＝読み取りのみ。
// 書き込みAPIは作らない（doPost なし）。シートの編集は人が直接行う。
//
// 対象スプレッドシート: 「職員マスタ」
//   https://docs.google.com/spreadsheets/d/1XSO23GeHaZUykYhgorzw9_y1ZFiOBEFH397hao9q68w/edit
//
// ★ 初回セットアップ手順（Windows で実施）:
//   1. script.google.com で新規プロジェクトを作成（スタンドアロン）
//   2. このファイルの内容を貼り付けて保存
//   3. エディタで setupSheets() を実行 → 承認 → 実行ログにトークンとシート情報が出る
//        - 「設定」シートが作られる
//        - 「職員マスタ」に入力規則（職種プルダウン／区分A-D）が張られる
//        - KINMU_MASTER_TOKEN が未発行なら自動発行される
//   4. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
//        - 次のユーザーとして実行: 自分
//        - アクセスできるユーザー: 全員
//   5. 実行ログの token を控える。呼び出しは必ず ?token=... を付ける
//
// ★ 呼び出し例:
//   GET  {webAppUrl}?token=XXXX                 … 全職員（退職者含む）
//   GET  {webAppUrl}?token=XXXX&activeOnly=1    … 在籍者のみ
//   GET  {webAppUrl}?token=XXXX&callback=cb     … JSONP
//
// 秘密はコードに直書きしない（CLAUDE.md 秘密情報ハードルール）。トークンは Script Properties。

var SPREADSHEET_ID = '1XSO23GeHaZUykYhgorzw9_y1ZFiOBEFH397hao9q68w';
var SHEET_STAFF    = '職員マスタ';
var SHEET_SETTINGS = '設定';
var PROP_TOKEN     = 'KINMU_MASTER_TOKEN';

// 2026-08-05 社長判断3: 職種③の3列を右端に追加。既存14列の並びは動かさない。
var STAFF_HEADERS = [
  '氏名', 'カナ', '入職日', '退職日',
  '職種①', '勤務形態区分①', '比率①',
  '職種②', '勤務形態区分②', '比率②',
  '日次ルールタグ', '保有資格', 'シフト用役割', '備考',
  '職種③', '勤務形態区分③', '比率③'
];
// doGet が必須とするのは元の14列だけ。③列が未追加のシートでも読めるようにする。
var STAFF_HEADERS_REQUIRED = STAFF_HEADERS.slice(0, 14);

// 職種は入力規則でこの6つに固定する
var SHOKUSHU_LIST = ['管理者', '生活相談員', '看護職員', '介護職員', '機能訓練指導員', '送迎(基準外)'];
// 勤務形態区分（標準様式1 (7)欄）。定義は「設定」シートの 区分A〜D_定義 に置く。
var KUBUN_LIST = ['A', 'B', 'C', 'D'];

// 「設定」シートの初期値。すべて後から変更可能。
// 状態: 確定 / 暫定（裏取り待ち） / 未確定（値そのものが決まっていない）
var SETTINGS_HEADERS = ['設定キー', '値', '単位・形式', '状態', '備考'];
var SETTINGS_ROWS = [
  ['AM時間窓_開始',      '09:00',  'HH:MM',              '確定',
    '[確定] 指示書。中島さん版JSONの実値とも一致'],
  ['AM時間窓_終了',      '12:30',  'HH:MM',              '確定',
    '[確定] 指示書。中島さん版JSONの実値とも一致'],
  ['PM時間窓_開始',      '13:30',  'HH:MM',              '確定',
    '[確定] 指示書。中島さん版JSONの実値とも一致'],
  ['PM時間窓_終了',      '17:00',  'HH:MM',              '確定',
    '[確定] 指示書。中島さん版JSONの実値とも一致'],

  // 2026-08-05 社長判断4: 分母は用途別に2つ持つ。40 と 160 は「不一致」ではなく「別用途」。
  ['常勤所定_週時間_一覧表用',    40,  '時間/週', '確定',
    '[確定] 勤務形態一覧表の分母。様式(12)週平均勤務時間数の基準。AM/PMフォーマット.xlsx AX6=40 と一致'],
  ['常勤所定_月時間_加算判定用', 160, '時間/月', '暫定',
    '★暫定。サービス提供体制強化加算の常勤換算の分母。AM/PMフォーマット.xlsx BB6=160 由来。' +
    '東松山市の最新様式＋就業規則の裏取り後に確定（クロが別途担当）。週40との差は別用途によるもので不一致ではない'],

  // 2026-08-05 社長判断5: 端数処理は「仮:未確定」のまま維持。触らない。
  ['端数処理_方式',      '要確認', '切上/切捨/四捨五入', '未確定',
    '★未確定のまま維持（社長判断5）。第2弾の計算エンジン実装前に確定が必要。中島さん版は四捨五入だった'],
  ['端数処理_桁数',      '要確認', '小数第N位',          '未確定',
    '★未確定のまま維持（社長判断5）。中島さん版は小数第2位(toFixed(2))だった'],

  // 2026-08-05 社長判断2: A/B/C/D の定義を確定。人の頭に置かずここに書く。
  ['区分A_定義', '常勤・専従',   '凡例', '確定', '[確定] 標準様式1(7)勤務形態欄'],
  ['区分B_定義', '常勤・兼務',   '凡例', '確定', '[確定] 標準様式1(7)勤務形態欄。比嘉さんはこれ'],
  ['区分C_定義', '非常勤・専従', '凡例', '確定', '[確定] 標準様式1(7)勤務形態欄'],
  ['区分D_定義', '非常勤・兼務', '凡例', '確定', '[確定] 標準様式1(7)勤務形態欄'],

  ['AM_サービス提供時間', '要確認', 'HH:MM-HH:MM', '未確定',
    '★AMフォーマット.xlsx AU14-AY14 は 09:00-12:00（勤務時間窓 09:00-12:30 とは別物）'],
  ['PM_サービス提供時間', '要確認', 'HH:MM-HH:MM', '未確定',
    '★PMフォーマット.xlsx AU14-AY14 は 13:30-16:30（勤務時間窓 13:30-17:00 とは別物）']
];

// 日次ルールタグのうち「職種そのものが日ごとに切り替わる」もの。
// これを持つ行は比率をマスタで固定しない（第2弾エンジンが日ごとに決める）。
//   相談員条件 … 下浦・喜多のいずれか出勤→介護職員／両名不在→生活相談員（勝又・星野）
// ※「看護2名条件」（比嘉）は職種を切り替えないのでここには入れない。
var TAGS_SWITCHING_SHOKUSHU = ['相談員条件'];

// 職種スロット。①は必須、②③は空でよい。
var SHOKUSHU_SLOTS = [
  ['職種①', '勤務形態区分①', '比率①'],
  ['職種②', '勤務形態区分②', '比率②'],
  ['職種③', '勤務形態区分③', '比率③']
];

// 2026-08-05 社長判断1・3 のシート反映内容。applyDecisions20260805() が書き込む。
// 勝又・星野の日次ルール（下浦・喜多のいずれか出勤→介護職員／両名不在→生活相談員）は
// エンジン側（第2弾）で実装する。マスタは職種2枠＋タグだけを持つ。
var DECISIONS_20260805 = {
  '勝又裕子':   { '職種①': '介護職員',   '職種②': '生活相談員' },
  '星野友太':   { '職種①': '介護職員',   '職種②': '生活相談員' },
  '石丸美幸':   { '職種①': '生活相談員' },
  '田中美奈子': { '職種①': '看護職員', '職種②': '機能訓練指導員', '職種③': '介護職員' },
  '伊得たか子': { '職種①': '看護職員', '職種②': '機能訓練指導員', '職種③': '介護職員' }
};

/* ============================================================
   読み取りAPI
   ============================================================ */

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var callback = p.callback || null;

  try {
    var expected = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
    if (!expected) {
      return respond({ ok: false, error: 'トークン未発行です。エディタで setupSheets() を実行してください' }, callback);
    }
    if (String(p.token || '') !== expected) {
      return respond({ ok: false, error: 'unauthorized' }, callback);
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    var sh = ss.getSheetByName(SHEET_STAFF);
    if (!sh) return respond({ ok: false, error: 'シート「' + SHEET_STAFF + '」が見つかりません' }, callback);

    var data = sh.getDataRange().getValues();
    if (data.length < 2) return respond({ ok: true, staff: [], counts: zeroCounts_() }, callback);

    var headers = data[0].map(function (h) { return String(h).trim(); });
    var idx = {};
    for (var h = 0; h < headers.length; h++) idx[headers[h]] = h;

    var missing = STAFF_HEADERS_REQUIRED.filter(function (name) { return !(name in idx); });
    if (missing.length) {
      return respond({ ok: false, error: '想定の列が見つかりません: ' + missing.join(', '), headers: headers }, callback);
    }

    var activeOnly = String(p.activeOnly || '') === '1';

    var staff = [];
    var yokakuninTotal = 0;
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var name = String(row[idx['氏名']] || '').trim();
      if (!name) continue;

      // 退職判定は「退職日セルが空でないこと」。日付が未確定（"要確認"）でも退職者として扱う。
      // normDate_ は "要確認" に '' を返すため、これで判定すると退職者が在籍に混ざる。
      var taishokuRaw = cell_(row[idx['退職日']]);
      var taishokubi = normDate_(row[idx['退職日']]);
      var isRetired = taishokuRaw !== '';
      if (activeOnly && isRetired) continue;

      var rec = {
        氏名: name,
        カナ: cell_(row[idx['カナ']]),
        入職日: normDate_(row[idx['入職日']]),
        退職日: taishokubi,           // 日付として読めたときだけ入る。未確定なら ''
        退職: isRetired,              // 退職日セルが空でなければ true
        退職日未確定: isRetired && taishokubi === '',
        職種: [],
        日次ルールタグ: splitList_(row[idx['日次ルールタグ']]),
        // 「資格名:取得日」形式 → [{ name, acquiredOn }]。取得日が未確定なら acquiredOn は ''
        // ★第2弾: 資格判定は必ず「対象月時点で acquiredOn を過ぎているか」で行う。
        //   マスタの現在値を全期間に適用しないこと（バックログが過大になる）。
        保有資格: parseQualifications_(row[idx['保有資格']]),
        シフト用役割: splitList_(row[idx['シフト用役割']]),
        備考: cell_(row[idx['備考']])
      };

      // 職種①②③を配列に畳む。職種名が空のスロット、シートに無い③列は落とす。
      SHOKUSHU_SLOTS.forEach(function (trio) {
        if (!(trio[0] in idx)) return;              // ③列が未追加のシート
        var nm = cell_(row[idx[trio[0]]]);
        if (!nm || nm === '要確認') return;
        rec.職種.push({
          職種: nm,
          勤務形態区分: (trio[1] in idx) ? cell_(row[idx[trio[1]]]) : '',
          比率: (trio[2] in idx) ? numOrNull_(row[idx[trio[2]]]) : null
        });
      });

      // 未確定の項目を機械的に拾う（要確認一覧の単一の正）
      rec.要確認 = collectYokakunin_(row, idx);
      yokakuninTotal += rec.要確認.length;

      staff.push(rec);
    }

    var st = readSettings_(ss);
    var out = {
      ok: true,
      generatedAt: new Date().toISOString(),
      spreadsheetId: SPREADSHEET_ID,
      settings: st.flat,
      settingsMeta: st.meta,
      staff: staff,
      counts: {
        total: staff.length,
        active: staff.filter(function (s) { return !s.退職; }).length,
        retired: staff.filter(function (s) { return s.退職; }).length,
        要確認項目: yokakuninTotal
      }
    };
    return respond(out, callback);

  } catch (err) {
    return respond({ ok: false, error: String(err && err.message ? err.message : err) }, callback);
  }
}

// 「設定」シートを読む。
//   flat: { キー: 値 }                         … 従来どおり
//   meta: { キー: {値,単位,状態,備考} }        … 状態(確定/暫定/未確定)まで含む
// 無ければどちらも空オブジェクト。
function readSettings_(ss) {
  var out = { flat: {}, meta: {} };
  var sh = ss.getSheetByName(SHEET_SETTINGS);
  if (!sh) return out;
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var k = String(rows[i][0] || '').trim();
    if (!k) continue;
    out.flat[k] = cell_(rows[i][1]);
    out.meta[k] = {
      値: cell_(rows[i][1]),
      単位: cell_(rows[i][2]),
      状態: cell_(rows[i][3]),
      備考: cell_(rows[i][4])
    };
  }
  return out;
}

// 空欄／"要確認" の項目名を返す。プルダウン列は空欄＝未確定として扱う。
function collectYokakunin_(row, idx) {
  var out = [];
  var at = function (k) { return (k in idx) ? cell_(row[idx[k]]) : ''; };

  // 自由入力列: "要確認" という文字列が入っていたら未確定
  ['カナ', '入職日', '保有資格', 'シフト用役割'].forEach(function (k) {
    if (at(k) === '要確認') out.push(k);
  });
  // 退職日は「空欄＝在籍中」が正常。"要確認" のときだけ未確定
  if (at('退職日') === '要確認') out.push('退職日');

  // 資格名は確定していても取得日が未確定なら別項目として立てる。
  // ★第2弾で「対象月時点で取得済みか」を判定するのに取得日が要る。
  var quals = parseQualifications_(at('保有資格'));
  if (quals.length && quals.some(function (q) { return !q.acquiredOn; })) out.push('資格取得日');

  // 2026-08-05 社長判断1: 「職種そのものが日ごとに切り替わる」タグを持つ行は、
  // 比率をマスタで固定しないのが正（第2弾エンジンが日ごとに決める）。比率の空欄を未確定に数えない。
  // タグを持つだけでは免除しない。例: 比嘉さんの「看護2名条件」は職種を切り替えないので、
  // 管理者と機能訓練指導員の配分（比率①）は未確定のまま残す必要がある。
  var tags = splitList_(at('日次ルールタグ'));
  var hasDailyRule = tags.some(function (t) { return TAGS_SWITCHING_SHOKUSHU.indexOf(t) >= 0; });

  // 職種①は必須。②③は「職種名が入っているのに区分/比率が空」のときだけ未確定。
  SHOKUSHU_SLOTS.forEach(function (trio, i) {
    var isFirst = (i === 0);
    if (!isFirst && !(trio[0] in idx)) return;        // ③列が未追加のシート
    if (!isFirst && at(trio[0]) === '') return;       // 職種名が空のスロットは問わない
    if (isFirst && at(trio[0]) === '') out.push(trio[0]);
    if (at(trio[1]) === '') out.push(trio[1]);
    if (!hasDailyRule && at(trio[2]) === '') out.push(trio[2]);
  });
  return out;
}

/* ============================================================
   セットアップ（Windows のGASエディタで1回だけ実行）
   ============================================================ */

function setupSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // --- 職員マスタ: 体裁と入力規則 ---
  var sh = ss.getSheetByName(SHEET_STAFF);
  if (!sh) throw new Error('シート「' + SHEET_STAFF + '」がありません。CSV取込のシート名を確認してください');

  var lastRow = Math.max(sh.getLastRow(), 2);
  var dvEnd = lastRow + 20; // 新入職の追加ぶんも先回りで規則を張る

  // --- 2026-08-05 社長判断3: 職種③の3列を右端に追加（既存列は動かさない・冪等）---
  var headerNow = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var added = [];
  ['職種③', '勤務形態区分③', '比率③'].forEach(function (h) {
    if (headerNow.indexOf(h) >= 0) return;          // 既にあるなら何もしない
    var col = sh.getLastColumn() + 1;
    if (sh.getMaxColumns() < col) sh.insertColumnsAfter(sh.getMaxColumns(), 1);
    sh.getRange(1, col).setValue(h);
    headerNow.push(h);
    added.push(h);
  });

  // 追加後のヘッダで列位置を引く（位置決め打ちにしない）
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var colOf = function (name) { return hdr.indexOf(name) + 1; }; // 見つからなければ 0

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, hdr.length)
    .setFontWeight('bold').setBackground('#2C5F7D').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');

  var widths = {
    '氏名': 110, 'カナ': 140, '入職日': 100, '退職日': 100,
    '職種①': 130, '勤務形態区分①': 120, '比率①': 60,
    '職種②': 130, '勤務形態区分②': 120, '比率②': 60,
    '日次ルールタグ': 130, '保有資格': 240, 'シフト用役割': 170, '備考': 520,
    '職種③': 130, '勤務形態区分③': 120, '比率③': 60
  };
  Object.keys(widths).forEach(function (name) {
    var c = colOf(name);
    if (c > 0) sh.setColumnWidth(c, widths[name]);
  });

  // 職種①②③のプルダウン
  var dvShokushu = SpreadsheetApp.newDataValidation()
    .requireValueInList(SHOKUSHU_LIST, true)
    .setAllowInvalid(false)
    .setHelpText('職種は ' + SHOKUSHU_LIST.join(' / ') + ' から選んでください')
    .build();
  // 勤務形態区分①②③のプルダウン
  var dvKubun = SpreadsheetApp.newDataValidation()
    .requireValueInList(KUBUN_LIST, true)
    .setAllowInvalid(false)
    .setHelpText('勤務形態区分は A=常勤専従 / B=常勤兼務 / C=非常勤専従 / D=非常勤兼務')
    .build();
  SHOKUSHU_SLOTS.forEach(function (trio) {
    var cs = colOf(trio[0]);
    var ck = colOf(trio[1]);
    if (cs > 0) sh.getRange(2, cs, dvEnd - 1, 1).setDataValidation(dvShokushu);
    if (ck > 0) sh.getRange(2, ck, dvEnd - 1, 1).setDataValidation(dvKubun);
  });

  // "要確認" を含むセルを黄色で目立たせる（"介護福祉士:要確認" のような部分一致も拾う）
  var range = sh.getRange(2, 1, dvEnd - 1, hdr.length);
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('要確認')
    .setBackground('#FFF3CD')
    .setRanges([range])
    .build();
  sh.setConditionalFormatRules([rule]);

  // --- 設定シート ---
  var st = ss.getSheetByName(SHEET_SETTINGS);
  if (!st) st = ss.insertSheet(SHEET_SETTINGS);
  st.clear();
  st.getRange(1, 1, 1, SETTINGS_HEADERS.length).setValues([SETTINGS_HEADERS]);
  st.getRange(2, 1, SETTINGS_ROWS.length, SETTINGS_HEADERS.length).setValues(SETTINGS_ROWS);
  st.setFrozenRows(1);
  st.getRange(1, 1, 1, SETTINGS_HEADERS.length)
    .setFontWeight('bold').setBackground('#2C5F7D').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  st.setColumnWidth(1, 210);
  st.setColumnWidth(2, 110);
  st.setColumnWidth(3, 170);
  st.setColumnWidth(4, 80);
  st.setColumnWidth(5, 520);

  var stRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('要確認')
    .setBackground('#FFF3CD')
    .setRanges([st.getRange(2, 1, SETTINGS_ROWS.length, SETTINGS_HEADERS.length)])
    .build();
  st.setConditionalFormatRules([stRule]);

  // 取込時にできた既定の空シートを畳む
  ['シート1', 'Sheet1'].forEach(function (n) {
    var d = ss.getSheetByName(n);
    if (d && ss.getSheets().length > 2) ss.deleteSheet(d);
  });

  // --- トークン（未発行なら発行）---
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(PROP_TOKEN);
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty(PROP_TOKEN, token);
  }

  var info = {
    追加した列: added.length ? added : '（なし・既に追加済み）',
    sheetUrl: ss.getUrl(),
    spreadsheetId: ss.getId(),
    sheets: ss.getSheets().map(function (s) {
      return { name: s.getName(), rows: s.getLastRow(), cols: s.getLastColumn() };
    }),
    token: token,
    次にやること: 'applyDecisions20260805() を実行して 2026-08-05 の判断をデータへ反映する'
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

/* ============================================================
   2026-08-05 社長判断のデータ反映（setupSheets() の後に1回実行）
   ------------------------------------------------------------
   構造（列・書式・入力規則）は setupSheets()、データは本関数。分けてある。
   何度実行しても同じ結果になる（冪等）。人が手で直した値は上書きしない。
   ============================================================ */

function applyDecisions20260805() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_STAFF);
  if (!sh) throw new Error('シート「' + SHEET_STAFF + '」がありません');

  var data = sh.getDataRange().getValues();
  var hdr = data[0].map(function (h) { return String(h).trim(); });
  var idx = {};
  hdr.forEach(function (h, i) { idx[h] = i; });

  ['職種③', '勤務形態区分③', '比率③'].forEach(function (h) {
    if (!(h in idx)) throw new Error('列「' + h + '」がありません。先に setupSheets() を実行してください');
  });

  var changed = [];
  var skipped = [];

  for (var r = 1; r < data.length; r++) {
    var name = String(data[r][idx['氏名']] || '').trim();
    if (!name) continue;

    // --- 判断1・3: 職種の確定 ---
    var dec = DECISIONS_20260805[name];
    if (dec) {
      Object.keys(dec).forEach(function (col) {
        var cur = cell_(data[r][idx[col]]);
        if (cur === dec[col]) return;                       // 既に反映済み
        if (cur !== '' && cur !== '要確認') {                // 人が別の値を入れている
          skipped.push(name + ' ' + col + ': 既存値「' + cur + '」を尊重（判断値は「' + dec[col] + '」）');
          return;
        }
        sh.getRange(r + 1, idx[col] + 1).setValue(dec[col]);
        changed.push(name + ' ' + col + ' → ' + dec[col]);
      });
    }

    // --- 保有資格を「資格名:取得日」形式へ移行 ---
    var qCur = cell_(data[r][idx['保有資格']]);
    var qNew = migrateQualCell_(name, qCur);
    if (qNew !== null && qNew !== qCur) {
      sh.getRange(r + 1, idx['保有資格'] + 1).setValue(qNew);
      changed.push(name + ' 保有資格 → ' + qNew);
    }
  }

  var info = {
    反映: changed.length ? changed : '（なし・既に反映済み）',
    見送り: skipped.length ? skipped : '（なし）',
    件数: { 反映: changed.length, 見送り: skipped.length }
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

// 「資格名」→「資格名:取得日」への移行。既に ":" を含むなら触らない（冪等）。
// 変更不要なら null を返す。
function migrateQualCell_(name, cur) {
  // 比嘉さんは 2026-08-05 判断で両資格保持が確定。取得日つきで確定値を書く。
  if (name === '比嘉学') {
    var fixed = '柔道整復師:要確認,介護福祉士:2026-03-26';
    if (cur.indexOf('介護福祉士:2026-03-26') >= 0 && cur.indexOf('柔道整復師') >= 0) return null;
    return fixed;
  }
  if (cur === '' || cur === '要確認') return null;   // 資格名そのものが未確定。触らない
  if (cur.indexOf(':') >= 0) return null;            // 移行済み
  return cur.split(/[,、，]/)
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x; })
    .map(function (x) { return x + ':要確認'; })
    .join(',');
}

// 現在のトークン確認用
function showToken() {
  var t = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
  Logger.log('TOKEN = ' + t);
  return t;
}

// 実測の行数・列数・要確認件数を出す（完了報告の根拠用）
function verify() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_STAFF);
  var data = sh.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var idx = {};
  headers.forEach(function (h, i) { idx[h] = i; });

  var active = 0, retired = 0, yokakunin = 0;
  for (var i = 1; i < data.length; i++) {
    if (!String(data[i][idx['氏名']] || '').trim()) continue;
    if (cell_(data[i][idx['退職日']]) !== '') retired++;
    else active++;
    for (var c = 0; c < headers.length; c++) if (cell_(data[i][c]) === '要確認') yokakunin++;
  }

  var st = ss.getSheetByName(SHEET_SETTINGS);
  var out = {
    sheetUrl: ss.getUrl(),
    職員マスタ: { rows: sh.getLastRow(), cols: sh.getLastColumn(), headers: headers },
    在籍: active,
    退職: retired,
    '要確認セル数(職員マスタ)': yokakunin,
    設定: st ? { rows: st.getLastRow(), cols: st.getLastColumn() } : '未作成（setupSheets() を実行してください）'
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================
   ヘルパ
   ============================================================ */

function respond(data, callback) {
  var json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function cell_(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// 日付セルは Date で返ることも文字列で返ることもある。YYYY-MM-DD に正規化する。
// "要確認" のような未確定文字列は日付ではないので '' を返す（退職判定を汚さないため）。
function normDate_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (!m) return '';
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

function numOrNull_(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

// 保有資格セル「資格名:取得日,資格名:取得日」を [{name, acquiredOn}] にする。
//   '介護福祉士:2026-03-26'  → [{name:'介護福祉士', acquiredOn:'2026-03-26'}]
//   '柔道整復師:要確認'      → [{name:'柔道整復師', acquiredOn:''}]
//   '介護福祉士'（旧形式）   → [{name:'介護福祉士', acquiredOn:''}]
//   '要確認'                 → []  ※資格名そのものが未確定
function parseQualifications_(v) {
  var s = cell_(v);
  if (!s || s === '要確認') return [];
  return s.split(/[,、，]/).map(function (chunk) {
    var parts = chunk.split(/[:：]/);
    var nm = (parts[0] || '').trim();
    var on = normDate_((parts[1] || '').trim());
    return nm ? { name: nm, acquiredOn: on } : null;
  }).filter(function (x) { return x; });
}

// カンマ区切り（全角読点・全角カンマも許容）を配列にする。"要確認" は空配列にせず残す。
function splitList_(v) {
  var s = cell_(v);
  if (!s) return [];
  return s.split(/[,、，]/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}

function zeroCounts_() {
  return { total: 0, active: 0, retired: 0, 要確認項目: 0 };
}
