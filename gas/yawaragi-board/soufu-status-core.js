/* 提出送付台帳 状態遷移コア（純関数・2026-08-05）
 *
 * なぜ切り出したか:
 *   旧実装（コード.js:3021-3033）は状態遷移が doGet の中にインラインで埋まっており、
 *   「'揃った' でなければ else で '送付済'」という決め打ちだった。ここに '保留' を足すと、
 *   保留を送ったつもりが台帳に「送付済」と書かれ sofu_at（送付日）・soufusha（送付者）まで
 *   捏造される。純関数へ出して、その事故をテストで固定できるようにした。
 *   → scripts/test-soufu-status-core.js
 *
 * 状態は3つ。増やすときは必ず明示分岐を足すこと（else へ落とさない）。
 *   '揃った' … 利用者のサインが済んだ＝いつでも送れる。sorotta_at/by を記録。
 *   '送付済' … ケアマネへ出した。sofu_at/soufusha を記録。sorotta_* は保全（属人化集計の核）。
 *   '保留'   … 対象だが今月は出せない。理由は kurikoshiRiyu（任意・空＝理由未記録）。
 *              日時・操作者は updatedAt/updatedBy のみ。sofu_at/soufusha は絶対に書かない。
 */

var SOUFU_STATUSES_ = ['揃った', '送付済', '保留'];

/**
 * 次の行の状態を決める（シートには触らない）。
 * @param {Object|null} cur   既存行オブジェクト（soufuLedgerRowToObj_ の返値）。無ければ null。
 * @param {Object} key        {userId, docType, taishoTsuki} — cur が無いとき骨組みを作るため
 * @param {string} status     '揃った' | '送付済' | '保留'
 * @param {string} now        'yyyy-MM-dd HH:mm:ss'（呼び出し側でTZ確定済み）
 * @param {string} by         操作者名
 * @return {Object} 次の行オブジェクト（呼び出し側が差分を見て書く）
 */
function soufuNextRow_(cur, key, status, now, by) {
  if (SOUFU_STATUSES_.indexOf(status) < 0) {
    // ★else で '送付済' に落とす旧実装の再発防止。知らない状態は黙って通さない。
    throw new Error('未知の status: ' + status);
  }
  var next = cur ? JSON.parse(JSON.stringify(cur)) : {
    userId: key.userId, docType: key.docType, taishoTsuki: key.taishoTsuki,
    tekiyoTsuki: '', status: '', sorotta_at: '', sorotta_by: '', sofu_at: '',
    soufusha: '', soufuHouhou: '', kurikoshiRiyu: '', signKigen: '',
    updatedBy: '', updatedAt: ''
  };

  // 同一 status の再送は結果不変（冪等）。時刻も操作者も動かさない。
  if (next.status === status) return next;

  if (status === '揃った') {
    next.status = '揃った';
    next.sorotta_at = now;
    next.sorotta_by = by;
    next.sofu_at = '';      // 送付済からの差戻し対応
    next.soufusha = '';
  } else if (status === '送付済') {
    next.status = '送付済';
    next.sofu_at = now;
    next.soufusha = by;
    // sorotta_at/sorotta_by は保全（誰が揃えたかを送付で上書きしない）
  } else {
    // '保留'
    next.status = '保留';
    // 出していないので送付の記録は持たせない。送付済からの差戻しでは消す
    // （送付日を持ったままの保留行は台帳の矛盾になる）。
    next.sofu_at = '';
    next.soufusha = '';
    // sorotta_at/sorotta_by は保全。揃った→保留へ落ちても「誰が揃えたか」は歴史として残す。
    // 未作成→保留のときは骨組みが空なのでそのまま空。
  }
  return next;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { soufuNextRow_: soufuNextRow_, SOUFU_STATUSES_: SOUFU_STATUSES_ };
}
