// test-measure-app-render.js
// 測定アプリ① の DOM配線層（loadAll/render/openDialog/saveMeasurement）のヘッドレスsmoke。
// 実ブラウザを開かず・本番GASへ一切飛ばさず（fetchを完全スタブ・ダミー名のみ）検証する。
//   - loadAll: sessionBoard.universe＋attendance＋履歴 → msBuildMeasurementTargets で対象化
//   - render: overdue/due のカードHTMLを出す（クラッシュしない）
//   - saveMeasurement: 要介護=updateKeikakusho×3(計画月キー) / 要支援=addShienSokutei×1 の
//     正しいURLを組む・実ネットワークには出さない・成功でsunk化
// 純関数の網羅は test-measure-core.js / test-measure-universe.js 側。ここは配線の回帰ガード。
// 実行: node scripts/test-measure-app-render.js
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'measure-app.html'), 'utf8');
// 素の <script>…</script>（インライン本体。src付きは <script src= なので当たらない）
const open = html.indexOf('<script>');
const script0 = html.slice(open + '<script>'.length, html.indexOf('</script>', open))
  .replace(/\nloadAll\(\);\s*$/, '\n');  // 末尾の自動起動は剥がしてテストから制御

// shared.js / measure-core.js のグローバルを sandbox に注入（本番は<script>で読む）
function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '(');
  const b = src.indexOf('{', s); let d = 0, i = b;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}
const shared = fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8');
const mcore = require(path.join(__dirname, '..', 'measure-core.js'));

let pass = 0, fail = 0;
function eq(a, e, l) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + ' :: exp=' + E + ' act=' + A); } }
function ok(c, l) { eq(!!c, true, l); }

// ---- DOM/fetch スタブ ----
const els = {};
function elFor(id) {
  if (!els[id]) els[id] = {
    _in: '', _tx: '', value: '', disabled: false, style: {},
    set innerHTML(v) { this._in = v; }, get innerHTML() { return this._in; },
    set textContent(v) { this._tx = v; }, get textContent() { return this._tx; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}
  };
  return els[id];
}
const FIXT = {
  universe: [
    { key: 'ダミー介護', name: 'ダミー介護', care: '要介護1', planStart: '2026-03', planMonths: 3, days: '月', track: 'kaigo' },
    { key: 'ダミー支援', name: 'ダミー支援', care: '要支援2', planStart: '', planMonths: 0, days: '火', track: 'shien' },
    // ③スライド組の検証用: 前回2026-01-10・要介護3ヶ月→期限2026-04-10＝先月以前＝overdue
    { key: 'ダミー先月', name: 'ダミー先月', care: '要介護2', planStart: '2026-01', planMonths: 3, days: '水', track: 'kaigo' }
  ]
};
const captured = { writes: [], reads: [] };
function fetchStub(url) {
  captured.reads.push(url);
  let data;
  if (url.indexOf('action=sessionBoard') >= 0) data = { ok: true, universe: FIXT.universe };
  else if (url.indexOf('action=attendance') >= 0) data = { attendance: { am: [{ name: 'ダミー介護', care: '要介護1', status: '出席' }], pm: [] } };
  else if (url.indexOf('action=getKeikakushoYear') >= 0) {
    // ダミー介護 前回2026-03-20 → 要介護3ヶ月 → due 2026-06-20（当月due）
    data = url.indexOf('year=2026') >= 0
      ? { ok: true, records: [
          { userId: 'ダミー介護', name: 'ダミー介護', sokutei_date: '2026-03-20', sokutei_by: '', output_by: '' },
          { userId: 'ダミー先月', name: 'ダミー先月', sokutei_date: '2026-01-10', sokutei_by: '', output_by: '' }
        ], users: [] }
      : { ok: true, records: [], users: [] };
  }
  else if (url.indexOf('action=getShienSokutei') >= 0) data = { ok: true, records: [] }; // ダミー支援=前回なし=即due
  else if (url.indexOf('action=staff_list') >= 0) data = { staff: ['勝又', '小林', '代表', '小野', '林'] };
  else if (url.indexOf('action=usage_stats') >= 0) data = { usageStats: { users: [{ name: 'ダミー介護', monthly: {} }] } }; // ③欠席多の優先順（空でU=1）
  else if (url.indexOf('action=updateKeikakusho') >= 0) { captured.writes.push(url); data = { ok: true }; }
  else if (url.indexOf('action=addShienSokutei') >= 0) { captured.writes.push(url); data = { ok: true, verified: true }; }
  else if (url.indexOf('action=deleteShienSokutei') >= 0) { captured.writes.push(url); data = { ok: true, deleted: 1 }; }
  else data = {};
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
}
// 固定日付 2026-06-20（当月末=6/30）
class FixedDate extends Date { constructor(...a) { if (!a.length) super('2026-06-20T09:00:00+09:00'); else super(...a); } }

const sandbox = {
  document: {
    getElementById: elFor,
    createElement: () => ({ set textContent(v) { this._t = v; }, get innerHTML() { return this._t; } }),
    querySelectorAll: () => []        // v3① スタッフボタンの二重タップ抑止（DOM無しでも落ちない）
  },
  setTimeout: () => 1, clearTimeout: () => {},   // v3① 取り消しバーの自動非表示
  fetch: fetchStub, alert: (m) => { captured.lastAlert = m; }, console,
  Date: FixedDate, encodeURIComponent, decodeURIComponent, Math, JSON, Promise, Array, String, Object
};
// shared.js / measure-core.js / session-board-core.js を注入（本番は各<script src>で読む）
const sbcore = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));
const inject = extractFn(shared, 'sokuteiCycleMonths_') + '\n' + extractFn(shared, 'sokuteiDueDate_') + '\n' +
  extractFn(shared, 'mergeSokuteiRecords') + '\n' +
  'var msBuildMeasurementTargets=S.msBuildMeasurementTargets, msRouteWrite=S.msRouteWrite,' +
  ' msAddDays=S.msAddDays, msDateWarning=S.msDateWarning, msSplitBySession=S.msSplitBySession, msPrioritySort=S.msPrioritySort, msCountCarryOver=S.msCountCarryOver,' +
  ' msRecentStaffPush=S.msRecentStaffPush, msStaffOrder=S.msStaffOrder, msBuildUndo=S.msBuildUndo,' +
  ' msMonthsBack=S.msMonthsBack, msBuildMeasuredList=S.msBuildMeasuredList, msFilterMeasured=S.msFilterMeasured,' +
  ' msCountByMeasurer=S.msCountByMeasurer,' +
  ' sbCountWeeklyVisits_=S.sbCountWeeklyVisits_, sbCountRemainingVisits_=S.sbCountRemainingVisits_, sbSokuteiSort_=S.sbSokuteiSort_;';
['msBuildMeasurementTargets', 'msRouteWrite', 'msAddDays', 'msDateWarning', 'msSplitBySession', 'msPrioritySort', 'msCountCarryOver',
 'msRecentStaffPush', 'msStaffOrder', 'msBuildUndo', 'msMonthsBack', 'msBuildMeasuredList',
 'msFilterMeasured', 'msCountByMeasurer'].forEach(n => { sandbox[n] = mcore[n]; });
['sbCountWeeklyVisits_', 'sbCountRemainingVisits_', 'sbSokuteiSort_'].forEach(n => { sandbox[n] = sbcore[n]; });

const ctx = 'with (S) {\n' + inject + '\n' + script0 +
  '\n; S.__loadAll = loadAll; S.__render = render; S.__open = openDialog; S.__save = saveMeasurement; S.__state = state;' +
  ' S.__sheet = openStaffSheet; S.__pick = pickStaff; S.__undo = undoLast; S.__tab = switchTab; }';
new Function('S', ctx)(sandbox);

(async function run() {
  await sandbox.__loadAll();

  console.log('[loadAll] universe＋履歴 → 対象抽出');
  const t = sandbox.__state.targets;
  eq(t.length, 3, '対象3件（当月due2件＋スライド組1件）');
  const kaigo = t.find(r => r.key === 'ダミー介護'), shien = t.find(r => r.key === 'ダミー支援');
  ok(kaigo, '要介護が対象に居る'); ok(shien, '要支援が対象に居る');
  eq(kaigo.attendingToday, true, '要介護は今日出席（attendance反映）');
  eq(kaigo.前回測定日, '2026-03-20', '前回測定日=履歴の最新（mergeSokuteiRecords経由）');
  eq(kaigo.次回期限, '2026-06-20', '要介護3ヶ月→次回6/20');
  eq(shien.attendingToday, false, '要支援は今日不在（スライド超過拾い＝決定Bの母集団）');
  eq(shien.前回測定日, '', '要支援は前回なし=即due');
  ok(sandbox.__state.staff.indexOf('代表') < 0 && sandbox.__state.staff.indexOf('小野') < 0 && sandbox.__state.staff.indexOf('林') < 0, '測定者から代表・小野・林を除外');
  eq(sandbox.__state.staff.length, 2, '除外後2名（勝又・小林）');

  console.log('[② render] 今日タブ=午前午後2カラム / 全タブ=不在含む');
  sandbox.__state.tab = 'today'; sandbox.__render();
  ok(els['list']._in.indexOf('午前') >= 0 && els['list']._in.indexOf('午後') >= 0, '今日タブは午前/午後2カラム見出し');
  ok(els['list']._in.indexOf('ダミー介護') >= 0, '今日タブ(午前列)に出席の要介護');
  ok(els['list']._in.indexOf('ダミー支援') < 0, '今日タブに不在の要支援は出さない（主=今日測れる人）');
  sandbox.__state.tab = 'all'; sandbox.__render();
  ok(els['list']._in.indexOf('ダミー介護') >= 0 && els['list']._in.indexOf('ダミー支援') >= 0, '全タブは不在の要支援も描画（副=今月の残り）');

  // ===== ③ スライド組は「区別はする、でも急かさない」（2026-07-18 方針変更） =====
  console.log('[③ スライド表示] 控えめバッジのみ・赤や見出しで急かさない・件数に内訳');
  const allHtml = els['list']._in;
  ok(allHtml.indexOf('先月から') >= 0, 'スライド組に控えめバッジ「先月から」が付く');
  ok(allHtml.indexOf('b-red') < 0, '赤枠(b-red)を使わない＝急かさない');
  ok(allHtml.indexOf('期限超過') < 0, '「期限超過」の見出し区切りを出さない');
  ok(allHtml.indexOf('（<span class="over">超過</span>）') < 0, '「（超過）」の赤字を出さない');
  eq(els['cntAll']._tx, '(3・うち先月から1)', 'タブ件数に内訳を添える（3名・うち先月から1名）');
  ok(els['cntToday']._tx.indexOf('先月から') < 0, '「今日測れる人」タブには内訳を出さない（対象は今月の残りのみ）');

  console.log('[① 日付切替] 選択日を未来に→再取得・選択日反映・警告バナー');
  await sandbox.__loadAll('2026-06-22');
  eq(sandbox.__state.selectedDate, '2026-06-22', 'selectedDate=選択日に更新');
  eq(els['datePick'].value, '2026-06-22', 'ピッカーに選択日');
  ok(String(els['dstate']._tx).indexOf('未来の日付') >= 0 && String(els['dstate']._tx).indexOf('2日後') >= 0, '今日以外→警告バナー(未来2日後)');
  ok(String(els['dstate'].className).indexOf('future') >= 0, 'バナー種別=future');
  // 今日に戻す（後続の保存テストが選択日基準で動くため）
  await sandbox.__loadAll();
  eq(sandbox.__state.selectedDate, '2026-06-20', '今日に戻る');
  ok(String(els['dstate'].className).indexOf('on') < 0, '今日=警告バナー非表示');

  console.log('[save 要介護] updateKeikakusho×3・計画月キー・出力者初期=測定者');
  captured.writes = [];
  sandbox.__open(encodeURIComponent('ダミー介護'));
  els['fBy'].value = '勝又'; els['fOutput'].value = '';  // 出力者空→測定者
  els['fDate'].value = '2026-06-20';
  captured.lastAlert = null;
  await sandbox.__save();
  if (captured.lastAlert) console.log('  [debug] alert=' + captured.lastAlert);
  eq(captured.writes.length, 3, '3項目=3リクエスト（逐次）');
  ok(captured.writes.every(u => u.indexOf('action=updateKeikakusho') >= 0), '全て updateKeikakusho');
  ok(captured.writes.every(u => u.indexOf('userId=' + encodeURIComponent('ダミー介護')) >= 0), 'userId=key');
  ok(captured.writes.every(u => u.indexOf('year=2026') >= 0 && u.indexOf('month=6') >= 0), '計画月キー year=2026 month=6（planStart2026-03+3）');
  ok(captured.writes.some(u => u.indexOf('field=sokutei_date') >= 0 && u.indexOf('value=2026-06-20') >= 0), 'sokutei_date');
  ok(captured.writes.some(u => u.indexOf('field=sokutei_by') >= 0 && u.indexOf('value=' + encodeURIComponent('勝又')) >= 0), 'sokutei_by=勝又');
  ok(captured.writes.some(u => u.indexOf('field=output_by') >= 0 && u.indexOf('value=' + encodeURIComponent('勝又')) >= 0), 'output_by=勝又(空→測定者)');
  eq(sandbox.__state.sunk['ダミー介護'], true, '保存成功→sunk化');

  console.log('[save 要支援] addShienSokutei×1・測定者のみ・出力者なし');
  captured.writes = [];
  sandbox.__open(encodeURIComponent('ダミー支援'));
  els['fBy'].value = '小林';
  els['fDate'].value = '2026-06-19';
  await sandbox.__save();
  eq(captured.writes.length, 1, 'addShienSokutei=1リクエスト（追記）');
  const w = captured.writes[0];
  ok(w.indexOf('action=addShienSokutei') >= 0, 'action=addShienSokutei');
  ok(w.indexOf('name=' + encodeURIComponent('ダミー支援')) >= 0, 'name=key');
  ok(w.indexOf('by=' + encodeURIComponent('小林')) >= 0, 'by=小林');
  ok(w.indexOf('date=2026-06-19') >= 0, 'date=測定日');
  ok(w.indexOf('output') < 0, '出力者パラメータを持たない（要支援）');
  eq(sandbox.__state.sunk['ダミー支援'], true, '保存成功→sunk化');

  // ===== v3① 記録の2タップ化 =====
  console.log('[v3① 2タップ] 名前タップ→スタッフ選択シート→スタッフタップで即保存');
  await sandbox.__loadAll();   // sunk をリセット
  captured.writes = [];
  sandbox.__sheet(encodeURIComponent('ダミー介護'));
  ok(els['shName']._tx === 'ダミー介護', 'シート見出しに氏名（押す直前の確認）');
  ok(String(els['shSub']._tx).indexOf('6/20') >= 0 && String(els['shSub']._tx).indexOf('に測定') >= 0,
    'シート見出しに選択中の日付（6/20(土) に測定）＝二重確認');
  ok(els['shGrid']._in.indexOf('勝又') >= 0 && els['shGrid']._in.indexOf('小林') >= 0, 'スタッフ格子にボタン');
  ok(els['shGrid']._in.indexOf('代表') < 0, '除外スタッフ（代表）は出さない');

  await sandbox.__pick(encodeURIComponent('勝又'));
  eq(captured.writes.length, 3, '要介護=3リクエスト（測定日・測定者・出力者）');
  ok(captured.writes.some(u => u.indexOf('field=sokutei_date') >= 0 && u.indexOf('value=2026-06-20') >= 0),
    '測定日＝選択中の日付（入力させない）');
  ok(captured.writes.some(u => u.indexOf('field=sokutei_by') >= 0 && u.indexOf('value=' + encodeURIComponent('勝又')) >= 0), '測定者＝タップした人');
  ok(captured.writes.some(u => u.indexOf('field=output_by') >= 0 && u.indexOf('value=' + encodeURIComponent('勝又')) >= 0),
    '出力者＝測定者と同じ（自動・画面に出さない）');
  eq(sandbox.__state.sunk['ダミー介護'], true, '保存後はグレーアウトで沈める');
  // 直前のダイアログ保存テストで 勝又→小林 の順に積まれている。ここで 勝又 を使うと先頭へ移動する（重複させない）
  eq(sandbox.__state.recentStaff, ['勝又', '小林'], '直近使った人を先頭へ（次回そのスタッフが左上・重複しない）');
  ok(String(els['undoMsg']._tx).indexOf('勝又') >= 0, '取り消しバーに「誰で保存したか」を出す');

  console.log('[v3① 取り消し] 要介護は元値へ戻す（新action無し・updateKeikakusho）');
  captured.writes = [];
  await sandbox.__undo();
  eq(captured.writes.length, 3, '3項目を戻す');
  ok(captured.writes.every(u => u.indexOf('action=updateKeikakusho') >= 0), '既存の updateKeikakusho だけを使う');
  ok(captured.writes.every(u => /[&?]value=(&|$)/.test(u)), '保存前の値（空）へ戻す＝行は GAS 側で消える');
  eq(sandbox.__state.sunk['ダミー介護'], undefined, '取り消し後はカードが戻る');

  console.log('[v3① 取り消し] 要支援は既存 deleteShienSokutei で1行だけ消す');
  captured.writes = [];
  sandbox.__sheet(encodeURIComponent('ダミー支援'));
  await sandbox.__pick(encodeURIComponent('小林'));
  eq(captured.writes.length, 1, '追記=1リクエスト');
  captured.writes = [];
  await sandbox.__undo();
  eq(captured.writes.length, 1, '取り消し=1リクエスト');
  const du = captured.writes[0];
  ok(du.indexOf('action=deleteShienSokutei') >= 0, '既存 deleteShienSokutei（新actionを作らない）');
  ok(du.indexOf('name=' + encodeURIComponent('ダミー支援')) >= 0 && du.indexOf('date=2026-06-20') >= 0
    && du.indexOf('by=' + encodeURIComponent('小林')) >= 0, 'name+date+by 一致＝いま書いた1行だけ');
  eq(sandbox.__state.recentStaff, ['小林', '勝又'], '直近リストは新しい順');

  // ===== v3② 測定済み一覧タブ =====
  console.log('[v3② 一覧] 履歴を新しい順・名前検索・測定者絞り・測定者別件数');
  await sandbox.__loadAll();
  sandbox.__tab('done');
  const done = els['list']._in;
  ok(done.indexOf('ダミー介護') >= 0, '一覧に測定済みの人が出る（要介護は氏名へ解決）');
  ok(done.indexOf('測定者別') >= 0, '測定者別の件数（偏りの可視化）を上に出す');
  ok(done.indexOf('もっと見る') >= 0, '「もっと見る」で過去へ広げられる');
  ok(done.indexOf('3/20') >= 0, '測定日を表示（3/20）');
  eq(els['cntDone']._tx, '(2)', 'タブ件数=表示中の件数（直近6ヶ月・paper除外）');

  sandbox.__state.listQ = 'ダミー先月'; sandbox.__render();
  ok(els['list']._in.indexOf('ダミー先月') >= 0 && els['list']._in.indexOf('1/10') >= 0, '名前の部分一致で絞れる');
  ok(els['list']._in.indexOf('3/20') < 0, '一致しない人は消える');
  sandbox.__state.listQ = '';

  sandbox.__state.listBy = '居ない測定者'; sandbox.__render();
  ok(els['list']._in.indexOf('該当する測定記録はありません') >= 0, '測定者で絞って0件なら空表示');
  sandbox.__state.listBy = ''; sandbox.__render();

  console.log('[安全] 本番書込は一切発生していない（fetchは全てスタブ経由）');
  ok(captured.reads.length > 0, 'reads はスタブ経由でのみ発生');

  console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
  if (fail > 0) process.exit(1);
})();
