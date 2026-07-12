// セッションボード測定チェック 純関数（要支援・重複ガード/取消判定）— GAS/Node両対応
// 「要支援測定記録」行形: [name, care, sokutei_date, sokutei_by, source, note, createdAt]
//   name=0 / sokutei_date=2 / source=4（実測: コード.js:2898, 13737-13738）
// GASでは session-board-core.js の sbNormalizeName_ をそのまま使う。Node単体では下記フォールバック。

// ---- 名前正規化（sbNormalizeName_ と同一仕様: NFKC＋空白除去＋末尾「様」除去）----
function _sokCheckNorm_(name) {
  if (typeof sbNormalizeName_ === 'function') return sbNormalizeName_(name);
  var s = String(name == null ? '' : name);
  if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  s = s.replace(/[\s　]+/g, '');
  s = s.replace(/(様|さま|サマ)$/, '');
  return s;
}

// ---- sokutei_date を 'YYYY-MM-DD' 文字列へ（Date/文字列両対応）----
function _sokCheckYmd_(v) {
  if (v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate());
  }
  return String(v).trim();
}

// 記録の重複ガード（source を問わず＝全ソース横断）。
// records: 要支援測定記録の行配列（ヘッダ除く）。name: 対象者名。ym: 'YYYY-MM'（当月）。
// 同月・同人（名寄せ）の記録が1件でもあれば true。
function shienAlreadyMeasuredThisMonth_(records, name, ym) {
  var key = _sokCheckNorm_(name);
  var target = String(ym || '').slice(0, 7);
  if (!key || !target) return false;
  for (var i = 0; i < (records || []).length; i++) {
    var r = records[i];
    if (_sokCheckNorm_(r[0]) !== key) continue;
    if (_sokCheckYmd_(r[2]).slice(0, 7) === target) return true;
  }
  return false;
}

// 取消可能行の検索（source='セッションボード' かつ date=today かつ 同人のみ）。
// 複数該当時は最後（最新）の index を返す。該当なしは -1。
function findCancelableShienRow_(records, name, date) {
  var key = _sokCheckNorm_(name);
  var d = String(date || '').trim();
  if (!key || !d) return -1;
  var found = -1;
  for (var i = 0; i < (records || []).length; i++) {
    var r = records[i];
    if (String(r[4] || '').trim() !== 'セッションボード') continue;
    if (_sokCheckYmd_(r[2]) !== d) continue;
    if (_sokCheckNorm_(r[0]) !== key) continue;
    found = i; // 最後に一致したものを採用
  }
  return found;
}

// ---- Node/GAS 両対応 export（GASでは typeof module === 'undefined' で無視）----
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    shienAlreadyMeasuredThisMonth_: shienAlreadyMeasuredThisMonth_,
    findCancelableShienRow_: findCancelableShienRow_,
    _sokCheckNorm_: _sokCheckNorm_,
    _sokCheckYmd_: _sokCheckYmd_,
  };
}
