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
    { key: 'ダミー支援', name: 'ダミー支援', care: '要支援2', planStart: '', planMonths: 0, days: '火', track: 'shien' }
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
      ? { ok: true, records: [{ userId: 'ダミー介護', name: 'ダミー介護', sokutei_date: '2026-03-20', sokutei_by: '', output_by: '' }], users: [] }
      : { ok: true, records: [], users: [] };
  }
  else if (url.indexOf('action=getShienSokutei') >= 0) data = { ok: true, records: [] }; // ダミー支援=前回なし=即due
  else if (url.indexOf('action=staff_list') >= 0) data = { staff: ['勝又', '小林', '代表', '小野', '林'] };
  else if (url.indexOf('action=updateKeikakusho') >= 0) { captured.writes.push(url); data = { ok: true }; }
  else if (url.indexOf('action=addShienSokutei') >= 0) { captured.writes.push(url); data = { ok: true, verified: true }; }
  else data = {};
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
}
// 固定日付 2026-06-20（当月末=6/30）
class FixedDate extends Date { constructor(...a) { if (!a.length) super('2026-06-20T09:00:00+09:00'); else super(...a); } }

const sandbox = {
  document: { getElementById: elFor, createElement: () => ({ set textContent(v) { this._t = v; }, get innerHTML() { return this._t; } }) },
  fetch: fetchStub, alert: (m) => { captured.lastAlert = m; }, console,
  Date: FixedDate, encodeURIComponent, decodeURIComponent, Math, JSON, Promise, Array, String, Object
};
// shared.js / measure-core.js を注入
const inject = extractFn(shared, 'sokuteiCycleMonths_') + '\n' + extractFn(shared, 'sokuteiDueDate_') + '\n' +
  extractFn(shared, 'mergeSokuteiRecords') + '\n' +
  'var msBuildMeasurementTargets=S.msBuildMeasurementTargets, msRouteWrite=S.msRouteWrite;';
sandbox.msBuildMeasurementTargets = mcore.msBuildMeasurementTargets;
sandbox.msRouteWrite = mcore.msRouteWrite;

const ctx = 'with (S) {\n' + inject + '\n' + script0 +
  '\n; S.__loadAll = loadAll; S.__render = render; S.__open = openDialog; S.__save = saveMeasurement; S.__state = state; }';
new Function('S', ctx)(sandbox);

(async function run() {
  await sandbox.__loadAll();

  console.log('[loadAll] universe＋履歴 → 対象抽出');
  const t = sandbox.__state.targets;
  eq(t.length, 2, '対象2件（介護・支援とも当月due）');
  const kaigo = t.find(r => r.key === 'ダミー介護'), shien = t.find(r => r.key === 'ダミー支援');
  ok(kaigo, '要介護が対象に居る'); ok(shien, '要支援が対象に居る');
  eq(kaigo.attendingToday, true, '要介護は今日出席（attendance反映）');
  eq(kaigo.前回測定日, '2026-03-20', '前回測定日=履歴の最新（mergeSokuteiRecords経由）');
  eq(kaigo.次回期限, '2026-06-20', '要介護3ヶ月→次回6/20');
  eq(shien.attendingToday, false, '要支援は今日不在（スライド超過拾い＝決定Bの母集団）');
  eq(shien.前回測定日, '', '要支援は前回なし=即due');
  ok(sandbox.__state.staff.indexOf('代表') < 0 && sandbox.__state.staff.indexOf('小野') < 0 && sandbox.__state.staff.indexOf('林') < 0, '測定者から代表・小野・林を除外');
  eq(sandbox.__state.staff.length, 2, '除外後2名（勝又・小林）');

  console.log('[render] 今日タブ=出席のみ / 全タブ=不在含む');
  sandbox.__render(); // 既定=今日タブ
  ok(els['list']._in.indexOf('ダミー介護') >= 0, '今日タブに出席の要介護');
  ok(els['list']._in.indexOf('ダミー支援') < 0, '今日タブに不在の要支援は出さない（主=今日測れる人）');
  sandbox.__state.tab = 'all'; sandbox.__render(); // 全タブ（不在含む）
  ok(els['list']._in.indexOf('ダミー介護') >= 0 && els['list']._in.indexOf('ダミー支援') >= 0, '全タブは不在の要支援も描画（副=今月の残り）');

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

  console.log('[安全] 本番書込は一切発生していない（fetchは全てスタブ経由）');
  ok(captured.reads.length > 0, 'reads はスタブ経由でのみ発生');

  console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
  if (fail > 0) process.exit(1);
})();
