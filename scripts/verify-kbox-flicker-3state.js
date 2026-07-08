// 欠席box ちらつき 3状態モデルの「実測」ハーネス（2026-07-07・-25版）
// genba.html から kbLoad/kbRenderForDate/kbRenderDayNow_/kbRender 等の【実コード】を抽出し、
// DOMスタブ＋即時setTimeoutで実駆動→#kbox-list の描画を実測する。実行: node scripts/verify-kbox-flicker-3state.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name + '(';
  let start = html.indexOf(sig);
  if (start < 0) throw new Error('genba.html に ' + sig + ' が無い');
  if (html.slice(start - 6, start) === 'async ') start -= 6;
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  for (let j = braceStart; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}
function extractLet(name) {
  const sig = 'let ' + name + ' =';
  const start = html.indexOf(sig);
  if (start < 0) throw new Error(sig + ' が無い');
  const end = html.indexOf('\n', start);
  return html.slice(start, end);
}

const realSources = [
  extractLet('kbState'),
  extractFn('kbAddDaysYMD_'), extractFn('kbMergeDedupAbs_'),   // kbUpcomingAbsenceDates_ は削除(2026-07-08)
  extractFn('kbIsViewToday_'), extractFn('kbUnitGroup_'), extractFn('kbFilterTodayTargets_'),
  extractFn('kbIsOkResponseInline_'), extractFn('kbViewLoadedInline_'), extractFn('kbJsonpRetry_'),
  extractFn('kbFmtChip_'), extractFn('kbInit'), extractFn('kbLoad'),
  extractFn('kbRenderForDate'), extractFn('kbRenderDayNow_'),
  extractFn('kbIsDoneInline_'), extractFn('kbClassifyCardInline_'), extractFn('kbEsc_'),
  extractFn('kbRenderOperatorRow_'), extractFn('kbRender'), extractFn('kbRenderChrome_'), extractFn('kbUpdateBadge'),
  extractFn('kbGoDate'), extractFn('kbJumpTo'),
].join('\n\n');

const stubs = `
let __scriptedAbs = [];   // kbJsonp_('absences') が順に返す応答列（尽きたら最後を反復）
let __absIdx = 0;
let attMonthAbsCache = {};
let __scriptedMonth = null;   // attEnsureMonthAbsences が cb 前に cache へ入れる配列（null=失敗で埋めない）
async function kbJsonp_(action, idSuffix) {
  if (action === 'absences') { const v = __scriptedAbs[Math.min(__absIdx, __scriptedAbs.length - 1)]; __absIdx++; return v; }
  if (action === 'cm_method_audit') return { audit: [] };
  return null;
}
function attEnsureMonthAbsences(dateStr, cb) {
  const ym = String(dateStr).slice(0, 7);
  if (__scriptedMonth !== null) attMonthAbsCache[ym] = __scriptedMonth;   // 成功: cacheを埋める
  cb();   // 失敗時は cache を埋めずに cb
}
function jstTodayStr() { return '2026-07-06'; }
var absReceptionist = '';
var absCmEmailMap = { A: '', B: '' };
async function absLoadCmEmailMap() { return {}; }
function getStaff() { return ['山田', '田中']; }
var EXCLUDED_STAFF = ['比嘉'];
`;

const factoryBody =
  '"use strict";\n' + stubs + '\n' + realSources + '\n' +
  'return { kbInit, kbLoad, kbGoDate, kbJumpTo, ' +
  'setAbs:function(seq){__scriptedAbs=seq;__absIdx=0;}, setMonth:function(m){__scriptedMonth=m;}, ' +
  'seedCache:function(ym,arr){attMonthAbsCache[ym]=arr;}, getState:function(){return kbState;} };';
const factory = new Function('document', 'window', 'setTimeout', factoryBody);

function makeEl() { return { innerHTML: '', textContent: '', style: {}, disabled: false, value: '' }; }
function newContext() {
  const els = {};
  ['kbox-list', 'kbox-operator-note', 'kbox-pending-badge', 'kbox-send-btn', 'kbox-section',
   'kbox-datelabel', 'kbox-viewonly-banner', 'kbox-datepicker', 'kbox-operator-select'   // kbox-jumpchips は削除(2026-07-08)
  ].forEach(id => els[id] = makeEl());
  const document = { getElementById: id => els[id] || null, createElement: () => makeEl(), body: { appendChild() {} } };
  const immediate = (fn) => { if (typeof fn === 'function') fn(); return 0; };
  const h = factory(document, {}, immediate);
  return { h, els };
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  [PASS] ' + label); } else { fail++; console.error('  [FAIL] ' + label); } }

const RN = { absences: { absences: [
  { date: '2026-07-06', name: '当日太郎', unit: '午前', isLongTerm: false, cmNotified: '' },
  { date: '2026-07-07', name: '明日花子', unit: '午後', isLongTerm: false, cmNotified: '' },
] } };
const R0 = { absences: { absences: [] } };
const TODAY_ABS = { date: '2026-07-06', name: '当日太郎', unit: '午前', isLongTerm: false, cmNotified: '' };

async function run() {
  // ===== A: 同一セッション 成功N→失敗→空応答→成功0 =====
  console.log('■ A（放置復帰）');
  { const c = newContext(); const L = () => c.els['kbox-list'].innerHTML;
    c.h.setMonth([]);
    c.h.setAbs([RN]); await c.h.kbLoad();
    ok(L().indexOf('当日太郎') >= 0, 'A1: 成功N → 当日太郎表示');
    ok(L().indexOf('明日花子') < 0, 'A2: 明日は本日boxに出さない');
    c.h.setAbs([null]); await c.h.kbLoad();
    ok(L().indexOf('当日太郎') >= 0, 'A5: 【失敗復帰】欠席者が消えない(★)');
    ok(L().indexOf('の欠席はありません') < 0, 'A6: 【失敗】欠席なしを出さない(★)');
    c.h.setAbs([{}]); await c.h.kbLoad();
    ok(L().indexOf('当日太郎') >= 0, 'A7: 【空応答】欠席者が消えない(★)');
    ok(L().indexOf('の欠席はありません') < 0, 'A8: 【空応答】欠席なしを出さない(★)');
    c.h.setAbs([R0]); await c.h.kbLoad();
    ok(L().indexOf('の欠席はありません') >= 0, 'A9: 【成功0件】このときだけ欠席なし');
    ok(L().indexOf('当日太郎') < 0, 'A10: 【成功0件】前の欠席者は消える');
  }
  // ===== B: 初回×失敗 / C: 初回×成功0 =====
  console.log('■ B/C（初回）');
  { const c = newContext(); c.h.setMonth(null); c.h.setAbs([null, null, null]); await c.h.kbLoad();
    const L = c.els['kbox-list'].innerHTML;
    ok(L.indexOf('取得できませんでした') >= 0, 'B1: 初回×総失敗 → エラー表示');
    ok(L.indexOf('の欠席はありません') < 0, 'B2: 初回×失敗 → 欠席なし誤表示しない(★)');
  }
  { const c = newContext(); c.h.setMonth([]); c.h.setAbs([R0]); await c.h.kbLoad();
    ok(c.els['kbox-list'].innerHTML.indexOf('の欠席はありません') >= 0, 'C1: 初回×成功0件 → 正しく欠席なし');
  }
  // ===== D: forward軸（月GET失敗でも当日カードはforward源で出る） =====
  console.log('■ D（forward軸）');
  { const c = newContext(); c.h.setMonth(null); c.h.setAbs([RN]); await c.h.kbLoad();
    ok(c.els['kbox-list'].innerHTML.indexOf('当日太郎') >= 0, 'D1: 月GET失敗でも当日カードはforward源で表示');
  }
  // ===== F: ① 遅延成功/固着封じ =====
  console.log('■ F（遅延成功・固着封じ）');
  { const c = newContext(); c.h.setMonth([]); c.h.setAbs([null, null, RN]); await c.h.kbLoad();  // retry内で3回目成功
    ok(c.els['kbox-list'].innerHTML.indexOf('当日太郎') >= 0, 'F1: forward失敗→retry成功→カードが出る(固着しない)');
  }
  { const c = newContext(); c.h.setMonth(null); c.h.setAbs([null, null, null]); await c.h.kbLoad();
    ok(c.els['kbox-list'].innerHTML.indexOf('読み込み中') < 0, 'F2: 総失敗は読込中で固着せずエラー表示(★)');
    c.h.setAbs([RN]); await c.h.kbLoad();
    ok(c.els['kbox-list'].innerHTML.indexOf('当日太郎') >= 0, 'F3: 総失敗後の再ロード成功→カードが出る');
  }
  // ===== G: ② 月GET先着・forward後着の上書き競合 =====
  console.log('■ G（月先着・forward後着）');
  { const c = newContext(); const L = () => c.els['kbox-list'].innerHTML;
    c.h.seedCache('2026-07', [TODAY_ABS]);        // 月キャッシュ先着
    c.h.setMonth([TODAY_ABS]);
    c.h.setAbs([RN]); await c.h.kbLoad();          // まず成功でカード
    ok(L().indexOf('当日太郎') >= 0, 'G0: 前提=カード表示');
    c.h.setAbs([null]); await c.h.kbLoad();         // forward失敗
    ok(L().indexOf('当日太郎') >= 0, 'G1: 月キャッシュ有+forward失敗→カード保持(★)');
    ok(L().indexOf('の欠席はありません') < 0, 'G1b: 欠席なしで上書きしない(★)');
    ok(L().indexOf('読み込み中') < 0, 'G3: 既存カードは失敗時に読み込み中にも化けない(★)');
    c.h.setAbs([{}]); await c.h.kbLoad();           // forward空応答
    ok(L().indexOf('当日太郎') >= 0, 'G2: forward空応答でも保持(★)');
  }
  // ===== H: ③ 非当日ビューの3状態（月を分離し cache 衝突回避） =====
  console.log('■ H（非当日ビュー）');
  { const c = newContext(); c.h.setMonth([]); c.h.setAbs([R0]); await c.h.kbLoad();  // 当日ロード(0件)
    const L = () => c.els['kbox-list'].innerHTML;
    c.h.setMonth(null); c.h.kbJumpTo('2026-09-10');                 // 未来月GET失敗（cache埋めない）
    ok(L().indexOf('の欠席はありません') < 0, 'H1: 未来日・月未充填→欠席なしを先出ししない(読込中)(★)');
    c.h.setMonth([]); c.h.kbJumpTo('2026-10-11');                   // 別月・成功0件
    ok(L().indexOf('の欠席はありません') >= 0, 'H2: 未来月成功0件→欠席なし(loaded)');
    c.h.setMonth([{ date: '2026-11-12', name: '未来次郎', unit: '午後', isLongTerm: false, cmNotified: '' }]);
    c.h.kbJumpTo('2026-11-12');                                     // 別月・成功N件
    ok(L().indexOf('未来次郎') >= 0, 'H3: 未来月成功N件→カード');
    c.h.setMonth(null); c.h.kbJumpTo('2026-05-10');                 // 過去月GET失敗
    ok(L().indexOf('の欠席はありません') < 0, 'H4: 過去日・月未充填→欠席なし先出ししない(★)');
  }
  // ===== E: -25機能デグレなし =====
  console.log('■ E（-25デグレなし）');
  { const c = newContext(); c.h.setMonth([]); c.h.setAbs([RN]); await c.h.kbLoad();
    const before = c.h.getState().viewDate;
    c.h.kbGoDate(1);
    ok(c.h.getState().viewDate !== before, 'E1: kbGoDate(1)でviewDate移動(◀▶生存)');
    ok(c.els['kbox-viewonly-banner'].style.display === 'block', 'E2: 未来日は閲覧のみ帯(当日ガード表示)');
    c.h.kbGoDate(-1);
    ok(c.h.getState().viewDate === before, 'E3: kbGoDate(-1)で当日へ戻る');
  }

  console.log(`\n実測ハーネス(3state): ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
run().catch(e => { console.error('harness error:', e); process.exit(1); });
