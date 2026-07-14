// ============================================================
// 【退避保全】yawaragiボードGAS backup_20260501 固有の4関数
// ------------------------------------------------------------
// 経緯: 2026-07-14 LINEトークン流出対応で Drive上の板GASバックアップ3件を
//   削除する際、backup_20260501 にだけ存在し現行repo・Git履歴のいずれにも
//   無い4関数が見つかったため、削除前にここへ退避した。
// 出典: マイドライブ/yawaragi-apps/スタッフ用/gas_yawaragiボード_backup_20260501.gs (2026-05-01)
// 状態: 現行本番(gas/yawaragi-board/コード.js 2026-07-03スナップショット)には非搭載。
//   一回限りのマイグレーション(handleAddIryouhiColumn)や、保留中ロジックの
//   可能性がある。復活させるかは要判断。ここは「記録の保全」目的。
// ※秘密情報は含めていない（スキャン済み）。
// ============================================================


// ---- getConsecutiveAbsenceAlerts ----
function getConsecutiveAbsenceAlerts(ss) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getDataRange().getValues();
  var today = new Date();
  var threshold = new Date(today);
  threshold.setDate(today.getDate() - 14);
  var thresholdStr = Utilities.formatDate(threshold, 'Asia/Tokyo', 'yyyy-MM-dd');
  var todayStr = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-dd');

  var counts = {}; // {利用者名: {count, dates: [日付配列], firstDate}}
  for (var i = 1; i < data.length; i++) {
    var d = fmtDate(data[i][0]);
    var name = String(data[i][1] || '').trim();
    var type = String(data[i][3] || '').trim();
    if (type !== '欠席') continue;
    if (d < thresholdStr || d > todayStr) continue;
    if (!name) continue;
    if (!counts[name]) counts[name] = { count: 0, dates: [], firstDate: d };
    counts[name].count++;
    counts[name].dates.push(d);
    if (d < counts[name].firstDate) counts[name].firstDate = d;
  }

  // 既に長期休み中の利用者は除外
  var longTermNames = {};
  for (var j = 1; j < data.length; j++) {
    var t = String(data[j][3] || '').trim();
    if (t !== '長期休み') continue;
    var endDate = data[j][7] ? fmtDate(data[j][7]) : '';
    if (!endDate || endDate >= todayStr) {
      longTermNames[String(data[j][1] || '').trim()] = true;
    }
  }

  var result = [];
  Object.keys(counts).forEach(function(name) {
    if (counts[name].count >= 3 && !longTermNames[name]) {
      result.push({
        name: name,
        count: counts[name].count,
        firstDate: counts[name].firstDate,
        dates: counts[name].dates.sort()
      });
    }
  });
  return result;
}

// ---- promoteToLongTerm ----
function promoteToLongTerm(ss, data) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { error: '出欠変更シートがありません', success: false };
  if (!data.name) return { error: '利用者名がありません', success: false };
  if (!data.startDate) return { error: '開始日がありません', success: false };

  var allData = sheet.getDataRange().getValues();
  var deletedCount = 0;
  var dateSet = {};
  (data.dates || []).forEach(function(d) { dateSet[d] = true; });

  // 後ろから削除（行番号ずれ防止）
  for (var i = allData.length - 1; i >= 1; i--) {
    var d = fmtDate(allData[i][0]);
    var name = String(allData[i][1] || '').trim();
    var type = String(allData[i][3] || '').trim();
    if (name === data.name && type === '欠席' && dateSet[d]) {
      sheet.deleteRow(i + 1);
      deletedCount++;
    }
  }

  // 長期休みとして登録
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  sheet.appendRow([
    data.startDate,
    data.name,
    '終日',
    '長期休み',
    data.reason || '自動昇格（連続欠席検出）',
    data.reporter || '比嘉',
    now,
    ''
  ]);

  return {
    success: true,
    message: data.name + '様を長期休みに昇格しました（' + deletedCount + '件の欠席を削除）'
  };
}

// ---- getResumedTodayList ----
function getResumedTodayList(ss, dateStr) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getDataRange().getValues();
  var result = [];
  var todayStr = dateStr || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  for (var i = 1; i < data.length; i++) {
    var type = String(data[i][3] || '').trim();
    if (type !== '長期休み') continue;
    var endDate = data[i][7] ? fmtDate(data[i][7]) : '';
    if (endDate === todayStr) {
      result.push({
        name: String(data[i][1] || '').trim(),
        resumeDate: endDate
      });
    }
  }
  return result;
}

// ---- handleAddIryouhiColumn ----
function handleAddIryouhiColumn(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  try {
    var USERS_SS_ID = '1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0'; // 利用者台帳スプレッドシート
    var ss = SpreadsheetApp.openById(USERS_SS_ID);
    var sheet = ss.getSheetByName('利用者台帳');
    if (!sheet) return respond({ error: '利用者台帳シートが見つかりません' }, callback);

    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    // 既に存在するかチェック
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).indexOf('医療費控除') >= 0) {
        return respond({ skipped: true, message: '既に「' + headers[i] + '」列が存在します（' + (i + 1) + '列目）' }, callback);
      }
    }

    // 末尾に列を追加
    var newColIndex = lastCol + 1;
    sheet.getRange(1, newColIndex).setValue('医療費控除対象');
    return respond({ ok: true, message: '「医療費控除対象」列を追加しました', column: newColIndex }, callback);
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}
