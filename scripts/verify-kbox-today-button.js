// 欠席box「今日」ボタン TDDハーネス（2026-07-08）
// 目的: Phase3アラートの日付タップで過去日へ飛べるが、今日へ戻る手段が◀▶連打かピッカーのみ＝片道切符。
//       日付帯に「今日」ボタンを足して往復可能にする。表示と日付移動のみ・書込ゼロ・GAS非接触。
//
// ★新規経路を作らない: 今日へ戻すのは既存 kbJumpTo(jstTodayStr()) を呼ぶだけ。
//   kbState.viewDate への直接代入や、独自の再描画呼び出しを新設しない（Phase2/Phase3の経路と一本化）。
// ★描画は既存 kbRenderChrome_ に相乗り（新しい描画関数を作らない）。今日ビューでは押しても意味が無いので無効化。
// ★要素不在ガード: #kbox-today が無くても kbRenderChrome_ は落ちない（f774228型の回避）。
// ★既存の当日ビュー限定アラート表示を壊さない（今日ビューで出る／過去日ビューで出ない）。
//
// 実行: node scripts/verify-kbox-today-button.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

function extractFn(name, optional) {
  let start = html.indexOf('function ' + name + '(');
  if (start < 0) { if (optional) return ''; throw new Error('function ' + name + '( が無い'); }
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  for (let j = braceStart; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}
// #kbox-datenav の中身（日付帯）だけを切り出す
function dateNavHtml() {
  const s = html.indexOf('id="kbox-datenav"');
  if (s < 0) throw new Error('#kbox-datenav が無い');
  const e = html.indexOf('</div>', s);
  return html.slice(s, e);
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  [PASS] ' + label); } else { fail++; console.log('  [FAIL] ' + label); } }
function okSafe(thunk, label) { try { ok(!!thunk(), label); } catch (e) { fail++; console.log('  [FAIL] ' + label + '  «' + (e && e.message) + '»'); } }

// ================= K) 構造（日付帯に「今日」ボタン・既存経路のみ） =================
console.log('■ K) 構造（日付帯に「今日」ボタン・既存経路を流用）');

okSafe(() => /id="kbox-today"/.test(dateNavHtml()),
  'K1(★構造): 日付帯 #kbox-datenav の中に #kbox-today がある（ピッカー等と同じ帯）');
okSafe(() => /id="kbox-today"[^>]*onclick="kbGoToday\(\)"/.test(dateNavHtml()) ||
             /onclick="kbGoToday\(\)"[^>]*id="kbox-today"/.test(dateNavHtml()),
  'K2(★構造): 「今日」ボタンは kbGoToday() を呼ぶ（インラインで独自処理を書かない）');
okSafe(() => />\s*今日\s*<\/button>/.test(dateNavHtml()),
  'K3: ボタン文言は「今日」（出席予定タブの att-today-btn と同じ語）');

okSafe(() => {
  const src = extractFn('kbGoToday');
  return /kbJumpTo\(\s*jstTodayStr\(\)\s*\)/.test(src);
}, 'K4(★新規経路なし): kbGoToday は kbJumpTo(jstTodayStr()) を呼ぶ（既存経路を流用）');
okSafe(() => {
  const src = extractFn('kbGoToday');
  // viewDate 直書き・独自再描画の新設を禁じる（経路の二重化＝ちらつき/巻き戻りの温床）
  return !/kbState\s*\.\s*viewDate\s*=/.test(src) &&
         !/kbRenderForDate\(/.test(src) && !/kbRenderDayNow_\(/.test(src) && !/kbRender\(/.test(src);
}, 'K5(★新規経路なし): kbGoToday は viewDate 直書きも独自再描画もしない（kbJumpTo に一本化）');

// ================= L) 実駆動（今日へ戻る） =================
console.log('■ L) 実駆動（「今日」ボタン押下で今日のビューへ戻る）');

function todayEnv(viewDate) {
  const calls = [];
  const env = {
    kbState: { viewDate: viewDate },
    jstTodayStr: () => '2026-07-08',
    kbRenderForDate: (d) => { calls.push(['kbRenderForDate', d]); },
    fetch: () => { calls.push(['fetch']); },
  };
  env.__calls = calls;
  return env;
}
const TODAY_FNS = ['kbJumpTo', 'kbGoToday'];
function bindToday(env) {
  const src = TODAY_FNS.map(n => extractFn(n, true)).filter(Boolean).join('\n\n');
  const keys = Object.keys(env).filter(k => k.indexOf('__') !== 0);
  const body = src + '\n\nreturn {' + TODAY_FNS.map(n => n + ': (typeof ' + n + '!=="undefined")?' + n + ':undefined').join(', ') + '};';
  return new Function(...keys, body)(...keys.map(k => env[k]));
}

okSafe(() => {
  const env = todayEnv('2026-07-03');            // アラートから飛んだ過去日にいる
  const h = bindToday(env);
  h.kbGoToday();
  return env.kbState.viewDate === '2026-07-08';
}, 'L1(★): 過去日(7/3)から「今日」を押すと viewDate が今日(7/8)に戻る');
okSafe(() => {
  const env = todayEnv('2026-07-03');
  const h = bindToday(env);
  h.kbGoToday();
  return env.__calls.some(c => c[0] === 'kbRenderForDate' && c[1] === '2026-07-08');
}, 'L2(★既存経路): 再描画は kbJumpTo→kbRenderForDate 経由（新規描画経路を通らない）');
okSafe(() => {
  const env = todayEnv('2026-07-08');            // 既に今日
  const h = bindToday(env);
  h.kbGoToday();
  return env.kbState.viewDate === '2026-07-08';
}, 'L3: 今日にいるときに押しても今日のまま（冪等・壊れない）');
okSafe(() => {
  const env = todayEnv('2026-07-03');
  const h = bindToday(env);
  h.kbGoToday();
  return !env.__calls.some(c => c[0] === 'fetch');
}, 'L4(★★書込ゼロ): kbGoToday は fetch を呼ばない');
okSafe(() => {
  const src = extractFn('kbGoToday');
  return !/send_box_cm_mails|recordPastContact|updateAbsenceCmNotified|method:\s*.POST/.test(src);
}, 'L5(★★書込ゼロ): kbGoToday に 送信/記録action が無い（POSTを一切行わない）');

// ================= M) 描画（今日ビューでは無効化・既存chromeに相乗り） =================
console.log('■ M) 描画 kbRenderChrome_（今日ビューでは「今日」ボタンを無効化）');

// ★disabled の初期値は 'UNSET'。false で初期化すると「chromeが何もしなくてもM2/M3が通る」空虚な合格になる。
//   chrome が明示的に真偽値を書いたことまで検証する。
function makeEl(id) { return { id, innerHTML: '', textContent: '', value: '', style: {}, disabled: 'UNSET' }; }
function chromeEnv(opts) {
  const o = opts || {};
  const els = {};
  const ids = o.ids || ['kbox-datepicker', 'kbox-datelabel', 'kbox-viewonly-banner', 'kbox-unnotified-alert', 'kbox-today'];
  ids.forEach(i => els[i] = makeEl(i));
  const calls = [];
  const env = {
    document: { getElementById: id => els[id] || null },
    kbState: { viewDate: o.viewDate || '2026-07-08', forward: [] },
    attMonthAbsCache: ('cache' in o) ? o.cache : { '2026-07': (o.month || []) },
    kbUnnotifiedFailed_: false,
    fetch: () => { calls.push(['fetch']); },
  };
  env.__els = els; env.__calls = calls;
  return env;
}
const CHROME_FNS = ['kbAddDaysYMD_', 'kbBizDaysAgo_', 'kbPastContactEligible_', 'kbIsDoneInline_', 'kbEsc_', 'kbFmtChip_',
  'kbUnnotifiedMonths_', 'kbUnnotifiedRangeLoaded_', 'kbUnnotifiedInRange_', 'kbRenderUnnotifiedAlert_', 'kbRenderChrome_'];
function bindChrome(env) {
  const src = CHROME_FNS.map(n => extractFn(n, true)).filter(Boolean).join('\n\n');
  const keys = Object.keys(env).filter(k => k.indexOf('__') !== 0);
  const body = src + '\n\nreturn {' + CHROME_FNS.map(n => n + ': (typeof ' + n + '!=="undefined")?' + n + ':undefined').join(', ') + '};';
  return new Function(...keys, body)(...keys.map(k => env[k]));
}
function abs(name, date, cmNotified) { return { name, date, unit: '午後', cmNotified: cmNotified || '' }; }

okSafe(() => {
  const env = chromeEnv({ viewDate: '2026-07-08', month: [] });
  bindChrome(env).kbRenderChrome_('2026-07-08', '2026-07-08', true);
  return env.__els['kbox-today'].disabled === true;
}, 'M1(★): 今日を表示中は「今日」ボタンが無効（押しても意味がない）');
okSafe(() => {
  const env = chromeEnv({ viewDate: '2026-07-03', month: [] });
  bindChrome(env).kbRenderChrome_('2026-07-03', '2026-07-08', false);
  return env.__els['kbox-today'].disabled === false;
}, 'M2(★): 過去日を表示中は「今日」ボタンが有効（戻れる＝片道切符を解消）');
okSafe(() => {
  const env = chromeEnv({ viewDate: '2026-07-09', month: [] });
  bindChrome(env).kbRenderChrome_('2026-07-09', '2026-07-08', false);
  return env.__els['kbox-today'].disabled === false;
}, 'M3: 未来日を表示中も「今日」ボタンが有効');
okSafe(() => {
  // 要素不在ガード: #kbox-today を持たないDOMでも落ちない
  const env = chromeEnv({ viewDate: '2026-07-08', month: [], ids: ['kbox-datepicker', 'kbox-datelabel', 'kbox-viewonly-banner', 'kbox-unnotified-alert'] });
  bindChrome(env).kbRenderChrome_('2026-07-08', '2026-07-08', true);
  return true;
}, 'M4(★要素不在ガード): #kbox-today が無くても kbRenderChrome_ は落ちない');

// ================= N) 既存挙動を壊さない（当日ビュー限定アラート） =================
console.log('■ N) 既存挙動の回帰固定（アラートの当日ビュー限定表示）');

okSafe(() => {
  const env = chromeEnv({ viewDate: '2026-07-08', month: [abs('未連絡太郎', '2026-07-06')] });
  bindChrome(env).kbRenderChrome_('2026-07-08', '2026-07-08', true);
  return env.__els['kbox-unnotified-alert'].innerHTML.indexOf('連絡未 1件') >= 0;
}, 'N1: 今日ビューでは未連絡アラートが出る（今日ボタン追加で壊れていない）');
okSafe(() => {
  const env = chromeEnv({ viewDate: '2026-07-03', month: [abs('未連絡太郎', '2026-07-06')] });
  bindChrome(env).kbRenderChrome_('2026-07-03', '2026-07-08', false);
  return env.__els['kbox-unnotified-alert'].innerHTML === '';
}, 'N2: 過去日ビューでは未連絡アラートを出さない（既存の当日ビュー限定を維持）');
okSafe(() => {
  const env = chromeEnv({ viewDate: '2026-07-08', month: [abs('未連絡太郎', '2026-07-06')] });
  bindChrome(env).kbRenderChrome_('2026-07-08', '2026-07-08', true);
  return !env.__calls.some(c => c[0] === 'fetch');
}, 'N3(★★書込ゼロ/描画純粋): chrome 描画は fetch を呼ばない（今日ボタン追加後も）');
okSafe(() => {
  const chrome = extractFn('kbRenderChrome_');
  return !/fetch\(|attEnsureMonthAbsences|send_box_cm_mails|recordPastContact/.test(chrome);
}, 'N4(★非接触): kbRenderChrome_ に fetch も ensure も 送信/記録action も無い');

// ================= O) 非接触（本数不変） =================
console.log('■ O) 非接触（本数不変・親815dd3e/版-35と同値）');
okSafe(() => (html.match(/send_box_cm_mails/g) || []).length === 1, 'O1(★): send_box_cm_mails は1箇所のまま');
okSafe(() => (html.match(/gnbGuardProdWrite/g) || []).length === 13, 'O2(★): gnbGuardProdWrite は13本のまま');
// ★実POST本数で固定（総出現数はコメント増減で脆い＝範囲拡大でコメントが増え6になった）。記録POST新設だけを落とす。
okSafe(() => (html.match(/action:\s*'recordPastContact'/g) || []).length === 1, 'O3(★): recordPastContact の実POSTは1本のまま');
okSafe(() => (html.match(/updateAbsenceCmNotified/g) || []).length === 3, 'O4(★): updateAbsenceCmNotified は3のまま');
okSafe(() => (html.match(/attGoToday/g) || []).length === 2, 'O5(★非接触): 出席予定タブの attGoToday は無改変（定義1+呼出1）');

console.log('\n実測ハーネス(today-button): ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
