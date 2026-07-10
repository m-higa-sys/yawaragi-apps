// 利用頻度v1.1 算出ドライバ骨組みのテスト（全員×3窓・表構造・実データ/保険はplaceholder）
// 対象: gas/yawaragi-board/usage-frequency-driver.js（純関数層 usage-frequency.js を合成）
// 実行: node scripts/test-usage-frequency-driver.js
// 契約: scratchpad/usage-frequency-contract.md ／ 設計書 2026-07-09-riyou-hindo-keisan-v1.1-design.md §2-3/§9/§10/§13/§14
// 合成フィクスチャのみ。実データ・dailyOps・契約曜日ソース不触。asOf は全テスト '2026-06-30' 固定。
// 2026年カレンダー: 6/1=月。contract[1,3,5]=月水金。窓 asOf=2026-06-30 の予定数: 1mo=13/2mo=26/3mo=40。
const path = require('path');

let pass = 0, fail = 0;
function ok(c, l) { if (c) pass++; else { fail++; console.error('  [FAIL] ' + l); } }
function approx(a, b) { return typeof a === 'number' && Math.abs(a - b) < 1e-9; }

// ドライバ未実装なら赤（module 未存在でも各テストを [FAIL] として数える＝握り潰しでなく期待どおりの red）。
let drv = null;
try { drv = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'usage-frequency-driver.js')); }
catch (e) { console.error('  [driver load failed] ' + e.message); }

const asOf = '2026-06-30';

// ---- フィクスチャ（compute-expect で純関数から実値検証済）----
const F = {
  適正: {
    name: '適正花子', contractWeekdays: [1], contractPerWeek: 1,
    attendance: ['2026-03-30', '2026-04-06', '2026-04-13', '2026-04-20', '2026-04-27', '2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25', '2026-06-01', '2026-06-08', '2026-06-15'],
    absences: [], holidays: []
  },
  増やし: {
    name: '増子', contractWeekdays: [1, 3, 5], contractPerWeek: 3,
    attendance: ['2026-06-01', '2026-06-03', '2026-06-05', '2026-06-08', '2026-06-10', '2026-06-12', '2026-06-15', '2026-06-17', '2026-06-19', '2026-06-22', '2026-06-24', '2026-06-26', '2026-06-29', '2026-06-02', '2026-06-04', '2026-06-09'],
    absences: [], holidays: []
  },
  保留: {
    name: '保留次郎', contractWeekdays: [1, 3, 5], contractPerWeek: 3,
    attendance: ['2026-06-03', '2026-06-05', '2026-06-08', '2026-06-10', '2026-06-12', '2026-06-15'],
    absences: [{ date: '2026-06-01', type: '欠席', reason: '謎の理由' }], holidays: []
  },
  半分: {
    name: '半分子', contractWeekdays: [1], contractPerWeek: 1,
    attendance: ['2026-03-30', '2026-04-06', '2026-04-13', '2026-04-20', '2026-04-27', '2026-05-04', '2026-05-11'],
    absences: [], holidays: []
  },
  対象外: { name: '空契約', contractWeekdays: [], contractPerWeek: 0, attendance: [], absences: [], holidays: [] },
  回復: {
    name: '回復太郎', contractWeekdays: [1], contractPerWeek: 1,
    attendance: ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29'],
    absences: [], holidays: []
  },
  下降: {
    name: '下降子', contractWeekdays: [1], contractPerWeek: 1,
    attendance: ['2026-03-30', '2026-04-06', '2026-04-13', '2026-04-20', '2026-04-27'],
    absences: [], holidays: []
  },
  水弱: {
    name: '水弱郎', contractWeekdays: [1, 3], contractPerWeek: 2,
    attendance: ['2026-03-30', '2026-04-06', '2026-04-13', '2026-04-20', '2026-04-27', '2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25', '2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29', '2026-04-01'],
    absences: [], holidays: []
  },
  均等: {
    name: '均等美', contractWeekdays: [1, 3], contractPerWeek: 2,
    attendance: ['2026-03-30', '2026-04-06', '2026-04-13', '2026-04-20', '2026-04-27', '2026-05-04', '2026-05-11', '2026-04-01', '2026-04-08', '2026-04-15', '2026-04-22', '2026-04-29', '2026-05-06', '2026-05-13'],
    absences: [], holidays: []
  }
};
function report(users) { return drv ? drv.buildUsageReport({ users: users }, asOf) : null; }
function rowOf(users, name) { const r = report(users); return r ? r.rows.filter(x => x.name === name)[0] : null; }

// ===================================================================
// T1: 構造（全員×3窓・asOf/thresholds が入る）
// ===================================================================
{
  const r = report([F.適正, F.増やし, F.対象外]);
  ok(!!r, 'T1-0: buildUsageReport が値を返す');
  ok(r && r.asOf === asOf, 'T1a: report.asOf === 2026-06-30');
  ok(r && r.thresholds && r.thresholds['減らし'] === 70 && r.thresholds['増やし'] === 110, 'T1b: report.thresholds に純関数 THRESHOLDS');
  ok(r && Array.isArray(r.rows) && r.rows.length === 3, 'T1c: rows は全 users 分（3件）');
  ok(r && r.rows.every(x => Array.isArray(x.cells) && x.cells.length === 3), 'T1d: 各 row に cells 3件（1/2/3ヶ月）');
  ok(r && r.rows.every(x => typeof x.name === 'string' && x.name.length > 0), 'T1e: 各 row に name');
  ok(r && r.rows.every(x => x.cells.every(c => c.window === 1 || c.window === 2 || c.window === 3)), 'T1f: 各セルに window(1/2/3)');
  ok(r && r.rows.every(x => 'direction' in x && 'worstDays' in x), 'T1g: 各 row に direction / worstDays');
}

// ===================================================================
// T2: 率>110%（追加利用で率超過）→ 該当窓 verdict='増やし'
// ===================================================================
{
  const row = rowOf([F.増やし], '増子');
  const c1 = row && row.cells[0]; // 1ヶ月窓
  ok(c1 && c1.verdict === '増やし', 'T2a: 増子 1ヶ月窓 verdict=増やし（率>110）');
  ok(c1 && c1.n === 13, 'T2b: 増子 1ヶ月窓 n=13');
  ok(c1 && c1.ratePct > 110, 'T2c: ratePct>110（追加利用で率超過・約123%）');
  ok(c1 && approx(c1.actualPerWeek, 3 * (16 / 13)), 'T2d: 実質週回数=契約3×率（約3.69）');
}

// ===================================================================
// T3: 未分類欠席 → 該当窓 verdict='保留'（率に関わらず）・unclassifiedCount がセルに出る
// ===================================================================
{
  const row = rowOf([F.保留], '保留次郎');
  const c1 = row && row.cells[0]; // 1ヶ月窓（rate=0.5 でも保留が優先）
  ok(c1 && c1.verdict === '保留', 'T3a: 保留次郎 1ヶ月窓 verdict=保留（未分類>0・率判定より前）');
  ok(c1 && c1.unclassifiedCount === 1, 'T3b: セルに unclassifiedCount=1');
  ok(c1 && approx(c1.ratePct, 50), 'T3c: 率は50%だが保留（率で減らし等に自動で落とさない）');
  ok(row && row.cells.every(c => c.verdict === '保留'), 'T3d: 3窓とも未分類を含むため全窓 保留');
}

// ===================================================================
// T4: 実質週回数=契約×率（÷4.3等でない）／ rate=null の対象外セルは actualPerWeek=null
// ===================================================================
{
  const row = rowOf([F.半分], '半分子');
  const c3 = row && row.cells[2]; // 3ヶ月窓 n=14 attended=7 rate=0.5
  ok(c3 && c3.n === 14, 'T4a: 半分子 3ヶ月窓 n=14');
  ok(c3 && approx(c3.ratePct, 50), 'T4b: ratePct=50（7/14）');
  ok(c3 && approx(c3.actualPerWeek, 0.5), 'T4c: 実質週回数=契約1×率0.5=0.5（÷4.3なら≒0.116で不一致）');
  ok(c3 && approx(c3.actualPerWeek, row.contractPerWeek * (c3.ratePct / 100)), 'T4d: 実質週回数=契約週回数×率 が成立');

  const rowX = rowOf([F.対象外], '空契約');
  const cx = rowX && rowX.cells[0];
  ok(cx && cx.ratePct === null, 'T4e: 対象外(契約曜日[]) セルの ratePct=null');
  ok(cx && cx.actualPerWeek === null, 'T4f: 対象外セルの actualPerWeek=null（率nullなら実質週回数出さない）');
  ok(cx && cx.verdict === '対象外', 'T4g: 対象外セル verdict=対象外');
}

// ===================================================================
// T5: direction（1ヶ月 vs 3ヶ月の実質週回数）
// ===================================================================
{
  const up = rowOf([F.回復], '回復太郎');   // 1mo aPW=1.0 > 3mo aPW≈0.357
  ok(up && up.direction === '↑', 'T5a: 回復太郎 direction=↑（1ヶ月>3ヶ月）');
  const down = rowOf([F.下降], '下降子');   // 1mo aPW=0 < 3mo aPW≈0.357
  ok(down && down.direction === '↓', 'T5b: 下降子 direction=↓（1ヶ月<3ヶ月）');
}

// ===================================================================
// T6: worstDays（3ヶ月窓・−20pt以上かつn≥4→要調査／弱くない人は[]）
// ===================================================================
{
  const weak = rowOf([F.水弱], '水弱郎');
  ok(weak && Array.isArray(weak.worstDays) && weak.worstDays.length === 1 && weak.worstDays[0] === '水曜 要調査', 'T6a: 水弱郎 worstDays=[水曜 要調査]');
  const even = rowOf([F.均等], '均等美');
  ok(even && Array.isArray(even.worstDays) && even.worstDays.length === 0, 'T6b: 均等美 worstDays=[]（弱い曜日なし）');
}

// ===================================================================
// T7: renderUsageTable（実質週回数=小数第1位・率=整数・丸めは表示だけ／生値は非丸め）
// ===================================================================
{
  const r = report([F.適正]);
  const lines = drv ? drv.renderUsageTable(r) : null;
  ok(Array.isArray(lines) && lines.length === 1, 'T7a: renderUsageTable が行文字列配列を返す（1行）');
  const line = lines && lines[0];
  // 適正花子 3ヶ月窓: aPW=0.857→表示0.9回/週・ratePct=85.71→表示86%
  ok(line && line.indexOf('0.9回/週') !== -1, 'T7b: 実質週回数が小数第1位で表示（0.9回/週）');
  ok(line && line.indexOf('86%') !== -1, 'T7c: 全体利用率が整数丸めで表示（86%）');
  ok(line && line.indexOf(F.適正.name) !== -1, 'T7d: 行に利用者名を含む');
  // 対で: buildUsageReport 側の生値は丸まっていない（丸めは表示層のみ・設計§8-4）
  const c3 = r && r.rows[0].cells[2];
  ok(c3 && c3.ratePct % 1 !== 0 && approx(c3.ratePct, 12 / 14 * 100), 'T7e: 生値 ratePct は非整数のまま（85.714…・表示だけ86%）');
  ok(c3 && approx(c3.actualPerWeek, 12 / 14) && Math.abs(c3.actualPerWeek - 0.9) > 1e-6, 'T7f: 生値 actualPerWeek は非丸め（0.857…・表示だけ0.9）');
}

// ===================================================================
// T8: loadRealDump は throw（実データは骨組みでは接続しない・§13 G1/G2/G3ゲート）
// ===================================================================
{
  let threw = false, msg = '';
  try { if (drv) drv.loadRealDump('2026-04', '2026-06', asOf); else throw new Error('driver未ロード'); }
  catch (e) { threw = true; msg = String(e.message || e); }
  ok(threw, 'T8a: loadRealDump は throw する（実データ未接続）');
  ok(drv ? msg.indexOf('clasp') !== -1 : true, 'T8b: throw メッセージに clasp窓ゲート言及');
}

// ===================================================================
// T9: deriveHedgeFlags は既定 {低契約:false, 率天井継続:false}（保険が骨組みで発火しない）
// ===================================================================
{
  const cells = drv ? drv.buildUsageReport({ users: [F.適正] }, asOf).rows[0].cells : null;
  const flags = drv ? drv.deriveHedgeFlags(F.適正, cells) : null;
  ok(flags && flags['低契約'] === false, 'T9a: deriveHedgeFlags.低契約=false（暫定・実データ送り）');
  ok(flags && flags['率天井継続'] === false, 'T9b: deriveHedgeFlags.率天井継続=false（暫定・実データ送り）');
}

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
