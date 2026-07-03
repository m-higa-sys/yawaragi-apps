// 欠席 (date,unit) 正規化＋今週まるごと候補＋1通ラベル 純ロジック正本（2026-06-19）
// 休み連絡メールリニューアル。I/Oは コード.js / genba.html 側に置き、判定だけここに集約。
// node でテスト可能（scripts/test-absence-slots.js）。GAS では関数がそのまま読まれる。
//
// 設計（確定仕様）:
//   - 全入口（単日/連続範囲/飛び石/今週まるごと）を (date,unit) 集合に正規化してから一本化処理する。
//   - unit は曜日で午前/午後が混在し得る。終日は am/pm の2ペアに分解して渡す（'終日' は使わない）。
//   - 「今週まるごと」は今週(月〜日)のうち「今日(アンカー)以降」の通所(date,unit)のみ。過去日は含めない。

var _DOW_JP = ['日', '月', '火', '水', '木', '金', '土'];

function _ymd_(d) {
  var y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), da = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + da;
}
function _parseYmd_(s) {
  var p = String(s).split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
function _unitJp_(u) {
  return (u === 'pm' || u === '午後') ? '午後' : '午前';
}

// 今日以降・今週(月〜日)の通所(date,unit)を pattern から生成。日付昇順、同日は午前→午後。
//   pattern: [{day:0..6(0=日,JS getDayと同じ), unit:'am'|'pm'}]
function weekAbsenceSlots_(pattern, todayStr) {
  var today = _parseYmd_(todayStr);
  var dow = today.getDay();                       // 0=日
  var offsetToMon = (dow === 0 ? -6 : 1 - dow);   // その週の月曜まで
  var monday = new Date(today);
  monday.setDate(today.getDate() + offsetToMon);
  var slots = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    if (_ymd_(d) < todayStr) continue;            // 今日(アンカー)以降のみ
    var wd = d.getDay();
    ['am', 'pm'].forEach(function (u) {
      var hit = (pattern || []).some(function (p) { return p.day === wd && p.unit === u; });
      if (hit) slots.push({ date: _ymd_(d), unit: _unitJp_(u) });
    });
  }
  return normalizeSlots_(slots);
}

// 任意の (date,unit) 入力を重複排除・昇順(date→午前先)に正規化。'am'/'pm' は '午前'/'午後' に揃える。
function normalizeSlots_(slots) {
  var seen = {}, out = [];
  (slots || []).forEach(function (s) {
    var u = _unitJp_(s.unit);
    var key = s.date + '|' + u;
    if (seen[key]) return;
    seen[key] = true;
    out.push({ date: s.date, unit: u });
  });
  out.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.unit === '午前' ? -1 : 1;
  });
  return out;
}

// (date,unit)集合→日付重複排除して「M月D日(曜)」連結（複数日でも1通の件名/本文ラベル用）。
function buildAbsenceDateLabel_(slots) {
  var seen = {}, labels = [];
  normalizeSlots_(slots).forEach(function (s) {
    if (seen[s.date]) return;
    seen[s.date] = true;
    var d = _parseYmd_(s.date);
    labels.push((d.getMonth() + 1) + '月' + d.getDate() + '日(' + _DOW_JP[d.getDay()] + ')');
  });
  return labels.join('、');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    weekAbsenceSlots_: weekAbsenceSlots_,
    normalizeSlots_: normalizeSlots_,
    buildAbsenceDateLabel_: buildAbsenceDateLabel_
  };
}
