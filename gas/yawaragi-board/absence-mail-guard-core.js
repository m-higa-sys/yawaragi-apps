// 欠席自動メール 宛先バリデーション 純ロジック正本（2026-06-19）
// I/Oは コード.js の registerAbsence / cancelAbsence 側に置き、判定だけここに集約。
// node でテスト可能（scripts/test-absence-mail-guard.js）。GAS では関数がそのまま読まれる。
//
// 目的: 「メール派 かつ cmInfo.email が truthy」だけで送信していた現状を、
//   メール形式バリデーションに置き換える。"なし"/"...or,jp"(カンマ誤り)/空 などを
//   一律「メアド未登録/無効」扱いにし、GmailApp が例外を投げる前にスキップ＋警告する。

// 基本的なメール形式チェック。
//   - ローカル部: 一般的な記号を許容
//   - ドメイン部: 英数字とハイフンのラベルをドットで2つ以上連結（カンマ等の不正文字を排除）
// "syounin@higashimatsuyamahome.or,jp" は ".or,jp" のカンマで弾かれる。
function isValidCmEmail_(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return false;
  var re = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
  return re.test(s);
}

// 欠席通知のメール送信可否を判定する純関数。
//   method   : 利用者台帳「ケアマネ連絡手段」(cmInfo.method)
//   email    : 利用者台帳「ケアマネメールアドレス」(cmInfo.email)
//   skipEmail: 2件目以降のunit登録で送信を抑止するフラグ(data.skipEmail)
// 返り値: { send, skipInvalid, reason }
//   send=true        → 自動送信する
//   skipInvalid=true → メール派なのに宛先が無効 → 送信せず警告(notifySkipped)対象
//   reason           : 'send' | 'invalid' | 'skipEmail' | 'notMail'
function cmMailDecision_(method, email, skipEmail) {
  var isMail = String(method || '').indexOf('メール') >= 0;
  if (!isMail) return { send: false, skipInvalid: false, reason: 'notMail' };
  if (skipEmail) return { send: false, skipInvalid: false, reason: 'skipEmail' };
  if (isValidCmEmail_(email)) return { send: true, skipInvalid: false, reason: 'send' };
  return { send: false, skipInvalid: true, reason: 'invalid' };
}

// 連絡状況ステータスを一意に分類（休み連絡メールリニューアル・2026-06-19）。
//   em          : 利用者台帳「ケアマネメールアドレス」生値(cmInfo.email)
//   method      : 利用者台帳「ケアマネ連絡手段」(将来のログ/分岐用に保持・現状未参照)
//   contactMethod: 'phone' のとき電話連絡済（emより優先）
//   didSend     : プレビューで「送信」が押され実送信が試行されたか
//   sendError   : 送信時の例外メッセージ(あれば)・無ければ null
// 返り値: '電話連絡済' | 'メールなし' | '要電話連絡' | 'エラー: <msg>' | '送信済' | 'メール未送信'
//   isValidCmEmail_ で "なし"/カンマ誤り/@無しゴミ を無効=要電話連絡に倒す（GmailApp例外の前に弾く）。
function classifyCmNotified_(em, method, contactMethod, didSend, sendError) {
  em = String(em == null ? '' : em).trim();
  if (contactMethod === 'phone') return '電話連絡済';
  if (em === '') return 'メールなし';
  if (!isValidCmEmail_(em)) return '要電話連絡';
  if (didSend && sendError) return 'エラー: ' + sendError;
  if (didSend) return '送信済';
  return 'メール未送信';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isValidCmEmail_: isValidCmEmail_,
    cmMailDecision_: cmMailDecision_,
    classifyCmNotified_: classifyCmNotified_
  };
}
