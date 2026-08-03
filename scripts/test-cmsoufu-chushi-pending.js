// test-cmsoufu-chushi-pending.js
// ケアマネ送付チェックリスト.html の「⚠️ 中止者・書類未完了」専用枠の純関数テスト。
//
// 背景（2026-08-03）:
//   中止者は最終利用月を過ぎると一覧から消える（soufuIsChushiHiddenInMonth）。
//   しかし翌月10日までに渡す書類（実績・計画書・モニタリング等）が残るため、
//   当月ビューの上部に専用枠を設け、書類が全部✅になるまで表示し続ける（終わるまで方式）。
//
// 判定仕様:
//   専用枠の対象 = status に「中止」を含む
//                  かつ 最終利用月 < 表示中ym
//                  かつ 必要書類が全部✅になっていない
//   ・最終利用月 == 表示中ym の中止者は従来どおり通常リスト側（既存動作を変えない）
//   ・全✅になったら消える。それ以外の自動消滅は無し（何ヶ月経っても消えない）
//   ・期限 = 最終利用月の翌月10日。当日まで通常色 / 過ぎたら「期限超過」
//   ・planStart がどこからも取れない場合は 'unknown'（＝要確認）。
//     不明を「不要」に倒して自動✅にすることは絶対にしない（書類残りの見逃し防止）。
//
// 方式: 出荷コード（HTML）から純関数を実コード抽出して評価する。
//       テストと出荷コードのドリフトを防ぐ（repo既存テストと同一方式）。
//
// 実行: node scripts/test-cmsoufu-chushi-pending.js

const fs = require('fs');
const path = require('path');

const CM_FILE = 'ケアマネ送付チェックリスト.html';
const CM = fs.readFileSync(path.join(__dirname, '..', CM_FILE), 'utf8');

// 出荷HTMLから純関数を抽出（未移植なら RED）
function extractFn(html, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm');
  const m = html.match(re);
  if (!m) throw new Error(`${CM_FILE} に ${name}() が無い（未移植＝RED）`);
  return m[0];
}

const FN_NAMES = [
  'soufuNormLastUseDate',   // 既存（再利用）
  'isMeasureMonth',         // 既存（再利用）
  'getCheckItems',          // 既存（再利用）
  'soufuChushiDocItems',
  'soufuLastUseMonth',
  'soufuIsChushiUser',
  'soufuIsChushiPendingTarget',
  'soufuChushiDeadline',
  'soufuDeadlineState',
  'soufuFormatDeadlineLabel',
  'soufuResolvePlanStart',
  'soufuMeasureState'
];

function loadFns() {
  const sandbox = {};
  const src = FN_NAMES.map(n => extractFn(CM, n)).join('\n') + '\n' +
              FN_NAMES.map(n => `sandbox.${n} = ${n};`).join('');
  (function () { eval(src); })();
  return sandbox;
}

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: expected=' + e + ' actual=' + a); }
}

let F;
try {
  F = loadFns();
} catch (e) {
  console.log('RED: ' + e.message);
  console.log('RESULT pass=0 fail=1');
  process.exit(1);
}

const {
  soufuLastUseMonth: lastMonth,
  soufuIsChushiUser: isChushi,
  soufuIsChushiPendingTarget: isPending,
  soufuChushiDeadline: deadline,
  soufuDeadlineState: dlState,
  soufuFormatDeadlineLabel: dlLabel,
  soufuResolvePlanStart: resolvePS,
  soufuMeasureState: measureState,
  soufuChushiDocItems: docItems
} = F;

// 項目リストを [key, uncertainなら'?'] の短縮形にして比較しやすくする
const shape = (arr) => arr.map(it => it.key + (it.uncertain ? '?' : ''));

// ===== soufuLastUseMonth: 最終利用日 → 最終利用月 =====
console.log('[soufuLastUseMonth]');
eq(lastMonth('2026-07-21'), '2026-07', 'ISO日付 → 月');
eq(lastMonth('2026/7/21'), '2026-07', 'スラッシュ区切り → 0詰め月');
eq(lastMonth('2026-07-21T00:00:00.000Z'), '2026-07', 'ISO日時 → 月');
eq(lastMonth('2026-12-31'), '2026-12', '年末');
eq(lastMonth(''), '', '空文字 → 空');
eq(lastMonth(null), '', 'null → 空');
eq(lastMonth(undefined), '', 'undefined → 空');
eq(lastMonth('不明'), '', '解釈不能 → 空');

// ===== soufuIsChushiUser: 利用を終えた人か（中止・終了・卒業）=====
// 2026-08-03 社長判断で 終了・卒業 も対象に含めた。書類漏れのリスクは中止と同じため。
// GAS 側の getXxxTargetUsers_ も「終了/中止/卒業」を同一に扱う（cancelled=true）ので基準が揃う。
console.log('[soufuIsChushiUser]');
eq(isChushi({ status: '中止' }), true, 'status=中止');
eq(isChushi({ status: '利用中止' }), true, 'status に中止を含む');
eq(isChushi({ status: '終了' }), true, '終了も対象（2026-08-03 変更）');
eq(isChushi({ status: '利用終了' }), true, 'status に終了を含む');
eq(isChushi({ status: '卒業' }), true, '卒業も対象（2026-08-03 変更）');
eq(isChushi({ status: '' }), false, '稼働中（空）は対象外');
eq(isChushi({}), false, 'status 未定義');
eq(isChushi(null), false, 'null 安全');

// ===== soufuIsChushiPendingTarget: 専用枠に出すか =====
console.log('[soufuIsChushiPendingTarget]');

// ★完了条件の実データ相当ケース: 2026-07-21 に中止した利用者が 8月ビューで専用枠に出る。
//   （このrepoはPUBLICのため利用者名は匿名化する。既存 test-cmsoufu-chushi-filter.js と同方針）
const chushi0721 = { name: '利用者721', status: '中止', lastUseDate: '2026-07-21' };
eq(isPending(chushi0721, '2026-08', false), true,  '7/21中止: 8月ビューで専用枠に出る（書類未完）');
eq(isPending(chushi0721, '2026-09', false), true,  '7/21中止: 9月でも出続ける（月数経過で消えない）');
eq(isPending(chushi0721, '2027-03', false), true,  '7/21中止: 翌年でも出続ける');
eq(isPending(chushi0721, '2026-08', true),  false, '7/21中止: 全✅なら消える');

// 最終利用月 == 表示中ym は通常リスト側（既存動作を変えない）
eq(isPending(chushi0721, '2026-07', false), false, '最終利用月と同月は専用枠に出さない（通常リスト側）');
// 最終利用月より前の月にも出さない（過去月ビューは当時の通常リストで扱う）
eq(isPending(chushi0721, '2026-06', false), false, '最終利用月より前の月には出さない');

// 稼働中は対象外
eq(isPending({ status: '', lastUseDate: '2026-07-21' }, '2026-08', false), false, '稼働中は専用枠に出さない');
// 終了・卒業も対象（2026-08-03 変更）
eq(isPending({ status: '終了', lastUseDate: '2026-07-21' }, '2026-08', false), true, '終了も専用枠に出す');
eq(isPending({ status: '卒業', lastUseDate: '2026-07-21' }, '2026-08', false), true, '卒業も専用枠に出す');
eq(isPending({ status: '終了', lastUseDate: '2026-07-21' }, '2026-08', true), false, '終了でも全✅なら消える');

// 最終利用日が不明な中止者は専用枠に出さない（通常リスト側でフェイルセーフ表示される）
eq(isPending({ status: '中止', lastUseDate: '' }, '2026-08', false), false, '最終利用日が空 → 専用枠に出さない');
eq(isPending({ status: '中止' }, '2026-08', false), false, '最終利用日が無い → 専用枠に出さない');
eq(isPending({ status: '中止', lastUseDate: '不明' }, '2026-08', false), false, '解釈不能 → 専用枠に出さない');

// 月境界・年跨ぎ
eq(isPending({ status: '中止', lastUseDate: '2026-12-31' }, '2027-01', false), true,  '年跨ぎ: 12月中止 → 翌年1月に出る');
eq(isPending({ status: '中止', lastUseDate: '2026-12-31' }, '2026-12', false), false, '年跨ぎ: 12月ビューでは出さない');

// ===== soufuChushiDeadline: 期限＝最終利用月の翌月10日 =====
console.log('[soufuChushiDeadline]');
eq(deadline('2026-07'), '2026-08-10', '7月利用 → 8/10');
eq(deadline('2026-08'), '2026-09-10', '8月利用 → 9/10');
eq(deadline('2026-12'), '2027-01-10', '年跨ぎ: 12月利用 → 翌年1/10');
eq(deadline('2026-01'), '2026-02-10', '1月利用 → 2/10');
eq(deadline(''), '', '空 → 空');
eq(deadline('不明'), '', '解釈不能 → 空');

// ===== soufuDeadlineState: 期限前 / 当日 / 超過 の3状態 =====
console.log('[soufuDeadlineState]');
eq(dlState('2026-08-10', '2026-08-01'), 'before', '期限前');
eq(dlState('2026-08-10', '2026-08-09'), 'before', '期限前日');
eq(dlState('2026-08-10', '2026-08-10'), 'due',    '期限当日（当日までは通常色）');
eq(dlState('2026-08-10', '2026-08-11'), 'over',   '期限翌日 → 超過');
eq(dlState('2026-08-10', '2026-09-01'), 'over',   '大幅超過');
eq(dlState('2027-01-10', '2026-12-31'), 'before', '年跨ぎ: 期限前');
eq(dlState('2026-12-10', '2027-01-05'), 'over',   '年跨ぎ: 超過');
eq(dlState('', '2026-08-11'), '', '期限が空 → 空（判定しない）');

// ===== soufuFormatDeadlineLabel: 表示は「8/10」 =====
console.log('[soufuFormatDeadlineLabel]');
eq(dlLabel('2026-08-10'), '8/10', '8/10 と表示（0詰めしない）');
eq(dlLabel('2027-01-10'), '1/10', '年跨ぎでも月日のみ');
eq(dlLabel('2026-12-10'), '12/10', '2桁月');
eq(dlLabel(''), '', '空 → 空');

// ===== soufuResolvePlanStart: planStart の解決とフォールバック =====
console.log('[soufuResolvePlanStart]');
eq(resolvePS({ planStart: '2026-04' }, { planStart: '2026-01' }),
   { planStart: '2026-04', source: 'measure' }, 'measure 優先');
eq(resolvePS({}, { planStart: '2026-01' }),
   { planStart: '2026-01', source: 'keikakusho' }, 'measure に無ければ getKeikakushoYear へフォールバック');
eq(resolvePS(null, { planStart: '2026-01' }),
   { planStart: '2026-01', source: 'keikakusho' }, 'measure エントリ自体が無い中止者');
eq(resolvePS({}, {}),
   { planStart: '', source: 'unknown' }, 'どこからも取れない → unknown');
eq(resolvePS(null, null),
   { planStart: '', source: 'unknown' }, '両方 null → unknown');
eq(resolvePS({ planStart: '' }, { planStart: '' }),
   { planStart: '', source: 'unknown' }, '空文字は「取れない」扱い');

// ===== soufuMeasureState: 体測対象 yes / no / unknown =====
console.log('[soufuMeasureState]');
// planStart 2026-04・要介護(3ヶ月)・startDate 無し → 既存 isMeasureMonth と同じ結果
eq(measureState('2026-04', '2026-03', '', 'kaigo'), 'yes', 'サイクル該当月 → yes');
eq(measureState('2026-04', '2026-04', '', 'kaigo'), 'no',  'サイクル非該当月 → no');
// ★不明を「不要(no)」に倒さない
eq(measureState('', '2026-08', '', 'kaigo'), 'unknown', 'planStart 不明 → unknown（no に倒さない）');
eq(measureState(null, '2026-08', '', 'shien'), 'unknown', 'planStart null → unknown');
eq(measureState(undefined, '2026-08', '', 'kaigo'), 'unknown', 'planStart undefined → unknown');

// ===== soufuChushiDocItems: 中止者カードの書類項目（不明は「要確認」で必ず残す） =====
console.log('[soufuChushiDocItems]');

// 判定が全部つく要介護の中止者（体測なし・計画書なし・口腔なし）
eq(shape(docItems({
  care: 'kaigo', method: '持参',
  planStartSource: 'measure', measureState: 'no', tsushoState: 'no',
  needsOralPlan: false, hasNewPlan: false, needsHyouka: false
})), ['jisseki', 'bundle', 'sent'], '要介護・全部判定済み → 実績＋送付工程のみ');

// 要支援は通所モニ・支測定が必ず付く（既存 getCheckItems の仕様）
eq(shape(docItems({
  care: 'shien', method: '持参',
  planStartSource: 'measure', measureState: 'no', tsushoState: 'no',
  needsOralPlan: false, hasNewPlan: false, needsHyouka: false
})), ['jisseki', 'monitoring', 'eval', 'bundle', 'sent'], '要支援 → 通所モニ・支測定が付く');

// ★体測が判定不能 → 落とさずに「要確認」で残す
eq(shape(docItems({
  care: 'kaigo', method: '持参',
  planStartSource: 'unknown', measureState: 'unknown', tsushoState: 'no',
  needsOralPlan: false, hasNewPlan: false, needsHyouka: false
})).includes('measure?'), true, '体測 unknown → measure が「要確認」で残る');

eq(shape(docItems({
  care: 'kaigo', method: '持参',
  planStartSource: 'measure', measureState: 'no', tsushoState: 'no',
  needsOralPlan: false, hasNewPlan: false, needsHyouka: false
})).includes('measure'), false, '体測 no → measure は出さない（従来どおり）');

eq(shape(docItems({
  care: 'kaigo', method: '持参',
  planStartSource: 'measure', measureState: 'yes', tsushoState: 'no',
  needsOralPlan: false, hasNewPlan: false, needsHyouka: false
})), ['jisseki', 'measure', 'bundle', 'sent'], '体測 yes → 通常項目として出る（要確認ではない）');

// ★通所計画書は GAS の getTsushoPlans が中止者を返さない＝判定不能 → 「要確認」で残す
eq(shape(docItems({
  care: 'kaigo', method: '持参',
  planStartSource: 'measure', measureState: 'no', tsushoState: 'unknown',
  needsOralPlan: false, hasNewPlan: false, needsHyouka: false
})).includes('tsushoPlan?'), true, '通所計画書 unknown → 「要確認」で残る');

eq(shape(docItems({
  care: 'kaigo', method: '持参',
  planStartSource: 'measure', measureState: 'no', tsushoState: 'no',
  needsOralPlan: false, hasNewPlan: false, needsHyouka: false
})).includes('tsushoPlan'), false, '通所計画書 no → 出さない');

// ★planStart 不明 → 個別計画書・個訓評価も「要確認」で残す（要介護のみ）
const psUnknownKaigo = shape(docItems({
  care: 'kaigo', method: '持参',
  planStartSource: 'unknown', measureState: 'unknown', tsushoState: 'no',
  needsOralPlan: false, hasNewPlan: false, needsHyouka: false
}));
eq(psUnknownKaigo.includes('train?'), true, 'planStart不明 → 個別計画書が「要確認」で残る');
eq(psUnknownKaigo.includes('hyouka?'), true, 'planStart不明 → 個訓評価が「要確認」で残る');

// 要支援は個訓評価の対象外（planStart不明でも hyouka は出さない）
eq(shape(docItems({
  care: 'shien', method: '持参',
  planStartSource: 'unknown', measureState: 'unknown', tsushoState: 'no',
  needsOralPlan: false, hasNewPlan: false, needsHyouka: false
})).includes('hyouka?'), false, '要支援 → planStart不明でも個訓評価は出さない');

// 口腔は includeCancelled=1 で判定できる＝要確認にしない
eq(shape(docItems({
  care: 'kaigo', method: '持参',
  planStartSource: 'measure', measureState: 'no', tsushoState: 'no',
  needsOralPlan: true, hasNewPlan: false, needsHyouka: false
})), ['jisseki', 'oralPlan', 'bundle', 'sent'], '口腔対象 → 通常項目として出る');

// 送付方法別の最終工程は既存 getCheckItems どおり
eq(shape(docItems({
  care: 'kaigo', method: 'FAX',
  planStartSource: 'measure', measureState: 'no', tsushoState: 'no',
  needsOralPlan: false, hasNewPlan: false, needsHyouka: false
})), ['jisseki', 'fax_10page', 'sent'], 'FAX → 10ページ以内＋送信済');

// ★どの組み合わせでも実績(jisseki)は必ず先頭に残る（送付漏れ防止の要）
eq(shape(docItems({
  care: 'shien', method: 'メール',
  planStartSource: 'unknown', measureState: 'unknown', tsushoState: 'unknown',
  needsOralPlan: true, hasNewPlan: false, needsHyouka: false
}))[0], 'jisseki', '実績は常に先頭');

console.log(`RESULT pass=${pass} fail=${fail}`);
if (fail) process.exit(1);
