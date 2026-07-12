// 出席率・利用頻度ビュー 純関数（2026-07-12）
// テスト: scripts/test-attendance-view-core.js ／ 呼び出し元: コード.js attendance_view(e)
// ※require()は持たない（GAS本番でロード時停止しない・他 *-core.js と同方式）。
// ※グローバルは av プレフィクス徹底（コード.js 全域scope衝突回避）。
var AV_CAP = 18;
var AV_DAYS = ['月', '火', '水', '木', '金'];
var AV_SLOT_OF = { am: '午前', pm: '午後' };
var AV_WEEKDAY_CHARS = ['月', '火', '水', '木', '金', '土', '日'];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AV_CAP: AV_CAP, AV_DAYS: AV_DAYS, AV_SLOT_OF: AV_SLOT_OF
  };
}
