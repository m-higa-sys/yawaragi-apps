// measure-core.js — 測定アプリ①の判定純関数（GAS API/DOM非依存・browser/node両用）。
// 期限計算(sokuteiDueDate_/sokuteiCycleMonths_)は shared.js §I にあり、ブラウザではグローバル、
// テストでは注入する（新コピーを増やさない）。名寄せは session-board-core.js:sbNormalizeName_ を正として踏襲。
// 書込は既存action(updateKeikakusho/addShienSokutei)を叩くだけ・新actionは作らない。

// 名寄せ正規化＝全突合キーの唯一の正（sbNormalizeName_ と同一ロジック・NFKC＋全空白除去＋末尾敬称除去）。
function msNormalizeName_(name) {
  var s = String(name == null ? '' : name);
  if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  s = s.replace(/[\s　]+/g, '');
  s = s.replace(/(様|さま|サマ)$/, '');
  return s;
}

// 現サイクル計画月: planStart(YYYY-MM)+planMonths から today 時点で「直近の計画月」を返す。
// 要介護は updateKeikakusho の行キー(userId+year+month)がこの計画月＝③のボード✓印と同一キーになる。
// L=3: planStart + 3k（today以前の最大の計画月）。L≠3(変則): 計画月=planStart のみ（isPlanMonth と整合）。
// planStart 不正は null。返り: { year, month } | null。
function msCurrentPlanMonth(planStart, planMonths, today) {
  var m = String(planStart || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  var py = parseInt(m[1], 10), pm = parseInt(m[2], 10);
  var ty = parseInt(String(today).slice(0, 4), 10);
  var tm = parseInt(String(today).slice(5, 7), 10);
  var diff = (ty - py) * 12 + (tm - pm);
  var pmNum = parseInt(planMonths, 10);
  var L = (pmNum >= 1 && pmNum <= 12) ? pmNum : 3;
  var add = 0;
  if (L === 3) add = 3 * (diff < 0 ? 0 : Math.floor(diff / 3));
  var m0 = (pm - 1) + add;
  var ny = py + Math.floor(m0 / 12);
  var nm = (m0 % 12) + 1;
  return { year: ny, month: nm };
}

// 対象日の当月末(YYYY-MM-DD)
function msMonthEnd_(today) {
  var y = parseInt(String(today).slice(0, 4), 10);
  var mo = parseInt(String(today).slice(5, 7), 10);
  var last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return String(today).slice(0, 7) + '-' + (last < 10 ? '0' : '') + last;
}

// 測定対象リスト。全母集団(今日不在含む)から「今月期限＋スライド超過(先月以前期限だが未測定)」を抽出。
//   universe: [{ key, name, care, planStart?, planMonths? }]（planStart/planMonthsは要介護のみ・routing用）
//   prevMeasuredByKey: { key(またはnormalized) → 前回測定日YYYY-MM-DD }（mergeSokuteiRecords 由来。
//       期限アンカーは includePaper:true で紙seedを含める＝呼び出し側の使い分け。ここでは渡された前回日を信頼）
//   todayAttendees: [{ name, session }]（sessionBoard の当日出席者）
//   dueDateFn: sokuteiDueDate_（shared.js）を注入
// 次回期限=dueDateFn(前回,care)。前回なし=today(即due)。次回期限>当月末＝今サイクル中(sunk)＝除外。
// 返り: [{ key, name, care, 前回測定日, 次回期限, status:'overdue'|'due', attendingToday, session }]
//   status: 次回期限が今月より前=overdue(赤・最上部) / 今月内=due。並び: overdue先→due、各群 次回期限昇順。
function msBuildMeasurementTargets(universe, prevMeasuredByKey, todayAttendees, today, dueDateFn) {
  var prev = prevMeasuredByKey || {};
  var attByKey = {};
  (todayAttendees || []).forEach(function (a) { attByKey[msNormalizeName_(a.name)] = a; });
  var monthEnd = msMonthEnd_(today);
  var monthStart = String(today).slice(0, 7) + '-01';
  var out = [];
  (universe || []).forEach(function (u) {
    var nkey = msNormalizeName_(u.name != null ? u.name : u.key);
    var last = prev[u.key];
    if (last == null) last = prev[nkey];
    last = last || '';
    var due = last ? dueDateFn(last, u.care) : today;
    if (due > monthEnd) return;                 // 未来期限=今サイクル中=sunk除外
    var status = (due < monthStart) ? 'overdue' : 'due';
    var att = attByKey[nkey];
    out.push({
      key: u.key, name: u.name, care: u.care,
      前回測定日: last, 次回期限: due, status: status,
      attendingToday: !!att, session: att ? att.session : ''
    });
  });
  out.sort(function (a, b) {
    var rank = { overdue: 0, due: 1 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return a.次回期限 < b.次回期限 ? -1 : (a.次回期限 > b.次回期限 ? 1 : 0);
  });
  return out;
}

// 介護度で書込先を振り分ける純関数（既存action引数を組み立てるだけ・送信はしない）。
//   target: { key, name, care, planStart?, planMonths? }
//   values: { sokuteiDate?, sokuteiBy, outputBy? }（測定日省略=today）
// 要介護 → updateKeikakusho（userId+計画月year/month、sokutei_date/sokutei_by/output_by の3項目。出力者空→測定者）。
// 要支援・事業対象 → addShienSokutei（name+date+by。出力者は持たない＝要支援シートに列なし・ⓑ確定）。
function msRouteWrite(target, values, today) {
  var care = String(target.care || '');
  var date = (values && values.sokuteiDate) || today;
  var by = (values && values.sokuteiBy) || '';
  if (care.indexOf('要介護') === 0) {
    var out = (values && values.outputBy) || by;  // 出力者空→測定者を初期採用
    var pm = msCurrentPlanMonth(target.planStart, target.planMonths, today);
    return {
      action: 'updateKeikakusho',
      userId: target.key,
      year: pm ? pm.year : null,
      month: pm ? pm.month : null,
      jobs: [
        { field: 'sokutei_date', value: date },
        { field: 'sokutei_by', value: by },
        { field: 'output_by', value: out }
      ]
    };
  }
  return { action: 'addShienSokutei', name: target.key, date: date, by: by };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    msNormalizeName_: msNormalizeName_,
    msCurrentPlanMonth: msCurrentPlanMonth,
    msMonthEnd_: msMonthEnd_,
    msBuildMeasurementTargets: msBuildMeasurementTargets,
    msRouteWrite: msRouteWrite
  };
}
