// Phase3 未連絡アラート TDDハーネス（2026-07-08）
// 目的: 今日のboxを開いたとき、第3営業日以内に未連絡が残っていれば上部に警告を出し、
//       タップでその日へ飛べるようにする。連絡漏れに「気づく」仕組みの本体。
//
// ★★最重要（誤陰性ゼロ）: 未連絡があるのに「0件」と見せない。
//   データ未取得/失敗を「0件」と断定しない。0件と断定できるのは必要月がすべて揃ったときだけ。
//   アラートの見落とし（誤陰性）が最悪の失敗。
//
// ★核心の罠（spec調査⑥）: kbRender は今日の欠席0人で早期returnする。
//   アラートを末尾に置くと「今日0人・過去に未連絡あり」の日に一切出ない＝肝心な日に出ない。
//   soアラートは kbRenderChrome_ 内（早期returnより前）に描く。これを回帰テストで固定する。
//
// ★流用（新規判定を作らない）: kbPastContactEligible_（第3営業日・過去日のみ・境界含む）
//                              kbIsDoneInline_（done値の網羅）
//
// ★書込ゼロ: send_box_cm_mails / recordPastContact / updateAbsenceCmNotified を呼ばない。
//
// 実行: node scripts/verify-kbox-unnotified-alert.js
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

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  [PASS] ' + label); } else { fail++; console.log('  [FAIL] ' + label); } }
function okSafe(thunk, label) { try { ok(!!thunk(), label); } catch (e) { fail++; console.log('  [FAIL] ' + label + '  «' + (e && e.message) + '»'); } }

// 純関数群を素の環境に束縛（依存: kbBizDaysAgo_ / kbPastContactEligible_ / kbIsDoneInline_）
const PURE = ['kbAddDaysYMD_', 'kbBizDaysAgo_', 'kbPastContactEligible_', 'kbIsDoneInline_',
  'kbUnnotifiedMonths_', 'kbUnnotifiedRangeLoaded_', 'kbUnnotifiedInRange_'];
function pure() {
  const src = PURE.map(n => extractFn(n, true)).filter(Boolean).join('\n\n');
  const body = src + '\n\nreturn {' + PURE.map(n => n + ': (typeof ' + n + '!=="undefined")?' + n + ':undefined').join(', ') + '};';
  return new Function(body)();
}

// 欠席1件を作る（cmNotified 未指定＝未連絡）
function abs(name, date, cmNotified) { return { name, date, unit: '午後', cmNotified: cmNotified || '' }; }

// ================= A) 必要月（★月跨ぎ・今日の月が入らないケース） =================
console.log('■ A) kbUnnotifiedMonths_（集計に必要な月・月跨ぎ）');
okSafe(() => {
  const p = pure();
  return JSON.stringify(p.kbUnnotifiedMonths_('2026-07-08')) === JSON.stringify(['2026-07']);
}, 'A1: 7/8 → 必要月は当月のみ（7/3〜7/7）');
okSafe(() => {
  const p = pure();
  return JSON.stringify(p.kbUnnotifiedMonths_('2026-08-03')) === JSON.stringify(['2026-07', '2026-08']);
}, 'A2(★月跨ぎ): 8/3(月) → 前月7月が必要（7/29〜7/31を含む）');
okSafe(() => {
  const p = pure();
  return JSON.stringify(p.kbUnnotifiedMonths_('2026-08-05')) === JSON.stringify(['2026-07', '2026-08']);
}, 'A3(★月跨ぎ): 8/5(水) → まだ前月7/31が対象内');
okSafe(() => {
  const p = pure();
  return JSON.stringify(p.kbUnnotifiedMonths_('2026-08-06')) === JSON.stringify(['2026-08']);
}, 'A4: 8/6(木) → 当月のみに戻る（境界）');
okSafe(() => {
  const p = pure();
  // 9/1(火) の対象日は 8/27〜8/31 のみ＝「今日の月(2026-09)」は必要月に入らない
  return JSON.stringify(p.kbUnnotifiedMonths_('2026-09-01')) === JSON.stringify(['2026-08']);
}, 'A5(★★): 今日の月が必要月に入らないことがある（9/1→8月のみ）＝"今日の月だけ見る"実装は誤り');
okSafe(() => {
  const p = pure();
  return JSON.stringify(p.kbUnnotifiedMonths_('2026-03-02')) === JSON.stringify(['2026-02', '2026-03']);
}, 'A6(★月跨ぎ・うるう年): 3/2 → 2月が必要');

// ================= B) 充填判定（★0件と「まだ分からない」を混同しない） =================
console.log('■ B) kbUnnotifiedRangeLoaded_（必要月がすべて揃ったか）');
okSafe(() => {
  const p = pure();
  return p.kbUnnotifiedRangeLoaded_('2026-07-08', { '2026-07': [] }) === true;
}, 'B1: 必要月が揃っていればtrue（空配列[]も"取得成功・0件"の正当な値）');
okSafe(() => {
  const p = pure();
  return p.kbUnnotifiedRangeLoaded_('2026-07-08', {}) === false;
}, 'B2(★★): 未取得ならfalse＝「0件」と断定しない');
okSafe(() => {
  const p = pure();
  return p.kbUnnotifiedRangeLoaded_('2026-08-03', { '2026-08': [] }) === false;
}, 'B3(★★月跨ぎ): 当月だけ揃っていても前月が無ければfalse（前月の未連絡を見落とさない）');
okSafe(() => {
  const p = pure();
  return p.kbUnnotifiedRangeLoaded_('2026-08-03', { '2026-07': [], '2026-08': [] }) === true;
}, 'B4(★月跨ぎ): 2ヶ月とも揃えばtrue');
okSafe(() => {
  const p = pure();
  return p.kbUnnotifiedRangeLoaded_('2026-07-08', { '2026-07': undefined }) === false;
}, 'B5(★): キーがあってもundefinedなら未取得扱い（失敗時にcacheを埋めない実装と整合）');

// ================= C) 集計（★手段に関わらず・doneは除外・境界） =================
console.log('■ C) kbUnnotifiedInRange_（未連絡の集計）');
okSafe(() => {
  const p = pure();
  const pool = [abs('A', '2026-07-07'), abs('B', '2026-07-07'), abs('C', '2026-07-06')];
  const r = p.kbUnnotifiedInRange_(pool, '2026-07-08');
  return r.count === 3 && JSON.stringify(r.dates) === JSON.stringify(['2026-07-06', '2026-07-07']);
}, 'C1(★): 人数合計とdistinct昇順の日付を返す');
okSafe(() => {
  const p = pure();
  // 手段に関わらず未連絡は全部数える（メール派未送信・電話派未押下）
  const pool = [abs('A', '2026-07-07', 'メール未送信'), abs('B', '2026-07-07', '要電話連絡'), abs('C', '2026-07-07', 'メールなし')];
  return p.kbUnnotifiedInRange_(pool, '2026-07-08').count === 3;
}, 'C2(★手段不問): メール派未送信・電話派未押下・メールなし、すべてカウント');
okSafe(() => {
  const p = pure();
  const pool = [abs('A', '2026-07-07', '送信済'), abs('B', '2026-07-07', '電話連絡済'),
                abs('C', '2026-07-07', '手動メール送信済'), abs('D', '2026-07-07', 'ケアマネ把握済'),
                abs('E', '2026-07-07', '下書き保存'), abs('F', '2026-07-07', '連絡済み（Gmail手動）')];
  const r = p.kbUnnotifiedInRange_(pool, '2026-07-08');
  return r.count === 0 && r.dates.length === 0;
}, 'C3(★done除外): done値（送信済/電話連絡済/…/連絡済み prefix）はカウントしない');
okSafe(() => {
  const p = pure();
  const pool = [abs('A', '2026-07-03')];   // 3営業日ちょうど
  return p.kbUnnotifiedInRange_(pool, '2026-07-08').count === 1;
}, 'C4(★境界): 3営業日ちょうど(7/3)は含む');
okSafe(() => {
  const p = pure();
  const pool = [abs('A', '2026-07-02')];   // 4営業日
  return p.kbUnnotifiedInRange_(pool, '2026-07-08').count === 0;
}, 'C5(★境界): 4営業日(7/2)は含まない（際限ない遡及を避ける）');
okSafe(() => {
  const p = pure();
  const pool = [abs('A', '2026-07-08')];   // 当日
  return p.kbUnnotifiedInRange_(pool, '2026-07-08').count === 0;
}, 'C6: 当日は含まない（今日は当日フローで対応する）');
okSafe(() => {
  const p = pure();
  const pool = [abs('A', '2026-07-09')];   // 未来
  return p.kbUnnotifiedInRange_(pool, '2026-07-08').count === 0;
}, 'C7: 未来日は含まない');
okSafe(() => {
  const p = pure();
  const pool = [abs('A', '2026-07-15', '', true)];
  pool[0].isLongTerm = true;
  return p.kbUnnotifiedInRange_(pool, '2026-07-08').count === 0;
}, 'C8: 長期休みは対象外');
okSafe(() => {
  const p = pure();
  // ★月跨ぎ: 8/3 に 7/30・7/31 の未連絡が集計される
  const pool = [abs('A', '2026-07-30'), abs('B', '2026-07-31'), abs('C', '2026-08-03')];
  const r = p.kbUnnotifiedInRange_(pool, '2026-08-03');
  return r.count === 2 && JSON.stringify(r.dates) === JSON.stringify(['2026-07-30', '2026-07-31']);
}, 'C9(★★月跨ぎ): 8/3で前月(7/30・7/31)の未連絡が集計される（当日8/3は除外）');
okSafe(() => {
  const p = pure();
  // ★土日: kbPastContactEligible_ は土日も対象日に含める（既存純関数の性質・意図的に流用）
  //   実運用では土日に欠席データが無いso実害なし。Phase2の記録ボタン範囲と完全一致するのが利点。
  const pool = [abs('A', '2026-08-01'), abs('B', '2026-08-02')];   // 土・日
  return p.kbUnnotifiedInRange_(pool, '2026-08-03').count === 2;
}, 'C10(★意図的): 土日の欠席データがあれば集計される（Phase2記録ボタンの範囲と完全一致＝ズレを作らない）');
okSafe(() => {
  const p = pure();
  return p.kbUnnotifiedInRange_(null, '2026-07-08').count === 0 && p.kbUnnotifiedInRange_([], '2026-07-08').dates.length === 0;
}, 'C11: null/空入力で落ちない');
okSafe(() => {
  const p = pure();
  // 同一人物が同じ日に2行（午前/午後）→ 人数は2（カードが2枚出るso2件が正）
  const pool = [abs('A', '2026-07-07'), abs('A', '2026-07-07')];
  const r = p.kbUnnotifiedInRange_(pool, '2026-07-08');
  return r.count === 2 && r.dates.length === 1;
}, 'C12: 日付はdistinct・件数は行数（同一人物の午前/午後は2件）');

// ================= D) ★流用の証明（新規判定を作らない） =================
console.log('■ D) ★既存純関数の流用（独自の日数計算/done判定を新設しない）');
okSafe(() => extractFn('kbUnnotifiedInRange_').indexOf('kbPastContactEligible_') >= 0,
  'D1(★): kbUnnotifiedInRange_ は kbPastContactEligible_ を流用（独自の営業日計算を作らない）');
okSafe(() => extractFn('kbUnnotifiedInRange_').indexOf('kbIsDoneInline_') >= 0,
  'D2(★): kbUnnotifiedInRange_ は kbIsDoneInline_ を流用（独自のdone判定を作らない）');
okSafe(() => extractFn('kbUnnotifiedMonths_').indexOf('kbPastContactEligible_') >= 0,
  'D3(★): kbUnnotifiedMonths_ も kbPastContactEligible_ で対象日を決める（範囲のズレを作らない）');
okSafe(() => {
  const src = extractFn('kbUnnotifiedInRange_') + extractFn('kbUnnotifiedMonths_') + extractFn('kbUnnotifiedRangeLoaded_');
  return !/getDay\(\)|\/\s*86400000|Date\.now/.test(src);
}, 'D4(★): 純関数群に独自の曜日/日数計算が無い（kbBizDaysAgo_ 経由のみ）');

// ================= E) ★書込ゼロ（集計と表示のみ） =================
console.log('■ E) ★書込ゼロ（POSTを一切行わない）');
okSafe(() => {
  const src = extractFn('kbUnnotifiedInRange_') + extractFn('kbUnnotifiedMonths_') + extractFn('kbUnnotifiedRangeLoaded_');
  return !/fetch\(|send_box_cm_mails|recordPastContact|updateAbsenceCmNotified/.test(src);
}, 'E1(★★): 純関数群は fetch も 送信/記録action も呼ばない');

// ================= F) 描画（★実データ経路 kbRenderChrome_ を実駆動） =================
// ★spec調査⑥の罠: kbRender は「今日の欠席0人」で早期returnする。
//   soアラートは kbRenderChrome_ 内（早期returnより前）に描かないと、肝心な日に出ない。
console.log('■ F) 描画 kbRenderChrome_（★早期returnより前・当日ビューのみ）');

function makeEl(id) { return { id, innerHTML: '', textContent: '', value: '', style: {} }; }
function chromeEnv(opts) {
  const o = opts || {};
  const els = {};
  ['kbox-datepicker', 'kbox-datelabel', 'kbox-viewonly-banner', 'kbox-unnotified-alert'].forEach(i => els[i] = makeEl(i));
  const calls = [];
  const env = {
    document: { getElementById: id => els[id] || null },
    kbState: { viewDate: o.viewDate || '2026-07-08', forward: o.forward || [] },
    attMonthAbsCache: ('cache' in o) ? o.cache : { '2026-07': (o.month || []) },
    kbUnnotifiedFailed_: ('failed' in o) ? o.failed : false,
    fetch: () => { calls.push({ fetch: true }); },
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
function alertHtml(env) { return env.__els['kbox-unnotified-alert'].innerHTML; }

okSafe(() => html.indexOf('id="kbox-unnotified-alert"') >= 0, 'F1(★構造): box上部に #kbox-unnotified-alert がある');
okSafe(() => {
  const chrome = extractFn('kbRenderChrome_');
  return chrome.indexOf('kbUnnotifiedAlert') >= 0 || chrome.indexOf('kbRenderUnnotifiedAlert_') >= 0;
}, 'F2(★★早期return対策): アラートは kbRenderChrome_ が描く（kbRenderの早期returnより前）');
okSafe(() => {
  // 'kbRender' だと kbRenderForDate 等に前置衝突するso 'function kbRender()' で厳密化（既存ハーネスと同流儀）
  const s = html.indexOf('function kbRender()');
  if (s < 0) throw new Error('function kbRender() が無い');
  const b = html.indexOf('{', s);
  let d = 0, e = s;
  for (let j = b; j < html.length; j++) { const c = html[j]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { e = j + 1; break; } } }
  const r = html.slice(s, e);
  const chromeCall = r.indexOf('kbRenderChrome_');
  const early = r.indexOf('if (!kbState.items.length)');
  return chromeCall >= 0 && early >= 0 && chromeCall < early;
}, 'F3(★★): kbRenderChrome_ の呼び出しは「今日0人の早期return」より前にある');
okSafe(() => {
  // ★★核心: 今日の欠席が0人（kbRenderが早期returnする日）でも、過去に未連絡があればアラートが出る
  const env = chromeEnv({ viewDate: '2026-07-08', forward: [], month: [abs('A', '2026-07-07')] });
  const api = bindChrome(env);
  api.kbRenderChrome_('2026-07-08', '2026-07-08', true);
  const h = alertHtml(env);
  return h.indexOf('1件') >= 0 && h.indexOf('連絡未') >= 0;
}, 'F4(★★★誤陰性ゼロ): 今日の欠席0人でも、過去の未連絡1件でアラートが出る（⑥の罠の回帰固定）');
okSafe(() => {
  const env = chromeEnv({ month: [abs('A', '2026-07-07'), abs('B', '2026-07-07'), abs('C', '2026-07-06')] });
  const api = bindChrome(env);
  api.kbRenderChrome_('2026-07-08', '2026-07-08', true);
  const h = alertHtml(env);
  return h.indexOf('3件') >= 0 && h.indexOf('7/6') >= 0 && h.indexOf('7/7') >= 0;
}, 'F5(★): 件数と日付を集約表示（3件・7/6・7/7）');
okSafe(() => {
  const env = chromeEnv({ month: [abs('A', '2026-07-07')] });
  const api = bindChrome(env);
  api.kbRenderChrome_('2026-07-08', '2026-07-08', true);
  return /onclick="kbJumpTo\('2026-07-07'\)"/.test(alertHtml(env));
}, 'F6(★既存経路): 日付タップは既存 kbJumpTo を呼ぶ（新規経路を作らない）');

// ================= G) ★★4状態（0件と「まだ分からない」を混同しない） =================
console.log('■ G) ★★4状態（未確定/N件/0件/失敗）');
okSafe(() => {
  const env = chromeEnv({ cache: {}, month: [] });        // 必要月が未取得
  const api = bindChrome(env);
  api.kbRenderChrome_('2026-07-08', '2026-07-08', true);
  const h = alertHtml(env);
  return h.indexOf('確認中') >= 0 && h.indexOf('0件') < 0;
}, 'G1(★★): 月キャッシュ未充填 → 「確認中…」（★0件と断定しない）');
okSafe(() => {
  const env = chromeEnv({ cache: { '2026-07': [] } });    // 取得成功・本当に0件
  const api = bindChrome(env);
  api.kbRenderChrome_('2026-07-08', '2026-07-08', true);
  const h = alertHtml(env);
  return h === '' || h.indexOf('連絡未') < 0;
}, 'G2: 取得成功・本当に0件 → アラート非表示');
okSafe(() => {
  const env = chromeEnv({ cache: {}, failed: true });     // 取得失敗
  const api = bindChrome(env);
  api.kbRenderChrome_('2026-07-08', '2026-07-08', true);
  const h = alertHtml(env);
  return h.indexOf('確認できませんでした') >= 0;
}, 'G3(★★): 取得失敗 → 「確認できませんでした」（★0件と見なさない）');
okSafe(() => {
  // ★月跨ぎ: 当月だけ揃っていても前月が無ければ「確認中」＝前月の未連絡を見落とさない
  const env = chromeEnv({ viewDate: '2026-08-03', cache: { '2026-08': [] } });
  const api = bindChrome(env);
  api.kbRenderChrome_('2026-08-03', '2026-08-03', true);
  const h = alertHtml(env);
  return h.indexOf('確認中') >= 0;
}, 'G4(★★月跨ぎ): 8/3で当月のみ揃い・前月未取得 → 「確認中…」（0件と断定しない）');
okSafe(() => {
  const env = chromeEnv({ viewDate: '2026-08-03', cache: { '2026-07': [abs('A', '2026-07-30')], '2026-08': [] } });
  const api = bindChrome(env);
  api.kbRenderChrome_('2026-08-03', '2026-08-03', true);
  const h = alertHtml(env);
  return h.indexOf('1件') >= 0 && h.indexOf('7/30') >= 0;
}, 'G5(★★月跨ぎ): 2ヶ月揃えば前月(7/30)の未連絡が出る');
okSafe(() => {
  // 当日ビュー以外（過去日を見ている）→ アラート非表示
  const env = chromeEnv({ viewDate: '2026-07-07', month: [abs('A', '2026-07-07')] });
  const api = bindChrome(env);
  api.kbRenderChrome_('2026-07-07', '2026-07-08', false);
  const h = alertHtml(env);
  return h === '' || h.indexOf('連絡未') < 0;
}, 'G6: 当日ビュー以外（過去日/未来日を見ているとき）→ アラート非表示');
okSafe(() => {
  const env = chromeEnv({ month: [abs('A', '2026-07-07', '送信済'), abs('B', '2026-07-07', '電話連絡済')] });
  const api = bindChrome(env);
  api.kbRenderChrome_('2026-07-08', '2026-07-08', true);
  const h = alertHtml(env);
  return h === '' || h.indexOf('連絡未') < 0;
}, 'G7: 全員done → アラート非表示');
okSafe(() => {
  // 要素不在でも落ちない（f774228型の回避）
  const env = chromeEnv({ month: [abs('A', '2026-07-07')] });
  delete env.__els['kbox-unnotified-alert'];
  const api = bindChrome(env);
  api.kbRenderChrome_('2026-07-08', '2026-07-08', true);
  return true;
}, 'G8: アラート要素が無くても落ちない（要素不在ガード）');

// ================= H) ★書込ゼロ・非接触（描画側） =================
console.log('■ H) ★書込ゼロ・非接触（描画側）');
okSafe(() => {
  const env = chromeEnv({ month: [abs('A', '2026-07-07')] });
  const api = bindChrome(env);
  api.kbRenderChrome_('2026-07-08', '2026-07-08', true);
  return env.__calls.length === 0;
}, 'H1(★★書込ゼロ): 描画で fetch を一度も呼ばない');
okSafe(() => {
  const src = extractFn('kbRenderUnnotifiedAlert_');
  return !/fetch\(|send_box_cm_mails|recordPastContact|updateAbsenceCmNotified/.test(src);
}, 'H2(★★): アラート描画に 送信/記録action が無い');
okSafe(() => {
  const chrome = extractFn('kbRenderChrome_');
  return chrome.indexOf('kbox-datepicker') >= 0 && chrome.indexOf('kbox-viewonly-banner') >= 0;
}, 'H3(非接触): chrome の既存機能（ピッカー同期・閲覧のみ帯）を壊していない');
okSafe(() => (html.match(/send_box_cm_mails/g) || []).length === 1, 'H4(★非接触): send_box_cm_mails は1箇所のまま');
okSafe(() => (html.match(/gnbGuardProdWrite/g) || []).length === 13, 'H5(★非接触): gnbGuardProdWrite は13本のまま');

// ================= I) 必要月の充填要求＋★失敗検知（薄いラッパ・既存関数は非接触） =================
// ★attEnsureMonthAbsences は失敗時に cache を埋めず、cb() は成否問わず呼ばれる＝成否が判定できない。
//   soラッパ側で「要求した月が cb 後もキャッシュに現れない＝失敗」と判定する。
console.log('■ I) kbEnsureUnnotifiedMonths_（必要月の充填要求・★失敗検知）');

function ensureEnv(opts) {
  const o = opts || {};
  const calls = [];
  const cache = o.cache || {};
  const env = {
    attMonthAbsCache: cache,
    kbState: { _ensuringYm: o.ensuringYm || '' },
    kbUnnotifiedFailed_: false,
    // 実挙動を模す: fillMonths に載っている月だけ cache を埋める（それ以外は失敗＝埋めない）。cbは必ず呼ぶ。
    attEnsureMonthAbsences: function (dateStr, cb) {
      const ym = String(dateStr).slice(0, 7);
      calls.push({ ensure: ym });
      if ((o.fillMonths || []).indexOf(ym) >= 0) cache[ym] = o.fillData || [];
      cb();
    },
    kbRenderUnnotifiedAlert_: function () { calls.push({ render: true }); },
    jstTodayStr: () => o.today || '2026-07-08',
  };
  env.__calls = calls; env.__cache = cache;
  return env;
}
const ENSURE_FNS = ['kbAddDaysYMD_', 'kbBizDaysAgo_', 'kbPastContactEligible_',
  'kbUnnotifiedMonths_', 'kbUnnotifiedRangeLoaded_', 'kbEnsureUnnotifiedMonths_'];
function bindEnsure(env) {
  const src = ENSURE_FNS.map(n => extractFn(n, true)).filter(Boolean).join('\n\n');
  const keys = Object.keys(env).filter(k => k.indexOf('__') !== 0);
  const prelude = 'let kbUnnotifiedEnsuring_ = {};\n';
  const body = prelude + src + '\n\nreturn {' + ENSURE_FNS.map(n => n + ': (typeof ' + n + '!=="undefined")?' + n + ':undefined').join(', ') +
    ', __failed: () => kbUnnotifiedFailed_};';
  return new Function(...keys, body)(...keys.map(k => env[k]));
}

okSafe(() => {
  const env = ensureEnv({ today: '2026-07-08', cache: {}, fillMonths: ['2026-07'] });
  const api = bindEnsure(env);
  api.kbEnsureUnnotifiedMonths_('2026-07-08');
  return env.__calls.filter(c => c.ensure === '2026-07').length === 1;
}, 'I1: 必要月(当月)をensureする');
okSafe(() => {
  // ★月跨ぎ: 前月も要求する（当月だけ見る実装は誤り）
  const env = ensureEnv({ today: '2026-08-03', cache: {}, fillMonths: ['2026-07', '2026-08'] });
  const api = bindEnsure(env);
  api.kbEnsureUnnotifiedMonths_('2026-08-03');
  const ms = env.__calls.filter(c => c.ensure).map(c => c.ensure).sort();
  return JSON.stringify(ms) === JSON.stringify(['2026-07', '2026-08']);
}, 'I2(★★月跨ぎ): 8/3では前月(2026-07)も追加でensureする');
okSafe(() => {
  const env = ensureEnv({ today: '2026-07-08', cache: { '2026-07': [] }, fillMonths: [] });
  const api = bindEnsure(env);
  api.kbEnsureUnnotifiedMonths_('2026-07-08');
  return env.__calls.filter(c => c.ensure).length === 0;
}, 'I3: 既に取得済みの月は再取得しない（空配列[]も取得済み扱い）');
okSafe(() => {
  // ★失敗検知: ensure したのに cache に現れない → 失敗フラグ
  const env = ensureEnv({ today: '2026-07-08', cache: {}, fillMonths: [] });   // 埋めない＝失敗
  const api = bindEnsure(env);
  api.kbEnsureUnnotifiedMonths_('2026-07-08');
  return api.__failed() === true;
}, 'I4(★★失敗検知): ensure後もキャッシュに現れない → 失敗フラグが立つ（0件と見なさない）');
okSafe(() => {
  const env = ensureEnv({ today: '2026-07-08', cache: {}, fillMonths: ['2026-07'] });
  const api = bindEnsure(env);
  api.kbEnsureUnnotifiedMonths_('2026-07-08');
  return api.__failed() === false;
}, 'I5: 成功したら失敗フラグは立たない');
okSafe(() => {
  // ★月跨ぎで片方だけ失敗 → 失敗扱い（前月の未連絡を見落とさない）
  const env = ensureEnv({ today: '2026-08-03', cache: {}, fillMonths: ['2026-08'] });   // 7月は埋まらない
  const api = bindEnsure(env);
  api.kbEnsureUnnotifiedMonths_('2026-08-03');
  return api.__failed() === true;
}, 'I6(★★): 月跨ぎで前月だけ失敗しても失敗扱い（0件と見なさない）');
okSafe(() => {
  const env = ensureEnv({ today: '2026-07-08', cache: {}, fillMonths: ['2026-07'] });
  const api = bindEnsure(env);
  api.kbEnsureUnnotifiedMonths_('2026-07-08');
  return env.__calls.some(c => c.render);
}, 'I7: 充填後にアラートを再描画する');
okSafe(() => {
  // ★既存の多重防止(_ensuringYm)を壊さない: ラッパは _ensuringYm を書き換えない
  const src = extractFn('kbEnsureUnnotifiedMonths_');
  return !/_ensuringYm\s*=/.test(src);
}, 'I8(★非接触): ラッパは kbState._ensuringYm を書き換えない（既存の多重防止と衝突しない）');
okSafe(() => {
  const src = extractFn('kbEnsureUnnotifiedMonths_');
  return !/fetch\(|send_box_cm_mails|recordPastContact|updateAbsenceCmNotified/.test(src);
}, 'I9(★★書込ゼロ): ラッパは fetch も 送信/記録action も呼ばない（JSONP GETのみ・既存関数経由）');
okSafe(() => {
  const src = extractFn('attEnsureMonthAbsences');
  return src.indexOf('kbUnnotifiedFailed_') < 0 && src.indexOf('kbEnsureUnnotifiedMonths_') < 0;
}, 'I10(★非接触): attEnsureMonthAbsences 本体は無改変（Phase3の都合を持ち込まない）');

// ================= J) 配線・非接触の構造証明 =================
console.log('■ J) 配線・非接触の構造証明');
okSafe(() => {
  const s = html.indexOf('async function kbLoad()');
  if (s < 0) throw new Error('kbLoad が無い');
  const b = html.indexOf('{', s);
  let d = 0, e = s;
  for (let j = b; j < html.length; j++) { const c = html[j]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { e = j + 1; break; } } }
  return html.slice(s, e).indexOf('kbEnsureUnnotifiedMonths_') >= 0;
}, 'J1: kbLoad が必要月の充填要求を出す（アラートのデータ源）');
okSafe(() => {
  // ★成功で安易に false へ戻さない（月跨ぎで前月失敗→当月成功の後勝ちを防ぐ）
  const src = extractFn('kbEnsureUnnotifiedMonths_');
  // 行コメントを除去してから構造判定する。実コードでは条件と代入の間に「なぜ後勝ちを防ぐか」の
  // 説明コメントが146文字入っており、実行文はゼロなのに窓80文字の正規表現が届かず偽FAILしていた（2026-07-08）。
  // ★判定は緩めていない: コメントを除いた実行文の窓は80文字のまま＝間に実行文が1つでも入れば落ちる。
  const code = src.replace(/\/\/[^\n]*/g, '');
  const guarded = /kbUnnotifiedRangeLoaded_\([^)]*\)\s*\)\s*\{[\s\S]{0,80}kbUnnotifiedFailed_\s*=\s*false/.test(code);
  // ★さらに強化: false 代入は「揃ったときの1箇所」だけ（無条件クリアが別の場所に生えたら落とす）
  const clears = (code.match(/kbUnnotifiedFailed_\s*=\s*false/g) || []).length;
  return guarded && clears === 1;
}, 'J2(★★誤陰性): 失敗フラグのクリアは「全必要月が揃ったとき」だけ1箇所（後勝ちで失敗を消さない）');
okSafe(() => {
  const src = extractFn('kbRenderUnnotifiedAlert_');
  // 「0件で非表示」は kbUnnotifiedRangeLoaded_ を通過した後にしか到達しない
  const loaded = src.indexOf('kbUnnotifiedRangeLoaded_');
  const zero = src.indexOf('if (!r.count)');
  return loaded >= 0 && zero >= 0 && loaded < zero;
}, 'J3(★★): 「0件→非表示」は充填判定を通過した後にしか到達しない（構造で誤陰性を封じる）');
okSafe(() => {
  const src = extractFn('kbRenderUnnotifiedAlert_');
  const failed = src.indexOf('kbUnnotifiedFailed_');
  const loaded = src.indexOf('kbUnnotifiedRangeLoaded_');
  return failed >= 0 && loaded >= 0 && failed < loaded;
}, 'J4(★): 失敗判定は充填判定より先（失敗を「確認中」で覆い隠さない）');
okSafe(() => {
  // ★「不変」は実POST本数で固定する（総出現数はコメント増減で脆い＝Step Aの範囲拡大で説明コメントが増え6になった）。
  //   記録POSTの新設だけを厳密に落とす本質基準。旧テストの総出現数固定は 2026-07-09 に実POST基準へ是正。
  const posts = (html.match(/action:\s*'recordPastContact'/g) || []).length;
  return posts === 1;
}, 'J5(★非接触): recordPastContact の実POSTは1本のまま（Phase3は記録POSTを1件も増やさない）');
okSafe(() => {
  const chrome = extractFn('kbRenderChrome_');
  return !/fetch\(|attEnsureMonthAbsences/.test(chrome);
}, 'J6(★★書込ゼロ/描画純粋): kbRenderChrome_ は fetch も ensure も呼ばない（描画は取得を誘発しない）');

console.log('\n実測ハーネス(unnotified-alert): ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
