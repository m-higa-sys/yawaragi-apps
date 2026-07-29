// intake 新規作成（createIntake）の必須項目判定 純関数（2026-07-29）
// テスト: scripts/test-intake-required-core.js ／ 呼び出し元: コード.js createIntake()
//
// 事故の経緯:
//   旧 createIntake は `if (!data.氏名 || !data.TEL)` の1行で弾いていた。
//   intake.html の「⏸️中断して保存」は氏名 / ふりがな / TEL のどれか1つで送るため、
//   「ふりがなだけ」「電話だけ」「氏名だけ（TELなし）」はサーバーが黙って捨てていた。
//   加えて shared.js gasPost が no-cors ＝ {success:false} を画面が読めず、
//   「✅保存しました」と表示してモーダルを閉じ、入力ごと消えていた。
//   → サーバー判定を画面判定に合わせる（単一の正はこの純関数）。
//
// 確定仕様（社長確認 2026-07-29）:
//   中断保存（全記入済 !== true）: 氏名 / ふりがな / TEL のうち1つでも非空ならOK
//   本保存  （全記入済 === true）: (氏名 or ふりがな) が非空 かつ TEL が非空
//   ※ 種別 / ペースメーカー / 連絡元区分 の妥当性チェックは createIntake 側に据え置き（変更なし）。
// ※require()は持たない（GAS本番でロード時に停止しない・他 *-core.js と同方式）。

// 空判定: null/undefined/空文字/空白のみ を空とみなす。
// 数値は String 化して判定する（0 は '0' ＝非空扱い）。画面は text input 由来で常に文字列のため
// 実運用で数値が来る経路はないが、シート直投入等で来ても落ちないようにしている。
function intakeValueFilled_(v) {
  if (v === null || v === undefined) return false;
  return String(v).trim() !== '';
}

// 必須判定。OK なら { ok:true }、NG なら { ok:false, error:'画面にそのまま出す文言' }。
// 引数は書き換えない（純関数）。data が null/undefined でも落ちずに NG を返す。
function intakeRequiredCheck_(data) {
  var d = data || {};
  var hasName = intakeValueFilled_(d.氏名) || intakeValueFilled_(d.ふりがな);
  var hasTel  = intakeValueFilled_(d.TEL);

  // 本保存は「全記入済 === true」のときだけ（'true' や 1 は中断扱い＝安全側）
  if (d.全記入済 === true) {
    if (!hasName) return { ok: false, error: 'お名前（漢字またはふりがな）を入れてください' };
    if (!hasTel)  return { ok: false, error: '本保存には電話番号が必要です' };
    return { ok: true };
  }

  // 中断保存: 本人を後から特定できる手がかりが1つでもあればよい
  if (!hasName && !hasTel) {
    return { ok: false, error: 'お名前か電話番号のどちらか1つは入れてください' };
  }
  return { ok: true };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    intakeValueFilled_: intakeValueFilled_,
    intakeRequiredCheck_: intakeRequiredCheck_
  };
}
