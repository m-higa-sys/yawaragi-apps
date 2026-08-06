// 月末締めスナップショット（案C）の純関数テスト（2026-08-05）
//
// 何を守るか:
//  ①冪等性 — 2回走らせても行が増えない・既存行を1セルも上書きしない。
//    締めは毎月1日未明にトリガーで自動実行される。手動実行と重なる／再実行される前提なので、
//    冪等でなければ台帳が二重行で壊れる。
//  ②母集団ルール — 非中止の全員 ＋ 中止者のうち対象月に利用実績が1日以上ある人。
//    利用者台帳の「中止」には日付が無い。素朴に中止者を含めると、何年も前に辞めた人の書類が
//    毎月永久に生成され続ける。逆に中止者を全部外すと、月中で辞めた人の未提出が消える。
//  ③生成ルールが teishutsu.html buildTasks と同一であること（6種）。
//
// 実行: node scripts/test-soufu-close-core.js
const path = require('path');
const GAS = path.join(__dirname, '..', 'gas', 'yawaragi-board');
// isHyoukaMonth / oralCycleAt は session-board-judges.js（GAS内グローバル）を使う。Nodeでは global へ注入する。
global.isHyoukaMonth = require(path.join(GAS, 'session-board-judges.js')).isHyoukaMonth;
global.oralCycleAt = require(path.join(GAS, 'session-board-judges.js')).oralCycleAt;
const core = require(path.join(GAS, 'soufu-close-core.js'));
const plan = core.soufuClosePlan_;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}
const docsOf = (rows, userId) => rows.filter(r => r.userId === userId).map(r => r.docType).sort();

// 利用者ひな形。既定は「要介護・非中止・口腔非対象・どの判定にも当たらない」＝何も生成しない人。
function u(over) {
  return Object.assign({
    userId: 'ダミー', category: '要介護1', cancelled: false, usageDays: 8,
    isTarget: false, oralPlanStart: '', oralPlanEnd: '', oralStartedAt: '',
    kunPlanStart: '', kunPlanMonths: 3,
    sokuteiPlanStart: '', dueYM: ''
  }, over || {});
}

console.log('\n[A) ★母集団ルール（中止者の永久生成を封じる）]');
{
  // 要支援・非満了月 → tsusho_moni が1件出る人を使って、母集団に入るか否かだけを見る
  const shien = o => u(Object.assign({ category: '要支援2' }, o));
  const r1 = plan([shien({ userId: '在籍' })], '2026-07', []);
  ok('A1 非中止は含む', docsOf(r1.rows, '在籍').length === 1, JSON.stringify(docsOf(r1.rows, '在籍')));

  const r2 = plan([shien({ userId: '中止0日', cancelled: true, usageDays: 0 })], '2026-07', []);
  ok('A2 中止者で利用実績0日は含まない（過去の中止者が毎月湧かない）', r2.rows.length === 0, JSON.stringify(r2.rows));

  const r3 = plan([shien({ userId: '中止1日', cancelled: true, usageDays: 1 })], '2026-07', []);
  ok('A3 中止者でも利用実績1日以上なら含む（月中で辞めた人の未提出を落とさない）',
     docsOf(r3.rows, '中止1日').length === 1, JSON.stringify(r3.rows));

  const r4 = plan([shien({ userId: '中止未定義', cancelled: true, usageDays: undefined })], '2026-07', []);
  ok('A4 中止者で実績が取れない場合は含まない（不明を勝手に1日扱いしない）', r4.rows.length === 0, JSON.stringify(r4.rows));

  ok('A5 母集団の内訳を返す（報告に使う）',
     r3.stats && r3.stats.populationTotal === 1 && r3.stats.cancelledIncluded === 1,
     JSON.stringify(r3.stats));
}

console.log('\n[B) 生成ルール6種が teishutsu.html buildTasks と同一]');
{
  // ① 要支援 ∧ 非満了月 → tsusho_moni（適用月＝対象月）
  const r = plan([u({ userId: 'A', category: '要支援1' })], '2026-07', []);
  ok('B1 要支援・非満了月 → tsusho_moni', JSON.stringify(docsOf(r.rows, 'A')) === JSON.stringify(['tsusho_moni']));
  ok('B1b 適用月＝対象月', r.rows[0].tekiyoTsuki === '2026-07', 'got=' + r.rows[0].tekiyoTsuki);
}
{
  // ② 満了月（要介護）→ tsusho_keikaku のみ（評価は要支援だけ）
  const r = plan([u({ userId: 'B', category: '要介護2', dueYM: '2026-07' })], '2026-07', []);
  ok('B2 満了月・要介護 → tsusho_keikaku のみ', JSON.stringify(docsOf(r.rows, 'B')) === JSON.stringify(['tsusho_keikaku']),
     JSON.stringify(docsOf(r.rows, 'B')));
  ok('B2b 適用月＝満了年月', r.rows[0].tekiyoTsuki === '2026-07');
}
{
  // ③ 要支援 ∧ 満了月 → keikaku + hyouka（moni は出ない＝満了月は moni を立てない）
  const r = plan([u({ userId: 'C', category: '要支援2', dueYM: '2026-07' })], '2026-07', []);
  ok('B3 要支援・満了月 → keikaku と hyouka の2件',
     JSON.stringify(docsOf(r.rows, 'C')) === JSON.stringify(['tsusho_hyouka', 'tsusho_keikaku']),
     JSON.stringify(docsOf(r.rows, 'C')));
  ok('B3b 満了月に tsusho_moni は立てない', docsOf(r.rows, 'C').indexOf('tsusho_moni') < 0);
}
{
  // ④ 要介護 ∧ isHyoukaMonth → kokun_set（適用月＝翌月）
  // planStart=2026-05 / L=3 なら diff=2 の 2026-07 が評価月
  const r = plan([u({ userId: 'D', category: '要介護1', kunPlanStart: '2026-05', kunPlanMonths: 3 })], '2026-07', []);
  ok('B4 要介護・評価月 → kokun_set', JSON.stringify(docsOf(r.rows, 'D')) === JSON.stringify(['kokun_set']),
     JSON.stringify(docsOf(r.rows, 'D')));
  ok('B4b 適用月＝翌月（次期計画の開始月）', r.rows[0].tekiyoTsuki === '2026-08', 'got=' + r.rows[0].tekiyoTsuki);

  // 要支援は個訓セットを立てない
  const r2 = plan([u({ userId: 'D2', category: '要支援1', kunPlanStart: '2026-05', kunPlanMonths: 3 })], '2026-07', []);
  ok('B4c 要支援には kokun_set を立てない', docsOf(r2.rows, 'D2').indexOf('kokun_set') < 0, JSON.stringify(docsOf(r2.rows, 'D2')));
}
{
  // ⑤ 口腔対象 ∧ oralCycleAt(plan_start)の role==='setsume' → oral_plan（適用月＝翌月）
  // ★2026-08-06 修正: 起点を started_at から plan_start へ。
  //   started_at は口腔②導入時に全員 2026-06 で一括投入された初期値で、個人のサイクルを表していない
  //   （実測: 加算対象106名すべて 2026-06）。そのまま3ヶ月周期を回すと「8月0名・9月に106名全員」という
  //   現実にあり得ない判定になり、実際に7月の締めでは口腔が1件も作られなかった。
  //   画面(oral-plan.html)と月次ボードは plan_start 起点の oralCycleAt で回っているので、そちらへ揃える。
  //   plan_start は節目の2ヶ月前（moni①の月）＝ setsume はその2ヶ月後。
  const r = plan([u({ userId: 'E', isTarget: true, oralPlanStart: '2026-05' })], '2026-07', []);
  ok('B5 口腔対象・節目月(plan_start+2) → oral_plan', docsOf(r.rows, 'E').indexOf('oral_plan') >= 0, JSON.stringify(docsOf(r.rows, 'E')));
  ok('B5b 適用月＝翌月', r.rows.find(x => x.docType === 'oral_plan').tekiyoTsuki === '2026-08');

  const r2 = plan([u({ userId: 'E2', isTarget: false, oralPlanStart: '2026-05' })], '2026-07', []);
  ok('B5c 口腔非対象には立てない', r2.rows.length === 0);

  const r3 = plan([u({ userId: 'E3', isTarget: true, oralPlanStart: '2026-06' })], '2026-07', []);
  ok('B5d 節目でない月（moni②の月）は立てない', r3.rows.length === 0, JSON.stringify(docsOf(r3.rows, 'E3')));

  const r4 = plan([u({ userId: 'E4', isTarget: true, oralPlanStart: '2026-07' })], '2026-07', []);
  ok('B5e 節目でない月（moni①の月）は立てない', r4.rows.length === 0, JSON.stringify(docsOf(r4.rows, 'E4')));

  // started_at はもう見ない。旧値が入っていても判定を動かさない（誤判定の再発防止）。
  const r5 = plan([u({ userId: 'E5', isTarget: true, oralPlanStart: '2026-06', oralStartedAt: '2026-04-01' })], '2026-07', []);
  ok('B5f started_at では判定しない（旧起点の残留値に引きずられない）', r5.rows.length === 0, JSON.stringify(docsOf(r5.rows, 'E5')));

  // plan_end を過ぎたら対象外（画面の oralCycleAt と同じ扱い）
  const r6 = plan([u({ userId: 'E6', isTarget: true, oralPlanStart: '2026-05', oralPlanEnd: '2026-06' })], '2026-07', []);
  ok('B5g plan_end を過ぎたら立てない', r6.rows.length === 0, JSON.stringify(docsOf(r6.rows, 'E6')));

  // ★plan_start 未設定は「立てない」が、黙って落とさず件数で見せる（実測: 加算対象106名中2名）
  const r7 = plan([u({ userId: 'E7', isTarget: true, oralPlanStart: '' })], '2026-07', []);
  ok('B5h plan_start 未設定では立てない（誤った月に立てるより立てない）', r7.rows.length === 0);
  ok('B5i ★未設定は stats で件数を返す（黙って落とさない）',
     r7.stats.oralPlanStartMissing === 1, JSON.stringify(r7.stats.oralPlanStartMissing));

  const r8 = plan([u({ userId: 'E8', isTarget: false, oralPlanStart: '' })], '2026-07', []);
  ok('B5j 口腔非対象者は未設定に数えない', r8.stats.oralPlanStartMissing === 0, JSON.stringify(r8.stats.oralPlanStartMissing));
}
{
  // ⑥ 要支援 ∧ isMeasureMonth（要支援は4ヶ月周期）→ sokutei
  const r = plan([u({ userId: 'F', category: '要支援1', sokuteiPlanStart: '2026-08' })], '2026-07', []);
  ok('B6 要支援・測定月 → sokutei', docsOf(r.rows, 'F').indexOf('sokutei') >= 0, JSON.stringify(docsOf(r.rows, 'F')));

  const r2 = plan([u({ userId: 'F2', category: '要介護1', sokuteiPlanStart: '2026-08' })], '2026-07', []);
  ok('B6b 要介護には sokutei を立てない（個訓の測定は kokun_set に内包）',
     docsOf(r2.rows, 'F2').indexOf('sokutei') < 0, JSON.stringify(docsOf(r2.rows, 'F2')));
}
{
  // 事業対象者は要支援と同じ扱い（2026-06-12 社長判断）
  const r = plan([u({ userId: 'G', category: '事業対象者' })], '2026-07', []);
  ok('B7 事業対象者は要支援と同じ扱い', JSON.stringify(docsOf(r.rows, 'G')) === JSON.stringify(['tsusho_moni']),
     JSON.stringify(docsOf(r.rows, 'G')));
}

console.log('\n[C) ★冪等性: 2回走らせても行が増えない・既存に触らない]');
{
  const users = [u({ userId: 'H', category: '要支援2' })];
  const first = plan(users, '2026-07', []);
  ok('C1 1回目は1件生成', first.rows.length === 1);

  // 1回目の結果を台帳の既存キーとして与える＝2回目
  const keys = first.rows.map(r => r.userId + '|' + r.docType + '|' + r.taishoTsuki);
  const second = plan(users, '2026-07', keys);
  ok('C2 2回目は0件（行が増えない）', second.rows.length === 0, JSON.stringify(second.rows));
  ok('C3 2回目もスキップ内訳を返す', second.stats.skippedExisting === 1, JSON.stringify(second.stats));
}
{
  // 既に人が押した行（揃った・送付済・保留）には一切触らない＝キーがあれば理由を問わずスキップ
  const users = [u({ userId: 'I', category: '要支援2' })];
  const r = plan(users, '2026-07', ['I|tsusho_moni|2026-07']);
  ok('C4 既存行があれば生成しない（status を問わずキーだけで判定）', r.rows.length === 0);
}
{
  // 対象月違いの既存行は関係ない（キーは対象月まで込み）
  const users = [u({ userId: 'J', category: '要支援2' })];
  const r = plan(users, '2026-07', ['J|tsusho_moni|2026-06']);
  ok('C5 別の対象月の行は冪等キーに効かない', r.rows.length === 1);
}

console.log('\n[D) 生成される行の中身]');
{
  const r = plan([u({ userId: 'K', category: '要支援2' })], '2026-07', []);
  const row = r.rows[0];
  ok('D1 status は 保留', row.status === '保留', 'got=' + row.status);
  ok('D2 kurikoshiRiyu は空（＝理由未記録。あとから人が付けられる）', row.kurikoshiRiyu === '');
  ok('D3 updatedBy は monthly-close（機械実行と分かる）', row.updatedBy === 'monthly-close', 'got=' + row.updatedBy);
  ok('D4 taishoTsuki は対象月', row.taishoTsuki === '2026-07');
  ok('D5 sofu_at / soufusha は空（出していないので当然）', row.sofu_at === '' && row.soufusha === '');
  ok('D6 sorotta_at / sorotta_by は空（誰も押していない）', row.sorotta_at === '' && row.sorotta_by === '');
}

console.log('\n[E) 入力ガード]');
{
  let threw = false;
  try { plan([u({})], '2026-7', []); } catch (e) { threw = true; }
  ok('E1 対象月の書式が YYYY-MM でなければ例外', threw);
}
{
  const r = plan([], '2026-07', []);
  ok('E2 利用者0人でも落ちない', r.rows.length === 0 && r.stats.populationTotal === 0);
}

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
