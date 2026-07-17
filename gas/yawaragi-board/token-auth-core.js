// 共有トークン認証の純関数（セキュリティ強化 Phase 1・2026-07-12）
// テスト: scripts/test-token-auth.js ／ 呼び出し元: コード.js（doGet/doPost 冒頭ガード）
//
// GAS Web App は「URLの秘匿」だけが防御線。正しいトークンを持たないリクエストを
// （enforce=ON 時に）拒否できる状態にする。トークンは ScriptProperties から読み、
// ソースにハードコードしない。呼び出し元が API_TOKEN / TOKEN_ENFORCE を読んで本関数に渡す。
//
// 設計（指示書 1-2 準拠・additive-only）:
//   checkToken(provided, expected, enforce) → { ok:boolean, reason:'valid'|'missing'|'mismatch' }
//   - reason は「トークン自体の真偽」で、access_log の token_status 列と直結。
//     enforce の値には依存しない（enforce は access_log の別列で記録するため畳み込まない）。
//   - enforce=false（初期値）: reason に関わらず ok:true（ログのみ・素通り）。
//   - enforce=true          : reason==='valid' のときだけ ok:true。
//   - fail-closed: expected(サーバー保持キー) が未設定(空/null)なら valid にならない
//     ＝ API_TOKEN を設定する前に enforce を ON にしても全通しにはならない安全側。
//   - トリムしない（トークンに空白は無い前提・intakeAuthOk_ と同方針）。
//   - ※require() は持たない（GAS本番でロード時に停止しない・他 *-core.js と同方式）。

var API_TOKEN_PROP = 'API_TOKEN';
var TOKEN_ENFORCE_PROP = 'TOKEN_ENFORCE';

function tokenIsEmpty_(v) {
  return v === null || v === undefined || v === '';
}

// provided / expected からトークンの真偽（reason）を判定する純副関数。
//   expected 未設定 → 'valid' には絶対ならない（fail-closed）。
//   provided 未設定 → 'missing'。それ以外で厳密一致 → 'valid'、不一致 → 'mismatch'。
function tokenReason_(provided, expected) {
  if (tokenIsEmpty_(provided)) return 'missing';
  if (tokenIsEmpty_(expected)) return 'mismatch'; // provided はあるが照合先が無い＝一致し得ない
  return String(provided) === String(expected) ? 'valid' : 'mismatch';
}

function checkToken(provided, expected, enforce) {
  var reason = tokenReason_(provided, expected);
  var ok = enforce ? (reason === 'valid') : true;
  return { ok: ok, reason: reason };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    API_TOKEN_PROP: API_TOKEN_PROP,
    TOKEN_ENFORCE_PROP: TOKEN_ENFORCE_PROP,
    tokenReason_: tokenReason_,
    checkToken: checkToken
  };
}
