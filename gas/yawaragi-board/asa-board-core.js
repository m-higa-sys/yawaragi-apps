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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    abNormalizeName_: abNormalizeName_,
    abUniquePresent_: abUniquePresent_,
    sokuteiCycleMonths_: sokuteiCycleMonths_,
    sokuteiDueDate_: sokuteiDueDate_,
    sokuteiRemaining_: sokuteiRemaining_,
    abMeasureShien_: abMeasureShien_
  };
}
