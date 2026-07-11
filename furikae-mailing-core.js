// furikae-mailing-core.js — 依頼書「郵送必着」ロジック（純関数・ブラウザ+Node共有・UMD）
// 一次情報: CSS_kofuri2026schedule_2.pdf（株式会社電算システム・2026年・毎月27日振替）。
//   列見出し「新規依頼書締切日（当社到着日）」＝ FURIKAE_SCHEDULE.deadline ＝【必着日】（郵送締切ではない）。
//   ∴ 投函期限 = 必着 − 輸送営業日数。郵送日=到着日とみなす旧実装は必着落ちを招く。
// 社長確定: 普通郵便・切手貼付で継続（速達/レターパックは Phase 2・ここでは扱わない）。
//   普通郵便（引落→岐阜）は行政処分等で遅延常態化so 公称3営業日＋遅延マージン2営業日＝安全ライン5営業日。
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { root.FurikaeMailing = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TRANSIT_BUSINESS_DAYS = 3; // 普通郵便・遅方（引落→岐阜）公称
  var SAFE_MARGIN_DAYS = 2;      // 遅延リスク（日本郵便の行政処分・天候等）
  // 安全ライン = 必着 −(TRANSIT+SAFE_MARGIN)= −5営業日 ／ 限界ライン = 必着 − TRANSIT = −3営業日

  // 2026年 日本の祝日（振替休日含む）。営業日計算で除外。★7/20海の日・9/21-23SW3連を落とすと計算が狂う。
  var HOLIDAYS_2026 = {
    '2026-01-01': '元日', '2026-01-12': '成人の日',
    '2026-02-11': '建国記念の日', '2026-02-23': '天皇誕生日',
    '2026-03-20': '春分の日', '2026-04-29': '昭和の日',
    '2026-05-04': 'みどりの日', '2026-05-05': 'こどもの日', '2026-05-06': '振替休日',
    '2026-07-20': '海の日', '2026-08-11': '山の日',
    '2026-09-21': '敬老の日', '2026-09-22': '国民の休日', '2026-09-23': '秋分の日',
    '2026-10-12': 'スポーツの日', '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日'
    // 5/3(憲法記念日)は日曜so営業日判定(土日)で除外、その振替休日が5/6。
  };

  function toDate(d) {
    if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var p = String(d).split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }
  function fmt(dt) {
    var y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  // 営業日判定＝土日および祝日を除外
  function isBusinessDay(date, holidays) {
    holidays = holidays || HOLIDAYS_2026;
    var dt = toDate(date), wd = dt.getDay();
    if (wd === 0 || wd === 6) return false;      // 日・土
    if (holidays[fmt(dt)]) return false;          // 祝日
    return true;
  }

  // date から n営業日 遡った日（date自身は含めない）
  function subtractBusinessDays(date, n, holidays) {
    var dt = toDate(date), cnt = 0;
    while (cnt < n) { dt.setDate(dt.getDate() - 1); if (isBusinessDay(dt, holidays)) cnt++; }
    return fmt(dt);
  }
  // date に n営業日 加えた日（到着見込用・date自身は含めない）
  function addBusinessDays(date, n, holidays) {
    var dt = toDate(date), cnt = 0;
    while (cnt < n) { dt.setDate(dt.getDate() + 1); if (isBusinessDay(dt, holidays)) cnt++; }
    return fmt(dt);
  }
  // 投函期限 = 必着(deadline) − days営業日
  function mailByDate(deadline, days, holidays) {
    return subtractBusinessDays(deadline, days, holidays);
  }

  // 郵送日→引落開始予定日。★到着見込(sentDate + TRANSIT営業日) ≤ 必着 の最初の振替日。
  //   旧実装 sentDate<=deadline（郵送=到着・輸送ゼロ）を廃し、輸送日数を乗せる。
  function guessExpectedDate(sentDate, schedule, opts) {
    opts = opts || {};
    var transit = (opts.transit != null) ? opts.transit : TRANSIT_BUSINESS_DAYS;
    var holidays = opts.holidays || HOLIDAYS_2026;
    var arrival = addBusinessDays(sentDate, transit, holidays);
    for (var i = 0; i < schedule.length; i++) {
      if (arrival <= schedule[i].deadline) return schedule[i].furikaeDate;
    }
    return '2027-01-27'; // 2026年内に間に合わない
  }

  // 4バンド判定（today と 必着deadline）。過大に見積もらず ふわり3段＋超過で表示。
  //   🟢安全: today ≤ 必着−5営業日 ／ 🟡ぎりぎり: −4〜−3営業日 ／ 🔴急ぎ: −2営業日〜必着 ／ ⛔超過: today>必着
  function mailingBand(today, deadline, opts) {
    opts = opts || {};
    var holidays = opts.holidays || HOLIDAYS_2026;
    var transit = (opts.transit != null) ? opts.transit : TRANSIT_BUSINESS_DAYS;
    var margin = (opts.margin != null) ? opts.margin : SAFE_MARGIN_DAYS;
    var safeBy = subtractBusinessDays(deadline, transit + margin, holidays); // 必着−5営業日
    var limitBy = subtractBusinessDays(deadline, transit, holidays);         // 必着−3営業日（限界＝間に合う最終投函）
    var rushFrom = subtractBusinessDays(deadline, transit - 1, holidays);    // 必着−2営業日（🔴開始）
    var band;
    if (today > deadline) band = { key: 'over', mark: '⛔', label: '超過' };
    else if (today >= rushFrom) band = { key: 'rush', mark: '🔴', label: '急ぎ' };
    else if (today > safeBy) band = { key: 'tight', mark: '🟡', label: 'ぎりぎり' };
    else band = { key: 'safe', mark: '🟢', label: '安全' };
    return { key: band.key, mark: band.mark, label: band.label, safeBy: safeBy, limitBy: limitBy, deadline: deadline };
  }

  return {
    TRANSIT_BUSINESS_DAYS: TRANSIT_BUSINESS_DAYS,
    SAFE_MARGIN_DAYS: SAFE_MARGIN_DAYS,
    HOLIDAYS_2026: HOLIDAYS_2026,
    isBusinessDay: isBusinessDay,
    subtractBusinessDays: subtractBusinessDays,
    addBusinessDays: addBusinessDays,
    mailByDate: mailByDate,
    guessExpectedDate: guessExpectedDate,
    mailingBand: mailingBand
  };
});
