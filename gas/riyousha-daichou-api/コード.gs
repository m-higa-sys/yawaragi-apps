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

    var users = [];
    for (var i = 1; i < data.length; i++) {
      var name = String(data[i][nameCol] || '').trim();
      if (!name) continue;

      // 終了・中止・卒業はスキップ
      if (statusCol >= 0) {
        var status = String(data[i][statusCol] || '').trim();
        if (status.indexOf('終了') >= 0 || status.indexOf('中止') >= 0 || status.indexOf('卒業') >= 0) continue;
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

      users.push({
        name: name,
        kana: kana,
        care: care,
        days: days,
        ampm: ampm,
        planStart: planStart,
        startDate: startDate,
        cmOffice: cmOffice,
        cmName: cmName
      });
    }

    // カナ順ソート
    users.sort(function(a, b) {
      var sa = a.kana || a.name;
      var sb = b.kana || b.name;
      return sa.localeCompare(sb, 'ja');
    });

    return respond({ users: users }, callback);

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
