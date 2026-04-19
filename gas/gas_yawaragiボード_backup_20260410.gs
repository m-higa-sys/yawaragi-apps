// ===== yawaragiボード GAS =====
// 利用者台帳スプレッドシートと連携し、出欠管理・伝達事項・ケアマネ通知を行う
//
// ★ 初回セットアップ:
//   1. 利用者台帳スプレッドシートの「拡張機能」→「Apps Script」を開く
//   2. 新しいスクリプトファイルを作成してこのコードを貼り付け
//   3. setupSheets() を1回実行（新しいシートが3つ作成される）
//   4. 「デプロイ」→「新しいデプロイ」→ ウェブアプリ
//      - 実行ユーザー: 自分
//      - アクセス: 全員
//   5. デプロイURLをyawaragiボード.htmlの設定に入力
//
// ★ 注意: 既存のGAS（利用者台帳v2等）とは別のデプロイになります
//   既存のデプロイURLは変わりません

// ===== 設定 =====
var SS_ID = '1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0';
var OWNER_EMAIL = 'm-higa@keepfitlife.com';
var FACILITY_NAME = 'リハビリデイサービス yawaragi';
var FACILITY_TEL = '0493-81-7645';
var DRAFT_MODE = true;
// ↑ true: ケアマネへのメールをGmailの「下書き」に保存（確認してから送信）
//   false: 自動送信（慣れたらfalseに変更）

// ===== 初回セットアップ（1回だけ実行）=====
function setupSheets() {
  var ss = SpreadsheetApp.openById(SS_ID);

  // 出欠変更シート
  if (!ss.getSheetByName('出欠変更')) {
    var s = ss.insertSheet('出欠変更');
    s.getRange(1, 1, 1, 8).setValues([[
      '日付', '利用者名', '単位', '種別', '理由', '連絡者', '登録日時', 'ケアマネ通知'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 8).setBackground('#4a90d9').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 110);
    s.setColumnWidth(2, 100);
    s.setColumnWidth(5, 150);
    s.setColumnWidth(7, 160);
    s.setColumnWidth(8, 120);
  }

  // 伝達事項シート
  if (!ss.getSheetByName('伝達事項')) {
    var s = ss.insertSheet('伝達事項');
    s.getRange(1, 1, 1, 5).setValues([[
      '対象日', '内容', '登録者', '登録日時', 'ステータス'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 5).setBackground('#27ae60').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(2, 300);
    s.setColumnWidth(4, 160);
    s.setColumnWidth(5, 100);
  }

  // ケアマネ連絡先シート
  if (!ss.getSheetByName('ケアマネ連絡先')) {
    var s = ss.insertSheet('ケアマネ連絡先');
    s.getRange(1, 1, 1, 3).setValues([[
      'ケアマネ事業所', 'ケアマネ名', 'メールアドレス'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 3).setBackground('#8e44ad').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 200);
    s.setColumnWidth(2, 120);
    s.setColumnWidth(3, 250);
  }

  Logger.log('セットアップ完了！出欠変更・伝達事項・ケアマネ連絡先の3シートを作成しました。');
}

// ===== Web API: GET（JSONP対応）=====
function doGet(e) {
  var callback = e && e.parameter ? e.parameter.callback : null;
  var action = e && e.parameter ? e.parameter.action || 'all' : 'all';
  var dateStr = e && e.parameter ? e.parameter.date : null;

  try {
    var ss = SpreadsheetApp.openById(SS_ID);
    var today = dateStr || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var dow = getDayOfWeek(today);

    var result = { success: true, date: today, dayOfWeek: dow };

    if (action === 'all' || action === 'attendance') {
      result.attendance = getAttendance(ss, today, dow);
    }
    if (action === 'all' || action === 'absences') {
      result.absences = getUpcomingAbsences(ss, today);
    }
    if (action === 'all' || action === 'messages') {
      result.messages = getMessages(ss, today);
    }
    if (action === 'all' || action === 'contacts') {
      result.cmContacts = getCmContacts(ss);
    }
    if (action === 'all') {
      result.patterns = getUserPatterns(ss);
    }

    return respond(result, callback);
  } catch (err) {
    return respond({ error: err.message, success: false }, callback);
  }
}

// ===== Web API: POST =====
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SS_ID);

    switch (data.action) {
      case 'absence':
        return jsonResp(registerAbsence(ss, data));
      case 'cancel_absence':
        return jsonResp(cancelAbsence(ss, data));
      case 'long_term_absence':
        return jsonResp(registerLongTermAbsence(ss, data));
      case 'resume':
        return jsonResp(registerResume(ss, data));
      case 'message':
        return jsonResp(addMessage(ss, data));
      case 'update_message_status':
        return jsonResp(updateMessageStatus(ss, data));
      default:
        return jsonResp({ error: '不明なアクション', success: false });
    }
  } catch (err) {
    return jsonResp({ error: err.message, success: false });
  }
}

// ===== 出席予定を取得（通所パターン＋出欠変更）=====
function getAttendance(ss, dateStr, dow) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return { am: [], pm: [] };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { am: [], pm: [] };

  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var daysCol = findCol(h, ['利用曜日']);
  var ampmCol = findCol(h, ['午前/午後', '午前午後']);
  var statusCol = findColP(h, 'ステータス');
  if (statusCol < 0) statusCol = findColP(h, '利用状況');
  var careCol = findColP(h, '介護度');
  if (careCol < 0) careCol = findColP(h, '要介護');
  var kanaCol = findCol(h, ['氏名（カナ）', 'カナ', 'フリガナ', 'ふりがな']);
  var cmNameCol = findColContains(h, 'ケアマネ', '担当');
  var cmOfficeCol = findColContains(h, 'ケアマネ', '事業所');
  if (cmOfficeCol < 0) cmOfficeCol = findColP(h, '居宅');

  if (nameCol < 0) return { error: '名前列が見つかりません', am: [], pm: [] };

  // この日の欠席マップ
  var absMap = getAbsenceMap(ss, dateStr);

  var am = [], pm = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    if (!name) continue;

    // ステータスチェック
    if (statusCol >= 0) {
      var st = String(data[i][statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) continue;
    }

    var days = daysCol >= 0 ? String(data[i][daysCol] || '').trim() : '';
    var ampmVal = ampmCol >= 0 ? String(data[i][ampmCol] || '').trim() : '';
    var kana = kanaCol >= 0 ? String(data[i][kanaCol] || '').trim() : '';
    var care = careCol >= 0 ? String(data[i][careCol] || '').trim() : '';
    var cmName = cmNameCol >= 0 ? String(data[i][cmNameCol] || '').trim() : '';
    var cmOffice = cmOfficeCol >= 0 ? String(data[i][cmOfficeCol] || '').trim() : '';

    // この曜日に来るか判定
    if (!days || days.indexOf(dow) < 0) continue;

    // 午前/午後判定
    var parsed = parseAmPm(ampmVal);

    // 欠席チェック
    var absAm = absMap[name + '_午前'] || absMap[name + '_終日'];
    var absPm = absMap[name + '_午後'] || absMap[name + '_終日'];

    if (parsed.am) {
      am.push({
        name: name, kana: kana, care: care, cmName: cmName, cmOffice: cmOffice,
        status: absAm ? '欠席' : '出席',
        reason: absAm ? absAm.reason : ''
      });
    }
    if (parsed.pm) {
      pm.push({
        name: name, kana: kana, care: care, cmName: cmName, cmOffice: cmOffice,
        status: absPm ? '欠席' : '出席',
        reason: absPm ? absPm.reason : ''
      });
    }
  }

  return { am: am, pm: pm };
}

// 午前/午後の判定
function parseAmPm(val) {
  val = val.replace(/\s/g, '');
  if (!val || val === '両方' || val === '午前午後' ||
    (val.indexOf('午前') >= 0 && val.indexOf('午後') >= 0) ||
    (val.indexOf('1') >= 0 && val.indexOf('2') >= 0) && val.length <= 4) {
    return { am: true, pm: true };
  }
  if (val.indexOf('午前') >= 0 || val === '1') return { am: true, pm: false };
  if (val.indexOf('午後') >= 0 || val === '2') return { am: false, pm: true };
  return { am: true, pm: true }; // デフォルト: 両方
}

// 全利用者の通所パターンを取得（期間指定の欠席登録用）
function getUserPatterns(ss) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return {};

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return {};

  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var kanaCol2 = findCol(h, ['氏名（カナ）', 'カナ', 'フリガナ', 'ふりがな']);
  var daysCol = findCol(h, ['利用曜日']);
  var ampmCol = findCol(h, ['午前/午後', '午前午後']);
  var statusCol = findColP(h, 'ステータス');
  if (statusCol < 0) statusCol = findColP(h, '利用状況');
  var careCol2 = findColP(h, '介護度');
  if (careCol2 < 0) careCol2 = findColP(h, '要介護');

  var patterns = {};
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    if (!name) continue;
    if (statusCol >= 0) {
      var st = String(data[i][statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) continue;
    }
    var kana = kanaCol2 >= 0 ? String(data[i][kanaCol2] || '').trim() : '';
    var care = careCol2 >= 0 ? String(data[i][careCol2] || '').trim() : '';
    var days = daysCol >= 0 ? String(data[i][daysCol] || '').trim() : '';
    var ampm = ampmCol >= 0 ? String(data[i][ampmCol] || '').trim() : '';
    var parsed = parseAmPm(ampm);
    var unitLabel = (parsed.am && parsed.pm) ? '午前午後' : parsed.am ? '午前' : '午後';
    patterns[name] = { days: days, unit: unitLabel, kana: kana, care: care };
  }
  return patterns;
}

// 指定日の欠席マップ（通常欠席＋長期休み中）
function getAbsenceMap(ss, dateStr) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return {};

  var data = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var d = fmtDate(data[i][0]);
    var name = String(data[i][1] || '').trim();
    var unit = String(data[i][2] || '').trim();
    var type = String(data[i][3] || '').trim();
    var reason = String(data[i][4] || '').trim();

    // 通常欠席
    if (type === '欠席' && d === dateStr) {
      if (unit === '終日' || !unit) {
        map[name + '_終日'] = { reason: reason };
      } else {
        map[name + '_' + unit] = { reason: reason };
      }
    }

    // 長期休み（開始日 <= 対象日、かつ終了日が空 or 終了日 > 対象日）
    if (type === '長期休み') {
      var endDate = data[i][7] ? fmtDate(data[i][7]) : '';
      if (d <= dateStr && (!endDate || endDate > dateStr)) {
        map[name + '_終日'] = { reason: '長期休み（' + reason + '）' };
      }
    }
  }
  return map;
}

// 今後の欠席予定を取得（今日以降14日分）＋長期休み中の人
function getUpcomingAbsences(ss, todayStr) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return [];

  // 14日後の日付
  var parts = todayStr.split('-');
  var endDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]) + 14);
  var endStr = Utilities.formatDate(endDate, 'Asia/Tokyo', 'yyyy-MM-dd');

  var data = sheet.getDataRange().getValues();
  var list = [];
  var longTermList = [];
  for (var i = 1; i < data.length; i++) {
    var d = fmtDate(data[i][0]);
    var type = String(data[i][3] || '').trim();

    // 通常欠席
    if (type === '欠席' && d >= todayStr && d <= endStr) {
      list.push({
        date: d,
        name: String(data[i][1] || '').trim(),
        unit: String(data[i][2] || '').trim(),
        reason: String(data[i][4] || '').trim(),
        reporter: String(data[i][5] || '').trim(),
        isLongTerm: false
      });
    }

    // 長期休み中（終了日が空 or 終了日が今日以降）
    if (type === '長期休み') {
      var endDateLT = data[i][7] ? fmtDate(data[i][7]) : '';
      if (!endDateLT || endDateLT > todayStr) {
        longTermList.push({
          date: d,
          name: String(data[i][1] || '').trim(),
          unit: '終日',
          reason: '長期休み（' + String(data[i][4] || '').trim() + '）',
          reporter: String(data[i][5] || '').trim(),
          isLongTerm: true,
          resumeDate: endDateLT || ''
        });
      }
    }
  }

  list.sort(function (a, b) { return a.date.localeCompare(b.date) || a.name.localeCompare(b.name); });
  return { absences: list, longTerm: longTermList };
}

// 伝達事項を取得
function getMessages(ss, dateStr) {
  var sheet = ss.getSheetByName('伝達事項');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var d = fmtDate(data[i][0]);
    if (d !== dateStr) continue;

    var rawStatus = String(data[i][4] || '').trim();
    // 旧データ互換: '済' → '完了', 空 → '未対応'
    var status = '未対応';
    if (rawStatus === '済' || rawStatus === '完了') status = '完了';
    else if (rawStatus === '対応中') status = '対応中';
    else if (rawStatus) status = rawStatus;

    list.push({
      row: i + 1,
      content: String(data[i][1] || '').trim(),
      author: String(data[i][2] || '').trim(),
      timestamp: String(data[i][3] || ''),
      status: status
    });
  }
  return list;
}

// ケアマネ連絡先を取得
function getCmContacts(ss) {
  var sheet = ss.getSheetByName('ケアマネ連絡先');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var office = String(data[i][0] || '').trim();
    var name = String(data[i][1] || '').trim();
    var email = String(data[i][2] || '').trim();
    if (!office && !name) continue;
    list.push({ office: office, name: name, email: email });
  }
  return list;
}

// ===== 欠席登録 =====
function registerAbsence(ss, data) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { error: '出欠変更シートがありません。setupSheets()を実行してください。', success: false };

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var dates = data.dates || [data.date];
  var unit = data.unit || '午前';

  // 期間指定の場合、通所パターンでフィルタ
  if (dates.length > 1) {
    var userDays = getUserDaysForName(ss, data.name);
    if (userDays) {
      dates = dates.filter(function (d) {
        return userDays.indexOf(getDayOfWeek(d)) >= 0;
      });
    }
  }

  if (dates.length === 0) {
    return { error: '指定期間内に通所予定日がありません', success: false };
  }

  // ケアマネにメール通知
  var cmNotified = '';
  if (data.cmEmail) {
    try {
      sendAbsenceEmail(
        data.name, dates, unit, data.reason || '', data.supplement || '',
        data.cmEmail, data.cmName || '', data.cmOffice || ''
      );
      cmNotified = DRAFT_MODE ? '下書き保存' : '送信済';
    } catch (emailErr) {
      cmNotified = 'エラー: ' + emailErr.message;
    }
  } else {
    cmNotified = 'メールなし';
  }

  // 社長に通知
  try {
    notifyOwner(data.name, dates, unit, data.reason || '', data.reporter || '');
  } catch (e) {
    // 通知失敗しても登録は続行
  }

  // スプレッドシートに記録
  for (var i = 0; i < dates.length; i++) {
    sheet.appendRow([
      dates[i],
      data.name,
      unit,
      '欠席',
      data.reason || '',
      data.reporter || '',
      now,
      cmNotified
    ]);
  }

  return { success: true, count: dates.length, message: dates.length + '日分の欠席を登録しました' };
}

// ===== 長期休み登録 =====
function registerLongTermAbsence(ss, data) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { error: '出欠変更シートがありません', success: false };

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var startDate = data.startDate || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  // スプレッドシートに記録（8列目は再開日＝空）
  sheet.appendRow([
    startDate,
    data.name,
    '終日',
    '長期休み',
    data.reason || '',
    data.reporter || '',
    now,
    ''
  ]);

  // 社長にLINE通知
  try {
    var msg = '【長期休み開始】\n';
    msg += data.name + '様\n';
    msg += '開始日: ' + fmtDateJP(startDate) + '\n';
    msg += '理由: ' + (data.reason || '未記入') + '\n';
    msg += '連絡者: ' + (data.contact || '未記入') + '\n';
    msg += '連絡方法: ' + (data.method || '未記入') + '\n';
    msg += '受付者: ' + (data.reporter || '未記入');
    sendLine(msg);
  } catch (e) {}

  return { success: true, message: '長期休みを登録しました' };
}

// ===== 再開登録 =====
function registerResume(ss, data) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { error: '出欠変更シートがありません', success: false };

  var allData = sheet.getDataRange().getValues();
  var found = false;

  // 長期休みの行を探して、8列目に再開日を書き込む
  for (var i = allData.length - 1; i >= 1; i--) {
    var name = String(allData[i][1] || '').trim();
    var type = String(allData[i][3] || '').trim();
    var endCol = allData[i][7] ? String(allData[i][7]).trim() : '';

    if (name === data.name && type === '長期休み' && !endCol) {
      sheet.getRange(i + 1, 8).setValue(data.resumeDate);
      found = true;
      break;
    }
  }

  if (!found) {
    return { error: 'この利用者の長期休みが見つかりません', success: false };
  }

  // 社長にLINE通知
  try {
    var msg = '【再開連絡】\n';
    msg += data.name + '様\n';
    msg += '再開日: ' + fmtDateJP(data.resumeDate) + '\n';
    msg += '連絡者: ' + (data.contact || '未記入') + '\n';
    msg += '連絡方法: ' + (data.method || '未記入') + '\n';
    msg += '受付者: ' + (data.reporter || '未記入');
    sendLine(msg);
  } catch (e) {}

  return { success: true, message: data.name + '様の再開を登録しました（' + data.resumeDate + 'から）' };
}

// 欠席キャンセル（行を削除）
function cancelAbsence(ss, data) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { error: 'シートがありません', success: false };

  var allData = sheet.getDataRange().getValues();
  var deleted = 0;

  // 後ろから削除（行番号ずれ防止）
  for (var i = allData.length - 1; i >= 1; i--) {
    var d = fmtDate(allData[i][0]);
    var name = String(allData[i][1] || '').trim();
    var unit = String(allData[i][2] || '').trim();

    if (d === data.date && name === data.name &&
      (data.unit === '終日' || unit === data.unit || unit === '終日')) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }

  // 取消通知（2026/4/10追加・「やっぱり利用する」パターン）
  if (deleted > 0) {
    try {
      var msg = '【欠席取消】\n';
      msg += data.name + '様\n';
      msg += '日付: ' + fmtDateJP(data.date) + '\n';
      msg += '単位: ' + (data.unit || '終日') + '\n';
      msg += '→ やっぱり利用します';
      if (data.reporter) msg += '\n連絡者: ' + data.reporter;
      sendLine(msg);
    } catch (e) {}
  }

  return { success: true, deleted: deleted };
}

// 利用者の通所曜日を取得
function getUserDaysForName(ss, userName) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var daysCol = findCol(h, ['利用曜日']);
  if (nameCol < 0 || daysCol < 0) return null;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][nameCol] || '').trim() === userName) {
      return String(data[i][daysCol] || '').trim();
    }
  }
  return null;
}

// ===== ケアマネにメール =====
function sendAbsenceEmail(userName, dates, unit, reason, supplement, cmEmail, cmName, cmOffice) {
  var dateText = dates.map(function (d) {
    return fmtDateJP(d) + '（' + getDayOfWeek(d) + '）';
  }).join('\n       ');

  var unitText = unit === '終日' ? '午前・午後（終日）' : unit + 'の部';

  var subject = 'ご利用者様欠席のご連絡（' + FACILITY_NAME + '／' + userName + '様）';

  var body = '';
  if (cmOffice) body += cmOffice + '\n';
  if (cmName) body += cmName + '様\n';
  body += '\nいつもお世話になっております。\n';
  body += FACILITY_NAME + 'の比嘉です。\n\n';
  body += 'ご利用者の' + userName + '様について、ご連絡いたします。\n\n';
  body += '【欠席のご連絡】\n';
  body += '  日付: ' + dateText + '\n';
  body += '  単位: ' + unitText + '\n';
  if (reason) body += '  理由: ' + reason + '\n';
  if (supplement) body += '  補足: ' + supplement + '\n';
  body += '\nご不明な点がございましたら、お気軽にお問い合わせください。\n\n';
  body += '━━━━━━━━━━━━━━━━━━━━━\n';
  body += FACILITY_NAME + '\n';
  body += '比嘉 学\n';
  body += 'TEL: ' + FACILITY_TEL + '\n';
  body += '━━━━━━━━━━━━━━━━━━━━━\n';

  if (DRAFT_MODE) {
    GmailApp.createDraft(cmEmail, subject, body);
  } else {
    GmailApp.sendEmail(cmEmail, subject, body);
  }
}

// ===== 社長に通知（LINE + Gmail 両方送信）=====
var LINE_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');
var OWNER_USER_ID = PropertiesService.getScriptProperties().getProperty('OWNER_USER_ID');

function notifyOwner(userName, dates, unit, reason, reporter) {
  var dateText = dates.map(function (d) {
    return fmtDateJP(d) + '（' + getDayOfWeek(d) + '）';
  }).join('、');

  var msg = '【欠席連絡】\n';
  msg += userName + '様\n';
  msg += '日付: ' + dateText + '\n';
  msg += '単位: ' + unit + '\n';
  msg += '理由: ' + (reason || '未記入') + '\n';
  msg += '連絡者: ' + (reporter || '未記入');
  sendLine(msg);
}

// 社長への通知（LINE + Gmail両方・2026/4/10更新）
// LINE: 普段のメイン通知（Apple Watchで分かりやすい）
// Gmail: LINE上限超過時のバックアップ（実質無制限）
function sendLine(message) {
  // === LINE送信（無料枠200通超過時は無音で失敗・5/1にリセット） ===
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
  } catch (e) {}

  // === Gmail送信（バックアップ・常に届く） ===
  try {
    // メッセージから件名を組む（例: 【yawaragi欠席連絡】欠席連絡 山田様）
    var lines = message.split('\n');
    var category = lines[0] ? lines[0].replace(/【|】/g, '') : '通知';
    var name = lines[1] || '';
    var subject = '【yawaragi欠席連絡】' + category + ' ' + name;
    GmailApp.sendEmail(OWNER_EMAIL, subject, message);
  } catch (e) {}
}

// ===== 伝達事項追加 =====
function addMessage(ss, data) {
  var sheet = ss.getSheetByName('伝達事項');
  if (!sheet) return { error: '伝達事項シートがありません', success: false };

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var targetDate = data.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  sheet.appendRow([targetDate, data.content || '', data.author || '', now, '未対応']);
  return { success: true };
}

// ===== 伝達事項ステータス更新 =====
function updateMessageStatus(ss, data) {
  var sheet = ss.getSheetByName('伝達事項');
  if (!sheet) return { error: 'シートがありません', success: false };
  if (!data.row) return { error: '行番号が必要です', success: false };

  var validStatus = ['未対応', '対応中', '完了'];
  var newStatus = data.status || '完了';
  if (validStatus.indexOf(newStatus) < 0) {
    return { error: '無効なステータスです', success: false };
  }

  sheet.getRange(data.row, 5).setValue(newStatus);
  return { success: true, status: newStatus };
}

// ===== ユーティリティ =====
function getDayOfWeek(dateStr) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
}

function fmtDate(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
  var s = String(val || '').trim();
  var m = s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  return s;
}

function fmtDateJP(dateStr) {
  var parts = dateStr.split('-');
  return parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
}

function findCol(headers, candidates) {
  for (var i = 0; i < headers.length; i++) {
    for (var j = 0; j < candidates.length; j++) {
      if (headers[i] === candidates[j]) return i;
    }
  }
  return -1;
}

function findColP(headers, keyword) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].indexOf(keyword) >= 0) return i;
  }
  return -1;
}

function findColContains(headers, kw1, kw2) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].indexOf(kw1) >= 0 && headers[i].indexOf(kw2) >= 0) return i;
  }
  return -1;
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

function jsonResp(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
