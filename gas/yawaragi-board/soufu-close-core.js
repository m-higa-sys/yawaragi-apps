/* 月末締めスナップショット コア（純関数・案C・2026-08-05）
 *
 * 何をするものか:
 *   毎月1日の未明に前月分を「締める」。台帳に行が無い＝誰も何も押さなかった案件を
 *   status='保留' として台帳に固定する。これをやらないと、翌月になった瞬間に
 *   変換層（当月ベース）が前月の書類を作らなくなり、未提出が画面から静かに消える。
 *
 * ★二重実装の負債（既知・報告済み）:
 *   生成ルールは teishutsu.html の buildTasks（クライアント側）と同じ内容を
 *   サーバー側にもう一度書いている。片方だけ直すと締めと画面がズレる。
 *   将来どちらかへ寄せるまでは、両方セットで直すこと。
 *   - isHyoukaMonth … session-board-judges.js のGASグローバルを使う（重複なし）
 *   - 口腔の節目 … session-board-judges.js の oralCycleAt を使う（重複なし・2026-08-06 に自前計算を廃止）
 *   - _scIsMeasureMonth … teishutsu.html インライン isMeasureMonth の移植（同上）
 *   - _scCareOf / _scShiftYM … teishutsu.html の careOf / shiftYM の移植（同上）
 */

// 要支援・事業対象は同じ扱い（2026-06-12 社長判断）。それ以外は要介護。
function _scCareOf(category) {
  var s = String(category || '');
  return (s.indexOf('支援') >= 0 || s.indexOf('事業対象') >= 0) ? 'shien' : 'kaigo';
}

function _scShiftYM(ym, delta) {
  var p = String(ym).split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
  var t = y * 12 + (m - 1) + delta;
  return Math.floor(t / 12) + '-' + ('0' + (t % 12 + 1)).slice(-2);
}

// 口腔 節目月（結果報告書＋計画書を作る月）: plan_start 起点の3ヶ月サイクル。
// ★2026-08-06 修正。判定は自前で持たず、GASグローバルの oralCycleAt（session-board-judges.js）を使う。
//   なぜ起点を変えたか（実測 2026-08-06）:
//     旧実装は started_at 起点だったが、started_at は口腔②導入時に加算対象106名すべてへ
//     '2026-06' が一括投入された初期値で、個人のサイクルを表していない。
//     そのまま3ヶ月周期を回すと 8月0名 / 9月106名（全員） / 10月0名 となり、
//     実際の分布（plan_start 起点で 8月40名 / 9月35名 / 10月29名）と全く合わない。
//     7月の締めで口腔が1件も作られなかったのはこれが原因。
//   画面(oral-plan.html)・月次ボード(month-board-core.js)は元から plan_start 起点の oralCycleAt を
//   使っているので、締めをそちらへ揃える＝判定を1本にする（複製を増やさない）。
function _scOralSetsume_(planStart, planEnd, year, month) {
  if (typeof oralCycleAt !== 'function') {
    throw new Error('oralCycleAt が未ロード（session-board-judges.js が必要）');
  }
  return oralCycleAt(planStart, planEnd, year, month).role === 'setsume';
}

// 測定月: 要支援=4ヶ月周期 / 要介護=3ヶ月周期（teishutsu.html インライン版と同一ロジック）
function _scIsMeasureMonth(planStart, ym, startDate, care) {
  if (!planStart) return false;
  var cycle = (care === 'shien') ? 4 : 3;
  var pp = String(planStart).split('-');
  var pYear = Number(pp[0]), pMonth = Number(pp[1]);
  if (isNaN(pYear) || isNaN(pMonth)) return false;
  var sp = String(ym).split('-');
  var selected = Number(sp[0]) * 12 + (Number(sp[1]) - 1);
  if (startDate) {
    var st = String(startDate).split('-');
    var stYear = Number(st[0]), stMonth = Number(st[1]);
    if (!isNaN(stYear) && !isNaN(stMonth)) {
      var startM = stYear * 12 + (stMonth - 1);
      if (selected < startM) return false;
      return (selected - startM) % cycle === 0;
    }
  }
  var planM = pYear * 12 + (pMonth - 1);
  var diff = selected - (planM - 1);
  if (diff < 0) return false;
  return diff % cycle === 0;
}

function _scHyoukaMonth(planStart, planMonths, y, m) {
  if (typeof isHyoukaMonth !== 'function') {
    throw new Error('isHyoukaMonth が未ロード（session-board-judges.js が必要）');
  }
  return isHyoukaMonth(planStart, planMonths, y, m);
}

/**
 * ★母集団ルール（社長承認済み・2026-08-05）
 *   非中止の全員 ＋ 中止者のうち対象月に利用実績が1日以上ある人。
 *   利用者台帳の「中止」には日付が無い。素朴に中止者を含めると、何年も前に辞めた人の
 *   書類が毎月永久に生成される。逆に全部外すと、月中で辞めた人の未提出が消える。
 *   実績が取れない（undefined）場合は含めない＝不明を1日扱いに膨らませない。
 */
function _scIncludeUser(user) {
  if (!user.cancelled) return true;
  var d = user.usageDays;
  return (typeof d === 'number' && isFinite(d) && d >= 1);
}

/**
 * 1人分の対象書類を返す（teishutsu.html buildTasks:315-324 と同一ルール）。
 * @return {Array<{docType:string, tekiyoTsuki:string}>}
 */
function _scDocsFor(user, ym) {
  var p = String(ym).split('-');
  var yy = parseInt(p[0], 10), mm = parseInt(p[1], 10);
  var care = _scCareOf(user.category);
  var dueYM = String(user.dueYM || '').slice(0, 7);
  var isManryou = !!dueYM && dueYM === ym;
  var out = [];

  if (care === 'shien' && !isManryou) out.push({ docType: 'tsusho_moni', tekiyoTsuki: ym });
  if (isManryou) out.push({ docType: 'tsusho_keikaku', tekiyoTsuki: dueYM });
  if (care === 'shien' && isManryou) out.push({ docType: 'tsusho_hyouka', tekiyoTsuki: dueYM });
  if (care === 'kaigo' && _scHyoukaMonth(user.kunPlanStart, user.kunPlanMonths, yy, mm))
    out.push({ docType: 'kokun_set', tekiyoTsuki: _scShiftYM(ym, 1) });
  if (user.isTarget && _scOralSetsume_(user.oralPlanStart, user.oralPlanEnd, yy, mm))
    out.push({ docType: 'oral_plan', tekiyoTsuki: _scShiftYM(ym, 1) });
  if (care === 'shien' && _scIsMeasureMonth(user.sokuteiPlanStart, ym, '', care))
    out.push({ docType: 'sokutei', tekiyoTsuki: ym });

  return out;
}

/**
 * 締め計画を作る（シートには触らない）。
 * @param {Array<Object>} users  {userId, category, cancelled, usageDays, isTarget,
 *                                oralStartedAt, kunPlanStart, kunPlanMonths, sokuteiPlanStart, dueYM}
 * @param {string} ym            対象月 'YYYY-MM'（通常は前月）
 * @param {Array<string>} existingKeys 台帳に既にある 'userId|docType|taishoTsuki' の配列
 * @return {{rows:Array<Object>, stats:Object}}
 */
function soufuClosePlan_(users, ym, existingKeys) {
  if (!/^\d{4}-\d{2}$/.test(String(ym))) throw new Error('対象月は YYYY-MM 形式: ' + ym);
  var have = {};
  (existingKeys || []).forEach(function (k) { have[k] = true; });

  var rows = [];
  var stats = {
    ym: ym,
    inputUsers: (users || []).length,
    populationTotal: 0,       // 母集団に入った人数
    cancelledIncluded: 0,     // うち中止者（実績1日以上）
    cancelledExcluded: 0,     // 母集団から外した中止者
    candidates: 0,            // 生成候補（＝対象書類の総数）
    skippedExisting: 0,       // 既に台帳に行があってスキップした数
    created: 0,               // 実際に足す行数
    // ★口腔の plan_start が未設定の加算対象者（母集団に入った人のみ）。
    //   未設定だと節目が判定できず oral_plan を1件も立てられない＝黙って落ちる。
    //   落とすのは「誤った月に立てるより安全」だが、落ちた事実は件数で見せる。
    oralPlanStartMissing: 0,
    byDocType: {}
  };

  (users || []).forEach(function (user) {
    if (!_scIncludeUser(user)) { stats.cancelledExcluded++; return; }
    stats.populationTotal++;
    if (user.cancelled) stats.cancelledIncluded++;
    if (user.isTarget && !String(user.oralPlanStart || '').trim()) stats.oralPlanStartMissing++;

    _scDocsFor(user, ym).forEach(function (d) {
      stats.candidates++;
      var key = user.userId + '|' + d.docType + '|' + ym;
      // ★冪等の核: キーが台帳にあれば status を問わず一切触らない。
      //   人が押した「揃った」「送付済」も、前回の締めが作った「保留」も同じ扱い。
      if (have[key]) { stats.skippedExisting++; return; }
      have[key] = true;   // 同一実行内での重複生成も防ぐ
      stats.created++;
      stats.byDocType[d.docType] = (stats.byDocType[d.docType] || 0) + 1;
      rows.push({
        userId: user.userId, docType: d.docType, taishoTsuki: ym, tekiyoTsuki: d.tekiyoTsuki,
        status: '保留',
        sorotta_at: '', sorotta_by: '', sofu_at: '', soufusha: '', soufuHouhou: '',
        kurikoshiRiyu: '',            // 空＝理由未記録（あとから人が付けられる）
        signKigen: '',
        updatedBy: 'monthly-close',   // 機械実行と分かる名前（人の操作と混ざらない）
        updatedAt: ''                 // 呼び出し側で実行時刻を入れる
      });
    });
  });

  return { rows: rows, stats: stats };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    soufuClosePlan_: soufuClosePlan_,
    _scCareOf: _scCareOf,
    _scShiftYM: _scShiftYM,
    _scOralSetsume_: _scOralSetsume_,
    _scIsMeasureMonth: _scIsMeasureMonth,
    _scIncludeUser: _scIncludeUser,
    _scDocsFor: _scDocsFor
  };
}
