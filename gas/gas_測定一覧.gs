// ============================================
// 測定・訪問・誕生日一覧 GAS（Google Apps Script）
// 利用者台帳から必要な情報だけを安全に返す
// ============================================

// 利用者台帳のスプレッドシートID
const SS_ID = '1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0';
const SHEET_NAME = '利用者台帳';

// --- google.script.run用（GAS Webアプリ画面から呼ばれる） ---
function handleAction(params) {
  if (params.action === 'getMembersData') {
    return { success: true, data: getMembersData() };
  }
  return { success: false, error: '不明なアクション' };
}

// --- Web APIエンドポイント ---
function doGet(e) {
  const callback = e.parameter.callback;
  const action = e.parameter.action;

  // アクションもコールバックもなし → HTMLページを配信
  if (!action && !callback) {
    return HtmlService.createHtmlOutputFromFile('画面')
      .setTitle('測定・訪問・誕生日一覧 - yawaragi')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  try {
    const data = getMembersData();
    const json = JSON.stringify({ success: true, data: data });
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const errJson = JSON.stringify({ success: false, error: err.message });
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + errJson + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(errJson)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getMembersData() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('シート「' + SHEET_NAME + '」が見つかりません');

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  // ヘッダーから必要な列を特定
  const headers = data[0].map(h => String(h).trim());
  const colMap = {
    name: -1,
    care: -1,
    unit: -1,
    birthday: -1,
    certEnd: -1,
    planStart: -1,
    startDate: -1,
    status: -1,
    days: -1
  };

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h.includes('名前') || h === '氏名') colMap.name = i;
    else if (h.includes('介護度') || h.includes('要介護') || (h.includes('認定') && !h.includes('期間'))) colMap.care = i;
    else if (h.includes('午前') || h.includes('午後') || h.includes('単位') || h.includes('AM') || h.includes('PM')) colMap.unit = i;
    else if (h.includes('誕生')) colMap.birthday = i;
    else if (h.includes('認定期間終了') || h.includes('認定終了')) colMap.certEnd = i;
    else if (h.includes('計画書開始')) colMap.planStart = i;
    else if (h.includes('利用開始日') || h.includes('利用開始')) colMap.startDate = i;
    else if (h.includes('ステータス') || h.includes('利用状況') || h.includes('利用ステータス')) colMap.status = i;
    else if (h === '利用曜日') colMap.days = i;
  }

  if (colMap.name < 0) throw new Error('「氏名」列が見つかりません');

  const members = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = String(row[colMap.name] || '').trim();
    if (!name) continue;

    // 利用中でない人はスキップ（ステータス列がある場合）
    if (colMap.status >= 0) {
      const status = String(row[colMap.status] || '').trim();
      if (status && (status.includes('終了') || status.includes('退所') || status.includes('中止'))) continue;
    }

    // 介護度
    const care = colMap.care >= 0 ? String(row[colMap.care] || '').trim() : '';

    // AM/PM
    const unit = colMap.unit >= 0 ? String(row[colMap.unit] || '').trim() : '';

    // 誕生日（月/日だけ返す）
    let birthday = '';
    if (colMap.birthday >= 0 && row[colMap.birthday]) {
      const bVal = row[colMap.birthday];
      if (bVal instanceof Date) {
        birthday = (bVal.getMonth() + 1) + '/' + bVal.getDate();
      } else {
        const bStr = String(bVal);
        const m2 = bStr.match(/\d{4}[-\/](\d{1,2})[-\/](\d{1,2})/);
        const m = bStr.match(/(\d{1,2})\/(\d{1,2})(?:\/|$)/);
        if (m2) birthday = parseInt(m2[1]) + '/' + parseInt(m2[2]);
        else if (m) birthday = parseInt(m[1]) + '/' + parseInt(m[2]);
      }
    }

    // 認定期間終了日
    let certEnd = '';
    if (colMap.certEnd >= 0 && row[colMap.certEnd]) {
      const cVal = row[colMap.certEnd];
      if (cVal instanceof Date) {
        certEnd = Utilities.formatDate(cVal, 'Asia/Tokyo', 'yyyy/MM/dd');
      } else {
        certEnd = String(cVal).trim();
      }
    }

    // 計画書開始月
    let planStart = '';
    if (colMap.planStart >= 0 && row[colMap.planStart]) {
      const pVal = row[colMap.planStart];
      if (pVal instanceof Date) {
        planStart = Utilities.formatDate(pVal, 'Asia/Tokyo', 'yyyy-MM');
      } else {
        const pStr = String(pVal).trim();
        const pm = pStr.match(/(\d{4})[-\/](\d{1,2})/);
        if (pm) planStart = pm[1] + '-' + String(pm[2]).padStart(2, '0');
      }
    }

    // 利用開始日（yyyy-MM形式。「-」や空は空文字）
    let startDate = '';
    if (colMap.startDate >= 0 && row[colMap.startDate]) {
      const sVal = row[colMap.startDate];
      if (sVal instanceof Date) {
        startDate = Utilities.formatDate(sVal, 'Asia/Tokyo', 'yyyy-MM');
      } else {
        const sStr = String(sVal).trim();
        const sm = sStr.match(/(\d{4})[-\/](\d{1,2})/);
        if (sm) startDate = sm[1] + '-' + String(sm[2]).padStart(2, '0');
      }
    }

    // 利用曜日
    const days = colMap.days >= 0 ? String(row[colMap.days] || '').trim() : '';

    members.push({
      name: name,
      care: care,
      unit: unit,
      birthday: birthday,
      certEnd: certEnd,
      planStart: planStart,
      startDate: startDate,
      days: days
    });
  }

  return members;
}
