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
    { フェーズ:'' },
    { フェーズ:'なんか未知' },
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
  eq('受付', r.受付, 2);
  eq('見学予定', r.進行中.見学予定, 1);
  eq('見学済', r.進行中.見学済, 1);
  eq('体験予定', r.進行中.体験予定, 1);
  eq('体験済', r.進行中.体験済, 1);
  eq('契約準備', r.進行中.契約準備, 1);
  eq('進行中合計', r.進行中合計, 5);
  eq('開始待ち', r.開始待ち, 1);
  eq('その他', r.その他, 1);
}

console.log('[dashStageBuckets_ 空入力]');
{
  const z = C.dashStageBuckets_([]);
  eq('空配列 受付', z.受付, 0);
  eq('空配列 進行中合計', z.進行中合計, 0);
  eq('空配列 その他', z.その他, 0);
  const u = C.dashStageBuckets_(undefined);
  eq('undefined 受付', u.受付, 0);
  eq('undefined 進行中合計', u.進行中合計, 0);
  eq('undefined その他', u.その他, 0);
}

console.log('[INTAKE_DASH_daysBetween_]');
eq('10日差', C.INTAKE_DASH_daysBetween_('2026-06-01','2026-06-11'), 10);
eq('不正→null', C.INTAKE_DASH_daysBetween_('','2026-06-11'), null);

console.log('[dashLeadTime_]');
{
  const today = '2026-07-11';
  const cases = [
    { 氏名:'A', 問い合わせ日:'2026-05-01', 本格利用開始日:'2026-05-31',
      履歴:[{from:'受付',to:'見学',at:'2026-05-08'},{from:'見学',to:'体験',at:'2026-05-18'},{from:'体験',to:'利用開始準備',at:'2026-05-31'}] },
    { 氏名:'B', 問い合わせ日:'2026-05-01', 本格利用開始日:'2026-05-21', 履歴:[] },
    { 氏名:'C', 問い合わせ日:'2026-06-01', 本格利用開始日:'2026-08-01', 履歴:[] },
    { 氏名:'D', フェーズ:'利用開始準備', 問い合わせ日:'2026-06-01', 本格利用開始日:'', 履歴:[] }
  ];
  const r = C.dashLeadTime_(cases, today);
  eq('件数=2(過去日のみ)', r.件数, 2);
  eq('中央値=(30+20)/2=25', r.中央値, 25);
  eq('Aはhistory', r.cases[0].source, 'history');
  eq('Bはapprox', r.cases[1].source, 'approx');
  eq('A段階別に受付→見学=7', r.cases[0].段階別['受付→見学'], 7);
  eq('Bは段階別なし', r.cases[1].段階別, undefined);
  // 対象0件→中央値null・件数0（空shape）
  const empty = C.dashLeadTime_([{ 氏名:'E', 本格利用開始日:'' }], today);
  eq('対象0件 中央値null', empty.中央値, null);
  eq('対象0件 件数0', empty.件数, 0);
}

// 奇数長の中央値（真ん中の値・偶数分岐と別経路）
eq('median奇数[30,20,40]=30', C.INTAKE_DASH_median_([30,20,40]), 30);

console.log('\n[' + (fail ? 'FAIL' : 'OK') + '] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
