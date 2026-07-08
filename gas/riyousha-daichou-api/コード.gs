// ===== 利用者台帳 GAS v3 =====
// 口腔チェック・体重チェック等で利用者一覧を取得するためのGAS
// v2: 利用曜日・午前/午後の情報も返す
// v3 (2026-05-25): ケアマネ事業所/担当者・計画書開始月・利用開始月を追加
//
// ★ デプロイ手順:
// 1. 利用者台帳スプレッドシートの「拡張機能」→「Apps Script」を開く
// 2. 既存のコードをこの内容に置き換える
// 3. 「デプロイ」→「デプロイを管理」→ 既存のデプロイを編集
// 4. バージョン: 「新しいバージョン」を選択
// 5. 「デプロイ」をクリック
// ※ URLは変わらないので、アプリ側の変更は不要

var SPREADSHEET_ID = '1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0';
var SHEET_NAME = '利用者台帳';

function doGet(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  // 2026-07-08: 中止者も返すオプトイン。既定（未指定）は従来応答から1バイトも変えない。
  var includeEnded = !!(e && e.parameter && e.parameter.includeEnded === '1');

  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return respond({ error: 'シートが見つかりません' }, callback);

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return respond({ users: [] }, callback);

    var headers = data[0].map(function(h) { return String(h).trim(); });

    // 列を検索
    var nameCol = findCol(headers, ['名前', '氏名', '利用者名']);
    var kanaCol = findCol(headers, ['氏名（カナ）', 'カナ', 'フリガナ', 'ふりがな']);
    var careCol = findColPartial(headers, '介護度');
    if (careCol < 0) careCol = findColPartial(headers, '要介護');
    if (careCol < 0) careCol = findColPartial(headers, '認定');
    var statusCol = findColPartial(headers, 'ステータス');
    if (statusCol < 0) statusCol = findColPartial(headers, '利用状況');
    var daysCol = findCol(headers, ['利用曜日']);
    var ampmCol = findCol(headers, ['午前/午後', '午前午後']);
    var planStartCol = findColPartial(headers, '計画書開始');
    var startDateCol = findColPartial(headers, '利用開始');
    var cmOfficeCol = findCol(headers, ['ケアマネ事業所名', 'ケアマネ事業所', '事業所名', '居宅']);
    if (cmOfficeCol < 0) cmOfficeCol = findColPartial(headers, 'ケアマネ事業所');
    if (cmOfficeCol < 0) cmOfficeCol = findColPartial(headers, '居宅');
    if (cmOfficeCol < 0) cmOfficeCol = findColPartial(headers, '包括');
    var cmNameCol = findCol(headers, ['ケアマネ担当者名', 'ケアマネ担当者', 'ケアマネ担当', 'ケアマネ氏名', 'ケアマネ名', '担当ケアマネ']);
    if (cmNameCol < 0) cmNameCol = findColPartial(headers, 'ケアマネ担当');
    if (cmNameCol < 0) cmNameCol = findColPartial(headers, 'ケアマネ氏');

    if (nameCol < 0) return respond({ error: '「氏名」列が見つかりません' }, callback);

    // includeEnded のときだけ中止履歴（同一スプレッドシート）を直読して索引を作る。
    var chushi = null;
    if (includeEnded) {
      var chushiSheet = ss.getSheetByName('中止履歴');
      chushi = chushiSheet
        ? buildChushiIndex(chushiSheet.getDataRange().getValues())
        : { map: {}, counts: {}, duplicates: [], totalRows: 0, headerOk: false };
    }

    var users = [];
    var ledgerNames = [];   // 診断用（中止・終了・卒業も含む台帳の全氏名）
    var statusCounts = {};  // 診断用（利用ステータスの値分布）
    for (var i = 1; i < data.length; i++) {
      var name = String(data[i][nameCol] || '').trim();
      if (!name) continue;
      ledgerNames.push(name);

      // 終了・中止・卒業はスキップ（includeEnded のときだけ返す）
      var status = statusCol >= 0 ? String(data[i][statusCol] || '').trim() : '';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      if (statusCol >= 0) {
        if (status.indexOf('終了') >= 0 || status.indexOf('中止') >= 0 || status.indexOf('卒業') >= 0) {
          if (!includeEnded) continue;
        }
      }

      var kana = kanaCol >= 0 ? String(data[i][kanaCol] || '').trim() : '';
      var care = 'kaigo';
      if (careCol >= 0) {
        var careRaw = String(data[i][careCol] || '').trim();
        if (careRaw.indexOf('支援') >= 0 || careRaw.indexOf('事業対象') >= 0) care = 'shien';
      }
      var days = daysCol >= 0 ? String(data[i][daysCol] || '').trim() : '';
      var ampm = ampmCol >= 0 ? String(data[i][ampmCol] || '').trim() : '';

      var planStart = '';
      if (planStartCol >= 0 && data[i][planStartCol]) {
        var pVal = data[i][planStartCol];
        if (pVal instanceof Date) {
          planStart = Utilities.formatDate(pVal, 'Asia/Tokyo', 'yyyy-MM');
        } else {
          var pm = String(pVal).trim().match(/(\d{4})[-\/](\d{1,2})/);
          if (pm) planStart = pm[1] + '-' + String(pm[2]).padStart(2, '0');
        }
      }

      var startDate = '';
      if (startDateCol >= 0 && data[i][startDateCol]) {
        var sVal = data[i][startDateCol];
        if (sVal instanceof Date) {
          startDate = Utilities.formatDate(sVal, 'Asia/Tokyo', 'yyyy-MM');
        } else {
          var sm = String(sVal).trim().match(/(\d{4})[-\/](\d{1,2})/);
          if (sm) startDate = sm[1] + '-' + String(sm[2]).padStart(2, '0');
        }
      }

      var cmOffice = cmOfficeCol >= 0 ? String(data[i][cmOfficeCol] || '').trim() : '';
      var cmName = cmNameCol >= 0 ? String(data[i][cmNameCol] || '').trim() : '';

      var u = {
        name: name,
        kana: kana,
        care: care,
        days: days,
        ampm: ampm,
        planStart: planStart,
        startDate: startDate,
        cmOffice: cmOffice,
        cmName: cmName
      };
      // 既定応答にはキーを1つも足さない。includeEnded のときだけ付与する。
      if (includeEnded) {
        u.status = status;
        u.hasChushiRow = Object.prototype.hasOwnProperty.call(chushi.map, name);
        u.lastUseDate = u.hasChushiRow ? chushi.map[name] : '';   // 行なし・空欄はどちらも ''
      }
      users.push(u);
    }

    // カナ順ソート
    users.sort(function(a, b) {
      var sa = a.kana || a.name;
      var sb = b.kana || b.name;
      return sa.localeCompare(sb, 'ja');
    });

    // 既定はここで従来どおり { users: [...] } のみを返す（キー追加なし）。
    if (!includeEnded) return respond({ users: users }, callback);

    // includeEnded のときだけ診断を添える（未マッチ行・重複行を黙って落とさないため）。
    var dg = diagnoseChushi(chushi, ledgerNames);
    return respond({
      users: users,
      chushi: {
        headerOk: chushi.headerOk,
        totalRows: chushi.totalRows,
        unmatched: dg.unmatched,
        duplicates: dg.duplicates,
        statusCounts: statusCounts
      }
    }, callback);

  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

function respond(data, callback) {
  var json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function findCol(headers, candidates) {
  for (var i = 0; i < headers.length; i++) {
    for (var j = 0; j < candidates.length; j++) {
      if (headers[i] === candidates[j]) return i;
    }
  }
  return -1;
}

function findColPartial(headers, keyword) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].indexOf(keyword) >= 0) return i;
  }
  return -1;
}

// =====================================================================
// 中止履歴の突合（2026-07-08 追加）
//   ?includeEnded=1 のときだけ使う。既定の応答には一切影響しない。
//   突合キーは「利用者名」の完全一致（台帳に「伊藤フミ子」「伊藤ふみ子」等の
//   別人が実在するため、部分一致・あいまい正規化は使わない）。
//   テスト: scripts/test-users-api-chushi.js（この3関数を実コード抽出して検証）
// =====================================================================

// 最終利用日を 'YYYY-MM-DD' に正規化。空欄・解釈不能は '' を返す（捨てない）。
function normLastUseDate(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  }
  var s = String(v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  return '';
}

// 中止履歴シートの getValues() から「利用者名 → 最終利用日」索引を作る。
// 最終利用日が空欄の行も key として保持する（'' で返す）。同名複数行は最新日を採用。
function buildChushiIndex(values) {
  var result = { map: {}, counts: {}, duplicates: [], totalRows: 0, headerOk: false };
  if (!values || values.length < 1) return result;

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var dateCol = -1, nameCol = -1;
  for (var c = 0; c < headers.length; c++) {
    if (headers[c] === '最終利用日') dateCol = c;
    if (headers[c] === '利用者名') nameCol = c;
  }
  if (dateCol < 0 || nameCol < 0) return result;   // headerOk=false のまま返す（黙って空にしない）
  result.headerOk = true;

  for (var i = 1; i < values.length; i++) {
    var name = String(values[i][nameCol] || '').trim();
    if (!name) continue;
    result.totalRows++;
    result.counts[name] = (result.counts[name] || 0) + 1;

    var d = normLastUseDate(values[i][dateCol]);
    var prev = result.map[name];
    if (prev === undefined || (d && d > prev)) result.map[name] = d;   // 最新日を採用（空欄には負けない）
  }

  for (var n in result.counts) {
    if (result.counts[n] > 1) result.duplicates.push({ name: n, count: result.counts[n] });
  }
  return result;
}

// 台帳に存在しない中止履歴行・同名複数行を診断として返す（黙って落とさないため）。
function diagnoseChushi(index, ledgerNames) {
  var set = {};
  var names = ledgerNames || [];
  for (var i = 0; i < names.length; i++) set[String(names[i]).trim()] = true;

  var unmatched = [];
  for (var n in index.map) {
    if (!set[n]) unmatched.push(n);
  }
  return { unmatched: unmatched, duplicates: index.duplicates.slice() };
}
