// 加算・事業所情報アプリ kasan.html の純関数（2026-07-17）
// 設計書: docs/superpowers/specs/2026-07-17-kasan-app-design.md
// テスト: scripts/test-kasan-core.js ／ 呼び出し元: コード.js（action=kasan / setupKasanMaster）
//
// GAS/node 両用（session-board-core.js と同じ流儀）。SpreadsheetApp 等の GAS API に依存しない。
// ※require() は持たない（GAS本番でロード時に停止しない・他 *-core.js と同方式）。
//
// 罠: Sheets は 781241 を数値化する（A61111 は英字混在なので文字列のまま）。
//     kasan_master は全列テキスト書式で作るが、書式適用前の行や手貼りに備え
//     kasanNormalizeCode で二重に守る。

var KASAN_HEADER = ['section', '表示順', '系統', 'コード', '項目', '値', '最終確認日', '備考'];
var KASAN_SECTIONS = ['基本情報', '運営体制', '地域区分', '加算'];
var KASAN_KEITOU = ['介護給付', '総合事業'];

// コード正規化。数値化された 781241 を文字列へ戻す。A61111 等は素通し。
function kasanNormalizeCode(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(Math.round(v));
  return String(v).trim();
}

// シード行 [section,表示順,系統,コード,項目,値,最終確認日,備考] の冪等キー。
// section|コード|項目 で一意（加算はコードで、基本情報等は項目で効く）。
function kasanSeedKey_(row) {
  if (!row) return '';
  return [String(row[0] == null ? '' : row[0]).trim(),
          kasanNormalizeCode(row[3]),
          String(row[4] == null ? '' : row[4]).trim()].join('|');
}

// 表示順。数値化できない（空・文字）なら末尾へ落とす。
function kasanOrderNum_(v) {
  var n = parseInt(v, 10);
  return isNaN(n) ? 9999 : n;
}

// 最終確認日。全列テキスト書式なので通常は文字列で来るが、書式適用前の行が Date で
// 来た場合に備える。★toISOString を使わない＝UTC変換で日付が1日ずれるため
// （シートTZ=米西海岸／スクリプトTZ=東京の +16h ずれと同種の罠）。ローカル年月日で組む。
function kasanFormatDate_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    var m = v.getMonth() + 1, d = v.getDate();
    return v.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  return String(v).trim();
}

// シート2次元配列 → オブジェクト配列。ヘッダ「名」で列を解決する（列順の入替・列追加に強い）。
function kasanParseRows(values) {
  if (!values || values.length < 2) return [];
  var header = (values[0] || []).map(function (h) { return String(h == null ? '' : h).trim(); });
  var idx = {};
  KASAN_HEADER.forEach(function (name) { idx[name] = header.indexOf(name); });
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i] || [];
    var cell = function (name) {
      var j = idx[name];
      if (j < 0 || j >= r.length) return '';
      return r[j] == null ? '' : r[j];
    };
    var section = String(cell('section')).trim();
    if (!section) continue;  // 空行スキップ
    out.push({
      section: section,
      order: kasanOrderNum_(cell('表示順')),
      keitou: String(cell('系統')).trim(),
      code: kasanNormalizeCode(cell('コード')),
      item: String(cell('項目')).trim(),
      value: String(cell('値')).trim(),
      checkedAt: kasanFormatDate_(cell('最終確認日')),
      note: String(cell('備考')).trim()
    });
  }
  return out;
}

// 表示順 → コード の安定ソート（非破壊＝呼び出し側の配列を壊さない）。
function kasanSortRows(rows) {
  return (rows || []).slice().sort(function (a, b) {
    if (a.order !== b.order) return a.order - b.order;
    return a.code < b.code ? -1 : (a.code > b.code ? 1 : 0);
  });
}

// section 別に束ねる。未知 section は「不明」へ入れる＝黙って捨てない
// （シートに想定外の値が入ったとき、画面から消えるより見えた方が直せる）。
// ★ KASAN_SECTIONS.indexOf で判定する。out[s] の存在確認だと section='constructor' 等で
//    Object.prototype 由来の値を掴んで .push が例外になる。
function kasanGroupBySection(rows) {
  // ★バケツは KASAN_SECTIONS から動的に作る。リテラルで二重管理すると、
  //   KASAN_SECTIONS に値を足して out の追加を忘れたとき indexOf は真になるのに
  //   out[s] が undefined で .push が TypeError → 応答全体が落ちる（実測済み）。
  var out = {};
  KASAN_SECTIONS.forEach(function (s2) { out[s2] = []; });
  out['不明'] = [];
  (rows || []).forEach(function (r) {
    var s = (r && r.section) || '';
    if (KASAN_SECTIONS.indexOf(s) >= 0) out[s].push(r);
    else out['不明'].push(r);
  });
  return out;
}

// 加算行を系統で分ける。系統が空/未知の行は「系統不明」へ入れる＝落とさない。
// ★契約: 引数には kasanGroupBySection(rows)['加算'] の結果**だけ**を渡すこと。
//   全行を直接渡すと、基本情報/運営体制/地域区分の行（keitou が常に空）が
//   「系統不明」に混入し、警告がノイズになる（本当に直すべき加算行が埋もれる）。
function kasanSplitKeitou(rows) {
  // ★同上。KASAN_KEITOU を唯一の情報源にする。
  var out = {};
  KASAN_KEITOU.forEach(function (k2) { out[k2] = []; });
  out['系統不明'] = [];
  (rows || []).forEach(function (r) {
    var k = (r && r.keitou) || '';
    if (KASAN_KEITOU.indexOf(k) >= 0) out[k].push(r);
    else out['系統不明'].push(r);
  });
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    KASAN_HEADER: KASAN_HEADER,
    KASAN_SECTIONS: KASAN_SECTIONS,
    KASAN_KEITOU: KASAN_KEITOU,
    kasanNormalizeCode: kasanNormalizeCode,
    kasanSeedKey_: kasanSeedKey_,
    kasanOrderNum_: kasanOrderNum_,
    kasanFormatDate_: kasanFormatDate_,
    kasanParseRows: kasanParseRows,
    kasanSortRows: kasanSortRows,
    kasanGroupBySection: kasanGroupBySection,
    kasanSplitKeitou: kasanSplitKeitou
  };
}
