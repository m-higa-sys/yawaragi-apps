// 振替不能トラッカー 伝達ボード通知の upsert 判定（純関数）
// テスト: scripts/test-furikae-notice.js ／ 呼び出し元: コード.js upsertFurikaeNotice()
//
// 伝達ボードの id 列(col0)を「月ごとの通知キー」に使い、当月1メッセージだけを冪等に
// 更新（件数変化のたびに本文置換）し、0件（全件回収）で削除（締め）する。
// キーは 'furikae-funou-' 接頭辞に厳格化し、他メッセージ（db_*・移行シード等）には絶対に触れない。
// ※これは通知の状態管理であってデータ台帳の破壊ではない（振替レコードは furikae 側 SYNC_URL に別管理）。
var FNK_NOTICE_PREFIX = 'furikae-funou-';

function furikaeNoticeValidKey_(key) {
  key = String(key || '').trim();
  return key.indexOf(FNK_NOTICE_PREFIX) === 0 && key.length > FNK_NOTICE_PREFIX.length;
}

// values: 伝達シート getDataRange().getValues()（行0=ヘッダ・ID列=0）。
// 戻り値: { op:'add'|'update'|'delete'|'noop'|'reject', rowIndex } rowIndex=valuesの0基準行（無ければ-1）
function furikaeNoticeDecide_(values, key, body) {
  if (!furikaeNoticeValidKey_(key)) return { op: 'reject', rowIndex: -1 };
  var b = String(body == null ? '' : body).trim();
  var target = String(key).trim();
  var idx = -1;
  if (values) {
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0] || '').trim() === target) { idx = i; break; }
    }
  }
  if (!b) return { op: idx === -1 ? 'noop' : 'delete', rowIndex: idx };
  return { op: idx === -1 ? 'add' : 'update', rowIndex: idx };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FNK_NOTICE_PREFIX: FNK_NOTICE_PREFIX,
    furikaeNoticeValidKey_: furikaeNoticeValidKey_,
    furikaeNoticeDecide_: furikaeNoticeDecide_
  };
}
