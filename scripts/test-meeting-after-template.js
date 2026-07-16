// test-meeting-after-template.js
// 担会後（meeting_after）13項目テンプレートのテスト
//
// 方式：出荷コード gas/yawaragi-board/コード.js から EVENT_TEMPLATE_MEETING_AFTER と
//   getEventTemplate を実抽出して評価する（テストとの二重持ち＝ドリフト防止）。
//
// 正本：実運用xls「担会後の作業2022.8.1.xlsx」（sharedStrings 実抽出で13項目を確認済み）
//   ownerTag/isUrgent は契約後テンプレの規則＋社長判断（2026-07-17）：
//     seq9「訓練計画書作成」= boss（契約後seq11 個別機能訓練計画書作成=boss と揃える）
//     seq5「今月の測定一覧表に名前を記入」= anyone（誰でも可）
//
// 実行: node scripts/test-meeting-after-template.js

const fs = require('fs');
const path = require('path');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js'), 'utf8');

// 出荷コードからテンプレ定義と getEventTemplate を抽出して評価
function loadFromShippedCode() {
  const sandbox = {};
  const reTmpl = /var EVENT_TEMPLATE_MEETING_AFTER = \[[\s\S]*?\n\];/;
  const reGet = /function getEventTemplate\(eventType\) \{[\s\S]*?\n\}/;

  const mTmpl = CODE.match(reTmpl);
  if (!mTmpl) throw new Error('EVENT_TEMPLATE_MEETING_AFTER が コード.js に存在しない（未実装＝RED）');
  const mGet = CODE.match(reGet);
  if (!mGet) throw new Error('getEventTemplate が コード.js に存在しない');

  // getEventTemplate は他テンプレも参照するので合わせて評価
  const reContract = /var EVENT_TEMPLATE_CONTRACT_AFTER = \[[\s\S]*?\n\];/;
  const reCare = /var EVENT_TEMPLATE_CAREMANAGER_CHANGE = \[[\s\S]*?\n\];/;
  const reUsage = /var EVENT_TEMPLATE_USAGE_DAYS_CHANGE = \[[\s\S]*?\n\];/;

  const src = [
    CODE.match(reContract)[0],
    CODE.match(reCare)[0],
    CODE.match(reUsage)[0],
    mTmpl[0],
    mGet[0],
    'sandbox.MEETING = EVENT_TEMPLATE_MEETING_AFTER;',
    'sandbox.CONTRACT = EVENT_TEMPLATE_CONTRACT_AFTER;',
    'sandbox.getEventTemplate = getEventTemplate;'
  ].join('\n');
  (function () { eval(src); })();
  return sandbox;
}

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual)); }
}

const S = loadFromShippedCode();

// ---- xls実物（担会後の作業2022.8.1.xlsx）から起こした期待値 ----
const EXPECTED = [
  { seq: 1,  label: 'サービス担当者会議の要点（未開催なら理由記入）', ownerTag: 'consultant', isUrgent: false },
  { seq: 2,  label: '担会・契約日時記入表',                           ownerTag: 'consultant', isUrgent: false },
  { seq: 3,  label: 'ケアプラン（期間／期限切れ・内容変更・延長・暫定）', ownerTag: 'consultant', isUrgent: false },
  { seq: 4,  label: '通所介護・訓練計画書一覧表に月を赤で記入',       ownerTag: 'consultant', isUrgent: false },
  { seq: 5,  label: '今月の測定一覧表に名前を記入',                   ownerTag: 'anyone',     isUrgent: false },
  { seq: 6,  label: '基本情報修正(保険情報・ケアプラン期間)',         ownerTag: 'consultant', isUrgent: false },
  { seq: 7,  label: '利用パターン等修正',                             ownerTag: 'consultant', isUrgent: false },
  { seq: 8,  label: '通所介護計画書作成',                             ownerTag: 'consultant', isUrgent: true  },
  { seq: 9,  label: '訓練計画書作成',                                 ownerTag: 'boss',       isUrgent: true  },
  { seq: 10, label: '生活機能チェック・自宅写真含む(要介護のみ)',     ownerTag: 'consultant', isUrgent: false },
  { seq: 11, label: '興味関心チェック(要介護のみ)',                   ownerTag: 'consultant', isUrgent: false },
  { seq: 12, label: '介護保険負担割合証 確認',                        ownerTag: 'consultant', isUrgent: false },
  { seq: 13, label: '保険証 確認(保険更新時)',                        ownerTag: 'consultant', isUrgent: false }
];

console.log('[担会後テンプレ 13項目]');
eq(S.MEETING.length, 13, '項目数が13（xls実物と一致）');

EXPECTED.forEach((exp, i) => {
  const act = S.MEETING[i] || {};
  eq(act.seq, exp.seq, 'seq' + exp.seq + ' の seq');
  eq(act.label, exp.label, 'seq' + exp.seq + ' の label = ' + exp.label);
  eq(act.ownerTag, exp.ownerTag, 'seq' + exp.seq + ' の ownerTag = ' + exp.ownerTag);
  eq(act.isUrgent, exp.isUrgent, 'seq' + exp.seq + ' の isUrgent = ' + exp.isUrgent);
});

console.log('[社長判断の裏取り]');
// seq9 は契約後の「個別機能訓練計画書作成」と同じ boss（規則整合）
const contractKunren = S.CONTRACT.find(t => t.label === '個別機能訓練計画書作成');
eq(S.MEETING[8].ownerTag, contractKunren.ownerTag, 'seq9 訓練計画書作成の ownerTag が契約後seq11(個別機能訓練計画書作成)と同じ');
// 急は2件だけ（xls実物の「急」マークが2個）
eq(S.MEETING.filter(t => t.isUrgent).length, 2, 'isUrgent:true は2件だけ（xlsの「急」2個と一致）');
// anyone は1件だけ（=タスクボード自動起票は1件のみ）
eq(S.MEETING.filter(t => t.ownerTag === 'anyone').length, 1, 'anyone は seq5 の1件だけ（自動起票される件数）');

console.log('[getEventTemplate の分岐]');
eq(S.getEventTemplate('meeting_after').length, 13, "getEventTemplate('meeting_after') が13項目を返す");
eq(S.getEventTemplate('meeting_after'), S.MEETING, "getEventTemplate('meeting_after') が MEETING テンプレ実体を返す");
// 既存分岐の非破壊
eq(S.getEventTemplate('contract_after').length, 35, "既存: getEventTemplate('contract_after') は35項目のまま");
eq(S.getEventTemplate('caremanager_change').length, 15, "既存: getEventTemplate('caremanager_change') は15項目のまま");
eq(S.getEventTemplate('usage_days_change').length, 1, "既存: getEventTemplate('usage_days_change') は1項目のまま");
eq(S.getEventTemplate('unknown_type').length, 0, '未知のeventTypeは空配列のまま（既存の既定動作を維持）');

console.log('\n==== ' + pass + ' PASS / ' + fail + ' FAIL ====');
process.exit(fail === 0 ? 0 : 1);
