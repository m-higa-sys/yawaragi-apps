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
//   status: 次回期限が今月より前=overdue(スライド組) / 今月内=due。
//   ※ここでの並び(overdue先→due・次回期限昇順)は素の既定。画面では msPrioritySort が全件を並べ直すため、
//     スライド組が上に来るわけではない（2026-07-18 方針変更・急かさない）。
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
      planStart: u.planStart || '', planMonths: (u.planMonths != null ? u.planMonths : 0), // msRouteWrite(要介護)の計画月算出に必要
      days: u.days || '',  // 優先順ソート(週回数/残来所)に必要
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

// ===== 改修①②③（セッションボード流用）=====

// ①日付移動（◀▶）: YYYY-MM-DD ± n日。月跨ぎ・年跨ぎ・うるうはDateに委ねる。
function msAddDays(ymd, n) {
  var p = String(ymd).split('-');
  var d = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)));
  d.setUTCDate(d.getUTCDate() + n);
  function pad(x) { return (x < 10 ? '0' : '') + x; }
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

// ①今日以外を見ているときの警告（過去/未来・N日）。文言は session-board.html:336-337 と一致。
// 返り: { show, kind:'past'|'future'|'', label }
function msDateWarning(selectedDate, todayYMD) {
  if (!selectedDate || !todayYMD || selectedDate === todayYMD) return { show: false, kind: '', label: '' };
  var past = selectedDate < todayYMD;
  var sp = String(selectedDate).split('-'), tp = String(todayYMD).split('-');
  var ad = Math.abs(Math.round((Date.UTC(+sp[0], +sp[1] - 1, +sp[2]) - Date.UTC(+tp[0], +tp[1] - 1, +tp[2])) / 86400000));
  var label = (past ? '⏪ 過去の日付を表示中' : '⏩ 未来の日付を表示中')
    + '（今日ではありません・' + ad + '日' + (past ? '前' : '後') + '）';
  return { show: true, kind: past ? 'past' : 'future', label: label };
}

// ②「今日測れる人」を午前/午後の2カラムへ振り分け（不在は除外）。返り: { am, pm, amCount, pmCount }
function msSplitBySession(targets) {
  var am = [], pm = [];
  (targets || []).forEach(function (t) {
    if (!t.attendingToday) return;
    if (t.session === 'am') am.push(t);
    else if (t.session === 'pm') pm.push(t);
  });
  return { am: am, pm: pm, amCount: am.length, pmCount: pm.length };
}

// ③優先順ソート: セッションボードの sbSokuteiSort_/sbMeasureUrgency_ を注入流用（逐語コピーを増やさない）。
// 全件を1回の sbSokuteiSort_ に通す（careLayer↑=要介護上／urgency↓=残チャンス少・週回数少・欠席多ほど先）。
// 【2026-07-18 方針変更】以前は overdue(スライド組)を最上部に固定していたが、その分岐を外した。
//   理由: スライド＝「その月のうちにやればいい」運用で緊急ではなく、最上部固定＋赤は急かしすぎ。
//   区別は控えめバッジ（先月から）と件数内訳（msCountCarryOver）だけで行い、並び順は変えない。
// deps = { weeklyVisits: sbCountWeeklyVisits_, remainingVisits: sbCountRemainingVisits_, sokuteiSort: sbSokuteiSort_ }。
// usageByKey: 名前(またはnormalized)→出席率U（0-1）。無ければU=1（欠席0＝ペナルティなし・sbMeasureShien_と同既定）。
function msPrioritySort(targets, usageByKey, today, deps) {
  var weights = { chance: 1.0, freq: 0.6, absence: 0.6, unmeasuredBoost: 2.0 }; // = SOKUTEI_WEIGHTS
  var usage = usageByKey || {};
  var wv = (deps && deps.weeklyVisits) || function () { return 0; };
  var rv = (deps && deps.remainingVisits) || function () { return 0; };
  var sortFn = (deps && deps.sokuteiSort) || function (a) { return (a || []).slice(); };
  var enriched = (targets || []).map(function (t) {
    var nkey = msNormalizeName_(t.name != null ? t.name : t.key);
    var rate = (usage[t.key] != null) ? usage[t.key] : (usage[nkey] != null ? usage[nkey] : 1.0);
    var abs = 1 - rate; if (abs < 0) abs = 0; if (abs > 1) abs = 1;
    var e = {};
    for (var k in t) { if (t.hasOwnProperty(k)) e[k] = t[k]; }
    e.careLayer = (String(t.care).indexOf('要介護') === 0) ? 0 : 1;
    e.weeklyVisits = wv(t.days);
    e.remainingVisits = rv(t.days, today);
    e.absenceRate = abs;
    e.unmeasured = !t.前回測定日;
    return e;
  });
  return sortFn(enriched, weights);   // status で群分けしない＝スライド組も通常の優先順に混ざる
}

// ③スライド組（先月以前が期限で未測定＝status:'overdue'）の件数。
// 「今月の残り」タブの人数に内訳を添えるため（例: 75名（うち先月から12名））。急かす目的ではなく把握用。
function msCountCarryOver(targets) {
  var n = 0;
  (targets || []).forEach(function (t) { if (t && t.status === 'overdue') n++; });
  return n;
}

// ===== v3① 記録の2タップ化（スタッフ選択シート）=====

// 直近使った測定者リストの更新（端末内保存＝localStorage想定・同期しない）。
// 重複は先頭へ移動、上限超過は古いものから落とす。空名は積まない（誤保存の混入防止）。
function msRecentStaffPush(recent, name, max) {
  var nm = String(name == null ? '' : name).trim();
  var list = (recent || []).slice();
  if (!nm) return list;
  var out = [nm];
  for (var i = 0; i < list.length; i++) { if (list[i] !== nm) out.push(list[i]); }
  var lim = (max > 0) ? max : 5;
  return out.slice(0, lim);
}

// スタッフ格子の並び: 直近使った人を左上（recent の順を保つ）→ 残りは元の順。
// recent に在籍しない名前（退職・除外設定変更）が混ざっていても無視する＝押せないボタンを作らない。
function msStaffOrder(staff, recent) {
  var all = (staff || []).slice();
  var head = [];
  (recent || []).forEach(function (n) { if (all.indexOf(n) >= 0 && head.indexOf(n) < 0) head.push(n); });
  var tail = all.filter(function (n) { return head.indexOf(n) < 0; });
  return head.concat(tail);
}

// 保存の取り消し引数を組む（新actionは作らない・既存actionのみ）。
//   target: 対象者 / saved: msRouteWrite が返した保存引数 / prev: 保存前の値 { sokuteiDate, sokuteiBy, outputBy }
// 要介護: updateKeikakusho で3項目を保存前の値へ戻す。通常 prev は空＝セルが消え、
//   行が全部空になれば GAS 側が行ごと削除する（＝保存前の状態に戻る）。再測定なら元値へ戻すのでデータを消さない。
// 要支援系: 追記型なので既存 deleteShienSokutei で「いま書いた1行」(name+date+by 一致)だけ消す。
function msBuildUndo(target, saved, prev) {
  var p = prev || {};
  if (saved && saved.action === 'updateKeikakusho') {
    return {
      action: 'updateKeikakusho',
      userId: saved.userId,
      year: saved.year,
      month: saved.month,
      jobs: [
        { field: 'sokutei_date', value: p.sokuteiDate || '' },
        { field: 'sokutei_by', value: p.sokuteiBy || '' },
        { field: 'output_by', value: p.outputBy || '' }
      ]
    };
  }
  return { action: 'deleteShienSokutei', name: saved.name, date: saved.date, by: saved.by };
}

// ===== v3② 測定済み一覧 =====

// 一覧の期間: anchor 日を含む月から n ヶ月分（当月末まで）。既定n=6＝測定周期3〜4ヶ月をまたいで「前回いつ？」に answers。
function msMonthsBack(anchorYMD, n) {
  var y = parseInt(String(anchorYMD).slice(0, 4), 10);
  var mo = parseInt(String(anchorYMD).slice(5, 7), 10);
  var back = (n > 0 ? n : 6) - 1;
  var m0 = (mo - 1) - back;
  var fy = y + Math.floor(m0 / 12);
  var fm = ((m0 % 12) + 12) % 12 + 1;
  function pad(x) { return (x < 10 ? '0' : '') + x; }
  return { from: fy + '-' + pad(fm) + '-01', to: msMonthEnd_(String(anchorYMD).slice(0, 7) + '-01') };
}

// 履歴（mergeSokuteiRecords の返り）→ 一覧行。測定日の新しい順。期間 [from,to] 外と日付なしは落とす。
//   紙seed(paper)の除外は mergeSokuteiRecords(includePaper:false) 側の責務＝ここでは二重に判定しない。
//   nameByKey: 要介護の userId → 氏名。解決できなければ key をそのまま出す（行を消さない＝取りこぼしを見せる）。
function msBuildMeasuredList(records, nameByKey, range) {
  var nb = nameByKey || {};
  var from = (range && range.from) || '';
  var to = (range && range.to) || '';
  var out = [];
  (records || []).forEach(function (r) {
    var d = String((r && r.sokutei_date) || '').trim();
    if (!d) return;
    if (from && d < from) return;
    if (to && d > to) return;
    var key = String((r && r.key) || '');
    out.push({
      key: key,
      name: nb[key] || key,
      date: d,
      by: String((r && r.sokutei_by) || ''),
      care: String((r && r.careType) || '')
    });
  });
  out.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;   // 新しい順
    return String(a.name).localeCompare(String(b.name));       // 同日は名前順（並びを安定させる）
  });
  return out;
}

// 一覧の絞り込み: 氏名の部分一致(q)と測定者(by)のAND。空文字は条件なし扱い。
function msFilterMeasured(rows, cond) {
  var c = cond || {};
  var q = String(c.q == null ? '' : c.q).replace(/[\s　]+/g, '');
  var by = String(c.by == null ? '' : c.by).trim();
  return (rows || []).filter(function (r) {
    if (q && String(r.name).indexOf(q) < 0) return false;
    if (by && String(r.by) !== by) return false;
    return true;
  });
}

// 測定者別の件数（偏りの可視化）。件数の多い順→同数は名前順。測定者空欄は数えない。
function msCountByMeasurer(rows) {
  var map = {};
  (rows || []).forEach(function (r) {
    var n = String((r && r.by) || '').trim();
    if (!n) return;
    map[n] = (map[n] || 0) + 1;
  });
  var out = Object.keys(map).map(function (n) { return { name: n, count: map[n] }; });
  out.sort(function (a, b) {
    if (a.count !== b.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    msNormalizeName_: msNormalizeName_,
    msCurrentPlanMonth: msCurrentPlanMonth,
    msMonthEnd_: msMonthEnd_,
    msBuildMeasurementTargets: msBuildMeasurementTargets,
    msRouteWrite: msRouteWrite,
    msAddDays: msAddDays,
    msDateWarning: msDateWarning,
    msSplitBySession: msSplitBySession,
    msPrioritySort: msPrioritySort,
    msCountCarryOver: msCountCarryOver,
    msRecentStaffPush: msRecentStaffPush,
    msStaffOrder: msStaffOrder,
    msBuildUndo: msBuildUndo,
    msMonthsBack: msMonthsBack,
    msBuildMeasuredList: msBuildMeasuredList,
    msFilterMeasured: msFilterMeasured,
    msCountByMeasurer: msCountByMeasurer
  };
}
