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

// 測定の共通読み関数（shared.js §I の mergeSokuteiRecords と同一挙動のミラー）。
// 「測定済み判定」の3箇所再実装（sessionBoardBuildInput_ / mb_kunRec・mb_shienSok / 個訓直読み）を
//   集約するための土台。要介護「個別機能訓練計画書記録」＋要支援「要支援測定記録」を1つの正規形へ統合。
//   - paper除外★: source:'paper'（紙台帳投入・日付が月初仮置き）は既定で除外（スタッフ別集計・個訓の✓印）。
//     opts.includePaper=true のときは含める（期限計算＝前回測定日アンカーに紙seedを使う用途）。
//   - 日付名正規化: 入力の sokutei_date / last / doneDate を、出力は sokutei_date 1本に統一
//   - 結合キー: 要介護は必ず userId（無ければ name フォールバック）／要支援は構造上 name のみ
//   - 測定日の無い行は測定実績でないため除外
// 返り値: [{ key, matchedBy, sokutei_date, sokutei_by, output_by, careType, source }]
//   output_by は要介護のみ（要支援は null）。source は要介護は ''（列なし）。paper は source で判別可。
// shared.js とのドリフトは scripts/test-sokutei-merge.js が検知する。純関数・GAS API非依存。
function mergeSokuteiRecords(kaigoRecords, shienRecords, opts) {
  var includePaper = !!(opts && opts.includePaper);
  function pickDate(r) {
    return String((r && (r.sokutei_date || r.last || r.doneDate)) || '').trim();
  }
  var out = [];
  var kaigo = kaigoRecords || [];
  for (var i = 0; i < kaigo.length; i++) {
    var kr = kaigo[i];
    var kd = pickDate(kr);
    if (!kd) continue;
    var uid = String((kr && kr.userId) || '').trim();
    var knm = String((kr && kr.name) || '').trim();
    out.push({
      key: uid || knm,
      matchedBy: uid ? 'userId' : 'name',
      sokutei_date: kd,
      sokutei_by: String((kr && kr.sokutei_by) || ''),
      output_by: String((kr && kr.output_by) || ''),
      careType: '要介護',
      source: ''
    });
  }
  var shien = shienRecords || [];
  for (var j = 0; j < shien.length; j++) {
    var sr = shien[j];
    var ssrc = String((sr && sr.source) || '').trim();
    if (!includePaper && ssrc === 'paper') continue;
    var sd = pickDate(sr);
    if (!sd) continue;
    out.push({
      key: String((sr && sr.name) || '').trim(),
      matchedBy: 'name',
      sokutei_date: sd,
      sokutei_by: String((sr && sr.sokutei_by) || ''),
      output_by: null,
      careType: '要支援系',
      source: ssrc
    });
  }
  return out;
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
    var uRate = (usageNorm[key] != null) ? usageNorm[key] : 1.0;
    var absRate = 1 - uRate; if (absRate < 0) absRate = 0; if (absRate > 1) absRate = 1;
    return {
      name: u.name, key: key, care: u.care || '', last: last, due: due, remaining: remaining,
      unmeasured: unmeasured, track: 'shien', careLayer: 1,
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

// 当月に測定済みの要介護の「正規化名 → true」を作る（sbMeasureKaigo_ の doneByKey 用）。純関数。
// ★2026-08-01 追加。それまで コード.js が同じことをインラインでやっていたが、2つの穴があった。
//   ① 個訓シートを「行の年月が当月の行」だけに絞っていた。行の年月は【計画期間の開始月】であって
//      測定の実施月ではない。実測では 21件中20件が不一致（例: 行=2026-05 / 実施=2026-07）で、
//      測定済みなのに「未」として督促していた（2026-07 実測: 対象21名全員が誤督促）。
//      → 行では絞らず、sokutei_date の【実施日の月】が当月かどうかで判定する。
//   ② 測定記録シートを見ていなかった。2026-08-01 の片寄せ（版-03）で新規の測定はすべて
//      測定記録シートへ書かれるため、このままでは永久に「未」になる。
//      → 測定記録シートも足した【和】で見る。既存の個訓シート参照は外さない（過去分が消えない）。
// kunRows:   個訓シートの行 [{ name, year, month, sokutei_date }]（year/month は判定に使わない）
// shienRows: 測定記録シートの行 [{ name, sokutei_date }]
// ym:        'YYYY-MM'。空・不正なら誰も済にしない（黙って全員済にしない）。
// normFn:    名前の正規化（既定は sbNormalizeName_）
function sbBuildKaigoDone_(kunRows, shienRows, ym, normFn) {
  var out = {};
  var f = normFn || sbNormalizeName_;
  if (!/^\d{4}-\d{2}$/.test(String(ym || ''))) return out;
  function add(rows) {
    (rows || []).forEach(function (r) {
      if (!r) return;
      var d = String(r.sokutei_date || '').trim();
      if (d.slice(0, 7) !== ym) return;
      var k = f(r.name);
      if (!k) return;
      out[k] = true;
    });
  }
  add(kunRows);
  add(shienRows);
  return out;
}

// 要介護の測定対象行（enriched・未ソート）。当月が評価月(isHyoukaMonthFn)かつ当評価月未実施。並びは sbSokuteiSort_ が担当。
// doneByKey: 当評価月に sokutei_date が入っている人の名前→true（内部正規化・§3.4）。usageByKey: 名前→出席率U（内部正規化）。
// 返り値: [{ name, key, care, remaining, track:'kaigo', careLayer:0, weeklyVisits, remainingVisits, absenceRate }]
//   remaining=月末カレンダー残日数（表示用）／remainingVisits=残来所日数（優先順位用）。
// ★段階5（2026-08-01・社長決定）: 対象月を「予定月(domain='kobetsu')」ベースへ。
//   ボード日の属する月 M の翌月がその人の予定月なら、M がその節目の作業月＝測定の対象。
//   yoteiMap({ 正規化名 or userId: 'YYYY-MM' }) が無い／その人の行が無い／値が壊れているときは
//   従来の isHyoukaMonthFn(planStart) へフォールバックし、fallbackKeys に積んで可視化する
//   （黙って旧挙動に戻らない＝month-board の kunYoteiFallback と同じ方式）。
//   ★yoteiMap / fallbackKeys は末尾の追加引数＝既存の呼び出しは1バイトも変えずに動く。
function sbMeasureKaigo_(kaigoUsers, doneByKey, year, month, todayStr, isHyoukaMonthFn, usageByKey, yoteiMap, fallbackKeys) {
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
  // ボード月の翌月（年跨ぎ対応）。予定月との突き合わせに使う。
  var nY = (month === 12) ? year + 1 : year;
  var nM = (month === 12) ? 1 : month + 1;
  var nextYm = nY + '-' + (nM < 10 ? '0' : '') + nM;
  (kaigoUsers || []).forEach(function (u) {
    var key = sbNormalizeName_(u.name);
    // 予定月は userId でも正規化名でも引けるようにする（板の予定月シートは要介護の userId が氏名相当のため）
    var yv = '';
    if (yoteiMap) {
      if (u.userId != null && yoteiMap[u.userId] != null) yv = yoteiMap[u.userId];
      else if (yoteiMap[key] != null) yv = yoteiMap[key];
      else if (yoteiMap[u.name] != null) yv = yoteiMap[u.name];
    }
    var useYotei = /^\d{4}-\d{2}$/.test(String(yv || ''));
    if (useYotei) {
      if (String(yv) !== nextYm) return;
    } else {
      if (fallbackKeys) fallbackKeys.push(key);
      if (!isHyoukaMonthFn(u.planStart, u.planMonths, year, month)) return;
    }
    if (doneNorm[key]) return;
    var uRate = (usageNorm[key] != null) ? usageNorm[key] : 1.0;
    var absRate = 1 - uRate; if (absRate < 0) absRate = 0; if (absRate > 1) absRate = 1;
    rows.push({
      name: u.name, key: key, care: u.category || '', remaining: sokuteiRemaining_(monthEnd, todayStr),
      track: 'kaigo', careLayer: 0,
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
    if (done) return;
    rows.push({ name: u.name, key: key, role: res.role });
  });
  return rows;
}

// 口腔体操対象。isTarget/is_target が明示 false 以外は対象（未設定=既定true）。
// 実源getOralTargetUsers_はキャメルケースisTargetを返す。is_targetは生シート列名（互換のため両対応）。
// 返り値: [{ name, key }]
function sbKoukuTaisou_(oralSettings) {
  return (oralSettings || []).filter(function (u) { return u.isTarget !== false && u.is_target !== false; })
    .map(function (u) { return { name: u.name, key: sbNormalizeName_(u.name) }; });
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

// 決定B（測定アプリ①用）: sbIntersectPresent_ の手前＝当日出席で絞る前の「全母集団」。
// 要介護(kaigoUsers・planStart/planMonths付)＋要支援(shienUsers・days付)を1形に統合する純関数。
// ①はこれで「今日不在の未測定者(スライド超過)」も拾える。既存の交差済み sokutei とは別物・additive。
// 返り: [{ key, name, care, planStart, planMonths, days, track:'kaigo'|'shien' }]
//   要介護 key=userId(=name)・care=category・planStart/planMonths有。要支援 key=name・planStart''・planMonths0。
function sbBuildUniverse_(kaigoUsers, shienUsers) {
  var out = [];
  (kaigoUsers || []).forEach(function (u) {
    out.push({
      key: u.userId != null ? u.userId : u.name,
      name: u.name,
      care: u.category != null ? u.category : (u.care || ''),
      planStart: u.planStart || '',
      planMonths: (u.planMonths != null ? u.planMonths : 3),
      days: u.days || '',
      track: 'kaigo'
    });
  });
  (shienUsers || []).forEach(function (u) {
    out.push({
      key: u.name,
      name: u.name,
      care: u.care || '',
      planStart: '',
      planMonths: 0,
      days: u.days || '',
      track: 'shien'
    });
  });
  return out;
}

function sbBuildBoard_(input, judges) {
  var present = sbUniquePresent_(input.attendance);
  // session別のdistinct人数と異常（am/pm衝突）を集計（§2.5）。presentAm+presentPm=presentCount 恒等。
  var presentAm = 0, presentPm = 0, ampmConflict = [];
  present.forEach(function (p) {
    if (p.session === 'am') presentAm++; else if (p.session === 'pm') presentPm++;
    if (p.conflict) ampmConflict.push({ name: p.name, key: p.key });
  });
  // ★段階5: 予定月(domain='kobetsu')を渡す。取れない人は従来の planStart ベースへ落ち、
  //   yoteiFallback に積んで可視化する（黙って旧挙動へ戻らない）。
  var kunYoteiFallback = [];
  var kaigo = sbMeasureKaigo_(input.kaigoUsers, input.kaigoDoneByKey, input.year, input.month, input.today, judges.isHyoukaMonth, input.usageByKey, input.kobetsuYotei, kunYoteiFallback);
  var shien = sbMeasureShien_(input.shienUsers, input.shienLastByName, input.today, input.usageByKey);
  var sokutei = sbSokuteiSort_(sbIntersectPresent_(kaigo, present).concat(sbIntersectPresent_(shien, present)), SOKUTEI_WEIGHTS);
  var koukuMoni = sbIntersectPresent_(sbKoukuMoni_(input.oralUsers, input.oralRecByKey, input.year, input.month, judges.oralCycleAt), present);
  var koukuTaisou = sbIntersectPresent_(sbKoukuTaisou_(input.oralSettings), present);
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
    kotan: kotan, birthday: birthday, residue: residue, ampmConflict: ampmConflict,
    universe: sbBuildUniverse_(input.kaigoUsers, input.shienUsers),  // 決定B: 全母集団(交差前・今日不在含む)
    kunYoteiFallback: kunYoteiFallback  // ★段階5: 予定月が取れず planStart ベースへ落ちた人の正規化名（additive）
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
// サインをもらう人（電子サインの期限判定）2026-08-06・社長決定
// ------------------------------------------------------------
// 何のために要るか:
//   電子サインが使えるのは「その計画書の適用月に初めて来所した日まで」。2回目以降は紙。
//   このルールはスタッフの記憶頼りで運用されていて、外すと紙に戻せず取り直しになる。
//   画面が「今日サインもらえます／今日が最終チャンス／紙で」と言い切る形にする。
//
// 対象は電子サイン対応の2書類のみ:
//   kobetsu = 個別機能訓練計画書（適用月＝作業月の翌月＝予定月シート domain='kobetsu' の値）
//   tsusho  = 通所介護計画書（適用月＝満了月＝通所介護計画書設定の due_date の年月）
//
// 4状態:
//   'none'（⚪計画書未作成）… まだ作る段階。案内を出すと現場が混乱するso画面に出さない
//   'ok'  （🟢電子OK）      … 適用月の初回来所日がまだ来ていない
//   'last'（🟡最終チャンス）… 今日が適用月の初回来所日（＝非欠席予定日の先頭）
//   'paper'（🔴紙）         … 適用月に来所した日が1日以上ある／適用月を過ぎた
//
// ★期限は列に凍結しない（signKigen を埋めない・社長決定）。欠席が入ると初回来所日がずれ、
//   凍結値はその瞬間に嘘になるため、毎回この純関数で計算し直す。
// ============================================================

var SB_SIGN_DOC_LABEL = { kobetsu: '個別機能訓練計画書', tsusho: '通所介護計画書' };
// 並び順。⚪none は「計画書を作る」という行動が要るso、何もしなくてよい🟢ok より上に置く。
var SB_SIGN_ORDER = { last: 0, paper: 1, none: 2, ok: 3 };

// 'YYYY-MM-DD' → 'YYYY-MM'
function sbYmOf_(dateStr) { return String(dateStr == null ? '' : dateStr).slice(0, 7); }

// 'YYYY-MM-DD' に日数を足す（UTC固定＝TZ非依存）
function sbAddDays_(dateStr, delta) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return '';
  var y = parseInt(dateStr.slice(0, 4), 10), m = parseInt(dateStr.slice(5, 7), 10), d = parseInt(dateStr.slice(8, 10), 10);
  var t = new Date(Date.UTC(y, m - 1, d + delta));
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
}

// その日が「来所予定日」か。材料は getAttendance と同じ（利用曜日／欠席／利用開始日／中止日）。
// absentDates: { 'YYYY-MM-DD': true }（その人の欠席・長期休みを展開したもの）
function sbIsVisitDay_(days, dateStr, absentDates, startDate, cancelDate) {
  var s = String(days == null ? '' : days);
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return false;
  if (startDate && dateStr < startDate) return false;    // 利用開始前
  if (cancelDate && dateStr > cancelDate) return false;  // 中止日より後
  if (absentDates && absentDates[dateStr]) return false; // 欠席
  var y = parseInt(dateStr.slice(0, 4), 10), m = parseInt(dateStr.slice(5, 7), 10), d = parseInt(dateStr.slice(8, 10), 10);
  var w = ['日', '月', '火', '水', '木', '金', '土'];  // getUTCDay: 0=日
  return s.indexOf(w[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]) >= 0;
}

// 適用月の「非欠席予定日の先頭」＝電子サインの最終チャンス日。月内を1日ずつ走査する薄い1本。
// 予定日が無い／全部欠席なら ''（来所機会なし）。
function sbFirstVisitDate_(days, ym, absentDates, startDate, cancelDate) {
  if (!/^\d{4}-\d{2}$/.test(String(ym || ''))) return '';
  var y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10);
  var lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (var d = 1; d <= lastDay; d++) {
    var ds = ym + '-' + (d < 10 ? '0' : '') + d;
    if (sbIsVisitDay_(days, ds, absentDates, startDate, cancelDate)) return ds;
  }
  return '';
}

// today('YYYY-MM-DD')の翌月を 'YYYY-MM' で返す（年跨ぎ対応）。⚪を出す上限月に使う。
function sbSignNextYm_(today) {
  var y = parseInt(String(today).slice(0, 4), 10), m = parseInt(String(today).slice(5, 7), 10);
  var t = y * 12 + m;  // (m-1)+1 ＝翌月の0始まり通算
  return Math.floor(t / 12) + '-' + ('0' + (t % 12 + 1)).slice(-2);
}

// 4状態の判定本体。applyYm='YYYY-MM' / planCreated=計画書ができているか / firstVisitDate=適用月の初回来所日。
// alwaysPaper: 台帳「サイン方法」＝常に紙（認知症等でご家族にサインをもらう方）。
//   この方たちは電子という選択肢が最初から無いso、🟢🟡を出すと現場が迷う。常に🔴にする。
//   ★末尾の追加引数＝既存の4引数呼び出しは1バイトも変わらない。
function sbSignState_(applyYm, planCreated, firstVisitDate, today, alwaysPaper) {
  if (!planCreated) return 'none';
  if (!/^\d{4}-\d{2}$/.test(String(applyYm || ''))) return 'none';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today || ''))) return 'none';
  if (alwaysPaper) return 'paper';
  var tYm = sbYmOf_(today);
  if (tYm < applyYm) return 'ok';      // 適用月より前＝まだ電子で取れる
  if (tYm > applyYm) return 'paper';   // 適用月を過ぎた＝電子は使えない
  if (!firstVisitDate) return 'ok';    // 適用月に来所予定が無い＝機会未到来
  if (today < firstVisitDate) return 'ok';
  if (today === firstVisitDate) return 'last';
  return 'paper';
}

// キー候補（userId／正規化名／原文名）でマップを引く。板は要介護の userId が氏名相当so3通り試す。
function sbSignLookup_(map, userId, key, name) {
  if (!map) return '';
  if (userId != null && map[userId] != null) return map[userId];
  if (map[key] != null) return map[key];
  if (name != null && map[name] != null) return map[name];
  return '';
}

// シート行（userId/name/year/month＋日付列）から「key|YYYY-MM → 作成済み」を作る
function sbSignCreatedMap_(rows, dateField) {
  var out = {};
  (rows || []).forEach(function (r) {
    if (!r) return;
    if (!String(r[dateField] || '').trim()) return;   // 日付が入っていない＝未作成
    var y = parseInt(r.year, 10) || 0, m = parseInt(r.month, 10) || 0;
    if (!y || !m) return;
    var ym = y + '-' + (m < 10 ? '0' : '') + m;
    var uid = String(r.userId == null ? '' : r.userId).trim();
    var nm = String(r.name == null ? '' : r.name).trim();
    if (uid) out[uid + '|' + ym] = true;
    if (nm) out[sbNormalizeName_(nm) + '|' + ym] = true;
    if (uid) out[sbNormalizeName_(uid) + '|' + ym] = true;
  });
  return out;
}

// 全員×2書類のサイン状態を組み立てる。
// input = {
//   today: 'YYYY-MM-DD',
//   users: [{ name, userId, category, days, startDate, cancelDate }],
//   absentByKey: { 正規化名: { 'YYYY-MM-DD': true } },
//   kobetsuYotei: { userId|正規化名: 'YYYY-MM' },              // 個訓の適用月（＝計画期間の開始月）
//   kunRows: [{ userId, name, year, month, keikaku_date }],    // 個別機能訓練計画書記録（全行）
//   tsushoDueMap: { userId: 'YYYY-MM-DD' },                    // 通所の満了日
//   tsushoRows: [{ userId, year, month, plan_date }]           // 通所介護計画書記録（全行）
// }
// 返り = { rows:[{key,name,docType,docLabel,applyYm,state,firstVisitDate}], tomorrowPrint:[...], fallback:{...} }
//   rows は 'none' を含まない（⚪は画面に出さない）。並びは 🟡last → 🔴paper → 🟢ok。
//   fallback は「適用月が取れず判定できなかった人」＝黙って落とさないための可視化。
function sbBuildSignBoard_(input) {
  var out = { rows: [], tomorrowPrint: [], fallback: { kobetsuNoYotei: [], tsushoNoDue: [] } };
  var inp = input || {};
  var today = String(inp.today || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return out;
  var tomorrow = sbAddDays_(today, 1);
  var users = inp.users || [];
  var absentByKey = inp.absentByKey || {};
  var alwaysPaperByKey = inp.alwaysPaperByKey || {};   // 台帳「サイン方法」＝常に紙
  var kunCreated = sbSignCreatedMap_(inp.kunRows, 'keikaku_date');
  var tsushoCreated = sbSignCreatedMap_(inp.tsushoRows, 'plan_date');

  users.forEach(function (u) {
    if (!u || !u.name) return;
    var key = sbNormalizeName_(u.name);
    var days = String(u.days || '');
    var start = String(u.startDate || '');
    var cancel = String(u.cancelDate || '');
    var absent = absentByKey[key] || {};
    var alwaysPaper = !!(alwaysPaperByKey[key] || (u.userId != null && alwaysPaperByKey[u.userId]));

    function push(docType, applyYm, created) {
      var first = sbFirstVisitDate_(days, applyYm, absent, start, cancel);
      var state = sbSignState_(applyYm, created, first, today, alwaysPaper);
      // ★2026-08-06 社長決定: ⚪（計画書未作成）も出す。サインをもらう日は計画書の有無と関係なく
      //   決まっているso、「この日までに作らないと電子で取れない」という前倒しの督促になる。
      //   ただし⚪は「作る時期が来た人」だけ＝適用月が翌月までのものに限る。
      //   実測（2026-08-06）: 絞らないと⚪が157件並び、現場が読めず督促として死ぬ
      //   （通所は満了日が1年先まで登録済みso、全月が未作成として出てしまう）。
      //   過去の適用月は「やり残し」so出す。落とすのは未来（翌々月以降）だけ。
      if (state === 'none' && applyYm > sbSignNextYm_(today)) return;
      out.rows.push({
        key: key, name: u.name, docType: docType, docLabel: SB_SIGN_DOC_LABEL[docType] || docType,
        applyYm: applyYm, state: state, firstVisitDate: first, alwaysPaper: alwaysPaper,
        // ⚪に「◯月◯日に来ます」と出すのは初回来所日がまだ先のときだけ。過ぎていたら
        // 計画書ができても電子は使えない＝別の言い方をする必要がある（判定を表示層に置かない）。
        deadlinePassed: !!(first && today > first) || sbYmOf_(today) > applyYm
      });
      // 明日の印刷リマインド: 明日来所予定 かつ 明日時点で🔴（＝電子が使えない状態で来る）
      if (!sbIsVisitDay_(days, tomorrow, absent, start, cancel)) return;
      var firstTomorrow = sbFirstVisitDate_(days, sbYmOf_(tomorrow), absent, start, cancel);
      var stateTomorrow = sbSignState_(applyYm, created,
        (sbYmOf_(tomorrow) === applyYm) ? firstTomorrow : first, tomorrow);
      if (stateTomorrow === 'paper') {
        out.tomorrowPrint.push({
          key: key, name: u.name, docType: docType, docLabel: SB_SIGN_DOC_LABEL[docType] || docType,
          applyYm: applyYm, date: tomorrow
        });
      }
    }

    // --- 個別機能訓練計画書（要介護のみ・適用月＝予定月） ---
    if (String(u.category || '').indexOf('要介護') === 0) {
      var yv = String(sbSignLookup_(inp.kobetsuYotei, u.userId, key, u.name) || '');
      if (!/^\d{4}-\d{2}$/.test(yv)) {
        out.fallback.kobetsuNoYotei.push(key);   // 予定月が無い＝適用月不明so案内を出さない
      } else {
        push('kobetsu', yv, !!kunCreated[key + '|' + yv] || !!(u.userId && kunCreated[u.userId + '|' + yv]));
      }
    }

    // --- 通所介護計画書（全員・適用月＝満了月） ---
    var due = String(sbSignLookup_(inp.tsushoDueMap, u.userId, key, u.name) || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      out.fallback.tsushoNoDue.push(key);        // 満了日が無い＝適用月不明so案内を出さない
    } else {
      var tYm = due.slice(0, 7);
      push('tsusho', tYm, !!tsushoCreated[key + '|' + tYm] || !!(u.userId && tsushoCreated[u.userId + '|' + tYm]));
    }
  });

  out.rows.sort(function (a, b) {
    var oa = SB_SIGN_ORDER[a.state], ob = SB_SIGN_ORDER[b.state];
    if (oa !== ob) return oa - ob;
    if (a.applyYm !== b.applyYm) return String(a.applyYm).localeCompare(String(b.applyYm));
    return String(a.key || '').localeCompare(String(b.key || ''));
  });
  return out;
}

// ============================================================
// 署名済み計画書PDFの検知（2026-08-06 社長決定）
// ------------------------------------------------------------
// なぜ要るか:
//   「揃った」は自己申告so、押されなければ無かったことになる。実測（2026-08-06）で
//   提出送付台帳は7月・8月とも全93件が status='保留'・理由は92件が空だった。
//   署名済みPDFが所定フォルダに在ること自体を証拠にすれば、申告は要らなくなる。
//   実測で送付方法は ケアプー76件 / FAX15件 / メール2件＝持参・郵送ゼロ＝全件がPDF経路。
//
// 保存先: yawaragi-apps/計画書送付/YYYY-MM/  （実績送付・口腔送付とは分ける＝誤検知防止）
// 正式名: 2026-07_通所介護計画書_小倉京子.pdf
//   区切りは `_` ／ 半角コロン禁止（Windowsのファイル名に使えない）／ 月は YYYY-MM ／ フルネーム必須
//
// ★機械側はゆるく作る: 全角半角・スペース・敬称・スキャナの連番を吸収し、フルネームさえ
//   含まれていれば拾う。月はフォルダ位置から補える。書類名が読めないものは weak として残す。
//   ＝「きちんと付けるほど確実、多少崩れても落ちない」
//
// GAS側は「フォルダのファイル名一覧を取る」だけに徹する（scanOralSendFolder_ と同じ構造）。
// 突合はここに集約する＝teishutsu も session-board も同じ関数を読む。
// ============================================================

// 書類種別 → ファイル名に現れうる書類名（正式名＋現場で使われる略称）。
// 略称を足すのはこの表だけ＝判定を散らさない。
var SB_PDF_DOC_WORDS = {
  kokun_set:      ['個別機能訓練計画書', '個別機能訓練', '個訓', '機能訓練計画書'],
  tsusho_keikaku: ['通所介護計画書', '通所計画書', '通所介護'],
  tsusho_hyouka:  ['通所評価', '結果報告書', '評価表'],
  tsusho_moni:    ['通所モニタリング', '通所モニ', 'モニタリング'],
  oral_plan:      ['口腔機能向上計画書', '口腔計画書', '口腔'],
  // ★実物は「アウトカム」表記（2026-08-06 実測）。'測定結果' しか持っていなかったため weak 止まりだった。
  //   ★kokun_set 側には入れない。測定結果を計画書として確定させないため（別の書類）。
  sokutei:        ['アウトカム詳細', 'アウトカム', '測定結果', '測定']
};

// 書類種別 → 実物の保管フォルダ（共有ドライブ「yawaragi」→「実績」配下・2026-08-06 実測）。
// ★場所の定義もここ1箇所。GAS も teishutsu もこの表を読む。
// ★名前ではなくIDで持つ理由: DriveApp.getFoldersByName() の名前検索は共有ドライブを横断しない。
//   ID直指定なら読めることを本番で実証済み（2026-08-06・7フォルダすべて取得成功）。
var SB_PDF_FOLDERS = {
  kokun_set:      { id: '1cwGxoMHEWHYvaOT8u4YQOnwcx9aa-lka', label: '個別計画書・測定結果（アウトカム）' },
  sokutei:        { id: '1S81l3LEUwuyyLo3-DQd0PkCzbsFVRYzS', label: '支援・事業対象の測定結果(アウトカム)' },
  oral_plan:      { id: '14PnVkqMa4pR5_WS9p8tg0DbYvf5xQpl2', label: '口腔計画書・結果報告書' },
  tsusho_keikaku: { id: '1qVOCttl3LIzcIPSnsqDBdwnE6oscAdnv', label: '通所計画書' },
  tsusho_moni:    { id: '1XToFAUOuhcSwNrbtHPs5bXe2FyqP-6gn', label: '通所モニタリング' },
  tsusho_hyouka:  { id: '1E2Phv7F8kCaCoo-ALQPV0ATrx2cXxe7s', label: '通所・結果報告書' }
};

// ファイル名の先頭にある「◯月」を読む（NFKC後so全角「７月」も拾える）。読めなければ 0。
// ★実物のフォルダはフラットで、7月分と8月分が同居している（2026-08-06 実測）。
//   月で絞らないと「先月のPDF」で今月を揃った扱いにしてしまう。
function sbPdfMonthOf_(fileName) {
  var s = String(fileName == null ? '' : fileName);
  if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  var m = s.match(/(\d{1,2})\s*月/);
  if (!m) return 0;
  var n = parseInt(m[1], 10);
  return (n >= 1 && n <= 12) ? n : 0;
}

// 台帳「旧姓・別表記」セル1つ → 別名の配列。区切りは 読点/カンマ/スラッシュ/中黒/空白。
function sbParseAliases_(cell) {
  var s = String(cell == null ? '' : cell);
  if (!s.trim()) return [];
  return s.split(/[、,\/／・\s　]+/).map(function (x) { return String(x).trim(); })
    .filter(function (x) { return !!x; });
}

// ファイル名一覧から、その人の署名済みPDFを探す。
// files: ['2026-07_通所介護計画書_小倉京子.pdf', ...]（1ヶ月フォルダの中身）
// name : 台帳の氏名 ／ aliases: 旧姓・別表記の配列 ／ docType: SB_PDF_DOC_WORDS のキー
// 返り: { found, fileName, match:'strong'|'weak'|'', matchedBy:'name'|'alias'|'' }
//   strong … 氏名＋その書類名の両方が読めた（どの書類か確定）
//   weak   … 氏名は読めたが書類名が読めない／別書類の名前だった（PDFは在るが確定できない）
// ym: 'YYYY-MM'（任意）。渡すとファイル名の先頭の月で絞る。渡さなければ従来どおり月を見ない。
//   月が一致 … 通常どおり strong/weak を判定
//   月が違う … 対象外（見つけない）＝先月のPDFで今月を揃った扱いにしない
//   月が読めない … weak 止まり（どの月か確定できないものを勝手に今月扱いしない）
function sbFindSignedPdf_(files, name, aliases, docType, ym) {
  var miss = { found: false, fileName: '', match: '', matchedBy: '' };
  var list = files || [];
  var baseKey = sbNormalizeName_(name);
  if (!baseKey) return miss;   // 氏名が空＝全員に当たってしまうso何も当てない
  var keys = [{ k: baseKey, by: 'name' }];
  (aliases || []).forEach(function (a) {
    var ak = sbNormalizeName_(a);
    if (ak) keys.push({ k: ak, by: 'alias' });
  });
  var words = SB_PDF_DOC_WORDS[docType] || [];
  var wantMonth = /^\d{4}-\d{2}$/.test(String(ym || '')) ? parseInt(String(ym).slice(5, 7), 10) : 0;
  var weak = null;
  for (var i = 0; i < list.length; i++) {
    var raw = String(list[i] == null ? '' : list[i]);
    var fn = sbNormalizeName_(raw.replace(/\.[A-Za-z0-9]+$/, ''));  // 拡張子を落としてから正規化
    if (!fn) continue;
    var fileMonth = wantMonth ? sbPdfMonthOf_(raw) : 0;
    if (wantMonth && fileMonth && fileMonth !== wantMonth) continue;  // 別の月のPDF＝対象外
    for (var j = 0; j < keys.length; j++) {
      if (fn.indexOf(keys[j].k) < 0) continue;
      var hasDoc = false;
      for (var w = 0; w < words.length; w++) {
        if (fn.indexOf(sbNormalizeName_(words[w])) >= 0) { hasDoc = true; break; }
      }
      // 月を見る指定なのに月が読めないファイルは、書類名が合っていても確定させない
      var monthOk = !wantMonth || fileMonth === wantMonth;
      if (hasDoc && monthOk) return { found: true, fileName: raw, match: 'strong', matchedBy: keys[j].by };
      if (!weak) weak = { found: true, fileName: raw, match: 'weak', matchedBy: keys[j].by };
      break;
    }
  }
  return weak || miss;
}

// 1ヶ月ぶんのファイル名一覧 × 対象者リスト → { 'key|docType': {found,fileName,match,matchedBy} }
// targets: [{ key, name, aliases, docType }]。当たったものだけ入れる（無い人はキーごと入らない）。
function sbBuildPdfFoundMap_(files, targets, ym) {
  var out = {};
  (targets || []).forEach(function (t) {
    if (!t) return;
    var hit = sbFindSignedPdf_(files, t.name, t.aliases, t.docType, ym);
    if (hit.found) out[t.key + '|' + t.docType] = hit;
  });
  return out;
}

// ============================================================
// 「今やること」を動詞1つに決める（teishutsu 2タブ化・2026-08-06 社長決定）
// ------------------------------------------------------------
// なぜ要るか:
//   現行の提出画面は、対象月・繰越・保留・理由・送付方法が同時に並んでいて、
//   社長本人が見て「私もよく分からない」状態だった＝読めない画面は使われない。
//   1案件につき動詞を1つに決め、それ以外は畳む。内部用語は画面に出さない。
//
//   make    計画書を作る               … 計画書がまだ（個訓 keikaku_date／通所 plan_date が空）
//   sign    サインをもらう             … 計画書はできている
//   pdf     PDFにしてフォルダに入れる   … サイン済みの申告はあるがPDFが無い
//   send    送る                      … PDFが在る／揃った案件 → 送るタブ
//   done    完了                      … 送付済（どちらのタブにも出さない）
//   unknown 情報が足りません            … 計画書の作成状況が分からない（★黙って消さない）
//
// ★判定材料が無い書類（通所モニ・通所評価・口腔・測定）は planCreated が不明so unknown になる。
//   件数は実データで測って報告する。0件に見せかけない。
// ============================================================

var SB_VERB_LABEL = {
  make: '計画書を作る',
  sign: 'サインをもらう',
  pdf: 'PDFにしてフォルダに入れる',
  send: '送る',
  done: '',
  unknown: '情報が足りません'
};
// 並び順＝工程の手前ほど上（作る → サインをもらう → PDFにする）。情報不足は最後。
var SB_VERB_ORDER = { make: 0, sign: 1, pdf: 2, unknown: 3, send: 4, done: 5 };

// status: 台帳の状態（''／'保留'／'揃った'／'送付済'）
// planCreated: 計画書ができているか（true/false／材料が無ければ undefined）
// pdfMatch: 署名済みPDFの検知結果（'strong'／'weak'／''）
function sbCollectVerb_(status, planCreated, pdfMatch) {
  var st = String(status == null ? '' : status);
  var verb;
  if (st === '送付済') verb = 'done';
  // PDFが在る＝サインもPDF化も済んでいる。「揃った」未押下でも送る段階として扱う。
  // ★weak（氏名は当たったが書類名が読めない）は確定させない＝送るへ飛ばさない。
  else if (pdfMatch === 'strong') verb = 'send';
  else if (st === '揃った') verb = 'pdf';
  else if (planCreated === false) verb = 'make';
  else if (planCreated === true) verb = 'sign';
  else verb = 'unknown';
  return { verb: verb, label: SB_VERB_LABEL[verb] };
}

// 集めるタブに出すか（送るタブ＝send／どちらにも出さない＝done）
function sbIsCollectVerb_(verb) {
  return verb === 'make' || verb === 'sign' || verb === 'pdf' || verb === 'unknown';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sbNormalizeName_: sbNormalizeName_,
    sbCollectVerb_: sbCollectVerb_,
    sbIsCollectVerb_: sbIsCollectVerb_,
    sbSignCreatedMap_: sbSignCreatedMap_,
    SB_VERB_LABEL: SB_VERB_LABEL,
    SB_VERB_ORDER: SB_VERB_ORDER,
    sbParseAliases_: sbParseAliases_,
    sbFindSignedPdf_: sbFindSignedPdf_,
    sbBuildPdfFoundMap_: sbBuildPdfFoundMap_,
    sbPdfMonthOf_: sbPdfMonthOf_,
    SB_PDF_FOLDERS: SB_PDF_FOLDERS,
    SB_PDF_DOC_WORDS: SB_PDF_DOC_WORDS,
    sbYmOf_: sbYmOf_,
    sbAddDays_: sbAddDays_,
    sbIsVisitDay_: sbIsVisitDay_,
    sbFirstVisitDate_: sbFirstVisitDate_,
    sbSignState_: sbSignState_,
    sbBuildSignBoard_: sbBuildSignBoard_,
    sbUniquePresent_: sbUniquePresent_,
    sokuteiCycleMonths_: sokuteiCycleMonths_,
    sokuteiDueDate_: sokuteiDueDate_,
    sokuteiRemaining_: sokuteiRemaining_,
    sbMeasureShien_: sbMeasureShien_,
    sbMonthEnd_: sbMonthEnd_,
    sbMeasureKaigo_: sbMeasureKaigo_,
    sbBuildKaigoDone_: sbBuildKaigoDone_,
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
    mergeSokuteiRecords: mergeSokuteiRecords,
    sbBuildUniverse_: sbBuildUniverse_
  };
}
