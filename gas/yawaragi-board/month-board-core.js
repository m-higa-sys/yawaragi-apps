// month-board-core.js
// 月次ボード（今月ケアマネに何を何名分揃えるか）の判定エンジン＝純関数のみ。
// GAS API・DOM・fetch には一切依存しない（node/GAS 両用。GAS配線・HTMLは別GO）。
//
// 判定は既存の正本純関数を再利用する（ロジックの二重実装はしない）：
//   - oralCycleAt / isHyoukaMonth  … gas/yawaragi-board/session-board-judges.js（正本: oral-plan.html / shared.js §I）
//   - isPlanMonth                  … shared.js §I
//   - sokuteiDueDate_ / sbNormalizeName_ … gas/yawaragi-board/session-board-core.js
// これらは buildMonthBoard(input, deps) の deps で注入する（既存 sbBuildBoard_(input, judges) と同じDI流儀）。
// GAS では deps 省略時にグローバル関数へフォールバックする。
//
// ---- 入力契約 ----
// input = {
//   targetMonth: 'YYYY-MM',
//   users: [{ userId, name, category(介護度), planStart, planMonths, oralPlanStart, oralPlanEnd, isTsusho }],
//   oralRecords:  [{ userId, name, houkoku_date, plan_date }],
//   kunRecords:   [{ userId, name, keikaku_date, tasseido_date, blocked_reason }],  // blocked_reason 有り=保留（計画書やり残し対象外）
//   sokuteiRecords: [{ userId, name, sokutei_date }],           // 人ごと複数可
//   tsushoDueMap: { userId: 'YYYY-MM-DD' },                     // 通所計画書の実満了日（手入力/リハブ実値）
//   tsushoSendRecords: [{ userId, name, plan_date, pdfSendDate, printSendDate }]
// }
// ---- 出力契約 ----
// { month, sections:[ { key, label,
//     targets:[{ userId, name, done, doneDate }],
//     countTarget, countDone, countUndone } ],
//   warnings:[ { type:'noDueDate', userId, name } ] }
//
// 「済」＝該当フィールドの日付が targetMonth 内にあること（YYYY-MM 一致）。
// 測定の要介護キーは userId、要支援は name（既存の照合差異をそのまま吸収）。

function _mbDefaultNorm_(s) { return String(s == null ? '' : s).replace(/[\s　]+/g, ''); }

function _mbResolveDeps_(deps) {
  var d = deps || {};
  function g(name) {
    if (d[name]) return d[name];
    if (typeof globalThis !== 'undefined' && typeof globalThis[name] === 'function') return globalThis[name];
    return null;
  }
  return {
    oralCycleAt: g('oralCycleAt'),
    isPlanMonth: g('isPlanMonth'),
    isHyoukaMonth: g('isHyoukaMonth'),
    sokuteiDueDate_: g('sokuteiDueDate_'),
    sbNormalizeName_: d.sbNormalizeName_ || g('sbNormalizeName_') || _mbDefaultNorm_
  };
}

// 介護度カテゴリ判定（sokuteiCycleMonths_ の要介護前方一致と揃える）
function _mbIsKaigo_(cat) { return String(cat || '').indexOf('要介護') === 0; }
function _mbIsShien_(cat) {
  var c = String(cat || '');
  return c.indexOf('要支援') >= 0 || c.indexOf('事業対象') >= 0;
}

// 日付文字列 'YYYY-MM-DD' が targetMonth('YYYY-MM') 内か
function _mbInMonth_(dateStr, ym) {
  return !!dateStr && String(dateStr).slice(0, 7) === ym;
}

// records から user に対応する1件を引く（userId優先→正規化名）
function _mbPick_(records, user, norm) {
  if (!records) return null;
  var uid = user.userId, uname = norm(user.name);
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    if (uid && r.userId && r.userId === uid) return r;
    if (r.name != null && norm(r.name) === uname) return r;
  }
  return null;
}

// 単一日付フィールドの済判定
function _mbFieldDone_(rec, field, ym) {
  var v = rec ? rec[field] : '';
  return _mbInMonth_(v, ym) ? { done: true, doneDate: v } : { done: false, doneDate: '' };
}

// ym('YYYY-MM') の前月を 'YYYY-MM' で返す（年跨ぎ対応）。不正入力は '' を返す。
function _mbPrevYm_(ym) {
  var m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
  mo -= 1; if (mo <= 0) { mo = 12; y -= 1; }
  return y + '-' + ('0' + mo).slice(-2);
}

// 作業月対応の済判定：日付が ym（当月）または ym-1（前月＝作業月）にあれば done。
// 個訓計画書は「作業月＝前月」に作成し前月日付を持つ運用（グリッド kobetsuCycleAt）のため、
// 当月日付のみを済とする _mbFieldDone_ だと前月付けの作成済みが「偽の未」になる。これを是正する。
// 対象は前月付け運用のある keikaku_date（kunPlan）のみ。tasseido_date(kunEval) 等は _mbFieldDone_ 据置。
function _mbFieldDoneWorkMonth_(rec, field, ym) {
  var v = rec ? rec[field] : '';
  if (_mbInMonth_(v, ym) || _mbInMonth_(v, _mbPrevYm_(ym))) return { done: true, doneDate: v };
  return { done: false, doneDate: '' };
}

// ===== 作業月主義（2026-07-31・業務ルール仕様書v1.2 §1-3「前月準備の原則」）=====
// N月開始の計画書は N−1月中に作り終える運用。よって kunPlan はボード月(y,m)ではなく
// 「翌月(y,m+1)が計画期間の開始月か」で数え、記録も翌月の行から読む。
// teishutsu.html:319-322 が既に同じ軸（作業月主義）で動いており、月次ボードをそれに揃える。
// ★shared.js の isPlanMonth / isHyoukaMonth は1バイトも変えない。呼び方（渡す年月）だけを変える。
//   sokutei.html の dueYm/planYm 分離（2026-07-29）と同じ手法。

// ym('YYYY-MM') の翌月（年跨ぎ対応）。_mbPrevYm_ の対。不正入力は ''。
function _mbNextYm_(ym) {
  var m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
  mo += 1; if (mo > 12) { mo = 1; y += 1; }
  return y + '-' + ('0' + mo).slice(-2);
}

// ボード月(y,m) の翌月 = 計画期間の開始月ノード（年跨ぎ対応）。
// 個別機能訓練計画書チェック.html:1162-1169 の kobetsuCycleAt と同じ論理（コピーではなくGAS側の独立実装）。
function _mbNextMonth_(y, m) {
  return (m === 12) ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
}

// planStart より前の月か（diff<0）。shared.js の isBeforePlanStart と同義（GASからは呼べないので additive に置く）。
// ★用途は kunEval の「幻の督促」ガードのみ。diff=-1（planStart の前月）は isHyoukaMonth が true を返すが、
//   評価すべき前サイクルが存在しないため督促しない。個別機能訓練計画書チェック.html:1323-1324 と同じ意味。
// ★kunPlan には当てないこと。新軸では diff=-1 の利用者は正当な計画作成対象（8月開始なら7月に作る）。
function _mbBeforePlanStart_(planStart, y, m) {
  var mm = String(planStart || '').match(/^(\d{4})-(\d{2})$/);
  if (!mm) return false;
  return ((y - parseInt(mm[1], 10)) * 12 + (m - parseInt(mm[2], 10))) < 0;
}

// 送付日（pdf優先→print）の済判定
function _mbSendDone_(rec, ym) {
  if (rec) {
    if (_mbInMonth_(rec.pdfSendDate, ym)) return { done: true, doneDate: rec.pdfSendDate };
    if (_mbInMonth_(rec.printSendDate, ym)) return { done: true, doneDate: rec.printSendDate };
  }
  return { done: false, doneDate: '' };
}

// 要支援等・測定の月判定（新規）: 前回測定日（targetMonth 直前までの最大）+ サイクル月数 が targetMonth に一致するか。
// 当月に測定済みでも「対象」に残すため、前回は targetMonth より前の最大日で判定する（sokuteiDueDate_ を再利用）。
// A-1（社長決定）: 測定履歴が1件も無い人は「対象・未実施」で必ず出す（漏れ検知）＝ neverMeasured:true。
// 戻り値: { isTarget, prevDate, neverMeasured }
function mbShienMeasureDue_(dates, ym, care, sokuteiDueDateFn) {
  var valid = (dates || []).filter(function (dt) { return !!dt; });
  if (valid.length === 0) return { isTarget: true, prevDate: '', neverMeasured: true };
  var prev = '';
  for (var i = 0; i < valid.length; i++) {
    var dt = valid[i];
    if (String(dt).slice(0, 7) < ym) { if (dt > prev) prev = dt; }
  }
  if (!prev) return { isTarget: false, prevDate: '', neverMeasured: false };
  var due = sokuteiDueDateFn(prev, care);
  return { isTarget: String(due).slice(0, 7) === ym, prevDate: prev, neverMeasured: false };
}

function buildMonthBoard(input, deps) {
  input = input || {};
  var d = _mbResolveDeps_(deps);
  var norm = d.sbNormalizeName_;
  var ym = input.targetMonth;
  var y = parseInt(String(ym).slice(0, 4), 10);
  var m = parseInt(String(ym).slice(5, 7), 10);
  var users = input.users || [];
  var warnings = [];

  // 測定記録を userId/name で日付リスト化
  var sokById = {}, sokByName = {};
  (input.sokuteiRecords || []).forEach(function (r) {
    if (r.userId) (sokById[r.userId] = sokById[r.userId] || []).push(r.sokutei_date);
    if (r.name != null) { var k = norm(r.name); (sokByName[k] = sokByName[k] || []).push(r.sokutei_date); }
  });

  var dueMap = input.tsushoDueMap || {};
  var noDue = {}; // 通所warning重複防止（userId単位）

  // 作業月主義（v1.2 §1-3）: kunPlan は「翌月＝計画期間の開始月」の行を見る。
  // input.kunRecordsNext が供給されていなければ旧軸（当月主義）へフォールバックし、warning で可視化する。
  // ★フォールバックを黙って行わないこと。黙ると「反映したのに数字が変わらない」事故になる。
  var nextNode = _mbNextMonth_(y, m);
  var nextYm = _mbNextYm_(ym);
  var hasNextRecords = !!input.kunRecordsNext;
  if (!hasNextRecords) {
    warnings.push({ type: 'kunPlanAxisFallback', month: ym });
  }

  var oralEval = [], oralPlan = [], kunPlan = [], kunEval = [];
  var sokuteiKaigo = [], sokuteiShien = [], tsushoPlan = [], tsushoEval = [], tsushoMoni = [];

  users.forEach(function (u) {
    var cat = u.category || '';

    // --- 口腔評価/計画書: oralCycleAt role='setsume'（3ヶ月目） ---
    if (d.oralCycleAt) {
      var oc = d.oralCycleAt(u.oralPlanStart, u.oralPlanEnd, y, m);
      if (oc && oc.role === 'setsume') {
        var oRec = _mbPick_(input.oralRecords, u, norm);
        var e = _mbFieldDone_(oRec, 'houkoku_date', ym);
        oralEval.push({ userId: u.userId, name: u.name, done: e.done, doneDate: e.doneDate });
        var p = _mbFieldDone_(oRec, 'plan_date', ym);
        oralPlan.push({ userId: u.userId, name: u.name, done: p.done, doneDate: p.doneDate });
      }
    }

    // --- 個訓（要介護のみ） ---
    if (_mbIsKaigo_(cat)) {
      var kRec = _mbPick_(input.kunRecords, u, norm);
      // 個訓計画書: 作業月主義（v1.2 §1-3 前月準備の原則）。
      //   ボード月の翌月が計画期間の開始月なら、このボード月が作業月＝督促する月。
      //   判定・記録読取・保留判定はすべて翌月の行（＝計画期間の開始月ノード）を見る。
      //   済判定に渡す ym も翌月＝「開始月 or その前月(=作業月)」が済の窓になる。
      // 保留=blocked_reason 有りの月は対象外＝やり残しに出さない（督促は止めるが digest 側で別掲）。
      if (hasNextRecords) {
        var nRec = _mbPick_(input.kunRecordsNext, u, norm);
        if (d.isPlanMonth && d.isPlanMonth(u.planStart, u.planMonths, nextNode.year, nextNode.month)
            && !(nRec && nRec.blocked_reason)) {
          var kp = _mbFieldDoneWorkMonth_(nRec, 'keikaku_date', nextYm);
          kunPlan.push({ userId: u.userId, name: u.name, done: kp.done, doneDate: kp.doneDate });
        }
      } else if (d.isPlanMonth && d.isPlanMonth(u.planStart, u.planMonths, y, m)
          && !(kRec && kRec.blocked_reason)) {
        // 旧軸フォールバック（input.kunRecordsNext 未供給＝呼び出し側が未対応）。
        // 黙って全員「未」にしないための保険。warnings に kunPlanAxisFallback を立てて可視化する。
        var kpOld = _mbFieldDoneWorkMonth_(kRec, 'keikaku_date', ym);
        kunPlan.push({ userId: u.userId, name: u.name, done: kpOld.done, doneDate: kpOld.doneDate });
      }
      // 個訓評価: isHyoukaMonth（短縮 planMonths を反映）。軸は当月のまま（評価に前倒し運用は無い）。
      var isEvalMonth = d.isHyoukaMonth && d.isHyoukaMonth(u.planStart, u.planMonths, y, m);
      if (isEvalMonth) {
        // 保留=blocked_reason 有りの評価月は kunPlan と同じく対象外（督促しない）＝理由の種類で分岐しない truthy 判定。
        // 加えて diff=-1（planStart の前月）は評価すべき前サイクルが無いので除外＝幻の督促ガード。
        if (!(kRec && kRec.blocked_reason) && !_mbBeforePlanStart_(u.planStart, y, m)) {
          var ke = _mbFieldDone_(kRec, 'tasseido_date', ym);
          kunEval.push({ userId: u.userId, name: u.name, done: ke.done, doneDate: ke.doneDate });
        }
        // 測定(要介護)＝個訓評価月と同期（短縮も自動反映。測定はkunEval除外のスコープ外＝現状維持）
        // ★2026-08-01: 測定の正本が「測定記録シート」へ移った（個訓アプリの測定入力を撤去済み・版-03）。
        //   sokById（個訓シート13列目・userIdキー）だけを見ていると片寄せ後の測定を1件も拾えず、
        //   測定しても永久に「未」で督促が続く。実測: 2026-07 の誤督促4名。
        //   ★既存の sokById 参照は外さない。sokByName（測定記録シート・正規化名キー）を足した【和】で見る。
        //     過去分（個訓シート13列目）は sokById 側に残るので画面から消えない。
        //   ★順序は sokById が先。両方にある場合の doneDate が従来と同じ値になるようにするため。
        //   ⚠️対象月の決め方（isHyoukaMonth / planStart 起点）は1バイトも変えていない＝段階5の範囲。
        var ks = _mbListDone_(_mbConcatDates_(sokById[u.userId], sokByName[norm(u.name)]), ym);
        sokuteiKaigo.push({ userId: u.userId, name: u.name, done: ks.done, doneDate: ks.doneDate });
      }
    }

    // --- 測定(要支援等)＝前回測定日+4ヶ月がtargetMonth・nameキー ---
    if (_mbIsShien_(cat) && d.sokuteiDueDate_) {
      var dates = sokByName[norm(u.name)] || [];
      var due = mbShienMeasureDue_(dates, ym, cat, d.sokuteiDueDate_);
      if (due.isTarget) {
        var ss = _mbListDone_(dates, ym);
        sokuteiShien.push({ userId: u.userId, name: u.name, done: ss.done, doneDate: ss.doneDate });
        if (due.neverMeasured) warnings.push({ type: 'neverMeasured', userId: u.userId, name: u.name });
      }
    }

    // --- 通所（isTsusho のみ・満了日で分岐） ---
    if (u.isTsusho) {
      var dueRaw = dueMap[u.userId];
      if (!dueRaw) {
        if (!noDue[u.userId]) { noDue[u.userId] = true; warnings.push({ type: 'noDueDate', userId: u.userId, name: u.name }); }
      } else {
        var isManryou = String(dueRaw).slice(0, 7) === ym;
        var sRec = _mbPick_(input.tsushoSendRecords, u, norm);
        // 通所介護計画書: 満了月の全員（介護・支援とも）・plan_date
        if (isManryou) {
          var tp = _mbFieldDone_(sRec, 'plan_date', ym);
          tsushoPlan.push({ userId: u.userId, name: u.name, done: tp.done, doneDate: tp.doneDate });
        }
        // 通所評価: 満了月 かつ 要支援・事業対象・送付日
        if (isManryou && _mbIsShien_(cat)) {
          var te = _mbSendDone_(sRec, ym);
          tsushoEval.push({ userId: u.userId, name: u.name, done: te.done, doneDate: te.doneDate });
        }
        // 通所モニタリング: 非満了月 かつ 要支援・事業対象・送付日
        if (!isManryou && _mbIsShien_(cat)) {
          var tm = _mbSendDone_(sRec, ym);
          tsushoMoni.push({ userId: u.userId, name: u.name, done: tm.done, doneDate: tm.doneDate });
        }
      }
    }
  });

  function section(key, label, targets) {
    var done = 0;
    targets.forEach(function (t) { if (t.done) done++; });
    return { key: key, label: label, targets: targets, countTarget: targets.length, countDone: done, countUndone: targets.length - done };
  }

  var sections = [
    section('oralEval', '口腔評価', oralEval),
    section('oralPlan', '口腔計画書', oralPlan),
    section('kunPlan', '個訓計画書', kunPlan),
    section('kunEval', '個訓評価', kunEval),
    section('sokuteiKaigo', '測定(要介護)', sokuteiKaigo),
    section('sokuteiShien', '測定(要支援等)', sokuteiShien),
    section('tsushoPlan', '通所介護計画書', tsushoPlan),
    section('tsushoEval', '通所評価', tsushoEval),
    section('tsushoMoni', '通所モニタリング', tsushoMoni)
  ];

  return { month: ym, sections: sections, warnings: warnings };
}

// 日付リストから targetMonth 内の1件を拾う済判定
// 2つの日付配列を連結する（どちらも無くてよい）。★2026-08-01: 測定を2ソースの和で見るために追加。
// 重複は取り除かない（_mbListDone_ は最初に当月へ当たった1件を返すだけで、件数を数えないため
// 二重カウントは起きない）。順序は a が先＝既存の見え方（doneDate）を変えないため。
function _mbConcatDates_(a, b) {
  var out = [];
  if (a) out = out.concat(a);
  if (b) out = out.concat(b);
  return out;
}

function _mbListDone_(dates, ym) {
  if (dates) {
    for (var i = 0; i < dates.length; i++) {
      if (_mbInMonth_(dates[i], ym)) return { done: true, doneDate: dates[i] };
    }
  }
  return { done: false, doneDate: '' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildMonthBoard: buildMonthBoard,
    mbShienMeasureDue_: mbShienMeasureDue_,
    _mbFieldDoneWorkMonth_: _mbFieldDoneWorkMonth_,
    _mbPrevYm_: _mbPrevYm_,
    _mbNextYm_: _mbNextYm_,
    _mbNextMonth_: _mbNextMonth_,
    _mbBeforePlanStart_: _mbBeforePlanStart_
  };
}
