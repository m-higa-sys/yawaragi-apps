// ===== 送迎日誌 Webアプリ + データ同期スクリプト =====
// Googleドライブの最新HTMLを自動読み込み（手動更新不要）

const SHEET_ID = '1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw';
const SHEET_NAME = '送迎日誌データ';
const OPS_SHEET_NAME = '出勤送迎表データ';
const HTML_FILE_ID = '104olsi-b2yHWZKUKfrqmbD3pVny0gUSh';

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheetName = name || SHEET_NAME;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

// GET: 画面表示 or データ取得
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  const hasTimestamp = e && e.parameter && e.parameter.t;

  // 出勤＆送迎表データAPI（?action=getOps）
  if (action === 'getOps') {
    try {
      const sheet = getSheet(OPS_SHEET_NAME);
      const data = sheet.getRange('A1').getValue();
      const json = data ? data : '{}';
      return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 日誌データAPI（?action=getData または 旧形式の ?t=タイムスタンプ）
  if (action === 'getData' || hasTimestamp) {
    try {
      const sheet = getSheet();
      const data = sheet.getRange('A1').getValue();
      const json = data ? data : '{}';
      return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Googleドライブから最新HTMLを読み込んで表示
  var file = DriveApp.getFileById(HTML_FILE_ID);
  var content = file.getBlob().getDataAsString();
  // GAS URLを自動設定（手動入力不要にする）
  var gasUrl = ScriptApp.getService().getUrl();
  content = content.replace('</head>',
    '<script>localStorage.setItem("yawaragi_nisshi_gas_url","' + gasUrl + '");</script></head>');
  return HtmlService.createHtmlOutput(content)
    .setTitle('送迎日誌 - yawaragi')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

// POST: データ保存
// sendBeacon（text/plain）やfetch（no-cors）からのPOSTにも対応
function doPost(e) {
  try {
    const sheet = getSheet();
    const raw = e.postData ? e.postData.contents : '';
    if (!raw) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'empty body' })).setMimeType(ContentService.MimeType.JSON);
    }
    const newData = JSON.parse(raw);

    // 既存データとマージ（日付単位で新しい方を優先）
    let existing = {};
    const current = sheet.getRange('A1').getValue();
    if (current) {
      try { existing = JSON.parse(current); } catch (ex) { existing = {}; }
    }

    // 出勤＆送迎表データの保存
    if (newData.type === 'yawaragi_daily_ops') {
      const opsSheet = getSheet(OPS_SHEET_NAME);
      let opsExisting = {};
      const opsCurrent = opsSheet.getRange('A1').getValue();
      if (opsCurrent) {
        try { opsExisting = JSON.parse(opsCurrent); } catch (ex) { opsExisting = {}; }
      }
      // 日付単位でマージ
      if (newData.dailyOps) {
        if (!opsExisting.dailyOps) opsExisting.dailyOps = {};
        Object.keys(newData.dailyOps).forEach(function(date) {
          opsExisting.dailyOps[date] = newData.dailyOps[date];
        });
      }
      // 口腔チェック・体重チェックのマージ
      if (newData.oralCheck) {
        opsExisting.oralCheck = newData.oralCheck;
      }
      if (newData.weightCheck) {
        opsExisting.weightCheck = newData.weightCheck;
      }
      opsExisting.lastSaved = new Date().toISOString();
      opsExisting.type = 'yawaragi_daily_ops';
      opsSheet.getRange('A1').setValue(JSON.stringify(opsExisting));

      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }

    // 日誌データのマージ・保存
    if (newData.nisshi) {
      if (!existing.nisshi) existing.nisshi = {};
      Object.keys(newData.nisshi).forEach(function(date) {
        existing.nisshi[date] = newData.nisshi[date];
      });
    }
    existing.lastSaved = new Date().toISOString();
    existing.type = 'yawaragi_sougei_nisshi_backup';

    sheet.getRange('A1').setValue(JSON.stringify(existing));

    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}
