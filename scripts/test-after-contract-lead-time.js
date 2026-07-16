// test-after-contract-lead-time.js
// 担会・契約後アプリ v1 タスク3：リードタイム表示の純関数テスト
//
// 方式：出荷コード after-contract.html の LEADTIME-CORE マーカー間を実抽出して評価する。
//   after-contract は真の裸型（shared.js 非読込・外部JS皆無）なので純関数もHTML内に置く。
//   テスト側に実装を写経しない＝出荷コードとテストのドリフト防止。
//
// 設計（2026-07-17 社長承認）：
//   数字 = リードタイム日数（起点日 → 通所介護計画書の doneAt。未完は起点日 → 今日）＝遅さの可視化
//   天気 = 「間に合ったか」
//     契約後（締切=利用開始日あり）: 余裕日数 = 利用開始日 − 判定日（完了ならdoneAt日、未完なら今日）
//        余裕>=4:☀ / 1〜3:⛅ / 0:☔ / <0:⛈
//     担会後（締切なし）＋ 契約後で利用開始日が空の場合: 経過日数
//        0〜1:☀ / 2〜3:⛅ / 4〜5:☔ / >=6:⛈
//
// 実行: node scripts/test-after-contract-lead-time.js

const fs = require('fs');
const path = require('path');

const AC = fs.readFileSync(path.join(__dirname, '..', 'after-contract.html'), 'utf8');

const CORE_RE = /\/\/ ===== LEADTIME-CORE-START =====([\s\S]*?)\/\/ ===== LEADTIME-CORE-END =====/;

function loadCore() {
  const m = AC.match(CORE_RE);
  if (!m) throw new Error('after-contract.html に LEADTIME-CORE マーカーが無い（未実装＝RED）');
  const sandbox = {};
  const src = m[1] + `
    sandbox.acDaysBetween = acDaysBetween;
    sandbox.acFindPlanItem = acFindPlanItem;
    sandbox.acWeatherByElapsed = acWeatherByElapsed;
    sandbox.acWeatherByDeadline = acWeatherByDeadline;
    sandbox.acLeadInfo = acLeadInfo;
  `;
  (function () { eval(src); })();
  return sandbox;
}

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual)); }
}

const C = loadCore();

console.log('[acDaysBetween: 日数差（TZに依存しない）]');
eq(C.acDaysBetween('2026-07-10', '2026-07-13'), 3, '7/10→7/13 は3日');
eq(C.acDaysBetween('2026-07-13', '2026-07-13'), 0, '同日は0日');
eq(C.acDaysBetween('2026-07-13', '2026-07-10'), -3, '逆順はマイナス');
eq(C.acDaysBetween('2026-06-28', '2026-07-02'), 4, '月跨ぎ 6/28→7/2 は4日');
eq(C.acDaysBetween('2025-12-30', '2026-01-02'), 3, '年跨ぎ 12/30→1/2 は3日');
eq(C.acDaysBetween('2026-02-27', '2026-03-01'), 2, '平年2月跨ぎ 2/27→3/1 は2日');
eq(C.acDaysBetween('', '2026-07-13'), null, '空文字は null');
eq(C.acDaysBetween('2026-07-13', null), null, 'null は null');

console.log('[acFindPlanItem: 「通所介護計画書作成」項目の特定]');
const contractItems = [
  { seq: 9,  label: '個別機能基本情報入力(リハプラン)', status: 'done' },
  { seq: 10, label: '通所介護計画書作成(リハプラン)',   status: 'done', doneAt: '2026-07-13 10:30' },
  { seq: 11, label: '個別機能訓練計画書作成',           status: 'pending' }
];
eq(C.acFindPlanItem(contractItems).seq, 10, '契約後: 「通所介護計画書作成(リハプラン)」を拾う');
const meetingItems = [
  { seq: 4, label: '通所介護・訓練計画書一覧表に月を赤で記入', status: 'done' },
  { seq: 8, label: '通所介護計画書作成',                       status: 'pending' }
];
eq(C.acFindPlanItem(meetingItems).seq, 8, '担会後: 「通所介護計画書作成」を拾う');
eq(C.acFindPlanItem([{ seq: 4, label: '通所介護・訓練計画書一覧表に月を赤で記入' }]), null,
   '誤爆防止: 「通所介護・訓練計画書一覧表…」は拾わない');
eq(C.acFindPlanItem([{ seq: 1, label: 'リハブクラウドの提供票更新（曜日・回数）' }]), null,
   '計画書項目が無ければ null（利用曜日変更カード等）');
eq(C.acFindPlanItem([]), null, '空配列は null');
eq(C.acFindPlanItem(null), null, 'null は null');

console.log('[acWeatherByElapsed: 経過日数の天気（担会後・締切なし）]');
eq(C.acWeatherByElapsed(0), '☀', '0日 = ☀');
eq(C.acWeatherByElapsed(1), '☀', '1日 = ☀');
eq(C.acWeatherByElapsed(2), '⛅', '2日 = ⛅');
eq(C.acWeatherByElapsed(3), '⛅', '3日 = ⛅');
eq(C.acWeatherByElapsed(4), '☔', '4日 = ☔');
eq(C.acWeatherByElapsed(5), '☔', '5日 = ☔');
eq(C.acWeatherByElapsed(6), '⛈', '6日 = ⛈');
eq(C.acWeatherByElapsed(30), '⛈', '30日 = ⛈');

console.log('[acWeatherByDeadline: 利用開始日に間に合ったか（契約後）]');
eq(C.acWeatherByDeadline('2026-07-20', '2026-07-10'), '☀', '余裕10日 = ☀');
eq(C.acWeatherByDeadline('2026-07-14', '2026-07-10'), '☀', '余裕4日 = ☀');
eq(C.acWeatherByDeadline('2026-07-13', '2026-07-10'), '⛅', '余裕3日 = ⛅');
eq(C.acWeatherByDeadline('2026-07-11', '2026-07-10'), '⛅', '余裕1日 = ⛅');
eq(C.acWeatherByDeadline('2026-07-10', '2026-07-10'), '☔', '当日(余裕0) = ☔');
eq(C.acWeatherByDeadline('2026-07-09', '2026-07-10'), '⛈', '1日遅れ = ⛈');
eq(C.acWeatherByDeadline('2026-07-01', '2026-07-10'), '⛈', '9日遅れ = ⛈');

console.log('[acLeadInfo: カード表示用の統合]');
// 契約後・完了・利用開始に2日遅れ
const ev1 = {
  eventType: 'contract_after', eventDate: '2026-07-10',
  metadata: { '利用開始日': '2026-07-11' },
  items: [{ seq: 10, label: '通所介護計画書作成(リハプラン)', status: 'done', doneAt: '2026-07-13 10:30' }]
};
const r1 = C.acLeadInfo(ev1, '2026-07-17');
eq(r1.days, 3, '契約後・完了: 契約7/10→完成7/13 で 3日');
eq(r1.done, true, '契約後・完了: done=true');
eq(r1.weather, '⛈', '契約後・完了: 利用開始7/11に2日遅れ = ⛈');

// 契約後・完了・余裕あり（日数は5日かかっているが間に合っている）
const ev2 = {
  eventType: 'contract_after', eventDate: '2026-07-01',
  metadata: { '利用開始日': '2026-07-15' },
  items: [{ seq: 10, label: '通所介護計画書作成(リハプラン)', status: 'done', doneAt: '2026-07-06 09:00' }]
};
const r2 = C.acLeadInfo(ev2, '2026-07-17');
eq(r2.days, 5, '契約後・完了: 5日かかった（遅さは日数で見える）');
eq(r2.weather, '☀', '契約後・完了: 利用開始まで余裕9日 = ☀');

// 契約後・未完（今日基準）
const ev3 = {
  eventType: 'contract_after', eventDate: '2026-07-16',
  metadata: { '利用開始日': '2026-07-18' },
  items: [{ seq: 10, label: '通所介護計画書作成(リハプラン)', status: 'pending' }]
};
const r3 = C.acLeadInfo(ev3, '2026-07-17');
eq(r3.days, 1, '契約後・未完: 契約7/16→今日7/17 で 1日経過');
eq(r3.done, false, '契約後・未完: done=false');
eq(r3.weather, '⛅', '契約後・未完: 利用開始7/18まで余裕1日 = ⛅');

// 契約後・未完・利用開始日を過ぎている（最悪）
const ev4 = {
  eventType: 'contract_after', eventDate: '2026-07-01',
  metadata: { '利用開始日': '2026-07-05' },
  items: [{ seq: 10, label: '通所介護計画書作成(リハプラン)', status: 'pending' }]
};
const r4 = C.acLeadInfo(ev4, '2026-07-17');
eq(r4.days, 16, '契約後・未完: 16日経過');
eq(r4.weather, '⛈', '契約後・未完: 利用開始を過ぎて未完 = ⛈');

// 担会後・完了（締切なし＝経過日数ルール）
const ev5 = {
  eventType: 'meeting_after', eventDate: '2026-07-12',
  metadata: {},
  items: [{ seq: 8, label: '通所介護計画書作成', status: 'done', doneAt: '2026-07-14 15:00' }]
};
const r5 = C.acLeadInfo(ev5, '2026-07-17');
eq(r5.days, 2, '担会後・完了: 担会7/12→完成7/14 で 2日');
eq(r5.weather, '⛅', '担会後・完了: 2日 = ⛅（経過日数ルール）');

// 担会後・未完
const ev6 = {
  eventType: 'meeting_after', eventDate: '2026-07-01',
  metadata: {},
  items: [{ seq: 8, label: '通所介護計画書作成', status: 'pending' }]
};
const r6 = C.acLeadInfo(ev6, '2026-07-17');
eq(r6.days, 16, '担会後・未完: 16日経過');
eq(r6.weather, '⛈', '担会後・未完: 16日 = ⛈');

// 契約後だが利用開始日が空 → 経過日数ルールにフォールバック
const ev7 = {
  eventType: 'contract_after', eventDate: '2026-07-15',
  metadata: {},
  items: [{ seq: 10, label: '通所介護計画書作成(リハプラン)', status: 'done', doneAt: '2026-07-16 10:00' }]
};
const r7 = C.acLeadInfo(ev7, '2026-07-17');
eq(r7.days, 1, '利用開始日なし: 日数は出る');
eq(r7.weather, '☀', '利用開始日なし: 経過日数ルールへフォールバック（1日=☀）');

console.log('[acLeadInfo: 表示しないケース]');
eq(C.acLeadInfo({ eventType: 'usage_days_change', eventDate: '2026-07-01', items: [{ seq: 1, label: 'リハブクラウドの提供票更新（曜日・回数）' }] }, '2026-07-17'), null,
   '計画書項目が無いカード（利用曜日変更）は null＝非表示');
eq(C.acLeadInfo({ eventType: 'contract_after', eventDate: '', items: [{ seq: 10, label: '通所介護計画書作成(リハプラン)', status: 'pending' }] }, '2026-07-17'), null,
   '起点日が無ければ null＝非表示');
eq(C.acLeadInfo(null, '2026-07-17'), null, 'evt が null なら null');

console.log('[acLeadInfo: doneAt が壊れている場合は未完扱い（落ちない）]');
const ev8 = {
  eventType: 'meeting_after', eventDate: '2026-07-15',
  metadata: {},
  items: [{ seq: 8, label: '通所介護計画書作成', status: 'done', doneAt: '' }]
};
const r8 = C.acLeadInfo(ev8, '2026-07-17');
eq(r8.done, false, 'doneAt が空なら未完扱い');
eq(r8.days, 2, 'doneAt が空なら今日までの経過日数');

console.log('\n==== ' + pass + ' PASS / ' + fail + ' FAIL ====');
process.exit(fail === 0 ? 0 : 1);
