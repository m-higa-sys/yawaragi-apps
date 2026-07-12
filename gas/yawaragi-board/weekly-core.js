// 週間予定表バックエンド 純関数（P2.2・2026-07-11）
// テスト: scripts/test-weekly-core.js ／ 呼び出し元: コード.js intake_weekly_feed / weekly_overlay_* / weekly_seed
//
// ・intake_weekly_feed = 見学体験新規から「未ドロップ かつ 台帳反映済でない」案件を、PIIを一切含まない
//   最小5フィールド {category,days,ampm,displayName,予定日} だけにして返す（★匿名feed・鍵なし公開可）。
// ・weekly_overlay = メモ/並び順のオーバーレイ保存庫（機微情報でない）。
// ※require()は持たない（GAS本番でロード時停止しない・他 *-core.js と同方式）。
// ※グローバルは WEEKLY_ プレフィクス徹底（14,926行・全域scope衝突回避）。

var WEEKLY_OVERLAY_SHEET  = 'weekly_overlay';
var WEEKLY_OVERLAY_HEADER = ['key', 'type', 'value', 'updatedAt', 'updatedBy'];
var WEEKLY_OVERLAY_TYPES  = ['memo', 'order'];
var WEEKLY_CATEGORIES     = ['見学', '体験', '問い合わせ', '保留', '空き待ち', '利用予定', '利用決定'];

// 曜日/AMPM抽出（コード.js _parseFinalDayWishes と同ロジック・"第1:火AM, 第2:木AM"→{days:"火木",ampm:"午前"}）
function weeklyParseDays_(raw) {
  raw = String(raw || '').trim();
  if (!raw) return { days: '', ampm: '' };
  if (/いつでもOK/.test(raw)) return { days: '月火水木金', ampm: '午前午後' };
  if (/^後日ご連絡/.test(raw)) return { days: '', ampm: '' };
  var daySet = {}, hasAm = false, hasPm = false;
  raw.split(/[,、]/).forEach(function(part) {
    var m = part.match(/[月火水木金土]/g);
    if (m) m.forEach(function(d){ daySet[d] = true; });
    if (/AM|午前/i.test(part)) hasAm = true;
    if (/PM|午後/i.test(part)) hasPm = true;
  });
  var days = ['月','火','水','木','金','土'].filter(function(d){ return daySet[d]; }).join('');
  var ampm = (hasAm && hasPm) ? '午前午後' : hasAm ? '午前' : hasPm ? '午後' : '';
  return { days: days, ampm: ampm };
}

// 姓のみ抽出（空白区切りがあれば先頭要素・無ければ先頭2文字＝日本語姓の近似）。PII最小化。
function weeklyLastName_(name) {
  var s = String(name || '').trim();
  if (!s) return '';
  var parts = s.split(/[\s　]+/);
  if (parts.length > 1 && parts[0]) return parts[0];
  return s.slice(0, 2);
}

// intakeのフェーズ/種別/利用意向 → 画面カテゴリ（優先順・先勝ち）。マッピング表は設計書/報告参照。
function weeklyCategory_(rec) {
  rec = rec || {};
  var phase = String(rec['フェーズ'] || '');
  var kind  = String(rec['種別'] || '');
  var ikou  = String(rec['利用意向'] || '');
  if (ikou === '保留') return '保留';                                   // ①
  if (phase === '契約準備' || phase === '利用開始準備') return '利用決定'; // ②
  if (ikou === 'あり') return '利用予定';                               // ③
  if (phase === '体験') return '体験';                                  // ④
  if (phase === '見学') return '見学';                                  // ⑤
  if (kind === 'trial') return '体験';                                  // ⑥
  if (kind === 'visit') return '見学';                                  // ⑦
  if (kind === 'inquiry') return '問い合わせ';                          // ⑧
  return '問い合わせ';                                                  // ⑨ default
  // ※「空き待ち」はintakeに直接の信号が無いため現状feedからは出力しない（満枠判定は将来対応）。
}

// feed対象＝未ドロップ かつ 利用者台帳反映済でない
function weeklyFeedInclude_(rec) {
  rec = rec || {};
  if (String(rec['フェーズ'] || '') === 'ドロップ') return false;
  if (rec['利用者台帳反映済'] === true) return false;
  return true;
}

// PIIを一切含まない最小feed行（★キーは5つのみ）。displayNameはtrialのみ姓・それ以外は空。
function weeklyFeedRow_(rec) {
  rec = rec || {};
  var d = weeklyParseDays_(rec['最終決定曜日'] || rec['yawarigi希望曜日'] || rec['利用希望曜日'] || '');
  var isTrial = String(rec['種別'] || '') === 'trial';
  return {
    category: weeklyCategory_(rec),
    days: d.days,
    ampm: d.ampm,
    displayName: isTrial ? weeklyLastName_(rec['氏名'] || '') : '',
    予定日: String(rec['予定日'] || '')
  };
}

// upsert検証：type/keyの妥当性＋order空ガード（value空/空配列でorderを全消ししない）。memoは空value可。
function weeklyUpsertValid_(type, key, value) {
  type = String(type || '');
  if (WEEKLY_OVERLAY_TYPES.indexOf(type) < 0) return { ok: false, reason: 'type不正（memo/orderのみ）' };
  if (!String(key || '').trim()) return { ok: false, reason: 'key必須' };
  if (type === 'order') {
    var v = String(value == null ? '' : value).trim();
    if (!v) return { ok: false, reason: 'order空ガード：value空は拒否（並び順の全消し防止）' };
    // 空配列JSON "[]" も実質全消しなので拒否
    var parsed = null;
    try { parsed = JSON.parse(v); } catch (e) { parsed = null; }
    if (Array.isArray(parsed) && parsed.length === 0) return { ok: false, reason: 'order空ガード：空配列は拒否' };
  }
  return { ok: true, reason: '' };
}

// seed冪等性：既存overlay行に指定keyのtype='order'があるか（あればseedスキップ）
function weeklyOrderExists_(rows, key) {
  rows = rows || [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[0]) === String(key) && String(r[1]) === 'order') return true;
  }
  return false;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WEEKLY_OVERLAY_SHEET: WEEKLY_OVERLAY_SHEET,
    WEEKLY_OVERLAY_HEADER: WEEKLY_OVERLAY_HEADER,
    WEEKLY_OVERLAY_TYPES: WEEKLY_OVERLAY_TYPES,
    WEEKLY_CATEGORIES: WEEKLY_CATEGORIES,
    weeklyParseDays_: weeklyParseDays_,
    weeklyLastName_: weeklyLastName_,
    weeklyCategory_: weeklyCategory_,
    weeklyFeedInclude_: weeklyFeedInclude_,
    weeklyFeedRow_: weeklyFeedRow_,
    weeklyUpsertValid_: weeklyUpsertValid_,
    weeklyOrderExists_: weeklyOrderExists_
  };
}
