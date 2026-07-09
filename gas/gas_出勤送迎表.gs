function doGet(e) {
  // === 送迎時間一覧用 ===
  if (e && e.parameter && e.parameter.action === 'getSchedTimes') {
    return getSchedTimesResponse(e.parameter.callback);
  }

  // === タイムスケジュール連携 ===
  if (e && e.parameter && e.parameter.action === 'getOps') {
    return getDailyOpsResponse(e.parameter.callback);
  }

  // === 中止管理タブ連動API (2026-05-14) ===
  if (e && e.parameter && e.parameter.action === 'getMembersForApp') {
    return handleGetMembersForApp(e);
  }

  var ss = SpreadsheetApp.openById('1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0');
  var sheet = ss.getSheetByName('利用者台帳');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var col = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    col[h] = i;
  }

  function findCol() {
    for (var i = 0; i < arguments.length; i++) {
      if (col[arguments[i]] !== undefined) return col[arguments[i]];
    }
    return -1;
  }

  var nameC = findCol('氏名', '名前');
  var dowC = findCol('曜日', '利用曜日');
  var ampmC = findCol('午前午後', 'AM/PM', '利用時間帯', '午前/午後');

  var bdC = findCol('誕生日', '生年月日');
  var psC = findCol('計画書開始', '計画書開始月');
  var stC = findCol('利用ステータス');
  var sdC = findCol('利用開始日');
  if (nameC < 0) nameC = 0;

  var users = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var name = String(r[nameC] || '').trim();
    if (!name) continue;

    if (stC >= 0) {
      var st = String(r[stC] || '').trim();
      if (st === '終了' || st === '休止' || st === '中止') continue;
    }

    var u = { name: name };
    if (dowC >= 0) u.dow = String(r[dowC] || '');
    if (ampmC >= 0) u.ampm = String(r[ampmC] || '');

    if (bdC >= 0 && r[bdC]) {
      var bd = r[bdC];
      if (bd instanceof Date) {
        u.birthday = (bd.getMonth() + 1) + '/' + bd.getDate();
      } else {
        u.birthday = String(bd);
      }
    }

    if (psC >= 0 && r[psC]) {
      var ps = r[psC];
      if (ps instanceof Date) {
        u.planStart = ps.getMonth() + 1;
      } else {
        var m = String(ps).match(/(\d+)/);
        if (m) u.planStart = parseInt(m[1]);
      }
    }

    if (sdC >= 0 && r[sdC]) {
      var sd = r[sdC];
      if (sd instanceof Date) {
        u.startDate = Utilities.formatDate(sd, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else {
        var sds = String(sd).trim();
        var dm = sds.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
        if (dm) u.startDate = dm[1] + '-' + String(dm[2]).padStart(2,'0') + '-' + String(dm[3]).padStart(2,'0');
      }
    }

    users.push(u);
  }

  return ContentService.createTextOutput(JSON.stringify(users))
    .setMimeType(ContentService.MimeType.JSON);
}

function saveToNisshiSheet(jsonStr) {
  var newData = JSON.parse(jsonStr);
  var ss = SpreadsheetApp.openById('1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw');
  var sheet = ss.getSheetByName('出勤送迎表データ');
  var existing = {};
  var current = sheet.getRange('A1').getValue();
  if (current) { try { existing = JSON.parse(current); } catch(e) { existing = {}; } }
  if (!existing.dailyOps) existing.dailyOps = {};
  for (var date in newData.dailyOps) { existing.dailyOps[date] = newData.dailyOps[date]; }
  existing.type = 'yawaragi_daily_ops';
  existing.lastSaved = new Date().toISOString();
  sheet.getRange('A1').setValue(JSON.stringify(existing));
  return 'OK';
}

// =============================================
// タイムスケジュール連携用エンドポイント (2026/4/9)
// =============================================

function getDailyOpsResponse(callback) {
  var ss = SpreadsheetApp.openById('1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw');
  var sheet = ss.getSheetByName('出勤送迎表データ');
  var data = {};
  if (sheet) {
    var current = sheet.getRange('A1').getValue();
    if (current) {
      try { data = JSON.parse(current); } catch(err) { data = {}; }
    }
  }
  if (!data.dailyOps) data.dailyOps = {};

  var json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================================
// 送迎時間一覧用エンドポイント (2026/4/12)
// =============================================

// 送迎時間データを返す
function getSchedTimesResponse(callback) {
  var ss = SpreadsheetApp.openById('1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw');
  var sheet = ss.getSheetByName('送迎時間');
  var data = {};
  if (sheet) {
    var current = sheet.getRange('A1').getValue();
    if (current) {
      try { data = JSON.parse(current); } catch(err) { data = {}; }
    }
  }
  // Phase2b: overrides は別シート(送迎時間_overrides)から読み、レスポンスに合成する。
  // 読み手 sched-grid の resolveDay は data.overrides[日付] を見るだけ（無改修）。
  var _ov = _readSchedOverrides();
  if (_ov && Object.keys(_ov).length > 0) { data.overrides = _ov; }
  else if (data.overrides) { delete data.overrides; }
  var json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// 送迎時間データを保存（曜日単位のマージ対応）
// 2026-05-03 routes フィールド対応・特殊キー__ROUTES__ハック廃止
function saveSchedTimes(jsonStr) {
  var parsed = JSON.parse(jsonStr);
  var newData = parsed.data;
  var mergeDay = parsed.day; // マージする曜日（'月','火',...）

  var ss = SpreadsheetApp.openById('1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw');
  var sheet = ss.getSheetByName('送迎時間');
  if (!sheet) {
    sheet = ss.insertSheet('送迎時間');
  }

  // 既存データを読み込み
  var existing = {};
  var current = sheet.getRange('A1').getValue();
  if (current) {
    try { existing = JSON.parse(current); } catch(e) { existing = {}; }
  }
  if (!existing.schedTime) existing.schedTime = {};
  if (!existing.userDays) existing.userDays = {};
  if (!existing.transport) existing.transport = {};
  if (!existing.routes) existing.routes = {};

  // 旧ハック由来の特殊キー（__ROUTES_*__）を schedTime から除去
  for (var k in existing.schedTime) {
    if (k && k.indexOf('__ROUTES_') === 0) {
      delete existing.schedTime[k];
    }
  }

  if (mergeDay) {
    // ── ② 空ガード（2026-06-26 Phase1 / design: 送迎時間一覧 日付キー化A案 §4-2②）──
    // その曜日の新データが実質空（routesにstopsを持つルートが1件も無く、かつ
    // schedTimeに該当曜日のエントリが1件も無い）なら、既存を一切クリアせず即return。
    // 半端な/空のペイロードが届いた際に、その曜日の既存データを delete だけして
    // 消す“サイレント消失”を防ぐ。lastSyncも更新しない（鮮度バーに偽の更新を出さない）。
    var _ndRoutes = (newData && newData.routes && newData.routes[mergeDay]) || null;
    var _hasRoutes = false;
    if (_ndRoutes) {
      ['am', 'pm'].forEach(function(ap) {
        ['pick', 'drop'].forEach(function(tp) {
          var arr = _ndRoutes[ap] && _ndRoutes[ap][tp];
          if (Array.isArray(arr)) {
            for (var _i = 0; _i < arr.length; _i++) {
              var st = arr[_i] && arr[_i].stops;
              if (Array.isArray(st) && st.length > 0) { _hasRoutes = true; break; }
            }
          }
        });
      });
    }
    var _hasSched = false;
    if (newData && newData.schedTime) {
      for (var _n in newData.schedTime) {
        if (newData.schedTime[_n] && newData.schedTime[_n][mergeDay]) { _hasSched = true; break; }
      }
    }
    if (!_hasRoutes && !_hasSched) {
      return 'OK(empty-guard: ' + mergeDay + ' skipped, existing preserved)';
    }

    // 送迎連絡: 上書き前の値を退避（旧時間A1引き当て用）。この後 routes[mergeDay] は delete/置換される。
    var _ovPrev = _readSchedOverrides();                    // 上書き前の overrides 全体（同 date の直前値を含む）
    var _existingRoutesBefore = (existing.routes && existing.routes[mergeDay])
      ? JSON.parse(JSON.stringify(existing.routes[mergeDay])) : null; // 上書き前の曜日ベース routes[mergeDay]

    // 曜日単位のマージ: その曜日の既存データをクリアしてから新データを入れる
    // まず既存の全ユーザーからこの曜日のデータを削除
    for (var name in existing.schedTime) {
      if (existing.schedTime[name] && existing.schedTime[name][mergeDay]) {
        delete existing.schedTime[name][mergeDay];
        // 空になったら削除
        if (Object.keys(existing.schedTime[name]).length === 0) {
          delete existing.schedTime[name];
        }
      }
    }
    for (var name in existing.userDays) {
      if (existing.userDays[name] && existing.userDays[name].schedule && existing.userDays[name].schedule[mergeDay]) {
        delete existing.userDays[name].schedule[mergeDay];
        if (Object.keys(existing.userDays[name].schedule).length === 0) {
          delete existing.userDays[name];
        }
      }
    }
    // routes も曜日単位でクリア
    if (existing.routes[mergeDay]) {
      delete existing.routes[mergeDay];
    }

    // 新データをマージ
    for (var name in newData.schedTime) {
      if (!existing.schedTime[name]) existing.schedTime[name] = {};
      for (var day in newData.schedTime[name]) {
        existing.schedTime[name][day] = newData.schedTime[name][day];
      }
    }
    for (var name in newData.userDays) {
      if (!existing.userDays[name]) existing.userDays[name] = { schedule: {} };
      if (!existing.userDays[name].schedule) existing.userDays[name].schedule = {};
      for (var day in newData.userDays[name].schedule) {
        existing.userDays[name].schedule[day] = newData.userDays[name].schedule[day];
      }
    }
    for (var name in newData.transport) {
      existing.transport[name] = newData.transport[name];
    }
    // routes を曜日単位でマージ
    if (newData.routes && newData.routes[mergeDay]) {
      existing.routes[mergeDay] = newData.routes[mergeDay];
    }

    // ── 日付キー化（2026-06-26 Phase2/2b / design A案 §4-1,§4-3）──
    // overrideDate（その日のISO日付）が来たら、曜日ベースとは別に overrides[日付] へ
    // “その日だけ”のルートを保存する。他の日付・他の曜日ベースには一切触れない（巻き戻り根治）。
    // 読み手 sched-grid の resolveDay は overrides[日付] を曜日ベースより優先で読む（実装済み）。
    // Phase2b: overrides は A1 と別シート(送迎時間_overrides)へチャンク分割保存し、A1の5万字上限を回避。
    //          過去日付は読み手が見ないので書き込み時に間引く（_pruneSchedOverrides）。
    // 空ガードと連動: _hasRoutes が false（stops無し）なら overrides を一切いじらず既存日付を保持。
    if (parsed.overrideDate && _hasRoutes) {
      var _ovStore = _readSchedOverrides();
      var _ovRoutes = (newData.routes && newData.routes[mergeDay])
        ? newData.routes[mergeDay]
        : { am: { pick: [], drop: [] }, pm: { pick: [], drop: [] } };
      var _ovEntry = { routes: _ovRoutes, weekday: mergeDay, savedAt: new Date().toISOString() };
      // members（徒歩/家族の判定用）は来ていれば保存。無ければ resolveDay が曜日ベースへフォールバック
      if (newData.members && typeof newData.members === 'object') _ovEntry.members = newData.members;
      _ovStore[parsed.overrideDate] = _ovEntry;
      _pruneSchedOverrides(_ovStore); // 過去日付・不正キーを間引き（A1肥大防止）
      _writeSchedOverrides(_ovStore);

      // === 新規: 変更色ON の迎え(pick)を台帳へ「要連絡」で追記（②自動トリガー）===
      // 実データ形: newData.routes[mergeDay].{am,pm}.pick[*].stops[*] = {user, time, timeChanged}
      // AM/PM ロスレス（社長要件・先勝ち禁止）: timeChanged のある pick を AM/PM 全部拾い、
      //   利用者ごとに changes=[{slot,old,new}] を束ねて (適用日,利用者) の1行に追記。
      // 旧時間源: 上書き前の同キー override（_ovPrev）→ 無ければ上書き前の曜日ベース（_existingRoutesBefore）。
      (function _appendNeedContactRows() {
        var _latest = _readSchedContactLatest();
        var _ovPrevRoutes = (_ovPrev && _ovPrev[parsed.overrideDate] && _ovPrev[parsed.overrideDate].routes) || null;

        // 指定スロット(am/pm)の pick stops を {user: time} に畳む小ヘルパ（旧時間の引き当て用）
        function pickTimesOfSlot(routesForDay, ap) {
          var m = {};
          var lanes = routesForDay && routesForDay[ap] && routesForDay[ap].pick;
          if (!Array.isArray(lanes)) return m;
          lanes.forEach(function(lane) {
            var stops = lane && lane.stops;
            if (!Array.isArray(stops)) return;
            stops.forEach(function(st) {
              if (st && st.user && m[st.user] == null && st.time) m[st.user] = String(st.time);
            });
          });
          return m;
        }

        // 今回保存した override の pick stops を走査し、timeChanged の迎えを利用者ごとに集約
        var savedRoutes = _ovRoutes;                          // = newData.routes[mergeDay]
        var byUser = {};                                      // user -> [{slot,old,new}]
        ['am', 'pm'].forEach(function(ap) {
          var slotLabel = (ap === 'am') ? '午前' : '午後';
          var prevOvSlot = pickTimesOfSlot(_ovPrevRoutes, ap);
          var baseSlot = pickTimesOfSlot(_existingRoutesBefore, ap);
          var lanes = savedRoutes && savedRoutes[ap] && savedRoutes[ap].pick;
          if (!Array.isArray(lanes)) return;
          lanes.forEach(function(lane) {
            var stops = lane && lane.stops;
            if (!Array.isArray(stops)) return;
            stops.forEach(function(st) {
              if (!st || !st.user || !st.timeChanged) return;
              var oldTime = resolveOldTime(prevOvSlot[st.user] || '', baseSlot[st.user] || '');
              if (!byUser[st.user]) byUser[st.user] = [];
              byUser[st.user].push({ slot: slotLabel, old: oldTime, new: String(st.time || '') });
            });
          });
        });

        // 利用者ごとに1行 追記（重複ガード＝同キー最新が要連絡かつ changes 完全一致なら skip）
        Object.keys(byUser).forEach(function(user) {
          var changes = byUser[user];
          var key = parsed.overrideDate + '|' + user;
          var cur = _latest[key];
          if (cur && cur.status === '要連絡' && JSON.stringify(cur.changes || []) === JSON.stringify(changes)) return;
          _appendSchedContactRow({
            date: parsed.overrideDate, user: user, status: '要連絡', source: '出勤送迎表', changes: changes
          });
        });
      })();
    }
  } else {
    // 全データ上書き（一括同期用）
    existing = newData;
    if (!existing.routes) existing.routes = {};
  }

  // overrides は別シート管理に移行済み。A1には絶対に持たせない（旧データ/全置換経由の混入も除去）
  if (existing.overrides) delete existing.overrides;

  existing.lastSync = new Date().toISOString();
  sheet.getRange('A1').setValue(JSON.stringify(existing));
  return 'OK';
}

// ═══════════════════════════════════════════════════════════
// 送迎時間 overrides（日付キー）専用ストア（2026-06-26 Phase2b）
// A1の5万字上限を回避するため overrides を別シートにチャンク分割保存する。
// 出勤送迎表データの _readOpsMulti/_writeOpsMulti と同方式（45k分割）。
// 読み手 sched-grid は getSchedTimesResponse が合成した data.overrides を見るだけ（無改修）。
// ═══════════════════════════════════════════════════════════
const SCHED_OVERRIDES_SHEET_ID = '1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw';
const SCHED_OVERRIDES_SHEET = '送迎時間_overrides';
const SCHED_OVERRIDES_CHUNK_SIZE = 45000;

function _readSchedOverrides() {
  var ss = SpreadsheetApp.openById(SCHED_OVERRIDES_SHEET_ID);
  var sheet = ss.getSheetByName(SCHED_OVERRIDES_SHEET);
  if (!sheet) return {};
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) return {};
  var values = sheet.getRange(1, 1, lastRow, 1).getValues();
  var joined = values.map(function(r){ return r[0] || ''; }).join('');
  if (!joined) return {};
  try { return JSON.parse(joined); } catch (e) { return {}; }
}

function _writeSchedOverrides(obj) {
  var ss = SpreadsheetApp.openById(SCHED_OVERRIDES_SHEET_ID);
  var sheet = ss.getSheetByName(SCHED_OVERRIDES_SHEET);
  if (!sheet) sheet = ss.insertSheet(SCHED_OVERRIDES_SHEET);
  var jsonStr = JSON.stringify(obj || {});
  var chunks = [];
  for (var i = 0; i < jsonStr.length; i += SCHED_OVERRIDES_CHUNK_SIZE) {
    chunks.push(jsonStr.substring(i, i + SCHED_OVERRIDES_CHUNK_SIZE));
  }
  if (chunks.length === 0) chunks.push('');
  var oldLastRow = sheet.getLastRow();
  if (oldLastRow > chunks.length) {
    sheet.getRange(chunks.length + 1, 1, oldLastRow - chunks.length, 1).clearContent();
  }
  sheet.getRange(1, 1, chunks.length, 1).setValues(chunks.map(function(c){ return [c]; }));
}

// 過去日付（< 今日 Asia/Tokyo）と日付形式でないキーを除去。読み手は未来日しか見ないので安全。
function _pruneSchedOverrides(ov) {
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  for (var d in ov) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < today) delete ov[d];
  }
  return ov;
}

// POST受け取り
function doPost(e) {
  try {
    var jsonStr = e.postData.contents;
    var parsed = JSON.parse(jsonStr);

    // === 送迎日誌イレギュラー送迎切替 (2026-05-09追加) ===
    if (parsed.action === 'setSougeiType') {
      return _sougeiJsonResponse(setSougeiType(parsed));
    }

    // 送迎時間の同期
    if (parsed.action === 'saveSchedTimes') {
      saveSchedTimes(jsonStr);
      return ContentService.createTextOutput('OK');
    }

    // 送迎連絡「連絡済み」記録（2026-07 追加）
    if (parsed.action === 'markSchedContacted') {
      return ContentService.createTextOutput(JSON.stringify(markSchedContacted(parsed)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // シフトから出勤＆送迎表反映 (2026-05-01追加)
    if (parsed.action === 'apply_shift_data' || parsed.type === 'apply_shift_data') {
      var result = applyShiftData(parsed);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 出勤＆送迎表のクラウド同期（従来処理）
    saveToNisshiSheet(jsonStr);
    return ContentService.createTextOutput('OK');
  } catch(err) {
    return ContentService.createTextOutput('NG: ' + err.message);
  }
}

// =============================================
// シフトから出勤＆送迎表反映 (2026-05-01追加)
// =============================================

// シフトコードの時刻文字列を朝/昼/夕方の開始時刻にパース
// 例: "08:00-09:00 / 12:00-13:30" → {am:"08:00", mid:"12:00", pm:""}
function parseEscortSlots(timeStr) {
  var result = { am: "", mid: "", pm: "" };
  if (!timeStr) return result;
  var parts = String(timeStr).split('/').map(function(s) { return s.trim(); });
  parts.forEach(function(part) {
    var m = part.match(/^(\d{1,2}):(\d{2})-/);
    if (!m) return;
    var hh = parseInt(m[1], 10);
    var mm = parseInt(m[2], 10);
    var startStr = (hh < 10 ? '0' + hh : String(hh)) + ':' + (mm < 10 ? '0' + mm : String(mm));
    var totalMinutes = hh * 60 + mm;
    if (totalMinutes < 11 * 60) {
      if (!result.am) result.am = startStr;
    } else if (totalMinutes <= 14 * 60) {
      if (!result.mid) result.mid = startStr;
    } else {
      if (!result.pm) result.pm = startStr;
    }
  });
  return result;
}

// スタッフ名の正規化（trim＋空白除去）
function normalizeStaffName(name) {
  if (!name) return '';
  var s = String(name).trim();
  s = s.replace(/\s+/g, '').replace(/　/g, '');
  return s;
}

// シフトデータを既存 dailyOps に空欄補完で反映
// payload = {month: "2026-05", shifts: {date: {staffName: {code, time, category}}}}
function applyShiftData(payload) {
  if (!payload || !payload.shifts) {
    return { success: false, error: 'shifts データなし' };
  }

  var ss = SpreadsheetApp.openById('1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw');
  var sheet = ss.getSheetByName('出勤送迎表データ');
  if (!sheet) {
    return { success: false, error: '出勤送迎表データシートが見つかりません' };
  }

  var ops = {};
  var current = sheet.getRange('A1').getValue();
  if (current) {
    try { ops = JSON.parse(current); } catch(e) { ops = {}; }
  }
  if (!ops.dailyOps) ops.dailyOps = {};

  var results = {
    applied: [],
    skipped: [],
    unmatched_staff: {},
    total_filled: 0,
    total_skipped: 0
  };

  Object.keys(payload.shifts).forEach(function(date) {
    var dayShifts = payload.shifts[date];
    if (!ops.dailyOps[date]) ops.dailyOps[date] = { date: date };
    var dayOps = ops.dailyOps[date];
    if (!dayOps.attendance) dayOps.attendance = [];
    if (!dayOps.sendStaff) dayOps.sendStaff = [];
    if (!dayOps.staffAbsent) dayOps.staffAbsent = {};

    var filledCount = 0;
    var skippedCount = 0;

    Object.keys(dayShifts).forEach(function(staffName) {
      var entry = dayShifts[staffName];
      if (!entry || !entry.category) return;
      var nname = normalizeStaffName(staffName);

      if (entry.category === 'full' || entry.category === 'short' || entry.category === 'half-leave') {
        var idx = -1;
        for (var i = 0; i < dayOps.attendance.length; i++) {
          if (normalizeStaffName(dayOps.attendance[i].name) === nname) { idx = i; break; }
        }
        if (idx >= 0) {
          if (dayOps.attendance[idx].time) { skippedCount++; return; }
          dayOps.attendance[idx].time = entry.time;
        } else {
          dayOps.attendance.push({ name: staffName, time: entry.time });
        }
        filledCount++;
      } else if (entry.category === 'escort') {
        var slots = parseEscortSlots(entry.time);
        var idx = -1;
        for (var i = 0; i < dayOps.sendStaff.length; i++) {
          if (normalizeStaffName(dayOps.sendStaff[i].name) === nname) { idx = i; break; }
        }
        if (idx < 0) {
          dayOps.sendStaff.push({ name: staffName, am: slots.am, mid: slots.mid, pm: slots.pm });
          filledCount++;
        } else {
          var s = dayOps.sendStaff[idx];
          var anyFilled = false;
          ['am', 'mid', 'pm'].forEach(function(k) {
            if (slots[k] && !s[k]) { s[k] = slots[k]; anyFilled = true; }
          });
          if (anyFilled) filledCount++;
          else skippedCount++;
        }
      } else if (entry.category === 'off' || entry.category === 'leave') {
        if (dayOps.staffAbsent[staffName]) { skippedCount++; return; }
        dayOps.staffAbsent[staffName] = {
          reason: entry.code === '休' ? 'シフト休' : 'シフト有給'
        };
        filledCount++;
      }
    });

    if (filledCount > 0) {
      results.applied.push({ date: date, count: filledCount });
      results.total_filled += filledCount;
    }
    results.total_skipped += skippedCount;
    if (filledCount === 0 && skippedCount > 0) {
      results.skipped.push({ date: date, count: skippedCount });
    }
  });

  // 書き戻し
  ops.lastSaved = new Date().toISOString();
  ops.type = 'yawaragi_daily_ops';
  sheet.getRange('A1').setValue(JSON.stringify(ops));

  results.success = true;
  results.message = '反映: ' + results.total_filled + 'セル / スキップ: ' + results.total_skipped + 'セル';
  return results;
}

// ═══════════════════════════════════════════════════════════
// 送迎日誌イレギュラー送迎切替 API（2026-05-09追加）
// 設計: docs/superpowers/specs/2026-05-08-送迎日誌-イレギュラー送迎切替-design.md
// プラン: docs/superpowers/plans/2026-05-08-送迎日誌-イレギュラー送迎切替.md
//
// 注意:
//   既存の saveToNisshiSheet / getDailyOpsResponse は A1単一セル読書きで動作中。
//   本APIは大容量対応のため複数セル分割で読書きするヘルパ (_readOpsMulti / _writeOpsMulti) を使う。
//   送迎日誌HTML側は別GAS (AKfycbyh_h7qB...) の readOpsData 経由で複数セル分割を読み出して反映する。
// ═══════════════════════════════════════════════════════════

const SOUGEI_SHEET_ID = '1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw';
const SOUGEI_OPS_SHEET = '出勤送迎表データ';
const SOUGEI_LOG_SHEET = '送迎変更ログ';
const SOUGEI_NOTIFICATION_EMAIL = 'yawaragi.notify@gmail.com';
const SOUGEI_OPS_CHUNK_SIZE = 45000;

function _sougeiJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _readOpsMulti() {
  var ss = SpreadsheetApp.openById(SOUGEI_SHEET_ID);
  var sheet = ss.getSheetByName(SOUGEI_OPS_SHEET);
  if (!sheet) return '';
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) return '';
  if (lastRow === 1) return String(sheet.getRange('A1').getValue() || '');
  var values = sheet.getRange(1, 1, lastRow, 1).getValues();
  return values.map(function(r){ return r[0] || ''; }).join('');
}

function _writeOpsMulti(jsonStr) {
  var ss = SpreadsheetApp.openById(SOUGEI_SHEET_ID);
  var sheet = ss.getSheetByName(SOUGEI_OPS_SHEET);
  if (!sheet) sheet = ss.insertSheet(SOUGEI_OPS_SHEET);
  var chunks = [];
  for (var i = 0; i < jsonStr.length; i += SOUGEI_OPS_CHUNK_SIZE) {
    chunks.push(jsonStr.substring(i, i + SOUGEI_OPS_CHUNK_SIZE));
  }
  if (chunks.length === 0) chunks.push('');
  var oldLastRow = sheet.getLastRow();
  if (oldLastRow > chunks.length) {
    sheet.getRange(chunks.length + 1, 1, oldLastRow - chunks.length, 1).clearContent();
  }
  var values = chunks.map(function(c){ return [c]; });
  sheet.getRange(1, 1, chunks.length, 1).setValues(values);
}

function _ensureChangeLogSheet() {
  var ss = SpreadsheetApp.openById(SOUGEI_SHEET_ID);
  var sheet = ss.getSheetByName(SOUGEI_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SOUGEI_LOG_SHEET);
    sheet.getRange(1, 1, 1, 8).setValues([[
      '操作日時', '対象日', '利用者', '単位', '変更前', '変更後', '操作者', '変更元'
    ]]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 110);
    sheet.setColumnWidth(4, 60);
    sheet.setColumnWidth(5, 80);
    sheet.setColumnWidth(6, 80);
    sheet.setColumnWidth(7, 110);
    sheet.setColumnWidth(8, 110);
  }
  return sheet;
}

function _statusLabel(v) {
  if (v === 'family') return '家族';
  if (v === 'walk') return '徒歩';
  if (v === '' || v == null) return '送迎';
  return v;
}

function _slotLabel(slot){
  if (slot === 'drop') return '送り';
  if (slot === 'pick') return '迎え';
  return '送迎一括';
}

function _appendChangeLog(payload, beforeAfter) {
  var sheet = _ensureChangeLogSheet();
  var unitLabel = payload.unit === 'am' ? '午前' : '午後';
  var slotLabel = _slotLabel(payload.slot || 'both');
  sheet.appendRow([
    new Date(),
    payload.date,
    payload.userId,
    unitLabel + '・' + slotLabel,
    _statusLabel(beforeAfter.before),
    _statusLabel(beforeAfter.after),
    payload.operator,
    payload.source || '送迎日誌'
  ]);
}

function _sendChangeNotification(payload, beforeAfter) {
  var unitLabel = payload.unit === 'am' ? '午前' : '午後';
  var slotLabel = _slotLabel(payload.slot || 'both');
  var subject = '【送迎日誌】' + payload.date + ' ' + payload.userId + 'さん '
              + unitLabel + '・' + slotLabel + ' '
              + _statusLabel(beforeAfter.before) + '→' + _statusLabel(beforeAfter.after)
              + ' (操作者: ' + payload.operator + 'さん)';
  var body = [
    '送迎日誌からイレギュラー送迎切替が行われました。',
    '',
    '◆ 対象日: ' + payload.date,
    '◆ 利用者: ' + payload.userId + 'さん',
    '◆ 単位: ' + unitLabel,
    '◆ 区分: ' + slotLabel,
    '◆ 変更前: ' + _statusLabel(beforeAfter.before),
    '◆ 変更後: ' + _statusLabel(beforeAfter.after),
    '◆ 操作者: ' + payload.operator + 'さん',
    '◆ 操作時刻: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    '◆ 変更元: ' + (payload.source || '送迎日誌')
  ].join('\n');
  GmailApp.sendEmail(SOUGEI_NOTIFICATION_EMAIL, subject, body, { charset: 'UTF-8' });
}

/**
 * 送迎タイプ単発更新（送迎日誌からスタッフが操作）
 * @param {Object} payload
 *   - action: 'setSougeiType'
 *   - date: 'YYYY-MM-DD'
 *   - userId: 利用者名（normalize後）
 *   - unit: 'am' | 'pm'
 *   - slot: 'drop' | 'pick' | 'both'（省略時'both'＝半日一括）2026-05-14追加
 *   - value: 'family' | '' | 'walk'
 *   - operator: 操作者名
 *   - source: '送迎日誌' | '出勤＆送迎表'
 * @return {Object} { success, before?, after?, updatedAt?, error? }
 */
function setSougeiType(payload) {
  try {
    if (!payload.date || !payload.userId || !payload.unit || payload.value === undefined || !payload.operator) {
      return { success: false, error: '必須パラメータ不足 (date/userId/unit/value/operator)' };
    }
    if (['am', 'pm'].indexOf(payload.unit) < 0) {
      return { success: false, error: 'unit不正: ' + payload.unit + '（am|pm のみ）' };
    }
    var slot = payload.slot || 'both';
    if (['drop', 'pick', 'both'].indexOf(slot) < 0) {
      return { success: false, error: 'slot不正: ' + slot + '（drop|pick|both のみ）' };
    }
    if (['family', '', 'walk'].indexOf(payload.value) < 0) {
      return { success: false, error: 'value不正: ' + payload.value + '（family|空|walk のみ）' };
    }
    var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    if (payload.date < today) {
      return { success: false, error: '過去日は変更できません: ' + payload.date };
    }

    var opsRaw = _readOpsMulti();
    var ops = {};
    if (opsRaw) {
      try { ops = JSON.parse(opsRaw); } catch (e) { ops = {}; }
    }
    if (!ops.dailyOps || !ops.dailyOps[payload.date]) {
      return { success: false, error: '対象日のデータがありません: ' + payload.date };
    }
    var dayData = ops.dailyOps[payload.date];
    if (!dayData[payload.unit]) {
      return { success: false, error: '対象単位がありません: ' + payload.date + '/' + payload.unit };
    }
    if (!dayData[payload.unit].userStatus) {
      dayData[payload.unit].userStatus = {};
    }
    if (!dayData[payload.unit].userStatusBySlot) {
      dayData[payload.unit].userStatusBySlot = {};
    }

    var statusObj = dayData[payload.unit].userStatus;       // 半日単位の現状値
    var slotObj = dayData[payload.unit].userStatusBySlot;   // slot個別オーバーライド
    var halfVal = statusObj[payload.userId] || '';

    // before の取得（slot個別優先・無ければ半日値）
    var before;
    if (slot === 'both') {
      before = halfVal;
    } else if (slotObj[payload.userId] && slotObj[payload.userId][slot] !== undefined) {
      before = slotObj[payload.userId][slot];
    } else {
      before = halfVal;
    }
    var after = payload.value;

    // 書込
    if (slot === 'both') {
      // 半日一括: 個別オーバーライドをクリアして半日値だけ更新
      if (after === '') {
        delete statusObj[payload.userId];
      } else {
        statusObj[payload.userId] = after;
      }
      delete slotObj[payload.userId];
    } else {
      // slot個別: 半日値はそのまま、個別オーバーライドに書く
      if (!slotObj[payload.userId]) slotObj[payload.userId] = {};
      slotObj[payload.userId][slot] = after;
      // クリーンアップ: drop/pick が両方とも同値になったら半日値に統合してオーバーライド削除
      var dropV = slotObj[payload.userId].drop !== undefined ? slotObj[payload.userId].drop : halfVal;
      var pickV = slotObj[payload.userId].pick !== undefined ? slotObj[payload.userId].pick : halfVal;
      if (dropV === pickV) {
        if (dropV === '') {
          delete statusObj[payload.userId];
        } else {
          statusObj[payload.userId] = dropV;
        }
        delete slotObj[payload.userId];
      }
    }

    dayData._lastModified = Date.now();
    ops.lastSaved = new Date().toISOString();
    ops.type = 'yawaragi_daily_ops';
    _writeOpsMulti(JSON.stringify(ops));

    try { _appendChangeLog(payload, { before: before, after: after }); } catch(e) { Logger.log('appendChangeLog failed: ' + e); }
    try { _sendChangeNotification(payload, { before: before, after: after }); } catch(e) { Logger.log('sendChangeNotification failed: ' + e); }

    return {
      success: true,
      before: before,
      after: after,
      slot: slot,
      updatedAt: new Date().toISOString()
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ──── テスト用関数（GASエディタから手動実行） ────

function testEnsureLog() {
  var sheet = _ensureChangeLogSheet();
  Logger.log('Sheet: ' + sheet.getName() + ' / rows=' + sheet.getLastRow());
}

function testReadOpsMulti() {
  var data = _readOpsMulti();
  Logger.log('Length: ' + (data ? data.length : 0));
  Logger.log('First 200: ' + (data ? data.substring(0, 200) : '(empty)'));
}

// ═══════════════════════════════════════════════════════════
// 中止管理タブ連動API (2026-05-14追加)
// 設計: docs/superpowers/specs/2026-05-10-中止管理タブ連動-design.md
// プラン: docs/superpowers/plans/2026-05-14-中止管理タブ連動-出勤送迎表.md
//
// 既存doGet（配列を直接返却）とは別形式：{ members: [...], asOfDate, appType }
// displayMode で見せ方を制御（normal | grayed | hidden）
//
// 呼び出し例:
//   ?action=getMembersForApp&appType=attendance&asOfDate=2026-05-14
//   ?action=getMembersForApp&appType=history&asOfDate=2026-04-01
// ═══════════════════════════════════════════════════════════

// ===== 利用曜日予約の解決（2026-05-31 追加）=====
// 予約の源は「利用者イベント」シートの usage_days_change（metadata.newDays/effectiveDate/appliedToLedger）。
// yawaragi-board の parseNewDaysToLedger_ と同一実装（GAS間ファイル分離のため二重持ち）。
function parseNewDaysToLedger_(newDays) {
  var WD = ['月', '火', '水', '木', '金', '土'];
  var slots = String(newDays || '').split(/[,、・\s]/).filter(String);
  var dayList = [], ampmByDay = {}, hasAmpm = false;
  slots.forEach(function(s) {
    var d = WD.filter(function(x) { return s.indexOf(x) >= 0; })[0];
    if (!d) return;
    if (dayList.indexOf(d) < 0) dayList.push(d);
    var ap = s.indexOf('午前') >= 0 ? '午前' : (s.indexOf('午後') >= 0 ? '午後' : '');
    if (ap) { hasAmpm = true; if (!ampmByDay[d]) ampmByDay[d] = []; if (ampmByDay[d].indexOf(ap) < 0) ampmByDay[d].push(ap); }
  });
  var days = WD.filter(function(d) { return dayList.indexOf(d) >= 0; }).join('');
  var ampm = '';
  if (hasAmpm) {
    var dwa = WD.filter(function(d) { return ampmByDay[d]; });
    var allAps = [];
    dwa.forEach(function(d) { ampmByDay[d].forEach(function(a) { if (allAps.indexOf(a) < 0) allAps.push(a); }); });
    var allSingle = dwa.every(function(d) { return ampmByDay[d].length === 1; });
    if (allSingle && allAps.length === 1) ampm = allAps[0];
    else if (dwa.every(function(d) { return ampmByDay[d].length === 2; })) ampm = '午前午後';
    else ampm = dwa.map(function(d) { return ampmByDay[d].map(function(a) { return d + a; }).join('、'); }).join('、');
  }
  return { days: days, ampm: ampm };
}

// events: 「利用者イベント」シートの全行配列（固定列 1:eventType 2:userName 4:metadata）
// userName と asOfYmd("YYYY-MM-DD") から、適用すべき {days, ampm} を返す。無ければ null。
function resolveReservedDow_(events, userName, asOfYmd) {
  if (!events || !events.length) return null;
  var best = null;
  for (var i = 0; i < events.length; i++) {
    var row = events[i];
    if (String(row[1]).trim() !== 'usage_days_change') continue;
    if (String(row[2]).trim() !== userName) continue;
    var meta;
    try { meta = JSON.parse(row[4] || '{}'); } catch (e) { continue; }
    if (meta.appliedToLedger) continue;
    var eff = String(meta.effectiveDate || '').trim();
    if (!eff || eff > asOfYmd) continue;
    var newDays = String(meta.newDays || '').trim();
    if (!newDays) continue;
    if (!best || eff > best.eff) best = { eff: eff, newDays: newDays };
  }
  if (!best) return null;
  return parseNewDaysToLedger_(best.newDays);
}

function handleGetMembersForApp(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var appType = (e && e.parameter && e.parameter.appType) ? e.parameter.appType : 'attendance';
  var asOfDateStr = (e && e.parameter && e.parameter.asOfDate) ? e.parameter.asOfDate : '';

  try {
    var ss = SpreadsheetApp.openById('1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0');
    var sheet = ss.getSheetByName('利用者台帳');
    if (!sheet) return _membersResp({ error: 'シートが見つかりません' }, callback);

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return _membersResp({ members: [] }, callback);

    var headers = data[0];
    var col = {};
    for (var i = 0; i < headers.length; i++) {
      col[String(headers[i]).trim()] = i;
    }
    function findCol() {
      for (var i = 0; i < arguments.length; i++) {
        if (col[arguments[i]] !== undefined) return col[arguments[i]];
      }
      return -1;
    }
    function findColPartial(keyword) {
      for (var k in col) {
        if (k.indexOf(keyword) >= 0) return col[k];
      }
      return -1;
    }

    var nameC = findCol('氏名', '名前');
    var kanaC = findCol('氏名（カナ）', 'カナ', 'フリガナ', 'ふりがな');
    var dowC = findCol('曜日', '利用曜日');
    var ampmC = findCol('午前午後', 'AM/PM', '利用時間帯', '午前/午後');
    var bdC = findCol('誕生日', '生年月日');
    var psC = findCol('計画書開始', '計画書開始月');
    var stC = findCol('利用ステータス');
    var sdC = findCol('利用開始日');
    var edC = findColPartial('利用終了');
    if (edC < 0) edC = findColPartial('終了日');
    if (nameC < 0) nameC = 0;

    // asOfDate を Date に変換（省略時は今日）
    var asOfDate;
    if (asOfDateStr) {
      var am = asOfDateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (am) {
        asOfDate = new Date(parseInt(am[1]), parseInt(am[2]) - 1, parseInt(am[3]));
      } else {
        asOfDate = new Date();
        asOfDate.setHours(0, 0, 0, 0);
      }
    } else {
      asOfDate = new Date();
      asOfDate.setHours(0, 0, 0, 0);
    }
    var asOfDateOut = Utilities.formatDate(asOfDate, 'Asia/Tokyo', 'yyyy-MM-dd');

    // 利用曜日予約（usage_days_change）を1回だけ読み込む（同一ブック内・固定列）
    var reservedEvents = [];
    try {
      var evSheet = ss.getSheetByName('利用者イベント');
      if (evSheet && evSheet.getLastRow() >= 2) {
        reservedEvents = evSheet.getDataRange().getValues();
      }
    } catch (e) { reservedEvents = []; }

    var members = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      var name = String(r[nameC] || '').trim();
      if (!name) continue;

      var status = stC >= 0 ? String(r[stC] || '').trim() : '';
      var kana = kanaC >= 0 ? String(r[kanaC] || '').trim() : '';

      var u = { name: name };
      if (kana) u.kana = kana;
      u.status = status;
      if (dowC >= 0) u.dow = String(r[dowC] || '');
      if (ampmC >= 0) u.ampm = String(r[ampmC] || '');
      // 利用曜日予約: effectiveDate <= asOfDate の未適用 usage_days_change があれば上書き
      var reserved = resolveReservedDow_(reservedEvents, name, asOfDateOut);
      if (reserved) {
        if (reserved.days) u.dow = reserved.days;
        if (reserved.ampm) u.ampm = reserved.ampm;
        u.reservedApplied = true; // デバッグ・検証用フラグ（出勤送迎表側は無視してよい）
      }

      if (bdC >= 0 && r[bdC]) {
        var bd = r[bdC];
        if (bd instanceof Date) {
          u.birthday = (bd.getMonth() + 1) + '/' + bd.getDate();
        } else {
          u.birthday = String(bd);
        }
      }
      if (psC >= 0 && r[psC]) {
        var ps = r[psC];
        if (ps instanceof Date) {
          u.planStart = ps.getMonth() + 1;
        } else {
          var pm = String(ps).match(/(\d+)/);
          if (pm) u.planStart = parseInt(pm[1]);
        }
      }
      if (sdC >= 0 && r[sdC]) {
        var sd = r[sdC];
        if (sd instanceof Date) {
          u.startDate = Utilities.formatDate(sd, 'Asia/Tokyo', 'yyyy-MM-dd');
        } else {
          var sds = String(sd).trim();
          var dm = sds.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
          if (dm) u.startDate = dm[1] + '-' + String(dm[2]).padStart(2,'0') + '-' + String(dm[3]).padStart(2,'0');
        }
      }

      // 利用終了日を Date に変換（空欄は null）
      var endDate = null;
      var endDateStr = '';
      if (edC >= 0 && r[edC]) {
        var ev = r[edC];
        if (ev instanceof Date) {
          endDate = new Date(ev.getFullYear(), ev.getMonth(), ev.getDate());
          endDateStr = Utilities.formatDate(endDate, 'Asia/Tokyo', 'yyyy-MM-dd');
        } else {
          var es = String(ev).trim();
          var em = es.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
          if (em) {
            endDate = new Date(parseInt(em[1]), parseInt(em[2]) - 1, parseInt(em[3]));
            endDateStr = em[1] + '-' + String(em[2]).padStart(2, '0') + '-' + String(em[3]).padStart(2, '0');
          }
        }
      }
      u.endDate = endDateStr || null;

      // displayMode 判定
      // 注意: 利用者台帳の「利用終了日」列は介護保険有効期限が入っており、
      //       設計書が想定した「最終利用日」とは別運用のため endDate での
      //       境界日判定は信頼できない。
      // - attendance: 中止フラグのみで hidden。過去日付の保護は出勤送迎表側の
      //               syncWithTransportSchedule が「今日以降のみ動作」のため
      //               既に効いており、保存済みデータは破壊されない。
      // - history: endDate が「最終利用日」として運用されている場合のみ境界判定。
      //            未運用ならステータスだけで grayed。
      //            （口腔・体重チェック実装時に運用と擦り合わせる）
      var displayMode;
      var isEnded = (status === '終了' || status === '休止' || status === '中止' || status === '卒業');
      var isActiveOn;
      if (!isEnded) {
        displayMode = 'normal';
        isActiveOn = true;
      } else if (appType === 'attendance') {
        displayMode = 'hidden';
        isActiveOn = false;
      } else {
        // history
        if (endDate && asOfDate <= endDate) {
          displayMode = 'normal';
          isActiveOn = true;
        } else {
          displayMode = 'grayed';
          isActiveOn = false;
        }
      }
      u.displayMode = displayMode;
      u.isActiveOn = isActiveOn;

      members.push(u);
    }

    members.sort(function(a, b) {
      var sa = a.kana || a.name;
      var sb = b.kana || b.name;
      return sa.localeCompare(sb, 'ja');
    });

    return _membersResp({ members: members, asOfDate: asOfDateOut, appType: appType }, callback);

  } catch (err) {
    return _membersResp({ error: err.toString() }, callback);
  }
}

function _membersResp(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== 送迎連絡台帳: 純関数群（Node で test-sched-renrakuzumi.js が実コード抽出して検証）=====
// 台帳の全行から (適用日|利用者) キーごとの最新行を導出（記録日時 文字列比較で最新勝ち）。
// rows: [{recordedAt, date, user, oldTime, newTime, status, operator, contactedAt, source}, ...]
function schedContactLatest(rows) {
  var map = {};
  (rows || []).forEach(function(r) {
    if (!r || !r.date || !r.user) return;
    var key = r.date + '|' + r.user;
    var prev = map[key];
    if (!prev || String(r.recordedAt) > String(prev.recordedAt)) map[key] = r;
  });
  return map;
}

// 色判定: その stop の変更色ON(timeChanged) と 台帳最新 status から一覧の色を返す。
// timeChanged: boolean（override の stop の timeChanged）
// latestStatus: '要連絡'|'連絡済み'|'通常化'|null
// 戻り値: 'normal'（通常）| 'need'（色A=要連絡）| 'done'（色B=連絡済み）
function schedContactColor(timeChanged, latestStatus) {
  if (!timeChanged) return 'normal';         // 色の起点は timeChanged。E1の色OFFもここで通常化
  if (latestStatus === '連絡済み') return 'done';
  return 'need';
}

// markSchedContacted 受信時の二重押し対策: 最新が既に連絡済みなら追記しない。
function schedContactShouldSkip(latestStatus) {
  return latestStatus === '連絡済み';
}

// A1: 旧時間 = 直前override時刻 ?? 曜日ベース時刻 ?? ''（引けなければ空欄。事実＝新時間・要連絡は残す）。
function resolveOldTime(prevOverrideTime, weekdayBaseTime) {
  if (prevOverrideTime) return String(prevOverrideTime);
  if (weekdayBaseTime) return String(weekdayBaseTime);
  return '';
}

// ===== 送迎連絡台帳（append-only・prune対象外の正本）=====
// 列11「変更詳細」= AM/PM ロスレスの [{slot,old,new}] JSON（社長要件・先勝ち禁止）
var SCHED_CONTACT_SS_ID = '1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw'; // データSS（送迎時間と同一）
var SCHED_CONTACT_SHEET = '送迎連絡台帳';
var SCHED_CONTACT_HEADERS = ['記録日時','適用日','利用者','時間帯','旧時間','新時間','status','連絡者','連絡日時','source','変更詳細'];

function _ensureSchedContactSheet() {
  var ss = SpreadsheetApp.openById(SCHED_CONTACT_SS_ID);
  var sheet = ss.getSheetByName(SCHED_CONTACT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SCHED_CONTACT_SHEET);
    sheet.getRange(1, 1, 1, SCHED_CONTACT_HEADERS.length).setValues([SCHED_CONTACT_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, SCHED_CONTACT_HEADERS.length).setFontWeight('bold');
    // TZ罠回避: 日時列は文字列で書くため書式は既定(テキスト表示)のままでよい
  }
  return sheet;
}

// 台帳の現在状態（キー→最新行）を返す。getSchedTimesResponse と markSchedContacted から使う。
function _readSchedContactLatest() {
  var sheet = _ensureSchedContactSheet();
  if (sheet.getLastRow() < 2) return {};
  var values = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var v = values[i];
    var changes = [];
    try { changes = v[10] ? JSON.parse(String(v[10])) : []; } catch (e) { changes = []; }
    rows.push({
      recordedAt: String(v[0] || ''), date: String(v[1] || ''), user: String(v[2] || ''),
      unit: String(v[3] || ''), oldTime: String(v[4] || ''), newTime: String(v[5] || ''),
      status: String(v[6] || ''), operator: String(v[7] || ''), contactedAt: String(v[8] || ''),
      source: String(v[9] || ''), changes: changes
    });
  }
  return schedContactLatest(rows);
}

// 台帳へ1行 append（TZ罠回避のため時刻は Asia/Tokyo 文字列）。
// row.changes = [{slot,old,new}] があれば列11へ JSON 保存。旧時間/新時間/時間帯は先頭スロットで補完。
function _appendSchedContactRow(row) {
  var sheet = _ensureSchedContactSheet();
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var changes = Array.isArray(row.changes) ? row.changes : [];
  var head = changes[0] || null;
  var unit = row.unit || (head ? head.slot : '') || '';
  var oldTime = (row.oldTime != null && row.oldTime !== '') ? row.oldTime : (head ? head.old : '') || '';
  var newTime = (row.newTime != null && row.newTime !== '') ? row.newTime : (head ? head.new : '') || '';
  sheet.appendRow([
    now, row.date, row.user, unit,
    oldTime, newTime, row.status,
    row.operator || '', row.contactedAt || '', row.source || '',
    changes.length ? JSON.stringify(changes) : ''
  ]);
  return now;
}

// GAS エディタ手動確認用（clasp窓）。
function _test_schedContactSheet() {
  var latest0 = _readSchedContactLatest();
  Logger.log('現在キー数: ' + Object.keys(latest0).length);
  _appendSchedContactRow({ date: '2099-01-01', user: 'テスト太郎', status: '要連絡', source: '出勤送迎表',
    changes: [{ slot: '午前', old: '09:00', new: '09:30' }] });
  var latest1 = _readSchedContactLatest();
  Logger.log('追記後 テスト太郎: ' + JSON.stringify(latest1['2099-01-01|テスト太郎']));
  // 後始末: 台帳末尾のテスト行(2099-01-01)を手動削除すること
}

// 実 overrides を走査し、同一日・同一 user が am/pm 両方の pick に出るケースを数える（読み取り専用）。
// 0 件なら AM/PM 畳み（changes 集約）は落ちる情報ゼロで完全に安全と確定できる（社長要件の確認）。
function _count_amPmPickOverlap() {
  var ov = _readSchedOverrides();
  var overlaps = [];
  Object.keys(ov || {}).forEach(function(date) {
    var routes = ov[date] && ov[date].routes;
    if (!routes) return;
    function usersOf(ap) {
      var set = {};
      var lanes = routes[ap] && routes[ap].pick;
      if (Array.isArray(lanes)) lanes.forEach(function(lane) {
        var stops = lane && lane.stops;
        if (Array.isArray(stops)) stops.forEach(function(st) { if (st && st.user) set[st.user] = true; });
      });
      return set;
    }
    var am = usersOf('am'), pm = usersOf('pm');
    Object.keys(am).forEach(function(u) { if (pm[u]) overlaps.push(date + ' / ' + u); });
  });
  Logger.log('AM/PM 両pick 掛け持ち: ' + overlaps.length + ' 件');
  overlaps.forEach(function(s) { Logger.log('  ' + s); });
  return overlaps;
}

// 連絡済みを台帳へ追記。二重押しは idempotency で吸収（最新が既に連絡済みなら追記せず ok）。
// parsed: { action, date, user, operator, contactedAt?, unit? }
function markSchedContacted(parsed) {
  var date = String(parsed.date || '').trim();
  var user = String(parsed.user || '').trim();
  if (!date || !user) return { ok: false, error: 'date/user 必須' };
  var latest = _readSchedContactLatest();
  var cur = latest[date + '|' + user];
  if (schedContactShouldSkip(cur ? cur.status : null)) {
    return { ok: true, skipped: true };   // 既に連絡済み＝二重行を作らない
  }
  var contactedAt = String(parsed.contactedAt || '') || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  // 連絡済み行は直前の要連絡行の changes（AM/PMロスレス）をそのまま引き継ぐ＝履歴を欠落させない
  _appendSchedContactRow({
    date: date, user: user, unit: parsed.unit || (cur ? cur.unit : ''),
    oldTime: cur ? cur.oldTime : '', newTime: cur ? cur.newTime : '',
    changes: (cur && cur.changes) ? cur.changes : [],
    status: '連絡済み', operator: String(parsed.operator || ''),
    contactedAt: contactedAt, source: '送迎時間一覧'
  });
  return { ok: true };
}
