// access_log の純関数（行組立・日次トリム計画）（セキュリティ強化 Phase 1・2026-07-12）
// テスト: scripts/test-access-log.js ／ 呼び出し元: コード.js appendAccessLog_ / dailyTrimAccessLog_
//
// 設計（指示書 1-4 ＋ 社長指示）:
//   - access_log は全リクエストで1行追記。列は8つ（下記 ACCESS_LOG_HEADER）。
//   - PII・トークン値・利用者名は絶対に書かない。note は生トークン値を除去し200字で切り詰め。
//   - トリム(10000行超)は appendRow のたびに走らせない。日次トリガから computeAccessLogTrim_ を
//     1回呼ぶだけ（毎回 getLastRow して判定するコストを朝ピークに乗せない）。
//   - ※require() は持たない（GAS本番でロード時に停止しない・他 *-core.js と同方式）。

var ACCESS_LOG_SHEET = 'access_log';
// origin 列を追加（社長指示・穴②）: どのアプリが missing/mismatch かを特定できないと
// enforce=ON 前の「missing/mismatch ゼロ確認」が機能しないため。
// ※Apps Script の doGet/doPost は HTTPヘッダ(Referer/Origin)を読めない。よって origin は
//   既存 log_origin と同様、クライアントが送るパラメータ(e.parameter.origin / data.origin)を記録する。
var ACCESS_LOG_HEADER = ['timestamp', 'method', 'action', 'origin', 'token_status', 'enforce', 'result', 'note'];
var ACCESS_LOG_MAX_ROWS = 10000;   // データ行の上限（ヘッダ除く）
var ACCESS_LOG_NOTE_MAX = 200;     // note 列の最大文字数
var ACCESS_LOG_ORIGIN_MAX = 300;   // origin 列の最大文字数（log_origin と同じ上限）
// origin 未送信を「空文字（＝記録漏れ）」と区別するための明示値（社長指示・穴③）。
// クライアントが origin を送っていない経路は enforce=ON 時に「どのアプリか特定不能」になるため、
// '(none)' で可視化し、Phase 2 のトークン＋origin付与の対象として炙り出す。
var ACCESS_LOG_ORIGIN_NONE = '(none)';

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

// origin(＝クライアントが送る location.origin + location.pathname)をサニタイズする。
//   【値の性格・社長要件1】これはクライアントの自己申告であり偽装可能＝「診断機構」であって
//     「セキュリティ機構」ではない。防御を担うのは token のみ。この値は
//     「どのアプリがトークン漏れしているか探す道具」であり、将来も認可判断には一切使わない。
//   【PII防止・社長要件2】クエリ文字列(? 以降)は必ず除去する（location.search に利用者名・
//     日付が乗りうる）。クライアントも location.search を付けない方針だが、サーバ側でも二重に落とす。
//   【file://・想定外環境・社長要件3】file:// 直開き等で location.origin が 'null' や空になる
//     ケースでも、パラメータとして値が来ている限り欠損させずそのまま記録する（github.io 以外からの
//     実行＝環境分裂を access_log 上で識別できるようにするため）。'(none)' に丸めない。
//   【(none)の意味・社長要件4】パラメータ自体が未送信(null/undefined/空)のときだけ '(none)'。
//     これは shared.js の共通ラッパーを経由していない直接fetchアプリ＝Phase2の個別対応残作業を炙り出す。
//   生トークン除去・300字制限も維持。
function sanitizeAccessLogOrigin_(origin) {
  if (origin === null || origin === undefined || origin === '') return ACCESS_LOG_ORIGIN_NONE;
  var s = String(origin).replace(/(token=)[^&\s]*/gi, '$1[redacted]');
  var q = s.indexOf('?');
  if (q >= 0) s = s.slice(0, q);                        // クエリ除去（PII防止・要件2）
  if (s.trim() === '') return ACCESS_LOG_ORIGIN_NONE;   // クエリ除去後に空なら未送信扱い
  if (s.length > ACCESS_LOG_ORIGIN_MAX) s = s.slice(0, ACCESS_LOG_ORIGIN_MAX);
  return s;                                             // 'null'(file://) や想定外オリジンはそのまま残す
}

// 1リクエスト分の行（8列・順序固定）を組み立てる。列ズレ防止のため null は空文字化。
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
    sanitizeAccessLogOrigin_(ctx.origin),  // どのアプリからか（クライアント送信の origin）
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
    ACCESS_LOG_ORIGIN_MAX: ACCESS_LOG_ORIGIN_MAX,
    ACCESS_LOG_ORIGIN_NONE: ACCESS_LOG_ORIGIN_NONE,
    sanitizeAccessLogNote_: sanitizeAccessLogNote_,
    sanitizeAccessLogOrigin_: sanitizeAccessLogOrigin_,
    buildAccessLogRow_: buildAccessLogRow_,
    computeAccessLogTrim_: computeAccessLogTrim_
  };
}
