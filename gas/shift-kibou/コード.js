// ============================================
// シフト希望入力 GAS（Google Apps Script）
// スプレッドシートに紐づけて使用
// PIN認証＋管理者モード対応
// ============================================

// ============================================
// 【疎通テスト】LINE送信の生死をエディタから確認する（2026-07-19 純追加）
//   関数プルダウンの最上部に出すため、名前を AAA_ で始めファイル先頭に置く。
//   引数なし・冪等・既存の通知ロジックには一切触れない。
//   送信先は社長（Script Properties の OWNER_USER_ID）。未設定なら送信しない。
//   ※スタッフへの誤送信を避けるため、LINE登録シートは参照しない。
// ============================================
function AAA_LINEテスト() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('LINE_TOKEN');
  Logger.log('LINE_TOKEN: ' + (token ? 'あり（' + String(token).length + '文字）' : '❌ なし'));
  if (!token) {
    Logger.log('→ 「プロジェクトの設定 → スクリプト プロパティ」で LINE_TOKEN を設定してください。');
    return;
  }

  // 送信先: 社長。未設定なら送信せずに終了する（スタッフに誤送信しない）。
  const toId = String(props.getProperty('OWNER_USER_ID') || '').trim();
  if (!toId) {
    Logger.log('❌ OWNER_USER_ID が未設定です。board GAS の同名プロパティの値をコピーして登録してください。');
    Logger.log('→ 誤送信を避けるため、送信せずに終了します。');
    return;
  }
  Logger.log('送信先: 社長（OWNER_USER_ID: ' + toId.length + '文字）');

  // 文面は固定。個人情報・業務内容は含めない。
  const text = '【テスト】シフト希望GAS 疎通確認 '
             + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  const res = UrlFetchApp.fetch(LINE_PUSH_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify({ to: toId, messages: [{ type: 'text', text: text }] }),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  Logger.log('HTTP ' + code);
  if (code === 200) {
    Logger.log('✅ 送信成功。社長のLINEに届いているか確認してください。');
  } else if (code === 401) {
    Logger.log('❌ 401＝トークン不正。Script Properties の LINE_TOKEN を新トークンに更新してください。');
    Logger.log(res.getContentText());
  } else {
    Logger.log('❌ 想定外の応答: ' + res.getContentText());
  }
}

const SHEET_WISHES = 'シフト希望';
const SHEET_STAFF_SHIFT = 'スタッフ';
const SHEET_SETTINGS = '設定';
const SHEET_LOG = '変更履歴';
const SHEET_JOUHO = '譲歩カウント';
const SHEET_CONDITIONS = '希望条件';
const SHEET_ABSENCES = '外せない予定';
const SHEET_NOTIFICATIONS = '通知';
const SHEET_BOSS_REST = '社長休み';
const SHEET_CONFIRMATIONS = '確定状況';
const SHEET_LINE_REG = 'LINE登録';

// 通知用定数
const NOTIFY_EMAIL = 'yawaragi.notify@gmail.com';
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

// ============================================
// LINE / Gmail 通知ヘルパー（被り発生時にスタッフへLINE・社長へGmail）
// ============================================

// Script PropertiesからLINE tokenを取得
function getLineToken_() {
  return PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');
}

// スタッフ名からLINE userIDを引く（LINE登録シート参照）
function getLineUserIdByName_(staffName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_LINE_REG);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === staffName) {
      return String(data[i][1]) || null;
    }
  }
  return null;
}

// 1人のスタッフにLINEを送信
// 戻り値: { success: bool, reason?: 'unregistered'|'no_token'|'api_error', error?: string }
function sendLineToStaff_(staffName, message) {
  const userId = getLineUserIdByName_(staffName);
  if (!userId) {
    Logger.log('LINE userID未登録: ' + staffName);
    return { success: false, reason: 'unregistered', staffName: staffName };
  }
  const token = getLineToken_();
  if (!token) {
    Logger.log('LINE_TOKEN未設定。setupLineToken()を実行してください');
    return { success: false, reason: 'no_token' };
  }
  try {
    UrlFetchApp.fetch(LINE_PUSH_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + token },
      payload: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: message }]
      }),
      muteHttpExceptions: true
    });
    return { success: true };
  } catch (err) {
    Logger.log('LINE送信エラー(' + staffName + '): ' + err.message);
    return { success: false, reason: 'api_error', error: err.message };
  }
}

// 社長にGmail送信
function sendOwnerEmail_(subject, body) {
  try {
    GmailApp.sendEmail(NOTIFY_EMAIL, subject, body);
    return true;
  } catch (err) {
    Logger.log('Gmail送信エラー: ' + err.message);
    return false;
  }
}

// 被り発生時の通知一括送信
// conflictingStaff: 被ってる相手のスタッフ名の配列
// applicantName: 希望を出した本人
// monthStr: 'YYYY-MM'
// day: 日（数値）
// reason: 理由（社員被り・人員基準等の説明）
function notifyConflictAll_(conflictingStaff, applicantName, monthStr, day, reason) {
  const parts = String(monthStr).split('-');
  const m = Number(parts[1]);
  const dateStr = m + '月' + day + '日';
  const unreachable = []; // LINE未登録で届かなかったスタッフ

  // 被り相手それぞれにLINE
  conflictingStaff.forEach(function(s) {
    const msg = '【シフト希望 被り】\n' +
                dateStr + ' に ' + applicantName + 'さんが休み希望を出しました。\n' +
                '（' + reason + '）\n相談してください。';
    const r = sendLineToStaff_(s, msg);
    if (!r.success && r.reason === 'unregistered') unreachable.push(s);
  });

  // 申請者本人にもLINE
  const others = conflictingStaff.join('さん・');
  const applicantMsg = '【シフト希望 被り】\n' +
                       dateStr + ' は ' + others + 'さん と休み被り。\n' +
                       '（' + reason + '）\n相談してください。';
  const ar = sendLineToStaff_(applicantName, applicantMsg);
  if (!ar.success && ar.reason === 'unregistered') unreachable.push(applicantName);

  // 社長にGmail
  const allNames = [applicantName].concat(conflictingStaff).join('・');
  const subject = '【シフト希望】' + dateStr + ' 被り発生：' + allNames;
  let body = dateStr + ' で以下のスタッフが休み希望で被っています：\n' +
             allNames + '\n\n' +
             '理由：' + reason + '\n\n' +
             'シフト希望アプリで確認してください。';
  if (unreachable.length > 0) {
    body += '\n\n' +
            '━━━━━━━━━━━━━━━━━━━━━━\n' +
            '⚠️ LINE未登録のため通知が届きませんでした：\n' +
            unreachable.join('・') + 'さん\n' +
            '社長から個別に連絡してください。\n' +
            '※スタッフが「yawaragi社内」LINEに自分の名前を送ると自動登録されます\n' +
            '━━━━━━━━━━━━━━━━━━━━━━';
  }
  sendOwnerEmail_(subject, body);
}

// 上書きしてよい値かを判定する（誤実行で通知を止めないためのガード）
// 実トークンは170文字前後。空文字・未指定・短すぎる値はすべて拒否する。
function isValidLineTokenValue_(v) {
  return typeof v === 'string' && v.trim().length >= 100;
}

// 【初回セットアップ専用】LINE tokenをScript Propertiesに保存
// [DEPRECATED 2026-07] 通常はGASのScript Properties画面で直接入力する。値の直書きは廃止（流出再発防止）。
// エディタから引数なしで誤実行しても、既存トークンを壊さず何もしない。
function setupLineToken(token) {
  if (!isValidLineTokenValue_(token)) {
    Logger.log('⚠️ 何もしませんでした。既存の LINE_TOKEN は変更していません。\n'
             + 'トークンは Apps Script の「プロジェクトの設定 → スクリプト プロパティ」で '
             + 'LINE_TOKEN に直接入力してください。');
    return { ok: false, reason: 'invalid_token' };
  }
  PropertiesService.getScriptProperties().setProperty('LINE_TOKEN', token.trim());
  Logger.log('LINE_TOKENをScript Propertiesに保存しました');
  return { ok: true };
}

// 【初回セットアップ専用】LINE登録シートを作成
// Apps Scriptエディタで1回だけ実行してください
function setupLineRegSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_LINE_REG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_LINE_REG);
    sheet.appendRow(['スタッフ名', 'LINE_userID', '登録日時']);
    sheet.getRange('A1:C1').setFontWeight('bold').setBackground('#e8f0fe');
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 300);
    sheet.setColumnWidth(3, 150);
    Logger.log('LINE登録シートを作成しました');
  } else {
    Logger.log('LINE登録シートは既に存在します');
  }
}

// 【テスト用】LINE・Gmail送信テスト
function testNotify() {
  sendOwnerEmail_('【テスト】シフト希望通知', 'これはテストメールです。届いていればOKです。');
  Logger.log('Gmailテスト送信完了（yawaragi.notify@gmail.comを確認）');
}

// LINE通知の初回セットアップを自動実行（doGetから毎回呼ぶ・冪等）
// LINE_TOKEN未設定なら保存、LINE登録シート未作成なら作成。設定済みなら何もしない。
function ensureLineSetup_() {
  try {
    if (!PropertiesService.getScriptProperties().getProperty('LINE_TOKEN')) {
      setupLineToken();
    }
    if (!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LINE_REG)) {
      setupLineRegSheet();
    }
  } catch (e) {
    Logger.log('ensureLineSetup_: ' + e.message);
  }
}

// ============================================
// LINE登録状況のチェック・補完機能
// ============================================

// 未登録スタッフ一覧を取得（管理用）
// 戻り値: { total: 全スタッフ数, registered: 登録済み数, unregistered: 未登録名配列 }
function getUnregisteredStaff() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const staffSheet = ss.getSheetByName(SHEET_STAFF_SHIFT);
  if (!staffSheet) return { error: 'スタッフシートが見つかりません' };

  const staffData = staffSheet.getDataRange().getValues();
  const allStaff = [];
  for (let i = 1; i < staffData.length; i++) {
    const name = String(staffData[i][0] || '').trim();
    if (name) allStaff.push(name);
  }

  const registered = {};
  const regSheet = ss.getSheetByName(SHEET_LINE_REG);
  if (regSheet) {
    const regData = regSheet.getDataRange().getValues();
    for (let i = 1; i < regData.length; i++) {
      const name = String(regData[i][0] || '').trim();
      const userId = String(regData[i][1] || '').trim();
      if (name && userId) registered[name] = true;
    }
  }

  const unregistered = allStaff.filter(function(s) { return !registered[s]; });
  return {
    total: allStaff.length,
    registered: allStaff.length - unregistered.length,
    unregistered: unregistered
  };
}

// 社長に登録状況のレポートをメール送信
// 手動実行 or 定期トリガーで使用
function sendRegistrationStatusEmail() {
  const r = getUnregisteredStaff();
  if (r.error) {
    sendOwnerEmail_('【シフト希望】LINE登録チェックエラー', 'エラー：' + r.error);
    return;
  }
  let body = '【シフト希望アプリ LINE登録状況】\n\n' +
             '全スタッフ：' + r.total + '名\n' +
             '登録済み　：' + r.registered + '名\n' +
             '未登録　　：' + r.unregistered.length + '名\n\n';
  if (r.unregistered.length > 0) {
    body += '━━━━━━━━━━━━━━━━━━━━━━\n' +
            '⚠️ 未登録スタッフ：\n' +
            r.unregistered.map(function(n) { return '・' + n + 'さん'; }).join('\n') + '\n' +
            '━━━━━━━━━━━━━━━━━━━━━━\n\n' +
            '対処：上記スタッフに「yawaragi社内」LINEへ自分の名前送信を依頼してください。\n' +
            '（友だち追加済みなら、フルネームを送るだけで自動登録されます）';
  } else {
    body += '✅ 全員登録済みです。問題ありません。';
  }
  const subject = r.unregistered.length > 0
    ? '【シフト希望】LINE未登録 ' + r.unregistered.length + '名あり'
    : '【シフト希望】LINE登録 全員完了';
  sendOwnerEmail_(subject, body);
  Logger.log('登録状況メール送信完了');
}

// handleAction経由で管理画面から呼ばれるAPI
function getRegistrationStatusApi() {
  return getUnregisteredStaff();
}

// 希望条件シートの Phase1 追加列（A〜F=既存・触らない／G以降に右側追記）
// G:req_id  H:type  I:params  J:scope  K:targetMonth  L:label  M:strength
const COND_NEW_HEADERS = ['req_id', 'type', 'params', 'scope', 'targetMonth', 'label', 'strength'];
const COND_NEW_COL_START = 7; // 1-based: G列

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
  var __g = adminGuard_(action, params);
  if (__g) return __g;
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
    case 'confirmSubmission': return confirmSubmission(params);
    case 'unconfirmSubmission': return unconfirmSubmission(params);
    case 'getConfirmations': return getConfirmations(params.month);
    case 'recordJouhoApi': return recordJouhoApi(params);
    case 'getJouhoCounts': return getJouhoCounts();
    case 'concedeDay': return concedeDay(params);
    case 'getRegistrationStatus': return getUnregisteredStaff();
    default: return { error: '不明なアクション: ' + action };
  }
}

// --- Web APIエンドポイント ---
function doGet(e) {
  const action = e.parameter.action;
  const callback = e.parameter.callback;

  // アクションなし → GitHub Pages版へリダイレクト（2026-04-24切替）
  if (!action && !callback) {
    return buildRedirectPage_('https://m-higa-sys.github.io/yawaragi-apps/shift.html', 'シフト希望入力');
  }
  try {
    ensureLineSetup_();
    // 管理者API認可ガード（enforce=ON時のみ拒否・OFFは素通り）
    var __guardErr = adminGuard_(action, e.parameter);
    if (__guardErr) {
      if (callback) return ContentService.createTextOutput(callback + '(' + JSON.stringify(__guardErr) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
      return ContentService.createTextOutput(JSON.stringify(__guardErr)).setMimeType(ContentService.MimeType.JSON);
    }
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
      case 'testNotify':
        try {
          GmailApp.sendEmail('yawaragi.notify@gmail.com', '【テスト】シフト希望通知', 'これはテストメールです。届いていればOKです。');
          result = { success: true, sent: true };
        } catch (err) {
          result = { success: false, error: String((err && err.message) || err) };
        }
        break;
      case 'lineSetupStatus':
        result = {
          tokenSet: !!PropertiesService.getScriptProperties().getProperty('LINE_TOKEN'),
          regSheetExists: !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LINE_REG)
        };
        break;
      case 'getRegistrationStatus':
        result = getUnregisteredStaff();
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
      case 'confirmSubmission':
        result = confirmSubmission(e.parameter);
        break;
      case 'unconfirmSubmission':
        result = unconfirmSubmission(e.parameter);
        break;
      case 'getConfirmations':
        result = getConfirmations(e.parameter.month);
        break;
      case 'recordJouhoApi':
        result = recordJouhoApi(e.parameter);
        break;
      case 'getJouhoCounts':
        result = getJouhoCounts();
        break;
      case 'concedeDay':
        result = concedeDay(e.parameter);
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
// ============================================
// 管理者セッション認可（2026-07-14 セキュリティ強化）
// core: admin-session-core.js（checkAdminAuth / ADMIN_SESSION_TTL_SEC）
// 目的: getAllDataAdmin / getBossRests 等を無認証で叩けなくする（社長の休み秘匿の実装）。
// enforce=OFF 既定（素通り＋ログ）→ 実測後 ADMIN_TOKEN_ENFORCE=ON で漏洩クローズ。
// ============================================
var ADMIN_GUARDED_ACTIONS_ = [
  'getAllDataAdmin', 'getBossRests', 'addBossRest', 'removeBossRest',
  'approveCondition', 'rejectCondition', 'autoConfirmAll'
];

function adminEnforceOn_() {
  return String(PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN_ENFORCE') || '') === 'ON';
}

// PIN成功時にランダムトークンを発行し CacheService(TTL) に保存。
function issueAdminToken_() {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('adm_' + token, '1', ADMIN_SESSION_TTL_SEC);
  return token;
}

// トークンを検証。valid なら TTL を延長（スライディング期限＝操作中に切れない）。
function verifyAdminToken_(token) {
  var cached = token ? CacheService.getScriptCache().get('adm_' + token) : null;
  var res = checkAdminAuth(token, cached, adminEnforceOn_());
  if (res.reason === 'valid' && token) {
    CacheService.getScriptCache().put('adm_' + token, '1', ADMIN_SESSION_TTL_SEC);
  }
  return res;
}

// 管理者actionなら認可を要求。NGは {error:'auth_required'}、素通り時は null。
function adminGuard_(action, params) {
  var isAdminAction = ADMIN_GUARDED_ACTIONS_.indexOf(action) >= 0
    || (action === 'getConditions' && (!params.staff || String(params.staff).length === 0)); // 全件版のみ管理者
  if (!isAdminAction) return null;
  var res = verifyAdminToken_(params.token);
  try { Logger.log('adminGuard action=' + action + ' reason=' + res.reason + ' enforce=' + adminEnforceOn_()); } catch (e) {}
  if (!res.ok) return { error: 'auth_required', reason: res.reason };
  return null;
}

// enforce切替（社長がGASエディタから実行 or Script Properties直接設定）
function setAdminEnforceOn() { PropertiesService.getScriptProperties().setProperty('ADMIN_TOKEN_ENFORCE', 'ON'); return 'ADMIN_TOKEN_ENFORCE=ON'; }
function setAdminEnforceOff() { PropertiesService.getScriptProperties().setProperty('ADMIN_TOKEN_ENFORCE', 'OFF'); return 'ADMIN_TOKEN_ENFORCE=OFF'; }

function verifyAdminPin(pin) {
  const settings = getSettings();
  if (String(pin) === String(settings.adminPin)) {
    return { success: true, token: issueAdminToken_(), expiresInSec: ADMIN_SESSION_TTL_SEC };
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
    absences: absencesFiltered,
    confirmations: getConfirmations(wishesResult.month).confirmations || []
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
    confirmations: getConfirmations(wishesResult.month).confirmations || [],
    jouhoCounts: getJouhoCounts().counts || {},
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
          // LINE・Gmail通知（社員同士の被り）
          try {
            notifyConflictAll_([conflictName], data.staff, data.month, Number(data.day), '社員同士の被り');
          } catch (e) { Logger.log('通知失敗: ' + e.message); }
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
    // LINE・Gmail通知（人員基準ブロック）
    if (conflictNames.length > 0) {
      try {
        notifyConflictAll_(conflictNames, data.staff, data.month, Number(data.day), staffCheck.message || '人員基準のため登録不可');
      } catch (e) { Logger.log('通知失敗: ' + e.message); }
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
    // LINE・Gmail通知（人員基準警告）
    if (conflictNames.length > 0) {
      try {
        notifyConflictAll_(conflictNames, data.staff, data.month, Number(data.day), staffCheck.message || '人員基準の警告');
      } catch (e) { Logger.log('通知失敗: ' + e.message); }
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

// --- 1行(配列)を条件オブジェクトへ。旧行(G以降が空)は安全側にフォールバック ---
// ※純粋関数（SpreadsheetApp非依存）＝Nodeで実測可能。row は A..M の値配列。
function condRowToObj_(row, i) {
  return {
    id: i,                                       // 旧来の行ベースid（後方互換で残す）
    staff: String(row[0]),
    content: String(row[1]),
    date: row[2] ? Utilities.formatDate(new Date(row[2]), 'Asia/Tokyo', 'yyyy/MM/dd') : '',
    status: String(row[3]) || '未確認',
    comment: String(row[4]) || '',
    approvedDate: row[5] ? Utilities.formatDate(new Date(row[5]), 'Asia/Tokyo', 'yyyy/MM/dd') : '',
    // --- Phase1 追加（旧行＝空欄/undefined はフォールバック） ---
    req_id:      row[6]  ? String(row[6])  : '',
    type:        row[7]  ? String(row[7])  : 'free',
    params:      row[8]  ? String(row[8])  : '',
    scope:       row[9]  ? String(row[9])  : '永久',
    targetMonth: row[10] ? String(row[10]) : '',
    label:       row[11] ? String(row[11]) : String(row[1]), // label未設定なら content を流用
    strength:    row[12] ? String(row[12]) : '希望'
  };
}

// --- 新規追加行(A..M)を組み立て（純粋関数・Nodeで実測可能） ---
function condBuildRow_(data, reqId, now) {
  const label = data.label || data.content || '';
  return [
    data.staff,
    (data.content != null && data.content !== '') ? data.content : label,
    now, '未確認', '', '',
    reqId,
    data.type || 'free',
    data.params || '',
    data.scope || '永久',
    data.targetMonth || '',
    label,
    data.strength || '希望'
  ];
}

// --- req_id優先で対象行を特定（行位置非依存）。無ければ旧来 id(行番号-1) にフォールバック ---
function condFindRowNum_(sheet, data) {
  if (data.req_id) {
    const last = sheet.getLastRow();
    if (last >= 2) {
      const g = sheet.getRange(2, COND_NEW_COL_START, last - 1, 1).getValues(); // G列(データ行のみ)
      for (let r = 0; r < g.length; r++) {
        if (String(g[r][0]) === String(data.req_id)) return r + 2; // 1-based行番号
      }
    }
    return -1;
  }
  if (data.id != null && data.id !== '') return Number(data.id) + 1; // 旧idルート（後方互換）
  return -1;
}

// --- G以降の新ヘッダを保証（A〜Fは非破壊。無い時だけG..Mを追記） ---
function condEnsureHeaders_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 6) {
    sheet.getRange(1, 1, 1, 6).setValues([['スタッフ名', '条件内容', '登録日', 'ステータス', '社長コメント', '承認日']]);
  }
  const needEnd = COND_NEW_COL_START - 1 + COND_NEW_HEADERS.length; // = 13(M)
  if (sheet.getLastColumn() < needEnd) {
    sheet.getRange(1, COND_NEW_COL_START, 1, COND_NEW_HEADERS.length).setValues([COND_NEW_HEADERS]);
  }
}

// --- 条件の取得（staffName指定で個人、省略で全員）※新列も返す・旧行はフォールバック ---
function getConditions(staffName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONDITIONS);
  if (!sheet || sheet.getLastRow() <= 1) return { conditions: [] };

  const data = sheet.getDataRange().getValues();
  const conditions = [];
  for (let i = 1; i < data.length; i++) {
    if (staffName && String(data[i][0]) !== staffName) continue;
    conditions.push(condRowToObj_(data[i], i));
  }
  return { conditions: conditions };
}

// --- 条件の追加（req_id=UUID生成・新列も書く。旧UIの{staff,content}だけでも既定値で動く） ---
function addCondition(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_CONDITIONS);
  if (!sheet) sheet = ss.insertSheet(SHEET_CONDITIONS);
  condEnsureHeaders_(sheet);

  const reqId = Utilities.getUuid();
  sheet.appendRow(condBuildRow_(data, reqId, new Date()));

  return { success: true, req_id: reqId };
}

// --- 条件の承認（req_id優先・旧idも可） ---
function approveCondition(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONDITIONS);
  if (!sheet) return { success: false, message: 'シートが見つかりません' };

  const rowNum = condFindRowNum_(sheet, data);
  if (rowNum < 1) return { success: false, message: '対象の要望が見つかりません' };
  sheet.getRange(rowNum, 4).setValue('承認済み');
  sheet.getRange(rowNum, 5).setValue(data.comment || '');
  sheet.getRange(rowNum, 6).setValue(new Date());

  return { success: true };
}

// --- 条件の却下（req_id優先・旧idも可） ---
function rejectCondition(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONDITIONS);
  if (!sheet) return { success: false, message: 'シートが見つかりません' };

  const rowNum = condFindRowNum_(sheet, data);
  if (rowNum < 1) return { success: false, message: '対象の要望が見つかりません' };
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

  // 【2026-05-21 被り判定v1改修】下記3チェックを廃止（厚労省・埼玉県の人員基準で確認）
  //  ・生活相談員チェック … 比嘉（管理者・介護福祉士。埼玉県は介護福祉士を生活相談員に該当と
  //    明記）が毎日出勤するため常に充足。
  //  ・介護福祉士チェック … サービス提供体制強化加算(Ⅰ)は前年度の介護福祉士割合で算定する加算で、
  //    日々の人数要件ではない。
  //  ・機能訓練指導員チェック … 個別機能訓練加算(Ⅰ)ロの専従2名は、比嘉（柔整）＋看護師の兼務
  //    （看護職員は機能訓練指導員を兼務可）で常に充足。
  //  → 被り判定は「看護師ライン」「コア5人ライン」「ドライバーライン」の3つで行う。
  //  設計書: docs/superpowers/specs/2026-05-21-シフト希望_被り判定と通知-design.md

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

// ============================================
// 確定機能（スタッフが希望入力を「確定」する）
// 確定状況シート: [スタッフ名, 対象月, 確定日時, 種別(確定/自動確定)]
// ============================================

function ensureConfirmSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CONFIRMATIONS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CONFIRMATIONS);
    sheet.getRange(1, 1, 1, 4).setValues([['スタッフ名', '対象月', '確定日時', '種別']]);
  }
  return sheet;
}

// --- 確定状況の取得（月指定） ---
function getConfirmations(monthStr) {
  if (!monthStr) {
    var now = new Date();
    now.setMonth(now.getMonth() + 1);
    monthStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM');
  }
  var sheet = ensureConfirmSheet_();
  if (sheet.getLastRow() <= 1) return { confirmations: [] };

  var data = sheet.getDataRange().getValues();
  var confirmations = [];
  for (var i = 1; i < data.length; i++) {
    if (normalizeMonth_(data[i][1]) === monthStr) {
      confirmations.push({
        staff: String(data[i][0]),
        month: monthStr,
        confirmedAt: data[i][2]
          ? Utilities.formatDate(new Date(data[i][2]), 'Asia/Tokyo', 'MM/dd HH:mm')
          : '',
        type: String(data[i][3] || '確定')
      });
    }
  }
  return { confirmations: confirmations };
}

// --- 確定する ---
function confirmSubmission(data) {
  if (!data.staff || !data.month) return { success: false, message: 'スタッフ名と対象月が必要です' };
  var sheet = ensureConfirmSheet_();
  var all = sheet.getDataRange().getValues();
  // 既存チェック（重複は上書きしない、そのまま成功）
  for (var i = 1; i < all.length; i++) {
    if (normalizeMonth_(all[i][1]) === data.month && String(all[i][0]) === data.staff) {
      return { success: true, alreadyConfirmed: true };
    }
  }
  sheet.appendRow([data.staff, data.month, new Date(), data.type || '確定']);
  writeLog_(data.staff, '確定', data.month, 0);
  return { success: true };
}

// --- 確定解除 ---
function unconfirmSubmission(data) {
  if (!data.staff || !data.month) return { success: false, message: 'スタッフ名と対象月が必要です' };
  var sheet = ensureConfirmSheet_();
  var all = sheet.getDataRange().getValues();
  for (var i = all.length - 1; i >= 1; i--) {
    if (normalizeMonth_(all[i][1]) === data.month && String(all[i][0]) === data.staff) {
      sheet.deleteRow(i + 1);
      writeLog_(data.staff, '確定解除', data.month, 0);
      return { success: true };
    }
  }
  return { success: false, message: '確定状態ではありません' };
}

// --- 自動確定（20日の夜などトリガーで実行） ---
// 期限日を過ぎたのに未確定のスタッフを、自動で確定扱いにする
function autoConfirmAll() {
  var settings = getSettings();
  var deadlineDay = Number(settings.deadline) || 20;
  var now = new Date();
  // 今日が期限日以降なら、募集中の月（= 翌月）を対象
  if (now.getDate() < deadlineDay) return;

  var target = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  var monthStr = Utilities.formatDate(target, 'Asia/Tokyo', 'yyyy-MM');

  var staffList = getStaff().staff || [];
  var confirmed = {};
  (getConfirmations(monthStr).confirmations || []).forEach(function(c) {
    confirmed[c.staff] = true;
  });

  var sheet = ensureConfirmSheet_();
  staffList.forEach(function(name) {
    if (!confirmed[name]) {
      sheet.appendRow([name, monthStr, new Date(), '自動確定']);
      writeLog_(name, '自動確定', monthStr, 0);
    }
  });
}

// ============================================
// 譲歩記録 Web API 版（管理者がWeb画面から記録）
// ============================================

// --- 譲歩を記録（Web版） ---
function recordJouhoApi(data) {
  if (!data.staff) return { success: false, message: 'スタッフ名が必要です' };
  var month = data.month;
  if (!month) {
    var now = new Date();
    now.setMonth(now.getMonth() + 1);
    month = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM');
  }
  var day = data.day ? Number(data.day) : 0;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_JOUHO);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_JOUHO);
    sheet.getRange(1, 1, 1, 4).setValues([['記録日', 'スタッフ', '対象月', '対象日']]);
  }
  sheet.appendRow([new Date(), data.staff, month, day]);
  return { success: true };
}

// --- 譲歩累計取得（全スタッフ） ---
function getJouhoCounts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_JOUHO);
  if (!sheet || sheet.getLastRow() <= 1) return { counts: {} };

  var data = sheet.getDataRange().getValues();
  var counts = {};
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][1]);
    if (!name) continue;
    counts[name] = (counts[name] || 0) + 1;
  }
  return { counts: counts };
}

// --- ゆずる（スタッフ本人が被り日の希望を取り下げ、譲歩カウント＋相手通知） ---
function concedeDay(data) {
  if (!data.staff || !data.month || !data.day) {
    return { success: false, message: 'パラメータ不足です' };
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wishSheet = ss.getSheetByName(SHEET_WISHES);
  if (!wishSheet) return { success: false, message: 'シフト希望シートがありません' };

  var day = Number(data.day);
  var month = String(data.month);

  // その日の希望者一覧を取得
  var allData = wishSheet.getDataRange().getValues();
  var targetRow = -1;
  var otherStaff = [];
  for (var i = 1; i < allData.length; i++) {
    if (normalizeMonth_(allData[i][0]) === month && Number(allData[i][2]) === day) {
      if (String(allData[i][1]) === data.staff) {
        targetRow = i + 1;
      } else {
        otherStaff.push(String(allData[i][1]));
      }
    }
  }

  if (targetRow === -1) {
    return { success: false, message: 'その日の希望が登録されていません' };
  }
  if (otherStaff.length === 0) {
    return { success: false, message: 'この日は他に希望者がいません。ゆずる必要はありません。' };
  }

  // 希望を削除
  wishSheet.deleteRow(targetRow);
  writeLog_(data.staff, 'ゆずる', month, day);

  // 譲歩カウント記録
  var jouhoSheet = ss.getSheetByName(SHEET_JOUHO);
  if (!jouhoSheet) {
    jouhoSheet = ss.insertSheet(SHEET_JOUHO);
    jouhoSheet.getRange(1, 1, 1, 4).setValues([['記録日', 'スタッフ', '対象月', '対象日']]);
  }
  jouhoSheet.appendRow([new Date(), data.staff, month, day]);

  // 相手に通知
  var [y, m] = month.split('-').map(Number);
  otherStaff.forEach(function(name) {
    addNotification_(
      name,
      data.staff + 'さんが ' + m + '月' + day + '日 の希望休をゆずってくれました。ありがとう！',
      month,
      day
    );
  });

  return { success: true, concededTo: otherStaff };
}

// 古いブックマーク救済用リダイレクトページ（2026-04-24追加）
function buildRedirectPage_(newUrl, title) {
  var html = '<!DOCTYPE html><html lang="ja"><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<base target="_top">' +
    '<title>' + title + ' - 移動中</title>' +
    '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:30px;text-align:center;}' +
    'a{display:inline-block;margin-top:20px;padding:14px 28px;background:#4CAF50;color:#fff;text-decoration:none;border-radius:8px;font-size:16px;}</style>' +
    '</head><body>' +
    '<h2>' + title + '</h2>' +
    '<p>新しいURLに自動で移動しています...</p>' +
    '<p>移動しない場合は下のボタンをタップしてください</p>' +
    '<a id="go" href="' + newUrl + '" target="_top">' + title + 'を開く</a>' +
    '<p style="margin-top:30px;font-size:12px;color:#888;">※このURLはブックマーク登録し直してください</p>' +
    '<script>' +
    'setTimeout(function(){' +
    '  var a=document.getElementById("go");' +
    '  if(a){try{a.click();}catch(e){}}' +
    '  try{top.location.href="' + newUrl + '";}catch(e){}' +
    '  try{parent.location.href="' + newUrl + '";}catch(e){}' +
    '  try{location.href="' + newUrl + '";}catch(e){}' +
    '},100);' +
    '</script>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle(title + ' - 移動中')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
