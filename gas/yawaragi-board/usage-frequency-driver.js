// 利用頻度v1.1 算出ドライバ（骨組み・Node・SpreadsheetApp非依存・本番 getUsageAlerts/judgeUsageBadgeV2 不触・書込ゼロ）
// 役割(設計§2-3): 純関数層 usage-frequency.js を合成し、全員×3窓(1/2/3ヶ月)の
//   実質週回数 / 率 / n / 除外件数 / 判定 / 方向 / 曜日別 を表構造に組み、表示層で行文字列にする。
// スコープ: 合成 dump のみを入力に取る。実データ・dailyOps・契約曜日ソースには触れない（§13 G1/G2/G3ゲート）。
// テスト: scripts/test-usage-frequency-driver.js ／ 契約: scratchpad/usage-frequency-contract.md ／ 設計書 2026-07-09-riyou-hindo-keisan-v1.1-design.md

var uf = require('./usage-frequency.js');

// 3窓は「直近1 / 2 / 3ヶ月」トレイリング固定（設計§9・表の3列に対応）。
var WINDOWS = [1, 2, 3];

// deriveHedgeFlags(inputs, cells) → { 低契約, 率天井継続 }
// TODO(clasp/G-real): 低契約閾値・率天井継続の定義を実データで確定。暫定false＝保険は骨組みでは発火しない。
//   judge の保険パス（適正圏かつ 低契約×率天井継続 → 増やし）は純関数層に実装済みなので、
//   定義確定後は本フックが true を返すよう実装するだけで配線が生きる（buildUsageReport は既に judge へ渡している）。
function deriveHedgeFlags(inputs, cells) {
  // eslint-disable-next-line no-unused-vars
  var _inputs = inputs, _cells = cells; // 将来の実装で参照する引数（骨組みでは未使用）
  return { '低契約': false, '率天井継続': false };
}

// buildUsageReport(dump, asOf) → { asOf, thresholds, rows:[...] }
// dump = { users:[ inputs, ... ], reasonTable? }。inputs は契約§フィクスチャ形。
// reasonTable 省略時は純関数層の REASON_TABLE を使う（calcWindow は内部で REASON_TABLE 参照）。
function buildUsageReport(dump, asOf) {
  dump = dump || {};
  var users = dump.users || [];
  var reasonTable = dump.reasonTable || uf.REASON_TABLE; // ※骨組み: 語彙確定は clasp窓（保持のみ）
  // TODO(clasp/G-real): 理由語彙一覧で reasonTable を実データ確定（除外/カウントの実在文字列）。

  var rows = users.map(function (inputs) {
    inputs = inputs || {};
    var contractPerWeek = inputs.contractPerWeek || 0;

    // 3窓それぞれを calcWindow で集計し、セルを組む。
    var cells = WINDOWS.map(function (windowMonths) {
      var w = uf.calcWindow(inputs, windowMonths, asOf); // { n, attended, rate, excludedCount, unclassifiedCount, byWeekday }
      var rate = w.rate;
      var actualPerWeek = uf.calcActualPerWeek(contractPerWeek, rate); // rate=null → null
      var ratePct = (rate == null) ? null : rate * 100;                // 生値（丸めない・表示層Dだけ丸める・§8-4）
      // 保険ブールは骨組みでは false 固定（deriveHedgeFlags）。judge の保険パスへ配線だけ通す。
      var hedge = deriveHedgeFlags(inputs, null);
      var verdict = uf.judge(rate, w.n, {
        '未分類件数': w.unclassifiedCount,
        '追加利用': 0,
        '低契約': hedge['低契約'],
        '率天井継続': hedge['率天井継続']
      });
      return {
        window: windowMonths,
        actualPerWeek: actualPerWeek,
        ratePct: ratePct,
        n: w.n,
        attended: w.attended,
        excludedCount: w.excludedCount,
        unclassifiedCount: w.unclassifiedCount,
        verdict: verdict
      };
    });

    // direction(回復傾向): 1ヶ月の実質週回数(recent) と 3ヶ月の実質週回数(baseline) を比較。
    var c1 = cells[0], c3 = cells[2];
    var dir = uf.direction(c1.actualPerWeek, c3.actualPerWeek);

    // worstDays: 母数が最も広い「3ヶ月窓」の byWeekday と rate で1回だけ算出（窓は3ヶ月に固定）。
    var w3 = uf.calcWindow(inputs, 3, asOf);
    var worstDays = uf.worstDayInvestigate(w3.byWeekday, w3.rate);

    return {
      name: inputs.name,
      contractWeekdays: inputs.contractWeekdays || [],
      contractPerWeek: contractPerWeek,
      cells: cells,
      direction: dir,
      worstDays: worstDays
    };
  });

  return { asOf: asOf, thresholds: uf.THRESHOLDS, rows: rows };
}

// ---- 表示層（設計§9・実質週回数が主役・丸めはここだけ）----

// 1セルの文字列。実質週回数=小数第1位／全体利用率%=整数丸め／除外・未分類・判定を副表示。
function _renderCell(cell) {
  if (cell.actualPerWeek == null) return '-'; // 対象外（率null）
  var apw = cell.actualPerWeek.toFixed(1);           // ★丸めは表示のここだけ（小数第1位）
  var pct = Math.round(cell.ratePct);                // ★率は整数丸め（表示だけ）
  var extra = '';
  if (cell.excludedCount > 0) extra += ' 除外' + cell.excludedCount;       // 例: 入院等の除外件数
  if (cell.unclassifiedCount > 0) extra += ' 未分類' + cell.unclassifiedCount; // §6安全弁
  return apw + '回/週 ' + pct + '% n=' + cell.n + extra + ' [' + cell.verdict + ']';
}

// renderUsageTable(report) → 行文字列配列（1 user 1行・3列＝直近1/2/3ヶ月）。
// 色分けはターミナルなので verdict ラベル文字＋direction(↑/↓/空)で表現（色コードは付けない）。
function renderUsageTable(report) {
  report = report || {};
  var rows = report.rows || [];
  return rows.map(function (row) {
    var cellStrs = row.cells.map(_renderCell);
    var worst = (row.worstDays && row.worstDays.length) ? ' ⚠' + row.worstDays.join('/') : '';
    return row.name + ' ┃ ' + cellStrs.join(' ┃ ') + ' ┃ ' + (row.direction || '') + worst;
  });
}

// loadRealDump(fromYM, toYM, asOf) → 実データ dump。骨組みでは未接続（§13ゲート）。
// TODO(clasp/G-real): dumpUsageInputs のJSONをここに接続する。
// TODO(clasp/G-real): 既知3ケース(週1相当/入院/回復中)の名指し突合。
// TODO(clasp/G-real): 旧V2 judgeUsageBadgeV2 との差分表。
function loadRealDump(fromYM, toYM, asOf) {
  // eslint-disable-next-line no-unused-vars
  var _a = fromYM, _b = toYM, _c = asOf;
  throw new Error('clasp窓で実装: G1契約曜日ソース特定 / G2 dailyOps実来館 / G3 getMonthlyUsageバッチ。dumpUsageInputs のJSONをここに接続する');
}

module.exports = {
  WINDOWS: WINDOWS,
  buildUsageReport: buildUsageReport,
  renderUsageTable: renderUsageTable,
  deriveHedgeFlags: deriveHedgeFlags,
  loadRealDump: loadRealDump
};
