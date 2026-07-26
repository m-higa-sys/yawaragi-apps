// 個訓「保険未登録・作成不可」保留 → 伝達ボード通知の upsert/close 判定（純関数）
// テスト: scripts/test-kunren-hold.js ／ 呼び出し元: コード.js kunrenHoldNotify()/kunrenHoldClear()
//
// 伝達ボードの id 列(col0)を「利用者×年×月ごとの通知キー」に使い、同月に何度保留しても
// 1メッセージだけを冪等に upsert（本文置換・done解除で復活）する。保留解除時は done=true で締める（履歴に残す）。
// キーは 'kunren-hold-' 接頭辞に厳格化し、他メッセージ（db_*・furikae-funou-*・移行シード等）には絶対に触れない。
// ※これは通知の状態管理であってデータ台帳の破壊ではない（保留の正本は Keikakusho シートの blocked_reason）。
var KUNREN_HOLD_PREFIX = 'kunren-hold-';

// 決定的キー: kunren-hold-<userId>-<year>-<month>。同一(利用者,年,月)で常に同じキー＝重複しない。
function kunrenHoldKey_(userId, year, month) {
  return KUNREN_HOLD_PREFIX
    + String(userId == null ? '' : userId).trim()
    + '-' + String(year == null ? '' : year).trim()
    + '-' + String(month == null ? '' : month).trim();
}

function kunrenHoldValidKey_(key) {
  key = String(key || '').trim();
  return key.indexOf(KUNREN_HOLD_PREFIX) === 0 && key.length > KUNREN_HOLD_PREFIX.length;
}

// values: 伝達シート getDataRange().getValues()（行0=ヘッダ・ID列=0）。
// 戻り値: { op:'add'|'update'|'close'|'noop'|'reject', rowIndex } rowIndex=values 0基準行（無ければ-1）
//   本文あり: 未存在=add / 既存=update（notify 経路）
//   本文なし: 既存=close(done化) / 未存在=noop（clear 経路）
//   キー不正（他メッセージid 等）: reject（＝他行を絶対に指さない）
function kunrenHoldDecide_(values, key, body) {
  if (!kunrenHoldValidKey_(key)) return { op: 'reject', rowIndex: -1 };
  var target = String(key).trim();
  var idx = -1;
  if (values) {
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0] || '').trim() === target) { idx = i; break; }
    }
  }
  var b = String(body == null ? '' : body).trim();
  if (!b) return { op: idx === -1 ? 'noop' : 'close', rowIndex: idx };
  return { op: idx === -1 ? 'add' : 'update', rowIndex: idx };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    KUNREN_HOLD_PREFIX: KUNREN_HOLD_PREFIX,
    kunrenHoldKey_: kunrenHoldKey_,
    kunrenHoldValidKey_: kunrenHoldValidKey_,
    kunrenHoldDecide_: kunrenHoldDecide_
  };
}
