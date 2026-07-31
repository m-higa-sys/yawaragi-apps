// 予定月スライド方式 段階1（個訓）: 初期値生成の純関数テスト
// 実行: node scripts/test-yotei-kobetsu-seed.js
//
// 仕様（クロ確定 2026-07-31）:
//   nextYm = 「keikaku_date を持つ行のうち最新の行の年月」＋ planMonths
//     ★起点は作成日ではなく行の年月（＝計画期間の開始月）。作成日は前月付けなので1ヶ月ずれる。
//   記録が0件の利用者のみ planStart から算出（当月以降で最初の計画月）。
//   どちらも取れなければ当月・note='起点なし'。
//   既に (userId, domain) の行があれば生成しない（冪等）。
//
// ★既存の buildInitialYotei（domain='sokutei'）は1ミリも変えない。別関数として足す。
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'yotei-core.js'));
const build = core.buildInitialYoteiKobetsu;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n); } };
const eq = (n, g, w) => ok(n + '  (got=' + JSON.stringify(g) + ')', JSON.stringify(g) === JSON.stringify(w));

// deps: 計画月判定は shared.js の isPlanMonth を注入（ここに複製しない＝単一の正）
const fs = require('fs');
const shared = fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8');
eval(shared.match(/function isPlanMonth[\s\S]*?\n}/)[0]);
const deps = { isPlanMonth: isPlanMonth };

// 利用者（氏名は使わない・記号のみ）
const U = (id, planStart, planMonths) => ({ userId: id, name: id, care: '要介護1', planStart: planStart, planMonths: planMonths || 3 });
// 計画書記録の行（year/month = 計画期間の開始月、keikaku_date = 実際の作成日）
const R = (id, y, m, keikaku) => ({ userId: id, year: y, month: m, keikaku_date: keikaku });

function run(users, rows, thisYm, existing) {
  return build({ domain: 'kobetsu', thisYm: thisYm || '2026-07', users: users, keikakushoRows: rows, existing: existing || [] }, deps);
}

// ===== A) 記録ベース: 最新行の年月 ＋ planMonths =====
{
  // 行の年月=2026-05、作成日=2026-04-20（前月付け）。起点は「行の年月」なので 2026-05+3 = 2026-08。
  const r = run([U('a', '2026-02')], [R('a', 2026, 5, '2026-04-20')]);
  eq('A1 起点は行の年月（作成日ではない）→ 2026-08', r.rows[0].nextYm, '2026-08');
  eq('A2 note なし（記録ベース）', r.rows[0].note, '');
  eq('A3 stats.fromRecord=1', r.stats.fromRecord, 1);
}
{
  // 複数行 → 最新（年月が最大）を採る。keikaku_date が空の行は無視する。
  const r = run([U('b', '2026-01')], [
    R('b', 2026, 1, '2025-12-20'),
    R('b', 2026, 7, '2026-06-25'),   // 最新
    R('b', 2026, 4, '2026-03-30'),
    R('b', 2026, 10, '')             // keikaku_date 空 → 無視
  ]);
  eq('A4 最新行(2026-07)＋3 → 2026-10（空行は無視）', r.rows[0].nextYm, '2026-10');
}

// ===== B) 年跨ぎ =====
{
  const r = run([U('c', '2025-07')], [R('c', 2025, 12, '2025-11-28')], '2026-01');
  eq('B1 2025-12＋3 → 2026-03（年跨ぎ）', r.rows[0].nextYm, '2026-03');
}
{
  const r = run([U('d', '2025-08')], [R('d', 2025, 11, '2025-10-20')], '2026-01');
  eq('B2 2025-11＋3 → 2026-02（年跨ぎ）', r.rows[0].nextYm, '2026-02');
}

// ===== C) planMonths が 3 以外（変則） =====
{
  const r = run([U('e', '2026-05', 1)], [R('e', 2026, 5, '2026-04-20')]);
  eq('C1 planMonths=1 → 行の年月＋1 = 2026-06', r.rows[0].nextYm, '2026-06');
  eq('C2 cycleMonths に planMonths が入る', r.rows[0].cycleMonths, 1);
}
{
  const r = run([U('f', '2026-05', 2)], [R('f', 2026, 5, '2026-04-20')]);
  eq('C3 planMonths=2 → 2026-07', r.rows[0].nextYm, '2026-07');
}
{
  // 不正な planMonths は既定3へ倒す（画面から入らない値がシートに残っていても落ちない）
  const r = run([{ userId: 'g', name: 'g', care: '要介護1', planStart: '2026-05', planMonths: 0 }], [R('g', 2026, 5, '2026-04-20')]);
  eq('C4 planMonths=0（不正）は既定3扱い → 2026-08', r.rows[0].nextYm, '2026-08');
}

// ===== D) 記録0件 → planStart から（当月以降で最初の計画月） =====
{
  const r = run([U('h', '2026-09')], [], '2026-07');
  eq('D1 記録0件・planStart=2026-09 → 2026-09', r.rows[0].nextYm, '2026-09');
  eq('D2 note に planStart 由来が残る', r.rows[0].note, 'planStart');
  eq('D3 stats.fromPlanStart=1', r.stats.fromPlanStart, 1);
}
{
  // planStart が過去でも、当月以降の最初の計画月へ倒す（過去月を作らない）
  const r = run([U('i', '2026-01')], [], '2026-07');
  eq('D4 記録0件・planStart=2026-01 → 2026-07（当月以降の最初の計画月）', r.rows[0].nextYm, '2026-07');
}
{
  const r = run([{ userId: 'j', name: 'j', care: '要介護1', planStart: '', planMonths: 3 }], [], '2026-07');
  eq('D5 記録0件・planStart無し → 当月・note=起点なし', [r.rows[0].nextYm, r.rows[0].note], ['2026-07', '起点なし']);
  eq('D6 stats.noAnchor=1', r.stats.noAnchor, 1);
}

// ===== E) 記録が未来月にある（前倒しで既に次期分を作成済み） =====
{
  // 当月2026-07。行の年月=2026-08（8月開始分を7月に作成済み）→ 次は 2026-11。
  const r = run([U('k', '2026-02')], [R('k', 2026, 8, '2026-07-15')], '2026-07');
  eq('E1 未来月の記録（2026-08）＋3 → 2026-11（作成済み期間を飛ばす）', r.rows[0].nextYm, '2026-11');
  ok('E2 未来の記録でも過去月にはならない', r.rows[0].nextYm > '2026-07');
}

// ===== F) 過去月になるケースの検出（クランプせず、件数として可視化する） =====
{
  // 行の年月=2025-10（古い）→ +3 = 2026-01 は当月より前。督促対象として意味があるのでクランプしない。
  const r = run([U('m', '2025-04')], [R('m', 2025, 10, '2025-09-20')], '2026-07');
  eq('F1 古い記録は過去月のまま返す（isDue が拾えるように）', r.rows[0].nextYm, '2026-01');
  eq('F2 stats.pastYm で件数を可視化する', r.stats.pastYm, 1);
  eq('F3 note に past を立てる', r.rows[0].note, 'past');
}

// ===== G) 冪等: 既に (userId, domain) の行があれば生成しない =====
{
  const r = run([U('n', '2026-02'), U('o', '2026-02')], [R('n', 2026, 5, '2026-04-20'), R('o', 2026, 5, '2026-04-20')],
    '2026-07', [{ userId: 'n', domain: 'kobetsu' }]);
  eq('G1 既存行の利用者は生成しない', r.rows.map(x => x.userId), ['o']);
  eq('G2 stats.skippedExisting=1', r.stats.skippedExisting, 1);
  const r2 = run([U('p', '2026-02')], [R('p', 2026, 5, '2026-04-20')], '2026-07', [{ userId: 'p', domain: 'sokutei' }]);
  eq('G3 別domainの既存行は無視して生成する', r2.rows.map(x => x.userId), ['p']);
}

// ===== H) domain と出力形 =====
{
  const r = run([U('q', '2026-02')], [R('q', 2026, 5, '2026-04-20')]);
  eq('H1 domain=kobetsu が入る', r.rows[0].domain, 'kobetsu');
  eq('H2 slideCount は0で始まる', r.rows[0].slideCount, 0);
  ok('H3 月別分布 byYm が昇順', JSON.stringify(Object.keys(r.stats.byYm)) === JSON.stringify(Object.keys(r.stats.byYm).slice().sort()));
}

// ===== I) 既存の sokutei 版を壊していないこと =====
{
  ok('I1 buildInitialYotei（sokutei版）が今も export されている', typeof core.buildInitialYotei === 'function');
  ok('I2 nextYmSlide / nextYmUnslide / ymCandidates / isDue も健在',
    typeof core.nextYmSlide === 'function' && typeof core.nextYmUnslide === 'function'
    && typeof core.ymCandidates === 'function' && typeof core.isDue === 'function');
}

// ===== J) 落ちない（入力が欠けても例外にしない） =====
{
  let threw = false;
  try { run([], [], '2026-07'); build({}, deps); build({ users: null, keikakushoRows: null }, deps); } catch (e) { threw = true; }
  ok('J1 空入力・null でも例外にならない', !threw);
}

console.log('\n==== ' + (fail === 0 ? 'ALL GREEN' : 'FAILED') + '  pass=' + pass + ' fail=' + fail + ' ====');
if (fail !== 0) process.exit(1);
