// ============================================================
// LINE通知 GAS（yawaragi社内 Messaging API）
// LINE公式アカウント「yawaragi社内」から社長だけに通知を送る
// ============================================================

var LINE_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');

// 社長のLINEユーザーID（スクリプトプロパティから取得）
function getOwnerUserId() {
  return PropertiesService.getScriptProperties().getProperty('OWNER_USER_ID');
}

// 社長だけにメッセージを送信
function sendToOwner(message) {
  var userId = getOwnerUserId();
  if (!userId) {
    Logger.log('社長のユーザーIDが未登録です。LINEで「yawaragi社内」にメッセージを送ってください。');
    return;
  }
  var url = 'https://api.line.me/v2/bot/message/push';
  var payload = {
    to: userId,
    messages: [
      { type: 'text', text: message }
    ]
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + LINE_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  var res = UrlFetchApp.fetch(url, options);
  Logger.log(res.getContentText());
  return res;
}

// テスト送信（社長だけに届く）
function testSend() {
  sendToOwner('テスト通知です（社長だけに届いています）');
}

// Webhook: LINEからメッセージを受信したとき
// → 社長のユーザーIDを自動保存する
function doPost(e) {
  try {
    var body;
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    // LINE Webhookイベント（社長がメッセージを送った場合）
    if (body && body.events && body.events.length > 0) {
      var event = body.events[0];
      if (event.type === 'message' && event.source && event.source.userId) {
        var userId = event.source.userId;
        // 最初の1人を社長として登録
        if (!getOwnerUserId()) {
          PropertiesService.getScriptProperties().setProperty('OWNER_USER_ID', userId);
          // 登録完了を社長に通知
          var url = 'https://api.line.me/v2/bot/message/push';
          var payload = {
            to: userId,
            messages: [
              { type: 'text', text: '社長のLINEを登録しました！今後は社長だけに通知が届きます。' }
            ]
          };
          var options = {
            method: 'post',
            contentType: 'application/json',
            headers: { 'Authorization': 'Bearer ' + LINE_TOKEN },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
          };
          UrlFetchApp.fetch(url, options);
        }
        return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 外部からの通知リクエスト（欠席登録など）
    if (body && body.message) {
      sendToOwner(body.message);
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ error: 'no action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
