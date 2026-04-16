// ============================================
// 清掃・準備チェック表 GAS（Google Apps Script）
// スプレッドシートに紐づけて使用
// ============================================

// --- 設定 ---
const SHEET_TASKS = 'タスク一覧';
const SHEET_LOG = 'チェックログ';
const SHEET_STAFF = 'スタッフ';

// --- Web APIエンドポイント ---
function doGet(e) {
  const action = e.parameter.action;

  // パラメータなし → HTML画面を返す（iPad・タブレット対応）
  if (!action) {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('清掃・準備チェック表')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const callback = e.parameter.callback;
  try {
    let result;
    switch (action) {
      case 'getTasks':
        result = getTasks();
        break;
      case 'getLog':
        result = getLog(e.parameter.date);
        break;
      case 'getStaff':
        result = getStaff();
        break;
      case 'getMonthlyStats':
        result = getMonthlyStats(e.parameter.month);
        break;
      case 'getAllData':
        result = getAllData();
        break;
      case 'check':
        result = checkTask(e.parameter);
        break;
      case 'uncheck':
        result = uncheckTask(e.parameter);
        break;
      case 'addTask':
        result = addTask(e.parameter);
        break;
      case 'deleteTask':
        result = deleteTask(e.parameter);
        break;
      default:
        result = { error: '不明なアクション: ' + action };
    }
    // JSONP対応
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
      case 'check':
        result = checkTask(data);
        break;
      case 'uncheck':
        result = uncheckTask(data);
        break;
      case 'addTask':
        result = addTask(data);
        break;
      case 'deleteTask':
        result = deleteTask(data);
        break;
      case 'reorderTasks':
        result = reorderTasks(data);
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

// --- タスク一覧の取得 ---
function getTasks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TASKS);
  if (!sheet) return { error: 'シート「' + SHEET_TASKS + '」が見つかりません' };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { tasks: [] };

  // ヘッダー: No, タスク名, 時間帯, 曜日制限, メモ
  const tasks = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][1]) continue; // タスク名が空ならスキップ
    tasks.push({
      id: i,
      no: data[i][0],
      name: data[i][1],
      timeSlot: data[i][2],
      dayLimit: data[i][3] ? String(data[i][3]) : '',
      memo: data[i][4] || ''
    });
  }
  return { tasks: tasks };
}

// --- スタッフ一覧の取得 ---
function getStaff() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_STAFF);
  if (!sheet) return { error: 'シート「' + SHEET_STAFF + '」が見つかりません' };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { staff: [] };

  // ヘッダー: 名前
  const staff = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    staff.push(String(data[i][0]));
  }
  return { staff: staff };
}

// --- チェックログの取得（日付指定） ---
function getLog(dateStr) {
  if (!dateStr) {
    // 今日の日付（日本時間）
    const now = new Date();
    dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_LOG);
  if (!sheet) return { error: 'シート「' + SHEET_LOG + '」が見つかりません', log: [] };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { log: [], date: dateStr };

  // ヘッダー: 日付, タスクNo, タスク名, 完了者, 完了時間
  const log = [];
  for (let i = 1; i < data.length; i++) {
    const rowDate = Utilities.formatDate(new Date(data[i][0]), 'Asia/Tokyo', 'yyyy-MM-dd');
    if (rowDate === dateStr) {
      log.push({
        taskNo: data[i][1],
        taskName: data[i][2],
        staff: data[i][3],
        time: data[i][4] instanceof Date ? Utilities.formatDate(data[i][4], 'Asia/Tokyo', 'HH:mm') : String(data[i][4])
      });
    }
  }
  return { log: log, date: dateStr };
}

// --- 全データ一括取得 ---
function getAllData() {
  const tasksResult = getTasks();
  const logResult = getLog();
  const staffResult = getStaff();
  const statsResult = getMonthlyStats();
  return {
    tasks: tasksResult.tasks || [],
    log: logResult.log || [],
    staff: staffResult.staff || [],
    monthlyStats: statsResult.stats || {},
    date: logResult.date,
    month: statsResult.month
  };
}

// --- 月間統計の取得 ---
function getMonthlyStats(monthStr) {
  const now = new Date();
  if (!monthStr) {
    monthStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_LOG);
  if (!sheet) return { error: 'シート「' + SHEET_LOG + '」が見つかりません' };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { stats: {}, month: monthStr };

  const stats = {};
  for (let i = 1; i < data.length; i++) {
    const rowDate = Utilities.formatDate(new Date(data[i][0]), 'Asia/Tokyo', 'yyyy-MM');
    if (rowDate === monthStr) {
      const staffName = data[i][3];
      if (!stats[staffName]) stats[staffName] = 0;
      stats[staffName]++;
    }
  }

  return { stats: stats, month: monthStr };
}

// --- チェック（完了記録） ---
function checkTask(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_LOG);
  if (!sheet) return { error: 'シート「' + SHEET_LOG + '」が見つかりません' };

  const now = new Date();
  const dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  const timeStr = Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm');

  sheet.appendRow([dateStr, data.taskNo, data.taskName, data.staff, timeStr]);

  return { success: true, date: dateStr, time: timeStr };
}

// --- チェック解除 ---
function uncheckTask(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_LOG);
  if (!sheet) return { error: 'シート「' + SHEET_LOG + '」が見つかりません' };

  const now = new Date();
  const dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  const allData = sheet.getDataRange().getValues();

  // 該当行を探して削除（最新のものから）
  for (let i = allData.length - 1; i >= 1; i--) {
    const rowDate = Utilities.formatDate(new Date(allData[i][0]), 'Asia/Tokyo', 'yyyy-MM-dd');
    if (rowDate === dateStr && allData[i][1] == data.taskNo) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: '該当するチェックが見つかりません' };
}

// --- タスク追加 ---
function addTask(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TASKS);
  if (!sheet) return { error: 'シート「' + SHEET_TASKS + '」が見つかりません' };

  const lastRow = sheet.getLastRow();
  const newNo = lastRow; // 次の番号

  sheet.appendRow([newNo, data.name, data.timeSlot || '', data.dayLimit || '', data.memo || '']);

  return { success: true, no: newNo };
}

// --- タスク削除 ---
function deleteTask(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TASKS);
  if (!sheet) return { error: 'シート「' + SHEET_TASKS + '」が見つかりません' };

  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] == data.taskNo) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: '該当するタスクが見つかりません' };
}

// --- タスク並べ替え ---
function reorderTasks(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TASKS);
  if (!sheet) return { error: 'シート「' + SHEET_TASKS + '」が見つかりません' };

  const newOrder = data.order; // [{no, name, timeSlot, dayLimit, memo}, ...]
  const lastRow = sheet.getLastRow();

  // ヘッダー以外をクリア
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 5).clearContent();
  }

  // 新しい順序で書き込み
  for (let i = 0; i < newOrder.length; i++) {
    const row = i + 2;
    const t = newOrder[i];
    sheet.getRange(row, 1, 1, 5).setValues([[i + 1, t.name, t.timeSlot, t.dayLimit, t.memo]]);
  }

  return { success: true };
}

// --- 初期セットアップ（1回だけ実行） ---
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // タスク一覧シート
  let taskSheet = ss.getSheetByName(SHEET_TASKS);
  if (!taskSheet) {
    taskSheet = ss.insertSheet(SHEET_TASKS);
  }
  taskSheet.getRange(1, 1, 1, 5).setValues([['No', 'タスク名', '時間帯', '曜日制限', 'メモ']]);

  // 初期タスクデータ
  const tasks = [
    [1, 'BGMを流す', '朝（1から順番に行う）', '', ''],
    [2, 'ドリンク準備', '朝（1から順番に行う）', '', ''],
    [3, '麦茶のパック取り', '朝（1から順番に行う）', '', ''],
    [4, 'ゴミ捨て', '朝（1から順番に行う）', '', ''],
    [5, 'ロボット掃除機スタート', '朝（1から順番に行う）', '', ''],
    [6, '花瓶の水交換', '朝（1から順番に行う）', '', ''],
    [7, '荷物入れ掃除（ほこり取り）', '朝（1から順番に行う）', '', ''],
    [8, '加湿器水補充', '朝（1から順番に行う）', '', ''],
    [9, '干渉波スポンジセット', '朝（1から順番に行う）', '', ''],
    [10, 'テレビセット', '朝（1から順番に行う）', '', ''],
    [11, '外の清掃（特に玄関周り）', '朝（1から順番に行う）', '', ''],
    [12, '花の水やり（外）・歩行器準備', '朝（1から順番に行う）', '', ''],
    [13, '花の水やり（室内）', '朝（1から順番に行う）', '月・水・金', ''],
    [14, '誕生日確認', '朝（1から順番に行う）', '', ''],
    [15, '測定者確認', '朝（1から順番に行う）', '', ''],
    [16, '番号札セット', '朝（1から順番に行う）', '', ''],
    [17, '今月のトレーニングの記入用紙セット', '朝（1から順番に行う）', '', ''],
    [18, 'ファイリング', '午前利用中（前半）', '', ''],
    [19, 'トイレチェック', '前半終了後', '', ''],
    [20, 'マシン拭き', '前半終了後', '', ''],
    [21, 'トイレチェック', '午前利用中（後半）', '', ''],
    [22, 'PM誕生日確認', '午前利用中（後半）', '', ''],
    [23, 'PM測定者確認', '午前利用中（後半）', '', ''],
    [24, 'タオルたたみ（乾燥機フィルターチェック）', '午前利用中（後半）', '', ''],
    [25, 'インスタ更新', '午前利用中（後半）', '', ''],
    [26, 'トイレチェック', '午前終了後', '', ''],
    [27, 'テーブル拭き', '午前終了後', '', ''],
    [28, '椅子拭き＆椅子並べ', '午前終了後', '', ''],
    [29, 'PMの利用者名札準備', '午後準備', '', ''],
    [30, '午後のドリンク準備', '午後準備', '', ''],
    [31, 'PM番号札セット', '午後準備', '', ''],
    [32, 'トイレ掃除', '午後準備', '', '']
  ];

  if (taskSheet.getLastRow() <= 1) {
    taskSheet.getRange(2, 1, tasks.length, 5).setValues(tasks);
  }

  // チェックログシート
  let logSheet = ss.getSheetByName(SHEET_LOG);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_LOG);
  }
  logSheet.getRange(1, 1, 1, 5).setValues([['日付', 'タスクNo', 'タスク名', '完了者', '完了時間']]);

  // スタッフシート
  let staffSheet = ss.getSheetByName(SHEET_STAFF);
  if (!staffSheet) {
    staffSheet = ss.insertSheet(SHEET_STAFF);
  }
  staffSheet.getRange(1, 1, 1, 1).setValues([['名前']]);

  // スタッフ初期データ
  const staff = [
    ['代表'], ['勝又'], ['星野'], ['下浦'], ['工藤'], ['髙山'], ['春山'], ['大久保'], ['小野'], ['林']
  ];

  if (staffSheet.getLastRow() <= 1) {
    staffSheet.getRange(2, 1, staff.length, 1).setValues(staff);
  }

  // 不要なシートを削除（Sheet1等）
  const sheets = ss.getSheets();
  sheets.forEach(function(s) {
    if (s.getName() !== SHEET_TASKS && s.getName() !== SHEET_LOG && s.getName() !== SHEET_STAFF) {
      try { ss.deleteSheet(s); } catch(e) {}
    }
  });

  SpreadsheetApp.getUi().alert('セットアップ完了！\n\n・タスク一覧: ' + tasks.length + '件\n・スタッフ: ' + staff.length + '名\n・チェックログ: 準備OK');
}
