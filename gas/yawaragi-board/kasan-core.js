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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    KASAN_HEADER: KASAN_HEADER,
    KASAN_SECTIONS: KASAN_SECTIONS,
    KASAN_KEITOU: KASAN_KEITOU,
    kasanNormalizeCode: kasanNormalizeCode,
    kasanSeedKey_: kasanSeedKey_
  };
}
