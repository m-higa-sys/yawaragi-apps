// 2026-07-04 指示書③: 本日の欠席連絡ボックスの判定純関数。
// GAS/node 両用（absence-mail-guard-core.js と同じ流儀）。SpreadsheetApp 等の GAS API に依存しないこと。

// 済み判定＝二重送信ガードの唯一の正（クライアント表示とサーバガードの両方がこれを使う）
function kbIsAlreadyNotified_(cmNotified) {
  var v = String(cmNotified || '').trim();
  return v === '送信済' || v === '電話連絡済' || v === '手動メール送信済' ||
         v === 'ケアマネ把握済' || v === '下書き保存';
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    kbIsAlreadyNotified_: kbIsAlreadyNotified_,
    kbFilterTodayTargets_: kbFilterTodayTargets_,
    kbClassifyCard_: kbClassifyCard_,
    kbAddDaysYMD_: kbAddDaysYMD_
  };
}
