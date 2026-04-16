// ============================================================
// 健康チェック同期 GAS（口腔チェック・体重チェック用）
// Googleドライブにデータを保存し、複数iPadで同期する
// ============================================================

var FOLDER_NAME = '健康チェック同期データ';

// フォルダを取得（なければ作成）
function getOrCreateFolder() {
  var folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

// ファイルを取得（なければ作成）
function getOrCreateFile(folder, fileName) {
  var files = folder.getFilesByName(fileName);
  if (files.hasNext()) return files.next();
  return folder.createFile(fileName, '{}', MimeType.PLAIN_TEXT);
}

// POST: データを保存
function doPost(e) {
  try {
    var body;
    // フォームパラメータから試す
    if (e.parameter && e.parameter.data) {
      try { body = JSON.parse(e.parameter.data); } catch(ex) {}
    }
    // 生のリクエストボディから試す
    if (!body && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch(ex) {}
    }
    if (!body) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'no data received' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var type = body.type; // 'oral' or 'weight'
    var data = body.data;

    if (!type || !data) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'missing type or data' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var folder = getOrCreateFolder();
    var fileName = type + '_data.json';
    var file = getOrCreateFile(folder, fileName);
    file.setContent(JSON.stringify(data));

    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', type: type }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// JSONP応答ヘルパー
function jsonpResponse(callback, obj) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// GET: データを取得・保存（JSONP対応）
function doGet(e) {
  try {
    var action = (e.parameter && e.parameter.action) ? e.parameter.action : '';
    var callback = (e.parameter && e.parameter.callback) ? e.parameter.callback : '';
    var folder = getOrCreateFolder();
    var props = PropertiesService.getScriptProperties();

    // --- チャンク保存（分割送信の1パート受信） ---
    if (action === 'saveOralChunk' || action === 'saveWeightChunk') {
      var syncId = e.parameter.syncId || '';
      var idx = e.parameter.idx || '0';
      var chunkData = e.parameter.data || '';
      if (syncId && chunkData) {
        props.setProperty('chunk_' + syncId + '_' + idx, chunkData);
        return jsonpResponse(callback, { status: 'ok' });
      }
      return jsonpResponse(callback, { error: 'missing params' });
    }

    // --- チャンク組立・保存（分割送信の最終リクエスト） ---
    if (action === 'saveOralFinalize' || action === 'saveWeightFinalize') {
      var syncId = e.parameter.syncId || '';
      var total = parseInt(e.parameter.total || '0');
      if (syncId && total > 0) {
        var fullData = '';
        for (var i = 0; i < total; i++) {
          var key = 'chunk_' + syncId + '_' + i;
          fullData += (props.getProperty(key) || '');
          props.deleteProperty(key);
        }
        var saveFileName = (action === 'saveOralFinalize') ? 'oral_data.json' : 'weight_data.json';
        var saveFile = getOrCreateFile(folder, saveFileName);
        saveFile.setContent(fullData);
        return jsonpResponse(callback, { status: 'ok' });
      }
      return jsonpResponse(callback, { error: 'missing params' });
    }

    // --- 一括保存（従来方式・小データ用） ---
    if (action === 'saveOral' || action === 'saveWeight' || action === 'saveStamp') {
      var saveData = e.parameter.data || '';
      if (saveData) {
        var saveFileName;
        if (action === 'saveOral') saveFileName = 'oral_data.json';
        else if (action === 'saveWeight') saveFileName = 'weight_data.json';
        else saveFileName = 'stamp_data.json';
        var saveFile = getOrCreateFile(folder, saveFileName);
        saveFile.setContent(saveData);
        return jsonpResponse(callback, { status: 'ok' });
      }
    }

    // --- データ取得 ---
    var fileName;
    if (action === 'getOral') {
      fileName = 'oral_data.json';
    } else if (action === 'getWeight') {
      fileName = 'weight_data.json';
    } else if (action === 'getStamp') {
      fileName = 'stamp_data.json';
    } else {
      return jsonpResponse(callback, {});
    }

    var content = '{}';
    var files = folder.getFilesByName(fileName);
    if (files.hasNext()) {
      var file = files.next();
      content = file.getBlob().getDataAsString();
    }

    if (callback) {
      return ContentService.createTextOutput(callback + '(' + content + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(content)
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    var errJson = JSON.stringify({ error: err.message });
    if (e.parameter && e.parameter.callback) {
      return ContentService.createTextOutput(e.parameter.callback + '(' + errJson + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(errJson)
      .setMimeType(ContentService.MimeType.JSON);
  }
}
