// ============================================================
// 月次⑦（新規・終了・キャンセル）自動集計 純ロジック（正本）
// 2026-06-14 追加。経営ダッシュボード⑦の手入力ゼロ化用。
//
// このファイルは GAS（yawaragi-board）と node テストの両方で共有する。
// - GAS: clasp push で .gs として取り込まれグローバルに公開される。
//        末尾の module.exports ガードは GAS では typeof module==='undefined' で素通り。
// - node: scripts/test-monthly-shichi.js が require して純ロジックを検証。
//
// 設計方針:
//   * SpreadsheetApp / Utilities に依存しない純関数のみここに置く（テスト可能性のため）。
//   * シートI/O（openById・getValues）は コード.js の getMonthlyShichi() が担う。
//   * 既存アプリのロジックは一切変更しない＝読み取り専用集計。
// ============================================================

// 日付値を 'yyyy-MM-dd' 文字列へ正規化（Date / 文字列 / 日時付き文字列に対応）。
// コード.js の fmtDate(Utilities依存) と同等の結果を Utilities なしで得る。
function _ymd_(val) {
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = ('0' + (val.getMonth() + 1)).slice(-2);
    var d = ('0' + val.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  var s = String(val == null ? '' : val).trim();
  var mt = s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (mt) return mt[1] + '-' + ('0' + mt[2]).slice(-2) + '-' + ('0' + mt[3]).slice(-2);
  return s;
}

// 新規人数: 見学体験新規シートの「本格利用開始日」が ym(yyyy-MM) で始まる利用者名の配列。
// 列位置はシートにより変わりうるため引数で受ける（startCol=本格利用開始日, nameCol=氏名・いずれも0始まり）。
function _countNewUsers_(values, startCol, nameCol, ym) {
  var names = [];
  for (var i = 1; i < values.length; i++) {
    if (_ymd_(values[i][startCol]).indexOf(ym) === 0) {
      names.push(String(values[i][nameCol] == null ? '' : values[i][nameCol]).trim());
    }
  }
  return names;
}

// 終了人数: 中止履歴シート（A最終利用日0 / B中止日1 / C連絡日2 / D利用者名3）。
//   byTerminate = 中止日(=最終利用日)が ym の利用者名配列（「その月に辞めた人数」）。
//   byContact   = 連絡日が ym の件数（既存 getTerminations と同じ連絡日基準・参考値）。
function _countTerminations_(values, ym) {
  var names = [];
  var contactCount = 0;
  for (var i = 1; i < values.length; i++) {
    if (_ymd_(values[i][1]).indexOf(ym) === 0) {
      names.push(String(values[i][3] == null ? '' : values[i][3]).trim());
    }
    if (_ymd_(values[i][2]).indexOf(ym) === 0) {
      contactCount++;
    }
  }
  return { byTerminate: names, byContact: contactCount };
}

// キャンセル回数: 出欠変更シート（A日付0 / B利用者名1 / C単位2 / D種別3）。
//   種別='欠席' かつ 日付が ym の延べ件数（1人1日1単位=1件・午前/午後は別件）。
//   長期休み(種別='長期休み')は除外される。byUser=利用者別内訳（参考）。
function _countCancellations_(values, ym) {
  var count = 0;
  var byUser = {};
  for (var i = 1; i < values.length; i++) {
    var type = String(values[i][3] == null ? '' : values[i][3]).trim();
    if (type !== '欠席') continue;
    if (_ymd_(values[i][0]).indexOf(ym) !== 0) continue;
    count++;
    var name = String(values[i][1] == null ? '' : values[i][1]).trim();
    byUser[name] = (byUser[name] || 0) + 1;
  }
  return { count: count, byUser: byUser };
}

// node テスト用エクスポート（GAS では module が無いので無視される）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _ymd_: _ymd_, _countNewUsers_: _countNewUsers_, _countTerminations_: _countTerminations_, _countCancellations_: _countCancellations_ };
}
