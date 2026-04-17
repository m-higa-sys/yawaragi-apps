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

  // ケアマネ連絡先シート（送付方法・FAX番号を追加: 2026/4/11）
  if (!ss.getSheetByName('ケアマネ連絡先')) {
    var s = ss.insertSheet('ケアマネ連絡先');
    s.getRange(1, 1, 1, 5).setValues([[
      'ケアマネ事業所', 'ケアマネ名', 'メールアドレス', 'FAX番号', '送付方法'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 5).setBackground('#8e44ad').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 200);
    s.setColumnWidth(2, 120);
    s.setColumnWidth(3, 250);
    s.setColumnWidth(4, 140);
    s.setColumnWidth(5, 100);
  }

  // 中止履歴シート（2026/4/10追加、2026/4/10更新=14列）
  if (!ss.getSheetByName('中止履歴')) {
    var s = ss.insertSheet('中止履歴');
    s.getRange(1, 1, 1, 14).setValues([[
      '最終利用日', '中止日', '連絡日', '利用者名', '理由', '補足', '受付者',
      '登録日時', '変更前ステータス',
      'リハブ:通所計画書', 'リハブ:個別機能訓練', 'リハブ:口腔機能向上',
      'リハブ:科学的介護推進', 'リハブ:ADL維持等'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 14).setBackground('#c0392b').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 110);  // 最終利用日
    s.setColumnWidth(2, 110);  // 中止日
    s.setColumnWidth(3, 110);  // 連絡日
    s.setColumnWidth(4, 100);  // 利用者名
    s.setColumnWidth(5, 130);  // 理由
    s.setColumnWidth(6, 200);  // 補足
    s.setColumnWidth(7, 90);   // 受付者
    s.setColumnWidth(8, 140);  // 登録日時
    s.setColumnWidth(9, 110);  // 変更前ステータス
    s.setColumnWidth(10, 130); // リハブ:通所計画書
    s.setColumnWidth(11, 130); // リハブ:個別機能訓練
    s.setColumnWidth(12, 130); // リハブ:口腔機能向上
    s.setColumnWidth(13, 130); // リハブ:科学的介護推進
    s.setColumnWidth(14, 130); // リハブ:ADL維持等
  }

  // タスクボードシート（2026/4/11追加）
  if (!ss.getSheetByName('タスクボード')) {
    var s = ss.insertSheet('タスクボード');
    s.getRange(1, 1, 1, 10).setValues([[
      'ID', '日付', 'スタッフ', 'タスク名', '優先度', '目安(分)',
      '登録者', '登録日時', 'ステータス', '完了日時'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 10).setBackground('#2d3748').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 140);   // ID
    s.setColumnWidth(2, 110);   // 日付
    s.setColumnWidth(3, 100);   // スタッフ
    s.setColumnWidth(4, 250);   // タスク名
    s.setColumnWidth(5, 80);    // 優先度
    s.setColumnWidth(6, 80);    // 目安(分)
    s.setColumnWidth(7, 100);   // 登録者
    s.setColumnWidth(8, 160);   // 登録日時
    s.setColumnWidth(9, 80);    // ステータス
    s.setColumnWidth(10, 160);  // 完了日時
  }

  // 送信記録シート（2026/4/11追加）
  if (!ss.getSheetByName('送信記録')) {
    var s = ss.insertSheet('送信記録');
    s.getRange(1, 1, 1, 8).setValues([[
      '送信年月', '居宅事業所名', 'ケアマネ名', 'メールアドレス',
      '添付ファイル数', '送信方法', '送信日時', 'ステータス'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 8).setBackground('#1a5276').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 100);
    s.setColumnWidth(2, 180);
    s.setColumnWidth(3, 100);
    s.setColumnWidth(4, 220);
    s.setColumnWidth(5, 100);
    s.setColumnWidth(6, 80);
    s.setColumnWidth(7, 160);
    s.setColumnWidth(8, 80);
  }

  Logger.log('セットアップ完了！出欠変更・伝達事項・ケアマネ連絡先・中止履歴・タスクボード・送信記録の6シートを作成しました。');
}

// ===== Web API: GET（JSONP対応）=====
function doGet(e) {
  // 振り分け: ?mode=summary は 利用者台帳の集計エンドポイント（コード.gs の handleSummary）へ
  if (e && e.parameter && e.parameter.mode === 'summary') {
    return handleSummary(e);
  }

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
      var monthStr = e && e.parameter ? e.parameter.month : null;
      result.absences = getUpcomingAbsences(ss, today, monthStr);
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
    if (action === 'terminations') {
      var period = e && e.parameter ? e.parameter.period : 'all';
      result.terminations = getTerminations(ss, period);
    }
    if (action === 'board_tasks') {
      var taskDate = dateStr || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
      result.boardTasks = getBoardTasks(ss, taskDate);
    }
    if (action === 'folder_status') {
      var ym = e && e.parameter ? e.parameter.yearMonth : null;
      if (!ym) ym = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
      result = getJissekiFolderStatus(ym);
    }
    if (action === 'send_history') {
      var ym = e && e.parameter ? e.parameter.yearMonth : null;
      result.sendHistory = getSendHistory(ss, ym);
    }
    if (action === 'haichi') {
      var haichiSheet = ss.getSheetByName('配置データ');
      if (haichiSheet) {
        var val = haichiSheet.getRange('A1').getValue();
        result.haichi = val ? JSON.parse(val) : {};
      } else {
        result.haichi = {};
      }
      return respond(result, callback);
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
      case 'terminate':
        return jsonResp(registerTermination(ss, data));
      case 'cancel_terminate':
        return jsonResp(cancelTermination(ss, data));
      case 'update_terminate_task':
        return jsonResp(updateTerminateTask(ss, data));
      case 'add_board_task':
        return jsonResp(addBoardTask(ss, data));
      case 'complete_board_task':
        return jsonResp(completeBoardTask(ss, data));
      case 'delete_board_task':
        return jsonResp(deleteBoardTask(ss, data));
      case 'create_drafts':
        return jsonResp(createJissekiDrafts(data.yearMonth));
      case 'save_haichi':
        var hSheet = ss.getSheetByName('配置データ');
        if (!hSheet) hSheet = ss.insertSheet('配置データ');
        hSheet.getRange('A1').setValue(JSON.stringify(data.haichi || {}));
        return jsonResp({ success: true });
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

    // 午前/午後判定（曜日を渡して複合パターン対応）
    var parsed = parseAmPm(ampmVal, dow);

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

// 午前/午後の判定（dow: 当日の曜日「月」「火」等。複合パターン対応）
function parseAmPm(val, dow) {
  val = val.replace(/\s/g, '');
  if (!val) return { am: true, pm: true };

  // 複合パターン判定:「月午前、木午後」「月午前,木午後」のようにカンマ区切り＋曜日が含まれる
  if (val.indexOf('、') >= 0 || val.indexOf(',') >= 0) {
    var parts = val.split(/[、,]/);
    var hasDay = parts.some(function(p) { return /[月火水木金土日]/.test(p.trim()); });
    if (hasDay && dow) {
      var am = false, pm = false;
      parts.forEach(function(p) {
        p = p.trim();
        if (p.indexOf(dow) >= 0) {
          if (p.indexOf('午後') >= 0) pm = true;
          else if (p.indexOf('午前') >= 0) am = true;
          else { am = true; pm = true; }
        }
      });
      if (am || pm) return { am: am, pm: pm };
      // この曜日に該当するパートが無い場合はデフォルト
      return { am: true, pm: true };
    }
  }

  if (val === '両方' || val === '午前午後') return { am: true, pm: true };
  if (val.indexOf('午前') >= 0 && val.indexOf('午後') >= 0) return { am: true, pm: true };
  if ((val.indexOf('1') >= 0 && val.indexOf('2') >= 0) && val.length <= 4) return { am: true, pm: true };
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
    // 複合パターン（「月午前、木午後」等）はそのまま保持
    patterns[name] = { days: days, unit: ampm || '午前午後', kana: kana, care: care };
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

// 欠席予定を取得
// monthStr (yyyy-MM) を指定すればその月の全欠席、未指定なら今日以降30日分
// 長期休み中の人は常に含む
function getUpcomingAbsences(ss, todayStr, monthStr) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var startStr, endStr;
  if (monthStr) {
    // 月指定：その月の1日〜月末
    var mParts = monthStr.split('-');
    var y = parseInt(mParts[0]);
    var m = parseInt(mParts[1]);
    startStr = Utilities.formatDate(new Date(y, m - 1, 1), 'Asia/Tokyo', 'yyyy-MM-dd');
    endStr = Utilities.formatDate(new Date(y, m, 0), 'Asia/Tokyo', 'yyyy-MM-dd');
  } else {
    // 未指定：今日〜30日後
    startStr = todayStr;
    var parts = todayStr.split('-');
    var endDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]) + 30);
    endStr = Utilities.formatDate(endDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  }

  var data = sheet.getDataRange().getValues();
  var list = [];
  var longTermList = [];
  for (var i = 1; i < data.length; i++) {
    var d = fmtDate(data[i][0]);
    var type = String(data[i][3] || '').trim();

    // 通常欠席
    if (type === '欠席' && d >= startStr && d <= endStr) {
      // 受付日: I列(data[i][8])を優先、無ければG列の登録日時(data[i][6])から日付部分を取得
      var contactDate = '';
      if (data[i][8]) {
        contactDate = fmtDate(data[i][8]);
      } else if (data[i][6]) {
        // G列はDate型 or 'yyyy-MM-dd HH:mm'形式の文字列
        if (data[i][6] instanceof Date) {
          contactDate = Utilities.formatDate(data[i][6], 'Asia/Tokyo', 'yyyy-MM-dd');
        } else {
          contactDate = String(data[i][6]).substring(0, 10);
        }
      }
      list.push({
        date: d,
        name: String(data[i][1] || '').trim(),
        unit: String(data[i][2] || '').trim(),
        reason: String(data[i][4] || '').trim(),
        reporter: String(data[i][5] || '').trim(),
        contactDate: contactDate,
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

  // スプレッドシートに記録（I列 = 受付日 contactDate）
  for (var i = 0; i < dates.length; i++) {
    sheet.appendRow([
      dates[i],
      data.name,
      unit,
      '欠席',
      data.reason || '',
      data.reporter || '',
      now,
      cmNotified,
      data.contactDate || ''
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
var LINE_TOKEN = 'uwL+AkshOnTUGkFn+vx7QejtZK7LRYkNmMw19nlM1Iyr84d2SFiHe/vgg0MXSc3U9UmvDl7kaQPGx6Cyv+JzDmag9E0WupZQNpEVoAqFqBhCHUMXVb+CBT2bBSnMyseaHONSMh7ieuWZFrHvDu147gdB04t89/1O/w1cDnyilFU=';
var OWNER_USER_ID = 'Ue54376b8f1aa48fd139962c33b54affe';

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

// ============================================================
// ===== 中止管理（2026/4/10追加）=====
// ============================================================

// 中止登録
function registerTermination(ss, data) {
  var sheet = ss.getSheetByName('中止履歴');
  if (!sheet) return { error: '中止履歴シートがありません。setupSheets()を実行してください。', success: false };
  if (!data.name) return { error: '利用者名が必要です', success: false };
  if (!data.reason) return { error: '中止理由が必要です', success: false };
  if (!data.lastUseDate) return { error: '最終利用日が必要です', success: false };

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var lastUseDate = data.lastUseDate;
  var terminateDate = addOneDay(lastUseDate);  // 中止日＝最終利用日の翌日
  var contactDate = data.contactDate || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  // 利用者台帳のステータス列を「中止」に書き換え（変更前ステータスを保存）
  var prevStatus = updateUserStatus(ss, data.name, '中止');
  if (prevStatus === null) {
    return { error: '利用者台帳に「' + data.name + '」が見つかりません', success: false };
  }

  // 長期休み中だったら自動終了させる（中止日を再開日として記録）
  var longTermEnded = endLongTermAbsenceForUser(ss, data.name, terminateDate);

  // 中止履歴シートに記録（14列）
  sheet.appendRow([
    lastUseDate,        // A: 最終利用日
    terminateDate,      // B: 中止日（自動計算）
    contactDate,        // C: 連絡日
    data.name,          // D: 利用者名
    data.reason,        // E: 理由
    data.supplement || '', // F: 補足
    data.reporter || '',   // G: 受付者
    now,                // H: 登録日時
    prevStatus,         // I: 変更前ステータス
    '', '', '', '', ''  // J-N: リハブ作業5項目（空＝未完了）
  ]);

  // 社長にLINE+Gmail通知
  try {
    var msg = '【利用中止】\n';
    msg += data.name + '様\n';
    msg += '最終利用日: ' + fmtDateJP(lastUseDate) + '\n';
    msg += '中止日: ' + fmtDateJP(terminateDate) + '\n';
    msg += '連絡日: ' + fmtDateJP(contactDate) + '\n';
    msg += '理由: ' + data.reason + '\n';
    if (data.supplement) msg += '補足: ' + data.supplement + '\n';
    msg += '受付者: ' + (data.reporter || '未記入');
    if (longTermEnded) msg += '\n※長期休みも自動終了';
    sendLine(msg);
  } catch (e) {}

  return {
    success: true,
    message: data.name + '様の利用中止を登録しました',
    prevStatus: prevStatus,
    terminateDate: terminateDate,
    longTermEnded: longTermEnded
  };
}

// 中止登録時に呼ぶ: その利用者が長期休み中なら自動終了させる
// 「出欠変更」シートで type='長期休み' かつ 終了日(8列目)が空 の最新行を探して終了日をセット
function endLongTermAbsenceForUser(ss, userName, endDateStr) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return false;
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    var name = String(data[i][1] || '').trim();
    var type = String(data[i][3] || '').trim();
    var endCol = data[i][7] ? String(data[i][7]).trim() : '';
    if (name === userName && type === '長期休み' && !endCol) {
      sheet.getRange(i + 1, 8).setValue(endDateStr);
      return true;
    }
  }
  return false;
}

// 日付文字列(yyyy-MM-dd)に1日加算
function addOneDay(dateStr) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]) + 1);
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

// 中止取消（履歴行を削除＋ステータスを元に戻す）
// 検索キー: 最終利用日 + 利用者名
function cancelTermination(ss, data) {
  var sheet = ss.getSheetByName('中止履歴');
  if (!sheet) return { error: '中止履歴シートがありません', success: false };
  if (!data.lastUseDate || !data.name) {
    return { error: '最終利用日と利用者名が必要です', success: false };
  }

  var allData = sheet.getDataRange().getValues();
  var deleted = 0;
  var restoreStatus = '利用中';  // デフォルト復元値

  // 後ろから検索して削除（行番号ずれ防止）
  for (var i = allData.length - 1; i >= 1; i--) {
    var lastUse = fmtDate(allData[i][0]);
    var name = String(allData[i][3] || '').trim();
    if (lastUse === data.lastUseDate && name === data.name) {
      // 変更前ステータスを取得（あれば復元用に使う）
      var prev = String(allData[i][8] || '').trim();
      if (prev) restoreStatus = prev;
      sheet.deleteRow(i + 1);
      deleted++;
      break;  // 1件だけ削除
    }
  }

  if (deleted === 0) {
    return { error: '該当する中止履歴が見つかりません', success: false };
  }

  // 利用者台帳のステータスを元に戻す
  updateUserStatus(ss, data.name, restoreStatus);

  // 社長に通知
  try {
    var msg = '【中止取消】\n';
    msg += data.name + '様\n';
    msg += '最終利用日: ' + fmtDateJP(data.lastUseDate) + '\n';
    msg += 'ステータスを「' + restoreStatus + '」に戻しました';
    sendLine(msg);
  } catch (e) {}

  return { success: true, message: data.name + '様の中止を取消しました', restoreStatus: restoreStatus };
}

// リハブクラウド作業チェックリストの更新
// 検索キー: 最終利用日 + 利用者名
function updateTerminateTask(ss, data) {
  var sheet = ss.getSheetByName('中止履歴');
  if (!sheet) return { error: '中止履歴シートがありません', success: false };
  if (!data.lastUseDate || !data.name || !data.task) {
    return { error: '最終利用日・利用者名・タスク名が必要です', success: false };
  }

  // タスク名 → 列番号マッピング（14列構造）
  var taskColMap = {
    'tsusho': 10,      // J列: リハブ:通所計画書
    'kotraining': 11,  // K列: リハブ:個別機能訓練
    'koukou': 12,      // L列: リハブ:口腔機能向上
    'kagakuteki': 13,  // M列: リハブ:科学的介護推進
    'adl': 14          // N列: リハブ:ADL維持等
  };
  var col = taskColMap[data.task];
  if (!col) return { error: '不明なタスク名: ' + data.task, success: false };

  var allData = sheet.getDataRange().getValues();
  for (var i = allData.length - 1; i >= 1; i--) {
    var lastUse = fmtDate(allData[i][0]);
    var name = String(allData[i][3] || '').trim();
    if (lastUse === data.lastUseDate && name === data.name) {
      var newValue = '';
      if (data.checked) {
        newValue = '完了 ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
      }
      sheet.getRange(i + 1, col).setValue(newValue);
      return { success: true, value: newValue };
    }
  }

  return { error: '該当する中止履歴が見つかりません', success: false };
}

// 中止履歴一覧を取得（period: '1m' / '3m' / 'all'）
// 14列構造: 最終利用日/中止日/連絡日/利用者名/理由/補足/受付者/登録日時/変更前/リハブ5項目
// フィルタは連絡日ベース（長期休みから中止になるパターンが多いため、連絡日が業務的に意味がある）
function getTerminations(ss, period) {
  var sheet = ss.getSheetByName('中止履歴');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];

  // フィルタ用の閾値日付（連絡日ベース）
  var thresholdStr = '';
  if (period === '1m' || period === '3m') {
    var months = period === '1m' ? 1 : 3;
    var d = new Date();
    d.setMonth(d.getMonth() - months);
    thresholdStr = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
  }

  for (var i = 1; i < data.length; i++) {
    var lastUseDate = fmtDate(data[i][0]);
    var terminateDate = fmtDate(data[i][1]);
    var contactDate = fmtDate(data[i][2]);
    if (!lastUseDate) continue;
    if (thresholdStr && contactDate && contactDate < thresholdStr) continue;

    list.push({
      lastUseDate: lastUseDate,
      terminateDate: terminateDate,
      contactDate: contactDate,
      name: String(data[i][3] || '').trim(),
      reason: String(data[i][4] || '').trim(),
      supplement: String(data[i][5] || '').trim(),
      reporter: String(data[i][6] || '').trim(),
      timestamp: String(data[i][7] || ''),
      prevStatus: String(data[i][8] || '').trim(),
      tasks: {
        tsusho: !!String(data[i][9] || '').trim(),
        kotraining: !!String(data[i][10] || '').trim(),
        koukou: !!String(data[i][11] || '').trim(),
        kagakuteki: !!String(data[i][12] || '').trim(),
        adl: !!String(data[i][13] || '').trim()
      }
    });
  }

  // 中止日新しい順
  list.sort(function (a, b) { return b.terminateDate.localeCompare(a.terminateDate); });
  return list;
}

// 利用者台帳のステータス列を更新（変更前の値を返す。利用者が見つからない時はnullを返す）
function updateUserStatus(ss, userName, newStatus) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;

  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  // 「利用ステータス」を優先、次に「ステータス」、次に「利用状況」
  var statusCol = findCol(h, ['利用ステータス']);
  if (statusCol < 0) statusCol = findColP(h, 'ステータス');
  if (statusCol < 0) statusCol = findColP(h, '利用状況');

  if (nameCol < 0 || statusCol < 0) return null;

  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    if (name === userName) {
      var prev = String(data[i][statusCol] || '').trim();
      sheet.getRange(i + 1, statusCol + 1).setValue(newStatus);
      return prev;
    }
  }
  return null;
}

// ============================================================
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

// ===== タスクボード機能（2026/4/11追加）=====

// タスク取得（指定日）
function getBoardTasks(ss, dateStr) {
  var sheet = ss.getSheetByName('タスクボード');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var d = fmtDate(data[i][1]);
    if (d !== dateStr) continue;
    list.push({
      id: String(data[i][0] || ''),
      date: d,
      staff: String(data[i][2] || '').trim(),
      name: String(data[i][3] || '').trim(),
      priority: String(data[i][4] || 'normal').trim(),
      estimatedMin: data[i][5] ? parseInt(data[i][5]) : null,
      source: String(data[i][6] || '').trim(),
      registeredAt: String(data[i][7] || ''),
      status: String(data[i][8] || '未完了').trim(),
      completedAt: String(data[i][9] || ''),
      row: i + 1
    });
  }
  return list;
}

// タスク登録
function addBoardTask(ss, data) {
  var sheet = ss.getSheetByName('タスクボード');
  if (!sheet) {
    // シートがなければ自動作成
    sheet = ss.insertSheet('タスクボード');
    sheet.getRange(1, 1, 1, 10).setValues([[
      'ID', '日付', 'スタッフ', 'タスク名', '優先度', '目安(分)',
      '登録者', '登録日時', 'ステータス', '完了日時'
    ]]);
    sheet.setFrozenRows(1);
  }

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var today = data.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var id = 'tb_' + new Date().getTime();

  sheet.appendRow([
    id,
    today,
    data.staff || '',
    data.name || '',
    data.priority || 'normal',
    data.estimatedMin || '',
    data.source || 'クロコ',
    now,
    '未完了',
    ''
  ]);

  return {
    success: true,
    message: 'タスクを登録しました: ' + (data.name || ''),
    id: id
  };
}

// タスク完了
function completeBoardTask(ss, data) {
  var sheet = ss.getSheetByName('タスクボード');
  if (!sheet) return { error: 'タスクボードシートがありません', success: false };

  var allData = sheet.getDataRange().getValues();
  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][0]) === String(data.id)) {
      var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
      sheet.getRange(i + 1, 9).setValue('完了');
      sheet.getRange(i + 1, 10).setValue(now);
      return { success: true, message: 'タスクを完了にしました' };
    }
  }
  return { error: '指定されたタスクが見つかりません', success: false };
}

// タスク削除
function deleteBoardTask(ss, data) {
  var sheet = ss.getSheetByName('タスクボード');
  if (!sheet) return { error: 'タスクボードシートがありません', success: false };

  var allData = sheet.getDataRange().getValues();
  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][0]) === String(data.id)) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'タスクを削除しました' };
    }
  }
  return { error: '指定されたタスクが見つかりません', success: false };
}

// ================================================================
// ========== 実績送付メール自動化 ==========
// ================================================================

// yawaragi-apps/実績送付 フォルダを取得（なければ作成）
function getJissekiBaseFolder() {
  var folders = DriveApp.getFoldersByName('yawaragi-apps');
  while (folders.hasNext()) {
    var f = folders.next();
    var subs = f.getFoldersByName('実績送付');
    if (subs.hasNext()) return subs.next();
  }
  // 見つからなければ最初のyawaragi-apps配下に作成
  folders = DriveApp.getFoldersByName('yawaragi-apps');
  if (folders.hasNext()) {
    return folders.next().createFolder('実績送付');
  }
  throw new Error('yawaragi-appsフォルダが見つかりません');
}

// ケアマネ連絡先をマップで取得（居宅事業所名→{name, email, fax, method}）
function getCmContactsForEmail(ss) {
  var sheet = ss.getSheetByName('ケアマネ連絡先');
  if (!sheet || sheet.getLastRow() < 2) return {};

  var data = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var office = String(data[i][0] || '').trim();
    var name = String(data[i][1] || '').trim();
    var email = String(data[i][2] || '').trim();
    var fax = String(data[i][3] || '').trim().replace(/[-ー－\s]/g, '');
    var method = String(data[i][4] || '').trim();
    // 送付方法が空の場合: メールあり→メール、FAXあり→FAX、どちらもなし→未設定
    if (!method) {
      if (email) method = 'メール';
      else if (fax) method = 'FAX';
    }
    if (office) {
      map[office] = { name: name, email: email, fax: fax, method: method };
    }
  }
  return map;
}

// フォルダ内の居宅一覧・状態を取得（プレビュー用）
function getJissekiFolderStatus(yearMonth) {
  try {
    var base = getJissekiBaseFolder();
    var folders = base.getFoldersByName(yearMonth);
    if (!folders.hasNext()) {
      return { success: true, yearMonth: yearMonth, folders: [], message: yearMonth + 'フォルダがまだありません' };
    }
    var monthFolder = folders.next();

    var ss = SpreadsheetApp.openById(SS_ID);
    var cmMap = getCmContactsForEmail(ss);

    var subFolders = monthFolder.getFolders();
    var list = [];
    while (subFolders.hasNext()) {
      var f = subFolders.next();
      var name = f.getName();
      var files = f.getFiles();
      var pdfCount = 0;
      var fileNames = [];
      while (files.hasNext()) {
        var file = files.next();
        if (file.getMimeType() === 'application/pdf') {
          pdfCount++;
          fileNames.push(file.getName());
        }
      }
      var contact = cmMap[name];
      var method = contact ? (contact.method || '') : '';
      list.push({
        kyotaku: name,
        pdfCount: pdfCount,
        fileNames: fileNames,
        hasEmail: !!(contact && contact.email),
        hasFax: !!(contact && contact.fax),
        method: method,
        email: contact ? contact.email : '',
        fax: contact ? contact.fax : '',
        cmName: contact ? contact.name : ''
      });
    }

    return { success: true, yearMonth: yearMonth, folders: list };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 秒速FAX送信用メールアドレス（管理画面で確認して設定）
var BYOSOKU_FAX_EMAIL = 'fax216747@ecofax.jp';

// 下書き作成＋FAX送信メイン処理
function createJissekiDrafts(yearMonth) {
  if (!yearMonth) {
    return { success: false, error: '年月(yearMonth)を指定してください（例: 2026-04）' };
  }

  var base;
  try {
    base = getJissekiBaseFolder();
  } catch (e) {
    return { success: false, error: e.message };
  }

  var folders = base.getFoldersByName(yearMonth);
  if (!folders.hasNext()) {
    return { success: false, error: yearMonth + 'フォルダが見つかりません。先にフォルダを作成してPDFを置いてください。' };
  }
  var monthFolder = folders.next();

  var ss = SpreadsheetApp.openById(SS_ID);
  var cmMap = getCmContactsForEmail(ss);

  // 持参リスト
  var JISAN_LIST = ['ふくしのまち東松山', 'わかばの丘包括', 'わかばの丘居宅'];

  // 送信記録シートを準備
  var recordSheet = ss.getSheetByName('送信記録');
  if (!recordSheet) {
    recordSheet = ss.insertSheet('送信記録');
    recordSheet.getRange(1, 1, 1, 8).setValues([[
      '送信年月', '居宅事業所名', 'ケアマネ名', '宛先',
      '添付ファイル数', '送信方法', '送信日時', 'ステータス'
    ]]);
    recordSheet.setFrozenRows(1);
  }

  // 居宅サブフォルダを巡回
  var subFolders = monthFolder.getFolders();
  var results = [];
  var emailCount = 0;
  var faxCount = 0;
  var errorCount = 0;
  var skipCount = 0;

  // 年月表示用（2026-04 → 2026年04月）
  var parts = yearMonth.split('-');
  var monthLabel = parts[0] + '年' + parts[1] + '月';

  while (subFolders.hasNext()) {
    var kyotakuFolder = subFolders.next();
    var kyotakuName = kyotakuFolder.getName();

    // 持参の居宅はスキップ
    var isJisan = false;
    for (var j = 0; j < JISAN_LIST.length; j++) {
      if (kyotakuName.indexOf(JISAN_LIST[j]) >= 0) { isJisan = true; break; }
    }
    if (isJisan) {
      results.push({ kyotaku: kyotakuName, status: 'スキップ', reason: '持参対象', method: '持参' });
      skipCount++;
      continue;
    }

    // ケアマネ連絡先から検索
    var contact = cmMap[kyotakuName];
    var method = contact ? contact.method : '';

    if (!contact || (!contact.email && !contact.fax)) {
      results.push({ kyotaku: kyotakuName, status: 'スキップ', reason: '連絡先が未登録', method: '' });
      skipCount++;
      continue;
    }

    // フォルダ内のPDFを取得
    var files = kyotakuFolder.getFiles();
    var attachments = [];
    var fileNames = [];
    while (files.hasNext()) {
      var file = files.next();
      if (file.getMimeType() === 'application/pdf') {
        attachments.push(file.getBlob());
        fileNames.push(file.getName());
      }
    }

    if (attachments.length === 0) {
      results.push({ kyotaku: kyotakuName, status: 'スキップ', reason: 'PDFファイルがありません', method: method });
      skipCount++;
      continue;
    }

    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');

    // === メール送信（Gmail下書き）===
    if (method === 'メール' && contact.email) {
      var body = kyotakuName + '\n'
        + contact.name + '様\n\n'
        + 'いつもお世話になっております。\n'
        + 'リハビリデイサービスyawaragiの勝又です。\n\n'
        + monthLabel + '分の提供票等をお送りいたします。\n\n'
        + '【添付書類】\n';
      for (var k = 0; k < fileNames.length; k++) {
        body += '・' + fileNames[k] + '\n';
      }
      body += '\nご確認のほど、よろしくお願いいたします。\n'
        + 'ご不明な点がございましたら、お気軽にご連絡ください。\n\n'
        + '━━━━━━━━━━━━━━━━━━\n'
        + 'リハビリデイサービス yawaragi\n'
        + '担当: 勝又裕子\n'
        + 'TEL/FAX: 0493-81-5125\n'
        + '━━━━━━━━━━━━━━━━━━';

      var subject = '【yawaragi】' + monthLabel + '分 提供票等のご送付（' + attachments.length + '件）';

      try {
        GmailApp.createDraft(contact.email, subject, body, {
          attachments: attachments,
          name: 'リハビリデイサービス yawaragi'
        });
        recordSheet.appendRow([yearMonth, kyotakuName, contact.name, contact.email, attachments.length, 'メール下書き', now, '成功']);
        results.push({ kyotaku: kyotakuName, cmName: contact.name, dest: contact.email, fileCount: attachments.length, status: '成功', method: 'メール' });
        emailCount++;
      } catch (e) {
        results.push({ kyotaku: kyotakuName, status: 'エラー', reason: e.message, method: 'メール' });
        errorCount++;
      }

    // === FAX送信（秒速FAX経由メール）===
    } else if (method === 'FAX' && contact.fax) {
      if (!BYOSOKU_FAX_EMAIL) {
        results.push({ kyotaku: kyotakuName, status: 'エラー', reason: '秒速FAX送信アドレスが未設定です', method: 'FAX' });
        errorCount++;
        continue;
      }

      try {
        // 秒速FAX: 件名にFAX番号、添付にPDF
        var faxTo = BYOSOKU_FAX_EMAIL;
        var faxSubject = contact.fax; // FAX番号（ハイフンなし）
        var faxBody = ''; // 本文は空（PDFのみ送信）
        GmailApp.sendEmail(faxTo, faxSubject, faxBody, {
          attachments: attachments,
          name: 'yawaragi FAX',
          from: 'r.d-yawaragi@keepfitlife.com'
        });
        recordSheet.appendRow([yearMonth, kyotakuName, contact.name, 'FAX:' + contact.fax, attachments.length, 'FAX', now, '成功']);
        results.push({ kyotaku: kyotakuName, cmName: contact.name, dest: 'FAX:' + contact.fax, fileCount: attachments.length, status: '成功', method: 'FAX' });
        faxCount++;
      } catch (e) {
        results.push({ kyotaku: kyotakuName, status: 'エラー', reason: e.message, method: 'FAX' });
        errorCount++;
      }

    // === 連絡先はあるが送付方法が不明 ===
    } else {
      var reason = 'メールアドレスもFAX番号も未登録';
      if (method === 'メール' && !contact.email) reason = 'メール指定だがメールアドレス未登録';
      if (method === 'FAX' && !contact.fax) reason = 'FAX指定だがFAX番号未登録';
      results.push({ kyotaku: kyotakuName, status: 'スキップ', reason: reason, method: method });
      skipCount++;
    }
  }

  return {
    success: true,
    yearMonth: yearMonth,
    summary: {
      total: emailCount + faxCount + errorCount + skipCount,
      email: emailCount,
      fax: faxCount,
      error: errorCount,
      skip: skipCount
    },
    details: results
  };
}

// 送信記録を取得
function getSendHistory(ss, yearMonth) {
  var sheet = ss.getSheetByName('送信記録');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var ym = String(data[i][0] || '').trim();
    if (yearMonth && ym !== yearMonth) continue;
    list.push({
      yearMonth: ym,
      kyotaku: String(data[i][1] || '').trim(),
      cmName: String(data[i][2] || '').trim(),
      email: String(data[i][3] || '').trim(),
      fileCount: data[i][4],
      method: String(data[i][5] || '').trim(),
      sentAt: String(data[i][6] || ''),
      status: String(data[i][7] || '').trim()
    });
  }
  return list;
}

// ===== ケアマネ連絡先の自動取り込み（利用者台帳から）=====
// 利用者台帳のケアマネ事業所名・メールアドレスから
// 重複なしでケアマネ連絡先シートに取り込む
function importCmContacts() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var srcSheet = ss.getSheetByName('利用者台帳');
  if (!srcSheet) return { success: false, error: '利用者台帳シートが見つかりません' };

  var dstSheet = ss.getSheetByName('ケアマネ連絡先');
  if (!dstSheet) return { success: false, error: 'ケアマネ連絡先シートが見つかりません' };

  // ヘッダー確認・追加
  var header = dstSheet.getRange(1, 1, 1, 5).getValues()[0];
  if (!header[0]) {
    dstSheet.getRange(1, 1, 1, 5).setValues([['ケアマネ事業所', 'ケアマネ名', 'メールアドレス', 'FAX番号', '送付方法']]);
    dstSheet.setFrozenRows(1);
    dstSheet.getRange(1, 1, 1, 5).setBackground('#8e44ad').setFontColor('#ffffff').setFontWeight('bold');
  }

  // 既存のケアマネ連絡先を取得（上書き防止）
  var existingMap = {};
  if (dstSheet.getLastRow() >= 2) {
    var existData = dstSheet.getRange(2, 1, dstSheet.getLastRow() - 1, 5).getValues();
    for (var i = 0; i < existData.length; i++) {
      var key = String(existData[i][0] || '').trim();
      if (key) {
        existingMap[key] = {
          row: i + 2,
          name: String(existData[i][1] || '').trim(),
          email: String(existData[i][2] || '').trim(),
          fax: String(existData[i][3] || '').trim(),
          method: String(existData[i][4] || '').trim()
        };
      }
    }
  }

  // 利用者台帳からケアマネ情報を取得
  var srcData = srcSheet.getDataRange().getValues();
  var headerRow = srcData[0];

  // ヘッダーからケアマネ関連列の位置を探す
  var colCmName = -1, colCmOffice = -1, colCmEmail = -1;
  for (var c = 0; c < headerRow.length; c++) {
    var h = String(headerRow[c]).trim();
    if (h === 'ケアマネ担当') colCmName = c;
    if (h === 'ケアマネ事業所名') colCmOffice = c;
    if (h === 'ケアマネメールアドレス') colCmEmail = c;
  }

  if (colCmOffice < 0) return { success: false, error: '利用者台帳に「ケアマネ事業所名」列が見つかりません' };

  // ユニークなケアマネ事業所を抽出
  var uniqueMap = {};
  for (var i = 1; i < srcData.length; i++) {
    var office = String(srcData[i][colCmOffice] || '').trim();
    if (!office) continue;
    if (uniqueMap[office]) continue;
    uniqueMap[office] = {
      name: colCmName >= 0 ? String(srcData[i][colCmName] || '').trim() : '',
      email: colCmEmail >= 0 ? String(srcData[i][colCmEmail] || '').trim() : ''
    };
  }

  // 新規追加
  var addCount = 0;
  var updateCount = 0;
  var offices = Object.keys(uniqueMap);

  for (var j = 0; j < offices.length; j++) {
    var officeName = offices[j];
    var info = uniqueMap[officeName];

    if (existingMap[officeName]) {
      // 既存: メールアドレスが空で台帳に入っていれば更新
      var ex = existingMap[officeName];
      if (!ex.email && info.email) {
        dstSheet.getRange(ex.row, 3).setValue(info.email);
        if (!ex.method) dstSheet.getRange(ex.row, 5).setValue('メール');
        updateCount++;
      }
    } else {
      // 新規追加
      var method = info.email ? 'メール' : '';
      dstSheet.appendRow([officeName, info.name, info.email, '', method]);
      addCount++;
    }
  }

  return {
    success: true,
    message: '取り込み完了',
    total: offices.length,
    added: addCount,
    updated: updateCount,
    existing: Object.keys(existingMap).length
  };
}

// テスト用: 2026-03で実績送付を実行（動作確認用）
function testCreateJissekiDrafts() {
  var result = createJissekiDrafts('2026-03');
  Logger.log(JSON.stringify(result, null, 2));
}
