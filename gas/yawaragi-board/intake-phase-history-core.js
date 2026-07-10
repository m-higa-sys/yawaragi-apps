// intakeフェーズ遷移履歴の純関数（P1・2026-07-10）
// テスト: scripts/test-intake-phase-history.js
// 呼び出し元: コード.js createIntake / advanceIntakePhase / dropIntake
//
// 「見学体験新規」シート末尾列「フェーズ遷移履歴」に、遷移1件ごとの
// {from,to,at,by,reason} を JSON配列として追記型で保存する（上書きしない）。
// 既存が空/壊れていても落ちず [] から開始する（位置ベース書込のため列破壊を避ける）。
// ※require()は持たない（GAS本番でロード時に停止しない・他 *-core.js と同方式）。

var INTAKE_PHASE_HISTORY_HEADER = 'フェーズ遷移履歴';

// 既存セル値（JSON文字列 or 空 or 既に配列）を配列へ。壊れていても落ちず [] を返す。
function parsePhaseHistory_(existing) {
  if (Array.isArray(existing)) return existing.slice();
  if (existing === null || existing === undefined || existing === '') return [];
  try {
    var p = JSON.parse(String(existing));
    return Array.isArray(p) ? p : [];
  } catch (e) {
    return [];
  }
}

// 既存履歴に entry を1件追記し、JSON文字列で返す（純関数・at/by は呼び出し側が渡す＝テスト可能）。
function appendPhaseHistory_(existing, entry) {
  var arr = parsePhaseHistory_(existing);
  arr.push(entry);
  return JSON.stringify(arr);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    INTAKE_PHASE_HISTORY_HEADER: INTAKE_PHASE_HISTORY_HEADER,
    parsePhaseHistory_: parsePhaseHistory_,
    appendPhaseHistory_: appendPhaseHistory_
  };
}
