// 個訓「保留（作れない月）」の実描画＋進捗集計テスト（DOMスタブ・素node／test-kobetsu-grid-dom.js と同方式）
// 実行: node scripts/test-kobetsu-hold-render.js
// 検証:
//   ①セル表示: 保留セルが「⏸保留（理由）」/ 保険未登録だけ「⚠保留（保険未登録・作成不可）」で理由が一目でわかる。
//   ②進捗集計(updateStats): 保留は分母(progressTotal)から外れ、blockedCount に件数が併記される。
//   ③理由6種は BLOCKED_REASONS 定数から供給される（画面ソースに6種が定義されている）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, '個別機能訓練計画書チェック.html'), 'utf8');
const shared = fs.readFileSync(path.join(REPO, 'shared.js'), 'utf8');

function extractFrom(src, name) {
  const sig = 'function ' + name + '(';
  const s = src.indexOf(sig);
  if (s < 0) throw new Error('関数が無い: ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(s, j + 1); } }
}
// 2026-07-31 段階4: renderTable が予定月ベースの判定を呼ぶようになったため、
//   その純関数群も実HTMLから一緒に抽出する（フォールバック側＝planStartベースの検証内容は不変）。
const HTML_FNS = ['renderTable', 'kbYm', 'kbBuildYoteiMap', 'kbYoteiYm', 'kbIsPlanCell', 'kbIsHyoukaCell', 'kbYoteiLabel', 'kobetsuCycleAt', 'getGroup', 'matchesFilter', 'kbBadgeObj', 'kbPlanBadges', 'kbEvalBadges',
  'kbBadgeHtml', 'kbSubmitDue', 'escapeHtml', 'escapeAttr', 'formatMD', 'formatTodayISO', 'blockedIcon', 'blockedLabel', 'updateStats',
  // 2026-07-30: 測定を2ソースの和で見るため renderTable / kbPlanBadges が呼ぶ3関数を追加
  'kbNormKey', 'kbPickSokuteiDate', 'kbSokuteiForCell'];
const SHARED_FNS = ['isPlanMonth', 'isHyoukaMonth', 'isBeforePlanStart'];
const fnSrc = HTML_FNS.map(n => extractFrom(html, n)).join('\n') + '\n' + SHARED_FNS.map(n => extractFrom(shared, n)).join('\n');

// ---- DOMスタブ ----
function el() { return { style: {}, innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains() { return false; } } }; }
const thead = el(), tbody = el();
const ids = {};
['emptyMessage', 'filterBar', 'filterCount', 'totalUsers', 'thisMonthCount', 'progressCount', 'progressTotal',
  'blockedCount', 'hyoukaMonthCount', 'hyoukaDoneCount', 'hyoukaTotalCount'].forEach(id => ids[id] = el());
const sandbox = {
  busy: {},                                  // 段階4: 送信中ロック（この検証では常に空）
  // 月の足し算は yotei-core.js の本物を使う（この画面に複製しない＝単一の正）
  ymAdd: require(require('path').resolve(__dirname, '../gas/yawaragi-board/yotei-core.js')).ymAdd,
  document: {
    querySelector: sel => sel.indexOf('thead') >= 0 ? thead : (sel.indexOf('tbody') >= 0 ? tbody : el()),
    getElementById: id => ids[id] || el()
  },
  console: console, Math: Math, String: String, Date: Date, JSON: JSON, Object: Object, Array: Array,
  Number: Number, parseInt: parseInt, RegExp: RegExp, isNaN: isNaN,
  filterDay: '', filterAmpm: '', filterGroup: '',
  usageGate: {},
  sortUsers: function () {},
  isPending: function () { return false; },
  ensureUsageGate: function () {},
  updateUnsubmittedBadge: function () {},   // 未提出バッジは本テスト対象外
  BLOCKED_REASONS: null,
  state: null
};
sandbox.MONTHS = [];
for (let i = 0; i < 12; i++) { const mm = ((4 - 1 + i) % 12) + 1; sandbox.MONTHS.push({ m: mm, label: mm + '月', nextYear: (4 + i) > 12 }); }
sandbox.window = sandbox;
// BLOCKED_REASONS 定数を画面ソースから注入（定義が実在することの確認も兼ねる）
const brMatch = html.match(/const BLOCKED_REASONS = (\[[^\]]*\]);/);
vm.createContext(sandbox);
vm.runInContext(fnSrc, sandbox);
sandbox.BLOCKED_REASONS = brMatch ? JSON.parse(brMatch[1].replace(/'/g, '"')) : null;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  [FAIL] ' + m); } }

// ===== ③ 理由6種が定義されている =====
ok(!!sandbox.BLOCKED_REASONS && sandbox.BLOCKED_REASONS.length === 6, 'R0: BLOCKED_REASONS が6種');
['保険未登録', '利用継続未確定', '長期休み', '入院・入所', 'ケアマネ未提出', '利用終了・中止']
  .forEach(r => ok(sandbox.BLOCKED_REASONS.indexOf(r) >= 0, 'R0[' + r + '] が含まれる'));

// ===== ① セル表示: ⏸保留（理由）=====
// planStart=2026-04（前月=前年度3月＝範囲外→自セルに計画パートfallback）＋当該月に blocked_reason。
function renderBlocked(reason) {
  const U = { userId: 'B', name: 'ホル田', furigana: 'ハ', category: '要介護1', planStart: '2026-04', planMonths: 3, days: '月', ampm: '午前' };
  sandbox.state = { fiscalYear: 2026, users: [U], records: { 'B_2026_4': { blocked_reason: reason } }, isLoading: false, includeCancelled: false, needsActionOnly: false };
  sandbox.renderTable();
  return tbody.innerHTML;
}
const outMitei = renderBlocked('長期休み');
ok(outMitei.indexOf('⏸保留（長期休み）') >= 0, 'D1: 保留セルに「⏸保留（長期休み）」＝理由が一目でわかる');
// 2026-08-01 ラベル文言変更（案A）: 前月が範囲外の計画月は「▶ 4月分を準備」。
ok(outMitei.indexOf('▶ 4月分を準備') >= 0, 'D1b: 計画サイクルタグは維持（保留でも計画月表示は残す）');
const outHoken = renderBlocked('保険未登録');
// 2026-07-26 表示ラベル変更: stored は "保険未登録" のまま／画面表示だけ「保険未登録・作成不可」（blockedLabel）。
ok(outHoken.indexOf('⚠保留（保険未登録・作成不可）') >= 0, 'D2: 保険未登録は⚠アイコンで「⚠保留（保険未登録・作成不可）」表示');
const outMitei2 = renderBlocked('入院・入所');
ok(outMitei2.indexOf('⏸保留（入院・入所）') >= 0, 'D3: 追加理由(入院・入所)も⏸で理由表示');

// ===== ② 進捗集計: 保留は分母から外れ、blockedCount に併記 =====
// updateStats は実行日の当月(new Date)を見る。planStart=当月にして isPlanMonth を確実に真にする。
const now = new Date();
const ny = now.getFullYear(), nm = now.getMonth() + 1;
const curS = ny + '-' + String(nm).padStart(2, '0');
const mk = (id, name) => ({ userId: id, name: name, furigana: 'ア', category: '要介護1', planStart: curS, planMonths: 3, days: '月', ampm: '午前' });
const su = {};
su[mk('N', '未作子').userId] = null;
sandbox.state = {
  fiscalYear: (nm >= 4 ? ny : ny - 1),
  users: [mk('N', '未作子'), mk('D', '作成太'), mk('BL', '保留花')],
  records: {
    ['D_' + ny + '_' + nm]: { keikaku_date: curS + '-05' },        // 作成済
    ['BL_' + ny + '_' + nm]: { blocked_reason: '長期休み' }          // 保留
    // N は記録なし＝未作成
  },
  isLoading: false, includeCancelled: false, needsActionOnly: false
};
sandbox.updateStats();
ok(ids.progressTotal.textContent === 2, 'S1: 分母(progressTotal)=2（保留は分母から除外／未作子＋作成太のみ）');
ok(ids.progressCount.textContent === 1, 'S2: 作成済(progressCount)=1（作成太のみ）');
ok(ids.blockedCount.textContent === 1, 'S3: 保留(blockedCount)=1件が併記される');
ok(ids.thisMonthCount.textContent === 2, 'S4: 今月計画該当も保留を除いた2名');

console.log('個訓 保留(作れない月) 描画＋集計: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
