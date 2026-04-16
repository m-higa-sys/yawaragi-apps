// ===== ケアマネ連絡メール作成ツール用 GAS =====
// 利用者台帳シート → 名前、ケアマネ担当者、ケアマネ事業所名
// ※利用者台帳には利用中の利用者のみ登録されている
// ※メールアドレスはアプリ側（localStorage）で事業所ごとに管理

const SPREADSHEET_ID = '1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0';
const SHEET_MAIN = '利用者台帳';

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    const mainSheet = ss.getSheetByName(SHEET_MAIN);
    if (!mainSheet) {
      return jsonResponse({ error: 'シート「' + SHEET_MAIN + '」が見つかりません' });
    }
    const mainData = mainSheet.getDataRange().getValues();
    if (mainData.length < 2) {
      return jsonResponse({ error: '利用者台帳にデータがありません' });
    }
    const headers = mainData[0].map(function(h) { return String(h).trim(); });
    var nameCol = findCol(headers, ['名前', '氏名']);
    var cmNameCol = findColContains(headers, 'ケアマネ', '担当');
    var cmOfficeCol = findColContains(headers, 'ケアマネ', '事業所');

    if (nameCol < 0) {
      return jsonResponse({ error: '利用者台帳に「名前」列が見つかりません。ヘッダー: ' + headers.join(', ') });
    }

    var users = [];
    for (var i = 1; i < mainData.length; i++) {
      var name = String(mainData[i][nameCol] || '').trim();
      if (!name) continue;

      users.push({
        name: name,
        cmName: cmNameCol >= 0 ? String(mainData[i][cmNameCol] || '').trim() : '',
        cmOffice: cmOfficeCol >= 0 ? String(mainData[i][cmOfficeCol] || '').trim() : ''
      });
    }

    // 名前順でソート
    users.sort(function(a, b) { return a.name.localeCompare(b.name, 'ja'); });

    return jsonResponse({ success: true, users: users, count: users.length });

  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// 完全一致で列を探す（複数候補）
function findCol(headers, candidates) {
  for (var i = 0; i < headers.length; i++) {
    for (var j = 0; j < candidates.length; j++) {
      if (headers[i] === candidates[j]) return i;
    }
  }
  return -1;
}

// 2つのキーワードを両方含む列を探す
function findColContains(headers, keyword1, keyword2) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].indexOf(keyword1) >= 0 && headers[i].indexOf(keyword2) >= 0) return i;
  }
  return -1;
}

// 名前を正規化（？、?、スペース、全角半角を統一）
function normalizeName(name) {
  return name.replace(/[？?]/g, '').replace(/\s+/g, '').trim();
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
