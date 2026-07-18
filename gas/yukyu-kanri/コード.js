/* ============================================================
   yukyu-kanri — 有給管理システム GAS（スタンドアロン Web App）
   作成: 2026-06-10
   利用者: 社長のみ（管理専用・フルアクセス）

   アーキテクチャ:
     データ層 = スプレッドシート「有給管理簿」（唯一の真実）。残日数は保存せず常に計算で導出。
     API層   = この GAS（doGet=JSONP取得 / doPost=no-cors更新）。簡易トークン認証。
     UI層    = yukyu.html（GitHub Pages）。

   ⚠ 既存 yawaragi-board GAS とは完全に独立。共有資産・URL・トリガーは一切共有しない。

   シート構成:
     ①職員マスタ : staff_id | 氏名 | 入社日 | 雇用形態 | 週所定労働日数 | 適用開始日 | 状態 | 備考
                   （週所定労働日数の変更は行追加で履歴化。同一staff_idで適用開始日が新しい行が有効）
     ②付与記録   : grant_id | staff_id | 付与日 | 付与日数 | 失効日 | 付与根拠 | 備考
     ③取得記録   : use_id | staff_id | 取得日 | 取得日数 | 充当grant_id | 登録日時 | 備考
   ============================================================ */

/* ===== 定数（シート名・列インデックス・フォルダ） ===== */
var ROOT_FOLDER_ID = '1B9miXr4IqN1HB_qo3bdemzqy-xIX9IPE'; // yawaragi ルート（m-higa所有）
var FOLDER_NAME = '有給管理';
var SS_NAME = '有給管理簿';

var SH_STAFF = '職員マスタ';
var SH_GRANT = '付与記録';
var SH_USE = '取得記録';

var STAFF_HEADERS = ['staff_id', '氏名', '入社日', '雇用形態', '週所定労働日数', '週所定時間', '適用開始日', '状態', '備考'];
var GRANT_HEADERS = ['grant_id', 'staff_id', '付与日', '付与日数', '失効日', '付与根拠', '備考'];
var USE_HEADERS = ['use_id', 'staff_id', '取得日', '取得日数', '充当grant_id', '登録日時', '備考'];

// 列インデックス（0始まり）
var ST = { id: 0, name: 1, join: 2, etype: 3, wdays: 4, whours: 5, from: 6, status: 7, memo: 8 };
var GR = { id: 0, staff: 1, date: 2, days: 3, expire: 4, basis: 5, memo: 6 };
var US = { id: 0, staff: 1, date: 2, days: 3, grant: 4, regAt: 5, memo: 6 };

var PROP_SHEET_ID = 'YUKYU_SHEET_ID';
var PROP_TOKEN = 'YUKYU_TOKEN';

// 純関数ブロック（DOM/SpreadsheetApp 非依存）。test-yukyu.js が抽出してevalし同一ソースを検証。
// === PURE START ===
/* ---- 法定付与テーブル（労働基準法 第39条） ----
   行 index = 付与回数 0..6（0=勤続0.5年, 1=1.5年, ... 6=6.5年以上）。
   キー = 週所定労働日数バケット（5=通常/週5日以上 or 週30h以上, 4..1=比例付与）。 */
var GRANT_TABLE = {
  5: [10, 11, 12, 14, 16, 18, 20],
  4: [7, 8, 9, 10, 12, 13, 15],
  3: [5, 6, 6, 8, 9, 10, 11],
  2: [3, 4, 4, 5, 6, 6, 7],
  1: [1, 2, 2, 2, 3, 3, 3]
};

// テーブルのバケット。通常付与(キー5)= 週所定5日以上 または 週所定30時間以上。
// それ以外は週所定労働日数で比例付与（1..4）。
function bucketFor(weeklyDays, weeklyHours) {
  var d = Number(weeklyDays), h = Number(weeklyHours);
  if ((isFinite(d) && d >= 5) || (isFinite(h) && h >= 30)) return 5;
  if (!isFinite(d) || d < 1) return 1;
  return Math.min(4, Math.max(1, Math.round(d)));
}

// 付与日数を引く（serviceIndex は付与回数 0..6、6超は6に丸め）
function grantDaysFor(weeklyDays, weeklyHours, serviceIndex) {
  var row = GRANT_TABLE[bucketFor(weeklyDays, weeklyHours)];
  var i = Math.max(0, Math.min(6, serviceIndex));
  return row[i];
}

/* ---- 日付ユーティリティ（'YYYY-MM-DD' 文字列 ⇔ UTC Date。TZ非依存） ---- */
function ymdToDate(ymd) {
  var p = String(ymd).split('-');
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
}
function dateToYmd(d) {
  var y = d.getUTCFullYear();
  var m = String(d.getUTCMonth() + 1).padStart(2, '0');
  var dd = String(d.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}
function addDaysYmd(ymd, n) {
  var d = ymdToDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToYmd(d);
}
function addMonthsYmd(ymd, n) {
  var d = ymdToDate(ymd);
  var targetMonth = d.getUTCMonth() + n;
  var y = d.getUTCFullYear() + Math.floor(targetMonth / 12);
  var m = ((targetMonth % 12) + 12) % 12;
  var day = d.getUTCDate();
  // 月末丸め（例: 8/31 +6ヶ月 → 2/28）
  var lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return dateToYmd(new Date(Date.UTC(y, m, Math.min(day, lastDay))));
}
function addYearsYmd(ymd, n) {
  return addMonthsYmd(ymd, n * 12);
}
// 満了経過月数（a→b、b<aなら0）
function monthsBetween(a, b) {
  var da = ymdToDate(a), db = ymdToDate(b);
  if (db < da) return 0;
  var m = (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth());
  if (db.getUTCDate() < da.getUTCDate()) m -= 1;
  return Math.max(0, m);
}

// 失効日 = 付与日 + 2年 − 1日
function expiryDate(grantYmd) {
  return addDaysYmd(addYearsYmd(grantYmd, 2), -1);
}

/* ---- 基準日 ----
   前倒し付与（付与根拠='前倒し'）が登録されていれば その付与日が基準日（以降その日基準で1年ごと）。
   無ければ 入社日+6ヶ月 が初回基準日。 */
function baseDateFor(joinYmd, maeDaoshiYmd) {
  if (maeDaoshiYmd) return maeDaoshiYmd;
  return addMonthsYmd(joinYmd, 6);
}

// 職員マスタ履歴から、ある日付時点で有効な週所定（労働日数・労働時間）を返す（適用開始日<=asOf の最新行）
function effectiveScheduleAt(historyRows, asOfYmd) {
  // historyRows: [{from:'YYYY-MM-DD', wdays:Number, whours:Number}, ...]（同一staffの全行）
  var best = null;
  for (var i = 0; i < historyRows.length; i++) {
    var f = historyRows[i].from;
    if (!f || f > asOfYmd) continue;
    if (!best || f > best.from) best = historyRows[i];
  }
  return best ? { wdays: Number(best.wdays), whours: Number(best.whours) } : null;
}

/* ---- 自動付与エンジン ----
   基準日（baseDate, baseDate+1y, +2y...）のうち asOf 以前で、まだ付与行が無い回を生成。
   各回の付与日数 = その基準日時点で有効な週所定労働日数 × 付与回数index でテーブル参照。
   前倒しの index0 は手動行が既にあるので自然にスキップされる。 */
function computeAutoGrants(joinYmd, maeDaoshiYmd, weeklyHistory, existingGrantDates, asOfYmd, maxYears) {
  var base = baseDateFor(joinYmd, maeDaoshiYmd);
  var existing = {};
  (existingGrantDates || []).forEach(function (d) { existing[d] = true; });
  var out = [];
  var limit = maxYears || 50;
  for (var n = 0; n <= limit; n++) {
    var gd = addYearsYmd(base, n);
    if (gd > asOfYmd) break;
    if (existing[gd]) continue; // 既に付与済み（前倒し手動含む）
    var sch = effectiveScheduleAt(weeklyHistory, gd);
    if (sch == null) continue;
    out.push({
      date: gd,
      days: grantDaysFor(sch.wdays, sch.whours, n),
      expire: expiryDate(gd),
      basis: '自動'
    });
  }
  return out;
}

// 次回付与予定（asOf より後の最初の基準日と予定日数）
function nextGrantInfo(joinYmd, maeDaoshiYmd, weeklyHistory, asOfYmd) {
  var base = baseDateFor(joinYmd, maeDaoshiYmd);
  for (var n = 0; n <= 50; n++) {
    var gd = addYearsYmd(base, n);
    if (gd > asOfYmd) {
      var sch = effectiveScheduleAt(weeklyHistory, gd);
      // 未来の週所定が不明なら現時点の値で投影
      if (sch == null) sch = effectiveScheduleAt(weeklyHistory, asOfYmd);
      return { date: gd, days: (sch == null ? null : grantDaysFor(sch.wdays, sch.whours, n)), index: n };
    }
  }
  return null;
}

/* ---- FIFO 充当 ----
   useYmd 時点で未失効（失効日>=useYmd かつ 付与日<=useYmd）の付与を、付与日の古い順に充当。
   既存 uses（同一staff・useYmd以前含む全て）で消費済みの分を差し引いた残容量に割り当てる。
   返り値: [{grant_id, days}]（容量不足で分割した場合は複数要素）。 */
function allocateUse(grants, uses, useYmd, useDays) {
  var remain = {};
  grants.forEach(function (g) { remain[g.grant_id] = Number(g.days); });
  uses.forEach(function (u) {
    if (u.grant_id != null && remain[u.grant_id] != null) remain[u.grant_id] -= Number(u.days);
  });
  var avail = grants.filter(function (g) {
    return g.date <= useYmd && g.expire >= useYmd && remain[g.grant_id] > 0;
  }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

  var need = Number(useDays), out = [];
  for (var i = 0; i < avail.length && need > 0; i++) {
    var g = avail[i];
    var take = Math.min(need, remain[g.grant_id]);
    if (take > 0) { out.push({ grant_id: g.grant_id, days: take }); need -= take; }
  }
  // need>0 のままなら容量不足（呼び出し側で前倒し付与を促す）
  return { allocations: out, shortage: need };
}

/* ---- 残日数 ----
   未失効（失効日>=asOf）の付与ごとに (付与日数 − その付与への取得充当合計) を合計。
   失効した付与の未消化分は自動的に除外される。 */
function residualAsOf(grants, uses, asOfYmd) {
  var used = {};
  uses.forEach(function (u) {
    if (u.grant_id != null) used[u.grant_id] = (used[u.grant_id] || 0) + Number(u.days);
  });
  var total = 0;
  grants.forEach(function (g) {
    if (g.date > asOfYmd) return;       // 未付与
    if (g.expire < asOfYmd) return;     // 失効済み → 除外
    var r = Number(g.days) - (used[g.grant_id] || 0);
    if (r > 0) total += r;
  });
  return total;
}

// 直近の失効予定（asOf から withinDays 日以内に失効し、かつ未消化が残る付与）
function expiringSoon(grants, uses, asOfYmd, withinDays) {
  var used = {};
  uses.forEach(function (u) {
    if (u.grant_id != null) used[u.grant_id] = (used[u.grant_id] || 0) + Number(u.days);
  });
  var limit = addDaysYmd(asOfYmd, withinDays);
  var out = [];
  grants.forEach(function (g) {
    if (g.expire < asOfYmd) return;
    if (g.expire > limit) return;
    var r = Number(g.days) - (used[g.grant_id] || 0);
    if (r > 0) out.push({ grant_id: g.grant_id, expire: g.expire, remaining: r });
  });
  return out.sort(function (a, b) { return a.expire < b.expire ? -1 : 1; });
}

/* ---- 年5日取得義務の判定 ----
   付与日数10日以上の基準日付与のみ対象。直近の対象基準日の期間 [基準日, +1年-1日] で、
   経過月数×(5/12) を取得実績が下回ったら 'warning'、年経過後も5日未満なら 'violation'。 */
function gono5Status(grants, uses, asOfYmd) {
  var cand = grants.filter(function (g) { return g.date <= asOfYmd && Number(g.days) >= 10; })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  if (!cand.length) return { obligated: false };
  var pg = cand[0];
  var pStart = pg.date;
  var pEnd = addDaysYmd(addYearsYmd(pStart, 1), -1);
  var asOfClamped = asOfYmd > pEnd ? pEnd : asOfYmd;
  var monthsElapsed = monthsBetween(pStart, asOfClamped);
  var usedInPeriod = 0;
  uses.forEach(function (u) {
    if (u.date >= pStart && u.date <= asOfClamped) usedInPeriod += Number(u.days);
  });
  var requiredByNow = Math.round(monthsElapsed * (5 / 12) * 100) / 100;
  var status = 'ok';
  if (usedInPeriod < 5) {
    if (asOfYmd > pEnd) status = 'violation';
    else if (usedInPeriod < requiredByNow - 1e-9) status = 'warning';
  }
  return {
    obligated: true, periodStart: pStart, periodEnd: pEnd,
    used: usedInPeriod, requiredByNow: requiredByNow,
    monthsElapsed: monthsElapsed, status: status
  };
}

/* ---- 月次レポート本文生成（純関数・例外ベース） ----
   staff: [{name, residual, gono5:{obligated,status,used,monthsElapsed,periodStart}, nextGrant:{date,days}}]
   asOfYmd: 'YYYY-MM-01'（その月の基準）。上から重要順のテキストを返す。 */
function buildMonthlyReportBody(staff, asOfYmd) {
  var ym = asOfYmd.slice(0, 7);
  var month = Number(asOfYmd.slice(5, 7));
  var warns = [], grants = [], lines = [];
  staff.forEach(function (s) {
    var g5 = s.gono5 || {};
    if (g5.obligated && (g5.status === 'warning' || g5.status === 'violation')) {
      var rem = Math.max(0, 12 - (g5.monthsElapsed || 0));
      warns.push('・' + s.name + '：取得 ' + (g5.used || 0) + '/5　基準日からの残り約' + rem + 'ヶ月（基準日 ' + (g5.periodStart || '') + '）' +
        (g5.status === 'violation' ? ' ※年度経過・未達（罰則対象）' : ''));
    }
    if (s.nextGrant && s.nextGrant.date && s.nextGrant.date.slice(0, 7) === ym) {
      grants.push('・' + s.name + '：' + s.nextGrant.date + ' に ' + (s.nextGrant.days != null ? s.nextGrant.days + '日' : '?日'));
    }
  });
  var needAction = warns.length > 0 || grants.length > 0;
  if (!needAction) lines.push('✅ 対応が必要な項目はありません');
  lines.push('');
  lines.push('■ 🔴 年5日ペース未達');
  lines.push(warns.length ? warns.join('\n') : '　警告なし');
  lines.push('');
  lines.push('■ 今月（' + month + '月）の付与予定');
  lines.push(grants.length ? grants.join('\n') : '　今月の付与予定なし');
  lines.push('');
  lines.push('■ 全員の残日数');
  staff.forEach(function (s) { lines.push('・' + s.name + '：' + s.residual + '日'); });
  if (month === 3) {
    lines.push('');
    lines.push('──────────');
    lines.push('🗓 年次スナップショットの時期です。管理簿出力タブ →「全員一括出力」→ Drive『有給管理』フォルダへ保存してください。');
  }
  return lines.join('\n');
}
// === PURE END ===

/* ============================================================
   I/O層: シートアクセス
   ============================================================ */
function _ss() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID);
  if (!id) throw new Error('セットアップ未実行: setupYukyu() を先に実行してください');
  return SpreadsheetApp.openById(id);
}
function _sheet(name) { return _ss().getSheetByName(name); }
function _rows(name) {
  var sh = _sheet(name);
  var vals = sh.getDataRange().getValues();
  return vals.length ? vals.slice(1) : []; // ヘッダ除く
}
// 日付セルを 'YYYY-MM-DD' 文字列に正規化
function _ymd(v) {
  if (v === '' || v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  return s;
}
function _todayYmd() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'); }

// 全職員のマスタ行を staff_id ごとにまとめる
function _staffMap() {
  var rows = _rows(SH_STAFF), map = {};
  rows.forEach(function (r) {
    var id = String(r[ST.id]).trim();
    if (!id) return;
    if (!map[id]) {
      map[id] = {
        staff_id: id, name: String(r[ST.name]).trim(),
        join: _ymd(r[ST.join]), etype: String(r[ST.etype]).trim(),
        status: String(r[ST.status]).trim() || '在籍', whours: Number(r[ST.whours]) || 0, history: []
      };
    }
    map[id].history.push({ from: _ymd(r[ST.from]) || _ymd(r[ST.join]), wdays: Number(r[ST.wdays]), whours: Number(r[ST.whours]) });
    // 氏名・状態は最新行で上書き（適用開始日が新しい行を優先）
    var f = _ymd(r[ST.from]) || _ymd(r[ST.join]);
    if (!map[id]._latestFrom || f >= map[id]._latestFrom) {
      map[id]._latestFrom = f;
      map[id].name = String(r[ST.name]).trim() || map[id].name;
      map[id].whours = Number(r[ST.whours]) || 0;
      if (String(r[ST.status]).trim()) map[id].status = String(r[ST.status]).trim();
      if (String(r[ST.etype]).trim()) map[id].etype = String(r[ST.etype]).trim();
    }
  });
  return map;
}
function _grantsFor(staffId) {
  return _rows(SH_GRANT).filter(function (r) { return String(r[GR.staff]).trim() === staffId; })
    .map(function (r) {
      return {
        grant_id: String(r[GR.id]).trim(), date: _ymd(r[GR.date]),
        days: Number(r[GR.days]), expire: _ymd(r[GR.expire]),
        basis: String(r[GR.basis]).trim(), memo: String(r[GR.memo] || '')
      };
    });
}
function _usesFor(staffId) {
  return _rows(SH_USE).filter(function (r) { return String(r[US.staff]).trim() === staffId; })
    .map(function (r) {
      return {
        use_id: String(r[US.id]).trim(), date: _ymd(r[US.date]),
        days: Number(r[US.days]), grant_id: String(r[US.grant]).trim() || null,
        memo: String(r[US.memo] || '')
      };
    });
}
function _maeDaoshiDate(grants) {
  var m = grants.filter(function (g) { return g.basis === '前倒し'; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return m.length ? m[0].date : null;
}
function _newId(prefix) {
  return prefix + '_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHHmmss') +
    '_' + Math.floor(Math.random() * 1000);
}

/* ============================================================
   セットアップ（タスク1）: フォルダ・シート作成
   ============================================================ */
function setupYukyu() {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  // フォルダ取得 or 作成（共有設定は触らない）
  var folder = null;
  var it = root.getFoldersByName(FOLDER_NAME);
  folder = it.hasNext() ? it.next() : root.createFolder(FOLDER_NAME);

  // 既存シート再利用 or 新規
  var ssFile = null;
  var fit = folder.getFilesByName(SS_NAME);
  var ss;
  if (fit.hasNext()) {
    ss = SpreadsheetApp.open(fit.next());
  } else {
    ss = SpreadsheetApp.create(SS_NAME);
    var file = DriveApp.getFileById(ss.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file); // マイドライブ直下から外す
  }
  _ensureSheet(ss, SH_STAFF, STAFF_HEADERS);
  _ensureSheet(ss, SH_GRANT, GRANT_HEADERS);
  _ensureSheet(ss, SH_USE, USE_HEADERS);
  // デフォルトの空シート削除
  var def = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 3) ss.deleteSheet(def);

  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_SHEET_ID, ss.getId());
  var token = props.getProperty(PROP_TOKEN);
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty(PROP_TOKEN, token);
  }
  var info = {
    folderUrl: folder.getUrl(),
    sheetUrl: ss.getUrl(),
    sheetId: ss.getId(),
    token: token
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}
function _ensureSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var first = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  var needHeader = first.join('') === '' || first[0] !== headers[0];
  if (needHeader) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4CAF50').setFontColor('#fff');
  }
  return sh;
}

// 現在のトークン確認用（社長がUIに貼る値）
function showToken() {
  var t = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
  Logger.log('TOKEN = ' + t);
  return t;
}

/* ============================================================
   テストデータ投入（タスク4）: 架空職員 A/B/C
   ※ Step C で実データ投入する前の検証用。実行前にシートは空である前提。
   ============================================================ */
function loadTestData() {
  var staff = _sheet(SH_STAFF), grant = _sheet(SH_GRANT), use = _sheet(SH_USE);
  // 職員マスタ
  var sRows = [
    ['A001', 'テスト太郎', '2024-10-01', '正社員', 5, 40, '2024-10-01', '在籍', 'A:正社員'],
    ['B001', 'テスト花子', '2025-01-15', 'パート', 3, 18, '2025-01-15', '在籍', 'B:週3→週4'],
    ['B001', 'テスト花子', '2025-01-15', 'パート', 4, 24, '2026-02-01', '在籍', 'B:週4へ変更(30h未満で比例継続)'],
    ['C001', 'テスト次郎', '2026-03-01', '正社員', 5, 40, '2026-03-01', '在籍', 'C:前倒し']
  ];
  staff.getRange(staff.getLastRow() + 1, 1, sRows.length, STAFF_HEADERS.length).setValues(sRows);

  // C の前倒し付与（手動）＋取得3日
  var cExpire = expiryDate('2026-03-01');
  grant.getRange(grant.getLastRow() + 1, 1, 1, GRANT_HEADERS.length).setValues([
    ['G_C001_MAE', 'C001', '2026-03-01', 10, cExpire, '前倒し', '入社時前倒し10日']
  ]);
  var uRows = [
    ['U_C001_1', 'C001', '2026-03-10', 1, 'G_C001_MAE', _todayYmd(), 'テスト取得'],
    ['U_C001_2', 'C001', '2026-03-20', 1, 'G_C001_MAE', _todayYmd(), 'テスト取得'],
    ['U_C001_3', 'C001', '2026-04-05', 1, 'G_C001_MAE', _todayYmd(), 'テスト取得']
  ];
  use.getRange(use.getLastRow() + 1, 1, uRows.length, USE_HEADERS.length).setValues(uRows);

  // A・B の自動付与を生成
  runDailyAutoGrant();
  Logger.log('テストデータ投入完了');
  return apiList(); // 検証用に一覧を返す
}

/* テストデータ削除（Step C 実データ投入前に実行）。
   テスト職員 A001/B001/C001 に紐づく行を 3シート全てから削除し、削除行数をログ報告。 */
function clearTestData() {
  var ids = { 'A001': true, 'B001': true, 'C001': true };
  var targets = [
    { name: SH_STAFF, col: ST.id },
    { name: SH_GRANT, col: GR.staff },
    { name: SH_USE, col: US.staff }
  ];
  var counts = {};
  targets.forEach(function (t) {
    var sh = _sheet(t.name);
    var vals = sh.getDataRange().getValues();
    var deleted = 0;
    for (var i = vals.length - 1; i >= 1; i--) { // 下から削除して行ズレを防ぐ
      if (ids[String(vals[i][t.col]).trim()]) { sh.deleteRow(i + 1); deleted++; }
    }
    counts[t.name] = deleted;
  });
  var msg = 'clearTestData 削除行数 → 職員マスタ:' + counts[SH_STAFF] +
    ' / 付与記録:' + counts[SH_GRANT] + ' / 取得記録:' + counts[SH_USE];
  Logger.log(msg);
  return { success: true, deleted: counts, message: msg };
}

/* ============================================================
   Step C 実データ投入（ケアズ監査確定・2026-06-10）
   ※ loadTestData と同形式・全件ハードコード。充当grant_idは投入時に直指定（FIFO手計算済）。
   ※ ガード：テストデータ残存（A/B/C）または実データ既投入（S001）なら中断し混在を防ぐ。
   ============================================================ */
function loadRealData() {
  // ---- 混在防止ガード ----
  var present = {};
  _rows(SH_STAFF).forEach(function (r) { present[String(r[ST.id]).trim()] = true; });
  if (present['A001'] || present['B001'] || present['C001']) {
    throw new Error('⛔ テストデータが残っています。先に clearTestData を実行してください（テスト/実データ混在防止）。');
  }
  if (present['S001']) {
    throw new Error('⛔ 実データは既に投入済みです（S001 を検出）。重複投入を防止しました。');
  }

  var staffSh = _sheet(SH_STAFF), grantSh = _sheet(SH_GRANT), useSh = _sheet(SH_USE);

  // ---- 職員マスタ（10名・適用開始日=入社日・状態=在籍） ----
  var hoshinoMemo = '2026/1自己都合退職（他社へ正社員転職・復帰約束なし・他社で実就労）→2/13再入社。' +
    '労働関係の真正な断絶のため勤続リセットで処理（基準日2026-08-13）。判断根拠メモはDrive有給管理フォルダ参照';
  var sRows = [
    ['S001', '下浦理絵', '2024-09-03', 'パート', 3, 20.25, '2024-09-03', '在籍', '再入社（前回分は清算済）'],
    ['S002', '髙山奈緒美', '2022-09-01', 'パート', 3, 15, '2022-09-01', '在籍', ''],
    ['S003', '小野重次郎', '2023-07-19', 'パート', 4, 13, '2023-07-19', '在籍', ''],
    ['S004', '春山忍', '2025-04-07', 'パート', 3, 15, '2025-04-07', '在籍', ''],
    ['S005', '勝又裕子', '2025-11-03', '正社員', 5, 40, '2025-11-03', '在籍', ''],
    ['S006', '工藤経子', '2026-02-06', 'パート', 3, 21, '2026-02-06', '在籍', ''],
    ['S007', '林秀明', '2026-01-30', 'パート', 2, 6, '2026-01-30', '在籍', ''],
    ['S008', '星野友太', '2026-02-13', '正社員', 5, 40, '2026-02-13', '在籍', hoshinoMemo],
    ['S009', '大久保好美', '2026-03-02', 'パート', 2, 8, '2026-03-02', '在籍', ''],
    ['S010', '石井祐子', '2026-04-01', 'パート', 3, 15, '2026-04-01', '在籍', '']
  ];
  staffSh.getRange(staffSh.getLastRow() + 1, 1, sRows.length, STAFF_HEADERS.length).setValues(sRows);

  // ---- 付与記録（grant_id 直指定・失効日は expiryDate で算定） ----
  function g(id, staff, date, days, basis, memo) {
    return [id, staff, date, days, expiryDate(date), basis, memo || ''];
  }
  var gRows = [
    g('G_S001_1', 'S001', '2025-03-03', 5, '手動', '遡及是正：初回付与漏れ'),
    g('G_S001_2', 'S001', '2026-03-03', 6, '自動', ''),
    g('G_S002_1', 'S002', '2023-03-01', 5, '手動', '是正：ケアズ3日→法定5日'),
    g('G_S002_2', 'S002', '2024-03-01', 6, '自動', ''),
    g('G_S002_3', 'S002', '2025-03-01', 6, '自動', ''),
    g('G_S002_4', 'S002', '2026-03-01', 8, '自動', ''),
    g('G_S003_1', 'S003', '2024-01-19', 7, '自動', ''),
    g('G_S003_2', 'S003', '2025-01-19', 8, '自動', ''),
    g('G_S003_3', 'S003', '2026-01-19', 12, '手動', '法定超過付与（週5扱い誤り）。既得分は維持、次回2027-01-19から週4テーブル10日で正常化'),
    g('G_S004_1', 'S004', '2025-10-07', 5, '手動', '是正：ケアズ3日→法定5日'),
    g('G_S005_1', 'S005', '2026-05-03', 10, '自動', '')
  ];
  grantSh.getRange(grantSh.getLastRow() + 1, 1, gRows.length, GRANT_HEADERS.length).setValues(gRows);

  // ---- 取得記録（全件 1.0 日・充当grant_id は FIFO 手計算で直指定） ----
  var now = _todayYmd();
  function u(id, staff, date, gid, memo) { return [id, staff, date, 1, gid, now, memo || '']; }
  var uRows = [
    // 下浦（2件 → 2025-03-03付与に充当）
    u('U_S001_1', 'S001', '2026-01-12', 'G_S001_1'),
    u('U_S001_2', 'S001', '2026-01-29', 'G_S001_1'),
    // 髙山（15件 → FIFO：G1×5, G2×6, G3×4）
    u('U_S002_01', 'S002', '2024-01-04', 'G_S002_1'),
    u('U_S002_02', 'S002', '2024-01-15', 'G_S002_1'),
    u('U_S002_03', 'S002', '2024-01-16', 'G_S002_1'),
    u('U_S002_04', 'S002', '2024-05-08', 'G_S002_1'),
    u('U_S002_05', 'S002', '2024-05-21', 'G_S002_1'),
    u('U_S002_06', 'S002', '2024-07-10', 'G_S002_2'),
    u('U_S002_07', 'S002', '2024-09-20', 'G_S002_2'),
    u('U_S002_08', 'S002', '2024-09-24', 'G_S002_2'),
    u('U_S002_09', 'S002', '2025-05-12', 'G_S002_2'),
    u('U_S002_10', 'S002', '2025-05-21', 'G_S002_2'),
    u('U_S002_11', 'S002', '2025-05-30', 'G_S002_2'),
    u('U_S002_12', 'S002', '2025-06-24', 'G_S002_3'),
    u('U_S002_13', 'S002', '2025-07-18', 'G_S002_3'),
    u('U_S002_14', 'S002', '2025-08-04', 'G_S002_3'),
    u('U_S002_15', 'S002', '2025-08-05', 'G_S002_3'),
    // 小野（15件 → FIFO：G1×7, G2×8）
    u('U_S003_01', 'S003', '2024-07-04', 'G_S003_1'),
    u('U_S003_02', 'S003', '2024-07-25', 'G_S003_1'),
    u('U_S003_03', 'S003', '2024-07-25', 'G_S003_1', 'ケアズ原本に同日2件・要事実確認・現在残に影響なし'),
    u('U_S003_04', 'S003', '2024-08-08', 'G_S003_1'),
    u('U_S003_05', 'S003', '2024-08-22', 'G_S003_1'),
    u('U_S003_06', 'S003', '2024-08-26', 'G_S003_1'),
    u('U_S003_07', 'S003', '2024-08-29', 'G_S003_1'),
    u('U_S003_08', 'S003', '2025-07-14', 'G_S003_2'),
    u('U_S003_09', 'S003', '2025-09-16', 'G_S003_2'),
    u('U_S003_10', 'S003', '2025-09-23', 'G_S003_2'),
    u('U_S003_11', 'S003', '2025-11-24', 'G_S003_2'),
    u('U_S003_12', 'S003', '2025-12-04', 'G_S003_2'),
    u('U_S003_13', 'S003', '2025-12-10', 'G_S003_2'),
    u('U_S003_14', 'S003', '2026-01-08', 'G_S003_2'),
    u('U_S003_15', 'S003', '2026-01-09', 'G_S003_2'),
    // 勝又（10件 → 全て 2026-05-03付与に充当・前借）
    u('U_S005_01', 'S005', '2025-11-07', 'G_S005_1', '付与前取得は本人希望の前借・給与有給処理済（6/25支給で精算）'),
    u('U_S005_02', 'S005', '2025-12-01', 'G_S005_1', '前借'),
    u('U_S005_03', 'S005', '2025-12-18', 'G_S005_1', '前借'),
    u('U_S005_04', 'S005', '2026-02-13', 'G_S005_1', '前借'),
    u('U_S005_05', 'S005', '2026-03-09', 'G_S005_1', '前借'),
    u('U_S005_06', 'S005', '2026-03-10', 'G_S005_1', '前借'),
    u('U_S005_07', 'S005', '2026-03-11', 'G_S005_1', '前借'),
    u('U_S005_08', 'S005', '2026-04-01', 'G_S005_1', '前借'),
    u('U_S005_09', 'S005', '2026-05-07', 'G_S005_1'),
    u('U_S005_10', 'S005', '2026-05-08', 'G_S005_1')
  ];
  useSh.getRange(useSh.getLastRow() + 1, 1, uRows.length, USE_HEADERS.length).setValues(uRows);

  Logger.log('loadRealData 投入完了 → 職員' + sRows.length + ' / 付与' + gRows.length + ' / 取得' + uRows.length);
  return apiList(); // 検証用に一覧を返す
}

/* ============================================================
   自動付与エンジン（日次トリガー）
   ============================================================ */
function runDailyAutoGrant() {
  var today = _todayYmd();
  var smap = _staffMap();
  var grantSh = _sheet(SH_GRANT);
  var appended = [];
  Object.keys(smap).forEach(function (id) {
    var st = smap[id];
    if (st.status === '退職') return;
    var grants = _grantsFor(id);
    var mae = _maeDaoshiDate(grants);
    var existingDates = grants.map(function (g) { return g.date; });
    var autos = computeAutoGrants(st.join, mae, st.history, existingDates, today);
    autos.forEach(function (g) {
      appended.push([_newId('G'), id, g.date, g.days, g.expire, g.basis, '']);
    });
  });
  if (appended.length) {
    grantSh.getRange(grantSh.getLastRow() + 1, 1, appended.length, GRANT_HEADERS.length).setValues(appended);
  }
  Logger.log('自動付与: ' + appended.length + '件');
  return appended.length;
}

function setupTrigger() {
  // 既存の同名トリガーを掃除してから日次設定
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runDailyAutoGrant') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runDailyAutoGrant').timeBased().everyDays(1).atHour(2).create();
  Logger.log('日次トリガー設定完了（毎日2時台）');
}

/* ============================================================
   月次自動レポートメール（純追加・既存ロジック/日次トリガー無変更）
   ============================================================ */
// オーナー宛に当月の月次レポートを1通送る。毎月1日7時台トリガーから実行。
function sendMonthlyReport() {
  var asOf = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-01'); // 当月基準
  var list = apiList(); // 既存の集計を読み取り専用で再利用（today=実行日）
  var summary = (list.staff || []).map(function (s) {
    return { name: s.name, residual: s.residual, gono5: s.gono5, nextGrant: s.nextGrant };
  });
  var body = buildMonthlyReportBody(summary, asOf);
  var subject = '【有給】yawaragi 月次レポート ' + asOf.slice(0, 4) + '年' + Number(asOf.slice(5, 7)) + '月';
  var to = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(to, subject, body);
  Logger.log('月次レポート送信 → ' + to + '\n' + subject);
  return { to: to, subject: subject, body: body };
}

// 社長が▶1回でテスト送信（実メールが届く）
function sendMonthlyReportTest() {
  var r = sendMonthlyReport();
  Logger.log('テスト送信完了 → ' + r.to + ' / ' + r.subject);
  return r;
}

// 月次レポートの時間主導トリガー（毎月1日7時台）。setupTrigger（日次2時台）は変更しない。
function setupMonthlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendMonthlyReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendMonthlyReport').timeBased().onMonthDay(1).atHour(7).create();
  Logger.log('月次レポートトリガー設定完了（毎月1日7時台）');
}

/* ============================================================
   API: doGet（JSONP取得）/ doPost（no-cors更新）
   ============================================================ */
function _checkToken(token) {
  var saved = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
  return saved && String(token) === String(saved);
}
function _jsonp(callback, obj) {
  var body = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + body + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var cb = p.callback || '';
  try {
    if (p.action === 'ping') return _jsonp(cb, { success: true, pong: true });
    if (!_checkToken(p.token)) return _jsonp(cb, { success: false, error: 'auth' });
    if (p.action === 'list') return _jsonp(cb, apiList());
    if (p.action === 'staffDetail') return _jsonp(cb, apiStaffDetail(p.staff_id));
    return _jsonp(cb, { success: false, error: 'unknown action' });
  } catch (err) {
    return _jsonp(cb, { success: false, error: String(err) });
  }
}

function doPost(e) {
  var data = {};
  try { data = JSON.parse(e.postData.contents); } catch (x) { data = {}; }
  try {
    if (!_checkToken(data.token)) return _jsonp('', { success: false, error: 'auth' });
    switch (data.action) {
      case 'addUse': return _jsonp('', apiAddUse(data));
      case 'cancelUse': return _jsonp('', apiCancelUse(data));
      case 'addGrant': return _jsonp('', apiAddGrant(data));
      case 'addStaff': return _jsonp('', apiAddStaff(data));
      case 'updateStaff': return _jsonp('', apiUpdateStaff(data));
      default: return _jsonp('', { success: false, error: 'unknown action' });
    }
  } catch (err) {
    return _jsonp('', { success: false, error: String(err) });
  }
}

/* ---- 一覧（ダッシュボード） ---- */
function apiList() {
  var today = _todayYmd();
  var smap = _staffMap();
  var list = [];
  Object.keys(smap).forEach(function (id) {
    var st = smap[id];
    var grants = _grantsFor(id);
    var uses = _usesFor(id);
    var mae = _maeDaoshiDate(grants);
    var residual = residualAsOf(grants, uses, today);
    var next = nextGrantInfo(st.join, mae, st.history, today);
    var exp = expiringSoon(grants, uses, today, 92); // 約3ヶ月以内
    var g5 = gono5Status(grants, uses, today);
    var sch = effectiveScheduleAt(st.history, today);
    list.push({
      staff_id: id, name: st.name, status: st.status, etype: st.etype, join: st.join,
      weeklyDays: sch ? sch.wdays : null, weeklyHours: sch ? sch.whours : null,
      residual: residual,
      nextGrant: next,
      expiringSoon: exp,
      gono5: g5
    });
  });
  list.sort(function (a, b) {
    // 警告者を先頭に、次に氏名
    var aw = (a.gono5 && (a.gono5.status === 'warning' || a.gono5.status === 'violation')) ? 0 : 1;
    var bw = (b.gono5 && (b.gono5.status === 'warning' || b.gono5.status === 'violation')) ? 0 : 1;
    if (aw !== bw) return aw - bw;
    return a.name.localeCompare(b.name, 'ja');
  });
  return { success: true, today: today, staff: list };
}

/* ---- 職員詳細（付与/取得/失効タイムライン＋管理簿用） ---- */
function apiStaffDetail(staffId) {
  var id = String(staffId || '').trim();
  var smap = _staffMap();
  var st = smap[id];
  if (!st) return { success: false, error: 'no staff' };
  var today = _todayYmd();
  var grants = _grantsFor(id).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var uses = _usesFor(id).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var mae = _maeDaoshiDate(grants);
  // 各付与の残（未消化）を計算
  var usedByGrant = {};
  uses.forEach(function (u) { if (u.grant_id) usedByGrant[u.grant_id] = (usedByGrant[u.grant_id] || 0) + u.days; });
  grants.forEach(function (g) {
    g.used = usedByGrant[g.grant_id] || 0;
    g.remaining = g.days - g.used;
    g.expired = g.expire < today;
  });
  return {
    success: true, today: today,
    staff: {
      staff_id: id, name: st.name, status: st.status, etype: st.etype, join: st.join,
      history: st.history, baseDate: baseDateFor(st.join, mae),
      weeklyDays: (effectiveScheduleAt(st.history, today) || {}).wdays,
      weeklyHours: (effectiveScheduleAt(st.history, today) || {}).whours
    },
    grants: grants, uses: uses,
    residual: residualAsOf(grants, uses, today),
    nextGrant: nextGrantInfo(st.join, mae, st.history, today),
    gono5: gono5Status(grants, uses, today)
  };
}

/* ---- 取得登録（FIFO充当・前借対応） ---- */
function apiAddUse(d) {
  var id = String(d.staff_id || '').trim();
  var date = _ymd(d.date), days = Number(d.days);
  if (!id || !date || !(days === 1 || days === 0.5)) return { success: false, error: 'invalid' };
  var grants = _grantsFor(id), uses = _usesFor(id);
  var alloc = allocateUse(grants, uses, date, days);
  var sh = _sheet(SH_USE), now = _todayYmd();
  var rows = [];
  if (alloc.shortage > 0 && d.allowAdvance) {
    // 前借: 前倒し付与＋即消化（付与日=取得日）
    var st = _staffMap()[id];
    var idx = _advanceIndex(st, grants, date);
    var sch = effectiveScheduleAt(st.history, date) || { wdays: 5, whours: 0 };
    var addDays_ = grantDaysFor(sch.wdays, sch.whours, idx);
    var gid = _newId('G');
    _sheet(SH_GRANT).appendRow([gid, id, date, addDays_, expiryDate(date), '前倒し', '前借に伴う前倒し付与']);
    rows.push([_newId('U'), id, date, alloc.shortage, gid, now, (d.memo || '') + '（前借）']);
    alloc.shortage = 0;
  } else if (alloc.shortage > 0) {
    return { success: false, error: 'shortage', shortage: alloc.shortage, message: '残日数不足。前借（前倒し付与）が必要です。' };
  }
  alloc.allocations.forEach(function (a) {
    rows.push([_newId('U'), id, date, a.days, a.grant_id, now, d.memo || '']);
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, USE_HEADERS.length).setValues(rows);
  return { success: true, added: rows.length };
}
// 前倒し時の付与回数index（基準日からの経過に応じた近似。前借は基本0回目想定）
function _advanceIndex(st, grants, date) {
  var mae = _maeDaoshiDate(grants);
  var base = baseDateFor(st.join, mae);
  if (date < base) return 0;
  var n = 0;
  for (var i = 0; i <= 50; i++) { if (addYearsYmd(base, i) <= date) n = i; else break; }
  return n;
}

/* ---- 取得取消 ---- */
function apiCancelUse(d) {
  var useId = String(d.use_id || '').trim();
  if (!useId) return { success: false, error: 'invalid' };
  var sh = _sheet(SH_USE);
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][US.id]).trim() === useId) {
      sh.deleteRow(i + 1);
      return { success: true, deleted: useId };
    }
  }
  return { success: false, error: 'not found' };
}

/* ---- 手動付与（前倒し含む） ---- */
function apiAddGrant(d) {
  var id = String(d.staff_id || '').trim();
  var date = _ymd(d.date), days = Number(d.days);
  if (!id || !date || !(days > 0)) return { success: false, error: 'invalid' };
  var basis = d.basis === '前倒し' ? '前倒し' : '手動';
  var gid = _newId('G');
  _sheet(SH_GRANT).appendRow([gid, id, date, days, expiryDate(date), basis, d.memo || '']);
  return { success: true, grant_id: gid };
}

/* ---- 職員追加 ---- */
function apiAddStaff(d) {
  var id = String(d.staff_id || '').trim() || _newId('S');
  if (!d.name || !d.join) return { success: false, error: 'invalid' };
  _sheet(SH_STAFF).appendRow([
    id, d.name, _ymd(d.join), d.etype || '', Number(d.weeklyDays) || 5, Number(d.weeklyHours) || 0,
    _ymd(d.from) || _ymd(d.join), d.status || '在籍', d.memo || ''
  ]);
  return { success: true, staff_id: id };
}

/* ---- 職員マスタ更新（週所定変更=履歴追加 / 状態変更等） ---- */
function apiUpdateStaff(d) {
  var id = String(d.staff_id || '').trim();
  if (!id) return { success: false, error: 'invalid' };
  if (d.changeWeeklyDays) {
    // 週所定労働日数の変更は行追加で履歴化
    var st = _staffMap()[id];
    if (!st) return { success: false, error: 'no staff' };
    _sheet(SH_STAFF).appendRow([
      id, st.name, st.join, d.etype || st.etype, Number(d.weeklyDays),
      (d.weeklyHours != null ? Number(d.weeklyHours) : (st.whours || 0)),
      _ymd(d.from), d.status || st.status, d.memo || '週所定変更'
    ]);
    return { success: true, mode: 'history' };
  }
  // 状態変更（退職等）: 最新行の状態列を書き換え（履歴は保持）
  if (d.status) {
    var sh = _sheet(SH_STAFF);
    var vals = sh.getDataRange().getValues();
    var lastRow = -1, lastFrom = '';
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][ST.id]).trim() === id) {
        var f = _ymd(vals[i][ST.from]);
        if (lastRow < 0 || f >= lastFrom) { lastRow = i; lastFrom = f; }
      }
    }
    if (lastRow < 0) return { success: false, error: 'no staff' };
    sh.getRange(lastRow + 1, ST.status + 1).setValue(d.status);
    return { success: true, mode: 'status' };
  }
  return { success: false, error: 'nothing to update' };
}
