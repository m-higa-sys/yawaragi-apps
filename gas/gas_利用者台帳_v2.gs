// ===== 利用者台帳 GAS v2 =====
// 口腔チェック・体重チェック等で利用者一覧を取得するためのGAS
// v2: 利用曜日・午前/午後の情報も返す
// v2.1 (2026-04-12): ?mode=summary で件数のみ返すエンドポイント追加（クロコ用・個人情報なし）
// v2.2 (2026-04-12): doGet を handleSummary にリネーム（yawaragiボード.gs の doGet から振り分け呼び出しされるため）
//
// ★ デプロイ手順:
// 1. 利用者台帳スプレッドシートの「拡張機能」→「Apps Script」を開く
// 2. 既存のコードをこの内容に置き換える
// 3. 「デプロイ」→「デプロイを管理」→ 既存のデプロイを編集
// 4. バージョン: 「新しいバージョン」を選択
// 5. 「デプロイ」をクリック
// ※ URLは変わらないので、アプリ側の変更は不要
//
// ★ 使い方:
// - ?mode=summary → 件数のみ返す（クロコが取得用・個人情報なし）
// - パラメータなし → 通常の利用者一覧を返す（既存アプリ用）

var SPREADSHEET_ID = '1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0';
var SHEET_NAME = '利用者台帳';

function handleSummary(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var mode = (e && e.parameter) ? e.parameter.mode : null;

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
    var endDateCol = findColPartial(headers, '利用終了');
    if (endDateCol < 0) endDateCol = findColPartial(headers, '終了日');
    var cmOfficeCol = findColPartial(headers, 'ケアマネ事業所');
    if (cmOfficeCol < 0) cmOfficeCol = findColPartial(headers, '居宅');
    if (cmOfficeCol < 0) cmOfficeCol = findColPartial(headers, '包括');

    if (nameCol < 0) return respond({ error: '「氏名」列が見つかりません' }, callback);

    // ===== サマリーモード（個人情報なし・件数のみ） =====
    if (mode === 'summary') {
      var summary = {
        total: 0,          // 全登録者数（終了・中止含む）
        active: 0,         // 利用中
        ended: 0,          // 終了・中止・卒業
        kaigo: 0,          // 要介護
        shien: 0,          // 要支援・事業対象
        byDay: {月:0, 火:0, 水:0, 木:0, 金:0, 土:0, 日:0},
        byAmpm: {午前:0, 午後:0, 両方:0, 不明:0},
        startedThisMonth: 0,  // 今月利用開始
        endedThisMonth: 0,    // 今月利用終了
        startedLastMonth: 0,  // 先月利用開始
        endedLastMonth: 0,    // 先月利用終了
        generatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
      };

      var now = new Date();
      var thisMonth = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM');
      var lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      var lastMonth = Utilities.formatDate(lastMonthDate, 'Asia/Tokyo', 'yyyy-MM');

      for (var i = 1; i < data.length; i++) {
        var name = String(data[i][nameCol] || '').trim();
        if (!name) continue;

        summary.total++;

        var status = statusCol >= 0 ? String(data[i][statusCol] || '').trim() : '';
        var isEnded = (status.indexOf('終了') >= 0 || status.indexOf('中止') >= 0 || status.indexOf('卒業') >= 0);

        if (isEnded) {
          summary.ended++;
        } else {
          summary.active++;

          // 介護度分類
          var careRaw = careCol >= 0 ? String(data[i][careCol] || '').trim() : '';
          if (careRaw.indexOf('支援') >= 0 || careRaw.indexOf('事業対象') >= 0) {
            summary.shien++;
          } else {
            summary.kaigo++;
          }

          // 曜日分布
          if (daysCol >= 0) {
            var days = String(data[i][daysCol] || '');
            ['月','火','水','木','金','土','日'].forEach(function(d){
              if (days.indexOf(d) >= 0) summary.byDay[d]++;
            });
          }

          // 午前/午後分布
          if (ampmCol >= 0) {
            var ampm = String(data[i][ampmCol] || '').trim();
            var hasAm = ampm.indexOf('午前') >= 0;
            var hasPm = ampm.indexOf('午後') >= 0;
            if (hasAm && hasPm) summary.byAmpm['両方']++;
            else if (hasAm) summary.byAmpm['午前']++;
            else if (hasPm) summary.byAmpm['午後']++;
            else summary.byAmpm['不明']++;
          }
        }

        // 開始月
        if (startDateCol >= 0 && data[i][startDateCol]) {
          var startStr = formatYearMonth(data[i][startDateCol]);
          if (startStr === thisMonth) summary.startedThisMonth++;
          if (startStr === lastMonth) summary.startedLastMonth++;
        }

        // 終了月
        if (endDateCol >= 0 && data[i][endDateCol]) {
          var endStr = formatYearMonth(data[i][endDateCol]);
          if (endStr === thisMonth) summary.endedThisMonth++;
          if (endStr === lastMonth) summary.endedLastMonth++;
        }
      }

      return respond(summary, callback);
    }

    // ===== 通常モード（既存の利用者一覧） =====
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

      // 計画書開始月（yyyy-MM形式）
      var planStart = '';
      if (planStartCol >= 0 && data[i][planStartCol]) {
        var pVal = data[i][planStartCol];
        if (pVal instanceof Date) {
          planStart = Utilities.formatDate(pVal, 'Asia/Tokyo', 'yyyy-MM');
        } else {
          var pStr = String(pVal).trim();
          var pm = pStr.match(/(\d{4})[-\/](\d{1,2})/);
          if (pm) planStart = pm[1] + '-' + String(pm[2]).padStart(2, '0');
        }
      }

      // 利用開始日（yyyy-MM形式）
      var startDate = '';
      if (startDateCol >= 0 && data[i][startDateCol]) {
        var sVal = data[i][startDateCol];
        if (sVal instanceof Date) {
          startDate = Utilities.formatDate(sVal, 'Asia/Tokyo', 'yyyy-MM');
        } else {
          var sStr = String(sVal).trim();
          var sm = sStr.match(/(\d{4})[-\/](\d{1,2})/);
          if (sm) startDate = sm[1] + '-' + String(sm[2]).padStart(2, '0');
        }
      }

      var cmOffice = cmOfficeCol >= 0 ? String(data[i][cmOfficeCol] || '').trim() : '';

      users.push({
        name: name,
        kana: kana,
        care: care,
        days: days,
        ampm: ampm,
        planStart: planStart,
        startDate: startDate,
        cmOffice: cmOffice
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

function formatYearMonth(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM');
  }
  var s = String(val).trim();
  var m = s.match(/(\d{4})[-\/](\d{1,2})/);
  if (m) return m[1] + '-' + String(m[2]).padStart(2, '0');
  return '';
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
