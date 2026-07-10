// 利用頻度v1.1 純関数層（SpreadsheetApp非依存・本番getUsageAlerts/judgeUsageBadgeV2不触・書込ゼロ）
// テスト: scripts/test-usage-frequency.js ／ 契約: 設計書 2026-07-09-riyou-hindo-keisan-v1.1-design.md
// Task1: classifyReason + THRESHOLDS + REASON_TABLE のみ（calcWindow/judge等は後続タスク）

// しきい値（設計書リテラル準拠・％の数／回数）。ドリフト禁止。
var THRESHOLDS = { 減らし: 70, 増やし: 110, 曜日差: 20, n下限: 6, 期間: 3 };

// 欠席理由 対応表。除外=分母と機会の両方から引く／カウント=率が下がる側（除外しない）。
var REASON_TABLE = {
  除外: ['入院', '施設側中止', '長期不在'],   // ショート等は長期不在に含む
  カウント: ['体調不良', '本人都合', '家族都合', '通院']
};

// classifyReason(type, reason, table) → '除外' | 'カウント' | '未分類'
// - type === '長期休み' → '除外'（reason 問わず・type優先）
// - type === '欠席' → table で reason を引く（除外一致→'除外' / カウント一致→'カウント' / どちらも無し→'未分類'）
// - 未知 type / 未知・空 reason → '未分類'（保留。黙って率を下げない）
function classifyReason(type, reason, table) {
  var t = String(type == null ? '' : type).trim();
  if (t === '長期休み') return '除外';
  if (t !== '欠席') return '未分類';
  var tbl = table || REASON_TABLE;
  var r = String(reason == null ? '' : reason).trim();
  if (!r) return '未分類';
  if (tbl['除外'] && tbl['除外'].indexOf(r) !== -1) return '除外';
  if (tbl['カウント'] && tbl['カウント'].indexOf(r) !== -1) return 'カウント';
  return '未分類';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    THRESHOLDS: THRESHOLDS,
    REASON_TABLE: REASON_TABLE,
    classifyReason: classifyReason
  };
}
