// access_log の純関数（行組立・日次トリム計画）（セキュリティ強化 Phase 1・2026-07-12）
// テスト: scripts/test-access-log.js ／ 呼び出し元: コード.js appendAccessLog_ / dailyTrimAccessLog_
//
// 設計（指示書 1-4 ＋ 社長指示）:
//   - access_log は全リクエストで1行追記。列は7つ（下記 ACCESS_LOG_HEADER）。
//   - PII・トークン値・利用者名は絶対に書かない。note は生トークン値を除去し200字で切り詰め。
//   - トリム(10000行超)は appendRow のたびに走らせない。日次トリガから computeAccessLogTrim_ を
//     1回呼ぶだけ（毎回 getLastRow して判定するコストを朝ピークに乗せない）。
//   - ※require() は持たない（GAS本番でロード時に停止しない・他 *-core.js と同方式）。

var ACCESS_LOG_SHEET = 'access_log';
var ACCESS_LOG_HEADER = ['timestamp', 'method', 'action', 'token_status', 'enforce', 'result', 'note'];
var ACCESS_LOG_MAX_ROWS = 10000;   // データ行の上限（ヘッダ除く）
var ACCESS_LOG_NOTE_MAX = 200;     // note 列の最大文字数

// note から生トークン値を除去し、長さを制限する。
//   token=xxx / token":"xxx" のような値部分を [redacted] に置換（キーは残す＝原因追跡用）。
function sanitizeAccessLogNote_(note) {
  if (note === null || note === undefined) return '';
  var s = String(note);
  // token=... （クエリ形式・& か 空白 か 末尾まで）
  s = s.replace(/(token=)[^&\s]*/gi, '$1[redacted]');
  // "token":"..." / token: ...（JSON/ログ形式）
  s = s.replace(/("?token"?\s*[:=]\s*"?)[^"&\s,}]+/gi, '$1[redacted]');
  if (s.length > ACCESS_LOG_NOTE_MAX) s = s.slice(0, ACCESS_LOG_NOTE_MAX);
  return s;
}

// 1リクエスト分の行（7列・順序固定）を組み立てる。列ズレ防止のため null は空文字化。
function buildAccessLogRow_(ctx) {
  ctx = ctx || {};
  var method = (ctx.method === null || ctx.method === undefined) ? '' : String(ctx.method);
  var action = (ctx.action === null || ctx.action === undefined) ? '' : String(ctx.action);
  var tokenStatus = (ctx.tokenStatus === null || ctx.tokenStatus === undefined) ? '' : String(ctx.tokenStatus);
  var result = (ctx.result === null || ctx.result === undefined) ? '' : String(ctx.result);
  return [
    ctx.timestamp,          // Date（呼び出し元が new Date() を渡す）
    method,
    action,
    tokenStatus,
    ctx.enforce === true,   // boolean 正規化
    result,
    sanitizeAccessLogNote_(ctx.note)
  ];
}

// トリム計画を返す純関数。日次トリガから呼ぶ。
//   lastRow: シートの最終行（getLastRow の値）。headerRows: ヘッダ行数（既定1）。
//   maxRows: 残すデータ行の上限（既定10000）。
//   データ行数(= lastRow - headerRows) が maxRows を「超えた」ときだけ、
//   最古（ヘッダ直下 = row headerRows+1）から超過分を削除する計画を返す。無ければ null。
function computeAccessLogTrim_(lastRow, opts) {
  opts = opts || {};
  var maxRows = (opts.maxRows === undefined) ? ACCESS_LOG_MAX_ROWS : opts.maxRows;
  var headerRows = (opts.headerRows === undefined) ? 1 : opts.headerRows;
  var dataRows = lastRow - headerRows;
  if (!(dataRows > maxRows)) return null;   // NaN/負数/以下 は null（安全側）
  var deleteCount = dataRows - maxRows;
  return { deleteStartRow: headerRows + 1, deleteCount: deleteCount };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ACCESS_LOG_SHEET: ACCESS_LOG_SHEET,
    ACCESS_LOG_HEADER: ACCESS_LOG_HEADER,
    ACCESS_LOG_MAX_ROWS: ACCESS_LOG_MAX_ROWS,
    ACCESS_LOG_NOTE_MAX: ACCESS_LOG_NOTE_MAX,
    sanitizeAccessLogNote_: sanitizeAccessLogNote_,
    buildAccessLogRow_: buildAccessLogRow_,
    computeAccessLogTrim_: computeAccessLogTrim_
  };
}
