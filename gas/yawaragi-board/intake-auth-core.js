// intake系API adminKey 認証の純関数（P2.1・2026-07-11）
// テスト: scripts/test-intake-auth.js ／ 呼び出し元: コード.js intakeAdminAuthorized_()
//
// intake_* のうち個人情報を返す/変更する action は、公開HTML(intake.html / yawaragi-board.html)から
// 呼ばれるため GAS URL は秘匿できない。よってサーバー側で adminKey 必須にする。
// 既存の APPREGISTRY_ADMIN_KEY と同方式（ScriptProperties照合・fail-closed）。
// ※require()は持たない（GAS本番でロード時に停止しない・他 *-core.js と同方式）。

var INTAKE_ADMIN_KEY_PROP = 'INTAKE_ADMIN_KEY';

// provided(提供キー) と expected(サーバー保持キー) が「両方非空かつ厳密一致」のときのみ true。
// expected 未設定(空/null)なら false＝fail-closed（鍵未設定時は通さない）。トリムしない（UUIDに空白は無い）。
function intakeAuthOk_(provided, expected) {
  if (expected === null || expected === undefined || expected === '') return false;
  if (provided === null || provided === undefined || provided === '') return false;
  return String(provided) === String(expected);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    INTAKE_ADMIN_KEY_PROP: INTAKE_ADMIN_KEY_PROP,
    intakeAuthOk_: intakeAuthOk_
  };
}
