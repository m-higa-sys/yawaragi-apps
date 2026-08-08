// test-kobetsu-soufu-off.js
// 個訓アプリから「提出（ケアマネ送付）」を外す（2026-07-30・社長決定）。
//
// 役割分担（社長決定）:
//   個別機能訓練計画書チェックアプリ … 計画書を作ったか／評価を作ったか だけを管理する
//   ケアマネ送付                     … ケアマネ送付チェックリスト.html で管理する
//   よって個訓アプリから「提出」バッジと送付の記録操作を外し、朝の報告の督促も止める。
//
// ★データの列（keikaku_sent_date / hyouka_pdf_date / hyouka_print_date）は消さない。
//   送付アプリが hyouka_pdf_date / hyouka_print_date を読み書きしているため（実測）。
//   GAS 側の updateKeikakusho / getKeikakushoYear も無改修で残す。
// ★朝の報告は getKeikakushoUnsubmitted_ を「呼ばない」形にする。関数は残す（消すと戻せない）。
//
// 実行: node scripts/test-kobetsu-soufu-off.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, '個別機能訓練計画書チェック.html'), 'utf8');
const shared = fs.readFileSync(path.join(REPO, 'shared.js'), 'utf8');
const gas = fs.readFileSync(path.join(REPO, 'gas', 'yawaragi-board', 'コード.js'), 'utf8');
const soufuApp = fs.readFileSync(path.join(REPO, 'ケアマネ送付チェックリスト.html'), 'utf8');

function extractFrom(src, name) {
  const sig = 'function ' + name + '(';
  const s = src.indexOf(sig);
  if (s < 0) throw new Error('関数が無い: ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(s, j + 1); } }
}
// 2026-07-31 段階4: renderTable が予定月ベースの判定を呼ぶようになったため、
//   その純関数群も実HTMLから一緒に抽出する（フォールバック側＝planStartベースの検証内容は不変）。
// ★2026-08-01 段階6-1: 配置ルールが KB_WORK_MONTH_FROM / kbPlanMovesToPrevMonth / kbHasPlanRowData を使うため注入する。
//   （vm.runInContext では const がサンドボックスに載らないので定数だけ var で束ねる）
const KB_WM_SRC = 'var KB_WORK_MONTH_FROM = '
  + /const\s+KB_WORK_MONTH_FROM\s*=\s*([^;]+);/.exec(html)[1] + ';\n';
const HTML_FNS = ['kbHasPlanRowData', 'kbPlanMovesToPrevMonth', 'renderTable', 'kbYm', 'kbBuildYoteiMap', 'kbYoteiYm', 'kbIsPlanCell', 'kbIsHyoukaCell', 'kbYoteiLabel', 'kobetsuCycleAt', 'getGroup', 'matchesFilter', 'kbBadgeObj', 'kbPlanBadges', 'kbEvalBadges',
  'kbBadgeHtml', 'kbSubmitDue', 'escapeHtml', 'escapeAttr', 'formatMD', 'formatTodayISO',
  'kbNormKey', 'kbPickSokuteiDate', 'kbBuildSokuteiByMonth', 'kbSokuteiForCell', 'blockedIcon', 'blockedLabel'];
const SHARED_FNS = ['isPlanMonth', 'isHyoukaMonth', 'isBeforePlanStart'];
const fnSrc = KB_WM_SRC + HTML_FNS.map(n => extractFrom(html, n)).join('\n') + '\n' + SHARED_FNS.map(n => extractFrom(shared, n)).join('\n');

function el() { return { style: {}, innerHTML: '', textContent: '', classList: { add() { }, remove() { }, contains() { return false; } } }; }
const thead = el(), tbody = el(), ids = {};
['emptyMessage', 'filterBar', 'filterCount', 'totalUsers', 'thisMonthCount', 'progressCount', 'progressTotal',
  'hyoukaMonthCount', 'hyoukaDoneCount', 'hyoukaTotalCount'].forEach(i => ids[i] = el());
const sandbox = {
  busy: {},                                  // 段階4: 送信中ロック（この検証では常に空）
  // 月の足し算は yotei-core.js の本物を使う（この画面に複製しない＝単一の正）
  ymAdd: require(require('path').resolve(__dirname, '../gas/yawaragi-board/yotei-core.js')).ymAdd,
  document: {
    querySelector: sel => sel.indexOf('thead') >= 0 ? thead : (sel.indexOf('tbody') >= 0 ? tbody : el()),
    getElementById: id => ids[id] || el()
  },
  console, Math, String, Date, JSON, Object, Array, Number, parseInt, RegExp, isNaN,
  filterDay: '', filterAmpm: '', filterGroup: '', usageGate: {},
  sortUsers() { }, updateStats() { }, isPending() { return false; }, ensureUsageGate() { }, state: null
};
sandbox.MONTHS = [];
for (let i = 0; i < 12; i++) { const mm = ((4 - 1 + i) % 12) + 1; sandbox.MONTHS.push({ m: mm, label: mm + '月', nextYear: (4 + i) > 12 }); }
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fnSrc, sandbox);
const S = sandbox;

let pass = 0, fail = 0;
function eq(a, e, l) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('  PASS ' + l); }
  else { fail++; console.log('  FAIL ' + l + '\n    actual  =' + A + '\n    expected=' + E); }
}
function ok(c, l) { eq(!!c, true, l); }
function sec(t) { console.log('\n[' + t + ']'); }

// =====================================================================
sec('1. バッジ構成: 「提出」が2箇所とも無い／他は従来どおり');
eq(S.kbPlanBadges({}).map(b => b.label), ['計画', '測定'], '★計画パートは「計画」「測定」の2つだけ（提出を外した）');
eq(S.kbEvalBadges({}).map(b => b.label), ['評価'], '★評価パートは「評価」だけ（提出を外した）');
eq(S.kbPlanBadges({ keikaku_date: '2026-07-27', sokutei_date: '2026-07-14' }).map(b => b.state), ['done', 'done'],
  '計画・測定の済判定は従来どおり');
eq(S.kbPlanBadges({ keikaku_date: '', sokutei_date: '' }, '2026-07-27').map(b => b.state), ['todo', 'done'],
  '★測定の2ソース化（①）はそのまま生きている');
eq(S.kbEvalBadges({ tasseido_date: '2026-07-23' }).map(b => b.state), ['done'], '評価（達成度）の済判定は従来どおり');
eq(S.kbEvalBadges({ hyouka_pdf_date: '2026-07-09', hyouka_print_date: '2026-07-10' }).map(b => b.state), ['todo'],
  '★送付日が入っていても評価バッジには影響しない（送付は個訓アプリの管轄外）');

sec('2. 送付の列を読み書きするコードが個訓アプリから消えている');
const SOUFU_COLS = ['keikaku_sent_date', 'hyouka_pdf_date', 'hyouka_print_date'];
// コメント行（// で始まる行）は「列は消していない」という説明で名前に触れるため、コードだけを見る
const codeOnly = html.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
SOUFU_COLS.forEach(c => eq((codeOnly.match(new RegExp(c, 'g')) || []).length, 0, '★' + c + ' を使うコードが0件'));
eq((html.match(/field=keikaku_sent_date|field=hyouka_pdf_date|field=hyouka_print_date/g) || []).length, 0,
  '★送付列を書く updateKeikakusho の呼び出しが無い');
['applySentValue', 'toggleSentFromDialog', 'saveHyoukaField', 'clearHyoukaField'].forEach(f =>
  eq(html.indexOf('function ' + f + '(') >= 0, false, '★送付の記録関数 ' + f + ' を外した'));
['sentSection', 'sentToggleBtn', 'sentStatus', 'hyoukaPdfSection', 'hyoukaPrintSection', 'hyoukaPdfInput', 'hyoukaPrintInput']
  .forEach(id => eq(html.indexOf('id="' + id + '"') >= 0, false, '★送付UI ' + id + ' を外した'));

sec('3. 残すもの: 計画書・達成度の記録はそのまま動く');
// ★2026-08-01 段階3（片寄せ・社長決定）で検証の意味を変えた箇所:
//   このテストは 2026-07-30 の送付撤去のとき「測定を巻き添えで消していないこと」の番人だった。
//   今回は測定の入力を【意図的に】撤去し、測定管理アプリ(sokutei.html)へ一本化した。
//   よって saveMeasureFromDialog / sokuteiDateInput は「無いこと」が正しい。
//   測定の【表示】が残っていることは scripts/test-kobetsu-sokutei-readonly.js が固定している。
['saveHyoukaTasseido', 'clearHyoukaTasseido', 'saveDateFromDialog', 'applyHyoukaValue'].forEach(f =>
  ok(html.indexOf('function ' + f + '(') >= 0, f + ' は残っている'));
ok(html.indexOf('id="tasseidoInput"') >= 0, '達成度評価日の入力は残っている');
ok(!/function\s+saveMeasureFromDialog/.test(html), '★測定の保存関数は撤去済み（段階3の片寄せ）');
ok(html.indexOf('id="sokuteiDateInput"') < 0, '★測定日の入力欄は撤去済み（入力先は測定管理アプリ）');
ok(html.indexOf('id="measureStatus"') >= 0, '★測定の状態表示（読み取り）は残っている');
ok(html.indexOf('action=getShienSokutei') >= 0, '①で足した測定記録シートの読み取りは残っている');

// =====================================================================
sec('4. 実描画: 「提出」が1つも出ない／計画・測定・評価は出る');
const now = new Date();
const nowY = now.getFullYear(), nowM = now.getMonth() + 1;
const fy = nowM >= 4 ? nowY : nowY - 1;
function ymAdd2(y, m, n) { const t = (y * 12 + (m - 1)) + n; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; }
const cur = { y: nowY, m: nowM };                       // 当月が計画月になる planStart
const ev = ymAdd2(nowY, nowM, -2);                      // 当月が評価月になる planStart
const psCur = cur.y + '-' + String(cur.m).padStart(2, '0');
const psEv = ev.y + '-' + String(ev.m).padStart(2, '0');
const nowYM = nowY + '-' + String(nowM).padStart(2, '0');
const USERS = [
  { userId: 'P', name: 'ダミー計画', furigana: 'ア', planStart: psCur, planMonths: 3, sendMethod: 'PDF' },
  { userId: 'E', name: 'ダミー評価', furigana: 'イ', planStart: psEv, planMonths: 3, sendMethod: 'PDF' }
];
const RECORDS = {};
// 送付日だけが入っている記録（＝画面から消えるべき情報）と、計画・達成度（＝残るべき情報）
RECORDS['P_' + nowY + '_' + nowM] = { keikaku_date: nowYM + '-01', sokutei_date: nowYM + '-05', keikaku_sent_date: nowYM + '-09', tasseido_date: '' };
RECORDS['E_' + nowY + '_' + nowM] = { keikaku_date: '', sokutei_date: '', keikaku_sent_date: '', tasseido_date: nowYM + '-23', hyouka_pdf_date: nowYM + '-24', hyouka_print_date: '' };
S.state = { users: USERS, records: RECORDS, fiscalYear: fy, filterMode: 'all', includeCancelled: false, shienByMonth: {} };
S.renderTable();
const out = tbody.innerHTML;
eq((out.match(/>提出</g) || []).length, 0, '★描画されたHTMLに「提出」バッジが1つも無い（計画側・評価側とも）');
ok((out.match(/>計画</g) || []).length > 0, '「計画」バッジは出る');
ok((out.match(/>測定</g) || []).length > 0, '「測定」バッジは出る');
ok((out.match(/>評価</g) || []).length > 0, '「評価」バッジは出る');
ok(out.indexOf('kb-cyc-plan') >= 0 && out.indexOf('kb-cyc-eval') >= 0, '計画パート・評価パートの枠は残っている');
ok(out.indexOf('onCellTap') >= 0 && out.indexOf('onHyoukaCellTap') >= 0, '編集の導線（タップ）は残っている');
eq(out.indexOf('#e3f2fd') >= 0, false, '★青（提出済の色）が1つも使われていない＝提出が消えている証拠');

sec('5. 送付アプリ（ケアマネ送付チェックリスト.html）を壊していない');
ok(soufuApp.indexOf('hyouka_pdf_date') >= 0 && soufuApp.indexOf('hyouka_print_date') >= 0,
  '★送付アプリは送付列を読み書きし続ける（今回1バイトも触っていない）');
ok(soufuApp.indexOf("action=updateKeikakusho") >= 0, '送付アプリの書き込みAPIは従来どおり');
ok(soufuApp.indexOf('onHyoukaPillTap') >= 0, '📄PDF／🖨印刷 の操作は残っている');

sec('6. GAS: データ列は消していない（送付アプリが使うため）');
ok(gas.indexOf('keikaku_sent_date: fmtDate_(krow[11])') >= 0 || gas.indexOf('keikaku_sent_date:') >= 0,
  '★getKeikakushoYear は送付列を返し続ける');
ok(/hyouka_pdf_date: *10|hyouka_pdf_date:/.test(gas), '★updateKeikakusho の書込先マップに送付列が残っている');
ok(gas.indexOf('function getKeikakushoUnsubmitted_(') >= 0,
  '★getKeikakushoUnsubmitted_ 自体は残す（消すと戻せないため・社長判断）');

sec('7. GAS: 朝の報告から送付督促を呼ばない');
{
  // safe('keikakushoSoufu', ...) のブロックを取り出して中身を見る
  const i = gas.indexOf("safe('keikakushoSoufu'");
  ok(i >= 0, 'keikakushoSoufu のセクション自体は残す（キーを消すと読み手が壊れる）');
  const block = gas.slice(i, i + 600);
  eq(block.indexOf('getKeikakushoUnsubmitted_()') >= 0, false,
    '★朝の報告からは getKeikakushoUnsubmitted_ を呼ばない');
  ok(/planCount: *0/.test(block) && /hyoukaCount: *0/.test(block), '★件数は0で返す（読み手が .planCount を見ても落ちない）');
  ok(/plan: *\[\]/.test(block) && /hyouka: *\[\]/.test(block), '★配列は空で返す（.length を見ても落ちない）');
  ok(block.indexOf('送付') >= 0, '止めた理由がコードに書いてある');
}

sec('8. GAS: 朝の報告の他のセクションを1つも壊していない');
{
  const SECTIONS = ['intakeFollowup', 'sougeiOps', 'furikae', 'kubun', 'scheduled', 'longLeave', 'keikakushoBlocked',
    'monitoringExpiring', 'monthlyDocs', 'pendingTasks', 'keikakushoSoufu', 'shift', 'teirei', 'chushi',
    'yukyuGrant', 'koyouKeiyaku', 'yarinokoshi', 'undone',
    'furikaeImport',        // 2026-08-08 追加: 電算 結果Excel 取込リマインド（設計 §3-b）
    'monitoringUnfinished'];// 2026-08-08 追加: 通所介護計画モニタリング 当月未完了人数
  SECTIONS.forEach(s => ok(gas.indexOf("safe('" + s + "'") >= 0, 'セクション ' + s + ' が残っている'));
  // 数の増減は morningDigest 関数の中だけで数える（safe( は他の集計でも使われているため）
  // ★意図してセクションを増減したときは、上の SECTIONS にも必ず登録する（登録漏れをここで落とす）。
  const dStart = gas.indexOf('function morningDigest(');
  const dEnd = gas.indexOf('\nfunction ', dStart + 10);
  const digest = gas.slice(dStart, dEnd < 0 ? gas.length : dEnd);
  eq((digest.match(/safe\('/g) || []).length, SECTIONS.length,
    '★morningDigest のセクション数が SECTIONS 一覧（' + SECTIONS.length + '個）と一致＝意図しない増減なし');
}

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
