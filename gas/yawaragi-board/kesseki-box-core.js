// 2026-07-04 指示書③: 本日の欠席連絡ボックスの判定純関数。
// GAS/node 両用（absence-mail-guard-core.js と同じ流儀）。SpreadsheetApp 等の GAS API に依存しないこと。

// 済み判定＝二重送信ガードの唯一の正（クライアント表示とサーバガードの両方がこれを使う）
function kbIsAlreadyNotified_(cmNotified) {
  var v = String(cmNotified || '').trim();
  return v === '送信済' || v === '電話連絡済' || v === '手動メール送信済' ||
         v === 'ケアマネ把握済' || v === '下書き保存' ||
         v.indexOf('連絡済み') === 0;   // 過去日記録: 連絡済み（手段）・Phase4二重送信guard・client kbIsDoneInline_ と同期
}

// absences 配列から「本日の通常欠席」だけを返す（長期休み・他日は除外）
function kbFilterTodayTargets_(absList, todayYMD) {
  return (absList || []).filter(function (a) {
    return a && !a.isLongTerm && String(a.date) === String(todayYMD);
  });
}

// カード分類: kind 'mail'（一括送信対象）| 'phone'（電話フロー）
// メール派でもメアド無し/連絡手段未設定は phone に倒す＝勝手にメールしない
function kbClassifyCard_(info) {
  var method = String((info && info.method) || '').trim();
  var email = String((info && info.email) || '').trim();
  var done = kbIsAlreadyNotified_(info && info.cmNotified);
  var isMail = method.indexOf('メール') >= 0 && email.indexOf('@') >= 0;
  return {
    kind: isMail ? 'mail' : 'phone',
    done: done,
    defaultChecked: isMail && !done
  };
}

// yyyy-mm-dd を delta 日ずらす。ローカル構成子方式（put/readとも局所成分）でUTCずれなし。
function kbAddDaysYMD_(ymd, delta) {
  var p = String(ymd || '').split('-');
  if (p.length !== 3) return String(ymd || '');
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10) + (delta || 0));
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var da = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + da;
}

// epoch(ms) の JST カレンダー日を yyyy-mm-dd で返す。時刻を引数化して境界テスト可能に。
// ★方式: Intl.DateTimeFormat(timeZone:'Asia/Tokyo') 系で取得（既存 jstTodayStr() と同系統）。
//   +9h手計算にしない（DST/うるう秒等の将来の穴を避け、TZ権威に委ねる）。
function kbJstYmdFromEpoch_(epochMs) {
  var parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(epochMs));
  var g = function (t) { var x = parts.find(function (e) { return e.type === t; }); return x ? x.value : ''; };
  return g('year') + '-' + g('month') + '-' + g('day');
}

// 今日以降の通常欠席の date を distinct・昇順で返す（機能Bジャンプ一覧）。
function kbUpcomingAbsenceDates_(absList, todayYMD) {
  var seen = {}, out = [];
  (absList || []).forEach(function (a) {
    if (!a || a.isLongTerm) return;
    var d = String(a.date || '');
    if (!d || d < String(todayYMD)) return;
    if (seen[d]) return;
    seen[d] = true;
    out.push(d);
  });
  out.sort();
  return out;
}

// 2ソースをマージ・dedup。key=name|date|unit。primary(前進窓GET)を正本、secondaryは未登録キーのみ補完。
function kbMergeDedupAbs_(primaryList, secondaryList) {
  var out = [], seen = {};
  function key(a) { return String(a.name || '') + '|' + String(a.date || '') + '|' + String(a.unit || ''); }
  (primaryList || []).forEach(function (a) {
    if (!a) return;
    var k = key(a);
    if (seen[k]) return;
    seen[k] = true; out.push(a);
  });
  (secondaryList || []).forEach(function (a) {
    if (!a) return;
    var k = key(a);
    if (seen[k]) return;
    seen[k] = true; out.push(a);
  });
  return out;
}

// 表示対象日が当日か（両引数ともJST基準の yyyy-mm-dd を渡す前提）。null/undefinedでも例外を投げずfalse。
function kbIsViewToday_(viewYMD, todayYMD) {
  return String(viewYMD || '') === String(todayYMD || '');
}

function kbUnitGroup_(unit) {
  var u = String(unit == null ? '' : unit);
  if (u.indexOf('午前') >= 0) return 'am';
  return 'pm';   // 午後・終日・空・不明はPM群へ（害なき防御: カードを消さない。同一日AM/PM併用者は存在しない前提）
}

function kbIsOkResponse_(resp) {
  return !!(resp && resp.absences && Array.isArray(resp.absences.absences));
}
// kbLoad の描画判断（純関数）。resp=absences応答(失敗時null)、todayYMD=本日、firstLoad=まだ成功表示していないか。
// preserve: 失敗/空 かつ 既存表示あり→触らない ／ errored: 失敗 かつ 初回 ／ empty: 成功0件（"欠席なし"OK唯一） ／ list: 成功N件
function kbDecideLoad_(resp, todayYMD, firstLoad) {
  if (!kbIsOkResponse_(resp)) {
    return { outcome: firstLoad ? 'errored' : 'preserve', targets: [] };
  }
  var targets = kbFilterTodayTargets_(resp.absences.absences, todayYMD);
  return { outcome: targets.length ? 'list' : 'empty', targets: targets };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    kbIsAlreadyNotified_: kbIsAlreadyNotified_,
    kbFilterTodayTargets_: kbFilterTodayTargets_,
    kbClassifyCard_: kbClassifyCard_,
    kbAddDaysYMD_: kbAddDaysYMD_,
    kbJstYmdFromEpoch_: kbJstYmdFromEpoch_,
    kbUpcomingAbsenceDates_: kbUpcomingAbsenceDates_,
    kbMergeDedupAbs_: kbMergeDedupAbs_,
    kbIsViewToday_: kbIsViewToday_,
    kbUnitGroup_: kbUnitGroup_,
    kbIsOkResponse_: kbIsOkResponse_,
    kbDecideLoad_: kbDecideLoad_
  };
}
