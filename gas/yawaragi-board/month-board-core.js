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
//   kunRecords:   [{ userId, name, keikaku_date, tasseido_date }],
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
      // 個訓計画書: isPlanMonth
      if (d.isPlanMonth && d.isPlanMonth(u.planStart, u.planMonths, y, m)) {
        var kp = _mbFieldDone_(kRec, 'keikaku_date', ym);
        kunPlan.push({ userId: u.userId, name: u.name, done: kp.done, doneDate: kp.doneDate });
      }
      // 個訓評価: isHyoukaMonth（短縮 planMonths を反映）
      var isEvalMonth = d.isHyoukaMonth && d.isHyoukaMonth(u.planStart, u.planMonths, y, m);
      if (isEvalMonth) {
        var ke = _mbFieldDone_(kRec, 'tasseido_date', ym);
        kunEval.push({ userId: u.userId, name: u.name, done: ke.done, doneDate: ke.doneDate });
        // 測定(要介護)＝個訓評価月と同期・userIdキーで済判定（短縮も自動反映）
        var ks = _mbListDone_(sokById[u.userId], ym);
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
    mbShienMeasureDue_: mbShienMeasureDue_
  };
}
