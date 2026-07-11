const C = require('../gas/yawaragi-board/intake-dashboard-core.js');
let pass = 0, fail = 0;
function eq(label, got, exp) {
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g === e) { pass++; console.log('  PASS', label); }
  else { fail++; console.log('  FAIL', label, '\n    got', g, '\n    exp', e); }
}

console.log('[dashStageBuckets_]');
{
  const cases = [
    { フェーズ:'受付' },
    { フェーズ:'見学', 見学完了:false },
    { フェーズ:'見学', 見学完了:true },
    { フェーズ:'体験', 体験完了:false },
    { フェーズ:'体験', 体験完了:true },
    { フェーズ:'契約準備' },
    { フェーズ:'利用開始準備' },
    { フェーズ:'ドロップ' },
    { フェーズ:'アーカイブ' },
    { フェーズ:'見学', 見学完了:true, 利用者台帳反映済:true }
  ];
  const r = C.dashStageBuckets_(cases);
  eq('受付', r.受付, 1);
  eq('見学予定', r.進行中.見学予定, 1);
  eq('見学済', r.進行中.見学済, 1);
  eq('体験予定', r.進行中.体験予定, 1);
  eq('体験済', r.進行中.体験済, 1);
  eq('契約準備', r.進行中.契約準備, 1);
  eq('進行中合計M', r.進行中合計, 5);
  eq('開始待ち', r.開始待ち, 1);
}

console.log('\n[' + (fail ? 'FAIL' : 'OK') + '] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
