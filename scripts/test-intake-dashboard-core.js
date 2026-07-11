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

console.log('[dashConversion_]');
{
  const cases = [
    { フェーズ:'契約準備', 見学完了:true, 体験完了:true, 契約日:'2026-06-10',
      履歴:[{from:'受付',to:'見学',at:'x'},{from:'見学',to:'体験',at:'x'},{from:'体験',to:'契約準備',at:'x'}] },
    { フェーズ:'ドロップ', 見学日:'2026-06-01', 履歴:[] },
    { フェーズ:'見学', 見学完了:true, 履歴:[] },
    { フェーズ:'受付', 履歴:[] }
  ];
  const r = C.dashConversion_(cases);
  eq('見学到達→体験 分母', r.見学到達_体験到達.分母, 2);
  eq('見学到達→体験 分子', r.見学到達_体験到達.分子, 1);
  eq('見学到達→体験 進行中N', r.見学到達_体験到達.進行中N, 1);
  eq('見学到達→体験 率', r.見学到達_体験到達.率, 0.5);
  eq('体験到達→契約 分母', r.体験到達_契約到達.分母, 1);
  eq('体験到達→契約 分子', r.体験到達_契約到達.分子, 1);
}
// アーカイブ=全段階到達扱い（履歴も列も無くても進行中Nに落ちない→分子側）
{
  const r = C.dashConversion_([{ フェーズ:'アーカイブ', 履歴:[] }]);
  eq('アーカイブ 見学→体験 分子', r.見学到達_体験到達.分子, 1);
  eq('アーカイブ 見学→体験 進行中N=0', r.見学到達_体験到達.進行中N, 0);
  eq('アーカイブ 体験→契約 分子', r.体験到達_契約到達.分子, 1);
}
// 第2ステップの進行中N/率 と 空入力・分母0→率null
{
  const r = C.dashConversion_([{ フェーズ:'体験', 体験完了:true, 履歴:[] }]); // 体験到達・契約未到達・非ドロップ
  eq('体験→契約 進行中N', r.体験到達_契約到達.進行中N, 1);
  eq('体験→契約 分母0→率null', r.体験到達_契約到達.率, null);
}
{
  const r = C.dashConversion_([]); // 空入力ガード
  eq('空入力 見学→体験 率null', r.見学到達_体験到達.率, null);
  eq('空入力 見学→体験 分母0', r.見学到達_体験到達.分母, 0);
}

console.log('[dashSources_]');
{
  const cases = [
    { 連絡元区分:'ケアマネ', 問い合わせ日:'2026-06-03', 本格利用開始日:'2026-06-30' },
    { 連絡元区分:'ケアマネ', 問い合わせ日:'2026-06-10', 本格利用開始日:'' },
    { 連絡元区分:'', 問い合わせ日:'2026-05-20', 本格利用開始日:'2026-06-01' }
  ];
  const r = C.dashSources_(cases);
  eq('ケアマネ件数', r.区分別['ケアマネ'].件数, 2);
  eq('ケアマネ利用開始数', r.区分別['ケアマネ'].利用開始数, 1);
  eq('未設定件数', r.区分別['未設定'].件数, 1);
  eq('月次2026-06', r.月次['2026-06'], 2);
  eq('月次2026-05', r.月次['2026-05'], 1);
}

console.log('[dashLostReasons_]');
{
  const cases = [
    { フェーズ:'ドロップ', 氏名:'X', 見学日:'2026-06-01', ドロップ理由:'他事業所に決定', ドロップ記録日時:'2026-06-05', 履歴:[] },
    { フェーズ:'ドロップ', 氏名:'Y', ドロップ理由:'', ドロップ記録日時:'2026-06-08',
      履歴:[{from:'受付',to:'見学',at:'x'},{from:'見学',to:'体験',at:'x'}] },
    { フェーズ:'見学', 氏名:'Z' }
  ];
  const r = C.dashLostReasons_(cases);
  eq('理由 他事業所=1', r.理由別['他事業所に決定'], 1);
  eq('理由 未設定=1', r.理由別['未設定'], 1);
  eq('一覧件数', r.一覧.length, 2);
  eq('日付降順 先頭Y', r.一覧[0].氏名, 'Y');
  eq('X 到達段階=見学', r.一覧[1].到達段階, '見学');
  eq('X approx=true(履歴なし)', r.一覧[1].到達段階approx, true);
  eq('Y 到達段階=体験', r.一覧[0].到達段階, '体験');
  eq('Y approx=false(履歴あり)', r.一覧[0].到達段階approx, false);
}

console.log('[intakeDashboard_ 集約・エッジ]');
{
  const r = C.intakeDashboard_([], '2026-07-11');
  eq('空:需給受付0', r.需給.受付, 0);
  eq('空:所要件数0', r.所要日数.件数, 0);
  eq('空:所要中央値null', r.所要日数.中央値, null);
  eq('空:転換率率null', r.転換率.見学到達_体験到達.率, null);
  eq('空:失注一覧空', r.失注.一覧.length, 0);
  const r2 = C.intakeDashboard_([{ フェーズ:'ドロップ', 氏名:'W', 履歴:null }], '2026-07-11');
  eq('壊れ履歴でも失注1', r2.失注.一覧.length, 1);
}

console.log('\n[' + (fail ? 'FAIL' : 'OK') + '] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
