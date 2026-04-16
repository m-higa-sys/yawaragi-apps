// ===== 送迎日誌 Webアプリ + データ同期スクリプト =====
// Googleドライブの最新HTMLを自動読み込み（手動更新不要）
// 出勤送迎表データは複数セル分割保存対応（5万文字制限回避）

const SHEET_ID = '1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw';
const SHEET_NAME = '送迎日誌データ';
const OPS_SHEET_NAME = '出勤送迎表データ';
const HTML_FILE_ID = '104olsi-b2yHWZKUKfrqmbD3pVny0gUSh';

// 1セルあたりの最大文字数（Google Sheetsは5万文字制限。余裕を持って4.5万）
const OPS_CHUNK_SIZE = 45000;

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheetName = name || SHEET_NAME;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

// 出勤送迎表データを複数セルから連結して読み込み
function readOpsData() {
  const sheet = getSheet(OPS_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) return '';
  const values = sheet.getRange(1, 1, lastRow, 1).getValues();
  return values.map(function(r){ return r[0] || ''; }).join('');
}

// 出勤送迎表データを複数セルに分割して保存
function writeOpsData(jsonStr) {
  const sheet = getSheet(OPS_SHEET_NAME);
  // 文字列をチャンクに分割
  const chunks = [];
  for (let i = 0; i < jsonStr.length; i += OPS_CHUNK_SIZE) {
    chunks.push(jsonStr.substring(i, i + OPS_CHUNK_SIZE));
  }
  if (chunks.length === 0) chunks.push('');
  // 古い余分な行をクリア（チャンク数より行数が多い場合）
  const oldLastRow = sheet.getLastRow();
  if (oldLastRow > chunks.length) {
    sheet.getRange(chunks.length + 1, 1, oldLastRow - chunks.length, 1).clearContent();
  }
  // 一括書き込み
  const values = chunks.map(function(c){ return [c]; });
  sheet.getRange(1, 1, chunks.length, 1).setValues(values);
}

// 「送迎管理システム」フォルダ内の「出勤」を含むHTMLファイルを検索
function findOpsFile() {
  return DriveApp.getFileById('1B8y3XT_PCNBKh3-Ud_xYY0frgGqavLPY');
}



function testFindOps() {

  var folders = DriveApp.getFoldersByName('送迎管理システム');
  while (folders.hasNext()) {
    var folder = folders.next();
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      var name = f.getName();
      if (name.indexOf('出勤') >= 0) {
        Logger.log(name + ' | ID:' + f.getId() + ' | Size:' + f.getSize() + ' | Updated:' + f.getLastUpdated());
      }
    }
  }
}



function doGet(e) {
    if (e && e.parameter && e.parameter.action === 'paste') {
    return HtmlService.createHtmlOutputFromFile('paste');
  }

  const action = (e && e.parameter && e.parameter.action) || '';
  const app = (e && e.parameter && e.parameter.app) || '';
  const hasTimestamp = e && e.parameter && e.parameter.t;

  // === API: 出勤＆送迎表データ取得 ===
  if (action === 'getOps') {
    try {
      const data = readOpsData();
      const json = data ? data : '{}';
      return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // === API: 口腔・体重チェックデータ取得 ===
  // タイムスケジュール等の他アプリからクラウド経由でデータ取得用
  if (action === 'getHealthChecks') {
    try {
      const data = readOpsData();
      const parsed = data ? JSON.parse(data) : {};
      const result = {
        oralCheck: parsed.oralCheck || {},
        weightCheck: parsed.weightCheck || {}
      };
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // === API: 送迎日誌データ取得 ===
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

  // === 出勤＆送迎表 HTML配信 ===
  if (app === 'ops') {
    var opsFile = findOpsFile();
    if (!opsFile) {
      return HtmlService.createHtmlOutput('<h1>エラー: 出勤＆送迎表.htmlが見つかりません</h1>');
    }
    var opsContent = opsFile.getBlob().getDataAsString();
    var opsGasUrl = ScriptApp.getService().getUrl();
    opsContent = opsContent.replace('</head>',
      '<script>localStorage.setItem("yawaragi_ops_gas_url","' + opsGasUrl + '");</script></head>');
    return HtmlService.createHtmlOutput(opsContent)
      .setTitle('出勤＆送迎表 - yawaragi')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  }

  // === 送迎日誌 HTML配信（デフォルト） ===
  var file = DriveApp.getFileById(HTML_FILE_ID);
  var content = file.getBlob().getDataAsString();
  var gasUrl = ScriptApp.getService().getUrl();
  content = content.replace('</head>',
    '<script>localStorage.setItem("yawaragi_nisshi_gas_url","' + gasUrl + '");</script></head>');
  return HtmlService.createHtmlOutput(content)
    .setTitle('送迎日誌 - yawaragi')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function doPost(e) {
  try {
    const sheet = getSheet();
    const raw = e.postData ? e.postData.contents : '';
if (!raw) { return ContentService.createTextOutput(JSON.stringify({ error: 'empty body' })).setMimeType(ContentService.MimeType.JSON); }
const newData = JSON.parse(raw);


    let existing = {};
    const current = sheet.getRange('A1').getValue();
    if (current) {
      try { existing = JSON.parse(current); } catch (ex) { existing = {}; }
    }

    if (newData.type === 'yawaragi_daily_ops') {
      let opsExisting = {};
      const opsCurrent = readOpsData();
      if (opsCurrent) {
        try { opsExisting = JSON.parse(opsCurrent); } catch (ex) { opsExisting = {}; }
      }
      if (newData.dailyOps) {
        if (!opsExisting.dailyOps) opsExisting.dailyOps = {};
        Object.keys(newData.dailyOps).forEach(function(date) {
          opsExisting.dailyOps[date] = newData.dailyOps[date];
        });
      }
      // 口腔チェックデータのマージ（年度→名前→月単位で上書き）
      if (newData.oralCheck && Object.keys(newData.oralCheck).length > 0) {
        if (!opsExisting.oralCheck) opsExisting.oralCheck = {};
        if (newData.oralCheck.checks) {
          if (!opsExisting.oralCheck.checks) opsExisting.oralCheck.checks = {};
          Object.keys(newData.oralCheck.checks).forEach(function(fy) {
            if (!opsExisting.oralCheck.checks[fy]) opsExisting.oralCheck.checks[fy] = {};
            Object.keys(newData.oralCheck.checks[fy]).forEach(function(name) {
              if (!opsExisting.oralCheck.checks[fy][name]) opsExisting.oralCheck.checks[fy][name] = {};
              Object.keys(newData.oralCheck.checks[fy][name]).forEach(function(key) {
                opsExisting.oralCheck.checks[fy][name][key] = newData.oralCheck.checks[fy][name][key];
              });
            });
          });
        }
        if (newData.oralCheck.users) {
          opsExisting.oralCheck.users = newData.oralCheck.users;
        }
      }
      // 体重チェックデータのマージ（年度→名前→月単位で上書き）
      if (newData.weightCheck && Object.keys(newData.weightCheck).length > 0) {
        if (!opsExisting.weightCheck) opsExisting.weightCheck = {};
        if (newData.weightCheck.weights) {
          if (!opsExisting.weightCheck.weights) opsExisting.weightCheck.weights = {};
          Object.keys(newData.weightCheck.weights).forEach(function(fy) {
            if (!opsExisting.weightCheck.weights[fy]) opsExisting.weightCheck.weights[fy] = {};
            Object.keys(newData.weightCheck.weights[fy]).forEach(function(name) {
              if (!opsExisting.weightCheck.weights[fy][name]) opsExisting.weightCheck.weights[fy][name] = {};
              Object.keys(newData.weightCheck.weights[fy][name]).forEach(function(key) {
                opsExisting.weightCheck.weights[fy][name][key] = newData.weightCheck.weights[fy][name][key];
              });
            });
          });
        }
        if (newData.weightCheck.users) {
          opsExisting.weightCheck.users = newData.weightCheck.users;
        }
      }
      opsExisting.lastSaved = new Date().toISOString();
      opsExisting.type = 'yawaragi_daily_ops';
      writeOpsData(JSON.stringify(opsExisting));
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }

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

function saveOpsManual(jsonStr) {
  var newData = JSON.parse(jsonStr);
  var existing = {};
  var current = readOpsData();
  if (current) { try { existing = JSON.parse(current); } catch(e) { existing = {}; } }
  if (!existing.dailyOps) existing.dailyOps = {};
  for (var date in newData.dailyOps) { existing.dailyOps[date] = newData.dailyOps[date]; }
  existing.type = 'yawaragi_daily_ops';
  existing.lastSaved = new Date().toISOString();
  writeOpsData(JSON.stringify(existing));
  return 'OK';
}

// セル容量チェック関数（複数セル対応版）
function checkCellSize() {
  const data = readOpsData();
  const len = data ? data.length : 0;
  const sheet = getSheet(OPS_SHEET_NAME);
  const rowCount = sheet.getLastRow();
  Logger.log('━━━━━━━━━━━━━━━━━━━━');
  Logger.log('総文字数: ' + len);
  Logger.log('使用セル数: ' + rowCount + '行');
  Logger.log('1行あたり上限: 50000');
  Logger.log('1行あたりチャンクサイズ: ' + OPS_CHUNK_SIZE);
  Logger.log('━━━━━━━━━━━━━━━━━━━━');
}
