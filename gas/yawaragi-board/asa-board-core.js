// 2026-07-11 朝ボード（当日業務ピックアップ）の判定純関数。
// GAS/node 両用（kesseki-box-core.js と同じ流儀）。SpreadsheetApp 等の GAS API に依存しない。
// 名寄せは全業務ここを通す。判定spec: docs/superpowers/specs/2026-07-11-asa-board-design.md

// 名寄せ正規化＝全突合キーの唯一の正（_normalizeUserName 相当・NFKC＋全空白除去＋末尾敬称除去）
function abNormalizeName_(name) {
  var s = String(name == null ? '' : name);
  if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  s = s.replace(/[\s　]+/g, '');
  s = s.replace(/(様|さま|サマ)$/, '');
  return s;
}

// am/pm を正規化キーで一意化し「出席」の人だけ返す。どちらかで出席なら出席扱い。
// 返り値: [{ name, key, care, status }]（name は最初に現れた表記を保持）
function abUniquePresent_(att) {
  var out = [], seen = {};
  var root = att && att.attendance;
  if (!root) return out;
  ['am', 'pm'].forEach(function (k) {
    (root[k] || []).forEach(function (a) {
      var key = abNormalizeName_(a && a.name);
      if (!key) return;
      if (seen[key]) {
        if (a.status === '出席') seen[key].status = '出席';
        if (!seen[key].care && a.care) seen[key].care = a.care;
        return;
      }
      var c = { name: a.name, key: key, care: a.care || '', status: a.status || '' };
      seen[key] = c; out.push(c);
    });
  });
  return out.filter(function (c) { return c.status === '出席'; });
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

// 要支援・事業対象の測定対象行。前回実測定日+4ヶ月。未測定(実測定日なし)は最優先。残日数昇順。
// 返り値: [{ name, key, care, last, due, remaining, unmeasured }]
function abMeasureShien_(shienUsers, lastByName, todayStr) {
  var lastByKey = {};
  if (lastByName) {
    for (var nm in lastByName) {
      if (!lastByName.hasOwnProperty(nm)) continue;
      var v = lastByName[nm];
      if (!v) continue;
      var nk = abNormalizeName_(nm);
      if (!lastByKey[nk] || v > lastByKey[nk]) lastByKey[nk] = v;
    }
  }
  var rows = (shienUsers || []).map(function (u) {
    var key = abNormalizeName_(u.name);
    var last = lastByKey[key] || '';
    var due = '', remaining = -999, unmeasured = !last;
    if (last) { due = sokuteiDueDate_(last, u.care || ''); remaining = sokuteiRemaining_(due, todayStr); }
    return { name: u.name, key: key, care: u.care || '', last: last, due: due, remaining: remaining, unmeasured: unmeasured };
  });
  rows.sort(function (a, b) { return a.remaining - b.remaining; });
  return rows;
}

// 対象日が属する月の月末(YYYY-MM-DD)を返す
function abMonthEnd_(year, month) {
  var lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return year + '-' + pad(month) + '-' + pad(lastDay);
}

// 要介護の測定対象行。当月が評価月(isHyoukaMonthFn)かつ当評価月未実施(doneByKey に無い)。月末残日数昇順。
// doneByKey: 当評価月に sokutei_date が入っている人の名前→true（キーは内部で正規化して照合・§3.4）。
// isHyoukaMonthFn は shared.js の isHyoukaMonth を注入。返り値: [{ name, key, care, remaining }]
function abMeasureKaigo_(kaigoUsers, doneByKey, year, month, todayStr, isHyoukaMonthFn) {
  var doneNorm = {};
  if (doneByKey) {
    for (var dk in doneByKey) {
      if (doneByKey.hasOwnProperty(dk) && doneByKey[dk]) doneNorm[abNormalizeName_(dk)] = true;
    }
  }
  var monthEnd = abMonthEnd_(year, month);
  var rows = [];
  (kaigoUsers || []).forEach(function (u) {
    if (!isHyoukaMonthFn(u.planStart, u.planMonths, year, month)) return;
    var key = abNormalizeName_(u.name);
    if (doneNorm[key]) return;
    rows.push({ name: u.name, key: key, care: u.category || '', remaining: sokuteiRemaining_(monthEnd, todayStr) });
  });
  rows.sort(function (a, b) { return a.remaining - b.remaining; });
  return rows;
}

// 口腔モニ対象行。role が none 以外かつ当月role未実施。role仕分けはせず対象者を全員返す。
// oralRecByKey: 名前 → { moni1_date, moni2_date, houkoku_date, plan_date }（キーは内部で正規化して照合・§3.4）。
// oralCycleAtFn は oral-plan.html の oralCycleAt を注入。
// 実施済み判定: moni1→moni1_date / moni2→moni2_date / setsume→(houkoku_date && plan_date)。
// 返り値: [{ name, key, role }]
function abKoukuMoni_(oralUsers, oralRecByKey, year, month, oralCycleAtFn) {
  var recByKey = {};
  if (oralRecByKey) {
    for (var rk in oralRecByKey) {
      if (oralRecByKey.hasOwnProperty(rk)) recByKey[abNormalizeName_(rk)] = oralRecByKey[rk];
    }
  }
  var rows = [];
  (oralUsers || []).forEach(function (u) {
    var res = oralCycleAtFn(u.planStart, u.planEnd, year, month);
    if (!res || res.role === 'none') return;
    var key = abNormalizeName_(u.name);
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

// 口腔体操対象。is_target が明示 false 以外は対象（未設定=既定true）。返り値: [{ name, key }]
function abKoukuTaisou_(oralSettings) {
  return (oralSettings || []).filter(function (u) { return u.is_target !== false; })
    .map(function (u) { return { name: u.name, key: abNormalizeName_(u.name) }; });
}

// 個訓対象。介護度「要介護」前方一致かつ非中止。返り値: [{ name, key, care }]
function abKotan_(users) {
  return (users || []).filter(function (u) {
    return !u.cancelled && String(u.category || '').indexOf('要介護') === 0;
  }).map(function (u) { return { name: u.name, key: abNormalizeName_(u.name), care: u.category || '' }; });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    abNormalizeName_: abNormalizeName_,
    abUniquePresent_: abUniquePresent_,
    sokuteiCycleMonths_: sokuteiCycleMonths_,
    sokuteiDueDate_: sokuteiDueDate_,
    sokuteiRemaining_: sokuteiRemaining_,
    abMeasureShien_: abMeasureShien_,
    abMonthEnd_: abMonthEnd_,
    abMeasureKaigo_: abMeasureKaigo_,
    abKoukuMoni_: abKoukuMoni_,
    abKoukuTaisou_: abKoukuTaisou_,
    abKotan_: abKotan_
  };
}
