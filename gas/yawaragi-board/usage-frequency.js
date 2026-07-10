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

// ---- 日付ヘルパ（UTC/文字列で計算・ローカルTZずれ回避）----
function _pad2(n) { return (n < 10 ? '0' : '') + n; }

// subMonths('YYYY-MM-DD', n) → n ヶ月遡った 'YYYY-MM-DD'。月末日は遡り先の月末に丸める（クランプ）。
function subMonths(dateStr, n) {
  var p = String(dateStr).split('-');
  var y = +p[0], m = +p[1], d = +p[2];
  m -= n;
  while (m < 1) { m += 12; y -= 1; }
  var dim = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 遡り先の月の末日
  if (d > dim) d = dim;
  return y + '-' + _pad2(m) + '-' + _pad2(d);
}

// 'YYYY-MM-DD' → UTCミリ秒（曜日/連日列挙をTZ非依存にする）
function _toUTC(dateStr) {
  var p = String(dateStr).split('-');
  return Date.UTC(+p[0], +p[1] - 1, +p[2]);
}
function _fromUTC(ms) {
  var dt = new Date(ms);
  return dt.getUTCFullYear() + '-' + _pad2(dt.getUTCMonth() + 1) + '-' + _pad2(dt.getUTCDate());
}
var _DAY_MS = 86400000;

// calcWindow(inputs, windowMonths, asOf) → { n, attended, rate, excludedCount, byWeekday }
// 契約 §2:
//  - 窓 = asOf から windowMonths ヶ月遡った [windowStart, asOf]（両端 inclusive・3窓共通）。
//  - 予定日 = contractWeekdays に該当する窓内の日。
//  - 除外日（分母と機会の両方から引く）= ①holidays ②absences で classifyReason==='除外'
//    （長期休みは date..endDate を毎日除外・endDate 無しは当日のみ）。
//  - n(分母) = 予定日 − 除外日。attended = 窓内・非除外の来館（契約曜日外の追加利用も加算）。
//  - rate = n===0 ? null : attended/n（NaN/Infinity/0% を返さない）。
//  - byWeekday = 契約曜日ごとの {n, attended, rate}（追加利用は積まない＝分母無し曜日キーを作らない）。
function calcWindow(inputs, windowMonths, asOf) {
  inputs = inputs || {};
  var contractWeekdays = inputs.contractWeekdays || [];
  var windowStart = subMonths(asOf, windowMonths);
  var startMs = _toUTC(windowStart), endMs = _toUTC(asOf);

  function inWindow(ds) { return ds >= windowStart && ds <= asOf; } // 文字列比較（辞書順=時系列順）

  // 契約曜日 set
  var isContractWd = {};
  contractWeekdays.forEach(function (wd) { isContractWd[wd] = true; });

  // 除外日 set（窓内のみ記録）
  var excluded = {};
  (inputs.holidays || []).forEach(function (h) { if (inWindow(h)) excluded[h] = true; });
  (inputs.absences || []).forEach(function (a) {
    if (classifyReason(a.type, a.reason, REASON_TABLE) !== '除外') return;
    if (String(a.type).trim() === '長期休み') {
      var end = a.endDate || a.date; // endDate 無し → 当日のみ
      for (var ms = _toUTC(a.date); ms <= _toUTC(end); ms += _DAY_MS) {
        var ds = _fromUTC(ms);
        if (inWindow(ds)) excluded[ds] = true;
      }
    } else {
      if (inWindow(a.date)) excluded[a.date] = true;
    }
  });

  // byWeekday 初期化（契約曜日のみ・追加利用では新キーを作らない）
  var byWeekday = {};
  contractWeekdays.forEach(function (wd) { byWeekday[wd] = { n: 0, attended: 0, rate: null }; });

  // 予定日を列挙して n / excludedCount / byWeekday.n を集計
  var n = 0, excludedCount = 0;
  for (var cur = startMs; cur <= endMs; cur += _DAY_MS) {
    var wd = new Date(cur).getUTCDay();
    if (!isContractWd[wd]) continue;
    var d = _fromUTC(cur);
    if (excluded[d]) { excludedCount++; continue; } // 予定日だが除外 → 分母に入れない
    n++;
    byWeekday[wd].n++;
  }

  // 出席日（窓内・非除外・重複排除）。契約曜日外の追加利用も overall に加算。
  var attended = 0, seen = {};
  (inputs.attendance || []).forEach(function (d) {
    if (seen[d]) return;             // 同一日を二重計上しない
    seen[d] = true;
    if (!inWindow(d)) return;
    if (excluded[d]) return;
    attended++;
    var wd = new Date(_toUTC(d)).getUTCDay();
    if (byWeekday[wd]) byWeekday[wd].attended++; // 契約曜日のみ per-weekday に積む
  });

  // per-weekday rate（n===0 は null）
  Object.keys(byWeekday).forEach(function (k) {
    var bw = byWeekday[k];
    bw.rate = bw.n === 0 ? null : bw.attended / bw.n;
  });

  var rate = n === 0 ? null : attended / n;
  return { n: n, attended: attended, rate: rate, excludedCount: excludedCount, byWeekday: byWeekday };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    THRESHOLDS: THRESHOLDS,
    REASON_TABLE: REASON_TABLE,
    classifyReason: classifyReason,
    subMonths: subMonths,
    calcWindow: calcWindow
  };
}
