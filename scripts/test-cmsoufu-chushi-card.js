// test-cmsoufu-chushi-card.js
// 「⚠️ 中止者・書類未完了」専用枠の**配線**テスト（カード構築＋描画）。
//
// 純関数の判定そのものは test-cmsoufu-chushi-pending.js が見る。こちらは統合面を見る:
//   ① チェックチップの data-target-ym が「最終利用月」になっている
//      → 既存の check-main ハンドラがそのまま progress[最終利用月][氏名] に読み書きする
//      ＝「7月ビューで付けた✅」と「8月ビューの専用枠の✅」が同期する（仕様§2）
//   ② 最終利用月のキーで既に全部✅なら、カードが消える
//   ③ 判定できない項目は ❓（要確認）で必ず残り、done に数えない（自動✅に倒さない・仕様§5）
//
// ★ネットワークは一切使わない（本番GASを叩かない）。allData をこちらで与える。
// ★このrepoはPUBLICのため利用者名は匿名化する。
//
// 実行: node scripts/test-cmsoufu-chushi-card.js

const fs = require('fs');
const path = require('path');

const CM_FILE = 'ケアマネ送付チェックリスト.html';
const CM = fs.readFileSync(path.join(__dirname, '..', CM_FILE), 'utf8');

function extractFn(html, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm');
  const m = html.match(re);
  if (!m) throw new Error(`${CM_FILE} に ${name}() が無い（未移植＝RED）`);
  return m[0];
}

// 出荷コードから実物を持ってくる関数
const REAL = [
  'soufuNormLastUseDate', 'isMeasureMonth', 'getCheckItems', 'resolveSoufu',
  'monthShort', 'escapeHtml', 'escapeAttr',
  'soufuLastUseMonth', 'soufuIsChushiUser', 'soufuIsChushiPendingTarget',
  'soufuChushiDeadline', 'soufuDeadlineState', 'soufuFormatDeadlineLabel',
  'soufuResolvePlanStart', 'soufuMeasureState', 'soufuChushiDocItems',
  'soufuYearDataFor', 'soufuMonthDataFor',
  'buildChushiPendingCards', 'renderChushiPendingSection'
];

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: expected=' + e + ' actual=' + a); }
}
function ok(cond, label) { eq(!!cond, true, label); }

// ===== 環境スタブ（ネットワーク・DOMは持たない） =====
function makeEnv(opts) {
  const store = { progress: JSON.parse(JSON.stringify(opts.progress || {})) };
  const env = {
    // shared.js 由来（この枠のテスト対象外なので固定値で振る舞いを決める）
    isPlanMonth: () => opts.isPlanMonth === true,
    isHyoukaMonth: () => opts.isHyoukaMonth === true,
    monitoringFinalEvalMonth: () => opts.finalEvalMonth || '',
    // localStorage は使わず progress を直接返す（loadProgress のマイグレーションは対象外）
    loadProgress: () => JSON.parse(JSON.stringify(store.progress)),
    // 表示月セレクタだけを持つ最小 document
    document: {
      getElementById: (id) => (id === 'monthSel' ? { value: opts.displayYm } : null)
    },
    console: { error: () => {}, warn: () => {} },
    allData: opts.allData
  };
  return env;
}

function loadInto(env) {
  const src = REAL.map(n => extractFn(CM, n)).join('\n') + '\n'
            + 'return {' + REAL.map(n => `${n}:${n}`).join(',') + '};';
  const keys = Object.keys(env);
  const fn = new Function(...keys, src);
  return fn(...keys.map(k => env[k]));
}

// ===== 共通フィクスチャ =====
// 2026-07-21 に中止した要介護の利用者（実名は伏せる）。8月ビューで専用枠に出るはず。
const USER = { name: '利用者721', furigana: 'りようしゃ', care: 'kaigo', cmOffice: 'テスト居宅', status: '中止', lastUseDate: '2026-07-21' };

function baseAllData(extra) {
  return Object.assign({
    users: [USER],
    measure: [{ name: '利用者721', planStart: '2026-04', startDate: '2025-04' }],
    contacts: [{ office: 'テスト居宅', method: '持参' }],
    // 月別キャッシュ: 口腔と通所計画書を持つ（どちらも includeCancelled=1 で取得したもの）
    chushiMonth: {
      '2026-07': {
        oral: { ok: true, plans: [], unsent: [] },
        tsusho: { ok: true, plans: [], unsent: [] }
      }
    },
    chushiYear: { 2026: { ok: true, keikakushoUsers: [], keikakushoRecords: [], monitoringUsers: [] } },
    oralPlansAll: { plans: [], unsent: [] },
    tsushoPlansAll: { plans: [], unsent: [] },
    keikakushoUsersAll: [], keikakushoRecords: [],
    monitoringAll: { users: [], records: [] }
  }, extra || {});
}

let F;
try {
  F = loadInto(makeEnv({ displayYm: '2026-08', allData: baseAllData(), progress: {} }));
} catch (e) {
  console.log('RED: ' + e.message);
  console.log('RESULT pass=0 fail=1');
  process.exit(1);
}

// ===== ① 8月ビューでカードが出る／チップの data-target-ym は最終利用月 =====
console.log('[① カード生成と月キーの配線]');
{
  const env = makeEnv({ displayYm: '2026-08', allData: baseAllData(), progress: {} });
  const f = loadInto(env);
  const cards = f.buildChushiPendingCards('2026-08');
  eq(cards.length, 1, '7/21中止の利用者が8月ビューでカードになる');
  eq(cards[0].lastUseMonth, '2026-07', '最終利用月は 2026-07');
  eq(cards[0].deadline, '2026-08-10', '期限は翌月10日');
  eq(cards[0].deadlineLabel, '8/10', '期限ラベルは 8/10');
  ok(cards[0].total > 0, '書類項目が1件以上ある');
  eq(cards[0].done, 0, '未チェックなので done=0');

  const html = f.renderChushiPendingSection('2026-08');
  ok(html.indexOf('中止・終了者の書類未完了') >= 0, '専用枠のヘッダが描画される（終了も含む表記）');
  ok(html.indexOf('利用者721') >= 0, '氏名が描画される');
  // ★ここが同期の要: data-target-ym が表示月(2026-08)ではなく最終利用月(2026-07)
  ok(html.indexOf('data-target-ym="2026-07"') >= 0, 'チップの data-target-ym が最終利用月');
  eq(html.indexOf('data-target-ym="2026-08"'), -1, '表示月のキーでは書き込まない');
  ok(html.indexOf('期限 8/10') >= 0, '期限バッジが出る');
}

// ===== ② 最終利用月のキーで全部✅ → カードが消える（＝7月ビューの✅と同期） =====
console.log('[② 全✅で消える（進捗キーの同期）]');
{
  // まず項目キーを取得
  const probe = loadInto(makeEnv({ displayYm: '2026-08', allData: baseAllData(), progress: {} }));
  const keys = probe.buildChushiPendingCards('2026-08')[0].items
    .filter(it => !it.serverDriven).map(it => it.key);

  // 最終利用月(2026-07)のキーで全部✅にする
  const allChecked = { '2026-07': { '利用者721': {} } };
  keys.forEach(k => { allChecked['2026-07']['利用者721'][k] = true; });
  const f2 = loadInto(makeEnv({ displayYm: '2026-08', allData: baseAllData(), progress: allChecked }));
  eq(f2.buildChushiPendingCards('2026-08').length, 0, '2026-07 のキーで全✅ → カードが消える');
  eq(f2.renderChushiPendingSection('2026-08'), '', '専用枠ごと描画されない');

  // 表示月(2026-08)のキーに付けても消えない＝月キーを取り違えていない
  const wrongMonth = { '2026-08': { '利用者721': {} } };
  keys.forEach(k => { wrongMonth['2026-08']['利用者721'][k] = true; });
  const f3 = loadInto(makeEnv({ displayYm: '2026-08', allData: baseAllData(), progress: wrongMonth }));
  eq(f3.buildChushiPendingCards('2026-08').length, 1, '表示月のキーに付けても消えない（月キー取り違えの検出）');
}

// ===== ③ 判定できない項目は ❓ で残り done に数えない =====
console.log('[③ 要確認（自動✅に倒さない）]');
{
  // planStart がどこからも取れない中止者
  const noPlanStart = baseAllData({ measure: [] });
  const f = loadInto(makeEnv({ displayYm: '2026-08', allData: noPlanStart, progress: {} }));
  const card = f.buildChushiPendingCards('2026-08')[0];
  const uncertain = card.items.filter(it => it.uncertain).map(it => it.key);
  ok(uncertain.indexOf('measure') >= 0, 'planStart不明 → 体測が要確認で残る');
  ok(uncertain.indexOf('train') >= 0, 'planStart不明 → 個別計画書が要確認で残る');
  eq(card.items.filter(it => it.uncertain && it.done).length, 0, '要確認は done に数えない');

  const html = f.renderChushiPendingSection('2026-08');
  ok(html.indexOf('❓') >= 0, '要確認は ❓ アイコンで描画される');
  ok(html.indexOf('（要確認）') >= 0, '要確認のラベルが付く');
  // ★要確認項目が「消えて完了扱い」になっていないこと
  ok(card.total > card.done, '要確認がある限り未完了のまま（勝手に完了しない）');
}

// ===== ③-b 通所計画書は実データで判定する（GAS@364 で includeCancelled 対応済み） =====
console.log('[③-b 通所計画書の実データ判定]');
{
  // 記録が無い → 不要（要確認にしない）
  const noRec = loadInto(makeEnv({ displayYm: '2026-08', allData: baseAllData(), progress: {} }));
  const c1 = noRec.buildChushiPendingCards('2026-08')[0];
  eq(c1.items.filter(it => it.key === 'tsushoPlan').length, 0, '記録が無ければ通所計画書は出さない（不要と判定できる）');

  // 記録がある → 必要（通常項目・要確認ではない）
  const withRec = baseAllData({
    chushiMonth: { '2026-07': {
      oral: { ok: true, plans: [], unsent: [] },
      tsusho: { ok: true, plans: [{ userId: '利用者721', cancelled: true }], unsent: [] }
    } }
  });
  const c2 = loadInto(makeEnv({ displayYm: '2026-08', allData: withRec, progress: {} })).buildChushiPendingCards('2026-08')[0];
  const t2 = c2.items.find(it => it.key === 'tsushoPlan');
  ok(!!t2, '記録があれば通所計画書が出る');
  eq(t2 && t2.uncertain, false, 'その場合は要確認ではなく通常項目');

  // ★データが取れない → 最終フォールバックとして要確認（不明→自動✅は禁止）
  const noData = baseAllData({
    chushiMonth: { '2026-07': { oral: { ok: true, plans: [], unsent: [] }, tsusho: null } }
  });
  const c3 = loadInto(makeEnv({ displayYm: '2026-08', allData: noData, progress: {} })).buildChushiPendingCards('2026-08')[0];
  const t3 = c3.items.find(it => it.key === 'tsushoPlan');
  ok(!!t3, 'データ取得失敗時は通所計画書を残す');
  eq(t3 && t3.uncertain, true, 'その場合だけ要確認になる（最終フォールバック）');
}

// ===== ④ 対象外の条件（純追加であることの担保） =====
console.log('[④ 出さない条件]');
{
  const activeUser = baseAllData({ users: [Object.assign({}, USER, { status: '' })] });
  eq(loadInto(makeEnv({ displayYm: '2026-08', allData: activeUser, progress: {} }))
      .buildChushiPendingCards('2026-08').length, 0, '稼働中は出さない');

  // 2026-08-03 変更: 終了・卒業も対象に含める
  const endedUser = baseAllData({ users: [Object.assign({}, USER, { status: '終了' })] });
  eq(loadInto(makeEnv({ displayYm: '2026-08', allData: endedUser, progress: {} }))
      .buildChushiPendingCards('2026-08').length, 1, '終了も出す');

  const gradUser = baseAllData({ users: [Object.assign({}, USER, { status: '卒業' })] });
  eq(loadInto(makeEnv({ displayYm: '2026-08', allData: gradUser, progress: {} }))
      .buildChushiPendingCards('2026-08').length, 1, '卒業も出す');

  const sameMonth = baseAllData();
  eq(loadInto(makeEnv({ displayYm: '2026-07', allData: sameMonth, progress: {} }))
      .buildChushiPendingCards('2026-07').length, 0, '最終利用月と同月ビューでは出さない（通常リスト側）');

  const noLastUse = baseAllData({ users: [Object.assign({}, USER, { lastUseDate: '' })] });
  eq(loadInto(makeEnv({ displayYm: '2026-08', allData: noLastUse, progress: {} }))
      .buildChushiPendingCards('2026-08').length, 0, '最終利用日が空なら出さない（通常リスト側でフェイルセーフ表示）');

  const noUsers = baseAllData({ users: [] });
  eq(loadInto(makeEnv({ displayYm: '2026-08', allData: noUsers, progress: {} }))
      .renderChushiPendingSection('2026-08'), '', '対象0名なら枠ごと出さない');
}

console.log(`RESULT pass=${pass} fail=${fail}`);
if (fail) process.exit(1);
