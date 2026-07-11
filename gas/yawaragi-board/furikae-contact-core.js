// 振替不能トラッカー ③連絡記録の純関数（genba recordPastContact / _appendCmLog_ 型）
// テスト: scripts/test-furikae-contact.js ／ 呼び出し元: コード.js recordFurikaeContact()
//
// 「furikae連絡履歴」シートに追記型（appendRow）で {日時/顧客番号/氏名/対象月/手段/連絡者/メモ} を残す。
// 上書きしない・send(メール等)は呼ばない＝記録のみ（genba recordPastContact と同じ思想）。
// ※require() は持たない（GAS本番でロード時停止しない・furikae-notice-core.js と同方式）。

var FNK_CONTACT_SHEET = 'furikae連絡履歴';
var FNK_CONTACT_HEADER = ['記録日時', '顧客番号', '氏名', '対象月', '連絡手段', '連絡者', 'メモ'];

// 記録に必要な最小データが揃っているか（顧客番号 or 氏名のどちらかは必須）
function furikaeContactValid_(data) {
  data = data || {};
  return !!(String(data.customerId || '').trim() || String(data.name || '').trim());
}

// 追記する1行を構築（純関数・now は呼び出し側が渡す＝テスト可能）。欠損は空文字で埋める。
function furikaeContactRow_(now, data) {
  data = data || {};
  return [
    now,
    String(data.customerId || ''),
    String(data.name || ''),
    String(data.month || ''),
    String(data.method || ''),
    String(data.operator || ''),
    String(data.note || '')
  ];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FNK_CONTACT_SHEET: FNK_CONTACT_SHEET,
    FNK_CONTACT_HEADER: FNK_CONTACT_HEADER,
    furikaeContactValid_: furikaeContactValid_,
    furikaeContactRow_: furikaeContactRow_
  };
}
