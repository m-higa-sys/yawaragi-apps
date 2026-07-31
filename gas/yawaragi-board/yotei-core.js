// yotei-core.js — 「予定月スライド方式」の純関数（段階1・測定）。
// GAS API / DOM に一切依存しない。周期（3ヶ月/4ヶ月）の判定はここに複製せず、
// shared.js §I の sokuteiCycleMonths_ を deps.cycleMonths として注入して使う（単一の正）。
//
// 器は「利用者 × 分野(domain) × 予定月(nextYm)」の汎用形。段階1では domain='sokutei' のみだが、
// 口腔 'oral' / 個訓 'kobetsu' / 通所 'tsusho' を行追加だけで同じシート・同じ関数に載せられる。
//
// 日付の型について: 呼び出し元が GAS(Sheets) の場合、セル値は Date になりうる。
// テストは vm(別realm)で本ファイルをロードするため instanceof Date が false になる。
// 型判定は必ず Object.prototype.toString.call() を使う。
//
// 検証: scripts/test-yotei-ym.js（vm で本ファイルを実ロードして本物を呼ぶ）

// 'YYYY-MM' を { y, m } へ。解釈不能は null。
// 'YYYY-MM-DD' / Date も先頭7桁相当として受ける（呼び出し側で切らなくて済むように）。
function _yoteiParseYm_(v) {
  var s;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return null;
    s = v.getUTCFullYear() + '-' + (v.getUTCMonth() < 9 ? '0' : '') + (v.getUTCMonth() + 1);
  } else {
    s = String(v == null ? '' : v);
  }
  var m = s.match(/^(\d{4})-(\d{1,2})/);
  if (!m) return null;
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
  if (!(mo >= 1 && mo <= 12)) return null;
  return { y: y, m: mo };
}

function _yoteiFmtYm_(y, m) {
  return y + '-' + (m < 10 ? '0' : '') + m;
}

// ym('YYYY-MM') に months を足した 'YYYY-MM'。負数・年跨ぎ対応。解釈不能は ''。
function ymAdd(ym, months) {
  var p = _yoteiParseYm_(ym);
  if (!p) return '';
  var n = parseInt(months, 10);
  if (isNaN(n)) n = 0;
  var m0 = (p.m - 1) + n;
  var y = p.y + Math.floor(m0 / 12);
  var m = ((m0 % 12) + 12) % 12 + 1;
  return _yoteiFmtYm_(y, m);
}

// 実施日（'YYYY-MM-DD' / 'YYYY-MM' / Date）の「月」＋ 周期月数 = 次回予定月。
// 日は見ない（月単位の運用のため）。起点が無ければ '' を返し、当月へ倒すかは呼び出し側が決める。
function nextYmAfterDone(doneDate, cycleMonths) {
  var p = _yoteiParseYm_(doneDate);
  if (!p) return '';
  return ymAdd(_yoteiFmtYm_(p.y, p.m), cycleMonths);
}

// 「来月へ」1タップ = +1ヶ月。周期そのものは動かさない（次の実施後に実施月＋周期へ戻る）。
function nextYmSlide(ym) { return ymAdd(ym, 1); }

// スライドの Undo = -1ヶ月。
function nextYmUnslide(ym) { return ymAdd(ym, -1); }

// 月タップの候補（2026-07-28 社長決定）: 当月から count ヶ月ぶんの 'YYYY-MM' を昇順で返す。
// 過去月は出さない（＝先頭は必ず当月＝いつでも「今月の対象」に戻せる）。年跨ぎは ymAdd に委ねる。
// 解釈不能・count<=0 は空配列（呼び出し側が落ちない）。既定は12ヶ月。
function ymCandidates(fromYm, count) {
  var n = parseInt(count, 10);
  if (isNaN(n)) n = 12;
  if (n <= 0) return [];
  if (!_yoteiParseYm_(fromYm)) return [];
  var out = [];
  for (var i = 0; i < n; i++) {
    var ym = ymAdd(fromYm, i);
    if (!ym) return [];
    out.push(ym);
  }
  return out;
}

// 当月の対象か。過ぎている人（予定月 < 当月）も必ず対象に含める。
// 予定月が未設定('')は「漏れ」なので対象に出す。
function isDue(nextYm, thisYm) {
  var a = _yoteiParseYm_(nextYm);
  if (!a) return true;
  var b = _yoteiParseYm_(thisYm);
  if (!b) return true;
  return _yoteiFmtYm_(a.y, a.m) <= _yoteiFmtYm_(b.y, b.m);
}

// 初期値の一括生成（1回きり・冪等）。
//   input = {
//     domain, thisYm,
//     users:        [{ userId, name, care, planStart }],
//     lastDoneByKey:{ userId または正規化名 -> 'YYYY-MM-DD'（3ソースをマージした最大値） },
//     existing:     [{ userId, domain }]  // 「予定月」シートに既にある行
//   }
//   deps = { cycleMonths: sokuteiCycleMonths_, normalizeName: fn }
// ルール:
//   実績あり → 実施月＋周期 ／ 実績なし → 計画書開始月＋周期 ／ 起点なし → 当月・note='起点なし'
//   (userId, domain) が existing にあれば生成しない（2回実行しても行が増えない）
// 返り: { rows: [...], stats: { fromDone, fromPlanStart, noAnchor, skippedExisting, byYm } }
function buildInitialYotei(input, deps) {
  var inp = input || {};
  var d = deps || {};
  var cycleOf = d.cycleMonths || function () { return 3; };
  var norm = d.normalizeName || function (s) { return String(s || ''); };
  var domain = String(inp.domain || '');
  var thisYm = String(inp.thisYm || '');
  var last = inp.lastDoneByKey || {};

  var have = {};
  (inp.existing || []).forEach(function (e) {
    if (String(e.domain || '') !== domain) return;
    have[String(e.userId || '')] = true;
  });

  // 履歴は「正規化キー」でも引けるようにする（3ソースのキーが userId / 生の氏名 と揺れるため）。
  // 同じ正規化キーに複数ソースが当たったら最大日（＝最後の実施日）を採る。
  var lastNorm = {};
  for (var lk in last) {
    if (!Object.prototype.hasOwnProperty.call(last, lk)) continue;
    var nk = norm(lk), lv = String(last[lk] || '');
    if (!lv) continue;
    if (!lastNorm[nk] || lv > lastNorm[nk]) lastNorm[nk] = lv;
  }

  var rows = [];
  var stats = { fromDone: 0, fromPlanStart: 0, noAnchor: 0, skippedExisting: 0, byYm: {} };

  (inp.users || []).forEach(function (u) {
    var uid = String(u.userId || '');
    if (have[uid]) { stats.skippedExisting++; return; }
    var cyc = cycleOf(u.care);
    var done = last[uid];
    if (done == null) done = lastNorm[norm(uid)];
    if (done == null) done = lastNorm[norm(u.name)];
    var nextYm = '', note = '';
    if (done) {
      nextYm = nextYmAfterDone(done, cyc);
      if (nextYm) stats.fromDone++;
    }
    if (!nextYm && u.planStart) {
      // ★2026-07-29 訂正: 測定の期限は「計画期間が始まる前の月」であって計画月ではない。
      //   dueYmOf（= isHyoukaMonth 起点で期限を返す関数）が渡されていればそれを使う。
      //   これを入れる前は planStart+周期＝計画月に置いていたため、測定記録の無い人の予定月が
      //   まるごと1ヶ月遅れて置かれていた（2026-07-28の初期生成で26名・2026-07-29に書き戻し済み）。
      //   dueYmOf 未指定のときだけ従来どおりに落ちる（既存の呼び出しを壊さないため）。
      if (d.dueYmOf) {
        nextYm = String(d.dueYmOf(u, thisYm) || '');
        if (nextYm) stats.fromDueYm = (stats.fromDueYm || 0) + 1;
      }
      if (!nextYm) {
        nextYm = nextYmAfterDone(u.planStart, cyc);
        if (nextYm) stats.fromPlanStart++;
      }
    }
    if (!nextYm) {
      nextYm = thisYm;
      note = '起点なし';
      stats.noAnchor++;
    }
    stats.byYm[nextYm] = (stats.byYm[nextYm] || 0) + 1;
    rows.push({
      userId: uid, name: String(u.name || ''), domain: domain,
      nextYm: nextYm, cycleMonths: cyc, slideCount: 0, note: note
    });
  });

  // 月別件数は昇順で返す（社長報告の「何月が何名」がそのまま読める順にする）
  var sortedYm = {};
  Object.keys(stats.byYm).sort().forEach(function (k) { sortedYm[k] = stats.byYm[k]; });
  stats.byYm = sortedYm;

  return { rows: rows, stats: stats };
}

// ===== 段階4（個訓）: domain='kobetsu' の初期値生成（2026-07-31・additive）=====
// ★既存の buildInitialYotei（domain='sokutei'）は1バイトも変えない。別関数として足す。
//   sokutei.html が本ファイルを ?v= 無しの <script src> で読んでいるため、既存関数の挙動は不変にする。
//
// 測定（sokutei）との違い:
//   測定は「実施日」だけで次が決まるが、計画書は「期間」を持つ。
//   ★起点は作成日ではなく "行の年月"（＝計画期間の開始月）。
//     計画書は前月準備の原則で前月に作るため、作成日を起点にすると必ず1ヶ月ずれる。
//     行の年月は個訓シートのキーそのものなので、日付を解釈する必要がない（測定より簡単）。
//
//   input = {
//     domain, thisYm,
//     users:          [{ userId, name, care, planStart, planMonths }],
//     keikakushoRows: [{ userId, year, month, keikaku_date }],   // keikaku_date 空の行は無視
//     existing:       [{ userId, domain }]
//   }
//   deps = { isPlanMonth }   ← 判定はここに複製せず shared.js §I を注入（単一の正）
// ルール:
//   記録あり → 最新行(year,month) ＋ planMonths
//   記録なし → planStart 起点で「thisYm 以降の最初の計画月」（過去月を作らない）
//   どちらも不可 → thisYm・note='起点なし'
//   算出結果が thisYm より前になったら note='past'（クランプしない＝isDue が督促対象として拾う）
function buildInitialYoteiKobetsu(input, deps) {
  var i = input || {};
  var d = deps || {};
  var domain = i.domain || 'kobetsu';
  var thisYm = String(i.thisYm || '');
  var users = i.users || [];
  var rows = [];
  var stats = { fromRecord: 0, fromPlanStart: 0, noAnchor: 0, skippedExisting: 0, pastYm: 0, byYm: {} };

  // 既存 (userId, domain) の索引
  var have = {};
  (i.existing || []).forEach(function (r) {
    if (r && r.userId && r.domain === domain) have[r.userId] = true;
  });

  // userId → keikaku_date を持つ行のうち最新の 'YYYY-MM'
  var latest = {};
  (i.keikakushoRows || []).forEach(function (r) {
    if (!r || !r.userId) return;
    if (!String(r.keikaku_date == null ? '' : r.keikaku_date).trim()) return;   // 実績のある行だけ
    var y = parseInt(r.year, 10), m = parseInt(r.month, 10);
    if (!(y > 0) || !(m >= 1 && m <= 12)) return;
    var ym = _yoteiFmtYm_(y, m);
    if (!latest[r.userId] || ym > latest[r.userId]) latest[r.userId] = ym;
  });

  users.forEach(function (u) {
    if (!u) return;
    var uid = u.userId || u.name;
    if (!uid) return;
    if (have[uid]) { stats.skippedExisting++; return; }

    var pm = parseInt(u.planMonths, 10);
    var cyc = (pm >= 1 && pm <= 12) ? pm : 3;   // 不正値は既定3（画面から入らない値がシートに残っていても落ちない）
    var nextYm = '', note = '';

    if (latest[uid]) {
      nextYm = ymAdd(latest[uid], cyc);
      if (nextYm) stats.fromRecord++;
    }
    if (!nextYm && u.planStart && d.isPlanMonth) {
      // thisYm 以降で最初の計画月。24ヶ月先まで見て見つからなければ諦める。
      for (var k = 0; k < 24; k++) {
        var cand = ymAdd(thisYm, k);
        if (!cand) break;
        if (d.isPlanMonth(u.planStart, cyc, parseInt(cand.slice(0, 4), 10), parseInt(cand.slice(5, 7), 10))) {
          nextYm = cand; note = 'planStart'; stats.fromPlanStart++;
          break;
        }
      }
    }
    if (!nextYm) {
      nextYm = thisYm;
      note = '起点なし';
      stats.noAnchor++;
    }
    // 過去月はクランプしない（isDue が「過ぎている人」として必ず対象に含める設計のため）。件数だけ可視化する。
    if (thisYm && nextYm < thisYm) { stats.pastYm++; note = 'past'; }

    stats.byYm[nextYm] = (stats.byYm[nextYm] || 0) + 1;
    rows.push({
      userId: uid, name: String(u.name || ''), domain: domain,
      nextYm: nextYm, cycleMonths: cyc, slideCount: 0, note: note
    });
  });

  var sortedYm = {};
  Object.keys(stats.byYm).sort().forEach(function (k) { sortedYm[k] = stats.byYm[k]; });
  stats.byYm = sortedYm;

  return { rows: rows, stats: stats };
}

// ===== 段階3（個訓）: 計画書を記録したら予定月を進める（2026-07-31・additive）=====
// ★既存関数は1バイトも変えない。純関数として3つだけ足す。
//   sokutei.html が本ファイルを ?v= 無しで読むため、既存の挙動は不変に保つ。

// 個訓の周期は介護度ではなく「計画月数（利用者台帳）」。1〜12以外は既定3。
function kobetsuCycleMonths(planMonths) {
  var pm = parseInt(planMonths, 10);
  return (pm >= 1 && pm <= 12) ? pm : 3;
}

// 計画書を1件記録したときの次回予定月。
// ★起点は「記録した行の年月」（＝計画期間の開始月）であって作成日ではない。
//   計画書は前月準備の原則で前月に作るため、作成日を起点にすると必ず1ヶ月ずれる。
// 年月が壊れていれば '' を返す（＝予定月を書かない。呼び出し側が失敗として扱う）。
function nextYmAfterKeikakuRow(year, month, planMonths) {
  var y = parseInt(year, 10), m = parseInt(month, 10);
  if (!(y >= 2000 && y <= 2100)) return '';
  if (!(m >= 1 && m <= 12)) return '';
  return ymAdd(_yoteiFmtYm_(y, m), kobetsuCycleMonths(planMonths));
}

// 予定月を進めてよい更新か。計画書の日付を「入れた」ときだけ true。
//   ・tasseido_date（評価）/ kyoumi_date / seikatsu_date / keikaku_sent_date では進めない
//   ・日付のクリア（空）でも進めない（消した拍子に予定月が先へ飛ぶのを防ぐ）
function shouldAdvanceKobetsuYotei(field, value) {
  if (String(field || '') !== 'keikaku_date') return false;
  return String(value == null ? '' : value).trim() !== '';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ymAdd: ymAdd,
    nextYmAfterDone: nextYmAfterDone,
    nextYmSlide: nextYmSlide,
    nextYmUnslide: nextYmUnslide,
    ymCandidates: ymCandidates,
    isDue: isDue,
    buildInitialYotei: buildInitialYotei,
    buildInitialYoteiKobetsu: buildInitialYoteiKobetsu,
    kobetsuCycleMonths: kobetsuCycleMonths,
    nextYmAfterKeikakuRow: nextYmAfterKeikakuRow,
    shouldAdvanceKobetsuYotei: shouldAdvanceKobetsuYotei
  };
}
