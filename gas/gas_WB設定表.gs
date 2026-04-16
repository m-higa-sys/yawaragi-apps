// ===== WB設定表用 GAS =====
// 利用者台帳から利用者名・カナ・WB設定を取得
// WB設定の編集もGAS経由でスプレッドシートに書き込み
// ※リハブクラウドデータは使わない（利用者台帳に集約）

const SPREADSHEET_ID = '1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0';
const SHEET_MAIN = '利用者台帳';

function doGet(e) {
  var callback = e && e.parameter ? e.parameter.callback : null;
  var action = e && e.parameter ? e.parameter.action : null;

  try {
    if (action === 'save') {
      return saveWBSetting(e.parameter, callback);
    }
    return getUsers(callback);
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// === 利用者一覧＋WB設定を取得 ===
function getUsers(callback) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_MAIN);
  if (!sheet) return respond({ error: 'シート「' + SHEET_MAIN + '」が見つかりません' }, callback);

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return respond({ error: '利用者台帳にデータがありません' }, callback);

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var nameCol = findCol(headers, ['名前', '氏名']);
  var kanaCol = findCol(headers, ['氏名（カナ）', 'カナ', 'フリガナ']);
  var wbHeightCol = findColPartial(headers, 'WB身長');
  var wbStrengthCol = findColPartial(headers, 'WB強さ');
  var wbOtherCol = findColPartial(headers, 'WBその他');
  var daysCol = findCol(headers, ['利用曜日']);
  var ampmCol = findCol(headers, ['午前/午後', '午前午後']);

  if (nameCol < 0) return respond({ error: '「名前」または「氏名」列が見つかりません' }, callback);

  var hasWBCols = (wbHeightCol >= 0 && wbStrengthCol >= 0 && wbOtherCol >= 0);

  var users = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    if (!name) continue;

    var user = {
      name: name,
      kana: kanaCol >= 0 ? String(data[i][kanaCol] || '').trim() : '',
      days: daysCol >= 0 ? String(data[i][daysCol] || '').trim() : '',
      ampm: ampmCol >= 0 ? String(data[i][ampmCol] || '').trim() : ''
    };

    if (hasWBCols) {
      user.wbHeight = String(data[i][wbHeightCol] || '').trim().replace(/cm/gi, '');
      user.wbStrength = String(data[i][wbStrengthCol] || '').trim();
      user.wbOther = String(data[i][wbOtherCol] || '').trim();
    }

    users.push(user);
  }

  // カナ順でソート
  users.sort(function(a, b) {
    var sortA = a.kana || a.name;
    var sortB = b.kana || b.name;
    return sortA.localeCompare(sortB, 'ja');
  });

  return respond({ success: true, users: users, count: users.length, hasWBCols: hasWBCols }, callback);
}

// === WB設定を保存 ===
function saveWBSetting(params, callback) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_MAIN);
  if (!sheet) return respond({ error: 'シートが見つかりません' }, callback);

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });

  var nameCol = findCol(headers, ['名前', '氏名']);
  var wbHeightCol = findColPartial(headers, 'WB身長');
  var wbStrengthCol = findColPartial(headers, 'WB強さ');
  var wbOtherCol = findColPartial(headers, 'WBその他');

  if (nameCol < 0) return respond({ error: '「名前」列が見つかりません' }, callback);
  if (wbHeightCol < 0 || wbStrengthCol < 0 || wbOtherCol < 0) {
    return respond({ error: 'WB列が見つかりません。「WB身長」「WB強さ」「WBその他」列を追加してください' }, callback);
  }

  var targetName = (params.name || '').trim();
  if (!targetName) return respond({ error: '名前が指定されていません' }, callback);

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][nameCol] || '').trim() === targetName) {
      var row = i + 1;
      sheet.getRange(row, wbHeightCol + 1).setValue(params.wbHeight || '');
      sheet.getRange(row, wbStrengthCol + 1).setValue(params.wbStrength || '');
      sheet.getRange(row, wbOtherCol + 1).setValue(params.wbOther || '');
      return respond({ success: true }, callback);
    }
  }

  return respond({ error: '利用者が見つかりません: ' + targetName }, callback);
}

// === ユーティリティ ===
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
