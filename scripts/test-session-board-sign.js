// セッションボード「サインをもらう人」判定 純関数テスト
// 実行: node scripts/test-session-board-sign.js
//
// 判定spec（クロ指示書 2026-08-06・社長決定）:
//   対象＝電子サイン対応の2書類のみ
//     個別機能訓練計画書（適用月＝作業月の翌月＝予定月シート domain='kobetsu' の値）
//     通所介護計画書（適用月＝満了月＝due_date の年月）
//   ⚪ 計画書未作成 … サインの案内を出さない（画面に出さない）
//   🟢 電子OK      … 今日が適用月より前（＝まだ適用月の来所が始まっていない）
//   🟡 最終チャンス … 適用月に来所ゼロ かつ 今日が適用月の非欠席予定日の先頭
//   🔴 紙          … 適用月に来所した日が1日以上ある（2回目以降）
//
// ★ signKigen 列は使わない（都度計算）。欠席で初回来所日がずれると凍結値は嘘になるため。

const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eq(a, b, label) { ok(a === b, label + ' :: exp=' + JSON.stringify(b) + ' act=' + JSON.stringify(a)); }

// 2026-08: 火=4,11,18,25 / 木=6,13,20,27 / 金=7,14,21,28

// ===== A. sbIsVisitDay_（その日が「来所予定日」か。欠席・利用開始前・中止後を落とす） =====
eq(core.sbIsVisitDay_('火木', '2026-08-06', {}, '', ''), true, 'A1: 木曜は利用曜日「火木」の予定日');
eq(core.sbIsVisitDay_('火木', '2026-08-07', {}, '', ''), false, 'A2: 金曜は予定日でない');
eq(core.sbIsVisitDay_('火木', '2026-08-06', { '2026-08-06': true }, '', ''), false, 'A3: 欠席登録がある日は予定日でない');
eq(core.sbIsVisitDay_('', '2026-08-06', {}, '', ''), false, 'A4: 利用曜日が空なら予定日でない');
eq(core.sbIsVisitDay_('火木', '2026-08-04', {}, '2026-08-06', ''), false, 'A5: 利用開始日より前は予定日でない');
eq(core.sbIsVisitDay_('火木', '2026-08-06', {}, '2026-08-06', ''), true, 'A6: 利用開始日当日は予定日');
eq(core.sbIsVisitDay_('火木', '2026-08-13', {}, '', '2026-08-06'), false, 'A7: 中止日より後は予定日でない');
eq(core.sbIsVisitDay_('火木', '2026-08-06', {}, '', '2026-08-06'), true, 'A8: 中止日当日は予定日（過去記録として残す）');

// ===== B. sbFirstVisitDate_（適用月の「非欠席予定日の先頭」＝都度計算の心臓） =====
eq(core.sbFirstVisitDate_('火木', '2026-08', {}, '', ''), '2026-08-04', 'B1: 8月の初回は4日(火)');
eq(core.sbFirstVisitDate_('火木', '2026-08', { '2026-08-04': true }, '', ''), '2026-08-06',
   'B2: ★初回4日(火)が欠席なら初回は6日(木)へずれる');
eq(core.sbFirstVisitDate_('火木', '2026-08', { '2026-08-04': true, '2026-08-06': true, '2026-08-11': true }, '', ''),
   '2026-08-13', 'B3: ★連続欠席でも次の非欠席予定日まで正しくずれる');
eq(core.sbFirstVisitDate_('火', '2026-08', { '2026-08-04': true, '2026-08-11': true, '2026-08-18': true, '2026-08-25': true }, '', ''),
   '', 'B4: 月内の予定日が全部欠席なら空（来所機会なし）');
eq(core.sbFirstVisitDate_('', '2026-08', {}, '', ''), '', 'B5: 利用曜日が空なら空');
eq(core.sbFirstVisitDate_('火木', '2026-08', {}, '2026-08-10', ''), '2026-08-11', 'B6: 利用開始日以降の初回');
eq(core.sbFirstVisitDate_('火木', '2026-02', {}, '', ''), '2026-02-03', 'B7: 2月(28日月)でも走査できる');
eq(core.sbFirstVisitDate_('火木', 'bad-ym', {}, '', ''), '', 'B8: 不正な年月は空（落ちない）');

// ===== C. sbSignState_（4状態の判定本体） =====
eq(core.sbSignState_('2026-09', false, '', '2026-08-06'), 'none', 'C1: ⚪ 計画書未作成');
eq(core.sbSignState_('2026-09', true, '', '2026-08-06'), 'ok', 'C2: 🟢 今日が適用月より前＝電子OK');
eq(core.sbSignState_('2026-08', true, '2026-08-06', '2026-08-06'), 'last', 'C3: 🟡 今日が適用月の初回来所日＝最終チャンス');
eq(core.sbSignState_('2026-08', true, '2026-08-04', '2026-08-06'), 'paper', 'C4: 🔴 適用月に来所済み＝紙');
eq(core.sbSignState_('2026-08', true, '2026-08-11', '2026-08-06'), 'ok', 'C5: 🟢 適用月だが初回来所日はまだ先＝間に合う');
eq(core.sbSignState_('2026-07', true, '2026-07-02', '2026-08-06'), 'paper', 'C6: 🔴 適用月を過ぎている＝電子は使えない');
eq(core.sbSignState_('2026-08', true, '', '2026-08-06'), 'ok', 'C7: 適用月に来所予定がない＝機会未到来なので🟢扱い');
eq(core.sbSignState_('', true, '', '2026-08-06'), 'none', 'C8: 適用月が不明なら出さない');

// ===== D. sbBuildSignBoard_（全員分の組み立て・並び・明日の印刷リマインド） =====
const baseUsers = [
  // 個訓（要介護）: 適用月2026-08・計画書作成済み・8/4(火)欠席so初回は8/6(木)＝今日
  { name: '欠席ずれ子', userId: '欠席ずれ子', category: '要介護2', days: '火木', startDate: '', cancelDate: '' },
  // 個訓: 適用月2026-08・初回8/4に来所済み → 🔴
  { name: '来所済男', userId: '来所済男', category: '要介護1', days: '火木', startDate: '', cancelDate: '' },
  // 個訓: 適用月2026-09（翌月）・作成済み → 🟢
  { name: '来月子', userId: '来月子', category: '要介護3', days: '金', startDate: '', cancelDate: '' },
  // 個訓: 適用月2026-08だが計画書未作成 → ⚪（出さない）
  { name: '未作成男', userId: '未作成男', category: '要介護1', days: '火木', startDate: '', cancelDate: '' },
  // 個訓: 予定月が取れない → 出さない＋fallbackで可視化
  { name: '予定月なし子', userId: '予定月なし子', category: '要介護2', days: '火', startDate: '', cancelDate: '' },
  // 通所（全員対象）: 満了月2026-08・作成済み・初回8/7(金)＝明日 → 今日は🟢／明日は🟡
  { name: '通所明日子', userId: '通所明日子', category: '要支援1', days: '金', startDate: '', cancelDate: '' }
];
const signInput = {
  today: '2026-08-06',
  users: baseUsers,
  absentByKey: { '欠席ずれ子': { '2026-08-04': true } },
  kobetsuYotei: {
    '欠席ずれ子': '2026-08', '来所済男': '2026-08', '来月子': '2026-09', '未作成男': '2026-08'
  },
  kunRows: [
    { userId: '欠席ずれ子', name: '欠席ずれ子', year: 2026, month: 8, keikaku_date: '2026-07-28' },
    { userId: '来所済男', name: '来所済男', year: 2026, month: 8, keikaku_date: '2026-07-29' },
    { userId: '来月子', name: '来月子', year: 2026, month: 9, keikaku_date: '2026-08-03' },
    { userId: '未作成男', name: '未作成男', year: 2026, month: 8, keikaku_date: '' }
  ],
  tsushoDueMap: { '通所明日子': '2026-08-31' },
  tsushoRows: [{ userId: '通所明日子', year: 2026, month: 8, plan_date: '2026-08-01' }]
};
const board = core.sbBuildSignBoard_(signInput);

function pick(rows, name, docType) {
  return (rows || []).filter(function (r) { return r.name === name && r.docType === docType; })[0];
}
const rBoard = board.rows || [];
eq(!!pick(rBoard, '未作成男', 'kobetsu'), false, 'D1: ⚪計画書未作成は画面に出さない');
eq(pick(rBoard, '欠席ずれ子', 'kobetsu').state, 'last', 'D2: ★欠席で初回がずれた人が今日🟡になる');
eq(pick(rBoard, '欠席ずれ子', 'kobetsu').firstVisitDate, '2026-08-06', 'D3: 初回来所日は都度計算した実日付');
eq(pick(rBoard, '来所済男', 'kobetsu').state, 'paper', 'D4: 適用月に来所済み＝🔴');
eq(pick(rBoard, '来月子', 'kobetsu').state, 'ok', 'D5: 適用月が翌月＝🟢');
eq(pick(rBoard, '通所明日子', 'tsusho').state, 'ok', 'D6: 通所は満了月が適用月・初回は明日so今日は🟢');
eq(pick(rBoard, '通所明日子', 'tsusho').applyYm, '2026-08', 'D7: 通所の適用月＝満了日(due_date)の年月');
eq(!!pick(rBoard, '予定月なし子', 'kobetsu'), false, 'D8: 予定月が取れない人は出さない');
ok((board.fallback && board.fallback.kobetsuNoYotei || []).indexOf('予定月なし子') >= 0,
   'D9: 予定月が取れない人はfallbackで可視化（黙って落とさない）');

// 並び: 🟡→🔴→🟢（🟡🔴を上に、🟢はその下）
const states = rBoard.map(function (r) { return r.state; });
const firstOk = states.indexOf('ok');
ok(firstOk === -1 || states.slice(0, firstOk).every(function (s) { return s === 'last' || s === 'paper'; }),
   'D10: 並びは🟡🔴が先・🟢が後');
ok(states.indexOf('last') === 0, 'D11: 🟡最終チャンスが最上段');
eq(rBoard.every(function (r) { return r.state !== 'none'; }), true, 'D12: none行は含まれない');
eq(pick(rBoard, '欠席ずれ子', 'kobetsu').docLabel, '個別機能訓練計画書', 'D13: 書類名ラベルもcoreが持つ（表示層に判定を置かない）');
eq(pick(rBoard, '通所明日子', 'tsusho').docLabel, '通所介護計画書', 'D14: 通所のラベル');

// ===== E. 明日の印刷リマインド（明日🔴になる予定者） =====
// 「来所済男」は火木＝明日(8/7金)は来ない → 出ない
// 明日来所して🔴になる人を作る: 金曜利用・適用月8月・初回8/7より前に来所済み…
const remInput = {
  today: '2026-08-06',
  users: [
    // 月金利用・適用月2026-08・初回は8/3(月)＝来所済み → 明日8/7(金)に来る＝明日🔴
    { name: '明日紙子', userId: '明日紙子', category: '要介護1', days: '月金', startDate: '', cancelDate: '' },
    // 同条件だが明日欠席 → リマインドに出さない
    { name: '明日欠席子', userId: '明日欠席子', category: '要介護1', days: '月金', startDate: '', cancelDate: '' },
    // 明日来るが今日🟢（適用月が翌月）→ リマインドに出さない
    { name: '明日電子子', userId: '明日電子子', category: '要介護1', days: '月金', startDate: '', cancelDate: '' }
  ],
  absentByKey: { '明日欠席子': { '2026-08-07': true } },
  kobetsuYotei: { '明日紙子': '2026-08', '明日欠席子': '2026-08', '明日電子子': '2026-09' },
  kunRows: [
    { userId: '明日紙子', name: '明日紙子', year: 2026, month: 8, keikaku_date: '2026-07-28' },
    { userId: '明日欠席子', name: '明日欠席子', year: 2026, month: 8, keikaku_date: '2026-07-28' },
    { userId: '明日電子子', name: '明日電子子', year: 2026, month: 9, keikaku_date: '2026-08-02' }
  ],
  tsushoDueMap: {},
  tsushoRows: []
};
const rem = core.sbBuildSignBoard_(remInput);
const tp = rem.tomorrowPrint || [];
eq(tp.length, 1, 'E1: 明日の印刷リマインドは1名');
eq(tp[0] && tp[0].name, '明日紙子', 'E2: 明日来所して🔴になる人が出る');
eq(tp[0] && tp[0].date, '2026-08-07', 'E3: リマインドは明日の日付を持つ');
ok(!tp.some(function (r) { return r.name === '明日欠席子'; }), 'E4: 明日欠席の人は出さない');
ok(!tp.some(function (r) { return r.name === '明日電子子'; }), 'E5: 明日も電子OKの人は出さない');

// ===== F. 縮退（materialが欠けても落ちない） =====
const empty = core.sbBuildSignBoard_({ today: '2026-08-06' });
eq((empty.rows || []).length, 0, 'F1: 入力が空でも落ちず0件');
eq((empty.tomorrowPrint || []).length, 0, 'F2: 同・リマインドも0件');
const noToday = core.sbBuildSignBoard_({ today: '', users: baseUsers });
eq((noToday.rows || []).length, 0, 'F3: todayが無ければ何も出さない（誤案内より無表示）');
ok((core.sbBuildSignBoard_(signInput).fallback.tsushoNoDue || []).length >= 1,
   'F4: 満了日(due_date)が無い人はfallbackで可視化');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
