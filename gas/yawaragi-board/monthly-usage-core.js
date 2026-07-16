// 2026-07-16 月次利用状況モーダル（出席予定タブ→名前タップ）の「実績ゲート」純関数。
// GAS/node 両用（session-board-core.js と同じ流儀）。SpreadsheetApp 等の GAS API に依存しない。
//
// 事案: 契約曜日=金・月 の利用者で、未来日(07-17・07-24)が緑=来館として表示されていた。
// 原因: 出勤送迎表(dailyOps)は先の日まで「予定」で埋める台帳なのに、
//       am/pm.users に名前が居るだけで attended=true にしていた（実績／過去日のゲートが無い）。
// 方針: 緑(attended)＝「送迎表に non-absent の記録がある」かつ「date < today(JST)」の実績日のみ。
//       今日・未来・予定のみの日は緑にしない（attended=false → scheduled=#edf2f7 の灰で描画）。
//
// 実績フラグについて: dailyOps の day.confirmed は実績の判別に使えない。
//   2026-07-16 の getOps 実測で全期間 false:52 / true:1 であり、
//   過去の実実績日(07-03/06/10/13)ですら false のため、これでゲートすると緑が消える。
//   よって「date < today(JST)」を実績の判定に用いる。
//
// サマリー(利用n回/利用率)は従来通り予定込みで数える（既存表示を変えないため）。

// 実績日か（＝過去日か）。today と同日・未来日は実績とみなさない。
function muIsActualVisitDate_(dateStr, todayStr) {
  if (!dateStr || !todayStr) return false;
  return String(dateStr) < String(todayStr);
}

// 緑(attended)にしてよいか＝送迎表に実績(non-absent)があり、かつ実績日(過去日)であること。
function muShouldMarkAttended_(unitAttended, dateStr, todayStr) {
  if (!unitAttended) return false;
  return muIsActualVisitDate_(dateStr, todayStr);
}

// dailyOps を dayMap へマージし、サマリー用カウンタを返す。
// extractFn(dayOps, name) -> { attended, noPickup } は呼び出し側から注入（既存 _muExtractUserDayState）。
// dayMap は破壊的に更新する（既存 getMonthlyUsage の挙動を踏襲）。
function muMergeDailyOpsIntoDayMap_(dayMap, dailyOps, name, todayStr, extractFn) {
  var counters = { attended: 0, noPickup: 0 };
  if (!dayMap || !dailyOps || typeof extractFn !== 'function') return counters;

  Object.keys(dailyOps).forEach(function (date) {
    if (dayMap[date] && dayMap[date].absent) return;  // 欠席登録ある日はスキップ（従来通り）
    var st = extractFn(dailyOps[date], name);
    if (!st || !st.attended) return;

    var green = muShouldMarkAttended_(st.attended, date, todayStr);
    if (!dayMap[date]) {
      // 利用予定外の日に来館（イレギュラー出席）→ days に追加（従来通り）
      dayMap[date] = { date: date, attended: green, absent: false, noPickup: st.noPickup, reason: '' };
    } else {
      dayMap[date].attended = green;
      dayMap[date].noPickup = st.noPickup;
    }

    counters.attended++;              // サマリーは予定込みのまま（利用回数・利用率を変えない）
    if (st.noPickup) counters.noPickup++;
  });

  return counters;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    muIsActualVisitDate_: muIsActualVisitDate_,
    muShouldMarkAttended_: muShouldMarkAttended_,
    muMergeDailyOpsIntoDayMap_: muMergeDailyOpsIntoDayMap_
  };
}
