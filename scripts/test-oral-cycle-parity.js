// 口腔の節目判定 パリティテスト（2026-08-06）
//
// 何を守るか:
//  ★締め（soufu-close-core.js）と画面（teishutsu.html）が、同じ起点・同じ関数で
//    「口腔の節目月」を判定していること。片方だけ直すと、締めが凍結した保留行と
//    画面に出る書類がズレる（＝台帳にあるのに画面に出ない／その逆）。
//
//  背景（実測 2026-08-06）: 旧実装は両方とも started_at 起点だったが、started_at は
//  口腔②導入時に加算対象106名すべてへ '2026-06' が一括投入された初期値で、個人のサイクルを
//  表していない。そのため判定が「8月0名・9月に106名全員・10月0名」となり、実際の分布
//  （plan_start 起点で 8月40名・9月35名・10月29名）と全く合わなかった。
//  結果、7月の締めでは口腔が1件も作られず、提出送付台帳の oral_plan は0行のまま
//  （署名済みPDFは29件実在するのに突合が起きない状態だった）。
//
// 実行: node scripts/test-oral-cycle-parity.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const GAS = path.join(ROOT, 'gas', 'yawaragi-board');

const judges = require(path.join(GAS, 'session-board-judges.js'));
global.isHyoukaMonth = judges.isHyoukaMonth;
global.oralCycleAt = judges.oralCycleAt;
const core = require(path.join(GAS, 'soufu-close-core.js'));

const teishutsuSrc = fs.readFileSync(path.join(ROOT, 'teishutsu.html'), 'utf8');
const closeSrc = fs.readFileSync(path.join(GAS, 'soufu-close-core.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('\n[A) 両方が plan_start 起点の oralCycleAt を使っている（ソース検査）]');
{
  ok('A1 teishutsu.html が oralCycleAt(planStart, planEnd) で判定している',
     /oralCycleAt\(u\.planStart,\s*u\.planEnd,\s*yy,\s*mm\)\.role === 'setsume'/.test(teishutsuSrc));
  ok('A2 teishutsu.html の口腔判定に isOralEvalMonth が残っていない（旧起点の残骸なし）',
     !/isOralEvalMonth\([^)]*\)\s*\)\s*pushTask\(name,\s*'oral_plan'/.test(teishutsuSrc)
     && !/if \(u\.isTarget && isOralEvalMonth/.test(teishutsuSrc));
  ok('A3 soufu-close-core.js が oralCycleAt 経由で判定している',
     /oralCycleAt\(planStart, planEnd, year, month\)\.role === 'setsume'/.test(closeSrc));
  ok('A4 soufu-close-core.js に自前の3ヶ月周期計算が残っていない',
     !/_scIsOralEvalMonth/.test(closeSrc));
  ok('A5 soufu-close-core.js が oralPlanStart を読んでいる（oralStartedAt では判定しない）',
     /_scOralSetsume_\(user\.oralPlanStart, user\.oralPlanEnd/.test(closeSrc)
     && !/_scOralSetsume_\(user\.oralStartedAt/.test(closeSrc));
  // PDF突合の月絞りは「適用月」。対象月で絞ると、適用月が翌月になる書類（個訓セット・口腔）が
  // 丸ごと未検知になる（実測: 個訓21件が0件→12件）。ここが対象月に戻っていないことを見張る。
  ok('A6 PDF突合が適用月(tekiyoTsuki)で絞っている',
     /const useYm = String\(t\.tekiyoTsuki \|\| ym\)\.slice\(0, 7\)/.test(teishutsuSrc));
  ok('A7 PDF突合が docType 単位で対象月を渡す旧実装に戻っていない',
     !/sbBuildPdfFoundMap_\(f\.files \|\| \[\], byDoc\[docType\], ym\)/.test(teishutsuSrc));
  // teishutsu は shared.js の oralCycleAt に依存するようになった。?v= が旧値のままだと
  // 現場の端末が古い shared.js を読み続け、oralCycleAt is not defined で画面が出なくなる。
  // teishutsu は version.txt の版ゲートを持たない（no-store配信）ので、この値は手で上げる運用。
  ok('A8 shared.js の ?v= が旧値(2026-07-03a)のままでない',
     !/shared\.js\?v=2026-07-03a/.test(teishutsuSrc));
  ok('A9 shared.js を ?v= 付きで読んでいる（キャッシュバスター自体が消えていない）',
     /<script src="shared\.js\?v=[^"]+"><\/script>/.test(teishutsuSrc));
}

console.log('\n[B) ★実データ相当の分布を再現する（実測 2026-08-06）]');
{
  // 加算対象106名の plan_start 実測分布: 2026-05=29名 / 2026-06=40名 / 2026-07=35名 / 未設定=2名
  const users = [];
  const add = (n, planStart, tag) => {
    for (let i = 0; i < n; i++) users.push({
      userId: tag + i, category: '要介護1', cancelled: false, usageDays: 8,
      isTarget: true, oralPlanStart: planStart, oralPlanEnd: '', oralStartedAt: '2026-06-01',
      kunPlanStart: '', kunPlanMonths: 3, sokuteiPlanStart: '', dueYM: ''
    });
  };
  add(29, '2026-05', 'g5-');
  add(40, '2026-06', 'g6-');
  add(35, '2026-07', 'g7-');
  add(2, '', 'unset-');

  const oralCount = ym => core.soufuClosePlan_(users, ym, []).rows
    .filter(r => r.docType === 'oral_plan').length;

  ok('B1 2026-07 は 29件（plan_start=2026-05 の群）', oralCount('2026-07') === 29, 'got=' + oralCount('2026-07'));
  ok('B2 ★2026-08 は 40件（実測の8月節目と一致）', oralCount('2026-08') === 40, 'got=' + oralCount('2026-08'));
  ok('B3 ★2026-09 は 35件（旧実装の106名全員が湧く事故が起きない）', oralCount('2026-09') === 35, 'got=' + oralCount('2026-09'));
  ok('B4 ★2026-10 は 29件（2026-05群の次の周回）', oralCount('2026-10') === 29, 'got=' + oralCount('2026-10'));

  // 旧起点なら 2026-09 に全員（106名）が立っていた。その形に戻っていないことを固定する。
  ok('B5 2026-09 に106名全員が立たない（旧 started_at 起点への逆戻り検知）',
     oralCount('2026-09') !== 106, 'got=' + oralCount('2026-09'));

  const st = core.soufuClosePlan_(users, '2026-08', []).stats;
  ok('B6 plan_start 未設定2名を件数で返す（黙って落とさない）',
     st.oralPlanStartMissing === 2, JSON.stringify(st.oralPlanStartMissing));
  ok('B7 適用月は対象月の翌月', core.soufuClosePlan_(users, '2026-08', []).rows
     .filter(r => r.docType === 'oral_plan').every(r => r.tekiyoTsuki === '2026-09'));
}

console.log('\n[C) 締めと画面が全ケースで同じ答えを返す]');
{
  // 画面側の判定（teishutsu.html:569 と同じ式）を、shared.js の oralCycleAt で再現する。
  const sharedSrc = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
  const start = sharedSrc.indexOf('function oralCycleAt(');
  let i = sharedSrc.indexOf('{', start), depth = 0;
  for (; i < sharedSrc.length; i++) {
    if (sharedSrc[i] === '{') depth++;
    else if (sharedSrc[i] === '}') { depth--; if (!depth) { i++; break; } }
  }
  const sharedOral = new Function(sharedSrc.slice(start, i) + '; return oralCycleAt;')();
  const screenSays = (ps, pe, y, m) => sharedOral(ps, pe, y, m).role === 'setsume';

  const starts = ['2026-05', '2026-06', '2026-07', '2027-01', ''];
  const ends = ['', '2026-09', '2027-03'];
  let checked = 0, mismatch = 0;
  starts.forEach(ps => ends.forEach(pe => {
    for (let m = 1; m <= 12; m++) {
      const user = {
        userId: 'X', category: '要介護1', cancelled: false, usageDays: 8,
        isTarget: true, oralPlanStart: ps, oralPlanEnd: pe, oralStartedAt: '2026-06-01',
        kunPlanStart: '', kunPlanMonths: 3, sokuteiPlanStart: '', dueYM: ''
      };
      const ym = '2026-' + String(m).padStart(2, '0');
      const close = core.soufuClosePlan_([user], ym, []).rows.some(r => r.docType === 'oral_plan');
      const screen = screenSays(ps, pe, 2026, m);
      checked++;
      if (close !== screen) { mismatch++; console.log('    不一致: planStart=' + ps + ' planEnd=' + pe + ' ' + ym + ' 締め=' + close + ' 画面=' + screen); }
    }
  }));
  ok('C1 ★締めと画面が ' + checked + ' ケースすべてで一致', mismatch === 0, mismatch + '件不一致');
}

console.log('\n[D) 口腔は加算対象者だけ・中止者の扱いは既存どおり]');
{
  const base = over => Object.assign({
    userId: 'Y', category: '要介護1', cancelled: false, usageDays: 8,
    isTarget: true, oralPlanStart: '2026-06', oralPlanEnd: '', oralStartedAt: '',
    kunPlanStart: '', kunPlanMonths: 3, sokuteiPlanStart: '', dueYM: ''
  }, over || {});
  const hasOral = u => core.soufuClosePlan_([u], '2026-08', []).rows.some(r => r.docType === 'oral_plan');
  ok('D1 加算対象なら立つ', hasOral(base()));
  ok('D2 加算対象でなければ立たない', !hasOral(base({ isTarget: false })));
  ok('D3 中止かつ実績0日なら立たない（母集団ルールは不変）', !hasOral(base({ cancelled: true, usageDays: 0 })));
  ok('D4 中止でも実績1日以上なら立つ（月中で辞めた人を落とさない）', hasOral(base({ cancelled: true, usageDays: 1 })));
}

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
