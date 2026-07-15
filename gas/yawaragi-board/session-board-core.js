// 2026-07-11 セッションボード（当日業務ピックアップ）の判定純関数。
// GAS/node 両用（kesseki-box-core.js と同じ流儀）。SpreadsheetApp 等の GAS API に依存しない。
// 名寄せは全業務ここを通す。判定spec: docs/superpowers/specs/2026-07-11-session-board-design.md

// 名寄せ正規化＝全突合キーの唯一の正（_normalizeUserName 相当・NFKC＋全空白除去＋末尾敬称除去）
function sbNormalizeName_(name) {
  var s = String(name == null ? '' : name);
  if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  s = s.replace(/[\s　]+/g, '');
  s = s.replace(/(様|さま|サマ)$/, '');
  return s;
}

// am/pm を正規化キーで一意化し「出席」の人だけ返す。各出席者に session:'am'|'pm' を付与（§2.5）。
// 1日2単位制so同一利用者は同日 am/pm どちらか一方のみ＝session:'both'は無い。
// 異常（同一正規化キーが am/pm 両方に「出席」＝別人の正規化衝突が現実的原因）は am へ決定的割当＋ conflict:true で可視化。
// 返り値: [{ name, key, care, status, session, conflict? }]（name は最初に現れた表記を保持）
function sbUniquePresent_(att) {
  var out = [], seen = {}, sawAm = {}, sawPm = {};
  var root = att && att.attendance;
  if (!root) return out;
  ['am', 'pm'].forEach(function (k) {
    (root[k] || []).forEach(function (a) {
      var key = sbNormalizeName_(a && a.name);
      if (!key) return;
      if (a.status === '出席') { if (k === 'am') sawAm[key] = true; else sawPm[key] = true; }
      if (seen[key]) {
        if (a.status === '出席') seen[key].status = '出席';
        if (!seen[key].care && a.care) seen[key].care = a.care;
        return;
      }
      var c = { name: a.name, key: key, care: a.care || '', status: a.status || '' };
      seen[key] = c; out.push(c);
    });
  });
  var present = out.filter(function (c) { return c.status === '出席'; });
  present.forEach(function (c) {
    var inAm = !!sawAm[c.key], inPm = !!sawPm[c.key];
    if (inAm && inPm) { c.session = 'am'; c.conflict = true; }  // 2単位制ではあり得ない異常
    else if (inAm) { c.session = 'am'; }
    else { c.session = 'pm'; }
  });
  return present;
}

// --- sokutei.html:99-121 からの逐語転記（1文字も変えない・正本=my-project/scripts/test-sokutei-priority.js） ---
function sokuteiCycleMonths_(care) {
  return String(care || '').indexOf('要介護') === 0 ? 3 : 4;
}

function sokuteiDueDate_(baseDateStr, care) {
  var y = parseInt(String(baseDateStr).slice(0, 4), 10);
  var m = parseInt(String(baseDateStr).slice(5, 7), 10);
  var d = parseInt(String(baseDateStr).slice(8, 10), 10);
  var add = sokuteiCycleMonths_(care);
  var m0 = (m - 1) + add;               // 0始まり月に加算
  var ny = y + Math.floor(m0 / 12);
  var nm = (m0 % 12) + 1;               // 1-12
  var lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate(); // 翌月0日=当月末日
  var nd = d > lastDay ? lastDay : d;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return ny + '-' + pad(nm) + '-' + pad(nd);
}

function sokuteiRemaining_(dueDateStr, todayStr) {
  var due = Date.parse(String(dueDateStr) + 'T00:00:00Z');
  var today = Date.parse(String(todayStr) + 'T00:00:00Z');
  return Math.round((due - today) / 86400000);
}

// 要支援・事業対象の測定対象行（enriched・未ソート）。前回実測定日+4ヶ月。並びは sbSokuteiSort_ が担当。
// usageByKey: 名前→出席率U（内部正規化・§3.4）。返り値行に careLayer:1 / weeklyVisits / remainingVisits / absenceRate / unmeasured を付与。
// 返り値: [{ name, key, care, last, due, remaining, unmeasured, track:'shien', careLayer:1, weeklyVisits, remainingVisits, absenceRate }]
function sbMeasureShien_(shienUsers, lastByName, todayStr, usageByKey) {
  var lastByKey = {};
  if (lastByName) {
    for (var nm in lastByName) {
      if (!lastByName.hasOwnProperty(nm)) continue;
      var v = lastByName[nm];
      if (!v) continue;
      var nk = sbNormalizeName_(nm);
      if (!lastByKey[nk] || v > lastByKey[nk]) lastByKey[nk] = v;
    }
  }
  var usageNorm = {};
  if (usageByKey) {
    for (var un in usageByKey) {
      if (usageByKey.hasOwnProperty(un)) usageNorm[sbNormalizeName_(un)] = usageByKey[un];
    }
  }
  return (shienUsers || []).map(function (u) {
    var key = sbNormalizeName_(u.name);
    var last = lastByKey[key] || '';
    var due = '', remaining = -999, unmeasured = !last;
    if (last) { due = sokuteiDueDate_(last, u.care || ''); remaining = sokuteiRemaining_(due, todayStr); }
    // done方式: 前回測定日(last)の年月が当月なら「今月測定済み」＝done（feat/sokutei-check-shien 反映不要）。
    var done = !!last && String(last).slice(0, 7) === String(todayStr).slice(0, 7);
    var uRate = (usageNorm[key] != null) ? usageNorm[key] : 1.0;
    var absRate = 1 - uRate; if (absRate < 0) absRate = 0; if (absRate > 1) absRate = 1;
    return {
      name: u.name, key: key, care: u.care || '', last: last, due: due, remaining: remaining,
      unmeasured: unmeasured, done: done, track: 'shien', careLayer: 1,
      weeklyVisits: sbCountWeeklyVisits_(u.days), remainingVisits: sbCountRemainingVisits_(u.days, todayStr),
      absenceRate: absRate
    };
  });
}

// 対象日が属する月の月末(YYYY-MM-DD)を返す
function sbMonthEnd_(year, month) {
  var lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return year + '-' + pad(month) + '-' + pad(lastDay);
}

// 要介護の測定対象行（enriched・未ソート）。当月が評価月(isHyoukaMonthFn)かつ当評価月未実施。並びは sbSokuteiSort_ が担当。
// doneByKey: 当評価月に sokutei_date が入っている人の名前→true（内部正規化・§3.4）。usageByKey: 名前→出席率U（内部正規化）。
// 返り値: [{ name, key, care, remaining, track:'kaigo', careLayer:0, weeklyVisits, remainingVisits, absenceRate }]
//   remaining=月末カレンダー残日数（表示用）／remainingVisits=残来所日数（優先順位用）。
function sbMeasureKaigo_(kaigoUsers, doneByKey, year, month, todayStr, isHyoukaMonthFn, usageByKey) {
  var doneNorm = {};
  if (doneByKey) {
    for (var dk in doneByKey) {
      if (doneByKey.hasOwnProperty(dk) && doneByKey[dk]) doneNorm[sbNormalizeName_(dk)] = true;
    }
  }
  var usageNorm = {};
  if (usageByKey) {
    for (var un in usageByKey) {
      if (usageByKey.hasOwnProperty(un)) usageNorm[sbNormalizeName_(un)] = usageByKey[un];
    }
  }
  var monthEnd = sbMonthEnd_(year, month);
  var rows = [];
  (kaigoUsers || []).forEach(function (u) {
    if (!isHyoukaMonthFn(u.planStart, u.planMonths, year, month)) return;
    var key = sbNormalizeName_(u.name);
    // done方式: 当評価月に sokutei_date 済みでも消さず done:true で残す（グレー化はフロント）。
    var done = !!doneNorm[key];
    var uRate = (usageNorm[key] != null) ? usageNorm[key] : 1.0;
    var absRate = 1 - uRate; if (absRate < 0) absRate = 0; if (absRate > 1) absRate = 1;
    rows.push({
      name: u.name, key: key, care: u.category || '', remaining: sokuteiRemaining_(monthEnd, todayStr),
      done: done, track: 'kaigo', careLayer: 0,
      weeklyVisits: sbCountWeeklyVisits_(u.days), remainingVisits: sbCountRemainingVisits_(u.days, todayStr),
      absenceRate: absRate
    });
  });
  return rows;
}

// 口腔モニ対象行。role が none 以外かつ当月role未実施。role仕分けはせず対象者を全員返す。
// oralRecByKey: 名前 → { moni1_date, moni2_date, houkoku_date, plan_date }（キーは内部で正規化して照合・§3.4）。
// oralCycleAtFn は oral-plan.html の oralCycleAt を注入。
// 実施済み判定: moni1→moni1_date / moni2→moni2_date / setsume→(houkoku_date && plan_date)。
// 返り値: [{ name, key, role }]
function sbKoukuMoni_(oralUsers, oralRecByKey, year, month, oralCycleAtFn) {
  var recByKey = {};
  if (oralRecByKey) {
    for (var rk in oralRecByKey) {
      if (oralRecByKey.hasOwnProperty(rk)) recByKey[sbNormalizeName_(rk)] = oralRecByKey[rk];
    }
  }
  var rows = [];
  (oralUsers || []).forEach(function (u) {
    var res = oralCycleAtFn(u.planStart, u.planEnd, year, month);
    if (!res || res.role === 'none') return;
    var key = sbNormalizeName_(u.name);
    var rec = recByKey[key] || {};
    var done;
    if (res.role === 'moni1') done = !!rec.moni1_date;
    else if (res.role === 'moni2') done = !!rec.moni2_date;
    else done = !!(rec.houkoku_date && rec.plan_date); // setsume
    // done方式: 当月入力済みでも消さず done:true で残す（グレー化はフロント）。
    rows.push({ name: u.name, key: key, role: res.role, done: done });
  });
  return rows;
}

// 口腔体操対象。isTarget/is_target が明示 false 以外は対象（未設定=既定true）。
// 実源getOralTargetUsers_はキャメルケースisTargetを返す。is_targetは生シート列名（互換のため両対応）。
// done方式: 1aの count/required/remaining を組込み、残>0のみ未実施（done=remaining<=0）。
//   oralChecks=口腔①実施記録の checks[年度][氏名]["{月}月_{回目}"]（G0でGASが供給・未供給時は全員未実施の安全既定）。
//   u.care=介護度 / u.kubunChangeDate=区変適用日('YYYY-MM-DD')（GASがjoinして供給）。
// 返り値: [{ name, key, care, doneCount, required, remaining, done }]
function sbKoukuTaisou_(oralSettings, oralChecks, year, month) {
  var targetMonth = (year != null && month != null) ? (year + '-' + (month < 10 ? '0' : '') + month) : '';
  return (oralSettings || []).filter(function (u) { return u.isTarget !== false && u.is_target !== false; })
    .map(function (u) {
      var key = sbNormalizeName_(u.name);
      var doneCount = countOralTaisou_(oralChecks, key, year, month);
      var required = requiredOralTaisou_(u.care || '', u.kubunChangeDate || '', targetMonth);
      var remaining = remainingOralTaisou_(required, doneCount);
      return { name: u.name, key: key, care: u.care || '', doneCount: doneCount, required: required, remaining: remaining, done: remaining <= 0 };
    });
}

// 個訓対象。介護度「要介護」前方一致かつ非中止。返り値: [{ name, key, care }]
function sbKotan_(users) {
  return (users || []).filter(function (u) {
    return !u.cancelled && String(u.category || '').indexOf('要介護') === 0;
  }).map(function (u) { return { name: u.name, key: sbNormalizeName_(u.name), care: u.category || '' }; });
}

// 誕生日対象。birthday("M/D") が今月＝targetMonth かつ 撮影status未完（photo&&print&&give でない）。
// 当日出席フィルタは掛けない（月単位業務）。statusByKey: 名前→{photo,print,give}（キーは内部で正規化・§3.4）。
// 返り値: [{ name, key, month, day }]（日昇順）
function sbBirthday_(users, targetMonth, statusByKey) {
  var statusNorm = {};
  if (statusByKey) {
    for (var sk in statusByKey) {
      if (statusByKey.hasOwnProperty(sk)) statusNorm[sbNormalizeName_(sk)] = statusByKey[sk];
    }
  }
  var rows = [];
  (users || []).forEach(function (u) {
    var mm = String(u.birthday == null ? '' : u.birthday).match(/(\d{1,2})\/(\d{1,2})/);
    if (!mm) return;
    var mo = parseInt(mm[1], 10), da = parseInt(mm[2], 10);
    if (mo !== targetMonth) return;
    var key = sbNormalizeName_(u.name);
    var st = statusNorm[key] || {};
    var done = !!(st.photo && st.print && st.give);
    if (done) return;
    rows.push({ name: u.name, key: key, month: mo, day: da });
  });
  rows.sort(function (a, b) { return a.day - b.day; });
  return rows;
}

// 対象リスト × 当日出席者。出席keyの集合に含まれる対象のみを、対象(targets)側の順序を維持して返す（targetsは逼迫度順で来る）。
// 当たった出席者の session を業務hit行へ載せる（§2.5）。元 target 行は破壊せず浅いコピーを返す。
function sbIntersectPresent_(targets, present) {
  var byKey = {};
  (present || []).forEach(function (p) { byKey[p.key] = p; });
  var out = [];
  (targets || []).forEach(function (t) {
    var p = byKey[t.key];
    if (!p) return;
    var row = {};
    for (var kk in t) { if (t.hasOwnProperty(kk)) row[kk] = t[kk]; }
    if (p.session) row.session = p.session;
    out.push(row);
  });
  return out;
}

// 出席者のうち、どの対象キー集合(allTargetKeys)にも当たらない者＝名寄せ不能residue。
// 別人誤割当より拾い漏れ可視化を優先する安全弁。返り値: [{ name, key }]
function sbResidue_(present, allTargetKeys) {
  return (present || []).filter(function (p) { return !allTargetKeys[p.key]; })
    .map(function (p) { return { name: p.name, key: p.key, session: p.session }; });
}

// 全業務を集約してセッションボード1レスポンス相当を組み立てる純関数。
// judges = { isHyoukaMonth, oralCycleAt }（GASはグローバル、nodeは抽出注入）。
// 測定=要介護(交差)+要支援(交差) を sokutei に統合。口腔体操・個訓は当日出席と交差。誕生日は交差しない。
// residue = 出席者のうち 測定/口腔モニ/口腔体操/個訓 のどれにも当たらない者。
// 測定プール優先順位の重み（spec §2.4・実データ確認後に調整可）。
var SOKUTEI_WEIGHTS = { chance: 1.0, freq: 0.6, absence: 0.6, unmeasuredBoost: 2.0 };

function sbBuildBoard_(input, judges) {
  var present = sbUniquePresent_(input.attendance);
  // session別のdistinct人数と異常（am/pm衝突）を集計（§2.5）。presentAm+presentPm=presentCount 恒等。
  var presentAm = 0, presentPm = 0, ampmConflict = [];
  present.forEach(function (p) {
    if (p.session === 'am') presentAm++; else if (p.session === 'pm') presentPm++;
    if (p.conflict) ampmConflict.push({ name: p.name, key: p.key });
  });
  var kaigo = sbMeasureKaigo_(input.kaigoUsers, input.kaigoDoneByKey, input.year, input.month, input.today, judges.isHyoukaMonth, input.usageByKey);
  var shien = sbMeasureShien_(input.shienUsers, input.shienLastByName, input.today, input.usageByKey);
  var sokutei = sbSokuteiSort_(sbIntersectPresent_(kaigo, present).concat(sbIntersectPresent_(shien, present)), SOKUTEI_WEIGHTS);
  var koukuMoni = sbDoneLast_(sbIntersectPresent_(sbKoukuMoni_(input.oralUsers, input.oralRecByKey, input.year, input.month, judges.oralCycleAt), present));
  var koukuTaisou = sbDoneLast_(sbIntersectPresent_(sbKoukuTaisou_(input.oralSettings, input.oralChecks, input.year, input.month), present));
  var kotan = sbIntersectPresent_(sbKotan_(input.allUsers), present);
  var birthday = sbBirthday_(input.bdUsers, input.month, input.bdStatusByKey);

  var hit = {};
  [sokutei, koukuMoni, koukuTaisou, kotan].forEach(function (arr) {
    arr.forEach(function (r) { hit[r.key] = true; });
  });
  var residue = sbResidue_(present, hit);

  return {
    date: input.today, year: input.year, month: input.month,
    presentCount: present.length, presentAm: presentAm, presentPm: presentPm,
    sokutei: sokutei, koukuMoni: koukuMoni, koukuTaisou: koukuTaisou,
    kotan: kotan, birthday: birthday, residue: residue, ampmConflict: ampmConflict
  };
}

// 利用曜日文字列（例 "火木"）の曜日文字数＝週来所回数（日数ベース・AM/PM不使用）。
function sbCountWeeklyVisits_(days) {
  var s = String(days == null ? '' : days);
  var w = ['月', '火', '水', '木', '金', '土', '日'];
  var c = 0;
  for (var i = 0; i < w.length; i++) { if (s.indexOf(w[i]) >= 0) c++; }
  return c;
}

// 明日〜当月末で days に含まれる曜日の日数（残来所日数）。today='YYYY-MM-DD'。
function sbCountRemainingVisits_(days, todayStr) {
  var s = String(days == null ? '' : days);
  if (!s) return 0;
  var y = parseInt(String(todayStr).slice(0, 4), 10);
  var m = parseInt(String(todayStr).slice(5, 7), 10);
  var d = parseInt(String(todayStr).slice(8, 10), 10);
  if (!(y && m && d)) return 0;
  var w = ['日', '月', '火', '水', '木', '金', '土'];  // getUTCDay: 0=日
  var lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  var c = 0;
  for (var day = d + 1; day <= lastDay; day++) {
    var dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (s.indexOf(w[dow]) >= 0) c++;
  }
  return c;
}

// 加重加算の逼迫度スコア（高いほど「今日やる」先頭）。row={weeklyVisits,remainingVisits,absenceRate,unmeasured?}。
// weights={chance,freq,absence,unmeasuredBoost}。欠損ガード: weeklyVisits<=0 は chance/freq を0。
function sbMeasureUrgency_(row, weights) {
  var w = weights || {};
  var wc = (w.chance != null) ? w.chance : 1.0;
  var wf = (w.freq != null) ? w.freq : 0.6;
  var wa = (w.absence != null) ? w.absence : 0.6;
  var ub = (w.unmeasuredBoost != null) ? w.unmeasuredBoost : 2.0;
  var wv = row && row.weeklyVisits ? row.weeklyVisits : 0;
  var rv = row && row.remainingVisits != null ? row.remainingVisits : 0;
  if (rv < 0) rv = 0;
  var chance = wv > 0 ? 1 / (rv + 1) : 0;
  var freq = wv > 0 ? 1 / wv : 0;
  var abs = row && row.absenceRate ? row.absenceRate : 0;
  if (abs < 0) abs = 0; if (abs > 1) abs = 1;
  var s = wc * chance + wf * freq + wa * abs;
  if (row && row.unmeasured) s += ub;
  return s;
}

// 測定プール（要介護＋要支援）の階層ソート。非破壊で新配列を返す。
// careLayer↑ → urgency↓ → remainingVisits↑ → weeklyVisits↑ → absenceRate↓ → key↑。
function sbSokuteiSort_(pool, weights) {
  var arr = (pool || []).slice();
  arr.sort(function (a, b) {
    // done方式: 実施済みは最下位（未実施を上に沈めない）。careLayer/urgency より優先。
    var da = a.done ? 1 : 0, db = b.done ? 1 : 0;
    if (da !== db) return da - db;
    var la = a.careLayer || 0, lb = b.careLayer || 0;
    if (la !== lb) return la - lb;
    var ua = sbMeasureUrgency_(a, weights), ub = sbMeasureUrgency_(b, weights);
    if (ua !== ub) return ub - ua;
    var ra = (a.remainingVisits != null) ? a.remainingVisits : 1e9;
    var rb = (b.remainingVisits != null) ? b.remainingVisits : 1e9;
    if (ra !== rb) return ra - rb;
    var wa2 = (a.weeklyVisits != null) ? a.weeklyVisits : 1e9;
    var wb2 = (b.weeklyVisits != null) ? b.weeklyVisits : 1e9;
    if (wa2 !== wb2) return wa2 - wb2;
    var aa = a.absenceRate || 0, ab = b.absenceRate || 0;
    if (aa !== ab) return ab - aa;
    return String(a.key || '').localeCompare(String(b.key || ''));
  });
  return arr;
}

// ============================================================
// 口腔体操（口腔①実施記録）当月回数の純関数（GAS/node 両用）。
// 土台: oral-record.html の checks[年度][氏名]["{月}月_{回目}"]=日付。
//   年度(nendo)=カレンダー月>=4 ? year : year-1（getCurrentFiscalYear 相当）。キー={month}月_1回目/2回目。
//   区変ゲートは isOralTwiceMonthly を踏襲（要介護=常2 / 要支援=区変適用月以降のみ2）。
// ============================================================

// 当月に実施済み（1回目/2回目）のキー数を数える。氏名は正規化済み normName を受け取り、
// 保存側氏名も sbNormalizeName_ で正規化して照合（drift吸収・§3.4）。該当年度/該当者なしは 0（未実施扱い）。
function countOralTaisou_(oralChecks, normName, year, month) {
  if (!oralChecks) return 0;
  var nendo = (month >= 4) ? year : year - 1;
  var yearData = oralChecks[nendo] || oralChecks[String(nendo)] || null;
  if (!yearData) return 0;
  var rec = null;
  for (var storedName in yearData) {
    if (!yearData.hasOwnProperty(storedName)) continue;
    if (sbNormalizeName_(storedName) === normName) { rec = yearData[storedName]; break; }
  }
  if (!rec) return 0;
  var label = month + '月';
  var c = 0;
  if (rec[label + '_1回目']) c++;
  if (rec[label + '_2回目']) c++;
  return c;
}

// 当月の規定回数。要介護=2 / 要支援・事業対象=1。ただし要支援は区変(要介護化)の適用月「以降」のみ2
// （oral-record.html isOralTwiceMonthly の区変ゲート踏襲）。kubunChangeDate='YYYY-MM-DD' or ''、targetMonth='YYYY-MM'。
function requiredOralTaisou_(careLevel, kubunChangeDate, targetMonth) {
  var cl = String(careLevel || '');
  if (cl.indexOf('要介護') === 0) return 2;  // 要介護は区変判定不要で常に月2回
  var kubunYm = String(kubunChangeDate || '').slice(0, 7);
  var tgt = String(targetMonth || '');
  if (/^\d{4}-\d{2}$/.test(kubunYm) && /^\d{4}-\d{2}$/.test(tgt) && tgt >= kubunYm) return 2;
  return 1;  // 要支援/事業対象の既定＝月1回
}

// 残り回数（下限0）。required=requiredOralTaisou_ の値／done=countOralTaisou_ の値。
function remainingOralTaisou_(required, done) {
  var r = (required || 0) - (done || 0);
  return r < 0 ? 0 : r;
}

// ============================================================
// done方式の並べ替え・残数カウント（フロント カード数=未実施のみ / 上位N=未実施のみ の土台）。
// ============================================================

// 未実施(!done)を上・済み(done)を下に沈める安定ソート（元順序は保持）。非破壊。
function sbDoneLast_(arr) {
  var a = (arr || []).map(function (r, i) { return [r, i]; });
  a.sort(function (x, y) {
    var dx = x[0] && x[0].done ? 1 : 0, dy = y[0] && y[0].done ? 1 : 0;
    if (dx !== dy) return dx - dy;
    return x[1] - y[1];  // 安定化（同区分は元順序）
  });
  return a.map(function (p) { return p[0]; });
}

// カード人数＝未実施のみの残数（対象者総数ではない）。
function sbUndoneCount_(arr) {
  return (arr || []).filter(function (r) { return !(r && r.done); }).length;
}

// 「今日やる上位N」の枠取りも未実施のみで数える。arr は事前に優先順ソート済み前提（sbSokuteiSort_）。
function sbTopUndone_(arr, n) {
  return (arr || []).filter(function (r) { return !(r && r.done); }).slice(0, n);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sbNormalizeName_: sbNormalizeName_,
    sbUniquePresent_: sbUniquePresent_,
    sokuteiCycleMonths_: sokuteiCycleMonths_,
    sokuteiDueDate_: sokuteiDueDate_,
    sokuteiRemaining_: sokuteiRemaining_,
    sbMeasureShien_: sbMeasureShien_,
    sbMonthEnd_: sbMonthEnd_,
    sbMeasureKaigo_: sbMeasureKaigo_,
    sbKoukuMoni_: sbKoukuMoni_,
    sbKoukuTaisou_: sbKoukuTaisou_,
    sbKotan_: sbKotan_,
    sbBirthday_: sbBirthday_,
    sbIntersectPresent_: sbIntersectPresent_,
    sbResidue_: sbResidue_,
    sbBuildBoard_: sbBuildBoard_,
    sbCountWeeklyVisits_: sbCountWeeklyVisits_,
    sbCountRemainingVisits_: sbCountRemainingVisits_,
    sbMeasureUrgency_: sbMeasureUrgency_,
    sbSokuteiSort_: sbSokuteiSort_,
    countOralTaisou_: countOralTaisou_,
    requiredOralTaisou_: requiredOralTaisou_,
    remainingOralTaisou_: remainingOralTaisou_,
    sbDoneLast_: sbDoneLast_,
    sbUndoneCount_: sbUndoneCount_,
    sbTopUndone_: sbTopUndone_
  };
}
