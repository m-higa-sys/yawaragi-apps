// 未実施報告（report_undone）の純ロジック（2026-07-30 追加・純追加）
// テスト: scripts/test-undone-report.js ／ 呼び出し元: コード.js reportUndone_ / morningDigest
//
// 背景（実測・社長指示 2026-07-30）:
//   保存先スプレッドシート 1blasas... の**シートTZは UTC−7**（Asia/Tokyo ではない）。
//   実測校正: セル値 = JST − 16h（自分のPOSTのHTTP応答ヘッダと突合して確定）。
//   よって date 列に入っている Date型セルを素で日付化すると日がずれる。
//   ここでは ambient TZ に一切依存せず、UTCミリ秒に +09:00 を足して JST の壁時計を作る。
//   Node（テスト）でも GAS 本番でも同一挙動になる（*-core.js は GAS API を持たない方針）。
//
//   ※シートのTZ設定そのものは絶対に変更しない。60シート・利用者台帳を含み、
//     全シートの日付解釈が16時間ずれるため単独案件（宿題に記録済み）。
//
// 書き込み側の約束（コード.js 側で守る。ここでは検証しない）:
//   date        … Utilities.formatDate(..., 'Asia/Tokyo', 'yyyy-MM-dd') の文字列
//   reportedAt  … 同 "yyyy-MM-dd'T'HH:mm:ssXXX"（'+09:00' 付き文字列。既存4月行と同形）
//   cancelledAt … 同上
//   Date型オブジェクトをセルに渡すのは禁止（シートTZ依存に戻るため）。

var UNDONE_SHEET = '未実施報告';
// 既存シートの実測ヘッダ。**追記のみ。列の追加も削除もしない。**
var UNDONE_HEADER = ['id', 'date', 'app', 'app_label', 'reportedAt', 'status', 'cancelledAt'];
var UNDONE_STATUS_ACTIVE = 'active';
var UNDONE_STATUS_CANCELLED = 'cancelled';
var UNDONE_DIGEST_DAYS = 14;   // 朝報告に載せる窓（直近14日ぶん）

// 端末日付を受け入れる許容差（暦日）。日跨ぎ（施設が翌日／端末が前日）は正当なので潰さない。
// これを超える食い違いは端末時計の異常とみなして**拒否**する（クランプはしない）。
var UNDONE_CLIENT_DATE_TOLERANCE_DAYS = 1;

var UNDONE_JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function _undonePad2_(n) { return (n < 10 ? '0' : '') + n; }

// UTCミリ秒 → JST の 'yyyy-MM-dd'（ambient TZ 非依存）
function _undoneJstDateFromMs_(ms) {
  var d = new Date(ms + UNDONE_JST_OFFSET_MS);
  return d.getUTCFullYear() + '-' + _undonePad2_(d.getUTCMonth() + 1) + '-' + _undonePad2_(d.getUTCDate());
}

// date セルの値を JST の 'yyyy-MM-dd' に正規化する。読めなければ '' を返す（推測で埋めない）。
//   (a) Date型セル      … getValues() が返す Date。瞬間を JST で読み直す
//   (b) 'yyyy-MM-dd'    … そのまま（最も多い形）
//   (c) '+09:00'/'Z' 付きISO … 瞬間として解釈し JST で読み直す
//   (d) 空・解釈不能    … ''
function undoneNormalizeDateCell_(v) {
  if (v === null || v === undefined) return '';
  // (a) Date型
  if (Object.prototype.toString.call(v) === '[object Date]') {
    var t = v.getTime();
    if (isNaN(t)) return '';
    return _undoneJstDateFromMs_(t);
  }
  // 数値（生シリアル等）は解釈しない。getValues() は日付セルを Date で返すため通常来ない。
  if (typeof v === 'number') return '';
  var s = String(v).trim();
  if (s === '') return '';
  // (b) 日付のみ
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
  if (m) {
    // (c) オフセット付き（'Z' または '±hh:mm'）は瞬間として解釈して JST へ寄せる
    if (/(?:Z|[+\-]\d{2}:?\d{2})$/.test(s)) {
      var ms = Date.parse(s);
      if (!isNaN(ms)) return _undoneJstDateFromMs_(ms);
      return '';
    }
    // オフセット無しの日時は JST の壁時計とみなす（ambient TZ で揺れさせない）
    return m[1];
  }
  return '';   // (d) 解釈不能
}

// header の順に値を並べた1行を作る。未指定の列は空文字（列ズレ・undefined混入の防止）。
function undoneBuildRow_(header, obj) {
  var src = obj || {};
  var out = [];
  for (var i = 0; i < (header || []).length; i++) {
    var k = header[i];
    var v = src[k];
    out.push((v === null || v === undefined) ? '' : v);
  }
  return out;
}

function _undoneColIdx_(header, name) {
  for (var i = 0; i < (header || []).length; i++) { if (header[i] === name) return i; }
  return -1;
}

// (app, date) の status='active' 行を引く。無ければ null。
//   不変条件: (app, date) に active は最大1本。最初に見つかった1本を返す。
//   rows はヘッダを含まないデータ行の配列（index は 0 起点）。
function undoneFindActiveRow_(rows, header, app, date) {
  var iDate = _undoneColIdx_(header, 'date');
  var iApp = _undoneColIdx_(header, 'app');
  var iStatus = _undoneColIdx_(header, 'status');
  var iId = _undoneColIdx_(header, 'id');
  if (iDate < 0 || iApp < 0 || iStatus < 0) return null;
  var want = undoneNormalizeDateCell_(date);
  if (!want) return null;
  for (var i = 0; i < (rows || []).length; i++) {
    var r = rows[i] || [];
    if (String(r[iStatus] || '').trim() !== UNDONE_STATUS_ACTIVE) continue;
    if (String(r[iApp] || '').trim() !== String(app || '').trim()) continue;
    if (undoneNormalizeDateCell_(r[iDate]) !== want) continue;
    return { index: i, id: iId >= 0 ? String(r[iId] || '') : '' };
  }
  return null;
}

// 'yyyy-MM-dd' を暦日のUTCミリ秒へ（時刻成分を持たないので DST もTZも効かない）
function _undoneDayMs_(dateStr) {
  var m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// a - b の暦日差（整数）。どちらかが読めなければ null。ambient TZ 非依存。
//   Date型・'+09:00'付きISO も normalize を通してから比較する。
function undoneDayDiff_(a, b) {
  var am = _undoneDayMs_(undoneNormalizeDateCell_(a));
  var bm = _undoneDayMs_(undoneNormalizeDateCell_(b));
  if (am === null || bm === null) return null;
  return Math.round((am - bm) / 86400000);
}

// クライアントが送ってきた日付を、そのまま採用してよいか。
//   「今日」の定義がクライアント日付とサーバJSTの2つに割れると、端末時計が狂ったときに
//   朝報告へ嘘の日付が黙って出る。±1日以内なら日跨ぎの正当なケースとして採用し、
//   それを超えたら呼び出し側で拒否する（書き込まない）。
//   読めない値は「採用しない」＝呼び出し側が serverToday へフォールバックする。
function undoneIsAcceptableClientDate_(clientDate, serverToday) {
  var diff = undoneDayDiff_(clientDate, serverToday);
  if (diff === null) return false;
  return Math.abs(diff) <= UNDONE_CLIENT_DATE_TOLERANCE_DAYS;
}

// 'yyyy-MM-dd' から days-1 日前の 'yyyy-MM-dd'（UTC算術・ambient TZ 非依存）
function _undoneWindowStart_(todayStr, days) {
  var m = String(todayStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  var n = (days === undefined || days === null) ? UNDONE_DIGEST_DAYS : days;
  if (!(n >= 1)) return null;
  var base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var d = new Date(base - (n - 1) * 86400000);
  return d.getUTCFullYear() + '-' + _undonePad2_(d.getUTCMonth() + 1) + '-' + _undonePad2_(d.getUTCDate());
}

// 朝報告「昨日できなかった業務」セクションの素材を作る。
//   直近 days 日（today を含む）の status='active' を、日付の新しい順に並べる。
//   終わるまで方式: cancel されるまで出続ける。**0件なら null（セクションを出さない）**。
//   app 列は汎用のまま扱う（送迎日誌専用に決め打ちしない）。
function buildUndoneDigestSection_(rows, header, todayStr, days) {
  var from = _undoneWindowStart_(todayStr, days);
  if (!from) return null;
  var to = String(todayStr).trim();
  var iDate = _undoneColIdx_(header, 'date');
  var iApp = _undoneColIdx_(header, 'app');
  var iLabel = _undoneColIdx_(header, 'app_label');
  var iStatus = _undoneColIdx_(header, 'status');
  if (iDate < 0 || iApp < 0 || iStatus < 0) return null;
  var items = [];
  for (var i = 0; i < (rows || []).length; i++) {
    var r = rows[i] || [];
    if (String(r[iStatus] || '').trim() !== UNDONE_STATUS_ACTIVE) continue;
    var d = undoneNormalizeDateCell_(r[iDate]);
    if (!d) continue;                 // 読めない日付の行は無視（例外を投げない）
    if (d < from || d > to) continue;  // 窓外・未来日は出さない
    var app = String(r[iApp] || '').trim();
    if (!app) continue;
    items.push({
      date: d,
      app: app,
      app_label: iLabel >= 0 ? String(r[iLabel] || '').trim() : ''
    });
  }
  if (items.length === 0) return null;
  items.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;   // 日付降順
    if (a.app !== b.app) return a.app < b.app ? -1 : 1;       // 同日は app 昇順（決定的）
    return 0;
  });
  return { count: items.length, items: items };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    UNDONE_SHEET: UNDONE_SHEET,
    UNDONE_HEADER: UNDONE_HEADER,
    UNDONE_STATUS_ACTIVE: UNDONE_STATUS_ACTIVE,
    UNDONE_STATUS_CANCELLED: UNDONE_STATUS_CANCELLED,
    UNDONE_DIGEST_DAYS: UNDONE_DIGEST_DAYS,
    UNDONE_CLIENT_DATE_TOLERANCE_DAYS: UNDONE_CLIENT_DATE_TOLERANCE_DAYS,
    undoneNormalizeDateCell_: undoneNormalizeDateCell_,
    undoneBuildRow_: undoneBuildRow_,
    undoneFindActiveRow_: undoneFindActiveRow_,
    undoneDayDiff_: undoneDayDiff_,
    undoneIsAcceptableClientDate_: undoneIsAcceptableClientDate_,
    buildUndoneDigestSection_: buildUndoneDigestSection_
  };
}
