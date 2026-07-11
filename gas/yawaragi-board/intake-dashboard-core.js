// intake 経営ダッシュボード 純ロジック（P5・2026-07-11）
// テスト: scripts/test-intake-dashboard-core.js ／ 呼び出し元: コード.js getIntakeDashboard
// ※require()は持たない（GAS本番でロード時停止しない・他 *-core.js と同方式）。
// ※グローバルは INTAKE_DASH_ プレフィクス／core関数は dash*_ 命名（全域scope衝突回避）。

var INTAKE_DASH_PHASE_RANK = { '受付':0, '見学':1, '体験':2, '契約準備':3, '利用開始準備':4 };

// 進行中パイプラインの需給対比。ドロップ/アーカイブ/台帳反映済は除外。
function dashStageBuckets_(cases) {
  var r = { 受付:0, 進行中:{ 見学予定:0, 見学済:0, 体験予定:0, 体験済:0, 契約準備:0 }, 進行中合計:0, 開始待ち:0, その他:0 };
  (cases || []).forEach(function(c) {
    var ph = String(c.フェーズ || '');
    if (ph === 'ドロップ' || ph === 'アーカイブ' || c.利用者台帳反映済 === true) return;
    if (!ph) ph = '受付'; // 空フェーズはgetIntakeFunnel慣例に合わせ受付扱い
    if (ph === '受付') { r.受付++; return; }
    if (ph === '利用開始準備') { r.開始待ち++; return; }
    if (ph === '見学') { c.見学完了 === true ? r.進行中.見学済++ : r.進行中.見学予定++; }
    else if (ph === '体験') { c.体験完了 === true ? r.進行中.体験済++ : r.進行中.体験予定++; }
    else if (ph === '契約準備') { r.進行中.契約準備++; }
    else { r.その他++; } // 非空の未知フェーズはサイレント欠落させず可視化
  });
  var p = r.進行中;
  r.進行中合計 = p.見学予定 + p.見学済 + p.体験予定 + p.体験済 + p.契約準備;
  return r;
}

// yyyy-MM-dd 2つの日数差（b - a）。どちらか不正なら null。
function INTAKE_DASH_daysBetween_(a, b) {
  var da = new Date(String(a || '').slice(0,10) + 'T00:00:00');
  var db = new Date(String(b || '').slice(0,10) + 'T00:00:00');
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function INTAKE_DASH_median_(nums) {
  if (!nums.length) return null;
  var s = nums.slice().sort(function(x,y){ return x - y; });
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}

// 所要日数（問い合わせ日→本格利用開始日）。対象＝本格利用開始日が過去日のみ。
function dashLeadTime_(cases, today) {
  var out = [];
  (cases || []).forEach(function(c) {
    var start = String(c.本格利用開始日 || '');
    if (!start) return;
    if (INTAKE_DASH_daysBetween_(today, start) > 0) return; // 未来日は除外
    var days = INTAKE_DASH_daysBetween_(c.問い合わせ日, start);
    if (days === null) return;
    var hist = Array.isArray(c.履歴) ? c.履歴 : [];
    var rec = { 氏名: c.氏名 || '', days: days, source: hist.length ? 'history' : 'approx' };
    if (hist.length) {
      var seg = {};
      var prevAt = c.問い合わせ日;
      hist.forEach(function(h) {
        var d = INTAKE_DASH_daysBetween_(prevAt, h.at);
        if (d !== null) seg[h.from + '→' + h.to] = d;
        prevAt = h.at;
      });
      rec.段階別 = seg;
    }
    out.push(rec);
  });
  var nums = out.map(function(r){ return r.days; });
  return { 中央値: INTAKE_DASH_median_(nums), 件数: out.length, cases: out };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    dashStageBuckets_: dashStageBuckets_,
    INTAKE_DASH_PHASE_RANK: INTAKE_DASH_PHASE_RANK,
    dashLeadTime_: dashLeadTime_,
    INTAKE_DASH_daysBetween_: INTAKE_DASH_daysBetween_,
    INTAKE_DASH_median_: INTAKE_DASH_median_
  };
}
