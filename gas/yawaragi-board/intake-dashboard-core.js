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

// 案件が stage（'見学'|'体験'|'契約準備'）に到達したか。履歴優先→現フェーズ/日付/フラグで概算。
function dashReached_(c, stage) {
  var ph = String(c.フェーズ || '');
  if (ph === 'アーカイブ') return true; // アーカイブ=利用開始まで到達し完了した案件so全段階到達扱い（getIntakeFunnelと同semantics）
  var hist = Array.isArray(c.履歴) ? c.履歴 : [];
  var wantRank = INTAKE_DASH_PHASE_RANK[stage];
  for (var i = 0; i < hist.length; i++) {
    var r = INTAKE_DASH_PHASE_RANK[hist[i].to];
    if (r !== undefined && r >= wantRank) return true;
  }
  var cur = INTAKE_DASH_PHASE_RANK[String(c.フェーズ || '')];
  if (cur !== undefined && cur >= wantRank) return true;
  if (stage === '見学'   && (c.見学日 || c.見学完了 === true)) return true;
  if (stage === '体験'   && c.体験完了 === true) return true; // 体験日列は存在しないので完了フラグのみ
  if (stage === '契約準備' && (c.契約日 || c.契約書取り交わし済 === true)) return true;
  return false;
}

// 段階遷移の歩留まり（累計）。進行中は分母/分子から除外し別枠。
function dashConversion_(cases) {
  function step(fromStage, toStage) {
    var 分母 = 0, 分子 = 0, 進行中N = 0;
    (cases || []).forEach(function(c) {
      if (!dashReached_(c, fromStage)) return;
      var reachedNext = dashReached_(c, toStage);
      var dropped = String(c.フェーズ || '') === 'ドロップ';
      if (reachedNext) { 分母++; 分子++; }
      else if (dropped) { 分母++; }
      else { 進行中N++; }
    });
    return { 分母: 分母, 分子: 分子, 率: 分母 ? Math.round(分子 / 分母 * 1000) / 1000 : null, 進行中N: 進行中N };
  }
  return {
    見学到達_体験到達: step('見学', '体験'),
    体験到達_契約到達: step('体験', '契約準備')
  };
}

// 問合せ元別：連絡元区分ごと {件数,利用開始数}(累計)＋問い合わせ日の月次件数。空区分は'未設定'。
function dashSources_(cases) {
  var 区分別 = {}, 月次 = {};
  (cases || []).forEach(function(c) {
    var k = String(c.連絡元区分 || '').trim() || '未設定';
    if (!区分別[k]) 区分別[k] = { 件数:0, 利用開始数:0 };
    区分別[k].件数++;
    if (String(c.本格利用開始日 || '')) 区分別[k].利用開始数++;
    var ym = String(c.問い合わせ日 || '').slice(0,7);
    if (ym.length === 7) 月次[ym] = (月次[ym] || 0) + 1;
  });
  return { 区分別: 区分別, 月次: 月次 };
}

// 到達した最上位段階の日本語名（未到達は'受付'）。判定は dashReached_ を流用。
function dashMaxReachedLabel_(c) {
  if (dashReached_(c, '契約準備')) return '契約準備';
  if (dashReached_(c, '体験')) return '体験';
  if (dashReached_(c, '見学')) return '見学';
  return '受付';
}

// 失注理由：ドロップ案件を理由別件数＋個別一覧（氏名可・鍵の中）。日付降順。
function dashLostReasons_(cases) {
  var 理由別 = {}, 一覧 = [];
  (cases || []).forEach(function(c) {
    if (String(c.フェーズ || '') !== 'ドロップ') return;
    var rsn = String(c.ドロップ理由 || '').trim() || '未設定';
    理由別[rsn] = (理由別[rsn] || 0) + 1;
    var hist = Array.isArray(c.履歴) ? c.履歴 : [];
    一覧.push({
      氏名: c.氏名 || '', 到達段階: dashMaxReachedLabel_(c), 到達段階approx: hist.length === 0,
      理由: rsn, 日付: String(c.ドロップ記録日時 || '')
    });
  });
  一覧.sort(function(a,b){ return a.日付 < b.日付 ? 1 : (a.日付 > b.日付 ? -1 : 0); });
  return { 理由別: 理由別, 一覧: 一覧 };
}

// 集約：正規化済み案件配列(cases)＋today から5指標を1オブジェクトに束ねる。
function intakeDashboard_(cases, today) {
  var list = Array.isArray(cases) ? cases : [];
  return {
    需給: dashStageBuckets_(list),
    所要日数: dashLeadTime_(list, today),
    問合せ元: dashSources_(list),
    転換率: dashConversion_(list),
    失注: dashLostReasons_(list)
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    dashStageBuckets_: dashStageBuckets_,
    INTAKE_DASH_PHASE_RANK: INTAKE_DASH_PHASE_RANK,
    dashLeadTime_: dashLeadTime_,
    INTAKE_DASH_daysBetween_: INTAKE_DASH_daysBetween_,
    INTAKE_DASH_median_: INTAKE_DASH_median_,
    dashReached_: dashReached_,
    dashConversion_: dashConversion_,
    dashSources_: dashSources_,
    dashLostReasons_: dashLostReasons_,
    dashMaxReachedLabel_: dashMaxReachedLabel_,
    intakeDashboard_: intakeDashboard_
  };
}
