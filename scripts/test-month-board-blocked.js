// 月次ボード core: 個訓計画書(kunPlan)の「保留(blocked_reason)」除外テスト（純関数・require方式）
// 実行: node scripts/test-month-board-blocked.js
// 仕様（クロ確定）:
//   ・計画月(isPlanMonth)かつ blocked_reason 有り → kunPlan の対象から除外（＝朝報告やり残しに出さない）。
//   ・保留でない月の挙動は現状と1件も変わらない（回帰固定）。
//   ・blocked_reason を消す（取消/解除）と、元どおり kunPlan の未実施として督促対象に戻る。
//   ・サイクル(isPlanMonth)は不変。除外は「対象から外す」だけで planMonth 判定は動かさない。
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'month-board-core.js'));
const buildMonthBoard = core.buildMonthBoard;

// deps: planStart 有り=当月を計画月扱い／評価月・口腔・測定は本テスト対象外に固定
const deps = {
  isPlanMonth: (planStart) => !!planStart,
  isHyoukaMonth: () => false,
  sbNormalizeName_: (s) => String(s == null ? '' : s).replace(/[\s　]+/g, '')
};

function build(users, kunRecords) {
  return buildMonthBoard({
    targetMonth: '2026-07', users: users, kunRecords: kunRecords,
    oralRecords: [], sokuteiRecords: [], tsushoSendRecords: [], tsushoDueMap: {}
  }, deps);
}
function kunPlan(board) { return board.sections.find(s => s.key === 'kunPlan'); }
function names(sec) { return sec.targets.map(t => t.name); }

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };
const eq = (name, got, want) => ok(name + '  (got=' + JSON.stringify(got) + ')', JSON.stringify(got) === JSON.stringify(want));

const U = (id, name) => ({ userId: id, name: name, category: '要介護1', planStart: '2026-01', planMonths: 3 });

// ===== 1) 回帰: 保留なしの挙動は不変（未作成=done:false / 作成済=done:true）=====
{
  const b = build(
    [U('n', '未作成'), U('d', '作成済')],
    [{ userId: 'd', name: '作成済', keikaku_date: '2026-07-05' }]
  );
  const s = kunPlan(b);
  eq('R1 対象は2名（未作成・作成済）', names(s), ['未作成', '作成済']);
  eq('R1 countTarget=2', s.countTarget, 2);
  eq('R1 未作成 done=false', s.targets.find(t => t.name === '未作成').done, false);
  eq('R1 作成済 done=true', s.targets.find(t => t.name === '作成済').done, true);
}

// ===== 2) 保留は kunPlan から除外（分母からも消える）=====
{
  const b = build(
    [U('n', '未作成'), U('b', '保留者')],
    [{ userId: 'b', name: '保留者', blocked_reason: '長期休み' }]
  );
  const s = kunPlan(b);
  ok('H1 保留者は kunPlan に出ない', !names(s).includes('保留者'));
  eq('H1 残るのは未作成のみ', names(s), ['未作成']);
  eq('H1 countTarget=1（保留は分母外）', s.countTarget, 1);
  eq('H1 countUndone=1', s.countUndone, 1);
}

// ===== 3) 理由6種すべてで除外される =====
{
  const REASONS = ['保険未登録', '利用継続未確定', '長期休み', '入院・入所', 'ケアマネ未提出', '利用終了・中止'];
  REASONS.forEach((reason, i) => {
    const b = build([U('x' + i, '保留' + i)], [{ userId: 'x' + i, name: '保留' + i, blocked_reason: reason }]);
    ok('H2[' + reason + '] は除外', kunPlan(b).targets.length === 0);
  });
}

// ===== 4) 取消/解除: blocked_reason='' なら元どおり未実施として復活 =====
{
  const b = build([U('c', '解除者')], [{ userId: 'c', name: '解除者', blocked_reason: '', keikaku_date: '' }]);
  const s = kunPlan(b);
  eq('C1 解除後は kunPlan に復活', names(s), ['解除者']);
  eq('C1 解除後 done=false（督促対象に戻る）', s.targets[0].done, false);
}

// ===== 5) 保留でも計画月判定(isPlanMonth)自体は動かさない（サイクル不変の担保）=====
// planStart 無し → 計画月でない → そもそも kunPlan 非対象（保留と無関係に不変）
{
  const noPlan = { userId: 'z', name: '非計画月', category: '要介護1', planStart: '', planMonths: 3 };
  const b = build([noPlan], [{ userId: 'z', name: '非計画月', blocked_reason: '長期休み' }]);
  eq('S1 非計画月は保留有無に関わらず対象外', kunPlan(b).targets.length, 0);
}

console.log('\n月次ボード 保留除外: ' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILED') + '  (pass=' + pass + ')');
process.exit(fail === 0 ? 0 : 1);
