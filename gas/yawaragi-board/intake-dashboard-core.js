// intake 経営ダッシュボード 純ロジック（P5・2026-07-11）
// テスト: scripts/test-intake-dashboard-core.js ／ 呼び出し元: コード.js getIntakeDashboard
// ※require()は持たない（GAS本番でロード時停止しない・他 *-core.js と同方式）。
// ※グローバルは INTAKE_DASH_ プレフィクス／core関数は dash*_ 命名（全域scope衝突回避）。

var INTAKE_DASH_PHASE_RANK = { '受付':0, '見学':1, '体験':2, '契約準備':3, '利用開始準備':4 };

// 進行中パイプラインの需給対比。ドロップ/アーカイブ/台帳反映済は除外。
function dashStageBuckets_(cases) {
  var r = { 受付:0, 進行中:{ 見学予定:0, 見学済:0, 体験予定:0, 体験済:0, 契約準備:0 }, 進行中合計:0, 開始待ち:0 };
  (cases || []).forEach(function(c) {
    var ph = String(c.フェーズ || '');
    if (ph === 'ドロップ' || ph === 'アーカイブ' || c.利用者台帳反映済 === true) return;
    if (ph === '受付') { r.受付++; return; }
    if (ph === '利用開始準備') { r.開始待ち++; return; }
    if (ph === '見学') { c.見学完了 === true ? r.進行中.見学済++ : r.進行中.見学予定++; }
    else if (ph === '体験') { c.体験完了 === true ? r.進行中.体験済++ : r.進行中.体験予定++; }
    else if (ph === '契約準備') { r.進行中.契約準備++; }
  });
  var p = r.進行中;
  r.進行中合計 = p.見学予定 + p.見学済 + p.体験予定 + p.体験済 + p.契約準備;
  return r;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dashStageBuckets_: dashStageBuckets_, INTAKE_DASH_PHASE_RANK: INTAKE_DASH_PHASE_RANK };
}
