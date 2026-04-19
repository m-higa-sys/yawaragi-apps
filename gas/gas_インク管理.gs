/**
 * インク在庫管理 - GAS バックエンド
 *
 * 役割:
 *   1. クラウド同期（スプレッドシートに保存）
 *   2. 在庫切れ通知（LINE + Gmail）
 *
 * 【セットアップ手順】
 * 1. https://drive.google.com/ で「新規 > Googleスプレッドシート」を作成
 *    名前を「インク管理データ」にする
 * 2. メニュー「拡張機能 > Apps Script」を開く
 * 3. 既存のコードを全部消して、このコードを貼り付ける
 * 4. 上の▶ボタンの右の関数選択から「setupSheets」を選んで実行
 *    （初回は権限の確認画面が出る → 許可する）
 * 5. メニュー「デプロイ > 新しいデプロイ」
 *    - 種類: ウェブアプリ
 *    - 説明: インク管理 v1
 *    - 次のユーザーとして実行: 自分
 *    - アクセスできるユーザー: 全員
 * 6. 表示されるURLをコピー
 * 7. インク管理.html の SYNC_URL に貼り付ける
 *
 * 【テスト】
 * - エディタで testNotification() を実行 → 社長のLINEとGmailに通知が届けばOK
 */

// ===== 設定 =====
// LINE通知用（yawaragiボードと共通）
var LINE_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');
var OWNER_USER_ID = PropertiesService.getScriptProperties().getProperty('OWNER_USER_ID');
var OWNER_EMAIL = 'm-higa@keepfitlife.com';

// シート名
var SHEET_STOCK   = 'インク在庫';
var SHEET_HISTORY = 'インク履歴';
var SHEET_STAFF   = 'インク補充者';
var SHEET_PRINTER = 'インクプリンター定義';

// ============================================================
// ===== 初期セットアップ（手動実行・1回だけ） =====
// ============================================================
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 在庫シート
  var s1 = ss.getSheetByName(SHEET_STOCK);
  if (!s1) {
    s1 = ss.insertSheet(SHEET_STOCK);
    s1.appendRow(['printerId', 'colorId', 'printerName', 'colorName', 'stock', '最終更新']);
    s1.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#e0e8ef');
  }

  // 履歴シート
  var s2 = ss.getSheetByName(SHEET_HISTORY);
  if (!s2) {
    s2 = ss.insertSheet(SHEET_HISTORY);
    s2.appendRow(['日時', '種別', 'printerId', 'colorId', 'プリンター', '色', '補充者']);
    s2.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#e0e8ef');
  }

  // 補充者シート
  var s3 = ss.getSheetByName(SHEET_STAFF);
  if (!s3) {
    s3 = ss.insertSheet(SHEET_STAFF);
    s3.appendRow(['補充者名']);
    s3.getRange(1, 1, 1, 1).setFontWeight('bold').setBackground('#e0e8ef');
    // デフォルト補充者を投入
    ['勝俣','星野','下浦','工藤','高山','春山','大久保','比嘉'].forEach(function(name){
      s3.appendRow([name]);
    });
  }

  // プリンター定義シート
  var s4 = ss.getSheetByName(SHEET_PRINTER);
  if (!s4) {
    s4 = ss.insertSheet(SHEET_PRINTER);
    s4.appendRow(['printerId', 'name', 'icon', 'colorsJSON']);
    s4.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#e0e8ef');
  }

  SpreadsheetApp.getUi().alert('初期セットアップ完了！\n4つのシートを作成しました。\n次は「デプロイ > 新しいデプロイ」をしてURLを取得してください。');
}

// ============================================================
// ===== POSTエンドポイント =====
// ============================================================
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.type !== 'ink') {
      return jsonResp({ status: 'error', message: 'type must be ink' });
    }

    // 在庫切れ通知
    if (body.action === 'empty') {
      sendNotification(body.printer, body.color);
      return jsonResp({ status: 'ok', notified: true });
    }

    // クラウド同期
    if (body.action === 'sync') {
      saveToSheets(body.data);
      return jsonResp({ status: 'ok', synced: true });
    }

    return jsonResp({ status: 'error', message: 'unknown action' });

  } catch (err) {
    return jsonResp({ status: 'error', message: err.message });
  }
}

// ============================================================
// ===== GETエンドポイント（JSONP） =====
// ============================================================
function doGet(e) {
  var params = e.parameter || {};
  var callback = params.callback;

  if (params.action === 'getInk') {
    var data = loadFromSheets();
    var json = JSON.stringify(data);
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + json + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService
      .createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', service: 'ink-manager' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// ===== クラウド保存 =====
// ============================================================
function saveToSheets(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');

  // ---- プリンター定義を保存 ----
  if (data.printers && data.printers.length) {
    var sp = ss.getSheetByName(SHEET_PRINTER);
    if (sp) {
      if (sp.getLastRow() > 1) {
        sp.getRange(2, 1, sp.getLastRow() - 1, sp.getLastColumn()).clearContent();
      }
      data.printers.forEach(function(p){
        sp.appendRow([p.id, p.name, p.icon || '', JSON.stringify(p.colors)]);
      });
    }
  }

  // ---- 在庫を保存（全クリア→全投入） ----
  if (data.stock) {
    var ss1 = ss.getSheetByName(SHEET_STOCK);
    if (ss1) {
      if (ss1.getLastRow() > 1) {
        ss1.getRange(2, 1, ss1.getLastRow() - 1, ss1.getLastColumn()).clearContent();
      }
      // printerId__colorId 形式のキーを分解
      Object.keys(data.stock).forEach(function(key){
        var parts = key.split('__');
        if (parts.length !== 2) return;
        var pid = parts[0];
        var cid = parts[1];
        var printer = (data.printers || []).find(function(p){ return p.id === pid; });
        var color = printer ? printer.colors.find(function(c){ return c.id === cid; }) : null;
        ss1.appendRow([
          pid,
          cid,
          printer ? printer.name : '',
          color ? color.name : '',
          data.stock[key],
          now
        ]);
      });
    }
  }

  // ---- 履歴を保存（全クリア→全投入） ----
  if (data.history) {
    var sh = ss.getSheetByName(SHEET_HISTORY);
    if (sh) {
      if (sh.getLastRow() > 1) {
        sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
      }
      // 新しい順 → 古い順に並べ替えて保存
      var historyAsc = data.history.slice().reverse();
      historyAsc.forEach(function(h){
        var d = h.date ? new Date(h.date) : new Date();
        var dateStr = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
        sh.appendRow([
          dateStr,
          h.type === 'use' ? '使用' : '補充',
          h.printerId || '',
          h.colorId || '',
          h.printerName || '',
          h.colorName || '',
          h.staff || ''
        ]);
      });
    }
  }

  // ---- 補充者を保存 ----
  if (data.staff && data.staff.length) {
    var st = ss.getSheetByName(SHEET_STAFF);
    if (st) {
      if (st.getLastRow() > 1) {
        st.getRange(2, 1, st.getLastRow() - 1, st.getLastColumn()).clearContent();
      }
      data.staff.forEach(function(name){
        st.appendRow([name]);
      });
    }
  }
}

// ============================================================
// ===== クラウド読み込み =====
// ============================================================
function loadFromSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = { printers: [], stock: {}, staff: [], history: [] };

  // プリンター定義
  var sp = ss.getSheetByName(SHEET_PRINTER);
  if (sp && sp.getLastRow() > 1) {
    var rows = sp.getRange(2, 1, sp.getLastRow() - 1, 4).getValues();
    rows.forEach(function(r){
      if (!r[0]) return;
      try {
        result.printers.push({
          id: r[0],
          name: r[1],
          icon: r[2] || '',
          colors: JSON.parse(r[3] || '[]')
        });
      } catch(e) {}
    });
  }

  // 在庫
  var s1 = ss.getSheetByName(SHEET_STOCK);
  if (s1 && s1.getLastRow() > 1) {
    var rows1 = s1.getRange(2, 1, s1.getLastRow() - 1, 5).getValues();
    rows1.forEach(function(r){
      if (!r[0] || !r[1]) return;
      var key = r[0] + '__' + r[1];
      result.stock[key] = parseInt(r[4]) || 0;
    });
  }

  // 履歴（新しい順に並べ直す）
  var sh = ss.getSheetByName(SHEET_HISTORY);
  if (sh && sh.getLastRow() > 1) {
    var rows2 = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
    var hist = [];
    rows2.forEach(function(r){
      if (!r[0]) return;
      hist.push({
        type: r[1] === '使用' ? 'use' : 'add',
        printerId: r[2],
        colorId: r[3],
        printerName: r[4],
        colorName: r[5],
        staff: r[6] || '',
        date: new Date(r[0]).toISOString()
      });
    });
    result.history = hist.reverse();
  }

  // 補充者
  var st = ss.getSheetByName(SHEET_STAFF);
  if (st && st.getLastRow() > 1) {
    var rows3 = st.getRange(2, 1, st.getLastRow() - 1, 1).getValues();
    rows3.forEach(function(r){
      if (r[0]) result.staff.push(String(r[0]));
    });
  }

  return result;
}

// ============================================================
// ===== 通知（LINE + Gmail 両方）=====
// ============================================================
function sendNotification(printerName, colorName) {
  var now = new Date();
  var timeStr = Utilities.formatDate(now, 'Asia/Tokyo', 'M/d HH:mm');

  var subject = '【yawaragiインク通知】' + printerName + ' ' + colorName + ' 在庫切れ';
  var message =
    '🖨️ インク在庫切れ通知\n\n' +
    'プリンター: ' + printerName + '\n' +
    '色: ' + colorName + '\n' +
    '時刻: ' + timeStr + '\n\n' +
    '1階のプリンターに新しいインクを補充してください。\n' +
    '補充後はインク管理アプリの「補充」タブで補充ボタンを押してください。';

  // === LINE送信（無料枠200通超過時は無音で失敗・5/1にリセット）===
  try {
    var url = 'https://api.line.me/v2/bot/message/push';
    var payload = {
      to: OWNER_USER_ID,
      messages: [{ type: 'text', text: message }]
    };
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + LINE_TOKEN },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('LINE送信失敗: ' + e.message);
  }

  // === Gmail送信（バックアップ・常に届く）===
  try {
    GmailApp.sendEmail(OWNER_EMAIL, subject, message);
  } catch (e) {
    Logger.log('Gmail送信失敗: ' + e.message);
  }
}

// ============================================================
// ===== ヘルパー =====
// ============================================================
function jsonResp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// ===== テスト関数（GASエディタで直接実行）=====
// ============================================================
function testNotification() {
  sendNotification('Canon TS8830', 'シアン');
  Logger.log('テスト通知を送信しました。LINEとGmailを確認してください。');
}

function testLoad() {
  var data = loadFromSheets();
  Logger.log(JSON.stringify(data, null, 2));
}
