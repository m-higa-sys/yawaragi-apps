// 出席率・利用頻度ビュー 純関数（2026-07-12）
// テスト: scripts/test-attendance-view-core.js ／ 呼び出し元: コード.js attendance_view(e)
// ※require()は持たない（GAS本番でロード時停止しない・他 *-core.js と同方式）。
// ※グローバルは av プレフィクス徹底（コード.js 全域scope衝突回避）。
var AV_CAP = 18;
var AV_DAYS = ['月', '火', '水', '木', '金'];
var AV_SLOT_OF = { am: '午前', pm: '午後' };
var AV_WEEKDAY_CHARS = ['月', '火', '水', '木', '金', '土', '日'];

// 曜日別ampmパース（複合"月午前、木午後"を曜日ごとに正しい時間帯へ）。intake.html KD_slotSet_ と同一。
function avSlotSet_(days, ampm) {
  var daysStr = String(days || '');
  var dayList = AV_WEEKDAY_CHARS.filter(function (d) { return daysStr.indexOf(d) >= 0; });
  var set = {};
  String(ampm || '').split(/[、，,]/).forEach(function (seg) {
    seg = String(seg).trim(); if (!seg) return;
    var slots = [];
    if (seg.indexOf('午前') >= 0) slots.push('午前');
    if (seg.indexOf('午後') >= 0) slots.push('午後');
    if (!slots.length) return;
    var segDays = AV_WEEKDAY_CHARS.filter(function (d) { return seg.indexOf(d) >= 0; });
    if (segDays.length) {
      segDays.forEach(function (d) { if (dayList.indexOf(d) >= 0) slots.forEach(function (s) { set[d + '|' + s] = true; }); });
    } else {
      dayList.forEach(function (d) { slots.forEach(function (s) { set[d + '|' + s] = true; }); });
    }
  });
  return set;
}
function avAttendsCell_(days, ampm, day, sess) { return !!avSlotSet_(days, ampm)[day + '|' + AV_SLOT_OF[sess]]; }

function avContractN_(days) {
  var s = String(days || '');
  return AV_WEEKDAY_CHARS.filter(function (d) { return s.indexOf(d) >= 0; }).length;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AV_CAP: AV_CAP, AV_DAYS: AV_DAYS, AV_SLOT_OF: AV_SLOT_OF,
    avSlotSet_: avSlotSet_, avAttendsCell_: avAttendsCell_,
    avContractN_: avContractN_
  };
}
