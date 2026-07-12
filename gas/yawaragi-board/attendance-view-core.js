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

// 全在籍(非中止・要介護+要支援すべて)から占有[曜日]{am,pm}を集計。椅子は共有so全員数える。
function avOccupancy_(patternsAll) {
  var occ = {};
  AV_DAYS.forEach(function (d) { occ[d] = { am: 0, pm: 0 }; });
  (patternsAll || []).forEach(function (u) {
    AV_DAYS.forEach(function (d) {
      if (avAttendsCell_(u.days, u.unit, d, 'am')) occ[d].am++;
      if (avAttendsCell_(u.days, u.unit, d, 'pm')) occ[d].pm++;
    });
  });
  return occ;
}
function avSlotsFree_(occupancy, capacity) {
  var free = {};
  AV_DAYS.forEach(function (d) {
    var o = occupancy[d] || { am: 0, pm: 0 };
    free[d] = { am: Math.max(0, capacity - o.am), pm: Math.max(0, capacity - o.pm) };
  });
  return free;
}

// 'YYYY-MM-DD' の n ヶ月前を返す（日は保持・末日補正は簡易＝そのまま）。
function avDateMinusMonths_(ymd, n) {
  var p = String(ymd).split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = p[2] || '01';
  m -= n;
  while (m <= 0) { m += 12; y -= 1; }
  return y + '-' + ('0' + m).slice(-2) + '-' + d;
}
// today('YYYY-MM-DD')基準の直近完了3ヶ月 ['YYYY-MM',...]（昇順）
function avLast3CompletedMonths_(today) {
  var p = String(today).split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
  var out = [];
  for (var k = 3; k >= 1; k--) {
    var yy = y, mm = m - k;
    while (mm <= 0) { mm += 12; yy -= 1; }
    out.push(yy + '-' + ('0' + mm).slice(-2));
  }
  return out;
}

// monthlyCounts={ym:{scheduled,attended}}, window=率計算対象月[], displayMonths=月別列[]
// 返り値: { rate(%|null), windowAttended, windowScheduled, monthly:{ym:%|null} }
function avUserOpsRate_(monthlyCounts, windowMonths, displayMonths) {
  monthlyCounts = monthlyCounts || {};
  var wa = 0, ws = 0;
  (windowMonths || []).forEach(function (ym) {
    var mc = monthlyCounts[ym];
    if (mc) { wa += mc.attended; ws += mc.scheduled; }
  });
  var rate = ws > 0 ? Math.round((1000 * wa) / ws) / 10 : null;
  var monthly = {};
  (displayMonths || []).forEach(function (ym) {
    var mc = monthlyCounts[ym];
    monthly[ym] = (mc && mc.scheduled > 0) ? Math.round((1000 * mc.attended) / mc.scheduled) / 10 : null;
  });
  return { rate: rate, windowAttended: wa, windowScheduled: ws, monthly: monthly };
}

function avActualPerWeek_(contractN, rate) {
  if (rate == null) return { actualPerWeek: null, diverge: null };
  var apw = Math.round((contractN * rate)) / 100; // contractN×(rate/100)を小数2桁
  var diverge = Math.round((contractN - apw) * 100) / 100;
  return { actualPerWeek: apw, diverge: diverge };
}

// 状態＋ラベル。hanteichu = 利用開始日が today の3ヶ月前より新しい（3ヶ月経過で自動normal復帰）。
function avDisplayState_(opt) {
  opt = opt || {};
  if (opt.isLongLeave) return { state: 'chouki', label: '算出不可' };
  var sd = String(opt.startDate || '').trim();
  if (sd && sd > avDateMinusMonths_(opt.today, 3)) return { state: 'hanteichu', label: '判定中（データ蓄積中）' };
  if (opt.isWeekdayChange) return { state: 'sanko', label: '参考値（率が不正確）' };
  return { state: 'normal', label: '' };
}

// 追加できる空き枠：候補が使うampm(am/pm)を保ったまま、月〜金(現曜日除く)で空き>0の枠。
function avAddableSlots_(days, unit, slotsFree) {
  var mySet = avSlotSet_(days, unit);
  var useAm = false, usePm = false;
  Object.keys(mySet).forEach(function (k) {
    if (k.indexOf('午前') >= 0) useAm = true;
    if (k.indexOf('午後') >= 0) usePm = true;
  });
  var daysStr = String(days || '');
  var out = [];
  var passes = [];
  if (useAm) passes.push({ sess: 'am', label: 'AM' });
  if (usePm) passes.push({ sess: 'pm', label: 'PM' });
  passes.forEach(function (p) {
    AV_DAYS.forEach(function (d) {
      if (daysStr.indexOf(d) >= 0) return;          // 現曜日は除外
      var f = slotsFree[d] || { am: 0, pm: 0 };
      if (f[p.sess] > 0) out.push(d + p.label);
    });
  });
  return out;
}
function avIsUpsizeCandidate_(state, contractN) { return state === 'normal' && contractN === 1; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AV_CAP: AV_CAP, AV_DAYS: AV_DAYS, AV_SLOT_OF: AV_SLOT_OF,
    avSlotSet_: avSlotSet_, avAttendsCell_: avAttendsCell_,
    avContractN_: avContractN_,
    avOccupancy_: avOccupancy_, avSlotsFree_: avSlotsFree_,
    avDateMinusMonths_: avDateMinusMonths_, avLast3CompletedMonths_: avLast3CompletedMonths_,
    avUserOpsRate_: avUserOpsRate_,
    avActualPerWeek_: avActualPerWeek_,
    avDisplayState_: avDisplayState_,
    avAddableSlots_: avAddableSlots_, avIsUpsizeCandidate_: avIsUpsizeCandidate_
  };
}
