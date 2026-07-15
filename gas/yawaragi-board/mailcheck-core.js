// mailcheck 純ロジック（最終メール報告日時の永続保持）
//   正本: このファイル。GASは単一ファイルのため コード.js に同一関数を内包する。
//   設計: 前回報告日時より後に届いたメールを取りこぼさないための「起点日時」を保持。
//         起点は「既読/未読」ではなく「届いた日時」。日時の前進は自動でなく、
//         社長の完了合図で set_mailcheck を叩いた時だけ更新する（忘れても翌朝へ持ち越し）。
//   関連: doGet の action=last_mailcheck / set_mailcheck、ScriptProperties 'LAST_MAILCHECK_AT'

var MAILCHECK_PROP = 'LAST_MAILCHECK_AT';
var MAILCHECK_DEFAULT_HOURS = 24;

// ISO文字列として解釈可能か（文字列のみ受理・空白/非日付/非文字列はfalse）
function mcIsValidIso_(s) {
  if (typeof s !== 'string') return false;
  var t = s.trim();
  if (!t) return false;
  return !isNaN(Date.parse(t));
}

// epoch(ms) → 正規化UTC ISO（例: 2026-07-15T12:00:00.000Z）
function mcToIso_(ms) {
  return new Date(ms).toISOString();
}

// 保存値を解決して返す。
//   有効な保存値 → UTC ISOへ正規化して返す
//   未設定/壊れた値 → 既定(defaultHours)時間前を返す（取りこぼし防止のフォールバック）
function mcResolveLastCheck_(stored, nowMs, defaultHours) {
  var h = (typeof defaultHours === 'number' && defaultHours > 0) ? defaultHours : MAILCHECK_DEFAULT_HOURS;
  if (mcIsValidIso_(stored)) return mcToIso_(Date.parse(stored));
  return mcToIso_(nowMs - h * 3600 * 1000);
}

// set時に保存する値を算出。
//   at(明示指定)が有効ISO → その時刻（過去合図の後追い等を許可）
//   at未指定/壊れ → 「今」（不正値で誤って過去に飛ばさない）
function mcComputeSetValue_(atParam, nowMs) {
  if (mcIsValidIso_(atParam)) return mcToIso_(Date.parse(atParam));
  return mcToIso_(nowMs);
}

// node からの利用（GASでは typeof module === 'undefined' で無視される）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAILCHECK_PROP: MAILCHECK_PROP,
    MAILCHECK_DEFAULT_HOURS: MAILCHECK_DEFAULT_HOURS,
    mcIsValidIso_: mcIsValidIso_,
    mcToIso_: mcToIso_,
    mcResolveLastCheck_: mcResolveLastCheck_,
    mcComputeSetValue_: mcComputeSetValue_
  };
}
