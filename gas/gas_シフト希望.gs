// ============================================
// シフト希望入力 GAS（Google Apps Script）
// スプレッドシートに紐づけて使用
// PIN認証＋管理者モード対応
// ============================================

const SHEET_WISHES = 'シフト希望';
const SHEET_STAFF_SHIFT = 'スタッフ';
const SHEET_SETTINGS = '設定';
const SHEET_LOG = '変更履歴';
const SHEET_JOUHO = '譲歩カウント';
const SHEET_CONDITIONS = '希望条件';
const SHEET_ABSENCES = '外せない予定';
const SHEET_NOTIFICATIONS = '通知';
const SHEET_BOSS_REST = '社長休み';

// ============================================
// スタッフ役割設定（複数役割対応）
// ============================================
const STAFF_ROLES = {
  '看護師': ['髙山', '春山', '石井'],
  'ドライバー': ['勝又', '星野', '小野', '林'],
  '介護福祉士': ['勝又', '星野', '下浦', '大久保'],
  '生活相談員': ['勝又', '星野', '下浦', '大久保', '工藤'],
  '機能訓練指導員': ['比嘉', '髙山', '春山', '石井']
};

// 最低人数（これを下回ると警告）
const MIN_STAFF = {
  '看護師': 1,
  'ドライバー': 3,
  'ドライバー_社長休み': 3,
  '介護福祉士': 2,
  '生活相談員': 1,
  '機能訓練指導員': 2
};

// --- 年月の正規化（スプレッドシートが日付変換してしまう対策） ---
function normalizeMonth_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM');
  }
  return String(val);
}

// --- google.script.run用（GAS Webアプリ画面から呼ばれる） ---
function handleAction(params) {
  const action = params.action;
  switch (action) {
    case 'getAllData': return getAllData(params.month, params.staff);
    case 'getAllDataAdmin': return getAllDataAdmin(params.month);
    case 'getStaff': return getStaff();
    case 'getWishes': return getWishes(params.month);
    case 'addWish': return addWish(params);
    case 'removeWish': return removeWish(params);
    case 'getSettings': return getSettings();
    case 'verifyPin': return verifyPin(params.staff, params.pin);
    case 'verifyAdminPin': return verifyAdminPin(params.pin);
    case 'getConditions': return getConditions(params.staff);
    case 'addCondition': return addCondition(params);
    case 'approveCondition': return approveCondition(params);
    case 'rejectCondition': return rejectCondition(params);
    case 'getAbsences': return getAbsences(params.month);
    case 'addAbsence': return addAbsence(params);
    case 'removeAbsence': return removeAbsence(params);
    case 'getNotifications': return getNotifications(params.staff);
    case 'markNotificationRead': return markNotificationRead(params);
    case 'addBossRest': return addBossRest(params);
    case 'removeBossRest': return removeBossRest(params);
    case 'getBossRests': return getBossRests(params.month);
    default: return { error: '不明なアクション: ' + action };
  }
}

// --- Web APIエンドポイント ---
function doGet(e) {
  const action = e.parameter.action;
  const callback = e.parameter.callback;

  // アクションなし → HTMLページを配信（スマホアクセス用）
  if (!action && !callback) {
    return HtmlService.createHtmlOutputFromFile('画面')
      .setTitle('シフト希望入力 - yawaragi')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  try {
    let result;
    switch (action) {
      case 'getAllData':
        result = getAllData(e.parameter.month, e.parameter.staff);
        break;
      case 'getAllDataAdmin':
        result = getAllDataAdmin(e.parameter.month);
        break;
      case 'getStaff':
        result = getStaff();
        break;
      case 'getWishes':
        result = getWishes(e.parameter.month);
        break;
      case 'addWish':
        result = addWish(e.parameter);
        break;
      case 'removeWish':
        result = removeWish(e.parameter);
        break;
      case 'getSettings':
        result = getSettings();
        break;
      case 'verifyPin':
        result = verifyPin(e.parameter.staff, e.parameter.pin);
        break;
      case 'verifyAdminPin':
        result = verifyAdminPin(e.parameter.pin);
        break;
      case 'getConditions':
        result = getConditions(e.parameter.staff);
        break;
      case 'addCondition':
        result = addCondition(e.parameter);
        break;
      case 'approveCondition':
        result = approveCondition(e.parameter);
        break;
      case 'rejectCondition':
        result = rejectCondition(e.parameter);
        break;
      case 'getAbsences':
        result = getAbsences(e.parameter.month);
        break;
      case 'addAbsence':
        result = addAbsence(e.parameter);
        break;
      case 'removeAbsence':
        result = removeAbsence(e.parameter);
        break;
      case 'getNotifications':
        result = getNotifications(e.parameter.staff);
        break;
      case 'markNotificationRead':
        result = markNotificationRead(e.parameter);
        break;
      case 'addBossRest':
        result = addBossRest(e.parameter);
        break;
      case 'removeBossRest':
        result = removeBossRest(e.parameter);
        break;
      case 'getBossRests':
        result = getBossRests(e.parameter.month);
        break;
      default:
        result = { error: '不明なアクション: ' + action };
    }
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const errResult = { error: err.message };
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(errResult) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify(errResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  try {
    let result;
    switch (action) {
      case 'addWish':
        result = addWish(data);
        break;
      case 'removeWish':
        result = removeWish(data);
        break;
      default:
        result = { error: '不明なアクション: ' + action };
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// --- PIN認証 ---
function verifyPin(staffName, pin) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_STAFF_SHIFT);
  if (!sheet) return { success: false, message: 'シートが見つかりません' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === staffName) {
      const storedPin = String(data[i][1]);
      if (storedPin === String(pin)) {
        const staffType = String(data[i][2] || '');
        return { success: true, staffType: staffType };
      } else {
        return { success: false, message: 'PINが違います' };
      }
    }
  }
  return { success: false, message: 'スタッフが見つかりません' };
}

// --- 管理者PIN認証 ---
function verifyAdminPin(pin) {
  const settings = getSettings();
  if (String(pin) === String(settings.adminPin)) {
    return { success: true };
  }
  return { success: false, message: '管理者PINが違います' };
}

// --- スタッフ一覧の取得（PIN列は返さない） ---
function getStaff() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_STAFF_SHIFT);
  if (!sheet) return { error: 'シートが見つかりません' };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { staff: [] };

  const staff = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    staff.push(String(data[i][0]));
  }
  return { staff: staff };
}

// --- 希望の取得（月指定） ---
function getWishes(monthStr) {
  if (!monthStr) {
    const now = new Date();
    now.setMonth(now.getMonth() + 1);
    monthStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_WISHES);
  if (!sheet) return { wishes: [], month: monthStr };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { wishes: [], month: monthStr };

  const wishes = [];
  for (let i = 1; i < data.length; i++) {
    if (normalizeMonth_(data[i][0]) === monthStr) {
      wishes.push({
        staff: String(data[i][1]),
        day: Number(data[i][2]),
        timestamp: data[i][3]
          ? Utilities.formatDate(new Date(data[i][3]), 'Asia/Tokyo', 'MM/dd HH:mm')
          : ''
      });
    }
  }
  return { wishes: wishes, month: monthStr };
}

// --- 全データ一括取得（スタッフ用：自分の希望だけHTML側でフィルタ） ---
function getAllData(monthStr, staffName) {
  const staffResult = getStaff();
  const wishesResult = getWishes(monthStr);
  const settings = getSettings();
  const absences = getAbsences(wishesResult.month);
  // スタッフ用：外せない予定は日付のみ（理由・名前を除外）
  var absencesFiltered = (absences.absences || []).map(function(a) {
    return { days: a.days };
  });
  var result = {
    staff: staffResult.staff || [],
    wishes: wishesResult.wishes || [],
    month: wishesResult.month,
    settings: { deadline: settings.deadline, maxPerDay: settings.maxPerDay },
    absences: absencesFiltered
  };
  // 通知を含める
  if (staffName) {
    result.notifications = getNotifications(staffName).notifications || [];
  }
  return result;
}

// --- 全データ一括取得（管理者用：全員の希望を返す） ---
function getAllDataAdmin(monthStr) {
  const staffResult = getStaff();
  const wishesResult = getWishes(monthStr);
  const settings = getSettings();
  const absences = getAbsences(wishesResult.month);
  const bossRests = getBossRests(wishesResult.month);
  return {
    staff: staffResult.staff || [],
    wishes: wishesResult.wishes || [],
    month: wishesResult.month,
    settings: { deadline: settings.deadline, maxPerDay: settings.maxPerDay },
    absences: absences.absences || [],
    bossRests: bossRests.rests || [],
    isAdmin: true
  };
}

// --- 希望の追加 ---
function addWish(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_WISHES);
  if (!sheet) return { error: 'シートが見つかりません' };

  // 重複チェック
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (normalizeMonth_(allData[i][0]) === data.month &&
        String(allData[i][1]) === data.staff &&
        Number(allData[i][2]) === Number(data.day)) {
      return { success: false, message: '既に登録済みです' };
    }
  }

  // 社員チェック：社員同士が同じ日に希望休を入れたらブロック
  const staffSheet = ss.getSheetByName(SHEET_STAFF_SHIFT);
  if (staffSheet) {
    const staffData = staffSheet.getDataRange().getValues();
    let myType = '';
    for (let i = 1; i < staffData.length; i++) {
      if (String(staffData[i][0]) === data.staff) {
        myType = String(staffData[i][2]);
        break;
      }
    }

    if (myType === '社員') {
      const otherEmployees = [];
      for (let i = 1; i < staffData.length; i++) {
        if (String(staffData[i][2]) === '社員' && String(staffData[i][0]) !== data.staff) {
          otherEmployees.push(String(staffData[i][0]));
        }
      }

      for (let i = 1; i < allData.length; i++) {
        if (normalizeMonth_(allData[i][0]) === data.month &&
            Number(allData[i][2]) === Number(data.day) &&
            otherEmployees.indexOf(String(allData[i][1])) >= 0) {
          var conflictName = String(allData[i][1]);
          return {
            success: false,
            blocked: true,
            message: 'この日は' + conflictName + 'さんも希望休です。\n社員が不在になるため登録できません。\n' + conflictName + 'さんと相談して、どちらかが譲ってください。'
          };
        }
      }
    }
  }

  // 人員基準チェック
  const [cy, cm] = data.month.split('-').map(Number);
  const checkDate = new Date(cy, cm - 1, Number(data.day));
  const staffCheck = checkStaffing_(checkDate, data.staff);
  if (staffCheck.blocked) {
    // ブロック時も相手に通知（相談してほしいから）
    var conflictNames = [];
    if (staffCheck.conflicts) {
      staffCheck.conflicts.forEach(function(c) {
        conflictNames.push(c.staff);
        addNotification_(c.staff, data.staff + 'さんが' + cm + '月' + data.day + '日の希望休を申請しましたが、' + c.reason + 'のため登録できませんでした。相談してください。', data.month, Number(data.day));
      });
    }
    var msg = staffCheck.message;
    if (conflictNames.length > 0) {
      msg += '\n' + conflictNames.join('さん、') + 'さんと相談してください。';
    }
    return { success: false, blocked: true, message: msg, conflicts: conflictNames };
  }

  const now = new Date();
  sheet.appendRow([data.month, data.staff, Number(data.day), now]);

  // 変更履歴に記録
  writeLog_(data.staff, '登録', data.month, Number(data.day));

  if (staffCheck.warning) {
    // 警告時：被った相手に通知を保存
    var conflictNames = [];
    if (staffCheck.conflicts) {
      staffCheck.conflicts.forEach(function(c) {
        conflictNames.push(c.staff);
        addNotification_(c.staff, data.staff + 'さんと' + cm + '月' + data.day + '日の希望休が被っています（' + c.reason + '）。相談してください。', data.month, Number(data.day));
      });
    }
    // 申請した本人にも通知保存（両方に出す）
    if (conflictNames.length > 0) {
      addNotification_(data.staff, conflictNames.join('さん、') + 'さんと' + cm + '月' + data.day + '日の希望休が被っています（' + staffCheck.message + '）。相談してください。', data.month, Number(data.day));
    }
    var msg = staffCheck.message;
    if (conflictNames.length > 0) {
      msg += '\n' + conflictNames.join('さん、') + 'さんと相談してください。';
    }
    return { success: true, warning: msg, conflicts: conflictNames };
  }
  return { success: true };
}

// --- 希望の削除 ---
function removeWish(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_WISHES);
  if (!sheet) return { error: 'シートが見つかりません' };

  const allData = sheet.getDataRange().getValues();
  for (let i = allData.length - 1; i >= 1; i--) {
    if (normalizeMonth_(allData[i][0]) === data.month &&
        String(allData[i][1]) === data.staff &&
        Number(allData[i][2]) === Number(data.day)) {
      sheet.deleteRow(i + 1);

      // 変更履歴に記録
      writeLog_(data.staff, '取消', data.month, Number(data.day));

      return { success: true };
    }
  }
  return { success: false, message: '該当する希望が見つかりません' };
}

// --- 設定の取得 ---
function getSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) return { deadline: 20, maxPerDay: 2, adminPin: '0000' };

  const data = sheet.getDataRange().getValues();
  const settings = { deadline: 20, maxPerDay: 2, adminPin: '0000' };
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === '提出期限日') settings.deadline = Number(data[i][1]);
    if (data[i][0] === '1日の上限') settings.maxPerDay = Number(data[i][1]);
    if (data[i][0] === '管理者PIN') settings.adminPin = String(data[i][1]);
  }
  return settings;
}

// ============================================
// 希望条件管理
// ============================================

// --- 条件の取得（staffName指定で個人、省略で全員） ---
function getConditions(staffName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONDITIONS);
  if (!sheet || sheet.getLastRow() <= 1) return { conditions: [] };

  const data = sheet.getDataRange().getValues();
  const conditions = [];
  for (let i = 1; i < data.length; i++) {
    if (staffName && String(data[i][0]) !== staffName) continue;
    conditions.push({
      id: i,
      staff: String(data[i][0]),
      content: String(data[i][1]),
      date: data[i][2] ? Utilities.formatDate(new Date(data[i][2]), 'Asia/Tokyo', 'yyyy/MM/dd') : '',
      status: String(data[i][3]) || '未確認',
      comment: String(data[i][4]) || '',
      approvedDate: data[i][5] ? Utilities.formatDate(new Date(data[i][5]), 'Asia/Tokyo', 'yyyy/MM/dd') : ''
    });
  }
  return { conditions: conditions };
}

// --- 条件の追加 ---
function addCondition(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_CONDITIONS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CONDITIONS);
    sheet.getRange(1, 1, 1, 6).setValues([['スタッフ名', '条件内容', '登録日', 'ステータス', '社長コメント', '承認日']]);
  }

  const now = new Date();
  sheet.appendRow([data.staff, data.content, now, '未確認', '', '']);

  return { success: true };
}

// --- 条件の承認 ---
function approveCondition(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONDITIONS);
  if (!sheet) return { success: false, message: 'シートが見つかりません' };

  const rowNum = Number(data.id) + 1;
  sheet.getRange(rowNum, 4).setValue('承認済み');
  sheet.getRange(rowNum, 5).setValue(data.comment || '');
  sheet.getRange(rowNum, 6).setValue(new Date());

  return { success: true };
}

// --- 条件の却下 ---
function rejectCondition(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONDITIONS);
  if (!sheet) return { success: false, message: 'シートが見つかりません' };

  const rowNum = Number(data.id) + 1;
  sheet.getRange(rowNum, 4).setValue('却下');
  sheet.getRange(rowNum, 5).setValue(data.comment || '');
  sheet.getRange(rowNum, 6).setValue(new Date());

  return { success: true };
}

// ============================================
// 外せない予定管理
// ============================================

// --- 外せない予定の取得（該当月に重なるものを返す） ---
function getAbsences(monthStr) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_ABSENCES);
  if (!sheet || sheet.getLastRow() <= 1) return { absences: [] };

  const data = sheet.getDataRange().getValues();
  const [y, m] = monthStr.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0);

  const absences = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var startDate = new Date(data[i][1]);
    var endDate = new Date(data[i][2]);
    // 該当月に重なるかチェック
    if (startDate <= monthEnd && endDate >= monthStart) {
      // 該当月内の日付リストを作成
      var days = [];
      for (var d = new Date(Math.max(startDate.getTime(), monthStart.getTime()));
           d <= Math.min(endDate.getTime(), monthEnd.getTime());
           d.setDate(d.getDate() + 1)) {
        days.push(d.getDate());
      }
      absences.push({
        id: i,
        staff: String(data[i][0]),
        startDate: Utilities.formatDate(startDate, 'Asia/Tokyo', 'MM/dd'),
        endDate: Utilities.formatDate(endDate, 'Asia/Tokyo', 'MM/dd'),
        reason: String(data[i][3] || ''),
        days: days
      });
    }
  }
  return { absences: absences };
}

// --- 外せない予定の追加 ---
function addAbsence(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_ABSENCES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ABSENCES);
    sheet.getRange(1, 1, 1, 5).setValues([['スタッフ名', '開始日', '終了日', '理由', '登録日']]);
  }

  var startDate = new Date(data.startDate);
  var endDate = new Date(data.endDate);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { success: false, message: '日付が正しくありません' };
  }
  if (startDate > endDate) {
    return { success: false, message: '開始日が終了日より後です' };
  }

  // 提出期限チェック：期限が過ぎた月は登録不可
  var now = new Date();
  var deadlineDay = 20;
  var minMonth;
  if (now.getDate() > deadlineDay) {
    minMonth = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  } else {
    minMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
  if (startDate < minMonth) {
    var minLabel = (minMonth.getMonth() + 1) + '月';
    return { success: false, message: '提出期限を過ぎているため、' + minLabel + 'より前の日付は登録できません' };
  }

  // 重複チェック：同じスタッフの既存の外せない予定と日付が重なっていたらブロック
  var allData = sheet.getDataRange().getValues();
  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][0]) === data.staff) {
      var existStart = new Date(allData[i][1]);
      var existEnd = new Date(allData[i][2]);
      if (startDate <= existEnd && endDate >= existStart) {
        return { success: false, message: 'この期間は既に外せない予定が登録されています' };
      }
    }
  }

  // 人員基準チェック（期間の各平日をチェック）
  var staffWarnings = [];
  var checkD = new Date(startDate);
  while (checkD <= endDate) {
    var dow = checkD.getDay();
    if (dow !== 0 && dow !== 6) { // 平日のみ
      var check = checkStaffing_(new Date(checkD), data.staff);
      if (check.blocked) {
        var label = (checkD.getMonth()+1) + '/' + checkD.getDate();
        return { success: false, blocked: true, message: label + '：' + check.message };
      }
      if (check.warning) {
        staffWarnings.push((checkD.getMonth()+1) + '/' + checkD.getDate() + '：' + check.message);
      }
    }
    checkD.setDate(checkD.getDate() + 1);
  }

  sheet.appendRow([data.staff, startDate, endDate, data.reason || '', new Date()]);

  if (staffWarnings.length > 0) {
    return { success: true, warning: staffWarnings.join('\n') };
  }
  return { success: true };
}

// ============================================
// 人員基準チェック（内部関数）
// STAFF_ROLES定数を使用。被り相手の名前も返す。
// ============================================
function checkStaffing_(targetDate, staffName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // その日に休む人を集める
  var absentees = {};
  absentees[staffName] = true; // 今回登録する人

  // 希望休シートから
  var wishSheet = ss.getSheetByName(SHEET_WISHES);
  if (wishSheet && wishSheet.getLastRow() > 1) {
    var monthStr = Utilities.formatDate(targetDate, 'Asia/Tokyo', 'yyyy-MM');
    var day = targetDate.getDate();
    var wishData = wishSheet.getDataRange().getValues();
    for (var i = 1; i < wishData.length; i++) {
      if (normalizeMonth_(wishData[i][0]) === monthStr && Number(wishData[i][2]) === day) {
        absentees[String(wishData[i][1])] = true;
      }
    }
  }

  // 外せない予定シートから
  var absSheet = ss.getSheetByName(SHEET_ABSENCES);
  if (absSheet && absSheet.getLastRow() > 1) {
    var absData = absSheet.getDataRange().getValues();
    for (var i = 1; i < absData.length; i++) {
      if (!absData[i][0]) continue;
      var aStart = new Date(absData[i][1]);
      var aEnd = new Date(absData[i][2]);
      aStart.setHours(0,0,0,0);
      aEnd.setHours(0,0,0,0);
      var check = new Date(targetDate);
      check.setHours(0,0,0,0);
      if (check >= aStart && check <= aEnd) {
        absentees[String(absData[i][0])] = true;
      }
    }
  }

  // 社長の休みチェック
  var bossOff = isBossOff_(targetDate);

  var warnings = [];
  var blocks = [];
  var conflicts = []; // { staff: '名前', reason: '理由' }

  // --- 看護師チェック（看護師 = 機能訓練指導員も兼ねる） ---
  var nurses = STAFF_ROLES['看護師'] || [];
  var nursesAvailable = [];
  var nursesOff = [];
  for (var i = 0; i < nurses.length; i++) {
    if (absentees[nurses[i]]) {
      if (nurses[i] !== staffName) nursesOff.push(nurses[i]);
    } else {
      nursesAvailable.push(nurses[i]);
    }
  }
  if (nurses.indexOf(staffName) >= 0) {
    if (nursesAvailable.length < MIN_STAFF['看護師']) {
      blocks.push('看護師が全員休みになります。基準を満たせません');
      nursesOff.forEach(function(n) { conflicts.push({ staff: n, reason: '看護師不足' }); });
    }
  }

  // --- 生活相談員チェック ---
  var counselors = STAFF_ROLES['生活相談員'] || [];
  var counselorsAvailable = [];
  var counselorsOff = [];
  for (var i = 0; i < counselors.length; i++) {
    if (absentees[counselors[i]]) {
      if (counselors[i] !== staffName) counselorsOff.push(counselors[i]);
    } else {
      counselorsAvailable.push(counselors[i]);
    }
  }
  if (counselors.indexOf(staffName) >= 0) {
    if (counselorsAvailable.length < MIN_STAFF['生活相談員']) {
      blocks.push('生活相談員が全員休みになります。基準を満たせません');
      counselorsOff.forEach(function(n) { conflicts.push({ staff: n, reason: '生活相談員不足' }); });
    }
  }

  // --- 介護福祉士チェック（サービス提供体制強化加算） ---
  var kaigo = STAFF_ROLES['介護福祉士'] || [];
  var kaigoAvailable = [];
  var kaigoOff = [];
  for (var i = 0; i < kaigo.length; i++) {
    if (absentees[kaigo[i]]) {
      if (kaigo[i] !== staffName) kaigoOff.push(kaigo[i]);
    } else {
      kaigoAvailable.push(kaigo[i]);
    }
  }
  if (kaigo.indexOf(staffName) >= 0) {
    if (kaigoAvailable.length < MIN_STAFF['介護福祉士']) {
      warnings.push('介護福祉士が' + kaigoAvailable.length + '人になります（サービス提供体制強化加算に2人必要）');
      kaigoOff.forEach(function(n) { conflicts.push({ staff: n, reason: '介護福祉士不足' }); });
    }
  }

  // --- 機能訓練指導員チェック（個別機能訓練加算） ---
  var kunren = STAFF_ROLES['機能訓練指導員'] || [];
  var kunrenAvailable = [];
  var kunrenOff = [];
  for (var i = 0; i < kunren.length; i++) {
    if (absentees[kunren[i]]) {
      if (kunren[i] !== staffName) kunrenOff.push(kunren[i]);
    } else {
      kunrenAvailable.push(kunren[i]);
    }
  }
  if (kunren.indexOf(staffName) >= 0) {
    if (kunrenAvailable.length < MIN_STAFF['機能訓練指導員']) {
      warnings.push('機能訓練指導員が' + kunrenAvailable.length + '人になります（個別機能訓練加算に2人必要）');
      kunrenOff.forEach(function(n) { conflicts.push({ staff: n, reason: '機能訓練指導員不足' }); });
    }
  }

  // --- ドライバーチェック ---
  var drivers = STAFF_ROLES['ドライバー'] || [];
  var driversAvailable = [];
  var driversOff = [];
  for (var i = 0; i < drivers.length; i++) {
    if (absentees[drivers[i]]) {
      if (drivers[i] !== staffName) driversOff.push(drivers[i]);
    } else {
      driversAvailable.push(drivers[i]);
    }
  }
  var minDrivers = bossOff ? MIN_STAFF['ドライバー_社長休み'] : MIN_STAFF['ドライバー'];
  if (drivers.indexOf(staffName) >= 0) {
    if (driversAvailable.length < minDrivers) {
      var driverMsg = '送迎ドライバーが' + driversAvailable.length + '人になります（最低' + minDrivers + '人必要）';
      if (driversAvailable.length < 2) {
        blocks.push(driverMsg);
      } else {
        warnings.push(driverMsg);
      }
      driversOff.forEach(function(n) { conflicts.push({ staff: n, reason: '送迎ドライバー不足' }); });
    }
  }

  // --- 全体人数チェック（小野・林を除くスタッフ5人以上確保） ---
  var coreStaff = ['勝又', '星野', '下浦', '工藤', '髙山', '春山', '大久保', '石井'];
  var coreAvailable = [];
  var coreOff = [];
  for (var i = 0; i < coreStaff.length; i++) {
    if (absentees[coreStaff[i]]) {
      if (coreStaff[i] !== staffName) coreOff.push(coreStaff[i]);
    } else {
      coreAvailable.push(coreStaff[i]);
    }
  }
  if (coreStaff.indexOf(staffName) >= 0) {
    if (coreAvailable.length < 5) {
      warnings.push('スタッフが' + coreAvailable.length + '人になります（最低5人必要）');
      coreOff.forEach(function(n) { conflicts.push({ staff: n, reason: 'スタッフ不足' }); });
    }
  }

  // 重複を除いたconflictsリスト
  var uniqueConflicts = [];
  var seen = {};
  for (var i = 0; i < conflicts.length; i++) {
    if (!seen[conflicts[i].staff]) {
      seen[conflicts[i].staff] = true;
      uniqueConflicts.push(conflicts[i]);
    }
  }

  if (blocks.length > 0) {
    return { ok: false, blocked: true, message: blocks.join('\n'), conflicts: uniqueConflicts };
  }
  if (warnings.length > 0) {
    return { ok: true, warning: true, message: warnings.join('\n'), conflicts: uniqueConflicts };
  }
  return { ok: true, conflicts: [] };
}

// --- 社長の休みチェック（内部関数） ---
function isBossOff_(targetDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_BOSS_REST);
  if (!sheet || sheet.getLastRow() <= 1) return false;

  var data = sheet.getDataRange().getValues();
  var check = new Date(targetDate);
  check.setHours(0,0,0,0);

  for (var i = 1; i < data.length; i++) {
    var restDate = new Date(data[i][0]);
    restDate.setHours(0,0,0,0);
    if (check.getTime() === restDate.getTime()) return true;
  }
  return false;
}

// --- 外せない予定の削除 ---
function removeAbsence(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_ABSENCES);
  if (!sheet) return { success: false, message: 'シートが見つかりません' };

  const rowNum = Number(data.id) + 1;
  sheet.deleteRow(rowNum);
  return { success: true };
}

// ============================================
// 変更履歴の自動記録（内部関数）
// ============================================
function writeLog_(staffName, action, month, day) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_LOG);
    sheet.getRange(1, 1, 1, 5).setValues([['日時', 'スタッフ', '操作', '対象月', '対象日']]);
  }
  const now = new Date();
  sheet.appendRow([now, staffName, action, month, day]);
}

// ============================================
// 譲歩カウント機能（社長がスプレッドシートから使う）
// ============================================

// メニューに追加
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('シフト希望管理')
    .addItem('被り確認（今月募集分）', 'showConflicts')
    .addItem('譲歩を記録', 'recordJouho')
    .addItem('譲歩カウント一覧', 'showJouhoCount')
    .addToUi();
}

// --- 被り確認：同じ日に2人以上希望がある日を表示 ---
function showConflicts() {
  // 翌月分をチェック
  const now = new Date();
  now.setMonth(now.getMonth() + 1);
  const monthStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM');

  const wishesResult = getWishes(monthStr);
  const wishes = wishesResult.wishes || [];

  // 日ごとに集計
  const dayMap = {};
  wishes.forEach(function(w) {
    if (!dayMap[w.day]) dayMap[w.day] = [];
    dayMap[w.day].push(w.staff);
  });

  // 被りがある日を抽出
  const conflicts = [];
  Object.keys(dayMap).sort(function(a,b) { return a - b; }).forEach(function(day) {
    if (dayMap[day].length >= 2) {
      conflicts.push(day + '日: ' + dayMap[day].join('、') + '（' + dayMap[day].length + '人）');
    }
  });

  if (conflicts.length === 0) {
    SpreadsheetApp.getUi().alert(
      monthStr + ' の被り確認\n\n' +
      '被りはありません！'
    );
  } else {
    SpreadsheetApp.getUi().alert(
      monthStr + ' の被り確認\n\n' +
      '【被りがある日】\n' +
      conflicts.join('\n') + '\n\n' +
      '→ 当事者にLINEで調整をお願いしてください\n' +
      '→ 譲ってくれた人は「譲歩を記録」で記録'
    );
  }
}

// --- 譲歩を記録：社長が「誰が譲ったか」を入力 ---
function recordJouho() {
  const ui = SpreadsheetApp.getUi();

  // スタッフ名を入力
  const nameResult = ui.prompt(
    '譲歩を記録',
    '譲ってくれたスタッフの名前を入力してください：',
    ui.ButtonSet.OK_CANCEL
  );
  if (nameResult.getSelectedButton() !== ui.Button.OK) return;
  const staffName = nameResult.getResponseText().trim();
  if (!staffName) return;

  // 対象月
  const now = new Date();
  now.setMonth(now.getMonth() + 1);
  const monthStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM');

  // 対象日を入力
  const dayResult = ui.prompt(
    '譲歩を記録',
    staffName + 'さんが譲ってくれた日（数字）を入力してください：\n' +
    '（例: 15）',
    ui.ButtonSet.OK_CANCEL
  );
  if (dayResult.getSelectedButton() !== ui.Button.OK) return;
  const day = Number(dayResult.getResponseText().trim());
  if (!day || day < 1 || day > 31) {
    ui.alert('正しい日付を入力してください');
    return;
  }

  // 譲歩カウントシートに記録
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_JOUHO);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_JOUHO);
    sheet.getRange(1, 1, 1, 4).setValues([['記録日', 'スタッフ', '対象月', '対象日']]);
  }

  sheet.appendRow([new Date(), staffName, monthStr, day]);

  ui.alert(
    '記録しました！\n\n' +
    staffName + 'さんが ' + monthStr + ' の ' + day + '日 を譲歩\n\n' +
    '累計は「譲歩カウント一覧」で確認できます'
  );
}

// --- 譲歩カウント一覧：全スタッフの累計を表示 ---
function showJouhoCount() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_JOUHO);

  if (!sheet || sheet.getLastRow() <= 1) {
    SpreadsheetApp.getUi().alert('まだ譲歩の記録がありません');
    return;
  }

  const data = sheet.getDataRange().getValues();
  const countMap = {};
  const latestMap = {};

  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][1]);
    const month = String(data[i][2]);
    const day = Number(data[i][3]);
    if (!countMap[name]) countMap[name] = 0;
    countMap[name]++;
    latestMap[name] = month + ' ' + day + '日';
  }

  // スタッフ一覧を取得して全員表示
  const staffResult = getStaff();
  const allStaff = staffResult.staff || [];

  const lines = [];
  allStaff.forEach(function(name) {
    const count = countMap[name] || 0;
    const latest = latestMap[name] || '−';
    lines.push(name + ': ' + count + '回' + (count > 0 ? '（直近: ' + latest + '）' : ''));
  });

  SpreadsheetApp.getUi().alert(
    '譲歩カウント一覧\n\n' +
    lines.join('\n') + '\n\n' +
    '※ 被り調整で譲ってくれた回数です\n' +
    '※ 次に被りがあったら、回数が少ない人を優先してください'
  );
}

// ============================================
// 初期セットアップ（1回だけ実行）
// ============================================
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // スタッフシート（PIN列追加）
  let staffSheet = ss.getSheetByName(SHEET_STAFF_SHIFT);
  if (!staffSheet) {
    staffSheet = ss.insertSheet(SHEET_STAFF_SHIFT);
  }
  staffSheet.getRange(1, 1, 1, 4).setValues([['名前', 'PIN', '区分', '職種']]);

  // 既存スタッフがいなければ初期データ（PINは全員0000）
  const staff = [
    ['勝又', '0000'], ['星野', '0000'], ['下浦', '0000'], ['工藤', '0000'], ['髙山', '0000'],
    ['春山', '0000'], ['大久保', '0000'], ['小野', '0000'], ['林', '0000'], ['石井', '0000']
  ];
  if (staffSheet.getLastRow() <= 1) {
    staffSheet.getRange(2, 1, staff.length, 2).setValues(staff);
  }

  // シフト希望シート
  let wishSheet = ss.getSheetByName(SHEET_WISHES);
  if (!wishSheet) {
    wishSheet = ss.insertSheet(SHEET_WISHES);
  }
  wishSheet.getRange(1, 1, 1, 4).setValues([['年月', 'スタッフ名', '日', '登録日時']]);

  // 設定シート（管理者PIN追加）
  let settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_SETTINGS);
  }
  settingsSheet.getRange(1, 1, 1, 2).setValues([['項目', '値']]);
  if (settingsSheet.getLastRow() <= 1) {
    settingsSheet.getRange(2, 1, 3, 2).setValues([
      ['提出期限日', 20],
      ['1日の上限', 2],
      ['管理者PIN', '1234']
    ]);
  }

  // 変更履歴シート
  let logSheet = ss.getSheetByName(SHEET_LOG);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_LOG);
  }
  logSheet.getRange(1, 1, 1, 5).setValues([['日時', 'スタッフ', '操作', '対象月', '対象日']]);

  // 譲歩カウントシート
  let jouhoSheet = ss.getSheetByName(SHEET_JOUHO);
  if (!jouhoSheet) {
    jouhoSheet = ss.insertSheet(SHEET_JOUHO);
  }
  jouhoSheet.getRange(1, 1, 1, 4).setValues([['記録日', 'スタッフ', '対象月', '対象日']]);

  SpreadsheetApp.getUi().alert(
    'セットアップ完了！\n\n' +
    '・スタッフ: ' + staff.length + '名（初期PIN: 0000）\n' +
    '・管理者PIN: 1234\n' +
    '・シフト希望シート: 準備OK\n' +
    '・変更履歴シート: 準備OK\n' +
    '・譲歩カウントシート: 準備OK\n' +
    '・設定: 提出期限日 20日 / 1日の上限 2名\n\n' +
    '※ スタッフシートでPINを個別に変更してください\n' +
    '※ 管理者PINは設定シートで変更できます'
  );
}

// ============================================
// 通知システム
// ============================================

// --- 通知の保存（内部関数） ---
function addNotification_(targetStaff, message, month, day) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NOTIFICATIONS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NOTIFICATIONS);
    sheet.getRange(1, 1, 1, 6).setValues([['対象スタッフ', 'メッセージ', '対象月', '対象日', '作成日', '既読']]);
  }
  sheet.appendRow([targetStaff, message, month, day, new Date(), '']);
}

// --- 通知の取得（未読のみ） ---
function getNotifications(staffName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NOTIFICATIONS);
  if (!sheet || sheet.getLastRow() <= 1) return { notifications: [] };

  var data = sheet.getDataRange().getValues();
  var notifications = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === staffName && String(data[i][5]) !== '既読') {
      notifications.push({
        id: i,
        message: String(data[i][1]),
        month: String(data[i][2]),
        day: Number(data[i][3]),
        date: data[i][4] ? Utilities.formatDate(new Date(data[i][4]), 'Asia/Tokyo', 'MM/dd HH:mm') : ''
      });
    }
  }
  return { notifications: notifications };
}

// --- 通知を既読にする ---
function markNotificationRead(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NOTIFICATIONS);
  if (!sheet) return { success: false };

  if (data.id) {
    // 個別既読
    var rowNum = Number(data.id) + 1;
    sheet.getRange(rowNum, 6).setValue('既読');
  } else if (data.staff) {
    // 全件既読
    var allData = sheet.getDataRange().getValues();
    for (var i = 1; i < allData.length; i++) {
      if (String(allData[i][0]) === data.staff && String(allData[i][5]) !== '既読') {
        sheet.getRange(i + 1, 6).setValue('既読');
      }
    }
  }
  return { success: true };
}

// ============================================
// 社長休み管理（スタッフには非公開）
// ============================================

// --- 社長の休みを登録 ---
function addBossRest(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_BOSS_REST);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_BOSS_REST);
    sheet.getRange(1, 1, 1, 2).setValues([['日付', '登録日']]);
  }

  var restDate = new Date(data.date);
  if (isNaN(restDate.getTime())) return { success: false, message: '日付が正しくありません' };

  // 重複チェック
  var allData = sheet.getDataRange().getValues();
  restDate.setHours(0,0,0,0);
  for (var i = 1; i < allData.length; i++) {
    var existing = new Date(allData[i][0]);
    existing.setHours(0,0,0,0);
    if (existing.getTime() === restDate.getTime()) {
      return { success: false, message: 'この日は既に登録済みです' };
    }
  }

  sheet.appendRow([restDate, new Date()]);
  return { success: true };
}

// --- 社長の休みを削除 ---
function removeBossRest(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_BOSS_REST);
  if (!sheet) return { success: false };

  var targetDate = new Date(data.date);
  targetDate.setHours(0,0,0,0);

  var allData = sheet.getDataRange().getValues();
  for (var i = allData.length - 1; i >= 1; i--) {
    var d = new Date(allData[i][0]);
    d.setHours(0,0,0,0);
    if (d.getTime() === targetDate.getTime()) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: '該当する日付が見つかりません' };
}

// --- 社長の休み一覧取得（月指定） ---
function getBossRests(monthStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_BOSS_REST);
  if (!sheet || sheet.getLastRow() <= 1) return { rests: [] };

  var [y, m] = monthStr.split('-').map(Number);
  var data = sheet.getDataRange().getValues();
  var rests = [];
  for (var i = 1; i < data.length; i++) {
    var d = new Date(data[i][0]);
    if (d.getFullYear() === y && (d.getMonth() + 1) === m) {
      rests.push(d.getDate());
    }
  }
  return { rests: rests };
}
