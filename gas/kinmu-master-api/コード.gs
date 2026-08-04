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

var STAFF_HEADERS = [
  '氏名', 'カナ', '入職日', '退職日',
  '職種①', '勤務形態区分①', '比率①',
  '職種②', '勤務形態区分②', '比率②',
  '日次ルールタグ', '保有資格', 'シフト用役割', '備考'
];

// 職種は入力規則でこの6つに固定する
var SHOKUSHU_LIST = ['管理者', '生活相談員', '看護職員', '介護職員', '機能訓練指導員', '送迎(基準外)'];
// 勤務形態区分（標準様式1 (7)欄）
var KUBUN_LIST = ['A', 'B', 'C', 'D'];

// 「設定」シートの初期値。すべて後から変更可能。
// ★印は未確定＝第2弾の計算エンジンを作る前に社長の確定が要る。
var SETTINGS_HEADERS = ['設定キー', '値', '単位・形式', '備考'];
var SETTINGS_ROWS = [
  ['AM時間窓_開始',      '09:00',  'HH:MM',              '[確定] 指示書。中島さん版JSONの実値とも一致'],
  ['AM時間窓_終了',      '12:30',  'HH:MM',              '[確定] 指示書。中島さん版JSONの実値とも一致'],
  ['PM時間窓_開始',      '13:30',  'HH:MM',              '[確定] 指示書。中島さん版JSONの実値とも一致'],
  ['PM時間窓_終了',      '17:00',  'HH:MM',              '[確定] 指示書。中島さん版JSONの実値とも一致'],
  ['常勤所定_週時間',     40,      '時間/週',            '[確定] 指示書。AM/PMフォーマット.xlsx の AX6=40 と一致'],
  ['常勤所定_月時間',     160,     '時間/月',            'AM/PMフォーマット.xlsx の BB6=160。※週40×4.33≒173.2 と合わないため整合は要確認'],
  ['端数処理_方式',      '要確認', '切上/切捨/四捨五入', '★未確定（指示書に「仮:未確定」と明記）。第2弾の計算エンジン実装前に確定が必要'],
  ['端数処理_桁数',      '要確認', '小数第N位',          '★未確定。中島さん版は四捨五入・小数第2位(toFixed(2))だったが正としてよいかは未確認'],
  ['区分A_定義',        '要確認', '凡例',               '★標準様式1(7)勤務形態欄。慣例では A=常勤・専従だが社長未確認'],
  ['区分B_定義',        '要確認', '凡例',               '★慣例では B=常勤・兼務。比嘉さんに B を割当済みのため要確定'],
  ['区分C_定義',        '要確認', '凡例',               '★慣例では C=非常勤・専従'],
  ['区分D_定義',        '要確認', '凡例',               '★慣例では D=非常勤・兼務'],
  ['AM_サービス提供時間', '要確認', 'HH:MM-HH:MM',        '★AMフォーマット.xlsx AU14-AY14 は 09:00-12:00（勤務時間窓 09:00-12:30 とは別物）'],
  ['PM_サービス提供時間', '要確認', 'HH:MM-HH:MM',        '★PMフォーマット.xlsx AU14-AY14 は 13:30-16:30（勤務時間窓 13:30-17:00 とは別物）']
];

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

    var missing = STAFF_HEADERS.filter(function (name) { return !(name in idx); });
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
        保有資格: splitList_(row[idx['保有資格']]),
        シフト用役割: splitList_(row[idx['シフト用役割']]),
        備考: cell_(row[idx['備考']])
      };

      // 職種①②を配列に畳む。職種名が空のスロットは落とす。
      [['職種①', '勤務形態区分①', '比率①'], ['職種②', '勤務形態区分②', '比率②']]
        .forEach(function (trio) {
          var nm = cell_(row[idx[trio[0]]]);
          if (!nm || nm === '要確認') return;
          rec.職種.push({
            職種: nm,
            勤務形態区分: cell_(row[idx[trio[1]]]),
            比率: numOrNull_(row[idx[trio[2]]])
          });
        });

      // 未確定の項目を機械的に拾う（要確認一覧の単一の正）
      rec.要確認 = collectYokakunin_(row, idx);
      yokakuninTotal += rec.要確認.length;

      staff.push(rec);
    }

    var out = {
      ok: true,
      generatedAt: new Date().toISOString(),
      spreadsheetId: SPREADSHEET_ID,
      settings: readSettings_(ss),
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

// 「設定」シートを { キー: 値 } で返す。無ければ空オブジェクト。
function readSettings_(ss) {
  var sh = ss.getSheetByName(SHEET_SETTINGS);
  if (!sh) return {};
  var rows = sh.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < rows.length; i++) {
    var k = String(rows[i][0] || '').trim();
    if (!k) continue;
    map[k] = cell_(rows[i][1]);
  }
  return map;
}

// 空欄／"要確認" の項目名を返す。プルダウン列は空欄＝未確定として扱う。
function collectYokakunin_(row, idx) {
  var out = [];
  // 自由入力列: "要確認" という文字列が入っていたら未確定
  ['カナ', '入職日', '保有資格', 'シフト用役割'].forEach(function (k) {
    if (cell_(row[idx[k]]) === '要確認') out.push(k);
  });
  // 退職日は「空欄＝在籍中」が正常。"要確認" のときだけ未確定
  if (cell_(row[idx['退職日']]) === '要確認') out.push('退職日');
  // プルダウン列: 空欄＝未確定（プルダウンを6職種/A-D固定に保つため "要確認" を入れられない）
  ['職種①', '勤務形態区分①', '比率①'].forEach(function (k) {
    if (cell_(row[idx[k]]) === '') out.push(k);
  });
  // 職種②側は「職種②が入っているのに区分/比率が空」のときだけ未確定
  if (cell_(row[idx['職種②']]) !== '') {
    ['勤務形態区分②', '比率②'].forEach(function (k) {
      if (cell_(row[idx[k]]) === '') out.push(k);
    });
  }
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

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, STAFF_HEADERS.length)
    .setFontWeight('bold').setBackground('#2C5F7D').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');

  var widths = [110, 140, 100, 100, 130, 120, 60, 130, 120, 60, 130, 130, 170, 520];
  for (var c = 0; c < widths.length; c++) sh.setColumnWidth(c + 1, widths[c]);

  // 職種① (E列=5) / 職種② (H列=8)
  var dvShokushu = SpreadsheetApp.newDataValidation()
    .requireValueInList(SHOKUSHU_LIST, true)
    .setAllowInvalid(false)
    .setHelpText('職種は ' + SHOKUSHU_LIST.join(' / ') + ' から選んでください')
    .build();
  sh.getRange(2, 5, dvEnd - 1, 1).setDataValidation(dvShokushu);
  sh.getRange(2, 8, dvEnd - 1, 1).setDataValidation(dvShokushu);

  // 勤務形態区分① (F列=6) / ② (I列=9)
  var dvKubun = SpreadsheetApp.newDataValidation()
    .requireValueInList(KUBUN_LIST, true)
    .setAllowInvalid(false)
    .setHelpText('勤務形態区分は A / B / C / D から選んでください')
    .build();
  sh.getRange(2, 6, dvEnd - 1, 1).setDataValidation(dvKubun);
  sh.getRange(2, 9, dvEnd - 1, 1).setDataValidation(dvKubun);

  // "要確認" のセルを黄色で目立たせる
  var range = sh.getRange(2, 1, dvEnd - 1, STAFF_HEADERS.length);
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('要確認')
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
  st.setColumnWidth(1, 170);
  st.setColumnWidth(2, 110);
  st.setColumnWidth(3, 170);
  st.setColumnWidth(4, 520);

  var stRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('要確認')
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
    sheetUrl: ss.getUrl(),
    spreadsheetId: ss.getId(),
    sheets: ss.getSheets().map(function (s) {
      return { name: s.getName(), rows: s.getLastRow(), cols: s.getLastColumn() };
    }),
    token: token
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
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

// カンマ区切り（全角読点・全角カンマも許容）を配列にする。"要確認" は空配列にせず残す。
function splitList_(v) {
  var s = cell_(v);
  if (!s) return [];
  return s.split(/[,、，]/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}

function zeroCounts_() {
  return { total: 0, active: 0, retired: 0, 要確認項目: 0 };
}
