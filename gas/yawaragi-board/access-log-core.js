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

var ACCESS_LOG_RETENTION_DAYS = 30;   // 観測に必要な期間だけ残す（社長要件・肥大対策の主）

// 保持期間トリムの計画を返す純関数。日次トリガから呼ぶ。
//   timestamps: timestamp列の値（ヘッダ除く・古い順＝appendRow の順）。
//   now: 基準時刻（呼び出し元が new Date() を渡す。テストのため引数化する）。
//   「now から retentionDays より古い」行が先頭から連続している分だけ削除する。
//
//   【安全側の設計】先頭から連続する古い行だけを対象にし、日付として読めない値に
//   当たったらそこで打ち切る。access_log は追記のみで時系列に並ぶ前提だが、手作業で
//   並べ替え・行挿入された場合に「新しい行を巻き込んで消す」ほうが被害が大きいため、
//   判断がつかないときは消さない。
function computeAccessLogAgeTrim_(timestamps, now, opts) {
  opts = opts || {};
  var retentionDays = (opts.retentionDays === undefined) ? ACCESS_LOG_RETENTION_DAYS : opts.retentionDays;
  var headerRows = (opts.headerRows === undefined) ? 1 : opts.headerRows;
  if (!timestamps || !timestamps.length) return null;
  var nowMs = (Object.prototype.toString.call(now) === '[object Date]') ? now.getTime() : NaN;
  if (isNaN(nowMs)) return null;
  var cutoff = nowMs - retentionDays * 86400000;
  var count = 0;
  for (var i = 0; i < timestamps.length; i++) {
    var v = timestamps[i];
    // Date 以外（空文字・文字列・数値）は「読めない」とみなして打ち切る（消しすぎ防止）。
    if (Object.prototype.toString.call(v) !== '[object Date]') break;
    var t = v.getTime();
    if (isNaN(t)) break;
    if (!(t < cutoff)) break;   // 保持期間内に入ったら以降は残す
    count++;
  }
  if (count <= 0) return null;
  return { deleteStartRow: headerRows + 1, deleteCount: count };
}

// 既存 access_log シートのヘッダを見て、どう揃えるかを決める純関数。
//   null/空        → 'create'（新規8列で作る）
//   現行8列と一致  → 'none'
//   origin だけ無い旧7列 → 'insertColumn'（4列目に挿入。既存値は右へずれるだけで消えない）
//   それ以外       → 'manual'（見知らぬ形は自動でいじらない）
function planAccessLogHeaderMigration_(header) {
  if (!header || !header.length) return { action: 'create' };
  var got = [];
  for (var i = 0; i < header.length; i++) got.push(String(header[i] === null || header[i] === undefined ? '' : header[i]).trim());
  while (got.length && got[got.length - 1] === '') got.pop();   // 右端の空セルは無視
  if (got.join('') === ACCESS_LOG_HEADER.join('')) return { action: 'none' };
  // origin を抜いた並びと一致するなら、origin 列だけを足せば現行と揃う
  var withoutOrigin = [];
  for (var j = 0; j < ACCESS_LOG_HEADER.length; j++) {
    if (ACCESS_LOG_HEADER[j] !== 'origin') withoutOrigin.push(ACCESS_LOG_HEADER[j]);
  }
  if (got.join('') === withoutOrigin.join('')) {
    return { action: 'insertColumn', insertAt: ACCESS_LOG_HEADER.indexOf('origin') + 1, columnName: 'origin' };
  }
  return { action: 'manual', reason: 'unexpected_header' };
}

// ===== 観測用の集計（Phase B-1・2026-07-19）=====
// 生ログ全件は返さない。URL/パラメータに利用者名が乗りうるため、集計値だけを外に出す。
// note 列は集計に一切含めない（原因追跡用の自由記述で、将来PIIが混ざる余地があるため）。

// Date → 'YYYY-MM-DD HH:mm'（Asia/Tokyo・通年UTC+9）。読めなければ null。
function accessLogStamp_(v) {
  if (Object.prototype.toString.call(v) !== '[object Date]') return null;
  var t = v.getTime();
  if (isNaN(t)) return null;
  var j = new Date(t + 9 * 3600000);
  function p(n) { return ('0' + n).slice(-2); }
  return j.getUTCFullYear() + '-' + p(j.getUTCMonth() + 1) + '-' + p(j.getUTCDate())
       + ' ' + p(j.getUTCHours()) + ':' + p(j.getUTCMinutes());
}

// origin を性格で分類する。Phase B で「合言葉を配れない経路」を炙り出すための軸。
//   none : クライアントが origin を送っていない（shared.js 未経由の直接fetch）
//   file : file:// 直開き。localStorage がオリジンごとに分かれるため合言葉を保存できない
//   prod : 本番の github.io
//   other: それ以外（未知の配布経路）
function classifyAccessLogOrigin_(origin) {
  var s = String(origin === null || origin === undefined ? '' : origin).trim();
  if (s === '' || s === ACCESS_LOG_ORIGIN_NONE) return 'none';
  if (s.indexOf('file:') === 0 || s === 'null') return 'file';
  if (s.indexOf('github.io') >= 0) return 'prod';
  return 'other';
}

function _tally_(map, key) { map[key] = (map[key] || 0) + 1; }
function _toSortedList_(map, keyName) {
  var out = [];
  for (var k in map) { if (Object.prototype.hasOwnProperty.call(map, k)) { var o = {}; o[keyName] = k; o.count = map[k]; out.push(o); } }
  out.sort(function (a, b) { return (b.count - a.count) || (a[keyName] < b[keyName] ? -1 : 1); });
  return out;
}

// access_log のデータ行（ヘッダ除く）→ 集計。opts.topActions で action 上位N件（既定20）。
function buildAccessLogSummary_(rows, opts) {
  opts = opts || {};
  var topActions = (opts.topActions === undefined) ? 20 : opts.topActions;
  var empty = {
    totalRows: 0, period: null, byMethod: {}, byTokenStatus: {}, byResult: {},
    byOrigin: [], originAlert: { none: 0, file: 0 }, byAction: [], actionKindsTotal: 0
  };
  if (!rows || !rows.length) return empty;
  var method = {}, status = {}, result = {}, origin = {}, originKind = {}, action = {};
  var alert = { none: 0, file: 0 };
  var from = null, to = null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || [];
    var stamp = accessLogStamp_(r[0]);
    if (stamp) {
      if (from === null || stamp < from) from = stamp;
      if (to === null || stamp > to) to = stamp;
    }
    if (r[1]) _tally_(method, String(r[1]));
    if (r[2]) _tally_(action, String(r[2]));
    if (r[4]) _tally_(status, String(r[4]));
    if (r[6]) _tally_(result, String(r[6]));
    var o = sanitizeAccessLogOrigin_(r[3]);   // クエリ除去・生トークン除去を再適用（防御的）
    _tally_(origin, o);
    var kind = classifyAccessLogOrigin_(o);
    originKind[o] = kind;
    if (kind === 'none' || kind === 'file') alert[kind]++;
  }
  var originList = _toSortedList_(origin, 'origin');
  for (var j = 0; j < originList.length; j++) originList[j].kind = originKind[originList[j].origin];
  var actionList = _toSortedList_(action, 'action');
  return {
    totalRows: rows.length,
    period: (from && to) ? { from: from, to: to } : null,
    byMethod: method, byTokenStatus: status, byResult: result,
    byOrigin: originList, originAlert: alert,
    byAction: actionList.slice(0, topActions),
    actionKindsTotal: actionList.length
  };
}

// origin_log のデータ行（ヘッダ除く）→ 集計。
//   列は [サーバ受信時刻, origin, href, userAgent, クライアント時刻]。
//   href と userAgent は返さない（href のクエリに利用者名・日付が乗りうるため）。
function buildOriginLogSummary_(rows) {
  if (!rows || !rows.length) return { totalRows: 0, origins: [] };
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || [];
    var o = sanitizeAccessLogOrigin_(r[1]);
    out.push({ origin: o, kind: classifyAccessLogOrigin_(o), firstSeen: accessLogStamp_(r[0]) });
  }
  return { totalRows: rows.length, origins: out };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    accessLogStamp_: accessLogStamp_,
    classifyAccessLogOrigin_: classifyAccessLogOrigin_,
    buildAccessLogSummary_: buildAccessLogSummary_,
    buildOriginLogSummary_: buildOriginLogSummary_,
    ACCESS_LOG_RETENTION_DAYS: ACCESS_LOG_RETENTION_DAYS,
    computeAccessLogAgeTrim_: computeAccessLogAgeTrim_,
    planAccessLogHeaderMigration_: planAccessLogHeaderMigration_,
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
