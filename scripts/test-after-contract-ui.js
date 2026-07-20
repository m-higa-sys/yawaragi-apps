// test-after-contract-ui.js
// 担会・契約後アプリ v1：UI（担会後ボタン／リードタイムバッジ／文言の実体一致）のテスト
//
// 方式：after-contract.html を jsdom に実ロードし、出荷コードの関数をそのまま呼ぶ。
//   GAS通信（evtLoadList / _populateStaffSelects）は DOMContentLoaded で走るため、
//   jsdom は runScripts:'outside-only' でロードし、必要な関数だけ手動評価する。
//
// 実行: node scripts/test-after-contract-ui.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML_PATH = path.join(__dirname, '..', 'after-contract.html');
const AC = fs.readFileSync(HTML_PATH, 'utf8');

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual)); }
}
function ok(cond, label) { eq(!!cond, true, label); }

// ---- 出荷HTMLの <script> 本文を取り出して window 上で評価（DOMContentLoaded は発火させない） ----
function buildDom() {
  const dom = new JSDOM(AC, { runScripts: 'outside-only', url: 'https://m-higa-sys.github.io/yawaragi-apps/after-contract.html' });
  const { window } = dom;
  // 本体スクリプト（GAS API URL 定義を含む最後の <script>）を抽出
  const scripts = AC.match(/<script>[\s\S]*?<\/script>/g) || [];
  const mainScript = scripts.find(s => s.indexOf('ABS_BOARD_API_URL') !== -1);
  if (!mainScript) throw new Error('本体 <script> が見つからない');
  const body = mainScript.replace(/^<script>/, '').replace(/<\/script>$/, '');
  // fetch は使わせない（テストはDOM生成のみ検証する）
  window.fetch = function () { return Promise.resolve({ text: () => Promise.resolve('') }); };
  window.eval(body);
  return window;
}

console.log('[担会後 登録ボタンの新規追加]');
{
  const window = buildDom();
  const doc = window.document;
  const buttons = Array.from(doc.querySelectorAll('.toolbar button'));
  const meetingBtn = buttons.find(b => (b.getAttribute('onclick') || '').indexOf("evtOpenModal('meeting_after')") !== -1);
  ok(meetingBtn, '担会後ボタンが実在する（onclick=evtOpenModal(\'meeting_after\')）');
  ok(meetingBtn && meetingBtn.textContent.indexOf('担会後') !== -1, '担会後ボタンのラベルに「担会後」が入っている');
  // 既存の契約後ボタンが壊れていない
  const contractBtn = buttons.find(b => (b.getAttribute('onclick') || '').indexOf("evtOpenModal('contract_after')") !== -1);
  ok(contractBtn, '既存: 契約後ボタンが残っている');
  const reloadBtn = buttons.find(b => (b.getAttribute('onclick') || '').indexOf('evtLoadList()') !== -1);
  ok(reloadBtn, '既存: 再読込ボタンが残っている');
}

console.log('[登録モーダル：担会後は「担会参加日」・利用開始日は出さない]');
{
  const window = buildDom();
  const doc = window.document;

  window.evtOpenModal('meeting_after');
  eq(doc.getElementById('event-type').value, 'meeting_after', '担会後: hidden の eventType が meeting_after');
  eq(doc.getElementById('event-modal-title').textContent, '＋ 担会後', '担会後: タイトルが「＋ 担会後」');
  const dateLabel = doc.getElementById('event-eventDate').closest('label');
  ok(dateLabel.textContent.indexOf('担会参加日') !== -1, '担会後: 日付欄のラベルが「担会参加日」');
  const startWrap = doc.getElementById('event-meta-startDate').closest('label');
  eq(startWrap.style.display, 'none', '担会後: 利用開始日の欄が非表示');
  eq(doc.getElementById('event-meta-startDate').required, false, '担会後: 利用開始日の required が外れている');
  ok(doc.getElementById('event-meta-careLevel').closest('label').style.display !== 'none', '担会後: 要介護度は出る');

  // 契約後に戻すと復元される（モーダル使い回しの取り違え防止）
  window.evtOpenModal('contract_after');
  eq(doc.getElementById('event-type').value, 'contract_after', '契約後: eventType が contract_after に戻る');
  eq(doc.getElementById('event-modal-title').textContent, '＋ 契約後', '契約後: タイトルが「＋ 契約後」');
  ok(dateLabel.textContent.indexOf('契約日') !== -1, '契約後: 日付欄のラベルが「契約日」に戻る');
  eq(startWrap.style.display, '', '契約後: 利用開始日の欄が再表示される');
  eq(doc.getElementById('event-meta-startDate').required, true, '契約後: 利用開始日の required が戻る');
}

console.log('[カード：リードタイムバッジ]');
{
  const window = buildDom();
  // 契約後・完了・利用開始に2日遅れ → 「3日 ⛈」
  const ev1 = {
    id: 'evt_1', eventType: 'contract_after', userName: '田中花子', eventDate: '2026-07-10',
    status: 'in_progress', metadata: { '利用開始日': '2026-07-11' }, itemDone: 1, itemTotal: 35,
    items: [{ id: 'i1', seq: 10, label: '通所介護計画書作成(リハプラン)', status: 'done', doneAt: '2026-07-13 10:30' }]
  };
  const card1 = window.evtBuildCard(ev1);
  const badge1 = card1.querySelector('.lead-badge');
  ok(badge1, '契約後カードにリードタイムバッジが出る');
  ok(badge1 && badge1.textContent.indexOf('3日') !== -1, 'バッジに日数「3日」が出る');
  ok(badge1 && badge1.textContent.indexOf('⛈') !== -1, 'バッジに天気「⛈」が出る（利用開始に2日遅れ）');

  // 担会後・完了2日 → ⛅
  const ev2 = {
    id: 'evt_2', eventType: 'meeting_after', userName: '佐藤一郎', eventDate: '2026-07-12',
    status: 'in_progress', metadata: {}, itemDone: 1, itemTotal: 13,
    items: [{ id: 'i2', seq: 8, label: '通所介護計画書作成', status: 'done', doneAt: '2026-07-14 15:00' }]
  };
  const badge2 = window.evtBuildCard(ev2).querySelector('.lead-badge');
  ok(badge2 && badge2.textContent.indexOf('2日') !== -1, '担会後カード: 日数「2日」');
  ok(badge2 && badge2.textContent.indexOf('⛅') !== -1, '担会後カード: 天気「⛅」');

  // 計画書項目が無いカード → バッジを出さない
  const ev3 = {
    id: 'evt_3', eventType: 'usage_days_change', userName: '利用者045', eventDate: '2026-06-22',
    status: 'in_progress', metadata: {}, itemDone: 0, itemTotal: 1,
    items: [{ id: 'i3', seq: 1, label: 'リハブクラウドの提供票更新（曜日・回数）', status: 'pending' }]
  };
  eq(window.evtBuildCard(ev3).querySelector('.lead-badge'), null, '計画書項目が無いカードにはバッジを出さない');

  // 既存表示の非破壊
  ok(window.evtBuildCard(ev1).querySelector('.card-name').textContent.indexOf('田中花子') !== -1, '既存: 氏名が出る');
  ok(window.evtBuildCard(ev1).querySelector('.progress-bar'), '既存: 進捗バーが残っている');
  ok(window.evtBuildCard(ev1).querySelector('.type-chip').textContent.indexOf('契約後') !== -1, '既存: 種別チップが出る');
  ok(window.evtBuildCard(ev2).querySelector('.type-chip').textContent.indexOf('担会後') !== -1, '担会後: 種別チップが「担会後」');
}

console.log('[虚偽表示の解消：hero文言が実体と一致]');
{
  const window = buildDom();
  const desc = window.document.querySelector('.hero-desc').textContent.replace(/\s+/g, '');
  ok(desc.indexOf('契約後35項目') !== -1, 'hero: 「契約後35項目」（実体35と一致）');
  ok(desc.indexOf('担会後13項目') !== -1, 'hero: 「担会後13項目」（実装後は実体13と一致＝虚偽でなくなる）');
  // 実体との突合：GASテンプレの件数と一致していること
  const CODE = fs.readFileSync(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js'), 'utf8');
  const meetingCount = (CODE.match(/var EVENT_TEMPLATE_MEETING_AFTER = \[[\s\S]*?\n\];/)[0].match(/seq:/g) || []).length;
  const contractCount = (CODE.match(/var EVENT_TEMPLATE_CONTRACT_AFTER = \[[\s\S]*?\n\];/)[0].match(/seq:/g) || []).length;
  eq(meetingCount, 13, 'GAS実体: 担会後テンプレは13項目');
  eq(contractCount, 35, 'GAS実体: 契約後テンプレは35項目');
  ok(desc.indexOf('担会後' + meetingCount + '項目') !== -1, 'hero文言の担会後件数がGAS実体と一致する');
  ok(desc.indexOf('契約後' + contractCount + '項目') !== -1, 'hero文言の契約後件数がGAS実体と一致する');
  // 「設計見直し中」のコメントは実装完了により消えていること
  ok(AC.indexOf('担会後ボタンは設計見直し中') === -1, '「設計見直し中」の封印コメントが残っていない');
}

console.log('\n==== ' + pass + ' PASS / ' + fail + ' FAIL ====');
process.exit(fail === 0 ? 0 : 1);
