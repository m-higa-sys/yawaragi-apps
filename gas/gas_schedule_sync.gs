/**
 * タイムスケジュール同期用 GAS（Google Apps Script）
 *
 * 全フィールドをそのまま保存・返却する汎用版
 * Google Drive上にJSONファイルとして保存するため、容量制限の心配なし
 *
 * デプロイ手順:
 * 1. Google Apps Script エディタでこのコードを貼り付け
 * 2. 「デプロイ」→「デプロイを管理」→ 既存のデプロイを編集
 * 3. バージョン: 「新しいバージョン」を選択
 * 4. 「デプロイ」をクリック
 */

const SYNC_FILE_NAME = 'yawaragi_schedule_sync.json';

/**
 * 同期用JSONファイルを取得（なければ作成）
 */
function getOrCreateSyncFile() {
  const files = DriveApp.getFilesByName(SYNC_FILE_NAME);
  if (files.hasNext()) {
    return files.next();
  }
  return DriveApp.createFile(SYNC_FILE_NAME, '{}', 'application/json');
}

/**
 * POST: データを保存
 * HTML側から送信された全フィールドをそのまま保存
 */
function doPost(e) {
  try {
    const file = getOrCreateSyncFile();
    file.setContent(e.parameter.data);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * GET: データを返却
 * 保存済みの全フィールドをそのまま返す
 */
function doGet() {
  try {
    const file = getOrCreateSyncFile();
    const content = file.getBlob().getDataAsString();
    return ContentService
      .createTextOutput(content)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput('{}')
      .setMimeType(ContentService.MimeType.JSON);
  }
}
