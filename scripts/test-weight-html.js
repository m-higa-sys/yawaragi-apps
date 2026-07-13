// 体重チェック表 weight.html 描画スモークテスト（jsdom・実renderTable経路）
// 改修1 名前検索 / 改修2 台帳status中止者 / 改修3 年度スコープ＋台帳外分離＋折りたたみ を実DOMで検証。
// 実行: node scripts/test-weight-html.js
// 注: 本体は top-level `let appData/searchQuery`（レキシカル束縛でwindow非公開）なので window.eval 経由で操作する。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'weight.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.test/weight.html',
  beforeParse(window) {
    window.fetch = () => Promise.reject(new Error('no-net')); // version.txt・cloudLoad を遮断
  }
});
const { window } = dom;
const { document } = window;
const run = (js) => window.eval(js);

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.error('  [FAIL] ' + label); } }
function tbodyText() { return document.getElementById('tableBody').innerHTML; }
function tbodyHas(s) { return tbodyText().indexOf(s) >= 0; }
function setSearch(v) { document.getElementById('searchBox').value = v; run('onSearchInput()'); }

// ---- フィクスチャ投入（window.eval で lexical appData を書き換え）----
run('appData.users = ' + JSON.stringify([
  { name: '柳浦武治', furigana: 'ヤナギウラタケハル', days: '月水', ampm: '午前' },
  { name: '田中太郎', furigana: 'タナカタロウ', days: '火', ampm: '午後' }
]) + ';');
run('appData.terminated = ' + JSON.stringify([
  { name: '古田花子', kana: 'フルタハナコ', lastUseDate: '2026-05-31' }
]) + ';');
run('appData.weights = ' + JSON.stringify({
  2026: {
    '柳浦武治': { '7月': 83.8 },
    '田中太郎': { '6月': 60 },
    '古田花子': { '5月': 48 },
    '法浦武治': { '7月': 70 }
  }
}) + ';');
run('appData.currentYear = 2026;');

// ===== 1) 既定表示（折りたたみ既定・検索なし） =====
window.localStorage.removeItem('yawaragi_weight_terminated_collapsed');
document.getElementById('searchBox').value = '';
run('searchQuery = ""; renderTable();');

ok(tbodyHas('柳浦武治'), '現役: 柳浦武治が表示される');
ok(tbodyHas('田中太郎'), '現役: 田中太郎が表示される');
ok(document.getElementById('totalCount').textContent === '2', '登録者数=現役2名');
ok(document.getElementById('progressTotal').textContent === '2', '今月分母=現役2名（中止者除外）');
ok(tbodyHas('中止者（記録保持'), '中止者見出しが出る');
ok(tbodyHas('▶'), '既定は折りたたみ（▶）');
ok(!tbodyHas('古田花子'), '折りたたみ中は中止者行(古田花子)は非表示');
ok(!tbodyHas('法浦武治'), '折りたたみ中は台帳外行(法浦武治)は非表示');

// ===== 2) 展開 → ledger と 台帳外 が出る =====
window.localStorage.setItem('yawaragi_weight_terminated_collapsed', '0');
run('renderTable();');
ok(tbodyHas('▼'), '展開時は▼');
ok(tbodyHas('古田花子'), '展開で台帳中止者(古田花子)が出る');
ok(tbodyHas('台帳外・要名寄せ'), '台帳外の小見出しが出る');
ok(tbodyHas('法浦武治'), '展開で台帳外(法浦武治)が出る');
ok(tbodyText().indexOf('orphan-badge') >= 0, '法浦武治は orphan-badge 付きで台帳外扱い');

// ===== 3) 名前検索: ふりがな「やなぎ」→ 現役1名・空グループ非表示 =====
window.localStorage.setItem('yawaragi_weight_terminated_collapsed', '1');
setSearch('やなぎ');
ok(tbodyHas('柳浦武治'), '検索やなぎ: 柳浦武治ヒット');
ok(!tbodyHas('田中太郎'), '検索やなぎ: 田中太郎は除外');
ok(document.getElementById('searchCount').textContent.indexOf('検索: 1件') >= 0, '検索件数=1件');
ok(tbodyText().indexOf('>た<') < 0, '該当0の五十音グループ(た)見出しは非表示');

// ===== 4) 検索が中止者側にヒット → 折りたたみでも自動展開 =====
setSearch('ふるた');
ok(tbodyHas('古田花子'), '検索ふるた: 折りたたみでも中止者を自動展開してヒット');
ok(!tbodyHas('柳浦武治'), '検索ふるた: 現役はヒットしない');

// ===== 5) 検索が台帳外にヒット → 自動展開して炙り出し =====
setSearch('法浦');
ok(tbodyHas('法浦武治'), '検索法浦: 台帳外の孤立記録を自動展開して炙り出す');
ok(tbodyHas('台帳外・要名寄せ'), '検索法浦: 台帳外見出しも出る');

// ===== 6) クリアで全件に戻る =====
run('clearSearch();');
ok(document.getElementById('searchCount').textContent === '', 'クリアで検索件数表示が消える');
ok(tbodyHas('田中太郎'), 'クリアで田中太郎が戻る');

// ===== 7) 翌年度に切替 → 当年度記録のない中止者/台帳外は自動的に消える =====
window.localStorage.setItem('yawaragi_weight_terminated_collapsed', '0');
run('appData.currentYear = 2027; renderTable();');
ok(!tbodyHas('古田花子'), '2027年度: 当年度記録なしの中止者は消える');
ok(!tbodyHas('法浦武治'), '2027年度: 当年度記録なしの台帳外は消える');

// ===== 8) 全件クラウド送信の再汚染対策（実POSTペイロードを捕捉して検証） =====
// fetch を差し替えて body を捕捉、confirm は常にOKにする。
let lastPost = null;
window.fetch = (url, opts) => {
  if (opts && opts.method === 'POST') { lastPost = { url, body: JSON.parse(opts.body) }; }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
};
window.confirm = () => true;

// 8a) 台帳取得済み（ledgerLoadedAt あり）→ 台帳外(法浦武治)は送信除外・中止者(古田)は残す
run('appData.currentYear = 2026;');
run('appData.ledgerLoadedAt = "2026-07-13T00:00:00.000Z";');
// 現役=柳浦/田中、中止者=古田、weightsに法浦(台帳外)も混入している状態
run('appData.weights = ' + JSON.stringify({
  2026: { '柳浦武治': { '7月': 83.8 }, '田中太郎': { '6月': 60 }, '古田花子': { '5月': 48 }, '法浦武治': { '7月': 70 } }
}) + ';');
lastPost = null;
run('forceCloudSync();');
ok(lastPost !== null, '全件送信でPOSTが飛ぶ');
const sentW = lastPost.body.data.weights[2026];
ok(!!sentW['柳浦武治'], '送信: 現役(柳浦)は含む');
ok(!!sentW['古田花子'], '送信: 台帳中止者(古田)は含む＝記録保持');
ok(!sentW['法浦武治'], '送信: 台帳外(法浦)は除外＝再汚染しない');

// 8b) 台帳未取得（ledgerLoadedAt なし）→ 送信ブロック（クラウド上書き事故を絶対に起こさない）
run('appData.ledgerLoadedAt = null;');
lastPost = null;
run('forceCloudSync();');
ok(lastPost === null, '未取得端末は全件送信をブロック（POSTを飛ばさない）');
ok(document.getElementById('toast').textContent.indexOf('利用者台帳から取得') >= 0, '未取得ブロック時に台帳取得を促すメッセージ');

// 8c) 自動同期(cloudSync)も未取得ならスキップ（setTimeoutを即時化してdebounceコールバックを走らせる）
window.setTimeout = (fn) => { try { fn(); } catch (e) {} return 0; };
run('appData.ledgerLoadedAt = null;');
lastPost = null;
run('cloudSync();');
ok(lastPost === null, '自動同期も未取得ならスキップ（POSTなし）');

// 8d) 自動同期 取得済み → 台帳外(法浦)を除外して送信
run('appData.ledgerLoadedAt = "2026-07-13T00:00:00.000Z";');
lastPost = null;
run('cloudSync();');
ok(lastPost !== null, '取得済みなら自動同期でPOSTが飛ぶ');
ok(!lastPost.body.data.weights[2026]['法浦武治'], '自動同期でも台帳外(法浦)は除外');
ok(!!lastPost.body.data.weights[2026]['柳浦武治'], '自動同期で現役(柳浦)は送信');

// ===== 9) 起動時の台帳自動取得（手間ゼロで送信ブロックを実質無効化） =====
function newCallback(before) {
  return Object.keys(window).find(k => k.indexOf('gasCallback_') === 0 && !before.has(k));
}

// 9a) 自動取得成功 → ledgerLoadedAt が立つ／現役・中止者反映／既存の体重データは消えない／バナー消える
run('appData.users=[]; appData.terminated=[]; appData.ledgerLoadedAt=null;');
run('appData.weights = ' + JSON.stringify({ 2026: { '既存太郎': { '7月': 55 }, '柳浦武治': { '7月': 83.8 } } }) + ';');
const before9a = new Set(Object.keys(window));
run('loadFromSpreadsheet({auto:true});');
const cb9a = newCallback(before9a);
ok(!!cb9a, '自動取得: JSONPコールバックを登録');
ok(document.getElementById('ledgerStatus').style.display === 'block' &&
   document.getElementById('ledgerStatus').textContent.indexOf('取得中') >= 0, '自動取得中はローディングバナー表示');
window[cb9a]({ users: [
  { name: '柳浦武治', kana: 'ヤナギウラタケハル', status: '', days: '月水', ampm: '午前' },
  { name: '田中太郎', kana: 'タナカタロウ', status: '', days: '火', ampm: '午後' },
  { name: '古田花子', kana: 'フルタハナコ', status: '中止', lastUseDate: '2026-05-31' }
]});
ok(window.eval('!!appData.ledgerLoadedAt'), '自動取得成功で ledgerLoadedAt が立つ');
ok(window.eval('appData.users.length') === 2, '自動取得: 現役2名');
ok(window.eval('appData.terminated.length') === 1, '自動取得: 中止者1名');
ok(window.eval('appData.weights[2026]["既存太郎"]["7月"]') === 55, '自動取得で既存のローカル体重データが消えない');
ok(document.getElementById('ledgerStatus').style.display === 'none', '自動取得成功でバナーは消える');

// 9b) 自動取得成功後は 送信ブロックが発火しない（🔄を押さず全件送信できる）
let lp9 = null;
window.fetch = (url, o) => { if (o && o.method === 'POST') lp9 = { body: JSON.parse(o.body) }; return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); };
window.confirm = () => true;
run('forceCloudSync();');
ok(lp9 !== null, '自動取得後は🔄なしで全件送信できる（ブロック発火せず）');

// 9c) 自動取得失敗（onerror）→ アプリ継続・ledgerLoadedAt立たず・エラーバナー・送信ブロック維持
run('appData.users=[]; appData.terminated=[]; appData.ledgerLoadedAt=null;');
run('appData.weights = ' + JSON.stringify({ 2026: { '既存太郎': { '7月': 55 } } }) + ';');
run('loadFromSpreadsheet({auto:true});');
const scr9 = Array.from(document.head.querySelectorAll('script')).filter(s => s.src && s.src.indexOf('script.google.com') >= 0).pop();
ok(!!scr9 && typeof scr9.onerror === 'function', '自動取得: scriptにonerror設定');
scr9.onerror();
ok(window.eval('appData.ledgerLoadedAt') === null, '自動取得失敗: ledgerLoadedAt は立たない');
ok(document.getElementById('ledgerStatus').className.indexOf('error') >= 0 &&
   document.getElementById('ledgerStatus').textContent.indexOf('取得できませんでした') >= 0, '失敗時は再取得を促すエラーバナー');
ok(window.eval('appData.weights[2026]["既存太郎"]["7月"]') === 55, '失敗してもローカル体重データは残る（アプリ継続）');
lp9 = null;
run('forceCloudSync();');
ok(lp9 === null, '自動取得失敗時は送信ブロック維持（POSTなし）');

// 9d) 失敗後の手動🔄リトライで復帰できる
const before9d = new Set(Object.keys(window));
run('loadFromSpreadsheet();'); // 手動（auto無し）
const cb9d = newCallback(before9d);
ok(!!cb9d, '手動リトライ: コールバック登録');
window[cb9d]({ users: [{ name: '柳浦武治', kana: 'ヤナギウラタケハル', status: '' }] });
ok(window.eval('!!appData.ledgerLoadedAt'), '手動🔄リトライ成功で復帰（ledgerLoadedAt）');

console.log('\n==== weight-html(jsdom): ' + pass + ' PASS / ' + fail + ' FAIL ====');
process.exit(fail === 0 ? 0 : 1);
